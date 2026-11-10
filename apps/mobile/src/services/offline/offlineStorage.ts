import * as FileSystem from 'expo-file-system/legacy';
import type { Track } from '@music-app/shared';

export interface OfflineTrackMeta {
  trackId: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  audioRelPath: string;
  coverRelPath?: string;
  lyricsRelPath?: string;
  sizeBytes: number;
  downloadedAt: string;
}

export type OfflineIndex = Record<string, OfflineTrackMeta>;

export const OFFLINE_DIR_NAME = 'offline';
export const OFFLINE_INDEX_FILE_NAME = 'beatify_offline_index.json';

/**
 * Định dạng dung lượng byte sang chuỗi hiển thị dễ đọc (B, KB, MB, GB)
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 MB';
  const k = 1024;
  if (bytes < k) return `${bytes} B`;
  if (bytes < k * k) return `${(bytes / k).toFixed(1)} KB`;
  if (bytes < k * k * k) return `${(bytes / (k * k)).toFixed(1)} MB`;
  return `${(bytes / (k * k * k)).toFixed(2)} GB`;
}

/**
 * Tính tổng dung lượng byte của toàn bộ nhạc đã tải về máy
 */
export function getOfflineTotalSizeBytes(index: OfflineIndex): number {
  if (!index) return 0;
  return Object.values(index).reduce((acc, item) => acc + (item.sizeBytes || 0), 0);
}

/**
 * Ghép đường dẫn cục bộ tuyệt đối file:// từ relative path an toàn qua các lần cập nhật app
 */
export function getAbsoluteOfflineUri(relPath: string): string {
  const docDir = FileSystem.documentDirectory || '';
  const cleanDoc = docDir.endsWith('/') ? docDir : `${docDir}/`;
  const cleanRel = relPath.startsWith('/') ? relPath.slice(1) : relPath;
  return `${cleanDoc}${cleanRel}`;
}

/**
 * Lấy đường dẫn file index
 */
function getIndexFilePath(): string {
  const docDir = FileSystem.documentDirectory || '';
  const cleanDoc = docDir.endsWith('/') ? docDir : `${docDir}/`;
  return `${cleanDoc}${OFFLINE_INDEX_FILE_NAME}`;
}

/**
 * Nạp chỉ mục nhạc offline từ đĩa (atomic read)
 */
export async function loadOfflineIndex(): Promise<OfflineIndex> {
  const indexPath = getIndexFilePath();
  try {
    const info = await FileSystem.getInfoAsync(indexPath);
    if (!info.exists) {
      return {};
    }
    const content = await FileSystem.readAsStringAsync(indexPath);
    const parsed = JSON.parse(content) as OfflineIndex;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.warn('[offlineStorage] Không đọc được chỉ mục offline, khởi tạo rỗng:', err);
    return {};
  }
}

/**
 * Lưu chỉ mục nhạc offline xuống đĩa bằng atomic write (.tmp -> rename)
 */
export async function saveOfflineIndex(index: OfflineIndex): Promise<void> {
  const indexPath = getIndexFilePath();
  const tmpPath = `${indexPath}.tmp`;
  try {
    const jsonStr = JSON.stringify(index, null, 2);
    await FileSystem.writeAsStringAsync(tmpPath, jsonStr);
    const destInfo = await FileSystem.getInfoAsync(indexPath);
    if (destInfo.exists) {
      await FileSystem.deleteAsync(indexPath, { idempotent: true });
    }
    await FileSystem.moveAsync({ from: tmpPath, to: indexPath });
  } catch (err) {
    console.error('[offlineStorage] Lỗi lưu chỉ mục offline:', err);
    throw err;
  }
}

/**
 * Tải trọn bộ 1 bài hát về máy (audio + cover + lyrics)
 */
