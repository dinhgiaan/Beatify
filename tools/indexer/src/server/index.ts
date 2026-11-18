import * as mm from 'music-metadata';
import { serve } from '@hono/node-server';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import fs from 'fs/promises';
import { createReadStream, statSync, existsSync } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { loadConfig, loadLocalConfig, type IndexerConfig } from '../config';
import { findAudioFiles, scanAudioFile, calculateTrackId } from '../services/scanner';
import type { ScannedTrack } from '../services/scanner';
import { buildLibrary } from '../services/libraryBuilder';
import { R2Uploader } from '../services/r2Uploader';
import { getOverrides, setTrackOverride, applyOverridesToScanned, moveToTrash, restoreFromTrash, batchRestoreFromTrash, purgeFromTrash, batchPurgeFromTrash, setArtistAliases } from '../services/overridesManager';
import { updateFoldersConfig } from '../services/configManager';
import { pickFolderNative } from '../services/folderPicker';
import crypto from 'crypto';
import os from 'os';
import { execFile, execFileSync, spawn } from 'child_process';
import { TrackOverrideSchema, normalizeText, RelocateDownloadsRequestSchema, UserStateSchema, type UserState, type YoutubeMusicDownloadRecord } from '@music-app/shared';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DependencyChecker } from '../services/dependencyChecker';
import { LyricsService } from '../services/lyricsService';
import { youtubeJobRunner } from '../services/youtubeJobRunner';
import { resolveArtistDirectory, hasArtistImage, getArtistImagePath, fetchChannelAvatarBuffer, youtubeService } from '../services/youtubeService';
import { applyArtistImageMetadata } from '../services/imageMetadataService';
import { PathSanitizer } from '../services/pathSanitizer';
import type { JobEvent } from '@music-app/shared';
import {
  hostHeaderGuard,
  csrfGuard,
  isAllowedOrigin,
  isSystemDirectory,
  isSafeDeletePath,
} from './securityMiddleware';
import { LruBufferCache } from '../services/lruBufferCache';
import { globalScanCache } from '../services/scanCache';
import {
  searchCovers,
  downloadCoverImage,
} from '../services/coverFetchService';
import { defaultEntityResolutionService } from '../services/entityResolutionService';
import { convertToSquareAmbientCover } from '../services/imageConversionService';

export const app = new Hono();

const CUSTOM_COVERS_DIR = path.join(
  process.cwd().endsWith('indexer') ? process.cwd() : path.join(process.cwd(), 'tools/indexer'),
  'custom_covers'
);
const TEMP_IMPORT_DIR = path.join(
  process.cwd().endsWith('indexer') ? process.cwd() : path.join(process.cwd(), 'tools/indexer'),
  'temp_import'
);
const LYRICS_DIR = path.join(
  process.cwd().endsWith('indexer') ? process.cwd() : path.join(process.cwd(), 'tools/indexer'),
  'lyrics'
);
const LOCAL_STATE_FILE = path.join(
  process.cwd().endsWith('indexer') ? process.cwd() : path.join(process.cwd(), 'tools/indexer'),
  'user_state.json'
);

// Bộ nhớ cache tạm thời cho phiên làm việc local (giới hạn LRU 150 mục hoặc 64MB RAM)
let cachedScannedTracks: ScannedTrack[] = [];
const cachedCovers = new LruBufferCache({ maxEntries: 150, maxBytes: 64 * 1024 * 1024 });

/**
 * Quét danh sách file âm thanh với cơ chế bộ đệm RAM (ScanCache).
 * Tái sử dụng metadata và trackId nếu file không bị thay đổi mtime & size,
 * loại bỏ hoàn toàn việc băm lại SHA-1 gây nghẽn Disk I/O.
 */
async function scanFilesWithCache(files: string[]): Promise<ScannedTrack[]> {
  const rawScanned: ScannedTrack[] = [];
  const fileSet = new Set(files);
  globalScanCache.prune(fileSet);

  for (const f of files) {
    let stat: { mtimeMs: number; size: number } | null = null;
    try {
      const st = statSync(f);
      stat = { mtimeMs: st.mtimeMs, size: st.size };
    } catch {
      // file không truy cập được
    }

    let item: ScannedTrack | null = null;
    if (stat) {
      item = globalScanCache.get(f, stat);
    }

    if (!item) {
      item = await scanAudioFile(f);
      if (item && stat) {
        globalScanCache.set(f, stat, item);
      }
    }

    if (item) {
      rawScanned.push(item);
      if (item.coverBuffer) {
        if (item.track.albumId) cachedCovers.set(item.track.albumId, item.coverBuffer);
        if (item.track.id) cachedCovers.set(item.track.id, item.coverBuffer);
      }
    }
  }

  return rawScanned;
}

let cachedR2TrackKeys = new Set<string>();
let lastR2KeysFetchTime = 0;

let cachedR2CoverKeys = new Set<string>();
let lastR2CoverKeysFetchTime = 0;

async function getR2CoverKeys(forceRefresh = false): Promise<Set<string>> {
  const now = Date.now();
  if (!forceRefresh && cachedR2CoverKeys.size > 0 && now - lastR2CoverKeysFetchTime < 60000) {
    return cachedR2CoverKeys;
  }
  const localConfig = loadLocalConfig();
  if (
    localConfig.isR2Configured &&
    localConfig.R2_ACCOUNT_ID &&
    localConfig.R2_ACCESS_KEY_ID &&
    localConfig.R2_SECRET_ACCESS_KEY &&
    localConfig.R2_BUCKET
  ) {
    try {
      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${localConfig.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: localConfig.R2_ACCESS_KEY_ID,
          secretAccessKey: localConfig.R2_SECRET_ACCESS_KEY,
        },
      });
      const r2Res = await s3.send(
        new ListObjectsV2Command({ Bucket: localConfig.R2_BUCKET, Prefix: 'covers/' })
      );
      if (r2Res.Contents) {
        cachedR2CoverKeys = new Set(r2Res.Contents.map((o) => o.Key || '').filter(Boolean));
        lastR2CoverKeysFetchTime = now;
      }
    } catch {
      // bỏ qua
    }
  }
  return cachedR2CoverKeys;
}

let cachedStatusResponse: Record<string, unknown> | null = null;
let lastStatusFetchTime = 0;
const STATUS_CACHE_TTL_MS = 2000; // 2 giây: đảm bảo trạng thái hệ thống luôn phản ánh thời gian thực

function invalidateStatusCache() {
  cachedStatusResponse = null;
  lastStatusFetchTime = 0;
  cachedR2TrackKeys.clear();
  cachedR2CoverKeys.clear();
}

async function getR2TrackKeys(forceRefresh = false): Promise<Set<string>> {
  const now = Date.now();
  if (forceRefresh) {
    cachedR2TrackKeys.clear();
  } else if (cachedR2TrackKeys.size > 0 && now - lastR2KeysFetchTime < 10000) {
    return cachedR2TrackKeys;
  }
  const localConfig = loadLocalConfig();
  if (
    localConfig.isR2Configured &&
    localConfig.R2_ACCOUNT_ID &&
    localConfig.R2_ACCESS_KEY_ID &&
    localConfig.R2_SECRET_ACCESS_KEY &&
    localConfig.R2_BUCKET
  ) {
    try {
      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${localConfig.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: localConfig.R2_ACCESS_KEY_ID,
          secretAccessKey: localConfig.R2_SECRET_ACCESS_KEY,
        },
      });
      const r2Res = await s3.send(
        new ListObjectsV2Command({ Bucket: localConfig.R2_BUCKET, Prefix: 'music/' })
      );
      if (r2Res.Contents) {
        cachedR2TrackKeys = new Set(r2Res.Contents.map((o) => o.Key || '').filter(Boolean));
        lastR2KeysFetchTime = now;
      }
    } catch {
      // bỏ qua lỗi mạng
    }
  }

  // Fallback bảo vệ: Nếu gọi S3 bị lỗi mạng hoặc chưa trả về kịp nhưng trong youtube_downloads.json
  // đã lưu trạng thái các bài đã upload lên R2 (uploadedToR2: true), nạp lại các key này để
  // UI không bị rơi vào trạng thái rỗng giả mạo (0 bài / 0.0 MB).
  if (cachedR2TrackKeys.size === 0) {
    try {
      const downloads = await youtubeJobRunner.getDownloads();
      for (const d of downloads) {
        if (d.uploadedToR2 && d.trackId && d.format) {
          cachedR2TrackKeys.add(`music/${d.trackId}.${d.format}`);
        }
      }
    } catch {
      // bỏ qua
    }
  }

  return cachedR2TrackKeys;
}

/**
 * Tự động đồng bộ vi sai siêu tốc lên Cloudflare R2 (Auto Fast Micro-Sync)
 * Tái tạo library.json trong RAM từ cachedScannedTracks và overrides mới nhất,
 * sau đó lưu local và đẩy thẳng lên Cloudflare R2 mà không cần quét lại đĩa.
 */
async function autoSyncLibraryFastToR2(): Promise<{ success: boolean; error?: string }> {
  const localConfig = loadLocalConfig();
  if (
    !localConfig.isR2Configured ||
    !localConfig.R2_ACCOUNT_ID ||
    !localConfig.R2_ACCESS_KEY_ID ||
    !localConfig.R2_SECRET_ACCESS_KEY ||
    !localConfig.R2_BUCKET
  ) {
    return { success: false, error: 'R2 chưa được cấu hình' };
  }

  try {
    const overrides = await getOverrides();
    // 1. Tái áp dụng overrides mới nhất lên cachedScannedTracks nếu có
    if (cachedScannedTracks.length > 0) {
      for (const item of cachedScannedTracks) {
        const ov = overrides.tracks[item.track.id];
        if (ov) {
          if (ov.title) item.track.title = ov.title;
          if (ov.artist) item.track.artist = ov.artist;
          if (ov.album) item.track.album = ov.album;
          if (ov.year !== undefined) item.track.year = ov.year;
          if (ov.cover !== undefined) item.track.cover = ov.cover;
          if (ov.loudnessLufs !== undefined) item.track.loudnessLufs = ov.loudnessLufs;
          if (ov.replayGain !== undefined) item.track.replayGain = ov.replayGain;
        }
      }
    } else {
      const files = await findAudioFiles(localConfig.MUSIC_SOURCE_DIR);
      const rawScanned = await scanFilesWithCache(files);
      cachedScannedTracks = applyOverridesToScanned(rawScanned, overrides);
    }

    // 2. Lọc bỏ các bài đã ẩn/đã xóa trong thùng rác
    const activeScanned = cachedScannedTracks.filter((item) => {
      const ov = overrides.tracks[item.track.id];
      return !ov?.purged && !ov?.hidden;
    });

    // 3. Build library từ activeScanned
    const { library } = buildLibrary(activeScanned);

    // 4. Lưu library.json local
    const baseDir = process.cwd().endsWith('indexer') ? process.cwd() : path.join(process.cwd(), 'tools/indexer');
    const localLibraryPath = path.join(baseDir, 'library.json');
    await fs.writeFile(localLibraryPath, JSON.stringify(library, null, 2), 'utf-8').catch(() => {});

    // 5. Upload trực tiếp lên R2
    const uploader = new R2Uploader(localConfig as unknown as IndexerConfig);
    await uploader.uploadLibrary(library);

    invalidateStatusCache();
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[autoSyncFast] Lỗi đồng bộ ngầm R2:', msg);
    return { success: false, error: msg };
  }
}

let currentSyncProgress = {
  active: false,
  step: 'Sẵn sàng',
  current: 0,
  total: 0,
  percent: 0,
  error: null as string | null,
};

// Phòng vệ bảo mật: Chặn DNS Rebinding, whitelist CORS máy cục bộ và chặn CSRF
app.use('*', hostHeaderGuard);
app.use(
  '*',
  cors({
    origin: (origin) => (isAllowedOrigin(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);
app.use('*', csrfGuard);

// 1. API: Trạng thái & Thống kê hệ thống (Chỉ tính bài hát còn hoạt động, loại trừ bài ẩn/đã xóa)
app.get('/local-api/status', async (c) => {
  const isForce = c.req.query('force') === 'true';
  const now = Date.now();
  if (!isForce && cachedStatusResponse && now - lastStatusFetchTime < STATUS_CACHE_TTL_MS) {
    return c.json(cachedStatusResponse);
  }

  const localConfig = loadLocalConfig();
  let totalBytes = 0;
  let fileCount = 0;
  let syncedBytes = 0;
  let syncedCount = 0;
  let unsyncedBytes = 0;
  let unsyncedCount = 0;

  try {
    const overrides = await getOverrides();
    const r2Keys = await getR2TrackKeys(isForce);

    if (cachedScannedTracks.length === 0) {
      try {
        const files = await findAudioFiles(localConfig.MUSIC_SOURCE_DIR);
        const rawScanned = await scanFilesWithCache(files);
        cachedScannedTracks = applyOverridesToScanned(rawScanned, overrides);
      } catch {
        // bỏ qua
      }
    }

    if (cachedScannedTracks.length > 0) {
      // Dùng dữ liệu cache đã có để tính toán siêu tốc (không băm lại SHA-1, không nghẽn Disk I/O)
      for (const item of cachedScannedTracks) {
        const ov = overrides.tracks[item.track.id];
        if (!ov?.hidden && !ov?.purged) {
          fileCount++;
          let size = 0;
          try {
            size = statSync(item.filePath).size;
            totalBytes += size;
          } catch {
            // bỏ qua lỗi stat
          }

          if (r2Keys.has(item.track.file)) {
            syncedBytes += size;
            syncedCount++;
          } else {
            unsyncedBytes += size;
            unsyncedCount++;
          }
        }
      }
    } else {
      // Thư mục không có tệp âm thanh nào
      fileCount = 0;
      totalBytes = 0;
      syncedBytes = 0;
      syncedCount = 0;
      unsyncedBytes = 0;
      unsyncedCount = 0;
    }
  } catch {
    // bỏ qua lỗi đọc thư mục
  }

  const syncedMB = (syncedBytes / (1024 * 1024)).toFixed(1);
  const unsyncedMB = (unsyncedBytes / (1024 * 1024)).toFixed(1);
  const usedPercent = ((syncedBytes / (10 * 1024 * 1024 * 1024)) * 100).toFixed(2);

  const resData = {
    status: 200,
    configured: localConfig.isR2Configured,
    bucket: localConfig.R2_BUCKET || 'beatify-music',
    accountId: localConfig.R2_ACCOUNT_ID ? `${localConfig.R2_ACCOUNT_ID.slice(0, 8)}...` : null,
    sourceDir: localConfig.MUSIC_SOURCE_DIR,
    importDir: localConfig.MUSIC_IMPORT_DIR || null,
    fileCount,
    totalBytes,
    totalMB: (totalBytes / (1024 * 1024)).toFixed(1),
    syncedBytes,
    syncedMB,
    syncedCount,
    unsyncedBytes,
    unsyncedMB,
    unsyncedCount,
    freeLimitGB: 10,
    usedPercent,
  };

  cachedStatusResponse = resData;
  lastStatusFetchTime = now;

  return c.json(resData);
});

// 2. API: Lấy dữ liệu chi tiết (bài hát, albums, nghệ sĩ, thống kê định dạng)
app.get('/local-api/library', async (c) => {
  const localConfig = loadLocalConfig();
  let files: string[] = [];
  try {
    files = await findAudioFiles(localConfig.MUSIC_SOURCE_DIR);
  } catch {
    // bỏ qua
  }

  const rawScanned = await scanFilesWithCache(files);

  const overrides = await getOverrides();
  cachedScannedTracks = applyOverridesToScanned(rawScanned, overrides);

  // Nạp ảnh bìa tùy chỉnh từ CUSTOM_COVERS_DIR (ưu tiên theo trackId trước, sau đó mới tới albumId)
  for (const item of cachedScannedTracks) {
    const trackId = item.track.id;
    const albumId = item.track.albumId;

    if (trackId) {
      const customTrackPath = path.join(CUSTOM_COVERS_DIR, `${trackId}.jpg`);
      if (existsSync(customTrackPath)) {
        try {
          const buf = await fs.readFile(customTrackPath);
          cachedCovers.set(trackId, buf);
          item.coverBuffer = buf;
          item.track.cover = `covers/${trackId}.jpg`;
        } catch {
          // bỏ qua
        }
      }
    }

    if (albumId && (!item.coverBuffer || !item.track.cover?.includes(trackId))) {
      if (!cachedCovers.has(albumId)) {
        const customPath = path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`);
        if (existsSync(customPath)) {
          try {
            const buf = await fs.readFile(customPath);
            cachedCovers.set(albumId, buf);
            item.coverBuffer = buf;
            item.track.cover = item.track.cover || `covers/${albumId}.jpg`;
          } catch {
            // bỏ qua
          }
        }
      } else if (!item.coverBuffer) {
        item.coverBuffer = cachedCovers.get(albumId);
        item.track.cover = item.track.cover || `covers/${albumId}.jpg`;
      }
    }
  }

  const r2TrackKeys = await getR2TrackKeys();

  const formatsCount: Record<string, number> = {};
  let tracksWithCover = 0;
  let totalDurationSec = 0;
  let totalLocalSizeBytes = 0;
  let syncedSizeBytes = 0;
  let unsyncedSizeBytes = 0;
  let syncedTracksCount = 0;
  let unsyncedTracksCount = 0;

  // Lọc bỏ bài đã purged hoặc hidden trong overrides
  const activeScanned = cachedScannedTracks.filter((item) => {
    const ov = overrides.tracks[item.track.id];
    return !ov?.purged && !ov?.hidden;
  });

  const tracks = activeScanned.map((item) => {
    let sizeBytes = 0;
    const fileExists = existsSync(item.filePath);
    if (fileExists) {
      try {
        sizeBytes = statSync(item.filePath).size;
      } catch {
        // bỏ qua
      }
    }
    const ext = path.extname(item.filePath).toUpperCase().replace('.', '') || 'OTHER';
    formatsCount[ext] = (formatsCount[ext] || 0) + 1;
    const albumId = item.track.albumId;
    const trackId = item.track.id;
    const hasCover = Boolean(
      item.coverBuffer ||
      item.track.cover ||
      (albumId && (cachedCovers.has(albumId) || existsSync(path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`)))) ||
      (trackId && (cachedCovers.has(trackId) || existsSync(path.join(CUSTOM_COVERS_DIR, `${trackId}.jpg`))))
    );
    if (hasCover) tracksWithCover++;
    totalDurationSec += item.track.duration;
    totalLocalSizeBytes += sizeBytes;

    const isSynced = r2TrackKeys.has(item.track.file);
    if (isSynced) {
      syncedSizeBytes += sizeBytes;
      syncedTracksCount++;
    } else {
      unsyncedSizeBytes += sizeBytes;
      unsyncedTracksCount++;
    }

    return {
      id: item.track.id,
      title: item.track.title,
      artist: item.track.artist,
      album: item.track.album,
      albumId: item.track.albumId,
      duration: item.track.duration,
      format: ext,
      sizeMB: (sizeBytes / (1024 * 1024)).toFixed(1),
      hasCover,
      year: item.track.year,
      replayGain: item.track.replayGain,
      isSynced,
      fileExists,
      r2FileName: path.basename(item.track.file),
      r2FileKey: item.track.file,
    };
  });

  const { library } = buildLibrary(cachedScannedTracks);

  const albums = library.albums.map((alb) => ({
    id: alb.id,
    title: alb.title,
    artist: alb.artist,
    year: alb.year,
    trackCount: alb.trackIds.length,
    hasCover: cachedCovers.has(alb.id),
  }));

  const artistsMap = new Map<string, number>();
  for (const t of tracks) {
    artistsMap.set(t.artist, (artistsMap.get(t.artist) || 0) + 1);
  }
  const artists = Array.from(artistsMap.entries()).map(([name, count]) => ({
    name,
    trackCount: count,
  }));

  const syncedSizeMB = (syncedSizeBytes / (1024 * 1024)).toFixed(1);
  const unsyncedSizeMB = (unsyncedSizeBytes / (1024 * 1024)).toFixed(1);
  const totalEstimatedSizeMB = (totalLocalSizeBytes / (1024 * 1024)).toFixed(1);
  const r2UsedPercent = ((syncedSizeBytes / (10 * 1024 * 1024 * 1024)) * 100).toFixed(2);
  const estimatedUsedPercent = ((totalLocalSizeBytes / (10 * 1024 * 1024 * 1024)) * 100).toFixed(2);

  return c.json({
    status: 200,
    tracks,
    albums,
    artists,
    stats: {
      totalTracks: tracks.length,
      syncedTracksCount,
      unsyncedTracksCount,
      totalAlbums: albums.length,
      totalArtists: artists.length,
      tracksWithCover,
      coverCoveragePercent: tracks.length > 0 ? Math.round((tracksWithCover / tracks.length) * 100) : 0,
      totalDurationHours: (totalDurationSec / 3600).toFixed(1),
      totalSizeBytes: totalLocalSizeBytes,
      totalSizeMB: totalEstimatedSizeMB,
      syncedSizeBytes,
      syncedSizeMB,
      unsyncedSizeBytes,
      unsyncedSizeMB,
      r2UsedPercent,
      estimatedUsedPercent,
      formats: formatsCount,
    },
  });
});

