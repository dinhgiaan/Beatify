import * as FileSystem from 'expo-file-system/legacy';

export interface SearchHistoryData {
  trackIds: string[];
}

export const MAX_SEARCH_HISTORY = 10;
const SEARCH_HISTORY_FILE = `${FileSystem.documentDirectory || ''}beatify_search_history.json`;

/**
 * Hàm thuần: Thêm trackId vào danh sách tìm kiếm gần đây
 * - Đưa trackId lên đầu (#0)
 * - Lọc bỏ trùng lặp
 * - Giới hạn tối đa MAX_SEARCH_HISTORY bài
 */
export function addTrackToSearchHistory(trackId: string, current: SearchHistoryData): SearchHistoryData {
  const filtered = current.trackIds.filter((id) => id !== trackId);
  const updated = [trackId, ...filtered].slice(0, MAX_SEARCH_HISTORY);
  return { trackIds: updated };
}

/**
 * Hàm thuần: Xóa một trackId khỏi lịch sử tìm kiếm
 */
export function removeTrackFromSearchHistory(trackId: string, current: SearchHistoryData): SearchHistoryData {
  return {
    trackIds: current.trackIds.filter((id) => id !== trackId),
  };
}

/**
 * Đọc lịch sử tìm kiếm từ ổ đĩa
 */
export async function loadSearchHistory(): Promise<SearchHistoryData> {
  try {
    const info = await FileSystem.getInfoAsync(SEARCH_HISTORY_FILE);
    if (!info.exists) {
      return { trackIds: [] };
    }
    const raw = await FileSystem.readAsStringAsync(SEARCH_HISTORY_FILE);
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.trackIds)) {
      return {
        trackIds: parsed.trackIds.slice(0, MAX_SEARCH_HISTORY),
      };
    }
    return { trackIds: [] };
  } catch (err) {
    console.warn('Lỗi đọc search history từ đĩa:', err);
    return { trackIds: [] };
  }
}

/**
 * Lưu lịch sử tìm kiếm vào ổ đĩa
 */
export async function saveSearchHistory(data: SearchHistoryData): Promise<void> {
  try {
    const tmpPath = `${SEARCH_HISTORY_FILE}.tmp`;
    await FileSystem.writeAsStringAsync(tmpPath, JSON.stringify(data, null, 2));
    try {
      await FileSystem.moveAsync({ from: tmpPath, to: SEARCH_HISTORY_FILE });
    } catch {
      await FileSystem.deleteAsync(SEARCH_HISTORY_FILE, { idempotent: true });
      await FileSystem.moveAsync({ from: tmpPath, to: SEARCH_HISTORY_FILE });
    }
  } catch (err) {
    console.warn('Lỗi lưu search history vào đĩa:', err);
  }
}

/**
 * Xóa toàn bộ lịch sử tìm kiếm
 */
export async function clearSearchHistory(): Promise<void> {
  try {
    await FileSystem.deleteAsync(SEARCH_HISTORY_FILE, { idempotent: true });
  } catch (err) {
    console.warn('Lỗi xóa search history:', err);
  }
}
