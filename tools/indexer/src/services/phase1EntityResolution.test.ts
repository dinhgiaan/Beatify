import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NativeMetadataExtractor } from './nativeMetadataExtractor';
import { ChannelClassifier } from './channelClassifier';
import { KnownArtistsService } from './knownArtistsService';
import {
  EvaluationHarness,
  applyEntityResolutionSafely,
  type EvaluationSample,
  type ResolvedEntityResult,
} from './evaluationHarness';

describe('Giai đoạn 1.5: Xác thực Lõi Phân giải Thực thể Đa Tầng (Tầng 0 + 1 + 2)', () => {
  describe('Tầng 0: NativeMetadataExtractor & 16 Real Fixtures (yt-dlp metadata)', () => {
    const classifier = new ChannelClassifier();

    it('trả về ngay lập tức khi có cặp track + artist chuẩn từ YouTube Music', () => {
      const res = NativeMetadataExtractor.extract(
        {
          track: 'Cơn Mưa Ngang Qua',
          artist: 'Sơn Tùng M-TP',
          album: 'm-tp M-TP',
        },
        classifier
      );
      expect(res).not.toBeNull();
      expect(res?.title).toBe('Cơn Mưa Ngang Qua');
      expect(res?.artist).toBe('Sơn Tùng M-TP');
      expect(res?.album).toBe('m-tp M-TP');
      expect(res?.confidence).toBe('high');
      expect(res?.source).toBe('layer0');
      expect(res?.pipelineVersion).toBe('1.5');
    });

    it('vượt qua 16 fixtures yt-dlp thực tế từ fixtures/ytdlp_samples.json', () => {
      const fixturesPath = path.resolve(__dirname, '../../fixtures/ytdlp_samples.json');
      expect(fs.existsSync(fixturesPath)).toBe(true);
      const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf-8'));
      expect(fixtures.length).toBeGreaterThanOrEqual(15);

      for (const f of fixtures) {
        const res = NativeMetadataExtractor.extract(f.input, classifier);
        if (f.expected.fastPass) {
          expect(res).not.toBeNull();
          expect(res?.title).toBe(f.expected.title);
          expect(res?.artist).toBe(f.expected.artist);
          if (f.expected.artistsCount) {
            expect(res?.artists.length).toBe(f.expected.artistsCount);
          }
        } else {
          // SANITY CHECK: Phải từ chối fast-pass khi vi phạm sanity check
          expect(res).toBeNull();
        }
      }
    });

    it('nhận diện kênh tự động phân phối "- Topic" làm nghệ sĩ chính thức', () => {
      const res = NativeMetadataExtractor.extract(
        {
          title: 'Ác Mộng Đẹp',
          channel: 'Đạt G - Topic',
        },
        classifier
      );
      expect(res).not.toBeNull();
      expect(res?.artist).toBe('Đạt G');
      expect(res?.title).toBe('Ác Mộng Đẹp');
      expect(res?.source).toBe('layer0');
    });

    it('bóc tách từ mô tả bản quyền "Provided to YouTube by ..."', () => {
      const res = NativeMetadataExtractor.extract(
        {
          description:
            'Provided to YouTube by Universal Music Group\n\nÔng Bà Anh\n\nLê Thiện Hiếu\n\nSing My Song 2016',
        },
        classifier
      );
      expect(res).not.toBeNull();
      expect(res?.artist).toBe('Lê Thiện Hiếu');
      expect(res?.title).toBe('Ông Bà Anh');
      expect(res?.source).toBe('layer0');
    });

    it('trả về null nếu thiếu metadata native để nhường cho Tầng 1', () => {
      const res = NativeMetadataExtractor.extract(
        {
          title: 'B.S.N.L 2 - B-RAY ft. YOUNG-H',
          channel: 'EvB Records',
        },
        classifier
      );
      expect(res).toBeNull();
    });
  });

  describe('Tầng 1: ChannelClassifier & Aggregator Detection', () => {
    const classifier = new ChannelClassifier();

    it('nhận diện chính xác các kênh hãng đĩa / aggregator và CẤM dùng làm ca sĩ', () => {
      expect(classifier.isAggregatorChannel('EvB Records')).toBe(true);
      expect(classifier.isAggregatorChannel('FAPTV')).toBe(true);
      expect(classifier.isAggregatorChannel('RV Underground')).toBe(true);
      expect(classifier.isAggregatorChannel('7clouds')).toBe(true);
      expect(classifier.isAggregatorChannel('Fueled By Ramen')).toBe(true);
      expect(classifier.isAggregatorChannel('151 studio')).toBe(true);
    });

    it('không nhận nhầm nghệ sĩ cá nhân vào danh sách aggregator', () => {
      expect(classifier.isAggregatorChannel('Sơn Tùng M-TP Official')).toBe(false);
      expect(classifier.isAggregatorChannel('B Ray Official')).toBe(false);
      expect(classifier.isAggregatorChannel('Đạt G')).toBe(false);
      expect(classifier.isAggregatorChannel('Vũ.')).toBe(false);
      expect(classifier.isAggregatorChannel('brayofficial')).toBe(false);
    });

    it('đối soát chéo vế trái và tên kênh cá nhân để xác định chiều bài hát', () => {
      const res = classifier.crossCheckWithTitle('B Ray Official', {
        left: 'B Ray',
        right: 'Đúng Như Lời Họ Nói',
      });
      expect(res.matched).toBe(true);
      expect(res.orientation).toBe('left_is_artist');
      expect(res.artistCandidate).toBe('B Ray');
    });

    it('chống đảo vế khi vế phải trùng tên kênh cá nhân', () => {
      const res = classifier.crossCheckWithTitle('Long Cao Official', {
        left: 'Hẹn Ngày Mai Yêu',
        right: 'Long Cao',
      });
      expect(res.matched).toBe(true);
      expect(res.orientation).toBe('right_is_artist');
      expect(res.artistCandidate).toBe('Long Cao');
    });
  });

  describe('Tầng 2: KnownArtistsService & Alias Mapping & Exclusions', () => {
    const service = new KnownArtistsService();

    it('chuẩn hóa các biến thể tên về dạng canonical chuẩn Unicode NFC', () => {
      const res = service.matchArtist('brayofficial');
      expect(res.matched).toBe(true);
      expect(res.canonicalName).toBe('B Ray');
    });

    it('không khớp nhầm chuỗi ngắn < 4 ký tự khi nằm trong từ khác', () => {
      const res = service.matchArtist('vũ điệu hoang dã');
      expect(res.canonicalName).not.toBe('Vũ.');
    });

    it('ưu tiên nghệ sĩ chính trước từ nối feat/ft', () => {
      const res = service.matchArtist('B-RAY ft. YOUNG-H');
      expect(res.matched).toBe(true);
      expect(res.canonicalName).toBe('B Ray');
    });

    it('loại trừ LUÔN toàn bộ alias của nghệ sĩ khi gọi setExcludedArtists (Leave-One-Out sạch)', () => {
      service.setExcludedArtists(['Sơn Tùng M-TP']);
      expect(service.matchArtist('Sơn Tùng M-TP').matched).toBe(false);
      expect(service.matchArtist('M-TP').matched).toBe(false);
      expect(service.matchArtist('sontungmtp').matched).toBe(false);

      service.clearExcludedArtists();
      expect(service.matchArtist('Sơn Tùng M-TP').matched).toBe(true);
      expect(service.matchArtist('M-TP').matched).toBe(true);
    });
  });

  describe('Bảo vệ Ground Truth & Pipeline Versioning', () => {
    it('KHÔNG BAO GIỜ ghi đè các bài hát đã có trong overrides.tracks', () => {
      const currentTrack = {
        id: 'c1a57c38ab9c',
        title: 'Đẹp (Chapter 3)',
        artist: 'Đạt G',
        album: 'Ác Mộng Đẹp',
      };
      const overrides = {
        tracks: {
          c1a57c38ab9c: {
            title: 'Đẹp (Chapter 3)',
            artist: 'Đạt G',
          },
        },
      };
      const resolvedMock: ResolvedEntityResult = {
        title: 'Ác Mộng Đẹp',
        artist: 'Đạt G',
        album: 'Singles',
        confidence: 'high',
        source: 'layer1',
        confidenceReason: 'Test',
        pipelineVersion: '1.5',
      };

      const result = applyEntityResolutionSafely(currentTrack, resolvedMock, overrides);
      expect(result.preservedGroundTruth).toBe(true);
      expect(result.applied).toBe(false);
      expect(result.finalTrack.title).toBe('Đẹp (Chapter 3)');
      expect(result.diffNotice).toBeDefined();
    });

    it('áp dụng kết quả và gắn pipelineVersion: 1.5 cho bài chưa có trong overrides', () => {
      const currentTrack = {
        id: 'new_track_123',
        title: 'Old Title',
        artist: 'Old Artist',
      };
      const overrides = { tracks: {} };
      const resolvedMock: ResolvedEntityResult = {
        title: 'Clean Title',
        artist: 'Clean Artist',
        confidence: 'high',
        source: 'layer1',
        confidenceReason: 'Test',
        pipelineVersion: '1.5',
      };

      const result = applyEntityResolutionSafely(currentTrack, resolvedMock, overrides);
      expect(result.applied).toBe(true);
      expect(result.preservedGroundTruth).toBe(false);
      expect(result.finalTrack.title).toBe('Clean Title');
      expect(result.finalTrack.artist).toBe('Clean Artist');
      expect(result.finalTrack.pipelineVersion).toBe('1.5');
      expect(result.finalTrack.source).toBe('layer1');
    });
  });

  describe('Mutation Testing cho 3 Gate Lỗi Nghiêm Trọng', () => {
    const dataset: EvaluationSample[] = [
      {
        id: 's1',
        rawTitle: 'Nắng Ấm Xa Dần - Sơn Tùng M-TP',
        rawChannel: 'Sơn Tùng M-TP Official',
        expectedTitle: 'Nắng Ấm Xa Dần',
        expectedArtist: 'Sơn Tùng M-TP',
        expectedAlbum: 'm-tp M-TP',
      },
      {
        id: 's2',
        rawTitle: 'Thêm Bao Nhiêu Lâu - Đạt G',
        rawChannel: 'Đạt G Official',
        expectedTitle: 'Thêm Bao Nhiêu Lâu',
        expectedArtist: 'Đạt G',
        expectedAlbum: 'Ác Mộng Đẹp',
      },
    ];

    it('phát hiện chính xác 100% cả 3 loại đột biến lỗi nghiêm trọng', () => {
      const mutationReport = EvaluationHarness.runMutationTest(dataset);
      expect(mutationReport.passed).toBe(true);
      expect(mutationReport.inversionDetectionRate).toBe(100);
      expect(mutationReport.channelAbsorptionDetectionRate).toBe(100);
      expect(mutationReport.albumSplitDetectionRate).toBe(100);
    });
  });

  describe('Đánh giá Group Split 70/30 theo Nghệ Sĩ (Leave-One-Out)', () => {
    const dataset: EvaluationSample[] = [
      {
        id: 'c7083ea9e4be',
        rawTitle: 'B Ray - [UNhiddenGem Mixtape] 2. Đúng Như Lời Họ Nói',
        rawChannel: 'B Ray Official',
        expectedTitle: 'Đúng Như Lời Họ Nói',
        expectedArtist: 'B Ray',
      },
      {
        id: 'b1d223b66897',
        rawTitle: 'DT Tập Rap - MUỐN NÓI VỚI EM (Official MV)',
        rawChannel: 'DT Tập Rap Official',
        expectedTitle: 'Muốn Nói Với Em (feat. Mai Xuân Thứ)',
        expectedArtist: 'DT Tập Rap',
      },
      {
        id: '63cf20ea4eda',
        rawTitle: 'EM TAO HIP HOP - Jombie Ft Lục Lăng',
        rawChannel: 'G5R Squad',
        expectedTitle: 'Em Tao Hip Hop',
        expectedArtist: 'Jombie',
      },
      {
        id: '5bcc93dca7b7',
        rawTitle: 'Côn Đồ Trên Con Đò - DatManiac',
        rawChannel: 'G-Family',
        expectedTitle: 'Côn Đồ Trên Con Đò',
        expectedArtist: 'Datmaniac',
      },
      {
        id: '71940019dab1',
        rawTitle: 'Yêu 5 - Rhymastic',
        rawChannel: 'Rhymastic Official',
        expectedTitle: 'Yêu 5',
        expectedArtist: 'Rhymastic',
      },
      {
        id: '584ad57be684',
        rawTitle: 'Đi Giữa Trời Rực Rỡ - Ngô Lan Hương',
        rawChannel: 'Ngô Lan Hương Official',
        expectedTitle: 'Đi Giữa Trời Rực Rỡ',
        expectedArtist: 'Ngô Lan Hương',
      },
      {
        id: '546f67372a94',
        rawTitle: 'Hẹn Ngày Mai Yêu - Long Cao',
        rawChannel: 'FAPTV',
        expectedTitle: 'Hẹn Ngày Mai Yêu',
        expectedArtist: 'Long Cao',
      },
      {
        id: 'topic-sample',
        rawTitle: 'Buông Đôi Tay Nhau Ra',
        rawChannel: 'Sơn Tùng M-TP - Topic',
        expectedTitle: 'Buông Đôi Tay Nhau Ra',
        expectedArtist: 'Sơn Tùng M-TP',
      },
    ];

    it('chia tập nghệ sĩ tái lập được nhờ PRNG seed 42 cố định', () => {
      const split1 = EvaluationHarness.groupSplitArtists(dataset, 0.3, 42);
      const split2 = EvaluationHarness.groupSplitArtists(dataset, 0.3, 42);
      expect(Array.from(split1.holdoutArtists)).toEqual(Array.from(split2.holdoutArtists));
    });

    it('chạy Leave-One-Out đạt cổng cứng 0 lỗi đảo vế và 0 lỗi nuốt kênh', () => {
      const report = EvaluationHarness.runLeaveOneOut(dataset);
      expect(report.criticalErrors.inverted).toBe(0);
      expect(report.criticalErrors.channelAbsorbed).toBe(0);
      expect(report.seenAccuracy).toBe(100);
      expect(report.layerContribution.layer0).toBeGreaterThanOrEqual(1);
    });
  });
});