// 2.1. API: Danh sách bài hát cho trang Library (Có kiểm tra tệp thực tế trên đĩa)
app.get('/local-api/tracks', async (c) => {
  const localConfig = loadLocalConfig();
  let files: string[] = [];
  try {
    files = await findAudioFiles(localConfig.MUSIC_SOURCE_DIR);
  } catch {
    // bỏ qua
  }

  const rawScanned = await scanFilesWithCache(files);

  const overrides = await getOverrides();
  cachedScannedTracks = applyOverridesToScanned(rawScanned, overrides);

  // Nạp ảnh bìa tùy chỉnh từ CUSTOM_COVERS_DIR và cachedCovers (ưu tiên theo trackId trước)
  for (const item of cachedScannedTracks) {
    const albumId = item.track.albumId;
    const trackId = item.track.id;

    if (trackId) {
      if (cachedCovers.has(trackId)) {
        item.coverBuffer = cachedCovers.get(trackId);
        item.track.cover = `covers/${trackId}.jpg`;
      } else {
        const customPath = path.join(CUSTOM_COVERS_DIR, `${trackId}.jpg`);
        if (existsSync(customPath)) {
          try {
            const buf = await fs.readFile(customPath);
            cachedCovers.set(trackId, buf);
            item.coverBuffer = buf;
            item.track.cover = `covers/${trackId}.jpg`;
          } catch {
            // bỏ qua
          }
        }
      }
    }

    if (albumId && (!item.coverBuffer || !item.track.cover?.includes(trackId))) {
      if (cachedCovers.has(albumId)) {
        item.coverBuffer = cachedCovers.get(albumId);
        item.track.cover = item.track.cover || `covers/${albumId}.jpg`;
      } else {
        const customPath = path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`);
        if (existsSync(customPath)) {
          try {
            const buf = await fs.readFile(customPath);
            cachedCovers.set(albumId, buf);
            item.coverBuffer = buf;
            item.track.cover = item.track.cover || `covers/${albumId}.jpg`;
          } catch {
            // bỏ qua
          }
        }
      }
    }
  }

  const r2TrackKeys = await getR2TrackKeys();

  const tracks = cachedScannedTracks.map((item) => {
    const fileExists = existsSync(item.filePath);
    const ext = path.extname(item.filePath).replace('.', '').toLowerCase();
    const albumId = item.track.albumId;
    const trackId = item.track.id;
    let mtimeMs = 0;
    if (fileExists) {
      try {
        mtimeMs = Math.round(statSync(item.filePath).mtimeMs);
      } catch {
        mtimeMs = 0;
      }
    }
    const hasCover = Boolean(
      item.coverBuffer ||
      item.track.cover ||
      (albumId && (cachedCovers.has(albumId) || existsSync(path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`)))) ||
      (trackId && (cachedCovers.has(trackId) || existsSync(path.join(CUSTOM_COVERS_DIR, `${trackId}.jpg`))))
    );

    const hasHdCover = Boolean(
      (overrides.tracks && overrides.tracks[item.track.id]?.cover) ||
      (trackId && existsSync(path.join(CUSTOM_COVERS_DIR, `${trackId}.jpg`)))
    );

    return {
      id: item.track.id,
      title: item.track.title,
      artist: item.track.artist,
      album: item.track.album,
      albumId: item.track.albumId,
      duration: item.track.duration,
      format: ext,
      hasCover,
      hasHdCover,
      hasLyrics: !!item.track.lyrics,
      filePath: item.filePath,
      fileExists,
      mtimeMs,
      isSynced: r2TrackKeys.has(item.track.file),
    };
  });

  return c.json({ status: 200, tracks });
});

// 3. API: Phát audio preview (hỗ trợ cả /local-api/stream/:id, /local-api/audio/:id, /local-api/tracks/:id/stream)
const streamHandler = async (c: Context) => {
  const id = c.req.param('id');
  let target = cachedScannedTracks.find((t) => t.track.id === id);
  if (!target || !target.filePath || !existsSync(target.filePath)) {
    try {
      const localConfig = loadLocalConfig();
      const files = await findAudioFiles(localConfig.MUSIC_SOURCE_DIR);
      const rawScanned = await scanFilesWithCache(files);
      const overrides = await getOverrides();
      cachedScannedTracks = applyOverridesToScanned(rawScanned, overrides);
      target = cachedScannedTracks.find((t) => t.track.id === id);
    } catch {
      // bỏ qua
    }
  }

  if (!target || !target.filePath || !existsSync(target.filePath)) {
    return c.text('Không tìm thấy tệp âm thanh trên ổ cứng', 404);
  }

  const stat = statSync(target.filePath);
  const fileSize = stat.size;
  const ext = path.extname(target.filePath).toLowerCase();
  const contentType =
    ext === '.m4a'
      ? 'audio/mp4'
      : ext === '.flac'
        ? 'audio/flac'
        : ext === '.opus'
          ? 'audio/ogg'
          : 'audio/mpeg';

  const range = c.req.header('range');
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const startStr = parts[0] ?? '0';
    const endStr = parts[1];
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const fileStream = createReadStream(target.filePath, { start, end });

    return new Response(Readable.toWeb(fileStream) as ReadableStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize.toString(),
        'Content-Type': contentType,
      },
    });
  }

  const stream = createReadStream(target.filePath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      'Content-Length': fileSize.toString(),
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    },
  });
};

app.get('/local-api/audio/:id', streamHandler);
app.get('/local-api/stream/:id', streamHandler);
app.get('/local-api/tracks/:id/stream', streamHandler);
app.get('/local-api/tracks/:id/audio', streamHandler);

// 4. API: Xem ảnh bìa album / bài hát (Hỗ trợ /local-api/cover/:id, /local-api/covers/:id, đuôi .jpg và fallback trích xuất ID3)
const handleGetCover = async (c: Context) => {
  const rawId = c.req.param('id') || c.req.param('albumId') || '';
  const cleanId = rawId.replace(/\.(jpg|jpeg|png|webp)$/i, '').trim();
  if (!cleanId) return c.text('No cover', 404);

  // 1. Thử lấy từ cache memory
  let buf = cachedCovers.get(cleanId);

  // 2. Thử tìm trong CUSTOM_COVERS_DIR
  if (!buf) {
    const extList = ['.jpg', '.jpeg', '.png', '.webp'];
    for (const ext of extList) {
      const customPath = path.join(CUSTOM_COVERS_DIR, `${cleanId}${ext}`);
      if (existsSync(customPath)) {
        try {
          buf = await fs.readFile(customPath);
          cachedCovers.set(cleanId, buf);
          break;
        } catch {
          // Bỏ qua lỗi đọc file ảnh custom
        }
      }
    }
  }

  // 3. Thử tìm trong cachedScannedTracks (ưu tiên khớp chính xác track.id trước albumId)
  if (!buf) {
    const matched =
      cachedScannedTracks.find((t) => t.track.id === cleanId) ||
      cachedScannedTracks.find((t) => t.track.albumId === cleanId);

    if (matched) {
      if (matched.coverBuffer) {
        buf = matched.coverBuffer;
        cachedCovers.set(cleanId, buf);
      } else if (matched.filePath && existsSync(matched.filePath)) {
        try {
          // Thử đọc từ tag ID3
          const metadata = await mm.parseFile(matched.filePath);
          const picture = metadata.common.picture?.[0];
          if (picture) {
            buf = Buffer.from(picture.data);
            matched.coverBuffer = buf;
            cachedCovers.set(cleanId, buf);
          } else {
            // Thử đọc ảnh sidecar (.jpg / .jpeg / .png)
            const sidecarExts = ['.jpg', '.jpeg', '.png', '.webp'];
            for (const ext of sidecarExts) {
              const sidecarPath = matched.filePath.replace(/\.[^/.]+$/, ext);
              if (existsSync(sidecarPath)) {
                buf = await fs.readFile(sidecarPath);
                matched.coverBuffer = buf;
                cachedCovers.set(cleanId, buf);
                break;
              }
            }
          }
        } catch {
          // Bỏ qua lỗi parse metadata ảnh
        }
      }
    }
  }

  // 4. Nếu vẫn chưa có và chưa quét bài hát nào: quét nhanh thư mục nhạc
  if (!buf && cachedScannedTracks.length === 0) {
    try {
      const localConfig = loadLocalConfig();
      const files = await findAudioFiles(localConfig.MUSIC_SOURCE_DIR);
      for (const f of files) {
        const item = await scanAudioFile(f);
        if (item) {
          if (item.coverBuffer) {
            if (item.track.albumId) cachedCovers.set(item.track.albumId, item.coverBuffer);
            if (item.track.id) cachedCovers.set(item.track.id, item.coverBuffer);
          }
          if (item.track.albumId === cleanId || item.track.id === cleanId) {
            buf = item.coverBuffer;
            if (buf) break;
          }
        }
      }
    } catch {
      // Bỏ qua lỗi quét thư mục nhanh
    }
  }

  if (!buf) return c.text('No cover', 404);

  // Nhận diện MIME type từ Magic Bytes của buffer
  let contentType = 'image/jpeg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    contentType = 'image/png';
  } else if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    contentType = 'image/webp';
  }

  return new Response(buf, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
};

// Hàm dùng chung để lưu ảnh bìa từ Buffer cho 1 bài hát
async function saveTrackCoverBuffer(trackId: string, rawBuffer: Buffer): Promise<{ albumId: string; coverUrl: string }> {
  const scanned = cachedScannedTracks.find((t) => t.track.id === trackId);
  if (!scanned) {
    throw new Error('Không tìm thấy bài hát');
  }

  // Tự động convert sang ảnh vuông 1:1 ambient blur nếu ảnh tải lên là ảnh ngang (16:9, 4:3, ...)
  const buffer = await convertToSquareAmbientCover(rawBuffer);

  const albumId = scanned.track.albumId || `track_${trackId.slice(0, 8)}`;

  // 1. Xóa file ảnh bìa cũ nếu đã có trước đó
  const oldCoverFile = path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`);
  const oldTrackCoverFile = path.join(CUSTOM_COVERS_DIR, `${trackId}.jpg`);
  if (existsSync(oldCoverFile)) {
    await fs.unlink(oldCoverFile).catch(() => {});
  }
  if (existsSync(oldTrackCoverFile)) {
    await fs.unlink(oldTrackCoverFile).catch(() => {});
  }
  cachedCovers.delete(albumId);
  cachedCovers.delete(trackId);

  // 2. Ghi file ảnh bìa mới vào thư mục custom covers
  await fs.mkdir(CUSTOM_COVERS_DIR, { recursive: true });
  await fs.writeFile(path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`), buffer);
  await fs.writeFile(path.join(CUSTOM_COVERS_DIR, `${trackId}.jpg`), buffer);

  // 3. Nếu file nhạc vật lý tồn tại trên đĩa, cập nhật luôn file ảnh bìa sidecar (.jpg) cạnh file nhạc
  if (scanned.filePath && existsSync(scanned.filePath)) {
    try {
      const sidecarCoverPath = scanned.filePath.replace(path.extname(scanned.filePath), '.jpg');
      await fs.writeFile(sidecarCoverPath, buffer);
    } catch {
      // Bỏ qua nếu quyền truy cập thư mục bị giới hạn
    }
  }

  cachedCovers.set(albumId, buffer);
  cachedCovers.set(trackId, buffer);
  scanned.coverBuffer = buffer;
  scanned.track.cover = `covers/${trackId}.jpg`;

  // 4. Lưu ghi đè an toàn vào overrides.json
  try {
    await setTrackOverride(trackId, { cover: `covers/${trackId}.jpg` });
  } catch {
    // bỏ qua
  }

  // 5. Tự động đồng bộ vi sai siêu tốc lên Cloudflare R2
  const localConfig = loadLocalConfig();
  if (localConfig.isR2Configured) {
    try {
      const uploader = new R2Uploader(localConfig as unknown as IndexerConfig);
      await uploader.uploadCover(albumId, buffer);
      await uploader.uploadCover(trackId, buffer);
    } catch {
      // bỏ qua lỗi upload cover R2
    }
  }
  await autoSyncLibraryFastToR2();

  return {
    albumId,
    coverUrl: `/local-api/covers/${trackId}.jpg?_t=${Date.now()}`,
  };
}

// Trạng thái tiến trình tìm và tải ảnh bìa hàng loạt
interface BatchCoverState {
  isRunning: boolean;
  isCancelled: boolean;
  total: number;
  current: number;
  currentTrackTitle: string;
  successCount: number;
  skippedCount: number;
  failedCount: number;
  errors: Array<{ trackId: string; title: string; error: string }>;
  skippedTracks: Array<{ trackId: string; title: string; artist: string; reason: string }>;
}

let batchCoverState: BatchCoverState = {
  isRunning: false,
  isCancelled: false,
  total: 0,
  current: 0,
  currentTrackTitle: '',
  successCount: 0,
  skippedCount: 0,
  failedCount: 0,
  errors: [],
  skippedTracks: [],
};

// 4.1. API: Cập nhật ảnh bìa cho bài hát / album (Xóa ảnh bìa cũ nếu có)
app.post('/local-api/tracks/:id/cover', async (c) => {
  const trackId = c.req.param('id');
  const body = await c.req.parseBody();
  const file = body['cover'];

  if (!file || !(file instanceof File)) {
    return c.json({ status: 400, error: 'File ảnh bìa không hợp lệ' }, 400);
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const result = await saveTrackCoverBuffer(trackId, buffer);
    return c.json({
      status: 200,
      albumId: result.albumId,
      trackId,
      coverUrl: result.coverUrl,
      message: 'Đã cập nhật ảnh bìa mới và dọn dẹp ảnh bìa cũ thành công',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 404, error: msg }, 404);
  }
});

// 4.1c. API: Tìm kiếm ảnh bìa trực tuyến chất lượng cao HD (Apple Music / Deezer)
app.get('/local-api/covers/search', async (c) => {
  const title = c.req.query('title') || '';
  const artist = c.req.query('artist') || '';

  if (!title.trim()) {
    return c.json({ status: 400, error: 'Tiêu đề bài hát không được để trống' }, 400);
  }

  const results = await searchCovers(title, artist);
  return c.json({
    status: 200,
    results,
  });
});

// 4.1d. API: Tải và áp dụng ảnh bìa từ URL trực tuyến cho 1 bài hát
app.post('/local-api/covers/apply/:id', async (c) => {
  const trackId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const artworkUrl = body.artworkUrl;

  if (!artworkUrl || typeof artworkUrl !== 'string') {
    return c.json({ status: 400, error: 'URL ảnh bìa không hợp lệ' }, 400);
  }

  const buffer = await downloadCoverImage(artworkUrl);
  if (!buffer) {
    return c.json({ status: 502, error: 'Không thể tải ảnh bìa từ nguồn được chọn' }, 502);
  }

  try {
    const result = await saveTrackCoverBuffer(trackId, buffer);
    return c.json({
      status: 200,
      albumId: result.albumId,
      trackId,
      coverUrl: result.coverUrl,
      message: 'Đã tải và áp dụng ảnh bìa HD thành công',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 404, error: msg }, 404);
  }
});

