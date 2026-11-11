import { describe, it, expect } from 'vitest';
import type { Track } from './schemas';
import {
  pitchToCamelot,
  parseCamelot,
  getCamelotRelation,
  getBpmDeltaPercent,
  equalPowerFadeOut,
  equalPowerFadeIn,
  calculateRealtimeFadeVolume,
  evaluateTransitionCompatibility,
  getTransitionCuePoints,
} from './smartTransition';

describe('smartTransition', () => {
  describe('pitchToCamelot & parseCamelot', () => {
    it('chuyển đúng nốt A minor thành 8A', () => {
      expect(pitchToCamelot('A', 'minor')).toBe('8A');
      expect(pitchToCamelot('Am')).toBe('8A');
    });

    it('chuyển đúng nốt C major thành 8B', () => {
      expect(pitchToCamelot('C', 'major')).toBe('8B');
    });

    it('chuyển đúng nốt thăng giáng', () => {
      expect(pitchToCamelot('F#', 'minor')).toBe('11A');
      expect(pitchToCamelot('Gb', 'minor')).toBe('11A');
      expect(pitchToCamelot('C#', 'major')).toBe('3B');
    });

    it('parse mã Camelot hợp lệ', () => {
      expect(parseCamelot('8A')).toEqual({ hour: 8, letter: 'A' });
      expect(parseCamelot('12b')).toEqual({ hour: 12, letter: 'B' });
      expect(parseCamelot('invalid')).toBeNull();
      expect(parseCamelot('15A')).toBeNull();
    });
  });

  describe('getCamelotRelation', () => {
    it('nhận diện đúng quan hệ cùng tông (same)', () => {
      expect(getCamelotRelation('8A', '8A')).toBe('same');
    });

    it('nhận diện đúng quan hệ đổi hệ trưởng/thứ (relative)', () => {
      expect(getCamelotRelation('8A', '8B')).toBe('relative');
    });

    it('nhận diện đúng quan hệ kề nhau +/- 1 giờ (adjacent)', () => {
      expect(getCamelotRelation('8A', '9A')).toBe('adjacent');
      expect(getCamelotRelation('8A', '7A')).toBe('adjacent');
      // Vòng tròn 12 giờ (12A <-> 1A)
      expect(getCamelotRelation('12A', '1A')).toBe('adjacent');
      expect(getCamelotRelation('1A', '12A')).toBe('adjacent');
    });

    it('nhận diện đúng quan hệ tăng năng lượng (+2 giờ)', () => {
      expect(getCamelotRelation('8A', '10A')).toBe('energy_boost');
      expect(getCamelotRelation('11A', '1A')).toBe('energy_boost');
    });

    it('nhận diện quan hệ không tương thích', () => {
      expect(getCamelotRelation('8A', '3A')).toBe('incompatible');
      expect(getCamelotRelation('8A', '2B')).toBe('incompatible');
    });

    it('xử lý khi thiếu thông tin', () => {
      expect(getCamelotRelation(undefined, '8A')).toBe('unknown');
    });
  });

  describe('getBpmDeltaPercent', () => {
    it('tính chênh lệch phần trăm BPM chuẩn xác', () => {
      expect(getBpmDeltaPercent(120, 126)).toBe(5);
      expect(getBpmDeltaPercent(128, 128)).toBe(0);
    });

    it('chuẩn hóa nhịp nhân đôi/chia đôi (half/double tempo)', () => {
      // 70 BPM và 140 BPM thực chất là tương thích
      const delta = getBpmDeltaPercent(70, 140);
      expect(delta).toBe(0);
    });

    it('trả về null nếu thiếu bpm', () => {
      expect(getBpmDeltaPercent(undefined, 120)).toBeNull();
      expect(getBpmDeltaPercent(0, 120)).toBeNull();
    });
  });

  describe('Equal-Power Curves & Real-time Volume', () => {
    it('bảo toàn tổng bình phương công suất âm học (GainA^2 + GainB^2 = 1.0)', () => {
      for (let p = 0; p <= 1; p += 0.1) {
        const out = equalPowerFadeOut(p);
        const inGain = equalPowerFadeIn(p);
        const power = out * out + inGain * inGain;
        expect(Math.abs(power - 1.0)).toBeLessThan(0.001);
      }
    });

    it('tính âm lượng thời gian thực dựa trên Date.now()', () => {
      const baseVol = 0.8;
      const startMs = 10000;
      const durationSec = 4;

      // Tại thời điểm bắt đầu: volume nguyên vẹn
      expect(calculateRealtimeFadeVolume(baseVol, startMs, durationSec, 10000, true)).toBe(0.8);

      // Tại thời điểm giữa (sau 2s): cos(pi/4) ≈ 0.7071 * 0.8 ≈ 0.5657
      const midVol = calculateRealtimeFadeVolume(baseVol, startMs, durationSec, 12000, true);
      expect(midVol).toBeCloseTo(0.8 * 0.7071, 3);

      // Sau khi quá thời lượng (sau 6s): volume về 0
      expect(calculateRealtimeFadeVolume(baseVol, startMs, durationSec, 16000, true)).toBe(0);
    });

    it('xử lý nhảy vọt thời gian khi JS timer bị iOS freeze', () => {
      const baseVol = 1.0;
      const startMs = 1000;
      const durationSec = 4;
      // Giả sử JS bị freeze trong 10 giây rồi mới thức dậy: volume phải lập tức về 0, không bị kẹt lửng
      const frozenWakeupVol = calculateRealtimeFadeVolume(baseVol, startMs, durationSec, 15000, true);
      expect(frozenWakeupVol).toBe(0);
    });
  });

  describe('evaluateTransitionCompatibility & Cue Points', () => {
    const trackA: Track = {
      id: 'track-a',
      title: 'Track A',
      artist: 'Artist A',
      duration: 180,
      file: 'music/a.mp3',
      storage: 'r2',
      bpm: 120,
      key: '8A',
      introEnd: 5,
      outroStart: 172,
    };

    const trackB: Track = {
      id: 'track-b',
      title: 'Track B',
      artist: 'Artist B',
      duration: 200,
      file: 'music/b.mp3',
      storage: 'r2',
      bpm: 122,
      key: '8A',
      introEnd: 8,
      outroStart: 190,
    };

    it('đánh giá tương thích cao khi cùng tông và gần BPM', () => {
      const result = evaluateTransitionCompatibility(trackA, trackB, 4);
      expect(result.relation).toBe('same');
      expect(result.isHarmonic).toBe(true);
      expect(result.isTempoMatched).toBe(true);
      expect(result.recommendedFadeDurationSec).toBeGreaterThanOrEqual(4);
    });

    it('tính đúng cue points dựa trên outroStart và introEnd', () => {
      const cue = getTransitionCuePoints(trackA, trackB, 4);
      expect(cue.fadeStartSec).toBe(172);
      expect(cue.cutSec).toBe(176);
      expect(cue.nextStartSec).toBe(8);
      expect(cue.actualFadeDurationSec).toBe(4);
    });

    it('fallback an toàn khi thiếu metadata outroStart / introEnd', () => {
      const plainTrackA: Track = {
        id: 'plain-a',
        title: 'Plain A',
        artist: 'Artist',
        duration: 100,
        file: 'music/plain.mp3',
        storage: 'r2',
      };
      const cue = getTransitionCuePoints(plainTrackA, undefined, 4);
      expect(cue.fadeStartSec).toBe(96);
      expect(cue.cutSec).toBe(100);
      expect(cue.nextStartSec).toBe(0);
    });
  });
});

