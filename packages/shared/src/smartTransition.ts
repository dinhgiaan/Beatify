import type { Track } from './schemas';

/**
 * Mã cung Camelot từ 1A - 12A (Điệu Thứ - Minor) và 1B - 12B (Điệu Trưởng - Major)
 */
export type CamelotLetter = 'A' | 'B';
export type CamelotCode = `${number}${CamelotLetter}`;

export type CamelotRelation =
  | 'same' // Trùng tông hoàn toàn (vd: 8A -> 8A)
  | 'adjacent' // Bậc 5 kề nhau +/- 1 giờ (vd: 8A -> 9A hoặc 7A)
  | 'relative' // Đổi hệ cùng số A <-> B (vd: 8A <-> 8B)
  | 'energy_boost' // Tăng 1 cung toàn bộ +2 giờ (vd: 8A -> 10A)
  | 'incompatible' // Lệch tông khác xa
  | 'unknown'; // Thiếu thông tin

export interface TransitionCompatibility {
  relation: CamelotRelation;
  isHarmonic: boolean;
  bpmDeltaPercent: number | null;
  isTempoMatched: boolean;
  recommendedFadeDurationSec: number;
}

export interface TransitionCuePoints {
  fadeStartSec: number; // Mốc thời gian bắt đầu hạ volume bài A
  cutSec: number; // Mốc thời gian chuyển sang bài B (skipToIndex / skipToNext)
  nextStartSec: number; // Mốc thời gian bắt đầu của bài B (introEnd)
  actualFadeDurationSec: number; // Thời lượng hạ volume thực tế
}

export interface SmartTransitionSettings {
  enabled: boolean;
  durationSec: number; // 2 đến 8 giây, mặc định 4
  safeMode: boolean; // Chế độ an toàn: chỉ vào bài tại introEnd, không fade volume qua JS
}

export interface TransitionLogEntry {
  id: string;
  timestamp: string;
  fromTrackId: string;
  fromTrackTitle: string;
  toTrackId: string;
  toTrackTitle: string;
  fromBpm?: number;
  toBpm?: number;
  bpmDeltaPercent?: number;
  fromKey?: string;
  toKey?: string;
  camelotRelation: CamelotRelation;
  configuredDurationSec: number;
  actualFadeDurationSec: number;
  fadeStartTimeMs: number;
  fadeEndTimeMs: number;
  appState: 'active' | 'background' | 'inactive';
  finalVolume: number;
  isSafeMode: boolean;
  status: 'completed' | 'fallback' | 'cancelled' | 'error';
  reason?: string;
}

// Bảng ánh xạ nốt nhạc chuẩn phương Tây sang mã Camelot
const PITCH_TO_CAMELOT: Record<string, { major: CamelotCode; minor: CamelotCode }> = {
  B: { major: '1B', minor: '10A' },
  'F#': { major: '2B', minor: '11A' },
  Gb: { major: '2B', minor: '11A' },
  'C#': { major: '3B', minor: '12A' },
  Db: { major: '3B', minor: '12A' },
  'G#': { major: '4B', minor: '1A' },
  Ab: { major: '4B', minor: '1A' },
  'D#': { major: '5B', minor: '2A' },
  Eb: { major: '5B', minor: '2A' },
  'A#': { major: '6B', minor: '3A' },
  Bb: { major: '6B', minor: '3A' },
  F: { major: '7B', minor: '4A' },
  C: { major: '8B', minor: '5A' },
  G: { major: '9B', minor: '6A' },
  D: { major: '10B', minor: '7A' },
  A: { major: '11B', minor: '8A' },
  E: { major: '12B', minor: '9A' },
};

/**
 * Chuyển đổi nốt nhạc cơ bản (vd: "A", "minor") sang mã Camelot (vd: "8A")
 */