export async function downloadTrackOffline(
  track: Track,
  serverUrl: string,
  serverToken: string,
  lyricsContent?: string | null
): Promise<OfflineTrackMeta> {
  const docDir = FileSystem.documentDirectory || '';
  const cleanDoc = docDir.endsWith('/') ? docDir : `${docDir}/`;
  const trackFolderRel = `${OFFLINE_DIR_NAME}/${track.id}`;
  const trackFolderAbs = `${cleanDoc}${trackFolderRel}`;

  // Đảm bảo thư mục đích tồn tại
  const folderInfo = await FileSystem.getInfoAsync(trackFolderAbs);
  if (!folderInfo.exists) {
    await FileSystem.makeDirectoryAsync(trackFolderAbs, { intermediates: true });
  }

  const cleanServerUrl = serverUrl.trim().replace(/\/+$/, '');
  const tokenParam = serverToken.trim() ? `?token=${encodeURIComponent(serverToken.trim())}` : '';

  // 1. Tải file âm thanh
  const streamUrl = `${cleanServerUrl}/api/stream/${track.id}${tokenParam}`;
  const audioRelPath = `${trackFolderRel}/audio.mp3`;
  const audioAbsPath = `${cleanDoc}${audioRelPath}`;

  const audioDownloadResult = await FileSystem.downloadAsync(streamUrl, audioAbsPath);
  if (audioDownloadResult.status < 200 || audioDownloadResult.status >= 300) {
    throw new Error(`Tải file âm thanh thất bại (HTTP ${audioDownloadResult.status})`);
  }

  let totalBytes = 0;
  const audioInfo = await FileSystem.getInfoAsync(audioAbsPath);
  if (audioInfo.exists && typeof audioInfo.size === 'number') {
    totalBytes += audioInfo.size;
  }

  // 2. Tải ảnh bìa (nếu có)
  let coverRelPath: string | undefined;
  if (track.cover) {
    try {
      const coverUrl = track.cover.startsWith('http')
        ? track.cover
        : `${cleanServerUrl}/${track.cover.replace(/^\/+/, '')}${tokenParam}`;
      const cRel = `${trackFolderRel}/cover.jpg`;
      const cAbs = `${cleanDoc}${cRel}`;
      const coverResult = await FileSystem.downloadAsync(coverUrl, cAbs);
      if (coverResult.status >= 200 && coverResult.status < 300) {
        coverRelPath = cRel;
        const cInfo = await FileSystem.getInfoAsync(cAbs);
        if (cInfo.exists && typeof cInfo.size === 'number') {
          totalBytes += cInfo.size;
        }
      }
    } catch (coverErr) {
      console.warn('[offlineStorage] Không tải được ảnh bìa, tiếp tục không có bìa:', coverErr);
    }
  }

  // 3. Lưu file lời bài hát (nếu có)
  let lyricsRelPath: string | undefined;
  if (lyricsContent && lyricsContent.trim().length > 0) {
    try {
      const lRel = `${trackFolderRel}/lyrics.lrc`;
      const lAbs = `${cleanDoc}${lRel}`;
      await FileSystem.writeAsStringAsync(lAbs, lyricsContent.trim());
      lyricsRelPath = lRel;
      const lInfo = await FileSystem.getInfoAsync(lAbs);
      if (lInfo.exists && typeof lInfo.size === 'number') {
        totalBytes += lInfo.size;
      }
    } catch (lrcErr) {
      console.warn('[offlineStorage] Không lưu được file lời, tiếp tục:', lrcErr);
    }
  }

  const meta: OfflineTrackMeta = {
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    audioRelPath,
    coverRelPath,
    lyricsRelPath,
    sizeBytes: totalBytes,
    downloadedAt: new Date().toISOString(),
  };

  // Cập nhật và lưu chỉ mục
  const currentIndex = await loadOfflineIndex();
  currentIndex[track.id] = meta;
  await saveOfflineIndex(currentIndex);

  return meta;
}

/**
 * Xóa 1 bài hát đã tải về máy
 */
export async function deleteTrackOffline(trackId: string): Promise<OfflineIndex> {
  const docDir = FileSystem.documentDirectory || '';
  const cleanDoc = docDir.endsWith('/') ? docDir : `${docDir}/`;
  const trackFolderAbs = `${cleanDoc}${OFFLINE_DIR_NAME}/${trackId}`;

  try {
    await FileSystem.deleteAsync(trackFolderAbs, { idempotent: true });
  } catch (err) {
    console.warn(`[offlineStorage] Lỗi xóa thư mục bài ${trackId}:`, err);
  }

  const currentIndex = await loadOfflineIndex();
  delete currentIndex[trackId];
  await saveOfflineIndex(currentIndex);
  return currentIndex;
}

/**
 * Xóa nhiều bài hát đã chọn (Batch delete)
 */
export async function deleteMultipleTracksOffline(trackIds: string[]): Promise<OfflineIndex> {
  const docDir = FileSystem.documentDirectory || '';
  const cleanDoc = docDir.endsWith('/') ? docDir : `${docDir}/`;

  for (const trackId of trackIds) {
    const trackFolderAbs = `${cleanDoc}${OFFLINE_DIR_NAME}/${trackId}`;
    try {
      await FileSystem.deleteAsync(trackFolderAbs, { idempotent: true });
    } catch (err) {
      console.warn(`[offlineStorage] Lỗi xóa thư mục bài ${trackId}:`, err);
    }
  }

  const currentIndex = await loadOfflineIndex();
  for (const trackId of trackIds) {
    delete currentIndex[trackId];
  }
  await saveOfflineIndex(currentIndex);
  return currentIndex;
}

/**
 * Xóa toàn bộ nhạc đã tải về và reset chỉ mục
 */
export async function clearAllOfflineTracks(): Promise<void> {
  const docDir = FileSystem.documentDirectory || '';
  const cleanDoc = docDir.endsWith('/') ? docDir : `${docDir}/`;
  const offlineDirAbs = `${cleanDoc}${OFFLINE_DIR_NAME}`;

  try {
    await FileSystem.deleteAsync(offlineDirAbs, { idempotent: true });
  } catch (err) {
    console.warn('[offlineStorage] Lỗi xóa toàn bộ thư mục offline:', err);
  }

  await saveOfflineIndex({});
}
