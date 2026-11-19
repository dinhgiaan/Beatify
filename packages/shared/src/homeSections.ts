import type { Track, Album } from './schemas';
import type { ListeningRecord } from './stats';
import { normalizeArtistKey } from './stats';
import { getSmartRecommendations } from './recommendation';
import { SKIP_RATIO_THRESHOLD } from './constants';

// ============================================================================
// HẰNG SỐ & CẤU HÌNH NGƯỠNG CHUNG
// ============================================================================

export const MIN_SECTION_ITEMS = 4;
export const MIN_ALBUM_ITEMS = 3;
export const MAX_SECTION_ITEMS = 15;
export const QUICK_PICKS_MAX_ITEMS = 6;
export const TOP_ARTISTS_MAX_ITEMS = 10;
export const FOR_YOU_FETCH_LIMIT = 20;

export const DAY_MS = 86_400_000;
export const MONTH_MS = 30 * DAY_MS;
export const QUARTER_MS = 90 * DAY_MS;

export const ENERGY_MIN_BPM_TRACKS = 8;
export const HIGH_ENERGY_BPM = 120;
export const LOW_ENERGY_BPM = 95;

// ============================================================================
// ĐỊNH NGHĨA KIỂU DỮ LIỆU
// ============================================================================

export interface BaseHomeSection {
  id: string;
  title: string;
  subtitle?: string;
}

export interface HomeTracksSection extends BaseHomeSection {
  kind: 'tracks';
  layout: 'carousel' | 'grid';
  tracks: Track[];
}

export interface HomeArtistItem {
  artist: string;
  coverUrl?: string;
  trackCount: number;
}

export interface HomeArtistsSection extends BaseHomeSection {
  kind: 'artists';
  artists: HomeArtistItem[];
}

export interface HomeAlbumsSection extends BaseHomeSection {
  kind: 'albums';
  albums: Album[];
}

export type HomeSection = HomeTracksSection | HomeArtistsSection | HomeAlbumsSection;

export interface HomeContext {
  tracks: Track[];
  albums: Album[];
  records: ListeningRecord[];
  favoriteIds: string[];
  recentTrackIds: string[];
  now: number; // Unix epoch ms
  shuffleSalt?: number;
}

export type SectionBuilder = (
  ctx: HomeContext,
  usedTrackIds: ReadonlySet<string>
) => HomeSection | null;

export type HomeTimePeriod = 'morning' | 'afternoon' | 'evening' | 'night';

// ============================================================================
// TIỆN ÍCH NGẪU NHIÊN CÓ SEED (MULBERRY32 PRNG)
// ============================================================================

/**
 * Trình sinh số ngẫu nhiên giả lập (PRNG) Mulberry32 xác định theo seed.
 */
export function createMulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Xáo trộn mảng bằng Fisher-Yates kết hợp seed ngẫu nhiên xác định.
 * Không làm biến đổi mảng đầu vào.
 */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const arr = [...items];
  const rng = createMulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = arr[i];
    const target = arr[j];
    if (temp !== undefined && target !== undefined) {
      arr[i] = target;
      arr[j] = temp;
    }
  }
  return arr;
}

/**
 * Lấy seed ngẫu nhiên xác định theo ngày kết hợp muối xáo trộn (shuffleSalt).
 */
export function getDaySeed(nowOrCtx: number | HomeContext, salt = 0): number {
  if (typeof nowOrCtx === 'number') {
    return Math.floor(nowOrCtx / DAY_MS) + salt;
  }
  return Math.floor(nowOrCtx.now / DAY_MS) + (nowOrCtx.shuffleSalt ?? 0) + salt;
}

/**
 * Xác định khung giờ theo quy tắc:
 * - Sáng (morning): 05:00 - 10:59
 * - Chiều (afternoon): 11:00 - 16:59
 * - Tối (evening): 17:00 - 21:59
 * - Đêm (night): 22:00 - 04:59
 */