export function pitchToCamelot(keyName?: string, scale = 'minor'): string | null {
  if (!keyName) return null;
  const cleanKey = keyName.trim();
  const s = (scale || '').trim().toLowerCase();
  const isMinor =
    s === 'minor' ||
    s === 'min' ||
    s === 'm' ||
    s.startsWith('min') ||
    cleanKey.endsWith('m') ||
    cleanKey.endsWith('min');

  const normalizedKey = cleanKey.replace(/(min|m)$/i, '').trim();
  const entry = PITCH_TO_CAMELOT[normalizedKey];
  if (!entry) return null;

  return isMinor ? entry.minor : entry.major;
}

/**
 * Phân tích và chuẩn hóa mã Camelot (vd: "8A" -> { hour: 8, letter: 'A' })
 */
export function parseCamelot(code?: string): { hour: number; letter: CamelotLetter } | null {
  if (!code) return null;
  const trimmed = code.trim().toUpperCase();
  const match = trimmed.match(/^(\d{1,2})([AB])$/);
  if (!match || !match[1] || !match[2]) return null;

  const hour = parseInt(match[1], 10);
  const letter = match[2] as CamelotLetter;
  if (hour < 1 || hour > 12) return null;

  return { hour, letter };
}

/**
 * Xác định quan hệ hài âm giữa 2 khóa Camelot
 */
export function getCamelotRelation(keyA?: string, keyB?: string): CamelotRelation {
  const parsedA = parseCamelot(keyA);
  const parsedB = parseCamelot(keyB);
  if (!parsedA || !parsedB) return 'unknown';

  if (parsedA.hour === parsedB.hour && parsedA.letter === parsedB.letter) {
    return 'same';
  }

  if (parsedA.hour === parsedB.hour && parsedA.letter !== parsedB.letter) {
    return 'relative';
  }

  if (parsedA.letter === parsedB.letter) {
    const diff = Math.abs(parsedA.hour - parsedB.hour);
    if (diff === 1 || diff === 11) {
      return 'adjacent';
    }
    // Tăng năng lượng +2 giờ theo chiều kim đồng hồ
    const clockDiff = (parsedB.hour - parsedA.hour + 12) % 12;
    if (clockDiff === 2) {
      return 'energy_boost';
    }
  }

  return 'incompatible';
}

/**
 * Tính phần trăm chênh lệch BPM, có tính đến nhịp nhân đôi/chia đôi (70 BPM và 140 BPM)
 */
export function getBpmDeltaPercent(bpmA?: number, bpmB?: number): number | null {
  if (!bpmA || !bpmB || bpmA <= 0 || bpmB <= 0) return null;

  // Chuẩn hóa tempo nếu chênh lệch quanh mức 2x hoặc 0.5x
  let effectiveB = bpmB;
  if (bpmB >= bpmA * 1.7 && bpmB <= bpmA * 2.3) {
    effectiveB = bpmB / 2;
  } else if (bpmB <= bpmA * 0.6 && bpmB >= bpmA * 0.4) {
    effectiveB = bpmB * 2;
  }

  const delta = Math.abs(bpmA - effectiveB);
  const percent = (delta / bpmA) * 100;
  return Number(percent.toFixed(2));
}

/**
 * Đường cong Equal-Power Fade Out: từ 1.0 xuống 0.0 bảo toàn công suất âm học
 * cos(progress * pi / 2)
 */
export function equalPowerFadeOut(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  return Math.cos(p * (Math.PI / 2));
}

/**
 * Đường cong Equal-Power Fade In: từ 0.0 lên 1.0 bảo toàn công suất âm học
 * sin(progress * pi / 2)
 */
export function equalPowerFadeIn(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  return Math.sin(p * (Math.PI / 2));
}

/**
 * Tính âm lượng thời gian thực (Wall-clock Time)
 * Công thức: volume = f((Date.now() - fadeStartMs) / durationMs) * baseVolume
 * Đảm bảo nếu JS timer bị iOS đóng băng rồi thức dậy, volume nhảy thẳng đến đúng giá trị thực tế
 */
