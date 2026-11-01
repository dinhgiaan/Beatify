import { requestApi } from '../../core/api-client';
import type {
  YoutubeMusicDependencyStatus,
  YoutubeMusicPreviewResponse,
  YoutubeMusicJobPayload,
  YoutubeMusicDownloadRecord,
  YoutubeMusicConfig,
} from '@music-app/shared';

export async function fetchDependenciesApi(): Promise<YoutubeMusicDependencyStatus> {
  return requestApi<YoutubeMusicDependencyStatus>('/api/youtube-music/dependencies');
}

export async function updateDependenciesApi(): Promise<{ success: boolean; output: string }> {
  return requestApi<{ success: boolean; output: string }>('/api/youtube-music/dependencies/update', {
    method: 'POST',
  });
}

export async function previewMusicApi(params: {
  urls: string[];
  maxItems?: number;
}): Promise<YoutubeMusicPreviewResponse> {
  return requestApi<YoutubeMusicPreviewResponse>('/api/youtube-music/preview', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function createDownloadJobApi(payload: YoutubeMusicJobPayload): Promise<{ jobId: string }> {
  return requestApi<{ jobId: string }>('/api/youtube-music/jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function stopDownloadJobApi(jobId: string): Promise<{ stopped: boolean }> {
  return requestApi<{ stopped: boolean }>(`/api/youtube-music/jobs/${jobId}/stop`, {
    method: 'POST',
  });
}

export async function fetchDownloadsHistoryApi(limit = 100): Promise<YoutubeMusicDownloadRecord[]> {
  return requestApi<YoutubeMusicDownloadRecord[]>(`/api/youtube-music/downloads?limit=${limit}`);
}

export async function deleteDownloadHistoryApi(id: string, deleteFiles = false): Promise<{ deleted: boolean }> {
  return requestApi<{ deleted: boolean }>(`/api/youtube-music/downloads/${id}?deleteFiles=${deleteFiles}`, {
    method: 'DELETE',
  });
}

export async function clearDownloadsHistoryApi(): Promise<{ count: number }> {
  return requestApi<{ count: number }>('/api/youtube-music/downloads', {
    method: 'DELETE',
  });
}

export async function fetchYoutubeMusicConfigApi(): Promise<YoutubeMusicConfig> {
  return requestApi<YoutubeMusicConfig>('/api/youtube-music/config');
}

export async function saveYoutubeMusicConfigApi(
  config: Partial<YoutubeMusicConfig>
): Promise<YoutubeMusicConfig> {
  return requestApi<YoutubeMusicConfig>('/api/youtube-music/config', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function openYoutubeMusicFolderApi(path: string): Promise<boolean> {
  return requestApi<boolean>('/api/youtube-music/open-folder', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export async function fetchLyricsContentApi(params: {
  url: string;
  artist?: string;
  title?: string;
  duration?: number;
}): Promise<{
  source: 'lrclib-synced' | 'lrclib-plain' | 'yt-subs' | 'none';
  syncedLyrics?: string;
  plainLyrics?: string;
}> {
  return requestApi<{
    source: 'lrclib-synced' | 'lrclib-plain' | 'yt-subs' | 'none';
    syncedLyrics?: string;
    plainLyrics?: string;
  }>('/api/youtube-music/lyrics/fetch', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function verifyDiskFilesApi(paths: string[]): Promise<Record<string, boolean>> {
  return requestApi<Record<string, boolean>>('/api/youtube-music/verify-files', {
    method: 'POST',
    body: JSON.stringify({ paths }),
  });
}

export async function relinkDownloadApi(
  id: string,
  customFilePath?: string
): Promise<{ success: boolean; found: boolean; message: string; relativeFilePath?: string }> {
  return requestApi<{ success: boolean; found: boolean; message: string; relativeFilePath?: string }>(
    `/api/youtube-music/downloads/${id}/relink`,
    {
      method: 'POST',
      body: JSON.stringify({ customFilePath }),
    }
  );
}

export async function rescanAllMissingApi(): Promise<{
  totalMissing: number;
  relinked: number;
  remainingMissing: number;
}> {
  return requestApi<{
    totalMissing: number;
    relinked: number;
    remainingMissing: number;
  }>('/api/youtube-music/downloads/rescan-missing', {
    method: 'POST',
  });
}

export async function getDownloadLyricsApi(id: string): Promise<{
  lyrics: string;
  source: string;
  hasSynced: boolean;
}> {
  return requestApi<{
    lyrics: string;
    source: string;
    hasSynced: boolean;
  }>(`/api/youtube-music/downloads/${id}/lyrics`);
}

export const fetchDownloadLyricsApi = getDownloadLyricsApi;

export async function updateDownloadLyricsApi(
  id: string,
  lyrics: string
): Promise<{ success: boolean; relativeLyricsPath?: string }> {
  return requestApi<{ success: boolean; relativeLyricsPath?: string }>(
    `/api/youtube-music/downloads/${id}/lyrics`,
    {
      method: 'PUT',
      body: JSON.stringify({ lyrics }),
    }
  );
}

export async function verifyDownloadsApi(): Promise<YoutubeMusicDownloadRecord[]> {
  return requestApi<YoutubeMusicDownloadRecord[]>('/api/youtube-music/downloads/verify', {
    method: 'POST',
  });
}

export async function openDownloadFolderApi(id: string): Promise<{ opened: boolean }> {
  return requestApi<{ opened: boolean }>(`/api/youtube-music/downloads/${id}/open-folder`, {
    method: 'POST',
  });
}

export async function uploadDownloadToR2Api(id: string): Promise<YoutubeMusicDownloadRecord> {
  return requestApi<YoutubeMusicDownloadRecord>(`/api/youtube-music/downloads/${id}/upload-r2`, {
    method: 'POST',
  });
}

export async function deleteDownloadCompleteApi(
  id: string,
  options: { deleteFiles: boolean; deleteR2: boolean }
): Promise<{ deleted: boolean }> {
  return requestApi<{ deleted: boolean }>(
    `/api/youtube-music/downloads/${id}?deleteFiles=${options.deleteFiles}&deleteR2=${options.deleteR2}`,
    {
      method: 'DELETE',
    }
  );
}

export async function relocateDownloadsApi(request: {
  mode: 'auto-scan' | 'replace-prefix' | 'single-file';
  targetDir?: string;
  oldPrefix?: string;
  newPrefix?: string;
  id?: string;
  newFullPath?: string;
}): Promise<{
  relocatedCount: number;
  matchedRecords: YoutubeMusicDownloadRecord[];
}> {
  return requestApi<{
    relocatedCount: number;
    matchedRecords: YoutubeMusicDownloadRecord[];
  }>('/api/youtube-music/downloads/relocate', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function browseFolderNativeApi(initialPath?: string): Promise<{ path: string | null }> {
  return requestApi<{ path: string | null }>('/local-api/browse-folder', {
    method: 'POST',
    body: JSON.stringify({ initialPath }),
  });
}