// 4.1e. API: Bắt đầu tiến trình tải ảnh bìa HD hàng loạt (Batch Cover Fetch)
app.post('/local-api/covers/batch-fetch', async (c) => {
  if (batchCoverState.isRunning) {
    return c.json({ status: 409, error: 'Một tiến trình tải ảnh bìa hàng loạt đang diễn ra' }, 409);
  }

  const body = await c.req.json().catch(() => ({}));
  const mode = (body.mode === 'all' ? 'all' : 'missing_only') as 'all' | 'missing_only';

  const tracksToProcess = cachedScannedTracks.filter((t) => {
    if (mode === 'missing_only') {
      const hasHdCover = existsSync(path.join(CUSTOM_COVERS_DIR, `${t.track.id}.jpg`));
      return !hasHdCover;
    }
    return true;
  });

  if (tracksToProcess.length === 0) {
    return c.json({
      status: 200,
      message: mode === 'missing_only' ? 'Tất cả bài hát đều đã có ảnh bìa HD' : 'Thư viện không có bài hát nào',
      total: 0,
    });
  }

  batchCoverState = {
    isRunning: true,
    isCancelled: false,
    total: tracksToProcess.length,
    current: 0,
    currentTrackTitle: '',
    successCount: 0,
    skippedCount: 0,
    failedCount: 0,
    errors: [],
    skippedTracks: [],
  };

  // Chạy tiến trình nền không chặn response
  (async () => {
    for (let i = 0; i < tracksToProcess.length; i++) {
      if (batchCoverState.isCancelled) {
        break;
      }

      const item = tracksToProcess[i];
      if (!item) continue;
      batchCoverState.current = i + 1;
      batchCoverState.currentTrackTitle = `${item.track.title} - ${item.track.artist}`;

      try {
        const results = await searchCovers(item.track.title, item.track.artist);
        // Chọn kết quả có độ tương đồng tối thiểu 60%
        const best = results.find((r) => r.score >= 60);

        if (best) {
          const buffer = await downloadCoverImage(best.artworkUrl);
          if (buffer) {
            await saveTrackCoverBuffer(item.track.id, buffer);
            batchCoverState.successCount++;
          } else {
            batchCoverState.failedCount++;
            batchCoverState.errors.push({
              trackId: item.track.id,
              title: item.track.title,
              error: 'Không thể tải buffer ảnh',
            });
          }
        } else {
          batchCoverState.skippedCount++;
          batchCoverState.skippedTracks.push({
            trackId: item.track.id,
            title: item.track.title,
            artist: item.track.artist,
            reason: results.length === 0 ? 'Không tìm thấy trên Apple Music/Deezer' : `Điểm khớp thấp (${results[0]?.score ?? 0}%)`,
          });
        }
      } catch (err) {
        batchCoverState.failedCount++;
        batchCoverState.errors.push({
          trackId: item.track.id,
          title: item.track.title,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    batchCoverState.isRunning = false;
  })().catch((err) => {
    console.warn('[BatchCover] Lỗi ngoài ý muốn:', err);
    batchCoverState.isRunning = false;
  });

  return c.json({
    status: 200,
    message: `Đã bắt đầu tiến trình tìm ảnh bìa HD cho ${tracksToProcess.length} bài hát`,
    total: tracksToProcess.length,
    mode,
  });
});

// 4.1f. API: Lấy trạng thái tiến trình tải ảnh bìa hàng loạt
app.get('/local-api/covers/batch-status', (c) => {
  return c.json({
    status: 200,
    data: batchCoverState,
  });
});

// 4.1g. API: Hủy tiến trình tải ảnh bìa hàng loạt
app.post('/local-api/covers/batch-cancel', (c) => {
  if (batchCoverState.isRunning) {
    batchCoverState.isCancelled = true;
    return c.json({ status: 200, message: 'Đã gửi yêu cầu dừng tiến trình' });
  }
  return c.json({ status: 200, message: 'Không có tiến trình nào đang chạy' });
});

// Các endpoint trả về file ảnh bìa (Đặt sau các endpoint covers/ cụ thể để không bị chặn nhầm)
app.get('/local-api/cover/:albumId', handleGetCover);
app.get('/local-api/covers/:albumId', handleGetCover);
app.get('/local-api/cover/:id', handleGetCover);
app.get('/local-api/covers/:id', handleGetCover);

// 4.1b. API: Xóa ảnh bìa của bài hát / album
app.delete('/local-api/tracks/:id/cover', async (c) => {
  const trackId = c.req.param('id');
  const scanned = cachedScannedTracks.find(t => t.track.id === trackId);
  if (!scanned) {
    return c.json({ status: 404, error: 'Không tìm thấy bài hát' }, 404);
  }

  const albumId = scanned.track.albumId || `track_${trackId.slice(0, 8)}`;
  const oldCoverFile = path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`);
  const oldTrackCoverFile = path.join(CUSTOM_COVERS_DIR, `${trackId}.jpg`);
  if (existsSync(oldCoverFile)) {
    await fs.unlink(oldCoverFile).catch(() => { });
  }
  if (existsSync(oldTrackCoverFile)) {
    await fs.unlink(oldTrackCoverFile).catch(() => { });
  }

  cachedCovers.delete(albumId);
  cachedCovers.delete(trackId);
  scanned.coverBuffer = undefined;
  scanned.track.cover = undefined;

  try {
    await setTrackOverride(trackId, { cover: undefined });
  } catch {
    // bỏ qua
  }

  return c.json({ status: 200, message: 'Đã xóa ảnh bìa thành công' });
});

// 4.1c. API: Cập nhật ảnh bìa hàng loạt cho nhiều bài hát (Batch Cover Update)
app.post('/local-api/tracks/batch-cover', async (c) => {
  const body = await c.req.parseBody();
  const file = body['cover'];
  const rawIds = body['ids'];

  if (!file || !(file instanceof File)) {
    return c.json({ status: 400, error: 'File ảnh bìa không hợp lệ' }, 400);
  }

  let ids: string[] = [];
  if (typeof rawIds === 'string') {
    try {
      ids = JSON.parse(rawIds);
    } catch {
      ids = rawIds.split(',').map((s) => s.trim()).filter(Boolean);
    }
  } else if (Array.isArray(rawIds)) {
    ids = rawIds as string[];
  }

  if (ids.length === 0) {
    return c.json({ status: 400, error: 'Danh sách bài hát cần đổi bìa rỗng' }, 400);
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.mkdir(CUSTOM_COVERS_DIR, { recursive: true });

  let updatedCount = 0;
  for (const trackId of ids) {
    const scanned = cachedScannedTracks.find((t) => t.track.id === trackId);
    if (!scanned) continue;

    const albumId = scanned.track.albumId || `track_${trackId.slice(0, 8)}`;

    await fs.writeFile(path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`), buffer);
    await fs.writeFile(path.join(CUSTOM_COVERS_DIR, `${trackId}.jpg`), buffer);

    if (scanned.filePath && existsSync(scanned.filePath)) {
      try {
        const sidecarCoverPath = scanned.filePath.replace(path.extname(scanned.filePath), '.jpg');
        await fs.writeFile(sidecarCoverPath, buffer);
      } catch {
        // bỏ qua
      }
    }

    cachedCovers.set(albumId, buffer);
    cachedCovers.set(trackId, buffer);
    scanned.coverBuffer = buffer;
    scanned.track.cover = `covers/${trackId}.jpg`;

    try {
      await setTrackOverride(trackId, { cover: `covers/${trackId}.jpg` });
    } catch {
      // bỏ qua
    }
    updatedCount++;
  }

  const localConfig = loadLocalConfig();
  if (localConfig.isR2Configured && updatedCount > 0) {
    try {
      const uploader = new R2Uploader(localConfig as unknown as IndexerConfig);
      for (const trackId of ids) {
        const scanned = cachedScannedTracks.find((t) => t.track.id === trackId);
        const albumId = scanned?.track.albumId || `track_${trackId.slice(0, 8)}`;
        await uploader.uploadCover(albumId, buffer);
        await uploader.uploadCover(trackId, buffer);
      }
    } catch {
      // bỏ qua lỗi upload R2
    }
  }
  if (updatedCount > 0) {
    await autoSyncLibraryFastToR2();
  }

  return c.json({
    status: 200,
    updatedCount,
    message: `Đã cập nhật ảnh bìa mới thành công cho ${updatedCount} bài hát!`,
  });
});

async function fetchYouTubeCoverBuffer(
  track: { id: string; title: string; artist: string; filePath?: string }
): Promise<Buffer | null> {
  let targetVideoId: string | null = null;

  // 1. Kiểm tra trong youtube_downloads.json xem có videoId sẵn không
  try {
    const downloads = await youtubeJobRunner.getDownloads();
    const matched = downloads.find(
      (d) =>
        d.trackId === track.id ||
        (normalizeText(d.title || '') === normalizeText(track.title) &&
          normalizeText(d.artist || '') === normalizeText(track.artist))
    );
    if (matched && matched.videoId) {
      targetVideoId = matched.videoId;
    }
  } catch {
    // bỏ qua
  }

  // 2. Nếu chưa có videoId, tìm kiếm videoId chính xác bằng yt-dlp ytsearch1
  if (!targetVideoId) {
    try {
      const q = `${track.artist} ${track.title}`;
      const searchP = await new Promise<string | null>((resolve) => {
        execFile('yt-dlp', ['--print', '%(id)s', `ytsearch1:${q}`], (err, stdout) => {
          if (err || !stdout?.trim()) resolve(null);
          else {
            const firstLine = stdout.trim().split('\n')[0]?.trim();
            resolve(firstLine || null);
          }
        });
      });
      if (searchP) targetVideoId = searchP;
    } catch {
      // bỏ qua
    }
  }

  // 3. Xây dựng danh sách URLs ảnh bìa ưu tiên độ phân giải cao nhất (maxresdefault -> hqdefault)
  const candidateUrls: string[] = [];
  if (targetVideoId) {
    candidateUrls.push(`https://i.ytimg.com/vi/${targetVideoId}/maxresdefault.jpg`);
    candidateUrls.push(`https://i.ytimg.com/vi/${targetVideoId}/hqdefault.jpg`);
  }

  if (candidateUrls.length === 0) {
    return null;
  }

  // 4. Tải ảnh thumbnail về thư mục tạm và dùng ffmpeg crop tâm vuông 1:1, scale 600x600
  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (res.ok) {
        const rawBuf = Buffer.from(await res.arrayBuffer());
        if (rawBuf.length < 1500) continue; // tránh ảnh rỗng / placeholder 1x1

        const tempDir = path.join(os.tmpdir(), `beatify_cover_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
        await fs.mkdir(tempDir, { recursive: true });
        const rawPath = path.join(tempDir, 'raw.jpg');
        const squarePath = path.join(tempDir, 'square.jpg');

        await fs.writeFile(rawPath, rawBuf);

        const ffmpegProcess = await new Promise<{ exitCode: number }>((resolve) => {
          const p = spawn('ffmpeg', [
            '-y',
            '-i',
            rawPath,
            '-filter_complex',
            '[0:v]scale=1280:1280:force_original_aspect_ratio=increase,crop=1280:1280,boxblur=40:5,eq=brightness=-0.12[bg];[0:v]scale=1280:-1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2',
            '-q:v',
            '2',
            squarePath,
          ]);
          p.on('close', (code) => resolve({ exitCode: code ?? 1 }));
          p.on('error', () => resolve({ exitCode: 1 }));
        });

        let finalBuffer: Buffer | null = null;
        if (ffmpegProcess.exitCode === 0 && existsSync(squarePath)) {
          finalBuffer = await fs.readFile(squarePath);
        } else {
          finalBuffer = rawBuf;
        }

        try {
          if (existsSync(rawPath)) await fs.unlink(rawPath);
          if (existsSync(squarePath)) await fs.unlink(squarePath);
          await fs.rmdir(tempDir);
        } catch {
          // bỏ qua
        }

        if (finalBuffer && finalBuffer.length > 0) {
          return finalBuffer;
        }
      }
    } catch {
      // thử tiếp url dự phòng
    }
  }

  return null;
}

// 4.1e. API: Tự động tải lại ảnh bìa từ YouTube cho 1 bài hát
app.post('/local-api/tracks/:id/fetch-yt-cover', async (c) => {
  const trackId = c.req.param('id');
  const scanned = cachedScannedTracks.find((t) => t.track.id === trackId);
  if (!scanned) {
    return c.json({ status: 404, error: 'Không tìm thấy bài hát' }, 404);
  }

  const buffer = await fetchYouTubeCoverBuffer({
    id: trackId,
    title: scanned.track.title,
    artist: scanned.track.artist,
    filePath: scanned.filePath,
  });

  if (!buffer) {
    return c.json({ status: 500, error: 'Không thể tìm hoặc tải ảnh bìa từ YouTube cho bài hát này' }, 500);
  }

  const albumId = scanned.track.albumId || `track_${trackId.slice(0, 8)}`;
  await fs.mkdir(CUSTOM_COVERS_DIR, { recursive: true });
  await fs.writeFile(path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`), buffer);
  await fs.writeFile(path.join(CUSTOM_COVERS_DIR, `${trackId}.jpg`), buffer);

  if (scanned.filePath && existsSync(scanned.filePath)) {
    try {
      const sidecarCoverPath = scanned.filePath.replace(path.extname(scanned.filePath), '.jpg');
      await fs.writeFile(sidecarCoverPath, buffer);
    } catch {
      // bỏ qua
    }
  }

  cachedCovers.set(albumId, buffer);
  cachedCovers.set(trackId, buffer);
  scanned.coverBuffer = buffer;
  scanned.track.cover = `covers/${trackId}.jpg`;

  try {
    await setTrackOverride(trackId, { cover: `covers/${trackId}.jpg` });
  } catch {
    // bỏ qua
  }

  const localConfig = loadLocalConfig();
  if (localConfig.isR2Configured) {
    try {
      const uploader = new R2Uploader(localConfig as unknown as IndexerConfig);
      await uploader.uploadCover(albumId, buffer);
      await uploader.uploadCover(trackId, buffer);
    } catch {
      // bỏ qua lỗi upload R2
    }
  }

  await autoSyncLibraryFastToR2();

  return c.json({
    status: 200,
    albumId,
    trackId,
    coverUrl: `/local-api/covers/${trackId}.jpg?_t=${Date.now()}`,
    message: 'Đã tải và cập nhật ảnh bìa HD từ YouTube thành công!',
  });
});

