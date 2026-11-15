import { describe, it, expect } from 'vitest';
import {
  StructuralParser,
  balanceBrackets,
  toSmartTitleCase,
} from './structuralParser';
import { ChannelClassifier } from './channelClassifier';
import { KnownArtistsService } from './knownArtistsService';

describe('Tầng 3: StructuralParser & Weighted Heuristic Matrix', () => {
  const parser = new StructuralParser();
  const classifier = new ChannelClassifier();
  const knownArtists = new KnownArtistsService();

  describe('1. Cân bằng ngoặc (balanceBrackets)', () => {
    it('tự động đóng ngoặc đơn bị thiếu ở cuối chuỗi', () => {
      expect(balanceBrackets('YN1 pt.2 (ft. yugaki')).toBe('YN1 pt.2 (ft. yugaki)');
      expect(balanceBrackets('Bài Hát ((remix)')).toBe('Bài Hát ((remix))');
    });

    it('tự động đóng ngoặc vuông bị thiếu', () => {
      expect(balanceBrackets('[CHO BẢO 02. Đẹp')).toBe('[CHO BẢO 02. Đẹp]');
    });

    it('giữ nguyên chuỗi nếu ngoặc đã cân bằng hoặc không có ngoặc', () => {
      expect(balanceBrackets('Đạt G - Ác Mộng Đẹp (Official MV)')).toBe('Đạt G - Ác Mộng Đẹp (Official MV)');
      expect(balanceBrackets('Sơn Tùng M-TP - Cơn Mưa Ngang Qua')).toBe('Sơn Tùng M-TP - Cơn Mưa Ngang Qua');
    });
  });

  describe('2. Bóc tách Album, Mixtape & Track Number (extractAlbumAndTrackNo)', () => {
    it('bóc tách tiền tố [CHO BẢO] 02.', () => {
      const res = parser.extractAlbumAndTrackNo('[CHO BẢO] 02. Đẹp');
      expect(res.album).toBe('CHO BẢO');
      expect(res.trackNumber).toBe(2);
      expect(res.cleanedText).toBe('Đẹp');
    });

    it('bóc tách [UNhiddenGem Mixtape] 4.', () => {
      const res = parser.extractAlbumAndTrackNo('[UNhiddenGem Mixtape] 4. Lạc Lối');
      expect(res.album).toBe('UNhiddenGem');
      expect(res.trackNumber).toBe(4);
      expect(res.cleanedText).toBe('Lạc Lối');
    });

    it('bóc tách [2G17]', () => {
      const res = parser.extractAlbumAndTrackNo('[2G17] Tên Bài Hát');
      expect(res.album).toBe('2G17');
      expect(res.cleanedText).toBe('Tên Bài Hát');
    });

    it('bóc tách Album rõ ràng trong ngoặc kép Album "Ác Mộng Đẹp"', () => {
      const res = parser.extractAlbumAndTrackNo('Đạt G - Ác Mộng Đẹp | Album "Ác Mộng Đẹp"');
      expect(res.album).toBe('Ác Mộng Đẹp');
      expect(res.cleanedText).toBe('Đạt G - Ác Mộng Đẹp');
    });

    it('bóc tách số thứ tự đơn thuần đầu bài "02. Con Trai Cưng"', () => {
      const res = parser.extractAlbumAndTrackNo('02. Con Trai Cưng');
      expect(res.trackNumber).toBe(2);
      expect(res.cleanedText).toBe('Con Trai Cưng');
    });

    it('chuẩn hóa Chapter 3: Đẹp -> Đẹp (Chapter 3)', () => {
      const res = parser.extractAlbumAndTrackNo('Chapter 3: Đẹp');
      expect(res.cleanedText).toBe('Đẹp (Chapter 3)');
    });
  });

  describe('3. Bóc tách Producer (stripProductionInfo)', () => {
    it('bóc tách (Prod. by Mikeezy)', () => {
      const res = parser.stripProductionInfo('Con Trai Cưng (Prod. by Mikeezy)');
      expect(res.producer).toBe('Mikeezy');
      expect(res.cleanedText).toBe('Con Trai Cưng');
    });

    it('bóc tách (Prod by Hổ)', () => {
      const res = parser.stripProductionInfo('Thiêu Thân (Prod by Hổ)');
      expect(res.producer).toBe('Hổ');
      expect(res.cleanedText).toBe('Thiêu Thân');
    });

    it('bóc tách dạng inline - Prod. Ducnn', () => {
      const res = parser.stripProductionInfo('Tên Bài - Prod. Ducnn');
      expect(res.producer).toBe('Ducnn');
      expect(res.cleanedText).toBe('Tên Bài');
    });
  });

  describe('4. Bóc tách nghệ sĩ hợp tác (extractCollaborators)', () => {
    it('bóc tách (ft. Hazel) và chuyển thành đuôi (feat. Hazel)', () => {
      const res = parser.extractCollaborators('Cao Ốc 20 (ft. Hazel)');
      expect(res.collaborators).toContain('Hazel');
      expect(res.formattedFeatSuffix).toBe(' (feat. Hazel)');
      expect(res.mainTitleOrArtist).toBe('Cao Ốc 20');
    });

    it('bóc tách nhiều nghệ sĩ hợp tác qua dấu phẩy hoặc &', () => {
      const res = parser.extractCollaborators('Bài Ca feat. Masew, K-ICM & Đạt G');
      expect(res.collaborators).toEqual(['Masew', 'K-ICM', 'Đạt G']);
      expect(res.formattedFeatSuffix).toBe(' (feat. Masew & K-ICM & Đạt G)');
    });
  });

  describe('5. Chuyển đổi Title Case thông minh (toSmartTitleCase)', () => {
    it('chuyển chuỗi ALL CAPS sang Title Case', () => {
      expect(toSmartTitleCase('CON TRAI CƯNG')).toBe('Con Trai Cưng');
      expect(toSmartTitleCase('ÁC MỘNG ĐẸP')).toBe('Ác Mộng Đẹp');
    });

    it('giữ nguyên chuỗi đã chuẩn hoa thường / hoa đầu từ', () => {
      expect(toSmartTitleCase('Sơn Tùng M-TP')).toBe('Sơn Tùng M-TP');
      expect(toSmartTitleCase('Cơn Mưa Ngang Qua')).toBe('Cơn Mưa Ngang Qua');
    });
  });

  describe('6. Chấm điểm Ngữ nghĩa Trọng số (scoreAsArtist)', () => {
    it('phạt nặng tên kênh aggregator / hãng đĩa', () => {
      const res = parser.scoreAsArtist('EvB Records', undefined, classifier, knownArtists);
      expect(res.score).toBeLessThanOrEqual(-80);
      expect(res.signals).toContain('is_aggregator_channel_penalty');
    });

    it('cộng điểm danh bạ nghệ sĩ đã biết (+50)', () => {
      const res = parser.scoreAsArtist('B Ray', undefined, classifier, knownArtists);
      expect(res.score).toBeGreaterThanOrEqual(50);
      expect(res.signals.some((s) => s.startsWith('known_artist_match'))).toBe(true);
    });

    it('cộng điểm trùng khớp tên kênh uploader (+30)', () => {
      const res = parser.scoreAsArtist('Đạt G', 'Đạt G Official', classifier, knownArtists);
      expect(res.signals).toContain('channel_exact_match');
    });

    it('phạt điểm từ khóa bài hát (-40)', () => {
      const res = parser.scoreAsArtist('Ác Mộng Đẹp (Official MV)', undefined, classifier, knownArtists);
      expect(res.signals.some((s) => s.startsWith('song_keyword'))).toBe(true);
    });
  });

  describe('7. End-to-End Tầng 3: Phân tích cấu trúc & Giải quyết thực thể', () => {
    it('sửa lỗi đảo vế khi vế phải là nghệ sĩ và vế trái là bài hát', () => {
      const res = parser.parse(
        { title: 'Ác Mộng Đẹp - Đạt G', channel: 'Đạt G Official' },
        classifier,
        knownArtists
      );
      expect(res.artist).toBe('Đạt G');
      expect(res.title).toBe('Ác Mộng Đẹp');
      expect(res.orientation).toBe('right_is_artist');
      expect(res.confidence).toBe('high');
    });

    it('xử lý chuỗi phức tạp: album prefix + track number + missing bracket + producer', () => {
      const res = parser.parse(
        {
          title: '[CHO BẢO] 02. Đẹp (ft. yugaki (Prod. by Mikeezy) - B Ray',
          channel: 'B Ray Official',
        },
        classifier,
        knownArtists
      );
      expect(res.artist).toBe('B Ray');
      expect(res.title).toBe('Đẹp (feat. yugaki)');
      expect(res.album).toBe('CHO BẢO');
      expect(res.trackNumber).toBe(2);
    });

    it('xử lý chuỗi nhiều dấu gạch ngang (multiple dashes)', () => {
      const res = parser.parse(
        {
          title: '1NG - 2CAN - DICK - Ai Đưa Em Về (Official MV)',
          channel: 'Bạn Có Tài Mà',
        },
        classifier,
        knownArtists
      );
      expect(res.artist).toBe('1NG, 2CAN, DICK');
      expect(res.title).toBe('Ai Đưa Em Về');
    });
  });
});

