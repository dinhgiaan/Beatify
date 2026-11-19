import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as mm from 'music-metadata';
import type { Track } from '@music-app/shared';
import { normalizeText } from '@music-app/shared';
import { analyzeAudioFile } from './audioAnalysisService';
import { getImageDimensions } from './imageDimensions';
import { convertToSquareAmbientCover } from './imageConversionService';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.flac', '.aac', '.ogg', '.wav']);

export interface ScannedTrack {
  track: Track;
  filePath: string;
  coverBuffer?: Buffer;
  coverMime?: string;
}

/**
 * Tính mã SHA1 12 ký tự của file để làm track id ổn định
 */
export async function calculateTrackId(filePath: string): Promise<string> {
  const fileBuffer = await fs.readFile(filePath);
  const hash = crypto.createHash('sha1').update(fileBuffer).digest('hex');
  return hash.slice(0, 12);
}

/**
 * Quét đệ quy tất cả các file âm thanh trong thư mục
 */
export async function findAudioFiles(dirPath: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        // Bỏ qua thư mục ẩn hoặc thư mục đặc biệt như _duplicates, _trash, .git
        if (entry.name.startsWith('_') || entry.name.startsWith('.')) {
          continue;
        }
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDIO_EXTENSIONS.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  await walk(dirPath);
  return results;
}

/**
 * Đọc thông tin thẻ metadata của 1 file âm thanh
 */
export async function scanAudioFile(filePath: string): Promise<ScannedTrack | null> {
  try {
    const id = await calculateTrackId(filePath);
    const metadata = await mm.parseFile(filePath, { duration: true });

    const title =
      metadata.common.title?.trim() ||
      path.basename(filePath, path.extname(filePath));
    const artist = metadata.common.artist?.trim() || 'Unknown Artist';
    const album = metadata.common.album?.trim() || 'Single';
    const albumArtist = metadata.common.albumartist?.trim() || artist;
    const duration = Math.round(metadata.format.duration || 0);

    // Tính albumId ổn định theo quy tắc chuẩn hóa sha1(normalize(albumArtist) + '|' + normalize(album)).slice(0, 12)
    const albumKey = `${normalizeText(albumArtist)}|${normalizeText(album)}`;
    const albumId = crypto.createHash('sha1').update(albumKey).digest('hex').slice(0, 12);

    let coverBuffer: Buffer | undefined;
    let coverMime: string | undefined;

    // 1. Ưu tiên số 1: Ảnh bìa HD từ custom_covers (ưu tiên track id, sau đó album id)
    const customCoversDir = path.join(
      process.cwd().endsWith('indexer') ? process.cwd() : path.join(process.cwd(), 'tools/indexer'),
      'custom_covers'
    );
    const customTrackCover = path.join(customCoversDir, `${id}.jpg`);
    const customAlbumCover = path.join(customCoversDir, `${albumId}.jpg`);

    if (existsSync(customTrackCover)) {
      try {
        coverBuffer = await fs.readFile(customTrackCover);
        coverMime = 'image/jpeg';
      } catch {
        // bỏ qua
      }
    } else if (existsSync(customAlbumCover)) {
      try {
        coverBuffer = await fs.readFile(customAlbumCover);
        coverMime = 'image/jpeg';
      } catch {
        // bỏ qua
      }
    }

    // 2. Dự phòng: Nếu chưa có trong custom_covers thì tìm sidecar hoặc embedded picture
    if (!coverBuffer) {
      const extName = path.extname(filePath);
      const sidecarJpg = filePath.replace(extName, '.jpg');
      const sidecarPng = filePath.replace(extName, '.png');
      if (existsSync(sidecarJpg)) {
        try {
          coverBuffer = await fs.readFile(sidecarJpg);
          coverMime = 'image/jpeg';
        } catch {
          // bỏ qua
        }
      } else if (existsSync(sidecarPng)) {
        try {
          coverBuffer = await fs.readFile(sidecarPng);
          coverMime = 'image/png';
        } catch {
          // bỏ qua
        }
      } else {
        const picture = metadata.common.picture?.[0];
        if (picture) {
          coverBuffer = Buffer.from(picture.data);
          coverMime = picture.format || 'image/jpeg';
        }
      }
    }

    // Tự động nhận diện và chuyển đổi ảnh bìa ngang sang ảnh vuông 1:1 Ambient Blur
    let coverAspect: number | undefined;
    if (coverBuffer) {
      const dim = getImageDimensions(coverBuffer);
      if (dim && dim.width > 0 && dim.height > 0) {
        if (dim.width / dim.height > 1.05) {
          const converted = await convertToSquareAmbientCover(coverBuffer);
          if (converted !== coverBuffer) {
            coverBuffer = converted;
            coverMime = 'image/jpeg';
            try {
              await fs.mkdir(customCoversDir, { recursive: true });
              await fs.writeFile(customTrackCover, converted);
            } catch {
              // Bỏ qua nếu lỗi ghi thư mục custom_covers
            }
          }
        }
        const finalDim = getImageDimensions(coverBuffer);
        if (finalDim && finalDim.width > 0 && finalDim.height > 0) {
          coverAspect = Number((finalDim.width / finalDim.height).toFixed(3));
        }
      }
    }

    const ext = path.extname(filePath);
    const track: Track = {
      id,
      title,
      artist,
      albumId,
      album,
      duration,
      trackNumber: metadata.common.track?.no ?? undefined,
      discNumber: metadata.common.disk?.no ?? undefined,
      year: metadata.common.year ?? undefined,
      genre: metadata.common.genre?.[0] ?? undefined,
      file: `music/${id}${ext}`,
      storage: 'r2',
      cover: coverBuffer ? `covers/${id}.jpg` : undefined,
      coverAspect,
      loudnessLufs: -18.0,
      replayGain: 0.0,
    };

    const customLyricsPath = path.join(
      process.cwd().endsWith('indexer') ? process.cwd() : path.join(process.cwd(), 'tools/indexer'),
      'lyrics',
      `${id}.lrc`
    );
    const sidecarLyricsPath = filePath.replace(path.extname(filePath), '.lrc');
    if (existsSync(customLyricsPath)) {
      track.lyrics = {
        file: `lyrics/${id}.lrc`,
        format: 'lrc',
        source: 'manual',
        reviewed: true,
      };
    } else if (existsSync(sidecarLyricsPath)) {
      track.lyrics = {
        file: `lyrics/${id}.lrc`,
        format: 'lrc',
        source: 'sidecar',
        reviewed: true,
      };
    }

    // Tự động phân tích BPM, Camelot Key, introEnd, outroStart (có bộ đệm cache)
    try {
      const analysis = await analyzeAudioFile(filePath, id);
      if (analysis) {
        track.bpm = analysis.bpm;
        track.key = analysis.key;
        track.introEnd = analysis.introEnd;
        track.outroStart = analysis.outroStart;
      }
    } catch (analysisErr) {
      console.warn(`[Scanner] Bỏ qua phân tích audio cho "${title}" (${id}):`, analysisErr);
    }

    return {
      track,
      filePath,
      coverBuffer,
      coverMime,
    };
  } catch (err) {
    console.warn(`Lỗi khi đọc file ${filePath}:`, err);
    return null;
  }
}