// 4.1f. API: Tự động tải lại ảnh bìa từ YouTube cho nhiều bài hát (Hàng loạt)
app.post('/local-api/tracks/batch-fetch-yt-cover', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { ids?: string[] };
  const ids = Array.isArray(body.ids) ? body.ids : [];

  if (ids.length === 0) {
    return c.json({ status: 400, error: 'Danh sách bài hát cần tải bìa rỗng' }, 400);
  }

  await fs.mkdir(CUSTOM_COVERS_DIR, { recursive: true });
  const localConfig = loadLocalConfig();
  const uploader = localConfig.isR2Configured ? new R2Uploader(localConfig as unknown as IndexerConfig) : null;

  let successCount = 0;
  for (const trackId of ids) {
    const scanned = cachedScannedTracks.find((t) => t.track.id === trackId);
    if (!scanned) continue;

    try {
      const buffer = await fetchYouTubeCoverBuffer({
        id: trackId,
        title: scanned.track.title,
        artist: scanned.track.artist,
        filePath: scanned.filePath,
      });

      if (!buffer) continue;

      const albumId = scanned.track.albumId || `track_${trackId.slice(0, 8)}`;
      await fs.writeFile(path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`), buffer);
      await fs.writeFile(path.join(CUSTOM_COVERS_DIR, `${trackId}.jpg`), buffer);

      if (scanned.filePath && existsSync(scanned.filePath)) {
        try {
          const sidecarCoverPath = scanned.filePath.replace(path.extname(scanned.filePath), '.jpg');
          await fs.writeFile(sidecarCoverPath, buffer);
        } catch {
          // bỏ qua
        }
      }

      cachedCovers.set(albumId, buffer);
      cachedCovers.set(trackId, buffer);
      scanned.coverBuffer = buffer;
      scanned.track.cover = `covers/${trackId}.jpg`;

      try {
        await setTrackOverride(trackId, { cover: `covers/${trackId}.jpg` });
      } catch {
        // bỏ qua
      }

      if (uploader) {
        try {
          await uploader.uploadCover(albumId, buffer);
          await uploader.uploadCover(trackId, buffer);
        } catch {
          // bỏ qua
        }
      }

      successCount++;
    } catch {
      // bỏ qua bài lỗi, tiếp tục
    }
  }

  if (successCount > 0) {
    await autoSyncLibraryFastToR2();
  }

  return c.json({
    status: 200,
    successCount,
    total: ids.length,
    message: `Đã tải và cập nhật ảnh bìa YouTube thành công cho ${successCount}/${ids.length} bài hát!`,
  });
});

// 4.1d. API: Cập nhật ảnh bìa cho Playlist
app.post('/local-api/playlists/:id/cover', async (c) => {
  const playlistId = c.req.param('id');
  const body = await c.req.parseBody();
  const file = body['cover'];

  if (!file || !(file instanceof File)) {
    return c.json({ status: 400, error: 'File ảnh bìa không hợp lệ' }, 400);
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.mkdir(CUSTOM_COVERS_DIR, { recursive: true });

  const coverFileName = `playlist_${playlistId}.jpg`;
  await fs.writeFile(path.join(CUSTOM_COVERS_DIR, coverFileName), buffer);
  cachedCovers.set(`playlist_${playlistId}`, buffer);

  // Tải trực tiếp lên R2 nếu đã cấu hình
  const localConfig = loadLocalConfig();
  if (
    localConfig.isR2Configured &&
    localConfig.R2_ACCOUNT_ID &&
    localConfig.R2_ACCESS_KEY_ID &&
    localConfig.R2_SECRET_ACCESS_KEY &&
    localConfig.R2_BUCKET
  ) {
    try {
      const uploader = new R2Uploader({
        R2_ACCOUNT_ID: localConfig.R2_ACCOUNT_ID,
        R2_ACCESS_KEY_ID: localConfig.R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY: localConfig.R2_SECRET_ACCESS_KEY,
        R2_BUCKET: localConfig.R2_BUCKET,
        MUSIC_SOURCE_DIR: localConfig.MUSIC_SOURCE_DIR,
      });
      await uploader.uploadCover(`playlist_${playlistId}`, buffer);
    } catch {
      // Bỏ qua lỗi upload R2 tức thì
    }
  }

  return c.json({
    status: 200,
    coverUrl: `/local-api/covers/playlist_${playlistId}.jpg?_t=${Date.now()}`,
    message: 'Đã cập nhật ảnh bìa Playlist thành công!',
  });
});

// 4.1e. API: Xóa ảnh bìa của Playlist
app.delete('/local-api/playlists/:id/cover', async (c) => {
  const playlistId = c.req.param('id');
  const coverFileName = `playlist_${playlistId}.jpg`;
  const coverPath = path.join(CUSTOM_COVERS_DIR, coverFileName);

  if (existsSync(coverPath)) {
    await fs.unlink(coverPath).catch(() => {});
  }
  cachedCovers.delete(`playlist_${playlistId}`);

  return c.json({ status: 200, message: 'Đã xóa ảnh bìa Playlist thành công' });
});

// 4.2. API: Lấy lời bài hát
app.get('/local-api/tracks/:id/lyrics', async (c) => {
  const trackId = c.req.param('id');
  const customLrc = path.join(LYRICS_DIR, `${trackId}.lrc`);
  if (existsSync(customLrc)) {
    const content = await fs.readFile(customLrc, 'utf-8');
    return c.json({ status: 200, lyrics: content });
  }

  const scanned = cachedScannedTracks.find(t => t.track.id === trackId);
  if (scanned) {
    const sidecarLrc = scanned.filePath.replace(path.extname(scanned.filePath), '.lrc');
    if (existsSync(sidecarLrc)) {
      const content = await fs.readFile(sidecarLrc, 'utf-8');
      return c.json({ status: 200, lyrics: content });
    }
  }

  return c.json({ status: 200, lyrics: '' });
});

// 4.3. API: Lưu lời bài hát (.lrc)
app.post('/local-api/tracks/:id/lyrics', async (c) => {
  const trackId = c.req.param('id');
  const body = await c.req.json();
  const lyrics = (body.lyrics || '').trim();

  await fs.mkdir(LYRICS_DIR, { recursive: true });
  const lrcFile = path.join(LYRICS_DIR, `${trackId}.lrc`);

  if (!lyrics) {
    if (existsSync(lrcFile)) {
      await fs.unlink(lrcFile).catch(() => { });
    }
    const scanned = cachedScannedTracks.find(t => t.track.id === trackId);
    if (scanned) scanned.track.lyrics = undefined;
    await autoSyncLibraryFastToR2();
    return c.json({ status: 200, message: 'Đã gỡ lời bài hát' });
  }

  await fs.writeFile(lrcFile, lyrics, 'utf-8');
  const scanned = cachedScannedTracks.find(t => t.track.id === trackId);
  if (scanned) {
    scanned.track.lyrics = {
      file: `lyrics/${trackId}.lrc`,
      format: 'lrc',
      source: 'manual',
      reviewed: true,
    };
  }

  const localConfig = loadLocalConfig();
  if (localConfig.isR2Configured) {
    try {
      const uploader = new R2Uploader(localConfig as unknown as IndexerConfig);
      await uploader.uploadLyrics(`lyrics/${trackId}.lrc`, lyrics);
    } catch {
      // bỏ qua lỗi upload R2
    }
  }

  await autoSyncLibraryFastToR2();

  return c.json({ status: 200, message: 'Đã lưu lời bài hát thành công' });
});

// 4.4. API: Tự động quét & tải lời bài hát hàng loạt từ LRCLIB (Batch Auto-Fetch Lyrics)
app.post('/local-api/lyrics/batch-fetch', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { ids?: string[]; forceOverwrite?: boolean };
  const requestedIds = Array.isArray(body?.ids) && body.ids.length > 0 ? new Set(body.ids) : null;
  const forceOverwrite = Boolean(body?.forceOverwrite);

  const localConfig = loadLocalConfig();
  if (cachedScannedTracks.length === 0) {
    try {
      const files = await findAudioFiles(localConfig.MUSIC_SOURCE_DIR);
      const scanned: ScannedTrack[] = [];
      for (const f of files) {
        const tr = await scanAudioFile(f);
        if (tr) scanned.push(tr);
      }
      const overrides = await getOverrides();
      cachedScannedTracks = applyOverridesToScanned(scanned, overrides);
    } catch (e) {
      return c.json({ status: 500, error: 'Không thể quét danh sách bài hát: ' + String(e) }, 500);
    }
  }

  await fs.mkdir(LYRICS_DIR, { recursive: true });

  const targetTracks = cachedScannedTracks.filter((t) => {
    if (requestedIds) return requestedIds.has(t.track.id);
    if (forceOverwrite) return true;
    const lrcPath = path.join(LYRICS_DIR, `${t.track.id}.lrc`);
    return !existsSync(lrcPath);
  });

  if (targetTracks.length === 0) {
    return c.json({
      status: 200,
      message: 'Tất cả bài hát đã có lời hoặc không có bài phù hợp',
      total: 0,
      successCount: 0,
      notFoundCount: 0,
    });
  }

  let successCount = 0;
  let notFoundCount = 0;
  const results: Array<{ id: string; title: string; artist: string; success: boolean; source?: string }> = [];

  for (const item of targetTracks) {
    const track = item.track;
    try {
      let lrc = await LyricsService.fetchLyrics(track.title, track.artist, track.duration);
      if (!lrc?.syncedLyrics && !lrc?.plainLyrics && track.artist && track.title) {
        const flipped = await LyricsService.fetchLyrics(track.artist, track.title, track.duration);
        if (flipped?.syncedLyrics || flipped?.plainLyrics) {
          lrc = flipped;
        }
      }

      const lyricsContent = lrc?.syncedLyrics || lrc?.plainLyrics;
      if (lyricsContent) {
        const destPath = path.join(LYRICS_DIR, `${track.id}.lrc`);
        await fs.writeFile(destPath, lyricsContent, 'utf-8');
        successCount++;
        results.push({
          id: track.id,
          title: track.title,
          artist: track.artist,
          success: true,
          source: lrc?.syncedLyrics ? 'lrclib-synced' : 'lrclib-plain',
        });
      } else {
        notFoundCount++;
        results.push({ id: track.id, title: track.title, artist: track.artist, success: false });
      }
    } catch {
      notFoundCount++;
      results.push({ id: track.id, title: track.title, artist: track.artist, success: false });
    }
  }

  // Làm mới trạng thái cache
  cachedScannedTracks = [];
  invalidateStatusCache();

  if (successCount > 0 && localConfig.isR2Configured) {
    try {
      const uploader = new R2Uploader(localConfig as unknown as IndexerConfig);
      for (const res of results) {
        if (res.success) {
          const lrcPath = path.join(LYRICS_DIR, `${res.id}.lrc`);
          if (existsSync(lrcPath)) {
            const content = await fs.readFile(lrcPath, 'utf-8');
            await uploader.uploadLyrics(`lyrics/${res.id}.lrc`, content);
          }
        }
      }
    } catch {
      // bỏ qua lỗi upload R2
    }
    await autoSyncLibraryFastToR2();
  }

  return c.json({
    status: 200,
    message: `Đã hoàn tất tìm kiếm lời: ${successCount} bài thành công, ${notFoundCount} bài chưa tìm thấy`,
    total: targetTracks.length,
    successCount,
    notFoundCount,
    results,
  });
});

// 4.5. API: Quét và đo độ ồn chuẩn hóa âm lượng hàng loạt (Batch ReplayGain / LUFS Scanner)
app.post('/local-api/tracks/batch-replaygain', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { ids?: string[] };
  const requestedIds = Array.isArray(body?.ids) && body.ids.length > 0 ? new Set(body.ids) : null;

  const localConfig = loadLocalConfig();
  if (cachedScannedTracks.length === 0) {
    try {
      const files = await findAudioFiles(localConfig.MUSIC_SOURCE_DIR);
      const scanned: ScannedTrack[] = [];
      for (const f of files) {
        const tr = await scanAudioFile(f);
        if (tr) scanned.push(tr);
      }
      const overrides = await getOverrides();
      cachedScannedTracks = applyOverridesToScanned(scanned, overrides);
    } catch (e) {
      return c.json({ status: 500, error: 'Không thể quét danh sách bài hát: ' + String(e) }, 500);
    }
  }

  const targetTracks = cachedScannedTracks.filter((t) => {
    if (requestedIds) return requestedIds.has(t.track.id);
    // Mặc định quét những bài chưa có ReplayGain hoặc giá trị 0.0
    return t.track.replayGain === undefined || t.track.replayGain === 0;
  });

  if (targetTracks.length === 0) {
    return c.json({ status: 200, message: 'Tất cả bài hát đều đã được đo ReplayGain', total: 0, successCount: 0 });
  }

  let successCount = 0;
  let failedCount = 0;
  const results: Array<{ id: string; title: string; loudnessLufs: number; replayGain: number }> = [];

  for (const item of targetTracks) {
    try {
      const audioPath = item.filePath;
      if (!existsSync(audioPath)) {
        failedCount++;
        continue;
      }

      const res = await youtubeService.measureLoudness(audioPath);
      await setTrackOverride(item.track.id, {
        loudnessLufs: res.loudnessLufs,
        replayGain: res.replayGain,
      });

      successCount++;
      results.push({
        id: item.track.id,
        title: item.track.title,
        loudnessLufs: res.loudnessLufs,
        replayGain: res.replayGain,
      });
    } catch {
      failedCount++;
    }
  }

  // Làm mới trạng thái cache
  cachedScannedTracks = [];
  invalidateStatusCache();

  if (successCount > 0) {
    await autoSyncLibraryFastToR2();
  }

  return c.json({
    status: 200,
    message: `Đã đo độ ồn chuẩn ReplayGain cho ${successCount} bài hát thành công`,
    total: targetTracks.length,
    successCount,
    failedCount,
    results,
  });
});

// 5. API: Quét xem trước các file nhập mới (Import Preview / Inspect)
const handleImportInspect = async (c: Context) => {
  const body = await c.req.parseBody({ all: true });
  let rawFiles = body['files'];
  if (!rawFiles) rawFiles = body['file'];
  const files: File[] = Array.isArray(rawFiles)
    ? rawFiles.filter((f): f is File => f instanceof File)
    : rawFiles instanceof File
      ? [rawFiles]
      : [];

  if (files.length === 0) {
    return c.json({ status: 400, error: 'Không tìm thấy file tải lên' }, 400);
  }

  await fs.mkdir(TEMP_IMPORT_DIR, { recursive: true });

  const isImageFile = (name: string) => /\.(jpe?g|png|webp)$/i.test(name);
  const isAudioFile = (name: string) => /\.(mp3|m4a|flac|aac|wav)$/i.test(name);

  // 1. Phân loại ảnh bìa nếu người dùng kéo kèm file ảnh
  const imageFiles = files.filter(f => isImageFile(f.name));
  const audioFiles = files.filter(f => isAudioFile(f.name));

  let sharedTempCoverId: string | undefined;
  const firstImg = imageFiles[0];
  if (firstImg) {
    sharedTempCoverId = 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const arrBuf = await firstImg.arrayBuffer();
    await fs.writeFile(path.join(TEMP_IMPORT_DIR, `temp_cover_${sharedTempCoverId}.jpg`), Buffer.from(arrBuf));
  }

  const items = [];
  for (const f of audioFiles) {
    const tempId = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    const safeName = f.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const tempPath = path.join(TEMP_IMPORT_DIR, `${tempId}_${safeName}`);

    const arrayBuffer = await f.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    await fs.writeFile(tempPath, buf);

    let parsedMeta: mm.IAudioMetadata | null = null;
    try {
      parsedMeta = await mm.parseBuffer(buf, f.type || undefined);
    } catch {
      // nếu không đọc được tag thì dùng thông tin mặc định
    }

    const title = parsedMeta?.common.title?.trim() || path.parse(f.name).name;
    const artist = parsedMeta?.common.artist?.trim() || 'Chưa rõ nghệ sĩ';
    const album = parsedMeta?.common.album?.trim() || 'Single';
    const year = parsedMeta?.common.year ?? undefined;
    const duration = Math.round(parsedMeta?.format.duration || 0);

    let coverId: string | undefined;
    const picture = parsedMeta?.common.picture?.[0];
    if (picture) {
      coverId = 'emb_' + tempId;
      await fs.writeFile(path.join(TEMP_IMPORT_DIR, `temp_cover_${coverId}.jpg`), Buffer.from(picture.data));
    } else if (sharedTempCoverId) {
      coverId = sharedTempCoverId;
    }

    items.push({
      tempId,
      originalName: f.name,
      safeFileName: safeName,
      title,
      artist,
      album,
      year,
      duration,
      hasCover: Boolean(coverId),
      coverId,
    });
  }

  if (items.length === 0 && imageFiles.length > 0) {
    return c.json({ status: 400, error: 'Chỉ tìm thấy file ảnh, vui lòng kéo kèm file âm thanh (MP3, FLAC, M4A...)' }, 400);
  }

  return c.json({ status: 200, items, sharedCoverId: sharedTempCoverId });
};

app.post('/local-api/import/inspect', handleImportInspect);
app.post('/local-api/import/preview', handleImportInspect);

// 5.0a. API: Xem ảnh bìa xem trước khi nhập
app.get('/local-api/import/cover/:coverId', async (c) => {
  const coverId = c.req.param('coverId');
  const coverFile = path.join(TEMP_IMPORT_DIR, `temp_cover_${coverId}.jpg`);
  if (!existsSync(coverFile)) {
    return c.text('No cover', 404);
  }
  const buf = await fs.readFile(coverFile);
  return new Response(buf, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache' },
  });
});

// 5.0b. API: Tải lên ảnh bìa tùy chọn trong modal xem trước
app.post('/local-api/import/upload-cover', async (c) => {
  const body = await c.req.parseBody();
  const file = body['cover'];
  if (!file || !(file instanceof File)) {
    return c.json({ status: 400, error: 'File ảnh không hợp lệ' }, 400);
  }
  await fs.mkdir(TEMP_IMPORT_DIR, { recursive: true });
  const coverId = 'up_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const arrBuf = await file.arrayBuffer();
  await fs.writeFile(path.join(TEMP_IMPORT_DIR, `temp_cover_${coverId}.jpg`), Buffer.from(arrBuf));
  return c.json({ status: 200, coverId });
});

// 5.1. API: Xác nhận chuyển các file đã chọn vào kho (Commit Import)
const handleImportConfirm = async (c: Context) => {
  const localConfig = loadLocalConfig();
  const body = await c.req.json();
  const items = body.items as Array<{
    tempId: string;
    safeFileName: string;
    title: string;
    artist: string;
    album: string;
    year?: number;
    coverId?: string;
  }>;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return c.json({ status: 400, error: 'Không có bài hát nào được chọn' }, 400);
  }

  const targetDir = localConfig.MUSIC_IMPORT_DIR || localConfig.MUSIC_SOURCE_DIR;
  await fs.mkdir(targetDir, { recursive: true });
  await fs.mkdir(CUSTOM_COVERS_DIR, { recursive: true });

  let importedCount = 0;
  for (const item of items) {
    const tempPath = path.join(TEMP_IMPORT_DIR, `${item.tempId}_${item.safeFileName}`);
    if (existsSync(tempPath)) {
      const finalPath = path.join(targetDir, item.safeFileName);
      await fs.rename(tempPath, finalPath);
      importedCount++;

      // Gỡ bỏ trạng thái đã xóa/hủy nếu tệp này từng bị xóa trước đó
      try {
        const trackId = await calculateTrackId(finalPath);
        await restoreFromTrash(trackId);

        if (item.title || item.artist || item.album || item.year) {
          await setTrackOverride(trackId, {
            title: item.title,
            artist: item.artist,
            album: item.album,
            year: item.year,
          });
        }

        // Lưu ảnh bìa nếu có
        if (item.coverId) {
          const tempCoverPath = path.join(TEMP_IMPORT_DIR, `temp_cover_${item.coverId}.jpg`);
          if (existsSync(tempCoverPath)) {
            const albumArtist = item.artist || 'Unknown Artist';
            const albumTitle = item.album || 'Single';
            const albumKey = `${normalizeText(albumArtist)}|${normalizeText(albumTitle)}`;
            const albumId = crypto.createHash('sha1').update(albumKey).digest('hex').slice(0, 12);

            const coverBuf = await fs.readFile(tempCoverPath);
            await fs.writeFile(path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`), coverBuf);
            cachedCovers.set(albumId, coverBuf);
          }
        }

        // Tạo bản ghi trong youtubeJobRunner để quản lý tập trung tại trang Quản lý bài tải
        const ext = path.extname(item.safeFileName).replace('.', '').toLowerCase();
        const validFormat: 'm4a' | 'mp3' | 'flac' | 'opus' =
          ext === 'm4a' || ext === 'mp3' || ext === 'flac' || ext === 'opus' ? ext : 'm4a';

        let fileSizeBytes = 0;
        let fileModifiedAt = new Date().toISOString();
        try {
          const st = await fs.stat(finalPath);
          fileSizeBytes = st.size;
          fileModifiedAt = st.mtime.toISOString();
        } catch {
          // bỏ qua
        }

        await youtubeJobRunner.addOrUpdateDownload({
          id: trackId,
          jobId: 'local_import_' + Date.now(),
          videoId: 'local_' + trackId,
          sourceUrl: 'file://' + finalPath.replace(/\\/g, '/'),
          format: validFormat,
          libraryRootPath: targetDir,
          relativeFilePath: item.safeFileName,
          title: item.title || path.parse(item.safeFileName).name,
          artist: item.artist || 'Chưa rõ nghệ sĩ',
          album: item.album || 'Single',
          status: 'completed',
          fileExists: true,
          fileSizeBytes,
          fileModifiedAt,
          uploadedToR2: false,
          durationMismatchWarning: false,
          metadataSource: 'regex',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // Nếu người dùng chọn Upload ngay lên R2 sau khi nhập
        if (body.uploadToR2Immediately) {
          try {
            await youtubeJobRunner.uploadDownloadToR2(trackId);
          } catch (r2Err) {
            console.warn('Lỗi upload R2 tức thì sau khi import:', r2Err);
          }
        }
      } catch (err) {
        console.warn('Lỗi xử lý override/cover sau khi import:', err);
      }
    }
  }

  // Dọn dẹp các file rác còn sót lại trong temp_import
  try {
    const remaining = await fs.readdir(TEMP_IMPORT_DIR);
    for (const r of remaining) {
      await fs.unlink(path.join(TEMP_IMPORT_DIR, r)).catch(() => { });
    }
  } catch {
    // bỏ qua
  }

  return c.json({
    status: 200,
    importedCount,
    message: `Đã nhập thành công ${importedCount} bài hát vào kho nhạc!`,
  });
};

app.post('/local-api/import/confirm', handleImportConfirm);
app.post('/local-api/import/commit', handleImportConfirm);

// 5.2. API: Upload trực tiếp (fallback)
app.post('/local-api/upload', async (c) => {
  const localConfig = loadLocalConfig();
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || !(file instanceof File)) {
    return c.json({ status: 400, error: 'File không hợp lệ' }, 400);
  }

  const targetDir = localConfig.MUSIC_IMPORT_DIR || localConfig.MUSIC_SOURCE_DIR;
  await fs.mkdir(targetDir, { recursive: true });

  const safeFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const targetPath = path.join(targetDir, safeFileName);

  const arrayBuffer = await file.arrayBuffer();
  await fs.writeFile(targetPath, Buffer.from(arrayBuffer));

  try {
    const trackId = await calculateTrackId(targetPath);
    await restoreFromTrash(trackId);
  } catch (err) {
    console.warn('Lỗi xử lý override sau khi upload:', err);
  }

  return c.json({ status: 200, fileName: safeFileName });
});

// 6. API: Tiến trình đồng bộ R2 thời gian thực
app.get('/local-api/sync/progress', (c) => {
  return c.json({ status: 200, progress: currentSyncProgress });
});

// 6.0. API: Đồng bộ siêu tốc (Chỉ cập nhật library.json lên R2 trong < 0.5s)
app.post('/local-api/sync/fast', async (c) => {
  const result = await autoSyncLibraryFastToR2();
  if (result.success) {
    return c.json({ status: 200, message: 'Đã đồng bộ siêu tốc thư viện lên R2 thành công!' });
  }
  return c.json({ status: 500, error: result.error || 'Đồng bộ thất bại' }, 500);
});

