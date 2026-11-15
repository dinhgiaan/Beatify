import { describe, it, expect } from 'vitest';
import {
  ITunesMatcher,
  levenshteinDistance,
  calculateSimilarity,
  detectSongModifiers,
} from './itunesMatcher';

describe('Tầng 4: ITunesMatcher & Strict Bi-directional Verification', () => {
  describe('1. Khoảng cách Levenshtein & Độ tương đồng (calculateSimilarity)', () => {
    it('trả về 100% khi 2 chuỗi trùng khớp chính xác', () => {
      expect(calculateSimilarity('Phía Sau Em', 'Phía Sau Em')).toBe(100);
      expect(calculateSimilarity('Sơn Tùng M-TP', 'Sơn Tùng M-TP')).toBe(100);
    });

    it('bỏ qua chữ hoa/thường và dấu tiếng Việt', () => {
      expect(calculateSimilarity('phia sau em', 'Phía Sau Em')).toBe(100);
      expect(calculateSimilarity('Son Tung M-TP', 'Sơn Tùng M-TP')).toBe(100);
    });

    it('tính điểm cao khi một chuỗi chứa chuỗi kia', () => {
      const score = calculateSimilarity('Cơn Mưa Ngang Qua', 'Cơn Mưa Ngang Qua (Single)');
      expect(score).toBeGreaterThanOrEqual(85);
    });

    it('tính khoảng cách Levenshtein chính xác', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
      expect(levenshteinDistance('', 'abc')).toBe(3);
      expect(levenshteinDistance('test', 'test')).toBe(0);
    });
  });

  describe('2. Nhận diện Modifier bài hát (detectSongModifiers)', () => {
    it('nhận diện chính xác bài Remix', () => {
      const mod = detectSongModifiers('Cơn Mưa Ngang Qua (Remix 2024)');
      expect(mod.isRemix).toBe(true);
      expect(mod.isCover).toBe(false);
    });

    it('nhận diện chính xác bản Cover', () => {
      const mod = detectSongModifiers('Cô Đơn Trên Sofa (Trung Quân Cover)');
      expect(mod.isCover).toBe(true);
    });

    it('nhận diện bản Karaoke / Beat', () => {
      const mod = detectSongModifiers('Nơi Này Có Anh (Beat Karaoke)');
      expect(mod.isKaraoke).toBe(true);
    });

    it('nhận diện bản Instrumental', () => {
      const mod = detectSongModifiers('Dấu Mưa (Piano Version Instrumental)');
      expect(mod.isInstrumental).toBe(true);
    });
  });

  describe('3. Cơ chế Khớp 2 chiều & Chống Match Nhầm với Mock Cache', () => {
    const matcher = new ITunesMatcher();

    it('chặn match nhầm khi iTunes trả về bản Cover nhưng bài gốc không phải cover', async () => {
      // Bơm vào cache giả lập iTunes trả về bản Cover với tên giả định độc lập
      const uniqueSong = 'Một Bài Hát Cover Test Mẫu';
      const uniqueArtist = 'Ca Sĩ Test Mẫu';
      const query = `vn:${uniqueArtist.toLowerCase()} ${uniqueSong.toLowerCase()}`;
      // @ts-expect-error test cache injection
      matcher.cache.set(query, [
        {
          trackId: 9999,
          trackName: `${uniqueSong} (Cover)`,
          artistName: 'Một Người Khác',
          collectionName: 'Covers Collection',
        },
      ]);

      const res = await matcher.matchEntity(
        {
          rawTitle: `${uniqueSong} - ${uniqueArtist}`,
          candidateTitle: uniqueSong,
          candidateArtist: uniqueArtist,
        },
        { noNetwork: true }
      );

      expect(res).toBeNull();
    });

    it('khớp thành công khi có kết quả chuẩn từ iTunes', async () => {
      const query = 'vn:kay tran phia sau em';
      // @ts-expect-error test cache injection
      matcher.cache.set(query, [
        {
          trackId: 147852369,
          trackName: 'Phía Sau Em',
          artistName: 'Kay Trần',
          collectionName: 'Phía Sau Em - Single',
          artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/100x100bb.jpg',
        },
      ]);

      const res = await matcher.matchEntity(
        {
          rawTitle: 'Phía Sau Em - Kay Trần',
          candidateTitle: 'Phía Sau Em',
          candidateArtist: 'Kay Trần',
        },
        { noNetwork: true }
      );

      expect(res).not.toBeNull();
      expect(res?.title).toBe('Phía Sau Em');
      expect(res?.artist).toBe('Kay Trần');
      expect(res?.album).toBe('Phía Sau Em - Single');
      expect(res?.source).toBe('itunes');
      expect(res?.confidence).toBe('high');
      expect(res?.coverUrl).toContain('1400x1400bb.jpg');
    });

    it('tự động xử lý đảo vế khi iTunes xác nhận (Title <-> Artist)', async () => {
      // Giả sử đầu vào bị đảo vế: candidateTitle="Kay Trần", candidateArtist="Phía Sau Em"
      const query = 'vn:phia sau em kay tran';
      // @ts-expect-error test cache injection
      matcher.cache.set(query, [
        {
          trackId: 147852369,
          trackName: 'Phía Sau Em',
          artistName: 'Kay Trần',
          collectionName: 'Phía Sau Em - Single',
        },
      ]);

      const res = await matcher.matchEntity(
        {
          rawTitle: 'Kay Trần - Phía Sau Em',
          candidateTitle: 'Kay Trần',
          candidateArtist: 'Phía Sau Em',
        },
        { noNetwork: true }
      );

      expect(res).not.toBeNull();
      expect(res?.title).toBe('Phía Sau Em');
      expect(res?.artist).toBe('Kay Trần');
    });

    it('tôn trọng cờ noNetwork và trả về null khi không có trong cache', async () => {
      const res = await matcher.matchEntity(
        {
          rawTitle: 'Một Bài Hát Hoàn Toàn Lạ 123456789',
          candidateTitle: 'Một Bài Hát Hoàn Toàn Lạ 123456789',
          candidateArtist: 'Ca Sĩ Lạ',
        },
        { noNetwork: true }
      );
      expect(res).toBeNull();
    });
  });
});
