export interface ListeningRecord {
  trackId: string;
  title: string;
  artist: string;
  album?: string;
  durationSec: number;
  listenedSec: number;
  timestamp: number; // Unix epoch ms
}

export interface UserProfile {
  displayName: string;
  avatarKey: string;
  avatarEmoji?: string; // Tương thích ngược phiên bản cũ trước migration
  avatarUri?: string; // Đường dẫn ảnh đại diện tuỳ chỉnh (URL hoặc file local)
  joinedDate: string; // YYYY-MM-DD
  bio: string;
}

export interface RankedItem<T> {
  item: T;
  count: number;
  minutes: number;
}

export interface ReplayStats {
  totalMinutes: number;
  totalPlays: number;
  topTracks: Array<{ trackId: string; title: string; artist: string; count: number; minutes: number }>;
  topArtists: Array<{ artist: string; count: number; minutes: number }>;
}

export interface StreetRank {
  title: string;
  level: number;
  badge: string;
  description: string;
}

export interface Milestone {
  id: string;
  title: string;
  desc: string;
  achieved: boolean;
  icon: string;
  achievedAt?: string;
}

export interface FullReplayReport {
  profile: UserProfile;
  week: ReplayStats;
  month: ReplayStats;
  year: ReplayStats;
  allTime: ReplayStats;
  firstTrackEver: { title: string; artist: string; playedAt: string } | null;
  mostPlayedTrackEver: { title: string; artist: string; count: number } | null;
  milestones: Milestone[];
  streetRank: StreetRank;
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  displayName: 'Người Yêu Nhạc',
  avatarKey: 'headphones',
  avatarEmoji: 'headphones',
  avatarUri: '',
  joinedDate: new Date().toISOString().slice(0, 10),
  bio: 'Bộ sưu tập âm nhạc cá nhân chất lượng cao trên Beatify',
};

/**
 * Tính mốc thời gian bắt đầu của tuần hiện tại (Thứ Hai 00:00:00)
 */