// 6.1. API: Đồng bộ R2 (Áp dụng bộ lọc bài xóa/ẩn và cập nhật tiến trình thời gian thực)
app.post('/local-api/sync', async (c) => {
  const config = loadConfig();
  if (!config) {
    return c.json({ status: 400, error: 'Thiếu cấu hình R2 trong .env' }, 400);
  }

  currentSyncProgress = {
    active: true,
    step: 'Đang quét thư mục âm thanh trên máy tính...',
    current: 0,
    total: 0,
    percent: 5,
    error: null,
  };

  try {
    const files = await findAudioFiles(config.MUSIC_SOURCE_DIR);
    const rawTracks: ScannedTrack[] = [];
    for (const f of files) {
      const item = await scanAudioFile(f);
      if (item) rawTracks.push(item);
    }

    currentSyncProgress.step = 'Đang lọc bài hát và áp dụng siêu dữ liệu...';
    currentSyncProgress.percent = 15;

    const overrides = await getOverrides();
    const scannedTracks = applyOverridesToScanned(rawTracks, overrides);

    for (const item of scannedTracks) {
      const trackId = item.track.id;
      const albumId = item.track.albumId;
      const customTrackPath = path.join(CUSTOM_COVERS_DIR, `${trackId}.jpg`);
      const customAlbumPath = albumId ? path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`) : null;

      if (existsSync(customTrackPath)) {
        try {
          item.coverBuffer = await fs.readFile(customTrackPath);
          item.track.cover = `covers/${trackId}.jpg`;
        } catch {
          // bỏ qua
        }
      } else if (customAlbumPath && existsSync(customAlbumPath)) {
        try {
          item.coverBuffer = await fs.readFile(customAlbumPath);
          item.track.cover = `covers/${trackId}.jpg`;
        } catch {
          // bỏ qua
        }
      } else if (item.coverBuffer) {
        item.track.cover = `covers/${trackId}.jpg`;
      }
    }

    const { library, coversByAlbumId, coversByTrackId } = buildLibrary(scannedTracks);
    const uploader = new R2Uploader(config);

    // Gộp tất cả ảnh bìa (cả trackId và albumId) để tải lên R2
    const allCoversToUpload = new Map<string, Buffer>();
    for (const [tId, buf] of coversByTrackId.entries()) {
      allCoversToUpload.set(tId, buf);
    }
    for (const [aId, buf] of coversByAlbumId.entries()) {
      if (!allCoversToUpload.has(aId)) {
        allCoversToUpload.set(aId, buf);
      }
    }

    // Lấy danh sách keys đã có sẵn trên R2 để đồng bộ vi sai (Incremental Sync)
    const existingR2Keys = await getR2TrackKeys(true);
    const existingCoverKeys = await getR2CoverKeys(true);

    const totalSteps = scannedTracks.length + allCoversToUpload.size + 1;
    let completedSteps = 0;
    let newAudioUploaded = 0;
    let newCoversUploaded = 0;

    for (const [i, item] of scannedTracks.entries()) {
      completedSteps++;
      const pct = 15 + Math.round((completedSteps / totalSteps) * 70);
      const isAlreadyOnCloud = existingR2Keys.has(item.track.file);

      if (isAlreadyOnCloud) {
        currentSyncProgress = {
          active: true,
          step: `Đã có sẵn trên Cloud (${i + 1}/${scannedTracks.length}): "${item.track.title}"`,
          current: i + 1,
          total: scannedTracks.length,
          percent: pct,
          error: null,
        };
      } else {
        currentSyncProgress = {
          active: true,
          step: `Đang tải âm thanh mới (${i + 1}/${scannedTracks.length}): "${item.track.title}"`,
          current: i + 1,
          total: scannedTracks.length,
          percent: pct,
          error: null,
        };
        await uploader.uploadAudio(item.track.file, item.filePath);
        newAudioUploaded++;
        existingR2Keys.add(item.track.file);
      }
    }

    let coverIdx = 0;
    for (const [coverId, buffer] of allCoversToUpload.entries()) {
      coverIdx++;
      completedSteps++;
      const pct = 15 + Math.round((completedSteps / totalSteps) * 70);
      const coverKey = `covers/${coverId}.jpg`;
      const isCoverOnCloud = existingCoverKeys.has(coverKey);
      const hasCustomCover = existsSync(path.join(CUSTOM_COVERS_DIR, `${coverId}.jpg`));

      if (isCoverOnCloud && !hasCustomCover) {
        currentSyncProgress = {
          active: true,
          step: `Ảnh bìa đã có sẵn trên Cloud (${coverIdx}/${allCoversToUpload.size})...`,
          current: coverIdx,
          total: allCoversToUpload.size,
          percent: pct,
          error: null,
        };
      } else {
        currentSyncProgress = {
          active: true,
          step: `Đang tải ảnh bìa (${coverIdx}/${allCoversToUpload.size})...`,
          current: coverIdx,
          total: allCoversToUpload.size,
          percent: pct,
          error: null,
        };
        await uploader.uploadCover(coverId, buffer);
        newCoversUploaded++;
        existingCoverKeys.add(coverKey);
      }
    }

    for (const item of scannedTracks) {
      if (item.track.lyrics?.file) {
        const lrcFile = path.join(LYRICS_DIR, `${item.track.id}.lrc`);
        const sidecarLrc = item.filePath.replace(path.extname(item.filePath), '.lrc');
        let text = '';
        if (existsSync(lrcFile)) {
          text = await fs.readFile(lrcFile, 'utf-8');
        } else if (existsSync(sidecarLrc)) {
          text = await fs.readFile(sidecarLrc, 'utf-8');
        }
        if (text) {
          await uploader.uploadLyrics(item.track.lyrics.file, text);
        }
      }
    }

    currentSyncProgress = {
      active: true,
      step: 'Đang kiểm tra đối chiếu tệp thực tế và cập nhật library.json lên R2...',
      current: totalSteps,
      total: totalSteps,
      percent: 95,
      error: null,
    };

    // Reconciliation Guard: Đảm bảo library.tracks CHỈ chứa các bài thực sự có file âm thanh trên R2
    const validTracks = library.tracks.filter((t) => existingR2Keys.has(t.file));
    if (validTracks.length !== library.tracks.length) {
      console.warn(`[Sync Guard] Đã loại bỏ ${library.tracks.length - validTracks.length} bài hát không tồn tại file trên R2 khỏi library.json`);
      library.tracks = validTracks;
      const validAlbumIds = new Set(validTracks.map((t) => t.albumId).filter(Boolean));
      library.albums = library.albums.filter((a) => validAlbumIds.has(a.id));
    }

    await uploader.uploadLibrary(library);

    // Đồng bộ trạng thái "Đã lên Cloud" cho các bài trong danh sách tải YouTube
    try {
      const uploadedTrackIds = new Set(library.tracks.map((t) => t.id));
      await youtubeJobRunner.syncUploadedTrackIds(uploadedTrackIds);
    } catch {
      // bỏ qua lỗi cập nhật lịch sử tải
    }

    currentSyncProgress = {
      active: false,
      step: `Đồng bộ hoàn tất: ${library.tracks.length} bài hát (mới tải: ${newAudioUploaded} bài, ${newCoversUploaded} bìa)!`,
      current: totalSteps,
      total: totalSteps,
      percent: 100,
      error: null,
    };

    invalidateStatusCache();

    return c.json({
      status: 200,
      message: 'Đồng bộ R2 hoàn tất',
      trackCount: library.tracks.length,
      albumCount: library.albums.length,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    currentSyncProgress = {
      active: false,
      step: `Lỗi đồng bộ: ${errMsg}`,
      current: 0,
      total: 0,
      percent: 0,
      error: errMsg,
    };
    return c.json({ status: 500, error: 'Lỗi khi đồng bộ R2: ' + errMsg }, 500);
  }
});

// 6.2. API: Quét các file thừa/mồ côi trên Cloudflare R2
app.get('/local-api/r2/orphans', async (c) => {
  const localConfig = loadLocalConfig();
  if (
    !localConfig.isR2Configured ||
    !localConfig.R2_ACCOUNT_ID ||
    !localConfig.R2_ACCESS_KEY_ID ||
    !localConfig.R2_SECRET_ACCESS_KEY ||
    !localConfig.R2_BUCKET
  ) {
    return c.json({ status: 400, error: 'Chưa cấu hình R2 trong .env' }, 400);
  }

  try {
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${localConfig.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: localConfig.R2_ACCESS_KEY_ID,
        secretAccessKey: localConfig.R2_SECRET_ACCESS_KEY,
      },
    });

    const res = await s3.send(new ListObjectsV2Command({ Bucket: localConfig.R2_BUCKET }));
    const objects = res.Contents || [];

    // Lấy danh sách file đang hoạt động trên máy tính
    const files = await findAudioFiles(localConfig.MUSIC_SOURCE_DIR);
    const rawTracks: ScannedTrack[] = [];
    for (const f of files) {
      const item = await scanAudioFile(f);
      if (item) rawTracks.push(item);
    }
    const overrides = await getOverrides();
    const activeTracks = applyOverridesToScanned(rawTracks, overrides);

    const validKeys = new Set<string>();
    validKeys.add('library.json');
    for (const o of objects) {
      if (o.Key && o.Key.startsWith('_meta/')) {
        validKeys.add(o.Key);
      }
    }
    for (const t of activeTracks) {
      validKeys.add(t.track.file);
      if (t.track.albumId) {
        validKeys.add(`covers/${t.track.albumId}.jpg`);
      }
      if (t.track.lyrics?.file) {
        validKeys.add(t.track.lyrics.file);
      }
    }

    const orphans = objects
      .filter((o): o is typeof o & { Key: string } => Boolean(o.Key && !validKeys.has(o.Key)))
      .map((o) => ({
        key: o.Key,
        sizeBytes: o.Size || 0,
        sizeMB: ((o.Size || 0) / (1024 * 1024)).toFixed(2),
        lastModified: o.LastModified?.toISOString() || '',
      }));

    const totalOrphanBytes = orphans.reduce((acc, o) => acc + o.sizeBytes, 0);

    return c.json({
      status: 200,
      orphans,
      totalCount: orphans.length,
      totalMB: (totalOrphanBytes / (1024 * 1024)).toFixed(2),
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 500, error: 'Lỗi quét file thừa R2: ' + errMsg }, 500);
  }
});

// 6.3. API: Dọn dẹp/xóa các file thừa trên Cloudflare R2 sau khi người dùng xác nhận
app.post('/local-api/r2/prune', async (c) => {
  const localConfig = loadLocalConfig();
  if (
    !localConfig.isR2Configured ||
    !localConfig.R2_ACCOUNT_ID ||
    !localConfig.R2_ACCESS_KEY_ID ||
    !localConfig.R2_SECRET_ACCESS_KEY ||
    !localConfig.R2_BUCKET
  ) {
    return c.json({ status: 400, error: 'Chưa cấu hình R2 trong .env' }, 400);
  }

  let keys: string[] = [];
  try {
    const body = await c.req.json();
    if (Array.isArray(body.keys)) {
      keys = body.keys;
    }
  } catch {
    // không có body
  }

  try {
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${localConfig.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: localConfig.R2_ACCESS_KEY_ID,
        secretAccessKey: localConfig.R2_SECRET_ACCESS_KEY,
      },
    });

    if (keys.length === 0) {
      const res = await s3.send(new ListObjectsV2Command({ Bucket: localConfig.R2_BUCKET }));
      const objects = res.Contents || [];
      const files = await findAudioFiles(localConfig.MUSIC_SOURCE_DIR);
      const rawTracks: ScannedTrack[] = [];
      for (const f of files) {
        const item = await scanAudioFile(f);
        if (item) rawTracks.push(item);
      }
      const overrides = await getOverrides();
      const activeTracks = applyOverridesToScanned(rawTracks, overrides);

      const validKeys = new Set<string>();
      validKeys.add('library.json');
      for (const o of objects) {
        if (o.Key && o.Key.startsWith('_meta/')) {
          validKeys.add(o.Key);
        }
      }
      for (const t of activeTracks) {
        validKeys.add(t.track.file);
        if (t.track.albumId) validKeys.add(`covers/${t.track.albumId}.jpg`);
        if (t.track.lyrics?.file) validKeys.add(t.track.lyrics.file);
      }

      keys = objects.filter((o): o is typeof o & { Key: string } => Boolean(o.Key && !validKeys.has(o.Key))).map((o) => o.Key);
    }

    let deletedCount = 0;
    for (const k of keys) {
      if (k !== 'library.json' && !k.startsWith('_meta/')) {
        await s3.send(new DeleteObjectCommand({ Bucket: localConfig.R2_BUCKET, Key: k }));
        deletedCount++;
      }
    }

    return c.json({
      status: 200,
      deletedCount,
      message: `Đã dọn dẹp xóa thành công ${deletedCount} file thừa trên Cloudflare R2!`,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 500, error: 'Lỗi dọn dẹp R2: ' + errMsg }, 500);
  }
});

// 7. API: Chỉnh sửa thông tin bài hát (Non-destructive Metadata Override)
app.post('/local-api/tracks/:id/override', async (c) => {
  const id = c.req.param('id');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ status: 400, error: 'Dữ liệu JSON không hợp lệ' }, 400);
  }

  const parsed = TrackOverrideSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      status: 400,
      error: 'Dữ liệu không hợp lệ: ' + parsed.error.issues.map((e) => e.message).join(', '),
    }, 400);
  }
  await setTrackOverride(id, parsed.data);
  invalidateStatusCache();
  await autoSyncLibraryFastToR2();
  return c.json({
    status: 200,
    message: 'Đã lưu thông tin bài hát (override) thành công',
    data: parsed.data,
  });
});

// 7.1. API: Chỉnh sửa hàng loạt (Batch Override)
app.post('/local-api/tracks/batch-override', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ status: 400, error: 'Dữ liệu JSON không hợp lệ' }, 400);
  }
  const { trackIds, artist, album, coverId } = body as {
    trackIds: string[];
    artist?: string;
    album?: string;
    coverId?: string;
  };

  if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
    return c.json({ status: 400, error: 'Chưa chọn bài hát nào' }, 400);
  }

  for (const id of trackIds) {
    const updateObj: Record<string, string> = {};
    if (artist?.trim()) updateObj.artist = artist.trim();
    if (album?.trim()) updateObj.album = album.trim();
    if (Object.keys(updateObj).length > 0) {
      await setTrackOverride(id, updateObj);
    }

    if (coverId) {
      const tempCover = path.join(TEMP_IMPORT_DIR, `temp_cover_${coverId}.jpg`);
      if (existsSync(tempCover)) {
        const track = cachedScannedTracks.find((t) => t.track.id === id);
        const finalArtist = artist?.trim() || track?.track.artist || 'Unknown Artist';
        const finalAlbum = album?.trim() || track?.track.album || 'Single';
        const albumKey = `${normalizeText(finalArtist)}|${normalizeText(finalAlbum)}`;
        const albumId = crypto.createHash('sha1').update(albumKey).digest('hex').slice(0, 12);
        const coverBuf = await fs.readFile(tempCover);
        await fs.mkdir(CUSTOM_COVERS_DIR, { recursive: true });
        await fs.writeFile(path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`), coverBuf);
        cachedCovers.set(albumId, coverBuf);
      }
    }
  }

  invalidateStatusCache();
  await autoSyncLibraryFastToR2();
  return c.json({ status: 200, count: trackIds.length, message: `Đã áp dụng thay đổi cho ${trackIds.length} bài hát!` });
});

// 7.2. API: Chuyển thùng rác hàng loạt (Batch Trash)
app.post('/local-api/tracks/batch-trash', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ status: 400, error: 'Dữ liệu JSON không hợp lệ' }, 400);
  }
  const { trackIds } = body as { trackIds: string[] };

  if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
    return c.json({ status: 400, error: 'Chưa chọn bài hát nào' }, 400);
  }

  for (const id of trackIds) {
    await moveToTrash(id);
  }

  invalidateStatusCache();
  await autoSyncLibraryFastToR2();
  return c.json({ status: 200, count: trackIds.length, message: `Đã chuyển ${trackIds.length} bài hát vào thùng rác!` });
});

