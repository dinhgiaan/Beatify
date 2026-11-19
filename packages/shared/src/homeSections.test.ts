import { describe, it, expect } from 'vitest';
import {
  buildHomeSections,
  buildContinueListening,
  buildMostPlayedMonth,
  buildTimeOfDay,
  buildRediscover,
  buildContinueAlbums,
  buildGenreMix,
  buildEnergy,
  seededShuffle,
  getDaySeed,
  getHomeTimePeriod,
  isRecordSkipped,
  DAY_MS,
  MIN_ALBUM_ITEMS,
  type HomeContext,
} from './homeSections';
import type { Track, Album } from './schemas';
import type { ListeningRecord } from './stats';

declare const console: { log: (...args: unknown[]) => void };

function createMockTrack(id: string, title: string, artist: string, options: Partial<Track> = {}): Track {
  return {
    id,
    title,
    artist,
    duration: 200,
    file: `music/${id}.mp3`,
    storage: 'r2',
    ...options,
  };
}

describe('homeSections logic & builders', () => {
  // Cố định thời điểm test: 09:30 sáng ngày 19/11/2026 (local time)
  const FIXED_DATE = new Date(2026, 10, 19, 9, 30, 0);
  const FIXED_NOW = FIXED_DATE.getTime();

  // Tạo bộ 20 bài hát mẫu
  const mockTracks: Track[] = Array.from({ length: 20 }, (_, i) =>
    createMockTrack(`track-${i + 1}`, `Song ${i + 1}`, `Artist ${((i % 4) + 1)}`, {
      genre: i % 2 === 0 ? 'Hip-Hop' : 'R&B',
      bpm: 80 + i * 5, // Trải từ 80 đến 175
      albumId: `album-${Math.floor(i / 4) + 1}`,
      cover: `covers/cover-${i + 1}.jpg`,
    })
  );

  const mockAlbums: Album[] = [
    { id: 'album-1', title: 'Album 1', artist: 'Artist 1', trackIds: ['track-1', 'track-2', 'track-3', 'track-4'] },
    { id: 'album-2', title: 'Album 2', artist: 'Artist 2', trackIds: ['track-5', 'track-6', 'track-7', 'track-8'] },
    { id: 'album-3', title: 'Album 3', artist: 'Artist 3', trackIds: ['track-9', 'track-10', 'track-11', 'track-12'] },
    { id: 'album-4', title: 'Album 4', artist: 'Artist 4', trackIds: ['track-13', 'track-14', 'track-15', 'track-16'] },
  ];

  describe('tiện ích ngẫu nhiên & phân loại', () => {
    it('seededShuffle cho kết quả ổn định và hoán vị toàn bộ mảng', () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const seed = 12345;
      const res1 = seededShuffle(items, seed);
      const res2 = seededShuffle(items, seed);

      expect(res1).toEqual(res2);
      expect(res1.length).toBe(items.length);
      expect(new Set(res1)).toEqual(new Set(items));
    });

    it('getDaySeed tạo seed cố định trong cùng ngày và khác nhau giữa các ngày', () => {
      const seed1 = getDaySeed(FIXED_NOW);
      const seed2 = getDaySeed(FIXED_NOW + 1000 * 60 * 60 * 3); // Cùng ngày (cách 3 tiếng)
      const seed3 = getDaySeed(FIXED_NOW + DAY_MS); // Hôm sau

      expect(seed1).toBe(seed2);
      expect(seed1).not.toBe(seed3);
    });

    it('getHomeTimePeriod phân loại chính xác khung giờ 5-11-17-22', () => {
      expect(getHomeTimePeriod(new Date(2026, 10, 19, 6, 0).getTime())).toBe('morning');
      expect(getHomeTimePeriod(new Date(2026, 10, 19, 10, 59).getTime())).toBe('morning');
      expect(getHomeTimePeriod(new Date(2026, 10, 19, 11, 0).getTime())).toBe('afternoon');
      expect(getHomeTimePeriod(new Date(2026, 10, 19, 16, 59).getTime())).toBe('afternoon');
      expect(getHomeTimePeriod(new Date(2026, 10, 19, 17, 0).getTime())).toBe('evening');
      expect(getHomeTimePeriod(new Date(2026, 10, 19, 21, 59).getTime())).toBe('evening');
      expect(getHomeTimePeriod(new Date(2026, 10, 19, 22, 0).getTime())).toBe('night');
      expect(getHomeTimePeriod(new Date(2026, 10, 19, 3, 0).getTime())).toBe('night');
    });

    it('isRecordSkipped nhận diện skip khi listenedSec / durationSec < 0.25', () => {
      const skipped: ListeningRecord = {
        trackId: 't1',
        title: 'Title',
        artist: 'Artist',
        durationSec: 200,
        listenedSec: 40, // 40/200 = 0.20 < 0.25
        timestamp: FIXED_NOW,
      };
      const completed: ListeningRecord = {
        trackId: 't1',
        title: 'Title',
        artist: 'Artist',
        durationSec: 200,
        listenedSec: 180, // 180/200 = 0.90 >= 0.25
        timestamp: FIXED_NOW,
      };
      expect(isRecordSkipped(skipped)).toBe(true);
      expect(isRecordSkipped(completed)).toBe(false);
    });
  });

  describe('cold start (records rỗng)', () => {
    it('chỉ tạo các section không phụ thuộc vào lịch sử nghe', () => {
      const ctx: HomeContext = {
        tracks: mockTracks,
        albums: mockAlbums,
        records: [],
        favoriteIds: [],
        recentTrackIds: [],
        now: FIXED_NOW,
      };

      const sections = buildHomeSections(ctx);
      const sectionIds = sections.map((s) => s.id);

      // Các section phụ thuộc vào lịch sử phải vắng mặt
      expect(sectionIds).not.toContain('continue_listening');
      expect(sectionIds).not.toContain('time_of_day');
      expect(sectionIds).not.toContain('most_played_month');
      expect(sectionIds).not.toContain('top_artists');
      expect(sectionIds).not.toContain('continue_albums');

      // Các section hoạt động khi cold start
      expect(sectionIds).toContain('quick_picks');
      expect(sectionIds).toContain('for_you');
      expect(sectionIds).toContain('discover');
    });
  });

    describe('bỏ qua bài skip và bản ghi trong tương lai', () => {
      it('không tính các bản ghi nghe skip vào most_played_month hay time_of_day', () => {
        // 5 bài chỉ có lượt nghe bị skip
        const skippedRecords: ListeningRecord[] = [
          { trackId: 'track-1', title: 'S1', artist: 'A1', durationSec: 200, listenedSec: 20, timestamp: FIXED_NOW - 1000 },
          { trackId: 'track-2', title: 'S2', artist: 'A2', durationSec: 200, listenedSec: 20, timestamp: FIXED_NOW - 2000 },
          { trackId: 'track-3', title: 'S3', artist: 'A3', durationSec: 200, listenedSec: 20, timestamp: FIXED_NOW - 3000 },
          { trackId: 'track-4', title: 'S4', artist: 'A4', durationSec: 200, listenedSec: 20, timestamp: FIXED_NOW - 4000 },
          { trackId: 'track-5', title: 'S5', artist: 'A1', durationSec: 200, listenedSec: 20, timestamp: FIXED_NOW - 5000 },
        ];

        const ctx: HomeContext = {
          tracks: mockTracks,
          albums: mockAlbums,
          records: skippedRecords,
          favoriteIds: [],
          recentTrackIds: [],
          now: FIXED_NOW,
        };

        const mostPlayedSection = buildMostPlayedMonth(ctx, new Set());
        expect(mostPlayedSection).toBeNull();

        const timeOfDaySection = buildTimeOfDay(ctx, new Set());
        expect(timeOfDaySection).toBeNull();
      });

      it('record có timestamp > now bị bỏ qua hoàn toàn', () => {
        const futureRecords: ListeningRecord[] = [
          { trackId: 'track-1', title: 'S1', artist: 'A1', durationSec: 200, listenedSec: 190, timestamp: FIXED_NOW + 10_000 },
          { trackId: 'track-2', title: 'S2', artist: 'A2', durationSec: 200, listenedSec: 190, timestamp: FIXED_NOW + 20_000 },
          { trackId: 'track-3', title: 'S3', artist: 'A3', durationSec: 200, listenedSec: 190, timestamp: FIXED_NOW + 30_000 },
          { trackId: 'track-4', title: 'S4', artist: 'A4', durationSec: 200, listenedSec: 190, timestamp: FIXED_NOW + 40_000 },
        ];

        const ctx: HomeContext = {
          tracks: mockTracks,
          albums: mockAlbums,
          records: futureRecords,
          favoriteIds: [],
          recentTrackIds: [],
          now: FIXED_NOW,
        };

        const mostPlayedSection = buildMostPlayedMonth(ctx, new Set());
        expect(mostPlayedSection).toBeNull();
      });
    });

      describe('khử trùng lặp (usedTrackIds) & ưu tiên section thực tế', () => {
        it('các section tracks tiếp sau không chứa bài hát đã xuất hiện trước đó, ngoại trừ quickPicks', () => {
          // Tạo lịch sử nghe hợp lệ cho 10 bài
          const validRecords: ListeningRecord[] = Array.from({ length: 10 }, (_, i) => ({
            trackId: `track-${i + 1}`,
            title: `Song ${i + 1}`,
            artist: `Artist ${((i % 4) + 1)}`,
            durationSec: 200,
            listenedSec: 190,
            timestamp: FIXED_NOW - i * 1000 * 60,
          }));

          const ctx: HomeContext = {
            tracks: mockTracks,
            albums: mockAlbums,
            records: validRecords,
            favoriteIds: ['track-1', 'track-2'],
            recentTrackIds: ['track-1', 'track-2', 'track-3', 'track-4', 'track-5'],
            now: FIXED_NOW,
          };

          const sections = buildHomeSections(ctx);
          const trackSections = sections.filter((s): s is Extract<typeof s, { kind: 'tracks' }> => s.kind === 'tracks');

          // Tập bài hát đã xuất hiện sau quickPicks
          const seenTrackIds = new Set<string>();

          for (const sec of trackSections) {
            if (sec.id === 'quick_picks') continue; // quickPicks không chiếm bài

            for (const t of sec.tracks) {
              expect(seenTrackIds.has(t.id)).toBe(false);
              seenTrackIds.add(t.id);
            }
          }
        });

        it('most_played_month đứng trước for_you và chứa đúng top bài nghe nhiều nhất mà không bị for_you lấy mất', () => {
          // track-1, track-2, track-3, track-4 nghe nhiều nhất trong tháng qua
          const monthRecords: ListeningRecord[] = [
            ...Array.from({ length: 10 }, () => ({
              trackId: 'track-1',
              title: 'Song 1',
              artist: 'Artist 1',
              durationSec: 200,
              listenedSec: 190,
              timestamp: FIXED_NOW - 1000 * 60 * 60,
            })),
            ...Array.from({ length: 8 }, () => ({
              trackId: 'track-2',
              title: 'Song 2',
              artist: 'Artist 2',
              durationSec: 200,
              listenedSec: 190,
              timestamp: FIXED_NOW - 1000 * 60 * 60,
            })),
            ...Array.from({ length: 6 }, () => ({
              trackId: 'track-3',
              title: 'Song 3',
              artist: 'Artist 3',
              durationSec: 200,
              listenedSec: 190,
              timestamp: FIXED_NOW - 1000 * 60 * 60,
            })),
            ...Array.from({ length: 5 }, () => ({
              trackId: 'track-4',
              title: 'Song 4',
              artist: 'Artist 4',
              durationSec: 200,
              listenedSec: 190,
              timestamp: FIXED_NOW - 1000 * 60 * 60,
            })),
          ];

          const ctx: HomeContext = {
            tracks: mockTracks,
            albums: mockAlbums,
            records: monthRecords,
            favoriteIds: [],
            recentTrackIds: [],
            now: FIXED_NOW,
          };

          const sections = buildHomeSections(ctx);
          const sectionIds = sections.map((s) => s.id);

          // most_played_month phải nằm trước for_you trong mảng sections
          const mostPlayedIdx = sectionIds.indexOf('most_played_month');
          const forYouIdx = sectionIds.indexOf('for_you');
          expect(mostPlayedIdx).toBeGreaterThanOrEqual(0);
          expect(forYouIdx).toBeGreaterThan(mostPlayedIdx);

          const mostPlayedSection = sections[mostPlayedIdx];
          expect(mostPlayedSection?.kind).toBe('tracks');
          if (mostPlayedSection?.kind === 'tracks') {
            const ids = mostPlayedSection.tracks.map((t) => t.id);
            expect(ids).toContain('track-1');
            expect(ids).toContain('track-2');
            expect(ids).toContain('track-3');
            expect(ids).toContain('track-4');
          }

          // for_you không được chứa track-1, track-2, track-3, track-4 vì đã bị chiếm
          const forYouSection = sections[forYouIdx];
          if (forYouSection?.kind === 'tracks') {
            const forYouIds = forYouSection.tracks.map((t) => t.id);
            expect(forYouIds).not.toContain('track-1');
            expect(forYouIds).not.toContain('track-2');
            expect(forYouIds).not.toContain('track-3');
            expect(forYouIds).not.toContain('track-4');
          }
        });
      });

          describe('độ ổn định theo seed (Determinism) & thay đổi theo ngày', () => {
            it('gọi buildHomeSections hai lần với cùng now và object clone (không dính cache WeakMap) cho ra kết quả giống hệt nhau', () => {
              const records: ListeningRecord[] = Array.from({ length: 15 }, (_, i) => ({
                trackId: `track-${i + 1}`,
                title: `Song ${i + 1}`,
                artist: `Artist ${((i % 4) + 1)}`,
                durationSec: 200,
                listenedSec: 180,
                timestamp: FIXED_NOW - i * 1000 * 60 * 60 * 2,
              }));

                // Tạo 2 ctx với mảng tham chiếu khác nhau hoàn toàn (clone)
                const ctx1: HomeContext = {
                  tracks: mockTracks.map((t) => ({ ...t })),
                  albums: mockAlbums.map((a) => ({ ...a })),
                  records: records.map((r) => ({ ...r })),
                  favoriteIds: ['track-1', 'track-3'],
                  recentTrackIds: ['track-1', 'track-2', 'track-3', 'track-4'],
                  now: FIXED_NOW,
                };

                const ctx2: HomeContext = {
                  tracks: mockTracks.map((t) => ({ ...t })),
                  albums: mockAlbums.map((a) => ({ ...a })),
                  records: records.map((r) => ({ ...r })),
                  favoriteIds: ['track-1', 'track-3'],
                  recentTrackIds: ['track-1', 'track-2', 'track-3', 'track-4'],
                  now: FIXED_NOW,
                };

                const run1 = buildHomeSections(ctx1);
                const run2 = buildHomeSections(ctx2);

                expect(run1).toEqual(run2);
              });

            it('cùng dữ liệu, now cách nhau 1 ngày thì thứ tự section có shuffle thay đổi; cùng ngày thì giống hệt', () => {
              const records: ListeningRecord[] = Array.from({ length: 15 }, (_, i) => ({
                trackId: `track-${i + 1}`,
                title: `Song ${i + 1}`,
                artist: `Artist ${((i % 4) + 1)}`,
                durationSec: 200,
                listenedSec: 180,
                timestamp: FIXED_NOW - (35 * DAY_MS) - i * 1000 * 60, // > 30 ngày để vào rediscover
              }));

              const ctxDay1: HomeContext = {
                tracks: mockTracks.map((t) => ({ ...t })),
                albums: mockAlbums.map((a) => ({ ...a })),
                records: records.map((r) => ({ ...r })),
                favoriteIds: [],
                recentTrackIds: [],
                now: FIXED_NOW,
              };

              // Cùng ngày nhưng lệch 2 giờ
              const ctxSameDay: HomeContext = {
                tracks: mockTracks.map((t) => ({ ...t })),
                albums: mockAlbums.map((a) => ({ ...a })),
                records: records.map((r) => ({ ...r })),
                favoriteIds: [],
                recentTrackIds: [],
                now: FIXED_NOW + 1000 * 60 * 60 * 2,
              };

              // Sang ngày hôm sau (lệch 24 giờ)
              const ctxNextDay: HomeContext = {
                tracks: mockTracks.map((t) => ({ ...t })),
                albums: mockAlbums.map((a) => ({ ...a })),
                records: records.map((r) => ({ ...r })),
                favoriteIds: [],
                recentTrackIds: [],
                now: FIXED_NOW + DAY_MS,
              };

              const secDay1 = buildRediscover(ctxDay1, new Set());
              const secSameDay = buildRediscover(ctxSameDay, new Set());
              const secNextDay = buildRediscover(ctxNextDay, new Set());

              expect(secDay1).not.toBeNull();
              expect(secSameDay).not.toBeNull();
              expect(secNextDay).not.toBeNull();

              // Cùng ngày: thứ tự bài hát giống hệt
              expect(secDay1).toEqual(secSameDay);

              // Khác ngày: thứ tự bài hát khác biệt do seed thay đổi
              expect(secDay1).not.toEqual(secNextDay);
            });
          });

          describe('chuẩn hóa thể loại (genre) hoa/thường', () => {
            it('gộp "Hip-Hop" và "hip-hop" thành một và dùng tên hiển thị gốc', () => {
              const customTracks: Track[] = [
                createMockTrack('h1', 'Track H1', 'Artist 1', { genre: 'Hip-Hop' }),
                createMockTrack('h2', 'Track H2', 'Artist 1', { genre: 'hip-hop' }),
                createMockTrack('h3', 'Track H3', 'Artist 2', { genre: 'HIP-HOP' }),
                createMockTrack('h4', 'Track H4', 'Artist 2', { genre: 'Hip-hop' }),
                createMockTrack('p1', 'Track P1', 'Artist 3', { genre: 'Pop' }),
              ];

              const records: ListeningRecord[] = [
                { trackId: 'h1', title: 'Track H1', artist: 'Artist 1', durationSec: 200, listenedSec: 190, timestamp: FIXED_NOW - 1000 },
                { trackId: 'h2', title: 'Track H2', artist: 'Artist 1', durationSec: 200, listenedSec: 190, timestamp: FIXED_NOW - 2000 },
                { trackId: 'h3', title: 'Track H3', artist: 'Artist 2', durationSec: 200, listenedSec: 190, timestamp: FIXED_NOW - 3000 },
                { trackId: 'h4', title: 'Track H4', artist: 'Artist 2', durationSec: 200, listenedSec: 190, timestamp: FIXED_NOW - 4000 },
              ];

              const ctx: HomeContext = {
                tracks: customTracks,
                albums: [],
                records,
                favoriteIds: [],
                recentTrackIds: [],
                now: FIXED_NOW,
              };

              const genreSection = buildGenreMix(ctx, new Set());
              expect(genreSection).not.toBeNull();
              expect(genreSection?.kind).toBe('tracks');
              if (genreSection?.kind === 'tracks') {
                expect(genreSection.title.toLowerCase()).toBe('mix hip-hop');
                expect(genreSection.tracks.length).toBe(4);
              }
            });
          });

          describe('quy tắc buildContinueAlbums', () => {
            it('loại bỏ album dưới 3 bài, loại bỏ lượt nghe > 90 ngày và sắp theo lần nghe gần nhất', () => {
              const testTracks: Track[] = [
                // Album 1 (2 bài): không đủ điều kiện xét (cần >= 3 bài)
                createMockTrack('a1-t1', 'A1 T1', 'Art 1'),
                createMockTrack('a1-t2', 'A1 T2', 'Art 1'),

                // Album 2 (4 bài): nghe 2 bài trong 90 ngày (nghe gần nhất: cách 2 ngày)
                createMockTrack('a2-t1', 'A2 T1', 'Art 2'),
                createMockTrack('a2-t2', 'A2 T2', 'Art 2'),
                createMockTrack('a2-t3', 'A2 T3', 'Art 2'),
                createMockTrack('a2-t4', 'A2 T4', 'Art 2'),

                // Album 3 (4 bài): nghe 1 bài trong 90 ngày (nghe gần nhất: cách 1 ngày - mới nhất!)
                createMockTrack('a3-t1', 'A3 T1', 'Art 3'),
                createMockTrack('a3-t2', 'A3 T2', 'Art 3'),
                createMockTrack('a3-t3', 'A3 T3', 'Art 3'),
                createMockTrack('a3-t4', 'A3 T4', 'Art 3'),

                // Album 4 (3 bài): nghe 1 bài trong 90 ngày (nghe gần nhất: cách 5 ngày)
                createMockTrack('a4-t1', 'A4 T1', 'Art 4'),
                createMockTrack('a4-t2', 'A4 T2', 'Art 4'),
                createMockTrack('a4-t3', 'A4 T3', 'Art 4'),

                // Album 5 (3 bài): nghe từ cách đây 95 ngày (> 90 ngày, bị loại)
                createMockTrack('a5-t1', 'A5 T1', 'Art 5'),
                createMockTrack('a5-t2', 'A5 T2', 'Art 5'),
                createMockTrack('a5-t3', 'A5 T3', 'Art 5'),
              ];

              const testAlbums: Album[] = [
                { id: 'alb-1', title: 'Album 2 Bài', artist: 'Art 1', trackIds: ['a1-t1', 'a1-t2'] },
                { id: 'alb-2', title: 'Album Vừa Phải', artist: 'Art 2', trackIds: ['a2-t1', 'a2-t2', 'a2-t3', 'a2-t4'] },
                { id: 'alb-3', title: 'Album Mới Nhất', artist: 'Art 3', trackIds: ['a3-t1', 'a3-t2', 'a3-t3', 'a3-t4'] },
                { id: 'alb-4', title: 'Album Cũ Hơn', artist: 'Art 4', trackIds: ['a4-t1', 'a4-t2', 'a4-t3'] },
                { id: 'alb-5', title: 'Album Quá Hạn', artist: 'Art 5', trackIds: ['a5-t1', 'a5-t2', 'a5-t3'] },
              ];

              const records: ListeningRecord[] = [
                // alb-1 nghe 1 bài (cách 1 ngày) -> vẫn bị loại vì chỉ có 2 bài
                { trackId: 'a1-t1', title: 'A1 T1', artist: 'Art 1', durationSec: 200, listenedSec: 190, timestamp: FIXED_NOW - DAY_MS },

                // alb-2 nghe cách 2 ngày
                { trackId: 'a2-t1', title: 'A2 T1', artist: 'Art 2', durationSec: 200, listenedSec: 190, timestamp: FIXED_NOW - (2 * DAY_MS) },

                // alb-3 nghe cách 1 ngày (mới nhất)
                { trackId: 'a3-t1', title: 'A3 T1', artist: 'Art 3', durationSec: 200, listenedSec: 190, timestamp: FIXED_NOW - DAY_MS },

                // alb-4 nghe cách 5 ngày
                { trackId: 'a4-t1', title: 'A4 T1', artist: 'Art 4', durationSec: 200, listenedSec: 190, timestamp: FIXED_NOW - (5 * DAY_MS) },

                // alb-5 nghe cách 95 ngày (> 90 ngày)
                { trackId: 'a5-t1', title: 'A5 T1', durationSec: 200, artist: 'Art 5', listenedSec: 190, timestamp: FIXED_NOW - (95 * DAY_MS) },
              ];

              const ctx: HomeContext = {
                tracks: testTracks,
                albums: testAlbums,
                records,
                favoriteIds: [],
                recentTrackIds: [],
                now: FIXED_NOW,
              };

              const result = buildContinueAlbums(ctx, new Set());
              expect(result).not.toBeNull();
              expect(result?.kind).toBe('albums');

              if (result?.kind === 'albums') {
                expect(result.albums.length).toBe(MIN_ALBUM_ITEMS); // Đúng 3 album (alb-3, alb-2, alb-4)
                const albumIds = result.albums.map((a) => a.id);
                expect(albumIds).not.toContain('alb-1'); // Bị loại vì < 3 bài
                expect(albumIds).not.toContain('alb-5'); // Bị loại vì quá 90 ngày

                // Sắp xếp theo lần nghe gần nhất: alb-3 (1 ngày) -> alb-2 (2 ngày) -> alb-4 (5 ngày)
                expect(albumIds).toEqual(['alb-3', 'alb-2', 'alb-4']);
              }
            });
          });

          describe('quy tắc ngưỡng tối thiểu (< 4 mục)', () => {
            it('builder trả về null nếu danh sách ứng viên chỉ có dưới 4 mục', () => {
              // Chỉ có 3 bài gần đây
              const ctx: HomeContext = {
                tracks: mockTracks,
                albums: mockAlbums,
                records: [],
                favoriteIds: [],
                recentTrackIds: ['track-1', 'track-2', 'track-3'],
                now: FIXED_NOW,
              };

              const res = buildContinueListening(ctx, new Set());
              expect(res).toBeNull();
            });
          });

          describe('bảo vệ khi dữ liệu thiếu bpm / genre', () => {
            it('không crash khi tất cả các bài đều không có bpm hoặc genre', () => {
              const rawTracks: Track[] = Array.from({ length: 10 }, (_, i) =>
                createMockTrack(`raw-${i + 1}`, `Raw ${i + 1}`, `Artist ${i + 1}`)
              );

              const ctx: HomeContext = {
                tracks: rawTracks,
                albums: [],
                records: [],
                favoriteIds: [],
                recentTrackIds: [],
                now: FIXED_NOW,
              };

              // buildEnergy phải trả về null vì không có bài nào có bpm
              expect(buildEnergy(ctx, new Set())).toBeNull();

              // buildGenreMix phải trả về null vì không có bài nào có genre
              expect(buildGenreMix(ctx, new Set())).toBeNull();

              // buildHomeSections không crash
              const sections = buildHomeSections(ctx);
              expect(Array.isArray(sections)).toBe(true);
            });
          });

              describe('kiểm thử hiệu năng (10.000 records + ~362 tracks / ~236 albums)', () => {
                it('chạy buildHomeSections dưới 100ms với dữ liệu phân bổ thực tế', () => {
                  // 1. Tạo 362 tracks trải đều trên 236 albums:
                  // - 2 album có 12 bài = 24 bài
                  // - 2 album có 10 bài = 20 bài
                  // - 4 album có 8 bài = 32 bài
                  // - 58 album có 2 bài = 116 bài
                  // - 170 album có 1 bài (singles) = 170 bài
                  // Tổng = 2 + 2 + 4 + 58 + 170 = 236 albums; 24 + 20 + 32 + 116 + 170 = 362 bài.
                  const albumTrackCounts: number[] = [
                    ...Array.from({ length: 2 }, () => 12),
                    ...Array.from({ length: 2 }, () => 10),
                    ...Array.from({ length: 4 }, () => 8),
                    ...Array.from({ length: 58 }, () => 2),
                    ...Array.from({ length: 170 }, () => 1),
                  ];

                  const largeAlbums: Album[] = [];
                  const largeTracks: Track[] = [];

                  let currentTrackIdx = 0;
                  for (let aIdx = 0; aIdx < albumTrackCounts.length; aIdx++) {
                    const count = albumTrackCounts[aIdx] ?? 1;
                    const albumId = `alb-${aIdx}`;
                    const artist = `Artist ${aIdx % 30}`;
                    const trackIds: string[] = [];

                    for (let tOffset = 0; tOffset < count; tOffset++) {
                      const tId = `t-${currentTrackIdx}`;
                      trackIds.push(tId);
                      largeTracks.push(
                        createMockTrack(tId, `Track ${currentTrackIdx}`, artist, {
                          genre: currentTrackIdx % 3 === 0 ? 'Hip-Hop' : currentTrackIdx % 3 === 1 ? 'Pop' : 'R&B',
                          bpm: 70 + (currentTrackIdx % 80),
                          albumId,
                          cover: `covers/cov-${aIdx}.jpg`,
                        })
                      );
                      currentTrackIdx++;
                    }

                    largeAlbums.push({
                      id: albumId,
                      title: `Album ${aIdx}`,
                      artist,
                      trackIds,
                    });
                  }

                  // Khẳng định đúng phân bổ ~362 tracks và ~236 albums
                  expect(largeTracks.length).toBe(362);
                  expect(largeAlbums.length).toBe(236);

                  // 2. Tạo 10.000 records với timestamp trải thực sự trong 90 ngày qua:
                  // timestamp = FIXED_NOW - (i % 90) * DAY_MS - (i % 1440) * 60_000
                  const largeRecords: ListeningRecord[] = Array.from({ length: 10_000 }, (_, i) => {
                    const trackIdx = i % 362;
                    const track = largeTracks[trackIdx];
                    const title = track?.title ?? `Track ${trackIdx}`;
                    const artist = track?.artist ?? `Artist ${trackIdx % 30}`;
                    const album = track?.album;
                    return {
                      trackId: `t-${trackIdx}`,
                      title,
                      artist,
                      album,
                      durationSec: 220,
                      listenedSec: i % 10 === 0 ? 30 : 210, // 10% bài skip (< 25%)
                      timestamp: FIXED_NOW - (i % 90) * DAY_MS - (i % 1440) * 60_000,
                    };
                  });

                  const ctx: HomeContext = {
                    tracks: largeTracks,
                    albums: largeAlbums,
                    records: largeRecords,
                    favoriteIds: Array.from({ length: 30 }, (_, i) => `t-${i * 5}`),
                    recentTrackIds: Array.from({ length: 25 }, (_, i) => `t-${i + 10}`),
                    now: FIXED_NOW,
                  };

                  const start = Date.now();
                  const sections = buildHomeSections(ctx);
                  const elapsedMs = Date.now() - start;

                  // In ra console để ghi nhận thời gian benchmark chính xác
                  console.log(`[Benchmark Thực Tế] buildHomeSections với 10.000 records & 362 tracks / 236 albums: ${elapsedMs} ms`);

                  // Ngưỡng 100ms: tránh flaky trên các máy CPU chậm hoặc khi chạy nhiều worker song song
                  expect(elapsedMs).toBeLessThan(100);
                  expect(sections.length).toBeGreaterThan(0);
                });
              });

              describe('kiểm thử shuffleSalt và xáo trộn ngẫu nhiên', () => {
                it('shuffleSalt = 0 hoặc undefined giữ nguyên thứ tự mặc định', () => {
                  const ctx1: HomeContext = {
                    tracks: mockTracks,
                    albums: mockAlbums,
                    records: [],
                    favoriteIds: ['track-1'],
                    recentTrackIds: ['track-1', 'track-2'],
                    now: FIXED_NOW,
                  };
                  const ctx2: HomeContext = {
                    ...ctx1,
                    shuffleSalt: 0,
                  };

                  const sec1 = buildHomeSections(ctx1);
                  const sec2 = buildHomeSections(ctx2);

                  expect(sec1.map((s) => s.id)).toEqual(sec2.map((s) => s.id));
                  for (let i = 0; i < sec1.length; i++) {
                    const s1 = sec1[i];
                    const s2 = sec2[i];
                    if (s1?.kind === 'tracks' && s2?.kind === 'tracks') {
                      expect(s1.tracks.map((t) => t.id)).toEqual(s2.tracks.map((t) => t.id));
                    }
                  }
                });

                it('cùng context nhưng khác shuffleSalt tạo ra seed khác và thứ tự xáo trộn khác', () => {
                  const ctxSalt0: HomeContext = {
                    tracks: mockTracks,
                    albums: mockAlbums,
                    records: [],
                    favoriteIds: ['track-1'],
                    recentTrackIds: ['track-1', 'track-2'],
                    now: FIXED_NOW,
                    shuffleSalt: 0,
                  };
                  const ctxSalt1: HomeContext = {
                    ...ctxSalt0,
                    shuffleSalt: 42,
                  };

                  expect(getDaySeed(ctxSalt0)).not.toBe(getDaySeed(ctxSalt1));

                  const sec0 = buildHomeSections(ctxSalt0);
                  const sec1 = buildHomeSections(ctxSalt1);

                  // Tìm một section có áp dụng seededShuffle (ví dụ: discover)
                  const discover0 = sec0.find((s) => s.id === 'discover');
                  const discover1 = sec1.find((s) => s.id === 'discover');

                  if (discover0 && discover1 && discover0.kind === 'tracks' && discover1.kind === 'tracks') {
                    // Xác nhận ID danh sách bài hát có thay đổi khi đổi salt
                    const ids0 = discover0.tracks.map((t) => t.id);
                    const ids1 = discover1.tracks.map((t) => t.id);
                    expect(ids0).not.toEqual(ids1);
                  }
                });

                it('F2: salt 0 -> kết quả cũ; salt 1 và 2 -> for_you/time_of_day/quick_picks khác nhau, most_played_month không đổi, không trùng bài', () => {
                  // Tạo danh sách 50 bài và 200 lượt nghe phân bổ để kích hoạt đầy đủ các section
                  const testTracks: Track[] = Array.from({ length: 50 }, (_, i) => ({
                    id: `track-${i + 1}`,
                    title: `Bài hát ${i + 1}`,
                    artist: `Ca sĩ ${(i % 5) + 1}`,
                    album: `Album ${(i % 10) + 1}`,
                    duration: 200,
                    genre: i % 2 === 0 ? 'Pop' : 'Hip-Hop',
                    file: `music/track-${i + 1}.mp3`,
                    storage: 'r2' as const,
                  }));

                  const testAlbums: Album[] = Array.from({ length: 10 }, (_, i) => ({
                    id: `alb-${i + 1}`,
                    title: `Album ${i + 1}`,
                    artist: `Ca sĩ ${(i % 5) + 1}`,
                    trackIds: testTracks.filter((t) => t.album === `Album ${i + 1}`).map((t) => t.id),
                  }));

                  // Tạo lượt nghe nhiều cho các bài đầu để có most_played_month
                  const testRecords: ListeningRecord[] = [];
                  for (let i = 0; i < 40; i++) {
                    const trackId = `track-${(i % 15) + 1}`;
                    testRecords.push({
                      trackId,
                      title: `Bài hát ${(i % 15) + 1}`,
                      artist: `Ca sĩ ${((i % 15) % 5) + 1}`,
                      timestamp: FIXED_NOW - 1000 * 60 * i,
                      durationSec: 200,
                      listenedSec: 190,
                    });
                  }

                  const baseCtx: HomeContext = {
                    tracks: testTracks,
                    albums: testAlbums,
                    records: testRecords,
                    favoriteIds: ['track-1', 'track-2', 'track-3', 'track-4', 'track-5', 'track-6'],
                    recentTrackIds: ['track-1', 'track-2', 'track-7', 'track-8'],
                    now: FIXED_NOW,
                  };

                  const ctxSalt0: HomeContext = { ...baseCtx, shuffleSalt: 0 };
                  const ctxSalt1: HomeContext = { ...baseCtx, shuffleSalt: 1 };
                  const ctxSalt2: HomeContext = { ...baseCtx, shuffleSalt: 2 };

                  const res0 = buildHomeSections(ctxSalt0);
                  const res1 = buildHomeSections(ctxSalt1);
                  const res2 = buildHomeSections(ctxSalt2);

                  // 1. most_played_month KHÔNG đổi giữa salt 0, salt 1 và salt 2
                  const mpm0 = res0.find((s) => s.id === 'most_played_month');
                  const mpm1 = res1.find((s) => s.id === 'most_played_month');
                  const mpm2 = res2.find((s) => s.id === 'most_played_month');
                  if (mpm0 && mpm1 && mpm2 && mpm0.kind === 'tracks' && mpm1.kind === 'tracks' && mpm2.kind === 'tracks') {
                    expect(mpm1.tracks.map((t) => t.id)).toEqual(mpm0.tracks.map((t) => t.id));
                    expect(mpm2.tracks.map((t) => t.id)).toEqual(mpm0.tracks.map((t) => t.id));
                  }

                  // 2. quick_picks hoặc for_you hoặc time_of_day có sự khác biệt giữa salt 1 và salt 2
                  const qp1 = res1.find((s) => s.id === 'quick_picks');
                  const qp2 = res2.find((s) => s.id === 'quick_picks');
                  if (qp1 && qp2 && qp1.kind === 'tracks' && qp2.kind === 'tracks') {
                    const ids1 = qp1.tracks.map((t) => t.id);
                    const ids2 = qp2.tracks.map((t) => t.id);
                    expect(ids1).not.toEqual(ids2);
                  }

                  // 3. Kiểm tra tính độc nhất (deduplication): các section 'tracks' (trừ quick_picks) không trùng bài
                  for (const res of [res1, res2]) {
                    const seen = new Set<string>();
                    for (const s of res) {
                      if (s.kind === 'tracks' && s.id !== 'quick_picks') {
                        for (const t of s.tracks) {
                          expect(seen.has(t.id)).toBe(false);
                          seen.add(t.id);
                        }
                      }
                    }
                  }
                });
              });
            });