export function getStartOfWeek(now = Date.now()): number {
  const d = new Date(now);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Điều chỉnh nếu rơi vào Chủ Nhật
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Tính mốc thời gian bắt đầu của tháng hiện tại (Ngày 1 00:00:00)
 */
export function getStartOfMonth(now = Date.now()): number {
  const d = new Date(now);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Tính mốc thời gian bắt đầu của năm hiện tại (1 Tháng 1 00:00:00)
 */
export function getStartOfYear(now = Date.now()): number {
  const d = new Date(now);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Chuẩn hóa khóa nhận diện nghệ sĩ (Artist Key) để gộp các biến thể gần trùng nhau khi thống kê Replay.
 * Quy trình:
 * 1. Chuẩn hóa Unicode NFC (để đồng nhất các ký tự tổ hợp NFD sang NFC)
 * 2. Chuyển sang chữ thường (toLowerCase)
 * 3. Bỏ toàn bộ khoảng trắng và dấu chấm (loại bỏ khác biệt dạng "Mr.T" vs "Mr T", "Đạt G" vs "ĐạtG")
 *
 * Lưu ý: Giữ nguyên dấu tiếng Việt để bảo đảm tính chính xác, không gộp nhầm các tên khác nghĩa.
 */
export function normalizeArtistKey(artist: string): string {
  if (!artist) return '';
  return artist
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s.]+/g, '');
}

/**
 * Bảng ghi đè thủ công (manual override map) dạng hiển thị của nghệ sĩ khi thống kê Replay.
 * Khóa là normalized artist key.
 * Ban đầu để trống trừ HIEUTHUHAI theo yêu cầu của người dùng.
 */
export const MANUAL_ARTIST_DISPLAY_OVERRIDES: Record<string, string> = {
  [normalizeArtistKey('HIEUTHUHAI')]: 'HIEUTHUHAI',
};

/**
 * Tính toán thống kê nghe nhạc trong khoảng thời gian xác định
 */
export function computeReplayStats(
  records: ListeningRecord[],
  sinceTimestamp = 0
): ReplayStats {
  const filtered = records.filter((r) => r.timestamp >= sinceTimestamp);

  let totalSec = 0;
  const trackMap = new Map<string, { title: string; artist: string; count: number; sec: number }>();
  
  interface GroupedArtist {
    key: string;
    count: number;
    sec: number;
    variantCounts: Map<string, number>;
    firstSeenVariant: string;
  }
  const artistGroupMap = new Map<string, GroupedArtist>();

  for (const r of filtered) {
    totalSec += r.listenedSec;

    // Tính theo bài hát
    const tEntry = trackMap.get(r.trackId) || {
      title: r.title,
      artist: r.artist,
      count: 0,
      sec: 0,
    };
    tEntry.count += 1;
    tEntry.sec += r.listenedSec;
    trackMap.set(r.trackId, tEntry);

    // Tính theo nghệ sĩ (gộp theo normalized key)
    const rawArtist = (r.artist && r.artist.trim()) ? r.artist.trim() : 'Chưa rõ nghệ sĩ';
    const artKey = normalizeArtistKey(rawArtist) || 'chuaronnghesi';

    let aEntry = artistGroupMap.get(artKey);
    if (!aEntry) {
      aEntry = {
        key: artKey,
        count: 0,
        sec: 0,
        variantCounts: new Map<string, number>(),
        firstSeenVariant: rawArtist,
      };
      artistGroupMap.set(artKey, aEntry);
    }
    aEntry.count += 1;
    aEntry.sec += r.listenedSec;
    aEntry.variantCounts.set(rawArtist, (aEntry.variantCounts.get(rawArtist) || 0) + 1);
  }

  const topTracks = Array.from(trackMap.entries())
    .map(([trackId, val]) => ({
      trackId,
      title: val.title,
      artist: val.artist,
      count: val.count,
      minutes: Math.round(val.sec / 60),
    }))
    .sort((a, b) => b.count - a.count || b.minutes - a.minutes)
    .slice(0, 5);

  const topArtists = Array.from(artistGroupMap.values())
    .map((entry) => {
      // 1. Kiểm tra bảng ghi đè thủ công
      let displayName = MANUAL_ARTIST_DISPLAY_OVERRIDES[entry.key];

      // 2. Nếu không có trong bảng ghi đè: chọn dạng xuất hiện nhiều nhất trong dữ liệu
      if (!displayName) {
        let maxCount = -1;
        displayName = entry.firstSeenVariant;
        for (const [variant, count] of entry.variantCounts.entries()) {
          if (count > maxCount) {
            maxCount = count;
            displayName = variant;
          }
        }
      }

      return {
        artist: displayName,
        count: entry.count,
        minutes: Math.round(entry.sec / 60),
      };
    })
    .sort((a, b) => b.count - a.count || b.minutes - a.minutes)
    .slice(0, 5);

  return {
    totalMinutes: Math.round(totalSec / 60),
    totalPlays: filtered.length,
    topTracks,
    topArtists,
  };
}

export function computeStreetRank(totalPlays: number, totalMinutes: number): StreetRank {
  if (totalPlays >= 500 || totalMinutes >= 3000) {
    return {
      title: 'Hip-hop Legend',
      level: 4,
      badge: '👑',
      description: 'Huyền thoại đường phố tối thượng',
    };
  }
  if (totalPlays >= 200 || totalMinutes >= 1200) {
    return {
      title: 'Underground King',
      level: 3,
      badge: '🔥',
      description: 'Thủ lĩnh giới underground',
    };
  }
  if (totalPlays >= 50 || totalMinutes >= 300) {
    return {
      title: 'Beatmaker',
      level: 2,
      badge: '🎧',
      description: 'Nhà sản xuất âm hưởng tài hoa',
    };
  }
  return {
    title: 'Rookie Rhymer',
    level: 1,
    badge: '🎤',
    description: 'Tân binh khởi đầu hành trình',
  };
}

/**
 * Tính các cột mốc kỷ niệm & thành tựu
 */
export function calculateMilestones(records: ListeningRecord[]): Milestone[] {
  const totalPlays = records.length;
  const totalMinutes = Math.round(
    records.reduce((acc, r) => acc + r.listenedSec, 0) / 60
  );

  return [
    {
      id: 'first_song',
      title: 'Drop the Needle',
      desc: 'Thả kim đĩa than — Phát bài hát đầu tiên trên Beatify',
      achieved: totalPlays >= 1,
      icon: '🎵',
    },
    {
      id: 'night_owl',
      title: 'Midnight Cypher',
      desc: 'Cháy cùng âm nhạc lúc nửa đêm (0h - 5h sáng)',
      achieved: records.some((r) => {
        const hour = new Date(r.timestamp).getHours();
        return hour >= 0 && hour < 5;
      }),
      icon: '🌙',
    },
    {
      id: 'plays_50',
      title: 'Heavy Rotation',
      desc: 'Phát nhạc không ngừng — Đạt mốc 50 lượt nghe',
      achieved: totalPlays >= 50,
      icon: '⭐',
    },
    {
      id: 'minutes_300',
      title: 'Flow State',
      desc: 'Hòa mình vào dòng chảy nhịp điệu hơn 300 phút',
      achieved: totalMinutes >= 300,
      icon: '⏱️',
    },
    {
      id: 'plays_200',
      title: 'Boom Bap Master',
      desc: 'Bậc thầy cảm thụ âm nhạc — Đạt mốc 200 lượt nghe',
      achieved: totalPlays >= 200,
      icon: '🏆',
    },
    {
      id: 'hours_20',
      title: 'Crate Digger',
      desc: 'Thợ săn đĩa cổ thụ — Dành hơn 20 giờ (1.200 phút) nghe nhạc',
      achieved: totalMinutes >= 1200,
      icon: '🌟',
    },
  ];
}

/**
 * Tạo báo cáo tổng quan toàn bộ (Replay report: Tuần, Tháng, Năm, Kỷ niệm)
 */
export function computeFullReplay(
  records: ListeningRecord[],
  profile = DEFAULT_USER_PROFILE,
  now = Date.now()
): FullReplayReport {
  const weekStart = getStartOfWeek(now);
  const monthStart = getStartOfMonth(now);
  const yearStart = getStartOfYear(now);

  const week = computeReplayStats(records, weekStart);
  const month = computeReplayStats(records, monthStart);
  const year = computeReplayStats(records, yearStart);
  const allTime = computeReplayStats(records, 0);

  // Bài đầu tiên từng nghe
  let firstTrackEver: { title: string; artist: string; playedAt: string } | null = null;
  if (records.length > 0) {
    const sortedByTime = [...records].sort((a, b) => a.timestamp - b.timestamp);
    const first = sortedByTime[0];
    if (first) {
      firstTrackEver = {
        title: first.title,
        artist: first.artist,
        playedAt: new Date(first.timestamp).toLocaleDateString('vi-VN'),
      };
    }
  }

  // Bài nghe nhiều nhất từ trước tới nay
  let mostPlayedTrackEver: { title: string; artist: string; count: number } | null = null;
  if (allTime.topTracks.length > 0) {
    const top = allTime.topTracks[0];
    if (top) {
      mostPlayedTrackEver = {
        title: top.title,
        artist: top.artist,
        count: top.count,
      };
    }
  }

  const milestones = calculateMilestones(records);
  const streetRank = computeStreetRank(allTime.totalPlays, allTime.totalMinutes);

  return {
    profile,
    week,
    month,
    year,
    allTime,
    firstTrackEver,
    mostPlayedTrackEver,
    milestones,
    streetRank,
  };
}
