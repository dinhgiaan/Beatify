import { describe, it, expect } from 'vitest';
import {
  computeReplayStats,
  computeFullReplay,
  calculateMilestones,
  getStartOfWeek,
  getStartOfMonth,
  getStartOfYear,
  normalizeArtistKey,
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

  describe('normalizeArtistKey và gộp nghệ sĩ khi thống kê Replay', () => {
    it('chuẩn hóa chính xác các trường hợp NFC/NFD, hoa thường, Mr.T vs Mr T, Đạt G vs ĐạtG', () => {
      // 1. Hoa thường (uppercase/lowercase)
      expect(normalizeArtistKey('HIEUTHUHAI')).toBe(normalizeArtistKey('Hieuthuhai'));
      expect(normalizeArtistKey('B Ray')).toBe(normalizeArtistKey('B RAY'));

      // 2. Dấu chấm và khoảng trắng: "Mr.T" vs "Mr T"
      expect(normalizeArtistKey('Mr.T')).toBe('mrt');
      expect(normalizeArtistKey('Mr T')).toBe('mrt');
      expect(normalizeArtistKey('Mr.T')).toBe(normalizeArtistKey('Mr T'));

      // 3. Khoảng trắng: "Đạt G" vs "ĐạtG" (giữ nguyên dấu tiếng Việt)
      expect(normalizeArtistKey('Đạt G')).toBe('đạtg');
      expect(normalizeArtistKey('ĐạtG')).toBe('đạtg');
      expect(normalizeArtistKey('Đạt G')).toBe(normalizeArtistKey('ĐạtG'));

      // 4. Unicode NFC vs NFD (tổ hợp vs dựng sẵn)
      const nfcString = 'Sơn Tùng M-TP'.normalize('NFC');
      const nfdString = 'Sơn Tùng M-TP'.normalize('NFD');
      expect(nfcString).not.toBe(nfdString); // NFD có ký tự tách rời dấu
      expect(normalizeArtistKey(nfcString)).toBe(normalizeArtistKey(nfdString));
      expect(normalizeArtistKey(nfdString)).toBe('sơntùngm-tp');

      // 5. Chuỗi rỗng / null / undefined an toàn
      expect(normalizeArtistKey('')).toBe('');
    });

    it('gộp các biến thể của cùng nghệ sĩ và chọn dạng xuất hiện nhiều nhất (đa số)', () => {
      const records: ListeningRecord[] = [
        {
          trackId: 't1',
          title: 'Bài 1',
          artist: 'B Ray',
          durationSec: 180,
          listenedSec: 180,
          timestamp: 1000,
        },
        {
          trackId: 't2',
          title: 'Bài 2',
          artist: 'B Ray',
          durationSec: 180,
          listenedSec: 180,
          timestamp: 2000,
        },
        {
          trackId: 't3',
          title: 'Bài 3',
          artist: 'B RAY',
          durationSec: 180,
          listenedSec: 180,
          timestamp: 3000,
        },
      ];

      const stats = computeReplayStats(records, 0);
      expect(stats.topArtists).toHaveLength(1);
      // Gộp cả 3 lượt nghe
      expect(stats.topArtists[0]?.count).toBe(3);
      // Dạng chiếm đa số (2 so với 1) là "B Ray"
      expect(stats.topArtists[0]?.artist).toBe('B Ray');
    });

    it('khi số lượng bằng nhau (hòa): giữ dạng xuất hiện sớm nhất', () => {
      const records: ListeningRecord[] = [
        {
          trackId: 't1',
          title: 'Bài 1',
          artist: 'Tommy Tèo',
          durationSec: 180,
          listenedSec: 180,
          timestamp: 1000,
        },
        {
          trackId: 't2',
          title: 'Bài 2',
          artist: 'TOMMY TÈO',
          durationSec: 180,
          listenedSec: 180,
          timestamp: 2000,
        },
      ];

      const stats = computeReplayStats(records, 0);
      expect(stats.topArtists).toHaveLength(1);
      expect(stats.topArtists[0]?.count).toBe(2);
      expect(stats.topArtists[0]?.artist).toBe('Tommy Tèo');
    });

    it('áp dụng bảng ghi đè thủ công cho HIEUTHUHAI bất kể dạng nào xuất hiện nhiều hơn', () => {
      const records: ListeningRecord[] = [
        {
          trackId: 't1',
          title: 'Bài 1',
          artist: 'Hieuthuhai',
          durationSec: 180,
          listenedSec: 180,
          timestamp: 1000,
        },
        {
          trackId: 't2',
          title: 'Bài 2',
          artist: 'Hieuthuhai',
          durationSec: 180,
          listenedSec: 180,
          timestamp: 2000,
        },
        {
          trackId: 't3',
          title: 'Bài 3',
          artist: 'hieuthuhai',
          durationSec: 180,
          listenedSec: 180,
          timestamp: 3000,
        },
      ];

      const stats = computeReplayStats(records, 0);
      expect(stats.topArtists).toHaveLength(1);
      expect(stats.topArtists[0]?.count).toBe(3);
      // Theo MANUAL_ARTIST_DISPLAY_OVERRIDES thì phải hiển thị in hoa "HIEUTHUHAI"
      expect(stats.topArtists[0]?.artist).toBe('HIEUTHUHAI');
    });
  });
});
