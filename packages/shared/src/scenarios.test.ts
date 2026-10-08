import { describe, it, expect } from 'vitest';
import { smartShuffle } from './smartShuffle';
import {
  computeReplayStats,
  calculateMilestones,
} from './stats';
import type { Track } from './schemas';

describe('Kiểm thử Toàn bộ Kịch bản (Scenarios Test Suite)', () => {
  const tracksA: Track[] = [
    { id: '1', title: 'T1', artist: 'A', duration: 100, file: '', storage: 'r2' },
    { id: '2', title: 'T2', artist: 'B', duration: 100, file: '', storage: 'r2' },
    { id: '3', title: 'T3', artist: 'C', duration: 100, file: '', storage: 'r2' },
    { id: '4', title: 'T4', artist: 'D', duration: 100, file: '', storage: 'r2' },
  ];

  describe('Kịch bản 1: Thuật toán Smart Shuffle', () => {
    it('ghim bài đang phát ở index 0 và bảo toàn đủ số lượng bài', () => {
      const pinnedResult = smartShuffle(tracksA, '3');
      expect(pinnedResult[0]?.id).toBe('3');
      expect(pinnedResult).toHaveLength(4);
    });

    it('phân tán đều ca sĩ qua 20 lần xáo trộn ngẫu nhiên', () => {
      const multiTracks: Track[] = [
        { id: '1', title: 'Bài 1', artist: 'Sơn Tùng M-TP', duration: 100, file: '', storage: 'r2' },
        { id: '2', title: 'Bài 2', artist: 'Sơn Tùng M-TP', duration: 100, file: '', storage: 'r2' },
        { id: '3', title: 'Bài 3', artist: 'Sơn Tùng M-TP', duration: 100, file: '', storage: 'r2' },
        { id: '4', title: 'Bài 4', artist: 'Đen Vâu', duration: 100, file: '', storage: 'r2' },
        { id: '5', title: 'Bài 5', artist: 'Đen Vâu', duration: 100, file: '', storage: 'r2' },
        { id: '6', title: 'Bài 6', artist: 'Đen Vâu', duration: 100, file: '', storage: 'r2' },
        { id: '7', title: 'Bài 7', artist: 'Vũ', duration: 100, file: '', storage: 'r2' },
        { id: '8', title: 'Bài 8', artist: 'Vũ', duration: 100, file: '', storage: 'r2' },
        { id: '9', title: 'Bài 9', artist: 'Vũ', duration: 100, file: '', storage: 'r2' },
      ];

      for (let i = 0; i < 20; i++) {
        const shuffled = smartShuffle(multiTracks);
        expect(shuffled).toHaveLength(9);
        for (let j = 0; j < shuffled.length - 1; j++) {
          const curA = shuffled[j]?.artist.toLowerCase();
          const nextA = shuffled[j + 1]?.artist.toLowerCase();
          expect(curA).not.toBe(nextA);
        }
      }
    });
  });

  describe('Kịch bản 2: Logic hiển thị Bí ẩn hàng đợi (Mystery Queue)', () => {
    function simulateQueueDisplay(queue: Track[], currentIndex: number, isSmartShuffle: boolean) {
      return queue.map((track, idx) => {
        const isActive = idx === currentIndex;
        const isMysterious = isSmartShuffle && idx > currentIndex;

        return {
          index: isMysterious ? '❓' : idx + 1,
          title: isMysterious ? '🎲 ??? (Bài hát bí ẩn)' : track.title,
          artist: isMysterious ? 'Beatify sẽ tiết lộ khi bài này vang lên ✨' : track.artist,
          canEdit: !isMysterious,
          isActive,
          isMysterious,
        };
      });
    }

    it('ẩn danh sách các bài kế tiếp khi Smart Shuffle BẬT', () => {
      const display = simulateQueueDisplay(tracksA, 1, true); // Đang ở bài index 1 (T2)

      // Bài đã nghe (index 0)
      expect(display[0]?.isMysterious).toBe(false);
      expect(display[0]?.title).toBe('T1');

      // Bài đang phát (index 1)
      expect(display[1]?.isMysterious).toBe(false);
      expect(display[1]?.title).toBe('T2');
      expect(display[1]?.isActive).toBe(true);

      // Các bài tiếp theo (index 2, 3) BỊ ẨN ĐỂ TẠO SỰ BẤT NGỜ
      expect(display[2]?.isMysterious).toBe(true);
      expect(display[2]?.title).toBe('🎲 ??? (Bài hát bí ẩn)');
      expect(display[2]?.artist).toBe('Beatify sẽ tiết lộ khi bài này vang lên ✨');
      expect(display[2]?.canEdit).toBe(false);

      expect(display[3]?.isMysterious).toBe(true);
      expect(display[3]?.title).toBe('🎲 ??? (Bài hát bí ẩn)');
    });

    it('hiển thị đầy đủ tất cả bài khi Smart Shuffle TẮT', () => {
      const display = simulateQueueDisplay(tracksA, 1, false);
      expect(display[2]?.isMysterious).toBe(false);
      expect(display[2]?.title).toBe('T3');
      expect(display[2]?.canEdit).toBe(true);
      expect(display[3]?.isMysterious).toBe(false);
      expect(display[3]?.title).toBe('T4');
    });
  });

  describe('Kịch bản 3: Thống kê Beatify Replay & Mốc Kỷ Niệm', () => {
    const now = Date.now();
    const sampleRecords = [
      { trackId: '1', title: 'Chúng Ta Của Hiện Tại', artist: 'Sơn Tùng M-TP', durationSec: 300, listenedSec: 300, timestamp: now - 1000 * 60 * 5 },
      { trackId: '1', title: 'Chúng Ta Của Hiện Tại', artist: 'Sơn Tùng M-TP', durationSec: 300, listenedSec: 300, timestamp: now - 1000 * 60 * 15 },
      { trackId: '2', title: 'Mang Tiền Về Cho Mẹ', artist: 'Đen Vâu', durationSec: 240, listenedSec: 240, timestamp: now - 1000 * 60 * 30 },
      { trackId: '3', title: 'Lạ Lùng', artist: 'Vũ', durationSec: 180, listenedSec: 180, timestamp: now - 1000 * 60 * 60 * 24 * 3 },
      { trackId: '4', title: 'Bài Hát Đêm Khuya', artist: 'Hà Anh Tuấn', durationSec: 200, listenedSec: 200, timestamp: new Date(2026, 9, 8, 2, 30).getTime() },
    ];

    it('tính toán số lượt nghe, phút nghe, top bài hát, top ca sĩ chính xác', () => {
      const totalStats = computeReplayStats(sampleRecords, 0);
      expect(totalStats.totalPlays).toBe(5);
      expect(totalStats.totalMinutes).toBe(Math.round((300 + 300 + 240 + 180 + 200) / 60));
      expect(totalStats.topTracks[0]?.trackId).toBe('1');
      expect(totalStats.topTracks[0]?.count).toBe(2);
      expect(totalStats.topArtists[0]?.artist).toBe('Sơn Tùng M-TP');
      expect(totalStats.topArtists[0]?.count).toBe(2);
    });

    it('mở khóa các huy hiệu kỷ niệm theo hành vi nghe', () => {
      const milestones = calculateMilestones(sampleRecords);
      const firstSongM = milestones.find((m) => m.id === 'first_song');
      const nightOwlM = milestones.find((m) => m.id === 'night_owl');

      expect(firstSongM?.achieved).toBe(true);
      expect(nightOwlM?.achieved).toBe(true);
    });
  });
});