// 8. API: Cập nhật thư mục lưu trữ nhạc trên máy tính
app.post('/local-api/config/folders', async (c) => {
  let body: Record<string, string> | undefined;
  try {
    body = (await c.req.json()) as Record<string, string>;
  } catch {
    return c.json({ status: 400, error: 'Dữ liệu JSON không hợp lệ' }, 400);
  }

  const sourceDir = body?.sourceDir?.trim();
  if (!sourceDir) {
    return c.json({ status: 400, error: 'Vui lòng điền đường dẫn thư mục nguồn' }, 400);
  }
  try {
    const res = await updateFoldersConfig(sourceDir, body?.importDir);
    return c.json({
      status: 200,
      message: 'Đã cập nhật thư mục lưu trữ thành công',
      data: res,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({
      status: 500,
      error: 'Lỗi khi cập nhật thư mục: ' + msg,
    }, 500);
  }
});

// 8.1. API: Mở hộp thoại chọn thư mục Windows nguyên bản
app.post('/local-api/browse-folder', async (c) => {
  let initialPath: string | undefined;
  try {
    const body = (await c.req.json()) as { initialPath?: string };
    initialPath = body.initialPath;
  } catch {
    // bỏ qua
  }
  const pickedPath = await pickFolderNative(initialPath);
  return c.json({
    status: 200,
    path: pickedPath,
  });
});

// 8.2. API: Khám phá thư mục dạng cây / danh sách ngang (Horizontal Tree Explorer)
app.get('/local-api/fs/explore', async (c) => {
  try {
    const localConfig = loadLocalConfig();
    const queryPath = c.req.query('path')?.trim();

    // Xác định đường dẫn cần khám phá
    let targetPath = queryPath || localConfig.MUSIC_SOURCE_DIR;
    if (!targetPath || !existsSync(targetPath)) {
      targetPath = localConfig.MUSIC_SOURCE_DIR;
    }
    targetPath = path.resolve(targetPath);

    // Chặn duyệt vào thư mục hệ thống Windows nhạy cảm
    if (isSystemDirectory(targetPath)) {
      targetPath = path.resolve(localConfig.MUSIC_SOURCE_DIR || process.cwd());
    }

    // Danh sách ổ đĩa khả dụng trên Windows
    const availableDrives: string[] = [];
    if (process.platform === 'win32') {
      const driveLetters = ['C', 'D', 'E', 'F', 'G'];
      for (const letter of driveLetters) {
        const driveRoot = `${letter}:\\`;
        if (existsSync(driveRoot)) {
          availableDrives.push(driveRoot);
        }
      }
    }

    // Danh sách Quick Roots (Thư viện chính, Đã nhập...)
    const quickRoots = [
      { name: 'Thư viện nhạc (MUSIC_SOURCE_DIR)', path: localConfig.MUSIC_SOURCE_DIR },
      ...(localConfig.MUSIC_IMPORT_DIR && localConfig.MUSIC_IMPORT_DIR !== localConfig.MUSIC_SOURCE_DIR
        ? [{ name: 'Thư mục nhập (_imported)', path: localConfig.MUSIC_IMPORT_DIR }]
        : []),
    ];

    // Tạo Breadcrumbs
    const breadcrumbs: { name: string; path: string }[] = [];
    let cur = targetPath;
    while (cur) {
      const name = path.basename(cur) || cur;
      breadcrumbs.unshift({ name, path: cur });
      const parent = path.dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }

    const parentPath = path.dirname(targetPath) !== targetPath ? path.dirname(targetPath) : null;

    // Đọc các thư mục con
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    const directories: { name: string; path: string; hasSubfolders: boolean; subCount: number }[] = [];

    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        !entry.name.startsWith('$') &&
        entry.name !== 'System Volume Information'
      ) {
        const subPath = path.join(targetPath, entry.name);
        if (isSystemDirectory(subPath)) continue;
        let hasSub = false;
        let subCount = 0;
        try {
          const subEntries = await fs.readdir(subPath, { withFileTypes: true });
          const subDirs = subEntries.filter((e) => e.isDirectory() && !e.name.startsWith('.'));
          hasSub = subDirs.length > 0;
          subCount = subDirs.length;
        } catch {
          // bỏ qua lỗi quyền truy cập
        }
        directories.push({
          name: entry.name,
          path: subPath,
          hasSubfolders: hasSub,
          subCount,
        });
      }
    }

    directories.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    return c.json({
      status: 200,
      data: {
        currentPath: targetPath,
        parentPath,
        breadcrumbs,
        directories,
        availableDrives,
        quickRoots,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 500, error: msg }, 500);
  }
});

// 8.3. API: Tạo thư mục mới ngay trong Web Dashboard
app.post('/local-api/fs/mkdir', async (c) => {
  try {
    const body = (await c.req.json()) as { parentPath: string; folderName: string };
    const parentPath = (body.parentPath || '').trim();
    const folderName = (body.folderName || '').trim();

    if (!parentPath || !existsSync(parentPath)) {
      return c.json({ status: 400, error: 'Thư mục cha không tồn tại' }, 400);
    }
    if (!folderName) {
      return c.json({ status: 400, error: 'Vui lòng nhập tên thư mục mới' }, 400);
    }

    const safeName = PathSanitizer.sanitizeSegment(folderName);
    const newPath = path.join(parentPath, safeName);

    if (existsSync(newPath)) {
      return c.json({ status: 400, error: 'Thư mục với tên này đã tồn tại' }, 400);
    }

    await fs.mkdir(newPath, { recursive: true });

    return c.json({
      status: 200,
      data: {
        createdPath: newPath,
        name: safeName,
        message: `Đã tạo thư mục "${safeName}" thành công!`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 500, error: msg }, 500);
  }
});

// 8.4. API: Đổi tên thư mục ngay trong Web Dashboard
app.post('/local-api/fs/rename', async (c) => {
  try {
    const body = (await c.req.json()) as { currentPath: string; newName: string };
    const currentPath = (body.currentPath || '').trim();
    const newName = (body.newName || '').trim();

    if (!currentPath || !existsSync(currentPath)) {
      return c.json({ status: 400, error: 'Thư mục cần đổi tên không tồn tại' }, 400);
    }
    if (!newName) {
      return c.json({ status: 400, error: 'Vui lòng nhập tên thư mục mới' }, 400);
    }

    const parentDir = path.dirname(currentPath);
    const safeName = PathSanitizer.sanitizeSegment(newName);
    const targetPath = path.join(parentDir, safeName);

    if (targetPath.toLowerCase() !== currentPath.toLowerCase() && existsSync(targetPath)) {
      return c.json({ status: 400, error: 'Tên thư mục này đã tồn tại ở thư mục cha' }, 400);
    }

    await fs.rename(currentPath, targetPath);

    return c.json({
      status: 200,
      data: {
        newPath: targetPath,
        name: safeName,
        message: `Đã đổi tên thành "${safeName}" thành công!`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 500, error: msg }, 500);
  }
});

// 8.5. API: Xóa thư mục ngay trong Web Dashboard (an toàn)
app.post('/local-api/fs/delete', async (c) => {
  try {
    const localConfig = loadLocalConfig();
    const body = (await c.req.json()) as { folderPath: string };
    const folderPath = (body.folderPath || '').trim();

    if (!folderPath) {
      return c.json({ status: 400, error: 'Đường dẫn thư mục không hợp lệ' }, 400);
    }

    const normPath = path.resolve(folderPath);

    if (!existsSync(normPath)) {
      return c.json({ status: 400, error: 'Thư mục không tồn tại' }, 400);
    }

    const allowedRoots = [
      localConfig.MUSIC_IMPORT_DIR,
      TEMP_IMPORT_DIR,
    ].filter(Boolean) as string[];

    const protectedRoots = [
      localConfig.MUSIC_SOURCE_DIR,
      process.cwd(),
    ].filter(Boolean) as string[];

    const check = isSafeDeletePath(normPath, allowedRoots, protectedRoots);
    if (!check.safe) {
      return c.json({ status: 403, error: check.reason || 'Thao tác xóa bị từ chối do vi phạm quy tắc an toàn' }, 403);
    }

    const folderName = path.basename(normPath);
    await fs.rm(normPath, { recursive: true, force: true });

    return c.json({
      status: 200,
      data: {
        deletedPath: normPath,
        name: folderName,
        message: `Đã xóa thư mục "${folderName}" thành công!`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 500, error: msg }, 500);
  }
});

// 9. API: Danh sách bài hát trong Thùng rác (Trash)
app.get('/local-api/trash', async (c) => {
  const localConfig = loadLocalConfig();
  const overrides = await getOverrides();
  const trashEntries = Object.entries(overrides.tracks || {}).filter(
    ([, ov]) => Boolean(ov?.deletedAt && !ov?.purged)
  );

  if (trashEntries.length === 0) {
    return c.json({ status: 200, trash: [] });
  }

  // Quét các file âm thanh trên đĩa cứng để bổ sung thông tin tệp nếu có
  const allFiles: string[] = [];
  try {
    if (localConfig.MUSIC_SOURCE_DIR && existsSync(localConfig.MUSIC_SOURCE_DIR)) {
      const srcFiles = await findAudioFiles(localConfig.MUSIC_SOURCE_DIR);
      allFiles.push(...srcFiles);
    }
    if (localConfig.MUSIC_IMPORT_DIR && existsSync(localConfig.MUSIC_IMPORT_DIR)) {
      const importFiles = await findAudioFiles(localConfig.MUSIC_IMPORT_DIR);
      allFiles.push(...importFiles);
    }
  } catch {
    // bỏ qua lỗi quét đĩa
  }

  // Lấy lịch sử tải để tra cứu nhanh nếu bài được tải từ YouTube
  let downloads: YoutubeMusicDownloadRecord[] = [];
  try {
    downloads = await youtubeJobRunner.getDownloads(1000);
  } catch {
    // bỏ qua
  }

  const trashItems = [];

  for (const [trackId, ov] of trashEntries) {
    const deletedDate = ov.deletedAt ? new Date(ov.deletedAt) : new Date();
    const now = new Date();
    const elapsedDays = Math.floor((now.getTime() - deletedDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysLeft = Math.max(0, 14 - elapsedDays);

    // 1. Tra cứu trong cachedScannedTracks
    const cachedItem = cachedScannedTracks.find((t) => t.track.id === trackId);
    let format = cachedItem ? path.extname(cachedItem.filePath).toUpperCase().replace('.', '') : undefined;
    let hasCover = Boolean(cachedItem?.coverBuffer || cachedItem?.track?.cover);
    let fileSizeMB: string | undefined;

    // 2. Tra cứu trong lịch sử downloads
    if (!format) {
      const dlItem = downloads.find((d) => d.trackId === trackId || d.id === trackId);
      if (dlItem) {
        format = dlItem.format ? dlItem.format.toUpperCase() : 'M4A';
        hasCover = Boolean(dlItem.coverExists || dlItem.relativeCoverPath);
        if (dlItem.fileSizeBytes) {
          fileSizeMB = (dlItem.fileSizeBytes / (1024 * 1024)).toFixed(2);
        }
      }
    }

    // 3. Tra cứu trên đĩa cứng nếu chưa có
    if (!format && allFiles.length > 0) {
      for (const f of allFiles) {
        try {
          const item = await scanAudioFile(f);
          if (item?.track?.id === trackId) {
            format = path.extname(f).toUpperCase().replace('.', '');
            hasCover = Boolean(item.coverBuffer);
            break;
          }
        } catch {
          // bỏ qua
        }
      }
    }

    trashItems.push({
      id: trackId,
      title: ov.title || cachedItem?.track?.title || 'Chưa rõ tiêu đề',
      artist: ov.artist || cachedItem?.track?.artist || 'Chưa rõ nghệ sĩ',
      album: ov.album || cachedItem?.track?.album || 'Single',
      albumId: cachedItem?.track?.albumId,
      format: format || 'M4A',
      deletedAt: ov.deletedAt,
      daysLeft,
      hasCover,
      fileSizeMB,
    });
  }

  return c.json({ status: 200, trash: trashItems });
});

// 10. API: Chuyển bài hát vào Thùng rác
app.post('/local-api/tracks/:id/trash', async (c) => {
  const id = c.req.param('id');
  await moveToTrash(id);
  invalidateStatusCache();
  await autoSyncLibraryFastToR2();
  return c.json({ status: 200, message: 'Đã chuyển vào thùng rác (lưu trữ 14 ngày)' });
});

// 10b. API: Chuyển nhiều bài hát vào Thùng rác hàng loạt
app.post('/local-api/tracks/batch/trash', async (c) => {
  const body = (await c.req.json()) as { ids?: string[] };
  const ids = body.ids || [];
  for (const id of ids) {
    await moveToTrash(id);
  }
  invalidateStatusCache();
  await autoSyncLibraryFastToR2();
  return c.json({
    status: 200,
    message: `Đã chuyển ${ids.length} bài hát vào thùng rác (lưu trữ 14 ngày)`,
  });
});

// Helper dọn dẹp tài nguyên (lời, ảnh bìa, file Cloudflare R2) khi xóa vĩnh viễn bài hát
async function cleanPurgeTrackResources(
  id: string,
  deleteFromR2: boolean,
  s3?: S3Client,
  bucket?: string
): Promise<{ r2Deleted: boolean }> {
  // 1. Dọn dẹp file lời bài hát cục bộ nếu có
  const localLrc = path.join(LYRICS_DIR, `${id}.lrc`);
  if (existsSync(localLrc)) {
    await fs.unlink(localLrc).catch(() => { });
  }

  // 2. Kiểm tra và dọn dẹp ảnh bìa album nếu không còn bài hát nào khác dùng chung
  const targetTrack = cachedScannedTracks.find((t) => t.track.id === id);
  const targetAlbumId = targetTrack?.track.albumId;
  let albumStillInUse = false;
  if (targetAlbumId) {
    albumStillInUse = cachedScannedTracks.some((t) => t.track.id !== id && t.track.albumId === targetAlbumId);
    if (!albumStillInUse) {
      const coverPath = path.join(CUSTOM_COVERS_DIR, `${targetAlbumId}.jpg`);
      if (existsSync(coverPath)) {
        await fs.unlink(coverPath).catch(() => { });
      }
      cachedCovers.delete(targetAlbumId);
    }
  }

  let r2Deleted = false;
  if (deleteFromR2 && s3 && bucket) {
    try {
      const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'music/' }));
      if (res.Contents) {
        for (const item of res.Contents) {
          if (item.Key && item.Key.includes(id)) {
            await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: item.Key }));
            r2Deleted = true;
          }
        }
      }

      // Xóa lời trên R2 nếu có
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: `lyrics/${id}.lrc` })).catch(() => { });

      // Xóa ảnh bìa trên R2 nếu album không còn bài nào khác
      if (targetAlbumId && !albumStillInUse) {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: `covers/${targetAlbumId}.jpg` })).catch(() => { });
      }
    } catch (e) {
      console.warn(`Lỗi xóa file trên R2 khi purge (${id}):`, e);
    }
  }

  return { r2Deleted };
}

// 11. API: Khôi phục bài hát từ Thùng rác (đơn lẻ)
app.post('/local-api/tracks/:id/restore', async (c) => {
  const id = c.req.param('id');
  await restoreFromTrash(id);
  invalidateStatusCache();
  await autoSyncLibraryFastToR2();
  return c.json({ status: 200, message: 'Đã khôi phục bài hát thành công' });
});

// 11.2. API: Khôi phục nhiều bài hát hoặc toàn bộ bài từ Thùng rác (hàng loạt)
app.post('/local-api/trash/restore', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { ids?: string[] };
  const ids = Array.isArray(body?.ids) ? body.ids : undefined;
  await batchRestoreFromTrash(ids);
  invalidateStatusCache();
  await autoSyncLibraryFastToR2();
  return c.json({
    status: 200,
    message: ids && ids.length > 0
      ? `Đã khôi phục ${ids.length} bài hát thành công`
      : 'Đã khôi phục toàn bộ bài hát trong thùng rác',
  });
});

// 12. API: Xóa vĩnh viễn khỏi Thùng rác (đơn lẻ, hỗ trợ tùy chọn xóa đồng thời trên R2)
app.delete('/local-api/tracks/:id/trash', async (c) => {
  const id = c.req.param('id');
  const deleteFromR2 = c.req.query('deleteFromR2') === 'true';
  await purgeFromTrash(id);
  invalidateStatusCache();
  await autoSyncLibraryFastToR2();

  let s3: S3Client | undefined;
  let bucket: string | undefined;
  if (deleteFromR2) {
    const localConfig = loadLocalConfig();
    if (
      localConfig.isR2Configured &&
      localConfig.R2_ACCOUNT_ID &&
      localConfig.R2_ACCESS_KEY_ID &&
      localConfig.R2_SECRET_ACCESS_KEY &&
      localConfig.R2_BUCKET
    ) {
      s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${localConfig.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: localConfig.R2_ACCESS_KEY_ID,
          secretAccessKey: localConfig.R2_SECRET_ACCESS_KEY,
        },
      });
      bucket = localConfig.R2_BUCKET;
    }
  }

  const { r2Deleted } = await cleanPurgeTrackResources(id, deleteFromR2, s3, bucket);

  return c.json({
    status: 200,
    message: r2Deleted
      ? 'Đã xóa vĩnh viễn khỏi thùng rác và đã xóa file tương ứng trên Cloudflare R2'
      : 'Đã xóa vĩnh viễn khỏi thùng rác',
    r2Deleted,
  });
});

// 12.2. API: Dọn sạch hoặc xóa vĩnh viễn nhiều bài hát trong Thùng rác (Empty Trash / Batch Purge)
app.post('/local-api/trash/empty', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { ids?: string[]; deleteFromR2?: boolean };
  const deleteFromR2 = Boolean(body?.deleteFromR2);
  const overrides = await getOverrides();

  const targetIds = Array.isArray(body?.ids) && body.ids.length > 0
    ? body.ids
    : Object.keys(overrides.tracks).filter((id) => overrides.tracks[id]?.hidden && !overrides.tracks[id]?.purged);

  if (targetIds.length === 0) {
    return c.json({ status: 200, message: 'Thùng rác hiện đang trống', purgedCount: 0 });
  }

  let s3: S3Client | undefined;
  let bucket: string | undefined;
  if (deleteFromR2) {
    const localConfig = loadLocalConfig();
    if (
      localConfig.isR2Configured &&
      localConfig.R2_ACCOUNT_ID &&
      localConfig.R2_ACCESS_KEY_ID &&
      localConfig.R2_SECRET_ACCESS_KEY &&
      localConfig.R2_BUCKET
    ) {
      s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${localConfig.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: localConfig.R2_ACCESS_KEY_ID,
          secretAccessKey: localConfig.R2_SECRET_ACCESS_KEY,
        },
      });
      bucket = localConfig.R2_BUCKET;
    }
  }

  for (const id of targetIds) {
    await cleanPurgeTrackResources(id, deleteFromR2, s3, bucket);
  }

  await batchPurgeFromTrash(targetIds);
  invalidateStatusCache();
  await autoSyncLibraryFastToR2();

  return c.json({
    status: 200,
    message: `Đã xóa vĩnh viễn ${targetIds.length} bài hát khỏi thùng rác`,
    purgedCount: targetIds.length,
    deleteFromR2,
  });
});

// 13. Phục vụ ảnh demo tạm thời
app.get('/demo/:name', async (c) => {
  const name = c.req.param('name');
  const projectRoot = process.cwd().endsWith('indexer') ? path.resolve(process.cwd(), '../..') : process.cwd();
  const filePath = path.resolve(projectRoot, 'demo_images', name);
  if (!existsSync(filePath)) {
    return c.text('Không tìm thấy ảnh demo', 404);
  }
  const buffer = await fs.readFile(filePath);
  return new Response(buffer, {
    headers: { 'Content-Type': 'image/jpeg' },
  });
});


// ============================================================
// 13.5. CÁC API QUẢN LÝ NGHỆ SĨ (ARTISTS MANAGEMENT)
// ============================================================

// 13.5a. Lấy danh sách toàn bộ nghệ sĩ kèm số bài, số album, thời lượng, avatar và danh sách album/track
app.get('/local-api/artists', async (c) => {
  const r2TrackKeys = await getR2TrackKeys();

  if (cachedScannedTracks.length === 0) {
    const localConfig = loadLocalConfig();
    try {
      const files = await findAudioFiles(localConfig.MUSIC_SOURCE_DIR);
      const rawScanned: ScannedTrack[] = [];
      for (const f of files) {
        const item = await scanAudioFile(f);
        if (item) rawScanned.push(item);
      }
      const overrides = await getOverrides();
      cachedScannedTracks = applyOverridesToScanned(rawScanned, overrides);
    } catch {
      // bỏ qua
    }
  }

  const isSingleTrack = (title?: string) => {
    const norm = normalizeText(title || '').toLowerCase().trim();
    return (
      !norm ||
      norm === 'singles' ||
      norm === 'single' ||
      norm === 'unknown album' ||
      norm === 'unknown' ||
      norm === 'dia don'
    );
  };

  const artistsMap = new Map<
    string,
    {
      name: string;
      trackCount: number;
      realAlbumIds: Set<string>;
      singleCount: number;
      albumsMap: Map<string, { id: string; title: string; year?: number; trackCount: number; hasCover: boolean; isSingle: boolean }>;
      singlesMap: Map<string, { id: string; title: string; year?: number; trackCount: number; hasCover: boolean; isSingle: boolean }>;
      totalDuration: number;
      tracks: {
        id: string;
        albumId?: string;
        title: string;
        album: string;
        duration: number;
        year?: number;
        format: string;
        hasCover: boolean;
        filePath: string;
        isSynced?: boolean;
      }[];
      sampleTrackPath?: string;
    }
  >();

  for (const item of cachedScannedTracks) {
    const artist = item.track.artist || 'Unknown Artist';
    if (!artistsMap.has(artist)) {
      artistsMap.set(artist, {
        name: artist,
        trackCount: 0,
        realAlbumIds: new Set(),
        singleCount: 0,
        albumsMap: new Map(),
        singlesMap: new Map(),
        totalDuration: 0,
        tracks: [],
        sampleTrackPath: item.filePath,
      });
    }

    const entry = artistsMap.get(artist);
    if (!entry) continue;

    entry.trackCount++;
    entry.totalDuration += item.track.duration || 0;

    const albumTitle = item.track.album || 'Singles';
    const albumId = item.track.albumId || 'unknown_album';
    const isSingle = isSingleTrack(albumTitle);

    if (isSingle) {
      entry.singleCount++;
      if (!entry.singlesMap.has(albumId)) {
        entry.singlesMap.set(albumId, {
          id: albumId,
          title: 'Đĩa đơn & Bài lẻ (Singles)',
          year: item.track.year,
          trackCount: 0,
          hasCover: cachedCovers.has(albumId),
          isSingle: true,
        });
      }
      const sEntry = entry.singlesMap.get(albumId);
      if (sEntry) sEntry.trackCount++;
    } else {
      entry.realAlbumIds.add(albumId);
      if (!entry.albumsMap.has(albumId)) {
        entry.albumsMap.set(albumId, {
          id: albumId,
          title: albumTitle,
          year: item.track.year,
          trackCount: 0,
          hasCover: cachedCovers.has(albumId),
          isSingle: false,
        });
      }
      const albEntry = entry.albumsMap.get(albumId);
      if (albEntry) albEntry.trackCount++;
    }

    const ext = path.extname(item.filePath).toUpperCase().replace('.', '') || 'M4A';
    entry.tracks.push({
      id: item.track.id,
      albumId: item.track.albumId,
      title: item.track.title,
      album: albumTitle,
      duration: item.track.duration,
      year: item.track.year,
      format: ext,
      hasCover: Boolean(item.coverBuffer || (item.track.albumId && cachedCovers.has(item.track.albumId))),
      filePath: item.filePath,
      isSynced: r2TrackKeys.has(item.track.file),
    });
  }

  const artistsList = Array.from(artistsMap.values()).map((a) => {
    let folderPath: string | null = null;
    let hasAvatar = false;

    if (a.sampleTrackPath) {
      folderPath = resolveArtistDirectory(path.dirname(a.sampleTrackPath), a.name);
      hasAvatar = hasArtistImage(folderPath);
    }

    return {
      name: a.name,
      trackCount: a.trackCount,
      albumCount: a.realAlbumIds.size, // Chỉ đếm các Album phòng thu thực sự giống Spotify
      singleCount: a.singleCount,      // Số lượng đĩa đơn & bài lẻ
      totalDuration: a.totalDuration,
      hasAvatar,
      avatarUrl: `/local-api/artists/${encodeURIComponent(a.name)}/avatar`,
      folderPath,
      albums: Array.from(a.albumsMap.values()),     // Danh sách Album thật
      singles: Array.from(a.singlesMap.values()),   // Danh sách Đĩa đơn
      tracks: a.tracks,
    };
  });

  artistsList.sort((x, y) => y.trackCount - x.trackCount);

  return c.json({
    status: 200,
    totalArtists: artistsList.length,
    artists: artistsList,
  });
});

