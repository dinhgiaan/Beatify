import type { Track } from './schemas';
import type { ListeningRecord } from './stats';
import { SKIP_RATIO_THRESHOLD } from './constants';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export interface RecommendationReason {
  type: 'time_of_day' | 'top_artist' | 'favorite' | 'completion_rate' | 'discovery' | 'frequent';
  label: string;
}

export interface RecommendedTrack {
  track: Track;
  score: number;
  reason: RecommendationReason;
  timeOfDay: TimeOfDay;
}

export interface RecommendationOptions {
  limit?: number;
  now?: number | Date;
}

/**
 * Xác định khung giờ trong ngày:
 * - Sáng (morning): 05:00 - 11:59
 * - Chiều (afternoon): 12:00 - 17:59
 * - Tối (evening): 18:00 - 22:59
 * - Đêm muộn (night): 23:00 - 04:59
 */
export function getTimeOfDay(date: Date | number = Date.now()): TimeOfDay {
  const d = typeof date === 'number' ? new Date(date) : date;
  const hour = d.getHours();

  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'night';
}

/**
 * Nhãn thông điệp chào ngữ cảnh theo khung giờ
 */
export function getTimeOfDayGreeting(timeOfDay: TimeOfDay): { title: string; subtitle: string } {
  switch (timeOfDay) {
    case 'morning':
      return {
        title: 'Chào buổi sáng',
        subtitle: 'Giai điệu tươi sáng khởi đầu ngày mới',
      };
    case 'afternoon':
      return {
        title: 'Buổi chiều tập trung',
        subtitle: 'Âm nhạc đồng hành cùng công việc và thư giãn',
      };
    case 'evening':
      return {
        title: 'Buổi tối thư giãn',
        subtitle: 'Giai điệu giải trí dành riêng cho bạn',
      };
    case 'night':
    default:
      return {
        title: 'Đêm muộn lắng đọng',
        subtitle: 'Không gian âm nhạc êm dịu và sâu lắng',
      };
  }
}

const artistNormCache = new Map<string, string>();

function getNormArtist(artist: string): string {
  let norm = artistNormCache.get(artist);
  if (norm === undefined) {
    norm = artist.trim().toLowerCase();
    artistNormCache.set(artist, norm);
  }
  return norm;
}

/**
 * Thuật toán đề xuất bài hát thông minh dựa vào thói quen, sở thích và khung giờ
 */
