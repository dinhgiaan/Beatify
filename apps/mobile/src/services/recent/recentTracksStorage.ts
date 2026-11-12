import * as FileSystem from 'expo-file-system/legacy';

export interface RecentTracksData {
  limit: number;
  trackIds: string[];
}

export const DEFAULT_RECENT_LIMIT = 30;
export const ALLOWED_RECENT_LIMITS = [10, 20, 30, 40, 50] as const;
export type AllowedRecentLimit = (typeof ALLOWED_RECENT_LIMITS)[number];

const RECENT_FILE = `${FileSystem.documentDirectory || ''}beatify_recent_tracks.json`;

/**
 * Hàm thuần: Ghi nhận bài hát vào danh sách nghe gần đây
 * - Đưa trackId lên vị trí đầu tiên (#0)
 * - Lọc bỏ bài trùng nếu đã có trong danh sách
 * - Giới hạn tối đa theo data.limit
 */
export function addTrackToRecentList(trackId: string, current: RecentTracksData): RecentTracksData {
  const filtered = current.trackIds.filter((id) => id !== trackId);
  const updated = [trackId, ...filtered].slice(0, current.limit);
  return {
    ...current,
    trackIds: updated,
  };
}

/**
 * Hàm thuần: Xóa một bài hát khỏi danh sách nghe gần đây
 */
export function removeTrackFromRecentList(trackId: string, current: RecentTracksData): RecentTracksData {
  return {
    ...current,
    trackIds: current.trackIds.filter((id) => id !== trackId),
  };
}

/**
 * Hàm thuần: Cập nhật giới hạn số lượng bài nghe gần đây
 * - Cắt giảm danh sách nếu số lượng hiện tại vượt quá limit mới
 */
export function updateRecentLimit(newLimit: number, current: RecentTracksData): RecentTracksData {
  const validLimit = Math.max(10, Math.min(50, newLimit));
  return {
    limit: validLimit,
    trackIds: current.trackIds.slice(0, validLimit),
  };
}

/**
 * Đọc danh sách nghe gần đây từ ổ đĩa
 */
export async function loadRecentTracks(): Promise<RecentTracksData> {
  try {
    const info = await FileSystem.getInfoAsync(RECENT_FILE);
    if (!info.exists) {
      return { limit: DEFAULT_RECENT_LIMIT, trackIds: [] };
    }
    const raw = await FileSystem.readAsStringAsync(RECENT_FILE);
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const limit = typeof parsed.limit === 'number' ? parsed.limit : DEFAULT_RECENT_LIMIT;
      const trackIds = Array.isArray(parsed.trackIds) ? parsed.trackIds : [];
      return {
        limit: Math.max(10, Math.min(50, limit)),
        trackIds: trackIds.slice(0, limit),
      };
    }
    return { limit: DEFAULT_RECENT_LIMIT, trackIds: [] };
  } catch (err) {
    console.warn('Lỗi đọc recent tracks từ đĩa:', err);
    return { limit: DEFAULT_RECENT_LIMIT, trackIds: [] };
  }
}

/**
 * Lưu danh sách nghe gần đây vào ổ đĩa an toàn bằng atomic write (.tmp + move)
 */
export async function saveRecentTracks(data: RecentTracksData): Promise<void> {
  try {
    const tmpPath = `${RECENT_FILE}.tmp`;
    await FileSystem.writeAsStringAsync(tmpPath, JSON.stringify(data, null, 2));
    try {
      await FileSystem.moveAsync({ from: tmpPath, to: RECENT_FILE });
    } catch {
      await FileSystem.deleteAsync(RECENT_FILE, { idempotent: true });
      await FileSystem.moveAsync({ from: tmpPath, to: RECENT_FILE });
    }
  } catch (err) {
    console.warn('Lỗi lưu recent tracks vào đĩa:', err);
  }
}