// 13.5b. Lấy avatar nghệ sĩ (binary image)
app.get('/local-api/artists/:name/avatar', async (c) => {
  const artistName = c.req.param('name');
  const scanned = cachedScannedTracks.find(
    (t) => normalizeText(t.track.artist).toLowerCase() === normalizeText(artistName).toLowerCase()
  );

  if (scanned?.filePath) {
    const artistDir = resolveArtistDirectory(path.dirname(scanned.filePath), artistName);
    const imgPath = getArtistImagePath(artistDir);
    if (imgPath && existsSync(imgPath)) {
      try {
        const buf = await fs.readFile(imgPath);
        const ext = path.extname(imgPath).toLowerCase();
        const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        return new Response(buf, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=1800',
          },
        });
      } catch {
        // bỏ qua
      }
    }

    // Nếu chưa có artist.jpg riêng, fallback lấy ảnh bìa album đầu tiên có sẵn
    if (scanned.track.albumId && cachedCovers.has(scanned.track.albumId)) {
      const albumBuf = cachedCovers.get(scanned.track.albumId);
      if (albumBuf) {
        return new Response(albumBuf, {
          headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=1800',
          },
        });
      }
    }
  }

  return c.text('No avatar found', 404);
});

// 13.5c. Cập nhật / Tải avatar mới cho Nghệ sĩ (qua YouTube link hoặc link ảnh)
app.post('/local-api/artists/:name/avatar', async (c) => {
  const artistName = c.req.param('name');
  const body = await c.req.json().catch(() => ({}));
  const { url } = body as { url?: string };

  if (!url || !url.trim()) {
    return c.json({ status: 400, error: 'Vui lòng cung cấp link YouTube hoặc link ảnh' }, 400);
  }

  const scanned = cachedScannedTracks.find(
    (t) => normalizeText(t.track.artist).toLowerCase() === normalizeText(artistName).toLowerCase()
  );

  if (!scanned?.filePath) {
    return c.json({ status: 404, error: 'Không tìm thấy bài hát nào của nghệ sĩ này để xác định thư mục' }, 404);
  }

  const artistDir = resolveArtistDirectory(path.dirname(scanned.filePath), artistName);
  if (!existsSync(artistDir)) {
    await fs.mkdir(artistDir, { recursive: true });
  }

  let imgBuf: Buffer | null = null;

  // Nếu là link YouTube (video hoặc channel)
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    imgBuf = await fetchChannelAvatarBuffer(url, url);
  } else {
    // Tải ảnh trực tiếp từ URL
    try {
      const res = await fetch(url);
      if (res.ok) {
        const ab = await res.arrayBuffer();
        imgBuf = Buffer.from(ab);
      }
    } catch {
      // lỗi tải ảnh
    }
  }

  if (!imgBuf || imgBuf.length === 0) {
    return c.json({ status: 400, error: 'Không thể tải ảnh từ đường dẫn đã cung cấp' }, 400);
  }

  // 1. Lưu duy nhất artist.png (chất lượng cao .PNG không vỡ hạt)
  const artistPng = path.join(artistDir, 'artist.png');
  await fs.writeFile(artistPng, imgBuf);

  // 2. Lưu folder.png cho Windows Explorer
  const folderPng = path.join(artistDir, 'folder.png');
  await fs.writeFile(folderPng, imgBuf);

  // 3. Dọn dẹp triệt để file artist.jpg / folder.jpg cũ nếu có để chỉ giữ lại duy nhất .png
  const oldArtistJpg = path.join(artistDir, 'artist.jpg');
  if (existsSync(oldArtistJpg)) {
    try {
      if (process.platform === 'win32') execFileSync('attrib', ['-r', '-h', '-s', oldArtistJpg]);
      await fs.unlink(oldArtistJpg);
    } catch { /* bỏ qua */ }
  }
  const oldFolderJpg = path.join(artistDir, 'folder.jpg');
  if (existsSync(oldFolderJpg)) {
    try {
      if (process.platform === 'win32') execFileSync('attrib', ['-r', '-h', '-s', oldFolderJpg]);
      await fs.unlink(oldFolderJpg);
    } catch { /* bỏ qua */ }
  }

  // 4. Áp dụng thông tin metadata tab "Details" (Curator: Kato) chuyên nghiệp cho các file ảnh PNG
  try {
    applyArtistImageMetadata(artistPng, { artistName, curator: 'Kato' });
    applyArtistImageMetadata(folderPng, { artistName, curator: 'Kato' });
  } catch {
    // Không gián đoạn luồng chính nếu có lỗi metadata
  }

  // 5. Thiết lập thuộc tính ẩn (+h +s) cho file folder.png sau khi đã ghi metadata
  if (process.platform === 'win32') {
    try {
      execFileSync('attrib', ['+h', '+s', folderPng]);
    } catch {
      // bỏ qua
    }
  }

  // 6. Cấu hình desktop.ini cho Windows Explorer trỏ tới artist.png
  if (process.platform === 'win32') {
    try {
      const iniPath = path.join(artistDir, 'desktop.ini');
      if (existsSync(iniPath)) {
        try { execFileSync('attrib', ['-r', '-h', '-s', iniPath]); } catch { /* bỏ qua */ }
      }
      const iniContent = [
        '[.ShellClassInfo]',
        'FolderType=Generic',
        '[ViewState]',
        'Mode=1',
        'Vid=',
        'FolderType=Generic',
        'Logo=artist.png',
        '',
      ].join('\r\n');
      await fs.writeFile(iniPath, iniContent, 'utf-8');
      execFileSync('attrib', ['+r', artistDir]);
      execFileSync('attrib', ['+h', '+s', iniPath]);
    } catch {
      // bỏ qua
    }
  }

  return c.json({
    status: 200,
    message: `Đã cập nhật ảnh đại diện cho nghệ sĩ ${artistName} thành công!`,
    avatarUrl: `/local-api/artists/${encodeURIComponent(artistName)}/avatar?t=${Date.now()}`,
  });
});

// 13.5d. Gộp nghệ sĩ (Artist Merge / Aliases)
app.post('/local-api/artists/merge', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { targetArtist, sourceArtists } = body as { targetArtist?: string; sourceArtists?: string[] };

  if (!targetArtist || !targetArtist.trim()) {
    return c.json({ status: 400, error: 'Tên nghệ sĩ chuẩn (đích) không được để trống' }, 400);
  }
  if (!Array.isArray(sourceArtists) || sourceArtists.length === 0) {
    return c.json({ status: 400, error: 'Vui lòng chọn ít nhất 1 nghệ sĩ nguồn để gộp' }, 400);
  }

  const overrides = await setArtistAliases(targetArtist.trim(), sourceArtists);

  // Làm mới lại cachedScannedTracks
  const localConfig = loadLocalConfig();
  try {
    const files = await findAudioFiles(localConfig.MUSIC_SOURCE_DIR);
    const rawScanned: ScannedTrack[] = [];
    for (const f of files) {
      const item = await scanAudioFile(f);
      if (item) rawScanned.push(item);
    }
    cachedScannedTracks = applyOverridesToScanned(rawScanned, overrides);
  } catch {
    // bỏ qua
  }

  return c.json({
    status: 200,
    message: `Đã gộp thành công ${sourceArtists.length} nghệ sĩ vào "${targetArtist.trim()}"!`,
  });
});

// 13.5e. Mở thư mục Nghệ sĩ trong Windows Explorer
app.post('/local-api/artists/:name/open-folder', async (c) => {
  const artistName = c.req.param('name');
  let body: { folderPath?: string } = {};
  try {
    body = (await c.req.json()) as { folderPath?: string };
  } catch {
    // bỏ qua nếu không có body
  }

  let targetDir = body.folderPath;

  if (!targetDir || !existsSync(targetDir)) {
    // Nếu cache rỗng, tự nạp lại từ MUSIC_SOURCE_DIR
    if (cachedScannedTracks.length === 0) {
      const localConfig = loadLocalConfig();
      if (localConfig.MUSIC_SOURCE_DIR && existsSync(localConfig.MUSIC_SOURCE_DIR)) {
        try {
          const files = await findAudioFiles(localConfig.MUSIC_SOURCE_DIR);
          const rawScanned: ScannedTrack[] = [];
          for (const f of files) {
            const item = await scanAudioFile(f);
            if (item) rawScanned.push(item);
          }
          const overrides = await getOverrides();
          cachedScannedTracks = applyOverridesToScanned(rawScanned, overrides);
        } catch {
          // bỏ qua lỗi scan
        }
      }
    }

    const scanned = cachedScannedTracks.find(
      (t) => normalizeText(t.track.artist).toLowerCase() === normalizeText(artistName).toLowerCase()
    );

    if (scanned?.filePath) {
      targetDir = resolveArtistDirectory(path.dirname(scanned.filePath), artistName);
    }
  }

  // Fallback: Tìm trong danh sách tải YouTube Music
  if (!targetDir || !existsSync(targetDir)) {
    try {
      const downloads = await youtubeJobRunner.getDownloads(2000);
      const dl = downloads.find(
        (d) => normalizeText(d.artist || '').toLowerCase() === normalizeText(artistName).toLowerCase()
      );
      if (dl?.libraryRootPath && dl?.relativeFilePath) {
        const full = path.resolve(dl.libraryRootPath, dl.relativeFilePath.replace(/^[/\\]+/, ''));
        if (existsSync(full)) {
          targetDir = resolveArtistDirectory(path.dirname(full), artistName);
        }
      }
    } catch {
      // bỏ qua lỗi downloads
    }
  }

  if (!targetDir || !existsSync(targetDir)) {
    return c.json({ status: 404, error: `Không tìm thấy thư mục của nghệ sĩ "${artistName}" trên đĩa cứng` }, 404);
  }

  const opened = youtubeJobRunner.openFolderInExplorer(targetDir);
  if (!opened) {
    return c.json({ status: 500, error: 'Không thể khởi chạy Explorer trên máy tính' }, 500);
  }

  return c.json({
    status: 200,
    message: `Đã mở thư mục của nghệ sĩ ${artistName}`,
    folderPath: targetDir,
  });
});

// ============================================================
// 14. API MODULE YOUTUBE MUSIC (TƯƠNG THÍCH ĐẦY ĐỦ VỚI TOOLKIT)
// ============================================================

// 14.1. Trạng thái công cụ hệ thống (yt-dlp, ffmpeg, runtime) - Auto refreshed
app.get('/api/youtube-music/dependencies', async (c) => {
  try {
    const force = c.req.query('force') === 'true';
    const status = DependencyChecker.checkDependencies(force);
    return c.json({ status: 'success', data: status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 'error', error: { message: msg || 'Lỗi kiểm tra dependencies' } }, 500);
  }
});

// 14.2. Cập nhật yt-dlp
app.post('/api/youtube-music/dependencies/update', async (c) => {
  try {
    const res = await DependencyChecker.updateYtDlp();
    return c.json({ status: 'success', data: res });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 'error', error: { message: msg || 'Lỗi cập nhật yt-dlp' } }, 500);
  }
});

// 14.3. Xem trước và phân tích bài hát / playlist
app.post('/api/youtube-music/preview', async (c) => {
  try {
    const body = (await c.req.json()) as { urls?: string[]; maxItems?: number };
    const urls: string[] = Array.isArray(body?.urls) ? body.urls : [];
    if (urls.length === 0) {
      return c.json({ status: 'error', error: { message: 'Vui lòng cung cấp ít nhất một URL' } }, 400);
    }
    const maxItems = typeof body.maxItems === 'number' ? body.maxItems : 1000;
    const res = await youtubeJobRunner.preview(urls, maxItems);
    return c.json({ status: 'success', data: res });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 'error', error: { message: msg || 'Lỗi phân tích bài hát' } }, 500);
  }
});

// 14.4. Lấy chi tiết lời bài hát từ LRCLIB
app.post('/api/youtube-music/lyrics/fetch', async (c) => {
  try {
    const body = (await c.req.json()) as { artist?: string; title?: string; duration?: number; url?: string };
    const artist = (body.artist || '').trim();
    const title = (body.title || '').trim();
    const duration = body.duration;
    const url = (body.url || '').trim();

    // 1. Ưu tiên tìm kiếm lời bài hát đồng bộ từ LRCLIB (title trước, artist sau)
    let res = await LyricsService.fetchLyrics(title, artist, duration);
    if (!res?.syncedLyrics && !res?.plainLyrics && artist && title) {
      // Fallback dự phòng nếu tên bài và tên ca sĩ bị hoán đổi
      const flipped = await LyricsService.fetchLyrics(artist, title, duration);
      if (flipped?.syncedLyrics || flipped?.plainLyrics) {
        res = flipped;
      }
    }

    if (res?.syncedLyrics) {
      return c.json({ status: 'success', data: { source: 'lrclib-synced', syncedLyrics: res.syncedLyrics } });
    }
    if (res?.plainLyrics) {
      return c.json({ status: 'success', data: { source: 'lrclib-plain', plainLyrics: res.plainLyrics } });
    }

    // 2. Dự phòng: Nếu LRCLIB không có kết quả hoặc gặp sự cố (503), tự động trích xuất phụ đề YouTube CC
    if (url) {
      const ytSub = await LyricsService.extractYouTubeSubtitles(url);
      if (ytSub?.syncedLyrics) {
        return c.json({ status: 'success', data: { source: 'yt-subs', syncedLyrics: ytSub.syncedLyrics } });
      }
      if (ytSub?.plainLyrics) {
        return c.json({ status: 'success', data: { source: 'yt-subs', plainLyrics: ytSub.plainLyrics } });
      }
    }

    return c.json({ status: 'success', data: { source: 'none' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 'error', error: { message: msg || 'Lỗi lấy lời bài hát' } }, 500);
  }
});

// 14.5. Khởi tạo Job tải nhạc đa luồng
app.post('/api/youtube-music/jobs', async (c) => {
  try {
    const payload = await c.req.json();
    const jobId = await youtubeJobRunner.createJob(payload);
    // Tự động giải phóng cache để thanh Sidebar hiển thị số lượng bài mới ngay lập tức
    youtubeJobRunner.on(`job:${jobId}`, (event: JobEvent) => {
      if (event.status === 'completed' || event.status === 'stopped' || event.status === 'failed') {
        cachedStatusResponse = null;
        cachedScannedTracks = [];
      }
    });
    return c.json({ status: 'success', data: { jobId } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 'error', error: { message: msg || 'Lỗi tạo job tải nhạc' } }, 500);
  }
});

// 14.6. Dừng Job tải nhạc YouTube
app.post('/api/youtube-music/jobs/:id/stop', (c) => {
  const id = c.req.param('id');
  youtubeJobRunner.stopJob(id);
  return c.json({ status: 'success', data: { stopped: true } });
});

// 14.7. Server-Sent Events (SSE) theo dõi tiến trình Job thời gian thực
app.get('/api/jobs/:id/events', async (c) => {
  const jobId = c.req.param('id');
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ data: JSON.stringify({ type: 'connected', jobId }) });

    const onEvent = (event: JobEvent) => {
      stream.writeSSE({ data: JSON.stringify(event) }).catch(() => { });
    };

    youtubeJobRunner.on(`job:${jobId}`, onEvent);

    stream.onAbort(() => {
      youtubeJobRunner.off(`job:${jobId}`, onEvent);
    });

    while (!stream.aborted) {
      await stream.sleep(1000);
    }
  });
});

// 14.8. Lấy danh sách video/bài hát đã tải
app.get('/api/youtube-music/downloads', async (c) => {
  try {
    const queryLimit = c.req.query('limit');
    const isForce = c.req.query('force') === 'true';
    const limit = queryLimit ? parseInt(queryLimit, 10) : 500;
    let downloads = await youtubeJobRunner.getDownloads(limit);

    // Tự động đối chiếu với Cloudflare R2 nếu có bài chưa được gắn trạng thái đã upload hoặc khi người dùng yêu cầu force
    const hasUncheckedTracks = isForce || downloads.some((d) => !d.uploadedToR2 || !d.trackId);
    if (hasUncheckedTracks) {
      try {
        const r2Keys = await getR2TrackKeys(isForce);
        if (r2Keys.size > 0) {
          const syncedCount = await youtubeJobRunner.syncWithR2Keys(r2Keys);
          if (syncedCount > 0 || isForce) {
            downloads = await youtubeJobRunner.getDownloads(limit);
          }
        }
      } catch {
        // bỏ qua nếu lỗi mạng hoặc không kết nối được R2 tạm thời
      }
    }

    return c.json({ status: 'success', data: downloads });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 'error', error: { message: msg || 'Lỗi lấy lịch sử tải' } }, 500);
  }
});