export function getSmartRecommendations(
  allTracks: Track[],
  records: ListeningRecord[] = [],
  favoriteIds: string[] = [],
  options: RecommendationOptions = {}
): RecommendedTrack[] {
  if (!allTracks || allTracks.length === 0) return [];

  const nowEpoch = typeof options.now === 'number'
    ? options.now
    : options.now instanceof Date
      ? options.now.getTime()
      : Date.now();

  const currentTimeOfDay = getTimeOfDay(nowEpoch);
  const limit = options.limit ?? 25;

  // 1. Phân tích dữ liệu lịch sử nghe nhạc
  const trackStatsMap = new Map<string, {
    totalPlays: number;
    totalListenedSec: number;
    completionScore: number;
    timeOfDayPlays: Record<TimeOfDay, number>;
    lastPlayedTimestamp: number;
  }>();

  const artistPlaysMap = new Map<string, number>();

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!r || !r.trackId) continue;

    const rTimeOfDay = getTimeOfDay(r.timestamp);
    let existing = trackStatsMap.get(r.trackId);
    if (!existing) {
      existing = {
        totalPlays: 0,
        totalListenedSec: 0,
        completionScore: 0,
        timeOfDayPlays: { morning: 0, afternoon: 0, evening: 0, night: 0 },
        lastPlayedTimestamp: 0,
      };
      trackStatsMap.set(r.trackId, existing);
    }

    existing.totalPlays += 1;
    existing.totalListenedSec += r.listenedSec || 0;
    existing.timeOfDayPlays[rTimeOfDay] = (existing.timeOfDayPlays[rTimeOfDay] || 0) + 1;
    if (r.timestamp > existing.lastPlayedTimestamp) {
      existing.lastPlayedTimestamp = r.timestamp;
    }

    // Tỷ lệ hoàn thành (completion rate): nghe > 75% thời lượng bài hát được cộng điểm cao
    if (r.durationSec > 0) {
      const ratio = Math.min(1.0, (r.listenedSec || 0) / r.durationSec);
      if (ratio >= 0.75) {
        existing.completionScore += 2;
      } else if (ratio < SKIP_RATIO_THRESHOLD) {
        existing.completionScore -= 1;
      }
    }

    // Thống kê nghệ sĩ nghe nhiều
    if (r.artist) {
      const normArtist = getNormArtist(r.artist);
      artistPlaysMap.set(normArtist, (artistPlaysMap.get(normArtist) || 0) + 1);
    }
  }

  // Top nghệ sĩ nghe nhiều nhất (ít nhất 2 lượt nghe)
  const topArtists = Array.from(artistPlaysMap.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([a]) => a);

  const favoriteSet = new Set(favoriteIds || []);

  // 2. Chấm điểm từng bài hát
  const scoredTracks: RecommendedTrack[] = [];

  for (const track of allTracks) {
    let score = 0;
    let maxReasonScore = 0;
    let bestReason: RecommendationReason = {
      type: 'discovery',
      label: 'Khám phá giai điệu mới',
    };

    const stats = trackStatsMap.get(track.id);
    const isFav = favoriteSet.has(track.id);
    const normTrackArtist = (track.artist || '').trim().toLowerCase();
    const isTopArtist = topArtists.includes(normTrackArtist);

    // Điểm sở thích: Yêu thích (+30đ)
    if (isFav) {
      score += 30;
      if (30 > maxReasonScore) {
        maxReasonScore = 30;
        bestReason = {
          type: 'favorite',
          label: 'Bài hát trong danh sách Yêu thích',
        };
      }
    }

    // Điểm sở thích: Thuộc Top nghệ sĩ nghe nhiều (+22đ)
    if (isTopArtist) {
      score += 22;
      if (22 > maxReasonScore) {
        maxReasonScore = 22;
        bestReason = {
          type: 'top_artist',
          label: `Từ nghệ sĩ bạn yêu thích (${track.artist})`,
        };
      }
    }

    // Điểm khung giờ (Time-of-Day Affinity)
    if (stats) {
      const timePlays = stats.timeOfDayPlays[currentTimeOfDay] || 0;
      if (timePlays > 0) {
        // Người dùng đã từng nghe bài này trong khung giờ hiện tại
        const timeScore = Math.min(35, timePlays * 10);
        score += timeScore;
        if (timeScore > maxReasonScore) {
          maxReasonScore = timeScore;
          bestReason = {
            type: 'time_of_day',
            label: currentTimeOfDay === 'morning'
              ? 'Quen thuộc vào buổi sáng của bạn'
              : currentTimeOfDay === 'afternoon'
                ? 'Hợp với buổi chiều làm việc'
                : currentTimeOfDay === 'evening'
                  ? 'Giai điệu buổi tối yêu thích'
                  : 'Phù hợp với không gian đêm muộn',
          };
        }
      }

      // Điểm tần suất nghe tổng thể
      const freqScore = Math.min(25, Math.round(Math.log2(stats.totalPlays + 1) * 6));
      score += freqScore;
      if (freqScore > maxReasonScore && maxReasonScore === 0) {
        bestReason = {
          type: 'frequent',
          label: 'Giai điệu bạn hay nghe',
        };
      }

      // Điểm độ trọn vẹn (không skip sớm)
      score += Math.max(-15, Math.min(15, stats.completionScore * 3));

      // Điểm Freshness / Tránh lặp lại bài vừa nghe trong vòng 10 phút
      const minutesSinceLastPlay = (nowEpoch - stats.lastPlayedTimestamp) / (1000 * 60);
      if (minutesSinceLastPlay < 10) {
        score -= 20; // Giảm nhẹ để người dùng không bị lặp lại bài vừa bật tức thì
      } else if (minutesSinceLastPlay > 60 * 24 * 3) {
        // Đã lâu chưa nghe lại (trên 3 ngày) -> tăng điểm gợi nhớ
        score += 8;
      }
    } else {
      // Bài hát chưa từng nghe (Discovery):
      // Nếu bài của nghệ sĩ yêu thích -> cộng điểm khám phá (+18đ)
      if (isTopArtist) {
        score += 18;
        bestReason = {
          type: 'discovery',
          label: `Bài hát mới của ${track.artist}`,
        };
      } else {
        // Bài hoàn toàn mới: cộng điểm cơ bản
        score += 5;
      }
    }

    // Heuristics theo đặc trưng âm nhạc và khung giờ:
    // Buổi đêm muộn: ưu tiên bài hát có thời lượng vừa vặn hoặc không quá ồn ào (nếu có ReplayGain âm lượng nhỏ)
    if (currentTimeOfDay === 'night') {
      if (track.replayGain && track.replayGain < -8) {
        // Bài hát có độ lớn cao -> trừ nhẹ vào ban đêm
        score -= 4;
      }
    }

    scoredTracks.push({
      track,
      score,
      reason: bestReason,
      timeOfDay: currentTimeOfDay,
    });
  }

  // 3. Sắp xếp theo điểm số giảm dần
  scoredTracks.sort((a, b) => b.score - a.score);

  return scoredTracks.slice(0, limit);
}
