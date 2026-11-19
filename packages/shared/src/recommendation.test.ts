import { describe, it, expect } from 'vitest';
import {
  getTimeOfDay,
  getTimeOfDayGreeting,
  getSmartRecommendations,
} from './recommendation';
import type { Track } from './schemas';
import type { ListeningRecord } from './stats';

describe('recommendation engine', () => {
  describe('getTimeOfDay & getTimeOfDayGreeting', () => {
    it('determines morning correctly (05:00 - 11:59)', () => {
      const d = new Date(2026, 10, 19, 8, 30);
      expect(getTimeOfDay(d)).toBe('morning');
      const greeting = getTimeOfDayGreeting('morning');
      expect(greeting.title).toContain('Chào buổi sáng');
    });

    it('determines afternoon correctly (12:00 - 17:59)', () => {
      const d = new Date(2026, 10, 19, 14, 0);
      expect(getTimeOfDay(d)).toBe('afternoon');
      const greeting = getTimeOfDayGreeting('afternoon');
      expect(greeting.title).toContain('Buổi chiều');
    });

    it('determines evening correctly (18:00 - 22:59)', () => {
      const d = new Date(2026, 10, 19, 20, 15);
      expect(getTimeOfDay(d)).toBe('evening');
      const greeting = getTimeOfDayGreeting('evening');
      expect(greeting.title).toContain('Buổi tối');
    });

    it('determines night correctly (23:00 - 04:59)', () => {
      const d1 = new Date(2026, 10, 19, 23, 30);
      const d2 = new Date(2026, 10, 19, 2, 0);
      expect(getTimeOfDay(d1)).toBe('night');
      expect(getTimeOfDay(d2)).toBe('night');
      const greeting = getTimeOfDayGreeting('night');
      expect(greeting.title).toContain('Đêm muộn');
    });
  });

  describe('getSmartRecommendations', () => {
    const mockTracks: Track[] = [
      {
        id: 'track-fav',
        title: 'Cơn Mưa Ngang Qua',
        artist: 'Sơn Tùng M-TP',
        duration: 220,
        file: 'music/con_mua.mp3',
        storage: 'r2',
      },
      {
        id: 'track-morning',
        title: 'Bình Minh',
        artist: 'Vũ',
        duration: 180,
        file: 'music/binh_minh.mp3',
        storage: 'r2',
      },
      {
        id: 'track-top-artist',
        title: 'Nắng Ấm Xa Dần',
        artist: 'Sơn Tùng M-TP',
        duration: 210,
        file: 'music/nang_am.mp3',
        storage: 'r2',
      },
      {
        id: 'track-night',
        title: 'Dạ Vũ',
        artist: 'Tăng Duy Tân',
        duration: 200,
        file: 'music/da_vu.mp3',
        storage: 'r2',
        replayGain: -10,
      },
    ];

    it('returns empty array when no tracks provided', () => {
      expect(getSmartRecommendations([])).toEqual([]);
    });

    it('prioritizes favorites and top artists with high scores', () => {
      const now = new Date(2026, 10, 19, 8, 0).getTime();
      const records: ListeningRecord[] = [
        {
          trackId: 'track-fav',
          title: 'Cơn Mưa Ngang Qua',
          artist: 'Sơn Tùng M-TP',
          durationSec: 220,
          listenedSec: 210,
          timestamp: now - 1000 * 60 * 60 * 24, // 1 ngày trước
        },
      ];

      const recommendations = getSmartRecommendations(
        mockTracks,
        records,
        ['track-fav'],
        { now, limit: 10 }
      );

      expect(recommendations.length).toBe(mockTracks.length);
      const topRec = recommendations[0];
      expect(topRec).toBeDefined();
      // track-fav is favorite + played -> should have highest score
      expect(topRec?.track.id).toBe('track-fav');
      expect(topRec?.reason.type).toBe('favorite');
    });

    it('applies time-of-day affinity boost', () => {
      const morningTime = new Date(2026, 10, 19, 9, 0).getTime();
      const records: ListeningRecord[] = [
        {
          trackId: 'track-morning',
          title: 'Bình Minh',
          artist: 'Vũ',
          durationSec: 180,
          listenedSec: 180,
          timestamp: morningTime - 1000 * 60 * 60 * 24, // Buổi sáng hôm qua (9h)
        },
        {
          trackId: 'track-night',
          title: 'Dạ Vũ',
          artist: 'Tăng Duy Tân',
          durationSec: 200,
          listenedSec: 200,
          timestamp: morningTime - 1000 * 60 * 60 * 10, // Ban đêm hôm trước (23h)
        },
      ];

      const recommendations = getSmartRecommendations(
        mockTracks,
        records,
        [],
        { now: morningTime, limit: 10 }
      );

      const morningRec = recommendations.find(r => r.track.id === 'track-morning');
      expect(morningRec).toBeDefined();
      expect(morningRec?.reason.type).toBe('time_of_day');
    });

    it('penalizes songs played less than 10 minutes ago', () => {
      const now = new Date(2026, 10, 19, 14, 0).getTime();
      const records: ListeningRecord[] = [
        {
          trackId: 'track-morning',
          title: 'Bình Minh',
          artist: 'Vũ',
          durationSec: 180,
          listenedSec: 180,
          timestamp: now - 1000 * 60 * 2, // 2 phút trước
        },
      ];

      const recommendations = getSmartRecommendations(
        mockTracks,
        records,
        [],
        { now }
      );

      const topRec = recommendations[0];
      expect(topRec).toBeDefined();
      // Should not be the top track due to recency penalty
      expect(topRec?.track.id).not.toBe('track-morning');
    });
  });
});