export function calculateRealtimeFadeVolume(
  baseVolume: number,
  fadeStartMs: number,
  durationSec: number,
  nowMs = Date.now(),
  isFadeOut = true
): number {
  if (durationSec <= 0) return isFadeOut ? 0 : baseVolume;
  const elapsedSec = (nowMs - fadeStartMs) / 1000;
  const progress = Math.max(0, Math.min(1, elapsedSec / durationSec));
  const multiplier = isFadeOut ? equalPowerFadeOut(progress) : equalPowerFadeIn(progress);
  return Number((baseVolume * multiplier).toFixed(4));
}

/**
 * Đánh giá độ tương thích toàn diện giữa 2 bài hát
 */
export function evaluateTransitionCompatibility(
  trackA: Track,
  trackB?: Track,
  baseDurationSec = 4
): TransitionCompatibility {
  if (!trackB) {
    return {
      relation: 'unknown',
      isHarmonic: false,
      bpmDeltaPercent: null,
      isTempoMatched: false,
      recommendedFadeDurationSec: baseDurationSec,
    };
  }

  const relation = getCamelotRelation(trackA.key, trackB.key);
  const isHarmonic = relation === 'same' || relation === 'adjacent' || relation === 'relative' || relation === 'energy_boost';

  const bpmDeltaPercent = getBpmDeltaPercent(trackA.bpm, trackB.bpm);
  const isTempoMatched = bpmDeltaPercent !== null && bpmDeltaPercent <= 5.0;

  let recommendedFadeDurationSec = baseDurationSec;
  if (isHarmonic && isTempoMatched) {
    // Rất hợp nhau -> cho phép mix sâu hơn
    recommendedFadeDurationSec = Math.min(8, Math.max(baseDurationSec, baseDurationSec + 2));
  } else if (!isHarmonic && bpmDeltaPercent !== null && bpmDeltaPercent > 8.0) {
    // Không hợp nhau -> rút ngắn fade để tránh đá nhịp và xung đột âm thanh
    recommendedFadeDurationSec = Math.max(2, Math.min(baseDurationSec, 3));
  }

  return {
    relation,
    isHarmonic,
    bpmDeltaPercent,
    isTempoMatched,
    recommendedFadeDurationSec,
  };
}

/**
 * Tính toán các điểm cue point chuyển bài chính xác
 */
export function getTransitionCuePoints(
  trackA: Track,
  trackB: Track | undefined,
  configuredDurationSec: number
): TransitionCuePoints {
  const durationA = Math.max(1, trackA.duration);
  const targetDuration = Math.max(1, Math.min(configuredDurationSec, durationA / 2));

  // Điểm outro: ưu tiên outroStart trong metadata, fallback là duration - targetDuration
  let outroStart = trackA.outroStart;
  if (outroStart === undefined || outroStart <= 0 || outroStart >= durationA) {
    outroStart = Math.max(0, durationA - targetDuration);
  }

  // Điểm kết thúc fade out (thời điểm chuyển bài)
  const cutSec = Math.min(durationA, outroStart + targetDuration);
  const actualFadeDurationSec = Math.max(1, cutSec - outroStart);

  // Điểm bắt đầu của bài tiếp theo: ưu tiên introEnd
  let nextStartSec = 0;
  if (trackB && trackB.introEnd !== undefined && trackB.introEnd > 0) {
    // Không bao giờ nhảy quá 25% thời lượng bài B để tránh mất phần đầu quan trọng
    const maxIntroSkip = (trackB.duration || 100) * 0.25;
    nextStartSec = Math.min(trackB.introEnd, maxIntroSkip);
  }

  return {
    fadeStartSec: Number(outroStart.toFixed(2)),
    cutSec: Number(cutSec.toFixed(2)),
    nextStartSec: Number(nextStartSec.toFixed(2)),
    actualFadeDurationSec: Number(actualFadeDurationSec.toFixed(2)),
  };
}