export function getHomeTimePeriod(now: number): HomeTimePeriod {
  const hour = new Date(now).getHours();
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/**
 * Kiểm tra bản ghi nghe có bị coi là skip (bỏ qua sớm) không.
 * Nghe dưới 25% thời lượng được xem là skip.
 */
export function isRecordSkipped(record: ListeningRecord): boolean {
  if (record.durationSec > 0) {
    return (record.listenedSec / record.durationSec) < SKIP_RATIO_THRESHOLD;
  }
  return false;
}

// ============================================================================
// BỘ NHỚ ĐỆM TỐI ƯU HIỆU NĂNG (INDEXING & MEMOIZATION)
// ============================================================================

const artistKeyCache = new Map<string, string>();

/**
 * Chuẩn hóa khóa nghệ sĩ kèm bộ nhớ đệm (tránh chạy NFC normalize hàng vạn lần)
 */
export function getNormalizedArtistKey(artist: string): string {
  if (!artist) return '';
  let key = artistKeyCache.get(artist);
  if (key === undefined) {
    key = normalizeArtistKey(artist);
    artistKeyCache.set(artist, key);
  }
  return key;
}

const trackMapCache = new WeakMap<Track[], Map<string, Track>>();

/**
 * Lấy Map tra cứu bài hát theo ID với WeakMap cache
 */
export function getTrackMap(tracks: Track[]): Map<string, Track> {
  let map = trackMapCache.get(tracks);
  if (!map) {
    map = new Map<string, Track>();
    for (const t of tracks) {
      map.set(t.id, t);
    }
    trackMapCache.set(tracks, map);
  }
  return map;
}

interface RecordIndex {
  validPlayCounts: Map<string, number>;
  overallPlayCounts: Map<string, number>;
  monthPlayCounts: Map<string, number>;
  lastPlayedMap: Map<string, number>;
  trackLastPlayedQuarterMap: Map<string, number>; // trackId -> max timestamp (90d, unskipped, <= now)
  listenedTrackIdsAll: Set<string>;
  periodCounts: Map<HomeTimePeriod, Map<string, number>>;
  artistPlaysQuarter: Map<
    string,
    {
      displayArtist: string;
      playCount: number;
      trackPlays: Map<string, number>;
    }
  >;
  genrePlaysQuarter: Map<string, number>; // key lowercase!
  genreDisplayMap: Map<
    string,
    { display: string; maxCount: number; variants: Map<string, number> }
  >;
  artistCountsAll: Map<string, number>;
  genreCountsAll: Map<string, number>;
}

const recordIndexCache = new WeakMap<ListeningRecord[], { now: number; index: RecordIndex }>();

/**
 * Duyệt 1 vòng duy nhất (single pass) qua mảng records để tổng hợp chỉ mục cho tất cả các builder.
 */
function getRecordIndex(ctx: HomeContext): RecordIndex {
  const cached = recordIndexCache.get(ctx.records);
  if (cached && cached.now === ctx.now) {
    return cached.index;
  }

  const now = ctx.now;
  const monthAgo = now - MONTH_MS;
  const quarterAgo = now - QUARTER_MS;

  // Tiền xử lý thể loại của bài hát một lần duy nhất (tránh trim & toLowerCase hàng vạn lần trong vòng lặp)
  const trackGenreMap = new Map<string, { rawGenre: string; gKey: string }>();
  for (let i = 0; i < ctx.tracks.length; i++) {
    const tr = ctx.tracks[i];
    if (tr && tr.genre) {
      const rawGenre = tr.genre.trim();
      if (rawGenre) {
        trackGenreMap.set(tr.id, { rawGenre, gKey: rawGenre.toLowerCase() });
      }
    }
  }

  const validPlayCounts = new Map<string, number>();
  const overallPlayCounts = new Map<string, number>();
  const monthPlayCounts = new Map<string, number>();
  const lastPlayedMap = new Map<string, number>();
  const trackLastPlayedQuarterMap = new Map<string, number>();
  const listenedTrackIdsAll = new Set<string>();

  const morningCounts = new Map<string, number>();
  const afternoonCounts = new Map<string, number>();
  const eveningCounts = new Map<string, number>();
  const nightCounts = new Map<string, number>();

  const periodCounts = new Map<HomeTimePeriod, Map<string, number>>([
    ['morning', morningCounts],
    ['afternoon', afternoonCounts],
    ['evening', eveningCounts],
    ['night', nightCounts],
  ]);

  const artistPlaysQuarter = new Map<
    string,
    {
      displayArtist: string;
      playCount: number;
      trackPlays: Map<string, number>;
    }
  >();
  const genrePlaysQuarter = new Map<string, number>();
  const genreDisplayMap = new Map<
    string,
    { display: string; maxCount: number; variants: Map<string, number> }
  >();
  const artistCountsAll = new Map<string, number>();
  const genreCountsAll = new Map<string, number>();

  for (let i = 0; i < ctx.records.length; i++) {
    const r = ctx.records[i];
    if (!r) continue;

    // Bỏ qua bản ghi trong tương lai
    if (r.timestamp > now) continue;

    const tId = r.trackId;
    const isSkipped = isRecordSkipped(r);

    if (tId) {
      listenedTrackIdsAll.add(tId);
      overallPlayCounts.set(tId, (overallPlayCounts.get(tId) ?? 0) + 1);

      const prevTime = lastPlayedMap.get(tId) ?? 0;
      if (r.timestamp > prevTime) {
        lastPlayedMap.set(tId, r.timestamp);
      }

      if (!isSkipped) {
        validPlayCounts.set(tId, (validPlayCounts.get(tId) ?? 0) + 1);

        if (r.timestamp >= quarterAgo) {
          const prevQuarter = trackLastPlayedQuarterMap.get(tId) ?? 0;
          if (r.timestamp > prevQuarter) {
            trackLastPlayedQuarterMap.set(tId, r.timestamp);
          }
        }

        if (r.timestamp >= monthAgo) {
          monthPlayCounts.set(tId, (monthPlayCounts.get(tId) ?? 0) + 1);
        }

        const period = getHomeTimePeriod(r.timestamp);
        const pMap = periodCounts.get(period);
        if (pMap) {
          pMap.set(tId, (pMap.get(tId) ?? 0) + 1);
        }
      }
    }

    if (r.artist) {
      const aKey = getNormalizedArtistKey(r.artist);
      if (aKey) {
        artistCountsAll.set(aKey, (artistCountsAll.get(aKey) ?? 0) + 1);

        if (!isSkipped && r.timestamp >= quarterAgo) {
          let aEntry = artistPlaysQuarter.get(aKey);
          if (!aEntry) {
            aEntry = {
              displayArtist: r.artist.trim(),
              playCount: 0,
              trackPlays: new Map<string, number>(),
            };
            artistPlaysQuarter.set(aKey, aEntry);
          }
          aEntry.playCount += 1;
          if (tId) {
            aEntry.trackPlays.set(tId, (aEntry.trackPlays.get(tId) ?? 0) + 1);
          }
        }
      }
    }

      if (tId) {
        const gInfo = trackGenreMap.get(tId);
        if (gInfo) {
          const { rawGenre, gKey } = gInfo;
          genreCountsAll.set(gKey, (genreCountsAll.get(gKey) ?? 0) + 1);

              let gDisplay = genreDisplayMap.get(gKey);
              if (!gDisplay) {
                const variants = new Map<string, number>([[rawGenre, 1]]);
                gDisplay = {
                  display: rawGenre,
                  maxCount: 1,
                  variants,
                };
                genreDisplayMap.set(gKey, gDisplay);
              } else {
                const count = (gDisplay.variants.get(rawGenre) ?? 0) + 1;
                gDisplay.variants.set(rawGenre, count);
                if (count > gDisplay.maxCount) {
                  gDisplay.maxCount = count;
                  gDisplay.display = rawGenre;
                }
              }

              if (!isSkipped && r.timestamp >= quarterAgo) {
                genrePlaysQuarter.set(gKey, (genrePlaysQuarter.get(gKey) ?? 0) + 1);
              }
            }
          }
        }

        const index: RecordIndex = {
          validPlayCounts,
          overallPlayCounts,
          monthPlayCounts,
          lastPlayedMap,
          trackLastPlayedQuarterMap,
          listenedTrackIdsAll,
          periodCounts,
          artistPlaysQuarter,
          genrePlaysQuarter,
          genreDisplayMap,
          artistCountsAll,
          genreCountsAll,
        };

        recordIndexCache.set(ctx.records, { now, index });
        return index;
      }

      // ============================================================================
      // CÁC BUILDER CHO TỪNG SECTION
      // ============================================================================

      /**
       * 1. Quick Picks (layout 'grid', 6 bài)
       * Trộn bài yêu thích nghe nhiều + bài nghe gần đây.
       * Section này không chiếm bài trong `usedTrackIds`.
       */
      export const buildQuickPicks: SectionBuilder = (ctx) => {
        const trackMap = getTrackMap(ctx.tracks);
        const index = getRecordIndex(ctx);
        const playCounts = index.validPlayCounts;

        // 1. Danh sách bài yêu thích sắp xếp theo số lượt nghe giảm dần
        const favTracks: Track[] = [];
        for (const id of ctx.favoriteIds) {
          const t = trackMap.get(id);
          if (t) favTracks.push(t);
        }
        favTracks.sort((a, b) => (playCounts.get(b.id) ?? 0) - (playCounts.get(a.id) ?? 0));

        // 2. Danh sách bài nghe nhiều nhất từ toàn bộ thư viện
        const sortedAll = [...ctx.tracks].sort(
          (a, b) => (playCounts.get(b.id) ?? 0) - (playCounts.get(a.id) ?? 0)
        );

        // 3. Danh sách bài nghe gần đây (lấp chỗ trống còn thiếu)
        const recentTracks: Track[] = [];
        for (const id of ctx.recentTrackIds) {
          const t = trackMap.get(id);
          if (t) recentTracks.push(t);
        }

        // D3: Tập hợp ứng viên: Ưu tiên yêu thích nghe nhiều -> most played -> recent lấp chỗ
        const candidateList: Track[] = [];
        const seenIds = new Set<string>();

            for (const t of favTracks) {
              if (!seenIds.has(t.id)) {
                seenIds.add(t.id);
                candidateList.push(t);
              }
              }
              for (const t of sortedAll) {
                if (!seenIds.has(t.id)) {
                  seenIds.add(t.id);
                  candidateList.push(t);
                }
              }
                  for (const t of recentTracks) {
                    if (!seenIds.has(t.id)) {
                      seenIds.add(t.id);
                      candidateList.push(t);
                    }
                  }

                  if (candidateList.length < MIN_SECTION_ITEMS) {
                    return null;
                  }

                  let selected: Track[];
                  if (ctx.shuffleSalt && ctx.shuffleSalt > 0) {
                    // F1: Chọn ngẫu nhiên có seed 6 bài từ top 20 ứng viên khi shuffleSalt > 0
                    const top20 = candidateList.slice(0, 20);
                    const shuffled = seededShuffle(top20, getDaySeed(ctx, 111));
                    selected = shuffled.slice(0, QUICK_PICKS_MAX_ITEMS);
                  } else {
                    selected = candidateList.slice(0, QUICK_PICKS_MAX_ITEMS);
                  }

                  if (selected.length < MIN_SECTION_ITEMS) {
                    return null;
                  }

                  return {
                    id: 'quick_picks',
                    kind: 'tracks',
                    title: 'Chọn nhanh cho bạn',
                    layout: 'grid',
                    tracks: selected,
                  };
                };

                /**
                 * 2. Tiếp tục nghe (Continue Listening)
                 * Lấy từ recentTrackIds, giữ nguyên thứ tự.
                 */
                export const buildContinueListening: SectionBuilder = (ctx, usedTrackIds) => {
                  const trackMap = getTrackMap(ctx.tracks);
                  const selected: Track[] = [];
                  const seenIds = new Set<string>();

                  for (const id of ctx.recentTrackIds) {
                    if (usedTrackIds.has(id) || seenIds.has(id)) continue;
                    const t = trackMap.get(id);
                    if (t) {
                      selected.push(t);
                      seenIds.add(id);
                      if (selected.length >= MAX_SECTION_ITEMS) break;
                    }
                  }

                  if (selected.length < MIN_SECTION_ITEMS) {
                    return null;
                  }

                  return {
                    id: 'continue_listening',
                    kind: 'tracks',
                    title: 'Tiếp tục nghe',
                    layout: 'carousel',
                    tracks: selected,
                  };
                };

                /**
                 * 3. Nghe nhiều tháng này (Most Played Month)
                 * Records 30 ngày gần nhất, bỏ bản ghi skip (listenedSec/durationSec < 0.25), sắp theo số lượt.
                 */
                export const buildMostPlayedMonth: SectionBuilder = (ctx, usedTrackIds) => {
                  const index = getRecordIndex(ctx);
                  const monthCounts = index.monthPlayCounts;

                  const candidates: Array<{ track: Track; count: number }> = [];
                  for (const t of ctx.tracks) {
                    if (usedTrackIds.has(t.id)) continue;
                    const count = monthCounts.get(t.id) ?? 0;
                    if (count > 0) {
                      candidates.push({ track: t, count });
                    }
                  }

                  if (candidates.length < MIN_SECTION_ITEMS) {
                    return null;
                  }

                  candidates.sort((a, b) => b.count - a.count);
                  const selected = candidates.slice(0, MAX_SECTION_ITEMS).map((c) => c.track);

                  return {
                    id: 'most_played_month',
                    kind: 'tracks',
                    title: 'Nghe nhiều tháng này',
                    layout: 'carousel',
                    tracks: selected,
                  };
                };

                /**
                 * 4. Khung giờ trong ngày (Time of Day)
                 * Sáng 5-11, chiều 11-17, tối 17-22, đêm còn lại.
                 * Đếm lượt nghe không bị skip trong cùng khung giờ với ctx.now.
                 */
                export const buildTimeOfDay: SectionBuilder = (ctx, usedTrackIds) => {
                  const currentPeriod = getHomeTimePeriod(ctx.now);
                  const index = getRecordIndex(ctx);
                  const timeOfDayCounts = index.periodCounts.get(currentPeriod);

                  if (!timeOfDayCounts) return null;

                  const candidates: Array<{ track: Track; count: number }> = [];
                  for (const t of ctx.tracks) {
                    if (usedTrackIds.has(t.id)) continue;
                    const count = timeOfDayCounts.get(t.id) ?? 0;
                    if (count > 0) {
                      candidates.push({ track: t, count });
                    }
                  }

                  if (candidates.length < MIN_SECTION_ITEMS) {
                    return null;
                  }

                  candidates.sort((a, b) => b.count - a.count);

                  let selected: Track[];
                  if (ctx.shuffleSalt && ctx.shuffleSalt > 0) {
                    // F1: Chọn ngẫu nhiên có seed 15 bài từ top 30 ứng viên khi shuffleSalt > 0
                    const top30 = candidates.slice(0, 30);
                    const shuffled = seededShuffle(top30, getDaySeed(ctx, 222));
                    selected = shuffled.slice(0, MAX_SECTION_ITEMS).map((c) => c.track);
                  } else {
                    selected = candidates.slice(0, MAX_SECTION_ITEMS).map((c) => c.track);
                  }

                  let title = 'Giai điệu buổi sáng';

                  switch (currentPeriod) {
                    case 'morning':
                      title = 'Giai điệu buổi sáng';
                      break;
                    case 'afternoon':
                      title = 'Âm nhạc buổi chiều';
                      break;
                    case 'evening':
                      title = 'Thư giãn buổi tối';
                      break;
                    case 'night':
                      title = 'Lắng đọng đêm muộn';
                      break;
                  }

                  return {
                    id: 'time_of_day',
                    kind: 'tracks',
                    title,
                    layout: 'carousel',
                    tracks: selected,
                  };
                };

                /**
                 * 5. Dành cho bạn (For You)
                 * Tái sử dụng getSmartRecommendations có sẵn (limit 20), không lặp thuật toán.
                 */
                export const buildForYou: SectionBuilder = (ctx, usedTrackIds) => {
                  const isShuffling = Boolean(ctx.shuffleSalt && ctx.shuffleSalt > 0);
                  const recs = getSmartRecommendations(ctx.tracks, ctx.records, ctx.favoriteIds, {
                    limit: isShuffling ? 40 : FOR_YOU_FETCH_LIMIT,
                    now: ctx.now,
                  });

                  const candidateTracks: Track[] = [];
                  for (const item of recs) {
                    if (!usedTrackIds.has(item.track.id)) {
                      candidateTracks.push(item.track);
                    }
                  }

                  if (candidateTracks.length < MIN_SECTION_ITEMS) {
                    return null;
                  }

                  let selected: Track[];
                  if (isShuffling) {
                    // F1: Chọn ngẫu nhiên có seed 15 bài từ top 40 ứng viên khi shuffleSalt > 0
                    const top40 = candidateTracks.slice(0, 40);
                    const shuffled = seededShuffle(top40, getDaySeed(ctx, 333));
                    selected = shuffled.slice(0, MAX_SECTION_ITEMS);
                  } else {
                    selected = candidateTracks.slice(0, MAX_SECTION_ITEMS);
                  }

                  if (selected.length < MIN_SECTION_ITEMS) {
                    return null;
                  }

                  return {
                    id: 'for_you',
                    kind: 'tracks',
                    title: 'Dành cho bạn',
                    layout: 'carousel',
                    tracks: selected,
                  };
                };

                /**
                 * 6. Top Nghệ sĩ (Top Artists - kind 'artists')
                 * Top 10 nghệ sĩ trong 90 ngày, cover lấy từ bài nghe nhiều nhất của nghệ sĩ đó.
                 */
                export const buildTopArtists: SectionBuilder = (ctx) => {
                  const index = getRecordIndex(ctx);
                  const artistMap = index.artistPlaysQuarter;

                  if (artistMap.size === 0) return null;

                  const trackMap = getTrackMap(ctx.tracks);

                  // Gom bài hát thư viện theo nghệ sĩ để đếm trackCount và tìm cover dự phòng
                  const libraryArtistTracks = new Map<string, Track[]>();
                  for (const t of ctx.tracks) {
                    const normKey = getNormalizedArtistKey(t.artist);
                    if (!normKey) continue;
                    const list = libraryArtistTracks.get(normKey) ?? [];
                    list.push(t);
                    libraryArtistTracks.set(normKey, list);
                  }

                  const candidates: HomeArtistItem[] = [];
                  const sortedArtists = Array.from(artistMap.entries()).sort(
                    (a, b) => b[1].playCount - a[1].playCount
                  );

                  for (const [normKey, data] of sortedArtists) {
                    const libTracks = libraryArtistTracks.get(normKey);
                    if (!libTracks || libTracks.length === 0) continue;

                    // Tìm bài có lượt nghe cao nhất của nghệ sĩ để lấy coverUrl
                    let bestCoverUrl: string | undefined;
                    let maxPlays = -1;

                    for (const [tId, plays] of data.trackPlays.entries()) {
                      const matchTrack = trackMap.get(tId);
                      if (matchTrack?.cover && plays > maxPlays) {
                        maxPlays = plays;
                        bestCoverUrl = matchTrack.cover;
                      }
                    }

                    // Nếu bài nghe nhiều nhất chưa có cover, lấy cover từ bất kỳ bài nào của nghệ sĩ
                    if (!bestCoverUrl) {
                      const fallbackTrack = libTracks.find((t) => Boolean(t.cover));
                      bestCoverUrl = fallbackTrack?.cover;
                    }

                    candidates.push({
                      artist: data.displayArtist,
                      coverUrl: bestCoverUrl,
                      trackCount: libTracks.length,
                    });

                    if (candidates.length >= TOP_ARTISTS_MAX_ITEMS) break;
                  }

                  if (candidates.length < MIN_SECTION_ITEMS) {
                    return null;
                  }

                  let finalArtists = candidates;
                  if (ctx.shuffleSalt && ctx.shuffleSalt > 0) {
                    // F1: Giữ top 10 nhưng đổi thứ tự trong nhóm nghệ sĩ ngang điểm số lượt nghe
                    const grouped = new Map<number, HomeArtistItem[]>();
                    for (const item of candidates) {
                      const count = artistMap.get(getNormalizedArtistKey(item.artist))?.playCount ?? 0;
                      const list = grouped.get(count) ?? [];
                      list.push(item);
                      grouped.set(count, list);
                    }
                    const shuffledList: HomeArtistItem[] = [];
                    let gIdx = 0;
                    for (const [, group] of grouped.entries()) {
                      if (group.length > 1) {
                        shuffledList.push(...seededShuffle(group, getDaySeed(ctx, 444 + gIdx)));
                      } else {
                        shuffledList.push(...group);
                      }
                      gIdx++;
                    }
                    finalArtists = shuffledList;
                  }

                  return {
                    id: 'top_artists',
                    kind: 'artists',
                    title: 'Nghệ sĩ nghe nhiều nhất',
                    artists: finalArtists,
                  };
                };

                /**
                 * 7. Tìm lại giai điệu xưa (Rediscover)
                 * Bài đã nghe hoặc yêu thích nhưng > 30 ngày chưa nghe lại.
                 */
                export const buildRediscover: SectionBuilder = (ctx, usedTrackIds) => {
                  const thirtyDaysAgo = ctx.now - MONTH_MS;
                  const index = getRecordIndex(ctx);
                  const lastPlayedMap = index.lastPlayedMap;

                  const favoriteSet = new Set(ctx.favoriteIds);
                  const candidates: Track[] = [];

                  for (const t of ctx.tracks) {
                    if (usedTrackIds.has(t.id)) continue;

                    const lastPlayed = lastPlayedMap.get(t.id);
                    const isFav = favoriteSet.has(t.id);

                    if (lastPlayed !== undefined) {
                      // Đã từng nghe nhưng lần cuối cách đây hơn 30 ngày
                      if (lastPlayed < thirtyDaysAgo) {
                        candidates.push(t);
                      }
                    } else if (isFav) {
                      // Trong danh sách yêu thích nhưng chưa có lượt nghe nào trong 30 ngày
                      candidates.push(t);
                    }
                  }

                  if (candidates.length < MIN_SECTION_ITEMS) {
                    return null;
                  }

                  // Xáo trộn ổn định theo ngày để tạo cảm giác đổi mới mỗi ngày
                  const seed = getDaySeed(ctx);
                  const shuffled = seededShuffle(candidates, seed);

                  return {
                    id: 'rediscover',
                    kind: 'tracks',
                    title: 'Tìm lại giai điệu xưa',
                    layout: 'carousel',
                    tracks: shuffled.slice(0, MAX_SECTION_ITEMS),
                  };
                };

                /**
                 * 8. Album đang nghe dở (Continue Albums - kind 'albums')
                 * - Chỉ xét album có >= 3 bài.
                 * - Chỉ tính lượt nghe không-skip trong 90 ngày gần nhất.
                 * - Điều kiện: đã nghe >= 1 bài và chưa nghe hết.
                 * - Sắp theo lần nghe gần nhất giảm dần (không shuffle).
                 * - Ngưỡng tối thiểu: MIN_ALBUM_ITEMS = 3.
                 */
                export const buildContinueAlbums: SectionBuilder = (ctx) => {
                  const index = getRecordIndex(ctx);
                  const trackQuarterMap = index.trackLastPlayedQuarterMap;

                  if (trackQuarterMap.size === 0) return null;

                  const candidateAlbums: Array<{ album: Album; lastPlayed: number }> = [];

                  for (const album of ctx.albums) {
                    if (!album.trackIds || album.trackIds.length < 3) continue;

                    let listenedCount = 0;
                    let maxAlbumPlayedTimestamp = 0;

                    for (const tId of album.trackIds) {
                      const lastT = trackQuarterMap.get(tId);
                      if (lastT !== undefined) {
                        listenedCount += 1;
                        if (lastT > maxAlbumPlayedTimestamp) {
                          maxAlbumPlayedTimestamp = lastT;
                        }
                      }
                    }

                    // Đã nghe ít nhất 1 bài và chưa nghe hết toàn bộ trong 90 ngày gần nhất
                    if (listenedCount >= 1 && listenedCount < album.trackIds.length) {
                      candidateAlbums.push({
                        album,
                        lastPlayed: maxAlbumPlayedTimestamp,
                      });
                    }
                  }

                  if (candidateAlbums.length < MIN_ALBUM_ITEMS) {
                    return null;
                  }

                  // Sắp theo lần nghe gần nhất giảm dần (không shuffle)
                  candidateAlbums.sort((a, b) => b.lastPlayed - a.lastPlayed);

                  return {
                    id: 'continue_albums',
                    kind: 'albums',
                    title: 'Album đang nghe dở',
                    albums: candidateAlbums.slice(0, MAX_SECTION_ITEMS).map((c) => c.album),
                  };
                };

                /**
                 * 9. Mix Thể loại (Genre Mix)
                 * Genre nghe nhiều nhất trong 90 ngày (chuẩn hóa key lowercase) -> "Mix {genre}" gồm bài thuộc genre đó, ưu tiên bài ít nghe.
                 */
                export const buildGenreMix: SectionBuilder = (ctx, usedTrackIds) => {
                  const index = getRecordIndex(ctx);
                  const genrePlays = index.genrePlaysQuarter;

                  // Danh sách các thể loại có lượt nghe, sắp xếp giảm dần
                  const sortedPlayedGenres = Array.from(genrePlays.entries())
                    .filter(([, plays]) => plays > 0)
                    .sort((a, b) => b[1] - a[1]);

                    const candidateGenres: Array<[string, number]> = [...sortedPlayedGenres];

                    // Fallback nếu chưa đủ thể loại: lấy thêm từ toàn bộ thư viện
                    if (candidateGenres.length < 3) {
                      const libraryGenreCounts = new Map<string, number>();
                      for (const t of ctx.tracks) {
                        if (t.genre && t.genre.trim()) {
                          const rawGenre = t.genre.trim();
                          const gKey = rawGenre.toLowerCase();
                          libraryGenreCounts.set(gKey, (libraryGenreCounts.get(gKey) ?? 0) + 1);

                          if (!index.genreDisplayMap.has(gKey)) {
                            index.genreDisplayMap.set(gKey, {
                              display: rawGenre,
                              maxCount: 1,
                              variants: new Map([[rawGenre, 1]]),
                            });
                          }
                        }
                      }
                          const sortedLibGenres = Array.from(libraryGenreCounts.entries()).sort(
                            (a, b) => b[1] - a[1]
                          );
                          for (const [gKey, count] of sortedLibGenres) {
                            if (!candidateGenres.some(([existing]) => existing === gKey)) {
                              candidateGenres.push([gKey, count]);
                            }
                          }
                        }

                        if (candidateGenres.length === 0) return null;

                        // F1: Xoay vòng qua top 3 genre theo shuffleSalt khi salt > 0
                        let topGenreKey = candidateGenres[0]?.[0] ?? '';
                        if (ctx.shuffleSalt && ctx.shuffleSalt > 0) {
                          const topCount = Math.min(3, candidateGenres.length);
                          const targetIdx = ctx.shuffleSalt % topCount;
                          topGenreKey = candidateGenres[targetIdx]?.[0] ?? topGenreKey;
                        }

                        if (!topGenreKey) return null;

                        const displayGenre = index.genreDisplayMap.get(topGenreKey)?.display ?? topGenreKey;
                        const overallTrackPlays = index.overallPlayCounts;
                        const genreTracks: Array<{ track: Track; plays: number }> = [];

                        for (const t of ctx.tracks) {
                          if (usedTrackIds.has(t.id)) continue;
                          if (t.genre && t.genre.trim().toLowerCase() === topGenreKey) {
                            genreTracks.push({
                              track: t,
                              plays: overallTrackPlays.get(t.id) ?? 0,
                            });
                          }
                        }

                        if (genreTracks.length < MIN_SECTION_ITEMS) {
                          return null;
                        }

                        // Sắp xếp ưu tiên bài ít nghe (plays tăng dần)
                        genreTracks.sort((a, b) => a.plays - b.plays);

                        // Nhóm các bài có cùng số lượt nghe rồi shuffle nhẹ để đa dạng
                        const seed = getDaySeed(ctx);
                        const shuffledCandidates = seededShuffle(
                          genreTracks.slice(0, MAX_SECTION_ITEMS + 5),
                          seed
                        ).sort((a, b) => a.plays - b.plays);

                        const selected = shuffledCandidates.slice(0, MAX_SECTION_ITEMS).map((item) => item.track);

                        return {
                          id: 'genre_mix',
                          kind: 'tracks',
                          title: `Mix ${displayGenre}`,
                          layout: 'carousel',
                          tracks: selected,
                        };
                      };

                      /**
                       * 10. Khám phá (Discover)
                       * Bài chưa có record nào, ưu tiên cùng artist/genre với top của người dùng; thiếu thì fallback sang ngẫu nhiên.
                       */
                      export const buildDiscover: SectionBuilder = (ctx, usedTrackIds) => {
                        const index = getRecordIndex(ctx);
                        const listenedTrackIds = index.listenedTrackIdsAll;
                        const artistCounts = index.artistCountsAll;
                        const genreCounts = index.genreCountsAll;

                        // Top artists và top genres của người dùng
                        const topArtists = new Set(
                          Array.from(artistCounts.entries())
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 5)
                            .map(([k]) => k)
                        );

                        const topGenres = new Set(
                          Array.from(genreCounts.entries())
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 3)
                            .map(([k]) => k)
                        );

                        // Phân loại bài chưa từng nghe
                        const preferredUnheard: Track[] = [];
                        const otherUnheard: Track[] = [];

                        for (const t of ctx.tracks) {
                          if (usedTrackIds.has(t.id) || listenedTrackIds.has(t.id)) continue;

                          const aKey = getNormalizedArtistKey(t.artist);
                          const gKey = t.genre ? t.genre.trim().toLowerCase() : '';

                          if (topArtists.has(aKey) || (gKey && topGenres.has(gKey))) {
                            preferredUnheard.push(t);
                          } else {
                            otherUnheard.push(t);
                          }
                        }

                        const seed = getDaySeed(ctx);
                        const shuffledPreferred = seededShuffle(preferredUnheard, seed);
                        const shuffledOther = seededShuffle(otherUnheard, seed + 1);

                        const combined = [...shuffledPreferred, ...shuffledOther];

                        // Nếu bài chưa nghe vẫn chưa đủ 4: fallback sang ngẫu nhiên các bài còn lại chưa nằm trong usedTrackIds
                        if (combined.length < MIN_SECTION_ITEMS) {
                          const combinedIds = new Set(combined.map((c) => c.id));
                          const fallbackPool: Track[] = [];
                          for (const t of ctx.tracks) {
                            if (!usedTrackIds.has(t.id) && !combinedIds.has(t.id)) {
                              fallbackPool.push(t);
                            }
                          }
                          const shuffledFallback = seededShuffle(fallbackPool, seed + 2);
                          combined.push(...shuffledFallback);
                        }

                        if (combined.length < MIN_SECTION_ITEMS) {
                          return null;
                        }

                        return {
                          id: 'discover',
                          kind: 'tracks',
                          title: 'Khám phá bài hát mới',
                          layout: 'carousel',
                          tracks: combined.slice(0, MAX_SECTION_ITEMS),
                        };
                      };

                      /**
                       * 11. Năng lượng (Energy - bonus)
                       * Chỉ hiện khi >= 8 bài có bpm; "Sôi động" (bpm >= 120) hoặc "Thư giãn" (bpm <= 95) tùy khung giờ.
                       */
                      export const buildEnergy: SectionBuilder = (ctx, usedTrackIds) => {
                        // Kiểm tra điều kiện tiên quyết: có ít nhất 8 bài có trường bpm
                        const tracksWithBpm = ctx.tracks.filter(
                          (t) => typeof t.bpm === 'number' && t.bpm > 0
                        );
                        if (tracksWithBpm.length < ENERGY_MIN_BPM_TRACKS) {
                          return null;
                        }

                        const period = getHomeTimePeriod(ctx.now);
                        // Sáng/chiều ưu tiên sôi động; tối/đêm ưu tiên thư giãn
                        const prefersHighEnergy = period === 'morning' || period === 'afternoon';

                        const highEnergyTracks: Track[] = [];
                        const lowEnergyTracks: Track[] = [];

                        for (const t of ctx.tracks) {
                          if (usedTrackIds.has(t.id) || typeof t.bpm !== 'number') continue;
                          if (t.bpm >= HIGH_ENERGY_BPM) {
                            highEnergyTracks.push(t);
                          } else if (t.bpm <= LOW_ENERGY_BPM) {
                            lowEnergyTracks.push(t);
                          }
                        }

                        let selectedMode: 'high' | 'low';
                        let candidateTracks: Track[];

                        if (prefersHighEnergy) {
                          if (highEnergyTracks.length >= MIN_SECTION_ITEMS) {
                            selectedMode = 'high';
                            candidateTracks = highEnergyTracks;
                          } else if (lowEnergyTracks.length >= MIN_SECTION_ITEMS) {
                            selectedMode = 'low';
                            candidateTracks = lowEnergyTracks;
                          } else {
                            return null;
                          }
                        } else {
                          if (lowEnergyTracks.length >= MIN_SECTION_ITEMS) {
                            selectedMode = 'low';
                            candidateTracks = lowEnergyTracks;
                          } else if (highEnergyTracks.length >= MIN_SECTION_ITEMS) {
                            selectedMode = 'high';
                            candidateTracks = highEnergyTracks;
                          } else {
                            return null;
                          }
                        }

                        const seed = getDaySeed(ctx);
                        const shuffled = seededShuffle(candidateTracks, seed);

                        const title = selectedMode === 'high' ? 'Năng lượng sôi động' : 'Thư giãn êm dịu';

                        return {
                          id: 'energy',
                          kind: 'tracks',
                          title,
                          layout: 'carousel',
                          tracks: shuffled.slice(0, MAX_SECTION_ITEMS),
                        };
                      };

                      // ============================================================================
                      // DANH SÁCH BUILDER MẶC ĐỊNH THEO THỨ TỰ ƯU TIÊN
                      // ============================================================================

                      export const DEFAULT_BUILDERS: SectionBuilder[] = [
                        buildQuickPicks,
                        buildContinueListening,
                        buildMostPlayedMonth,
                        buildTimeOfDay,
                        buildForYou,
                        buildTopArtists,
                        buildRediscover,
                        buildContinueAlbums,
                        buildGenreMix,
                        buildDiscover,
                        buildEnergy,
                      ];

                      // ============================================================================
                      // HÀM DỰNG SECTION CHÍNH
                      // ============================================================================

                      /**
                       * Xây dựng danh sách section cho Trang chủ từ dữ liệu ngữ cảnh (HomeContext).
                       * - Chạy tuần tự qua danh sách builders.
                       * - Bỏ qua các builder trả về null (khi không đủ dữ liệu hoặc < 4 mục).
                       * - Các section 'tracks' tự động thêm track.id vào tập `usedTrackIds` để các section sau không bị lặp bài
                       *   (ngoại lệ: quickPicks không chiếm bài để các section khác vẫn có thể hiển thị).
                       */
                      export function buildHomeSections(
                        ctx: HomeContext,
                        builders: SectionBuilder[] = DEFAULT_BUILDERS
                      ): HomeSection[] {
                        const sections: HomeSection[] = [];
                        const usedTrackIds = new Set<string>();

                        for (const builder of builders) {
                          const section = builder(ctx, usedTrackIds);
                          if (!section) continue;

                          sections.push(section);

                          // Section 'tracks' đã xuất hiện thì add id vào `used` để các section sau không lặp bài (trừ quickPicks không chiếm bài)
                          if (section.kind === 'tracks' && section.id !== 'quick_picks') {
                            for (const t of section.tracks) {
                              usedTrackIds.add(t.id);
                            }
                          }
                        }

                        return sections;
                      }
