import { describe, it, expect } from 'vitest';
import {
  computeReplayStats,
  computeFullReplay,
  calculateMilestones,
  getStartOfWeek,
  getStartOfMonth,
  getStartOfYear,
  type ListeningRecord,
} from './stats';

describe('stats & replay calculation', () => {
  const mockRecords: ListeningRecord[] = [
    {
      trackId: 'track-1',
      title: 'Em Của Ngày Hôm Qua',
      artist: 'Sơn Tùng M-TP',
      durationSec: 240,
      listenedSec: 240,
      timestamp: Date.now() - 1000 * 60 * 60, // 1 giờ trước
    },
    {
      trackId: 'track-1',
      title: 'Em Của Ngày Hôm Qua',
      artist: 'Sơn Tùng M-TP',
      durationSec: 240,
      listenedSec: 240,
      timestamp: Date.now() - 1000 * 60 * 30, // 30 phút trước
    },
    {
      trackId: 'track-2',
      title: 'Đi Về Nhà',
      artist: 'Đen Vâu',
      durationSec: 200,
      listenedSec: 200,
      timestamp: Date.now() - 1000 * 60 * 10, // 10 phút trước
    },
  ];

  it('tính toán chính xác tổng số phút và lượt nghe', () => {
    const stats = computeReplayStats(mockRecords, 0);
    expect(stats.totalPlays).toBe(3);
    expect(stats.totalMinutes).toBe(Math.round((240 + 240 + 200) / 60)); // 11 phút
    expect(stats.topTracks[0]?.trackId).toBe('track-1');
    expect(stats.topTracks[0]?.count).toBe(2);
    expect(stats.topArtists[0]?.artist).toBe('Sơn Tùng M-TP');
    expect(stats.topArtists[0]?.count).toBe(2);
  });

  it('lọc chính xác theo mốc thời gian', () => {
    const futureTimestamp = Date.now() + 100000;
    const stats = computeReplayStats(mockRecords, futureTimestamp);
    expect(stats.totalPlays).toBe(0);
    expect(stats.topTracks).toHaveLength(0);
  });

  it('tính toán mốc kỷ niệm khởi đầu chính xác', () => {
    const milestones = calculateMilestones(mockRecords);
    const firstSong = milestones.find((m) => m.id === 'first_song');
    expect(firstSong?.achieved).toBe(true);

    const plays200 = milestones.find((m) => m.id === 'plays_200');
    expect(plays200?.achieved).toBe(false);
  });

  it('tạo báo cáo Full Replay hoàn chỉnh', () => {
    const full = computeFullReplay(mockRecords);
    expect(full.firstTrackEver?.title).toBe('Em Của Ngày Hôm Qua');
    expect(full.mostPlayedTrackEver?.title).toBe('Em Của Ngày Hôm Qua');
    expect(full.mostPlayedTrackEver?.count).toBe(2);
    expect(full.week.totalPlays).toBeGreaterThanOrEqual(1);
    expect(full.milestones).toHaveLength(6);
  });

  it('các hàm mốc thời gian hoạt động đúng', () => {
    const now = new Date('2026-10-08T12:00:00Z').getTime();
    expect(getStartOfWeek(now)).toBeLessThanOrEqual(now);
    expect(getStartOfMonth(now)).toBeLessThanOrEqual(now);
    expect(getStartOfYear(now)).toBeLessThanOrEqual(now);
  });
});