// 14.8b. Kiểm tra sự tồn tại của tệp trên đĩa và trạng thái R2 Cloud
app.post('/api/youtube-music/downloads/verify', async (c) => {
  try {
    const localConfig = loadLocalConfig();
    const r2TrackKeys = new Set<string>();

    // 1. Kiểm tra các file đã sync lên R2 nếu có kết nối
    if (
      localConfig.isR2Configured &&
      localConfig.R2_ACCOUNT_ID &&
      localConfig.R2_ACCESS_KEY_ID &&
      localConfig.R2_SECRET_ACCESS_KEY &&
      localConfig.R2_BUCKET
    ) {
      try {
        const s3 = new S3Client({
          region: 'auto',
          endpoint: `https://${localConfig.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: localConfig.R2_ACCESS_KEY_ID,
            secretAccessKey: localConfig.R2_SECRET_ACCESS_KEY,
          },
        });
        const r2Res = await s3.send(
          new ListObjectsV2Command({ Bucket: localConfig.R2_BUCKET, Prefix: 'music/' })
        );
        if (r2Res.Contents) {
          for (const obj of r2Res.Contents) {
            if (obj.Key) r2TrackKeys.add(obj.Key);
          }
        }
      } catch {
        // bỏ qua lỗi R2 tạm thời
      }
    }

    // Chỉ kiểm tra các tệp thực sự có trên Cloudflare R2 bucket
    const verified = await youtubeJobRunner.verifyDownloads(r2TrackKeys);
    return c.json({ status: 'success', data: verified });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 'error', error: { message: msg || 'Lỗi kiểm tra tệp' } }, 500);
  }
});

// 14.8c. Stream audio để nghe thử trực tiếp trên Web Player
app.get('/api/youtube-music/downloads/:id/stream', async (c) => {
  const id = c.req.param('id');
  const audioPath = await youtubeJobRunner.getDownloadAudioPath(id);
  if (!audioPath || !existsSync(audioPath)) {
    return c.text('Không tìm thấy tệp âm thanh', 404);
  }

  const stat = statSync(audioPath);
  const fileSize = stat.size;
  const ext = path.extname(audioPath).toLowerCase();
  const contentType =
    ext === '.m4a'
      ? 'audio/mp4'
      : ext === '.flac'
        ? 'audio/flac'
        : ext === '.opus'
          ? 'audio/ogg'
          : 'audio/mpeg';

  const range = c.req.header('range');
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const startStr = parts[0] ?? '0';
    const endStr = parts[1];
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const fileStream = createReadStream(audioPath, { start, end });

    return new Response(fileStream as unknown as ReadableStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize.toString(),
        'Content-Type': contentType,
      },
    });
  }

  const fileStream = createReadStream(audioPath);
  return new Response(fileStream as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Length': fileSize.toString(),
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    },
  });
});

// 14.8c2. Lấy ảnh bìa của bài hát đã tải (phục vụ cho Quản lý bài tải & Lịch sử)
const handleGetDownloadCover = async (c: Context) => {
  const id = c.req.param('id');
  const downloads = await youtubeJobRunner.getDownloads(2000);
  const record = downloads.find((d) => d.id === id);

  if (record) {
    // 1. Thử lấy từ thư mục lưu trữ trên máy tính
    if (record.libraryRootPath) {
      // 1a. Từ relativeCoverPath
      if (record.relativeCoverPath) {
        const coverPath = path.resolve(record.libraryRootPath, record.relativeCoverPath.replace(/^[/\\]+/, ''));
        if (existsSync(coverPath)) {
          try {
            const buf = await fs.readFile(coverPath);
            return new Response(buf, {
              headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
            });
          } catch {
            // Bỏ qua lỗi đọc coverPath
          }
        }
      }

      // 1b. Cùng tên với file nhạc nhưng đuôi ảnh
      if (record.relativeFilePath) {
        const audioPath = path.resolve(record.libraryRootPath, record.relativeFilePath.replace(/^[/\\]+/, ''));
        const ext = path.extname(audioPath);
        const baseNoExt = audioPath.slice(0, -ext.length);
        for (const imgExt of ['.jpg', '.jpeg', '.png', '.webp']) {
          const candidate = `${baseNoExt}${imgExt}`;
          if (existsSync(candidate)) {
            try {
              const buf = await fs.readFile(candidate);
              return new Response(buf, {
                headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
              });
            } catch {
              // Bỏ qua lỗi đọc candidate ảnh
            }
          }
        }
        // cover.jpg trong cùng folder
        const dirCover = path.join(path.dirname(audioPath), 'cover.jpg');
        if (existsSync(dirCover)) {
          try {
            const buf = await fs.readFile(dirCover);
            return new Response(buf, {
              headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
            });
          } catch {
            // Bỏ qua lỗi đọc dirCover
          }
        }
      }
    }

    // 2. Thử tìm trong custom_covers
    if (record.artist && record.album) {
      const albumKey = `${normalizeText(record.artist)}|${normalizeText(record.album)}`;
      const albumId = crypto.createHash('sha1').update(albumKey).digest('hex').slice(0, 12);
      const customPath = path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`);
      if (existsSync(customPath)) {
        try {
          const buf = await fs.readFile(customPath);
          return new Response(buf, {
            headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
          });
        } catch {
          // Bỏ qua lỗi đọc custom cover
        }
      }
    }

    // 3. Fallback: chuyển hướng sang YouTube thumbnail thực tế
    let ytId = record.videoId;
    if (!ytId || ytId.startsWith('video_') || ytId.startsWith('pending_')) {
      if (record.sourceUrl) {
        const m = record.sourceUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
        if (m && m[1]) ytId = m[1];
      }
    }

    if (ytId && !ytId.startsWith('video_')) {
      return c.redirect(`https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg`, 302);
    }
  }

  return c.text('No cover', 404);
};

app.get('/api/youtube-music/downloads/:id/cover', handleGetDownloadCover);
app.get('/local-api/downloads/:id/cover', handleGetDownloadCover);

// Static file fallback cho các file cục bộ
app.get('/local-api/static/*', async (c) => {
  const reqPath = c.req.path.replace(/^\/local-api\/static\//, '');
  const decodedPath = decodeURIComponent(reqPath);
  const localConfig = loadLocalConfig();
  const roots: string[] = [
    localConfig.MUSIC_SOURCE_DIR,
    localConfig.MUSIC_IMPORT_DIR,
    'D:\\Music',
  ].filter((r): r is string => Boolean(r));

  for (const root of roots) {
    const full = path.resolve(root, decodedPath);
    if (existsSync(full)) {
      try {
        const buf = await fs.readFile(full);
        return new Response(buf, {
          headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
        });
      } catch {
        // Bỏ qua lỗi đọc file tĩnh cục bộ
      }
    }
  }
  return c.text('Not found', 404);
});

// 14.8d. Mở vị trí tệp trên máy tính (Windows Explorer)
app.post('/api/youtube-music/downloads/:id/open-folder', async (c) => {
  const id = c.req.param('id');
  const audioPath = await youtubeJobRunner.getDownloadAudioPath(id);
  if (!audioPath || !existsSync(audioPath)) {
    return c.json({ status: 'error', error: { message: 'Tệp không tồn tại trên ổ cứng' } }, 404);
  }
  const opened = youtubeJobRunner.openFolderInExplorer(audioPath);
  return c.json({ status: 'success', data: { opened } });
});

// 14.9a. Tải bài hát đã tải lên Cloudflare R2 và cập nhật library.json
app.post('/api/youtube-music/downloads/:id/upload-r2', async (c) => {
  const id = c.req.param('id');
  try {
    const item = await youtubeJobRunner.uploadDownloadToR2(id);
    invalidateStatusCache();
    return c.json({ status: 'success', data: item });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 'error', error: { message: msg } }, 400);
  }
});

// 14.9b. Xóa một bản ghi lịch sử tải (hỗ trợ xóa đồng bộ trên đĩa và Cloudflare R2)
app.delete('/api/youtube-music/downloads/:id', async (c) => {
  const id = c.req.param('id');
  const deleteFiles = c.req.query('deleteFiles') === 'true';
  const deleteR2 = c.req.query('deleteR2') === 'true';

  try {
    const audioPath = await youtubeJobRunner.getDownloadAudioPath(id);
    const normalizedAudioPath = audioPath ? path.resolve(audioPath).toLowerCase() : null;

    const deleted = await youtubeJobRunner.deleteDownloadSync(id, { deleteFiles, deleteR2 });

    // Đồng bộ dọn dẹp triệt để khỏi RAM cache theo cả id và đường dẫn tệp
    cachedScannedTracks = cachedScannedTracks.filter((t) => {
      if (t.track.id === id) return false;
      if (normalizedAudioPath && path.resolve(t.filePath).toLowerCase() === normalizedAudioPath) return false;
      return true;
    });

    invalidateStatusCache();
    return c.json({ status: 'success', data: { deleted } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 'error', error: { message: msg } }, 500);
  }
});

// 14.9c. Tìm lại tệp khi đổi thư mục lưu trữ (Smart Relocate / Re-link)
app.post('/api/youtube-music/downloads/relocate', async (c) => {
  try {
    const rawBody = await c.req.json();
    const parsed = RelocateDownloadsRequestSchema.parse(rawBody);
    const result = await youtubeJobRunner.relocateDownloads(parsed);
    return c.json({ status: 'success', data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 'error', error: { message: msg } }, 400);
  }
});

// 14.10. Xóa toàn bộ lịch sử tải
app.delete('/api/youtube-music/downloads', async (c) => {
  const count = await youtubeJobRunner.clearAllDownloads();
  return c.json({ status: 'success', data: { count } });
});

// 14.11. Lấy lời bài hát của bản ghi tải
app.get('/api/youtube-music/downloads/:id/lyrics', async (c) => {
  try {
    const id = c.req.param('id');
    const result = await youtubeJobRunner.getDownloadLyrics(id);
    return c.json({ status: 'success', data: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 'error', error: { message: msg || 'Lỗi lấy lời bài hát' } }, 500);
  }
});

// 14.12. Cập nhật lời bài hát (.lrc) trên đĩa
app.put('/api/youtube-music/downloads/:id/lyrics', async (c) => {
  try {
    const id = c.req.param('id');
    const body = (await c.req.json()) as { lyrics?: string };
    const lyrics = body?.lyrics || '';
    const result = await youtubeJobRunner.updateDownloadLyrics(id, lyrics);
    return c.json({ status: 'success', data: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 'error', error: { message: msg || 'Lỗi cập nhật lời' } }, 500);
  }
});

// 14.12b. Cập nhật ảnh bìa chất lượng cao (HD) cho bản ghi tải về
app.post('/api/youtube-music/downloads/:id/cover', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.parseBody();
    const file = body['cover'];

    if (!file || !(file instanceof File)) {
      return c.json({ status: 'error', error: { message: 'File ảnh bìa không hợp lệ' } }, 400);
    }

    const list = await youtubeJobRunner.getDownloads();
    const item = list.find((r) => r.id === id);
    if (!item) {
      return c.json({ status: 'error', error: { message: 'Không tìm thấy bản ghi tải về' } }, 404);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Lưu vào thư mục nhạc vật lý cạnh file audio
    if (item.libraryRootPath && item.relativeFilePath) {
      const audioFullPath = path.resolve(item.libraryRootPath, item.relativeFilePath);
      const coverFullPath = audioFullPath.replace(path.extname(audioFullPath), '.jpg');
      await fs.writeFile(coverFullPath, buffer);
    }

    // 2. Lưu vào CUSTOM_COVERS_DIR
    await fs.mkdir(CUSTOM_COVERS_DIR, { recursive: true });
    await fs.writeFile(path.join(CUSTOM_COVERS_DIR, `${id}.jpg`), buffer);
    cachedCovers.set(id, buffer);

    invalidateStatusCache();
    return c.json({ status: 'success', data: { coverUrl: `/local-api/covers/${id}.jpg?_t=${Date.now()}` } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 'error', error: { message: msg || 'Lỗi cập nhật ảnh bìa' } }, 500);
  }
});

// 14.13. Cấu hình module YouTube Music
app.get('/api/youtube-music/config', async (c) => {
  try {
    const cfg = await youtubeJobRunner.getConfig();
    return c.json({ status: 'success', data: cfg });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 'error', error: { message: msg || 'Lỗi lấy cấu hình' } }, 500);
  }
});

app.post('/api/youtube-music/config', async (c) => {
  try {
    const body = await c.req.json();
    const saved = await youtubeJobRunner.saveConfig(body);
    return c.json({ status: 'success', data: saved });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ status: 'error', error: { message: msg || 'Lỗi lưu cấu hình' } }, 500);
  }
});

// 14.14. Mở thư mục trên máy tính (Windows Explorer)
app.post('/api/youtube-music/open-folder', async (c) => {
  try {
    const body = await c.req.json();
    let targetPath = body?.path;
    if (!targetPath) return c.json({ status: 'success', data: false });

    if (!path.isAbsolute(targetPath)) {
      const local = loadLocalConfig();
      const cand1 = path.resolve(local.MUSIC_SOURCE_DIR, targetPath);
      const cand2 = local.MUSIC_IMPORT_DIR ? path.resolve(local.MUSIC_IMPORT_DIR, targetPath) : null;
      if (existsSync(cand1)) {
        targetPath = cand1;
      } else if (cand2 && existsSync(cand2)) {
        targetPath = cand2;
      } else {
        targetPath = cand1;
      }
    }

    const opened = youtubeJobRunner.openFolderInExplorer(targetPath);
    return c.json({ status: 'success', data: opened });
  } catch {
    return c.json({ status: 'success', data: false });
  }
});

// 14.15. Mở hộp thoại chọn thư mục gốc Windows Native (FolderBrowserDialog)
app.post('/local-api/folders/pick', async (c) => {
  if (process.platform !== 'win32') {
    return c.json({ status: 'success', path: null });
  }

  return new Promise<Response>((resolve) => {
    // Chạy PowerShell với STA mode để hiển thị FolderBrowserDialog chuẩn Windows
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Chọn thư mục lưu nhạc cho Beatify"
$dialog.ShowNewFolderButton = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
}
`;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-Command', psScript],
      { windowsHide: false },
      (error, stdout) => {
        if (error) {
          resolve(c.json({ status: 'error', error: { message: error.message }, path: null }, 500));
          return;
        }
        const selected = stdout ? stdout.trim() : null;
        resolve(c.json({ status: 'success', path: selected || null }));
      }
    );
  });
});

// ============================================================
// 15. STATIC FILE SERVER PHỤC VỤ DASHBOARD REACT (SPA)
// ============================================================
const DASHBOARD_DIST = path.resolve(
  process.cwd().endsWith('indexer')
    ? path.join(process.cwd(), '../dashboard/dist')
    : path.join(process.cwd(), 'tools/dashboard/dist')
);

// 21. API: Đồng bộ Danh sách phát (Playlists) & Yêu thích (Favorites) 2 chiều
app.get('/local-api/state', async (c) => {
  const localConfig = loadLocalConfig();
  let state: UserState | null = null;

  // 1. Thử lấy từ Cloudflare R2 nếu đã cấu hình
  if (localConfig.isR2Configured && localConfig.R2_ACCOUNT_ID && localConfig.R2_ACCESS_KEY_ID && localConfig.R2_SECRET_ACCESS_KEY && localConfig.R2_BUCKET) {
    try {
      const uploader = new R2Uploader({
        MUSIC_SOURCE_DIR: localConfig.MUSIC_SOURCE_DIR,
        R2_ACCOUNT_ID: localConfig.R2_ACCOUNT_ID,
        R2_ACCESS_KEY_ID: localConfig.R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY: localConfig.R2_SECRET_ACCESS_KEY,
        R2_BUCKET: localConfig.R2_BUCKET,
      });
      state = await uploader.getUserState();
      if (state) {
        await fs.writeFile(LOCAL_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8').catch(() => { });
      }
    } catch (err) {
      console.warn('[state] Lỗi đọc state từ R2:', err);
    }
  }

  // 2. Thử đọc từ cache local
  if (!state && existsSync(LOCAL_STATE_FILE)) {
    try {
      const content = await fs.readFile(LOCAL_STATE_FILE, 'utf-8');
      const parsed = UserStateSchema.safeParse(JSON.parse(content));
      if (parsed.success) state = parsed.data;
    } catch {
      // Bỏ qua lỗi đọc state file local
    }
  }

  // 3. Fallback mặc định
  if (!state) {
    state = {
      version: 1,
      updatedAt: new Date().toISOString(),
      playlists: [],
      favoriteIds: [],
    };
  }

  return c.json({
    status: 200,
    message: 'OK',
    data: state,
    error: null,
  });
});

app.put('/local-api/state', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ status: 400, message: 'Invalid JSON body', error: 'VALIDATION_ERROR' }, 400);
  }

  const parsed = UserStateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        status: 400,
        message: 'Validation error: ' + parsed.error.issues.map((i) => i.message).join(', '),
        error: 'VALIDATION_ERROR',
      },
      400
    );
  }

  // 1. Lưu local cache
  await fs.writeFile(LOCAL_STATE_FILE, JSON.stringify(parsed.data, null, 2), 'utf-8').catch(() => { });

  // 2. Lưu lên R2 nếu đã cấu hình
  const localConfig = loadLocalConfig();
  if (localConfig.isR2Configured && localConfig.R2_ACCOUNT_ID && localConfig.R2_ACCESS_KEY_ID && localConfig.R2_SECRET_ACCESS_KEY && localConfig.R2_BUCKET) {
    try {
      const uploader = new R2Uploader({
        MUSIC_SOURCE_DIR: localConfig.MUSIC_SOURCE_DIR,
        R2_ACCOUNT_ID: localConfig.R2_ACCOUNT_ID,
        R2_ACCESS_KEY_ID: localConfig.R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY: localConfig.R2_SECRET_ACCESS_KEY,
        R2_BUCKET: localConfig.R2_BUCKET,
      });
      await uploader.saveUserState(parsed.data);
    } catch (err) {
      console.warn('[state] Lỗi lưu state lên R2:', err);
    }
  }

  return c.json({
    status: 200,
    message: 'Đã lưu danh sách phát và yêu thích thành công',
    data: parsed.data,
    error: null,
  });
});

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

// --- CHUẨN HÓA THỰC THỂ ÂM NHẠC (MULTI-LAYER MUSIC ENTITY RESOLUTION) ---
app.post('/local-api/entity-resolution/preview', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { trackIds?: string[]; forceItunes?: boolean };
    const report = await defaultEntityResolutionService.preview(body);
    return c.json({ status: 200, ...report });
  } catch (err: unknown) {
    return c.json({ status: 500, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.post('/local-api/entity-resolution/apply', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as {
      trackIds?: string[];
      applyAllHighConfidence?: boolean;
      syncToR2?: boolean;
      forceProtected?: boolean;
    };
    const result = await defaultEntityResolutionService.apply(body);
    return c.json({ status: 200, ...result });
  } catch (err: unknown) {
    return c.json({ status: 500, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.get('/local-api/entity-resolution/report', async (c) => {
  try {
    const report = await defaultEntityResolutionService.preview();
    if (!existsSync(report.csvReportPath)) {
      return c.text('Không tìm thấy file báo cáo', 404);
    }
    const csvContent = await fs.readFile(report.csvReportPath, 'utf-8');
    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ENTITY_RESOLUTION_PREVIEW.csv"',
      },
    });
  } catch (err: unknown) {
    return c.text(err instanceof Error ? err.message : String(err), 500);
  }
});

app.get('*', async (c) => {
  const reqPath = c.req.path;
  const filePath = path.join(DASHBOARD_DIST, reqPath === '/' ? 'index.html' : reqPath);

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = await fs.readFile(filePath);
    return new Response(content, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000',
      },
    });
  }

  // SPA fallback to index.html
  const indexPath = path.join(DASHBOARD_DIST, 'index.html');
  if (existsSync(indexPath)) {
    const content = await fs.readFile(indexPath);
    return new Response(content, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  }

  return c.text(
    'Beatify Dashboard dist not found. Vui lòng build dashboard bằng: pnpm --filter @music-app/dashboard build',
    404
  );
});

const PORT = 4000;
if (process.env.NODE_ENV !== 'test') {
  console.log(`\n🚀 Beatify Studio & Downloader đang chạy tại: http://127.0.0.1:${PORT}`);
  console.log(`👉 Mở trình duyệt và truy cập: http://127.0.0.1:${PORT}\n`);
  serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' });
}
