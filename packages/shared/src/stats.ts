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
  avatarEmoji: string;
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
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  displayName: 'Người Yêu Nhạc',
  avatarEmoji: '🎧',
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
 * Tính toán thống kê nghe nhạc trong khoảng thời gian xác định
 */
export function computeReplayStats(
  records: ListeningRecord[],
  sinceTimestamp = 0
): ReplayStats {
  const filtered = records.filter((r) => r.timestamp >= sinceTimestamp);

  let totalSec = 0;
  const trackMap = new Map<string, { title: string; artist: string; count: number; sec: number }>();
  const artistMap = new Map<string, { count: number; sec: number }>();

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

    // Tính theo nghệ sĩ
    const artKey = r.artist || 'Chưa rõ nghệ sĩ';
    const aEntry = artistMap.get(artKey) || { count: 0, sec: 0 };
    aEntry.count += 1;
    aEntry.sec += r.listenedSec;
    artistMap.set(artKey, aEntry);
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

  const topArtists = Array.from(artistMap.entries())
    .map(([artist, val]) => ({
      artist,
      count: val.count,
      minutes: Math.round(val.sec / 60),
    }))
    .sort((a, b) => b.count - a.count || b.minutes - a.minutes)
    .slice(0, 5);

  return {
    totalMinutes: Math.round(totalSec / 60),
    totalPlays: filtered.length,
    topTracks,
    topArtists,
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
      title: 'Khởi đầu hành trình',
      desc: 'Phát bài hát đầu tiên trên Beatify',
      achieved: totalPlays >= 1,
      icon: '🎵',
    },
    {
      id: 'night_owl',
      title: 'Cú đêm âm nhạc',
      desc: 'Tận hưởng âm nhạc trong khung giờ đêm khuya (0h - 5h sáng)',
      achieved: records.some((r) => {
        const hour = new Date(r.timestamp).getHours();
        return hour >= 0 && hour < 5;
      }),
      icon: '🌙',
    },
    {
      id: 'plays_50',
      title: 'Tâm hồn âm nhạc',
      desc: 'Đạt mốc 50 lượt nghe nhạc',
      achieved: totalPlays >= 50,
      icon: '⭐',
    },
    {
      id: 'minutes_300',
      title: 'Chuyên gia thư giãn',
      desc: 'Dành hơn 300 phút cùng giai điệu',
      achieved: totalMinutes >= 300,
      icon: '⏱️',
    },
    {
      id: 'plays_200',
      title: 'Nhạc sĩ đích thực',
      desc: 'Đạt mốc 200 lượt nghe',
      achieved: totalPlays >= 200,
      icon: '🏆',
    },
    {
      id: 'hours_20',
      title: 'Kỷ niệm khó phai',
      desc: 'Dành hơn 1.200 phút (20 giờ) nghe nhạc',
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

  return {
    profile,
    week,
    month,
    year,
    allTime,
    firstTrackEver,
    mostPlayedTrackEver,
    milestones,
  };
}
