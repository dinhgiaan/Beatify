import { spawn } from 'child_process';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { pitchToCamelot } from '@music-app/shared';

const require = createRequire(import.meta.url);

interface EssentiaApi {
  arrayToVector: (arr: Float32Array) => unknown;
  KeyExtractor: (vec: unknown) => { key?: string; scale?: string };
  PercivalBpmEstimator: (vec: unknown) => { bpm?: number };
  delete?: () => void;
}

let essentiaInstance: EssentiaApi | null = null;

function getEssentia(): EssentiaApi {
  if (!essentiaInstance) {
    const { Essentia, EssentiaWASM } = require('essentia.js');
    essentiaInstance = new Essentia(EssentiaWASM) as EssentiaApi;
  }
  return essentiaInstance;
}

export interface AudioAnalysisResult {
  bpm?: number;
  key?: string; // Mã Camelot (vd: "8A", "11B")
  introEnd?: number; // Giây kết thúc intro
  outroStart?: number; // Giây bắt đầu outro
}

const CACHE_FILE = path.resolve(process.cwd(), 'tools/indexer/audio_analysis_cache.json');

/**
 * Đọc bộ đệm cache kết quả phân tích âm thanh đã lưu trên đĩa
 */
async function loadAnalysisCache(): Promise<Record<string, AudioAnalysisResult>> {
  try {
    if (existsSync(CACHE_FILE)) {
      const raw = await fs.readFile(CACHE_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[AnalysisCache] Không thể đọc cache, khởi tạo mới:', err);
  }
  return {};
}

/**
 * Lưu bộ đệm cache kết quả phân tích âm thanh xuống đĩa
 */
async function saveAnalysisCache(cache: Record<string, AudioAnalysisResult>): Promise<void> {
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[AnalysisCache] Không thể ghi cache:', err);
  }
}

/**
 * Giải mã file âm thanh sang PCM Float32 qua FFmpeg (Sample Rate: 22050Hz Mono)
 */
function decodeAudioToPcmFloat32(filePath: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-i', filePath,
      '-ac', '1',
      '-ar', '22050',
      '-f', 'f32le',
      'pipe:1',
    ];

    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let errOutput = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    proc.stderr.on('data', (errChunk: Buffer) => {
      errOutput += errChunk.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`FFmpeg exit code ${code}: ${errOutput}`));
      }
      const fullBuffer = Buffer.concat(chunks);
      const floatArray = new Float32Array(
        fullBuffer.buffer,
        fullBuffer.byteOffset,
        fullBuffer.byteLength / 4
      );
      resolve(floatArray);
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Tính toán mốc introEnd và outroStart dựa trên đường bao năng lượng RMS
 */
function calculateIntroOutro(floats: Float32Array, sampleRate = 22050): { introEnd: number; outroStart: number } {
  const frameSize = 2048; // ~93ms mỗi khung
  const hopSize = 1024;
  const numFrames = Math.floor((floats.length - frameSize) / hopSize);

  if (numFrames <= 0) {
    const totalSec = floats.length / sampleRate;
    return { introEnd: 0, outroStart: Math.max(0, totalSec - 4) };
  }

  const rmsArray = new Float32Array(numFrames);
  let sumRms = 0;

  for (let f = 0; f < numFrames; f++) {
    const offset = f * hopSize;
    let sumSquares = 0;
    for (let i = 0; i < frameSize; i++) {
      const s = floats[offset + i] ?? 0;
      sumSquares += s * s;
    }
    const rms = Math.sqrt(sumSquares / frameSize);
    rmsArray[f] = rms;
    sumRms += rms;
  }

  const avgRms = sumRms / numFrames;
  const totalSec = floats.length / sampleRate;

  // introEnd: Khung đầu tiên có năng lượng >= 20% avgRms và sau 0.5s đầu
  let introEndSec = 0;
  const minIntroFrame = Math.floor((0.5 * sampleRate) / hopSize);
  for (let f = minIntroFrame; f < numFrames; f++) {
    const r = rmsArray[f] ?? 0;
    if (r >= avgRms * 0.2) {
      introEndSec = (f * hopSize) / sampleRate;
      break;
    }
  }
  // Giới hạn introEnd tối đa 25% độ dài bài
  introEndSec = Math.min(introEndSec, totalSec * 0.25);

  // outroStart: Quét ngược từ cuối bài tìm điểm năng lượng bắt đầu suy giảm dưới 25% avgRms
  let outroStartSec = Math.max(0, totalSec - 4);
  const maxOutroFrame = Math.floor(((totalSec - 1.0) * sampleRate) / hopSize);
  for (let f = maxOutroFrame; f >= Math.floor((totalSec * 0.7 * sampleRate) / hopSize); f--) {
    const r = rmsArray[f] ?? 0;
    if (f < numFrames && r >= avgRms * 0.25) {
      outroStartSec = (f * hopSize) / sampleRate;
      break;
    }
  }

  return {
    introEnd: Number(introEndSec.toFixed(2)),
    outroStart: Number(outroStartSec.toFixed(2)),
  };
}

/**
 * Phân tích âm thanh một bài hát: trích xuất BPM, Camelot Key, introEnd, outroStart
 * Tự động kiểm tra và đọc từ cache nếu đã phân tích trước đó
 */
export async function analyzeAudioFile(
  filePath: string,
  trackId: string,
  forceReanalyze = false
): Promise<AudioAnalysisResult | null> {
  const cache = await loadAnalysisCache();

  if (!forceReanalyze && cache[trackId]) {
    return cache[trackId];
  }

  try {
    const floats = await decodeAudioToPcmFloat32(filePath);
    if (!floats || floats.length === 0) {
      console.warn(`[AudioAnalysis] Không nhận được dữ liệu PCM từ: ${filePath}`);
      return null;
    }

    const essentia = getEssentia();
    const vec = essentia.arrayToVector(floats);

    // 1. Trích xuất Key (Khóa nhạc)
    let camelotKey: string | undefined;
    try {
      const keyRes = essentia.KeyExtractor(vec);
      if (keyRes && keyRes.key) {
        camelotKey = pitchToCamelot(keyRes.key, keyRes.scale) || undefined;
      }
    } catch (err) {
      console.warn(`[AudioAnalysis] Lỗi nhận diện Key cho ${trackId}:`, err);
    }

    // 2. Trích xuất BPM
    let bpm: number | undefined;
    try {
      const bpmRes = essentia.PercivalBpmEstimator(vec);
      if (bpmRes && bpmRes.bpm && bpmRes.bpm > 30 && bpmRes.bpm < 300) {
        bpm = Number(bpmRes.bpm.toFixed(1));
      }
    } catch (err) {
      console.warn(`[AudioAnalysis] Lỗi nhận diện BPM cho ${trackId}:`, err);
    }

    // 3. Trích xuất điểm chuyển introEnd & outroStart
    const { introEnd, outroStart } = calculateIntroOutro(floats, 22050);

    const result: AudioAnalysisResult = {
      bpm,
      key: camelotKey,
      introEnd,
      outroStart,
    };

    // Lưu vào cache
    cache[trackId] = result;
    await saveAnalysisCache(cache);

    return result;
  } catch (err) {
    console.warn(`[AudioAnalysis] Không thể phân tích file "${filePath}":`, err);
    return null;
  }
}
