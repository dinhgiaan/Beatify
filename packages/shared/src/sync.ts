import type { UserState, Playlist } from './schemas';

/**
 * Thuật toán hợp nhất trạng thái người dùng hai chiều (Two-Way Conflict Resolution / CRDT-inspired Merge).
 * Đảm bảo:
 * 1. Không bao giờ làm mất playlist được tạo lúc offline ở cả 2 phía (iPhone và Web).
 * 2. Đối với playlist cùng ID bị sửa ở 2 nơi: Chọn phiên bản có mốc `updatedAt` mới hơn.
 * 3. Hợp nhất danh sách bài hát yêu thích (Favorites Union) không trùng lặp.
 *
 * @param local Trạng thái lưu trên máy (iPhone / Local Cache)
 * @param remote Trạng thái lưu trên máy chủ (Cloudflare R2 / Server)
 * @returns Trạng thái đã được hợp nhất hoàn hảo
 */
export function mergeUserStates(
  local?: UserState | null,
  remote?: UserState | null
): UserState {
  const defaultState: UserState = {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    playlists: [],
    favoriteIds: [],
  };

  if (!local && !remote) return { ...defaultState, updatedAt: new Date().toISOString() };
  if (!local && remote) return remote;
  if (!remote && local) return local;
  if (!local || !remote) return defaultState;

  // 1. Hợp nhất danh sách Playlist theo ID
  const playlistMap = new Map<string, Playlist>();

  // Thêm tất cả playlist từ local
  for (const pl of local.playlists || []) {
    if (pl && pl.id) {
      playlistMap.set(pl.id, { ...pl });
    }
  }

  // Duyệt playlist từ remote để hợp nhất thông minh
  for (const remotePl of remote.playlists || []) {
    if (!remotePl || !remotePl.id) continue;

    const existingLocal = playlistMap.get(remotePl.id);
    if (!existingLocal) {
      // Chỉ có ở remote -> Giữ lại
      playlistMap.set(remotePl.id, { ...remotePl });
    } else {
      // Trùng ID ở cả 2 phía -> So sánh thời gian updatedAt
      const localTime = new Date(existingLocal.updatedAt || 0).getTime();
      const remoteTime = new Date(remotePl.updatedAt || 0).getTime();

      if (remoteTime > localTime) {
        // Bản remote mới hơn -> Lấy remote
        playlistMap.set(remotePl.id, { ...remotePl });
      } else if (remoteTime === localTime) {
        // Thời gian bằng nhau -> Hợp nhất danh sách trackIds tránh sót bài
        const mergedTracks = Array.from(
          new Set([...existingLocal.trackIds, ...remotePl.trackIds])
        );
        playlistMap.set(remotePl.id, {
          ...existingLocal,
          trackIds: mergedTracks,
        });
      }
      // Nếu localTime > remoteTime: Giữ nguyên bản local đã có trong map
    }
  }

  // 2. Hợp nhất danh sách bài hát yêu thích (Union set)
  const favoriteSet = new Set<string>([
    ...(local.favoriteIds || []),
    ...(remote.favoriteIds || []),
  ]);

  // 3. Tính toán mốc thời gian cập nhật tổng thể
  const localUpdated = new Date(local.updatedAt || 0).getTime();
  const remoteUpdated = new Date(remote.updatedAt || 0).getTime();
  const latestTimestamp = Math.max(localUpdated, remoteUpdated, Date.now());

  return {
    version: 1,
    updatedAt: new Date(latestTimestamp).toISOString(),
    playlists: Array.from(playlistMap.values()),
    favoriteIds: Array.from(favoriteSet),
  };
}
