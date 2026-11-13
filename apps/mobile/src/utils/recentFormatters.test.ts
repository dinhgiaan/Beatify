import { describe, it, expect } from 'vitest';
import { cleanTrackTitle, formatRelativeTime } from './recentFormatters';

describe('recentFormatters', () => {
  describe('cleanTrackTitle', () => {
    it('lược bỏ [MV OFFICIAL] và [Lyrics Video]', () => {
      expect(cleanTrackTitle('[MV OFFICIAL] Buông Đôi Tay Nhau Ra')).toBe('Buông Đôi Tay Nhau Ra');
      expect(cleanTrackTitle('[Lyrics Video] Track 9. Finale')).toBe('Finale');
    });

    it('lược bỏ (prod. by ...) và các ngoặc đơn sản xuất', () => {
      expect(cleanTrackTitle('NOLOVENOLIFE (prod. by Kewtiie)')).toBe('NOLOVENOLIFE');
    });

      it('lược bỏ hậu tố gạch ngang như - MV OFFICIAL, - Official Audio', () => {
        expect(cleanTrackTitle('Cao Ốc 20 - MV OFFICIAL')).toBe('Cao Ốc 20');
        expect(cleanTrackTitle('Bài Ca Hy Vọng - Official Audio')).toBe('Bài Ca Hy Vọng');
      });

      it('lược bỏ rác YouTube: Video Lyrics, Review, (Official Video)', () => {
        expect(cleanTrackTitle('Đừng Làm Trái Tim Anh Đau (Official Video)')).toBe('Đừng Làm Trái Tim Anh Đau');
        expect(cleanTrackTitle('Thiên Lý Ơi - Video Lyrics')).toBe('Thiên Lý Ơi');
        expect(cleanTrackTitle('Cắt Đôi Nỗi Sầu | Review')).toBe('Cắt Đôi Nỗi Sầu');
        expect(cleanTrackTitle('Nơi Này Có Anh Video Lyrics')).toBe('Nơi Này Có Anh');
        expect(cleanTrackTitle('Em Của Ngày Hôm Qua (Official Music Video)')).toBe('Em Của Ngày Hôm Qua');
      });

      it('giữ nguyên tên bài sạch', () => {
        expect(cleanTrackTitle('Như Ngày Hôm Qua')).toBe('Như Ngày Hôm Qua');
        expect(cleanTrackTitle('Chúng Ta Không Thuộc Về Nhau')).toBe('Chúng Ta Không Thuộc Về Nhau');
      });
    });

    describe('formatRelativeTime', () => {
      it('trả về thời gian tương đối chuẩn xác khi có timestamp', () => {
        const now = Date.now();
        expect(formatRelativeTime(now - 10 * 1000)).toBe('Vừa xong');
        expect(formatRelativeTime(now - 10 * 60 * 1000)).toBe('10 phút trước');
        expect(formatRelativeTime(now - 3 * 3600 * 1000)).toBe('3 giờ trước');
        expect(formatRelativeTime(now - 25 * 3600 * 1000)).toBe('Hôm qua');
      });

      it('fallback theo index khi không có timestamp', () => {
        expect(formatRelativeTime(undefined, 0)).toBe('Vừa xong');
        expect(formatRelativeTime(undefined, 2)).toBe('Hôm nay');
        expect(formatRelativeTime(undefined, 4)).toBe('Hôm qua');
        expect(formatRelativeTime(undefined, 10)).toBe('Trước đó');
      });
    });
  });
