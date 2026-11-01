import * as mm from 'music-metadata';
import { serve } from '@hono/node-server';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import fs from 'fs/promises';
import { createReadStream, statSync, existsSync } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { loadConfig, loadLocalConfig } from '../config';
import { findAudioFiles, scanAudioFile, calculateTrackId } from '../services/scanner';
import type { ScannedTrack } from '../services/scanner';
import { buildLibrary } from '../services/libraryBuilder';
import { R2Uploader } from '../services/r2Uploader';
import { getOverrides, setTrackOverride, applyOverridesToScanned, moveToTrash, restoreFromTrash, purgeFromTrash, setArtistAliases } from '../services/overridesManager';
import { updateFoldersConfig } from '../services/configManager';
import { pickFolderNative } from '../services/folderPicker';
import crypto from 'crypto';
import { execFile, execFileSync } from 'child_process';
import { TrackOverrideSchema, normalizeText, RelocateDownloadsRequestSchema, UserStateSchema, type UserState } from '@music-app/shared';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DependencyChecker } from '../services/dependencyChecker';
import { LyricsService } from '../services/lyricsService';
import { youtubeJobRunner } from '../services/youtubeJobRunner';
import { resolveArtistDirectory, hasArtistImage, getArtistImagePath, fetchChannelAvatarBuffer } from '../services/youtubeService';
import { applyArtistImageMetadata } from '../services/imageMetadataService';
import { PathSanitizer } from '../services/pathSanitizer';
import type { JobEvent } from '@music-app/shared';

const app = new Hono();

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

// Bộ nhớ cache tạm thời cho phiên làm việc local
let cachedScannedTracks: ScannedTrack[] = [];
const cachedCovers = new Map<string, Buffer>();

let cachedR2TrackKeys = new Set<string>();
let lastR2KeysFetchTime = 0;

async function getR2TrackKeys(forceRefresh = false): Promise<Set<string>> {
  const now = Date.now();
  if (!forceRefresh && cachedR2TrackKeys.size > 0 && now - lastR2KeysFetchTime < 30000) {
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
      // bỏ qua
    }
  }
  return cachedR2TrackKeys;
}

let currentSyncProgress = {
  active: false,
  step: 'Sẵn sàng',
  current: 0,
  total: 0,
  percent: 0,
  error: null as string | null,
};

app.use('*', cors());

// 1. API: Trạng thái & Thống kê hệ thống (Chỉ tính bài hát còn hoạt động, loại trừ bài ẩn/đã xóa)
app.get('/local-api/status', async (c) => {
  const localConfig = loadLocalConfig();
  let totalBytes = 0;
  let fileCount = 0;
  let syncedBytes = 0;
  let syncedCount = 0;
  let unsyncedBytes = 0;
  let unsyncedCount = 0;

  try {
    const files = await findAudioFiles(localConfig.MUSIC_SOURCE_DIR);
    const overrides = await getOverrides();

    // Lấy danh sách keys đã có trên R2
    const r2Keys = await getR2TrackKeys();

    for (const f of files) {
      const item = await scanAudioFile(f);
      if (item) {
        const ov = overrides.tracks[item.track.id];
        if (!ov?.hidden && !ov?.purged) {
          fileCount++;
          let size = 0;
          try {
            size = statSync(f).size;
            totalBytes += size;
          } catch {
            // bỏ qua
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
    }
  } catch {
    // bỏ qua lỗi đọc thư mục
  }

  const syncedMB = (syncedBytes / (1024 * 1024)).toFixed(1);
  const unsyncedMB = (unsyncedBytes / (1024 * 1024)).toFixed(1);
  const usedPercent = ((syncedBytes / (10 * 1024 * 1024 * 1024)) * 100).toFixed(2);

  return c.json({
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
  });
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

  const rawScanned: ScannedTrack[] = [];
  cachedCovers.clear();

  for (const f of files) {
    const item = await scanAudioFile(f);
    if (item) {
      rawScanned.push(item);
      if (item.coverBuffer && item.track.albumId) {
        cachedCovers.set(item.track.albumId, item.coverBuffer);
      }
    }
  }

  const overrides = await getOverrides();
  cachedScannedTracks = applyOverridesToScanned(rawScanned, overrides);

  // Nạp ảnh bìa tùy chỉnh từ CUSTOM_COVERS_DIR
  for (const item of cachedScannedTracks) {
    const albumId = item.track.albumId;
    if (albumId) {
      if (!cachedCovers.has(albumId)) {
        const customPath = path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`);
        if (existsSync(customPath)) {
          try {
            const buf = await fs.readFile(customPath);
            cachedCovers.set(albumId, buf);
            item.coverBuffer = buf;
            item.track.cover = `covers/${albumId}.jpg`;
          } catch {
            // bỏ qua
          }
        }
      } else if (!item.coverBuffer) {
        item.coverBuffer = cachedCovers.get(albumId);
        item.track.cover = `covers/${albumId}.jpg`;
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
    const hasCover = Boolean(item.coverBuffer || (item.track.albumId && cachedCovers.has(item.track.albumId)));
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

  const rawScanned: ScannedTrack[] = [];
  for (const f of files) {
    const item = await scanAudioFile(f);
    if (item) {
      rawScanned.push(item);
      if (item.coverBuffer) {
        if (item.track.albumId) cachedCovers.set(item.track.albumId, item.coverBuffer);
        if (item.track.id) cachedCovers.set(item.track.id, item.coverBuffer);
      }
    }
  }

  const overrides = await getOverrides();
  cachedScannedTracks = applyOverridesToScanned(rawScanned, overrides);

  // Nạp ảnh bìa tùy chỉnh từ CUSTOM_COVERS_DIR
  for (const item of cachedScannedTracks) {
    const albumId = item.track.albumId;
    if (albumId && !cachedCovers.has(albumId)) {
      const customPath = path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`);
      if (existsSync(customPath)) {
        try {
          const buf = await fs.readFile(customPath);
          cachedCovers.set(albumId, buf);
          item.coverBuffer = buf;
        } catch {
          // bỏ qua
        }
      }
    }
  }

  const r2TrackKeys = await getR2TrackKeys();

  const tracks = cachedScannedTracks.map((item) => {
    const fileExists = existsSync(item.filePath);
    const ext = path.extname(item.filePath).replace('.', '').toLowerCase();
    return {
      id: item.track.id,
      title: item.track.title,
      artist: item.track.artist,
      album: item.track.album,
      albumId: item.track.albumId,
      duration: item.track.duration,
      format: ext,
      hasCover: !!(item.coverBuffer || item.track.cover),
      hasLyrics: !!item.track.lyrics,
      filePath: item.filePath,
      fileExists,
      isSynced: r2TrackKeys.has(item.track.file),
    };
  });

  return c.json({ status: 200, tracks });
});

// 3. API: Phát audio preview (hỗ trợ cả /local-api/audio/:id và /local-api/stream/:id)
const streamHandler = (c: Context) => {
  const id = c.req.param('id');
  const target = cachedScannedTracks.find((t) => t.track.id === id);
  if (!target || !target.filePath || !existsSync(target.filePath)) {
    return c.text('Không tìm thấy tệp âm thanh trên ổ cứng', 404);
  }

  const stat = statSync(target.filePath);
  const stream = createReadStream(target.filePath);
  const ext = path.extname(target.filePath).toLowerCase();
  const contentType =
    ext === '.m4a' ? 'audio/mp4' : ext === '.flac' ? 'audio/flac' : 'audio/mpeg';

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': stat.size.toString(),
      'Accept-Ranges': 'bytes',
    },
  });
};

app.get('/local-api/audio/:id', streamHandler);
app.get('/local-api/stream/:id', streamHandler);

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

  // 3. Thử tìm trong cachedScannedTracks (khớp albumId hoặc track id)
  if (!buf) {
    const matched = cachedScannedTracks.find(
      (t) => t.track.albumId === cleanId || t.track.id === cleanId
    );
    if (matched) {
      if (matched.coverBuffer) {
        buf = matched.coverBuffer;
        cachedCovers.set(cleanId, buf);
      } else if (matched.filePath && existsSync(matched.filePath)) {
        try {
          const metadata = await mm.parseFile(matched.filePath);
          const picture = metadata.common.picture?.[0];
          if (picture) {
            buf = Buffer.from(picture.data);
            matched.coverBuffer = buf;
            cachedCovers.set(cleanId, buf);
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

app.get('/local-api/cover/:albumId', handleGetCover);
app.get('/local-api/covers/:albumId', handleGetCover);
app.get('/local-api/cover/:id', handleGetCover);
app.get('/local-api/covers/:id', handleGetCover);

// 4.1. API: Cập nhật ảnh bìa cho bài hát / album (Xóa ảnh bìa cũ nếu có)
app.post('/local-api/tracks/:id/cover', async (c) => {
  const trackId = c.req.param('id');
  const body = await c.req.parseBody();
  const file = body['cover'];

  if (!file || !(file instanceof File)) {
    return c.json({ status: 400, error: 'File ảnh bìa không hợp lệ' }, 400);
  }

  const scanned = cachedScannedTracks.find(t => t.track.id === trackId);
  if (!scanned) {
    return c.json({ status: 404, error: 'Không tìm thấy bài hát' }, 404);
  }

  const albumId = scanned.track.albumId || `track_${trackId.slice(0, 8)}`;

  // 1. Xóa file ảnh bìa cũ nếu đã có trước đó
  const oldCoverFile = path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`);
  if (existsSync(oldCoverFile)) {
    await fs.unlink(oldCoverFile).catch(() => {});
  }
  cachedCovers.delete(albumId);

  // 2. Ghi file ảnh bìa mới
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await fs.mkdir(CUSTOM_COVERS_DIR, { recursive: true });
  await fs.writeFile(path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`), buffer);

  cachedCovers.set(albumId, buffer);
  scanned.coverBuffer = buffer;
  scanned.track.cover = `covers/${albumId}.jpg`;

  return c.json({ status: 200, albumId, message: 'Đã cập nhật ảnh bìa mới và dọn dẹp ảnh bìa cũ' });
});

// 4.1b. API: Xóa ảnh bìa của bài hát / album
app.delete('/local-api/tracks/:id/cover', async (c) => {
  const trackId = c.req.param('id');
  const scanned = cachedScannedTracks.find(t => t.track.id === trackId);
  if (!scanned) {
    return c.json({ status: 404, error: 'Không tìm thấy bài hát' }, 404);
  }

  const albumId = scanned.track.albumId || `track_${trackId.slice(0, 8)}`;
  const oldCoverFile = path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`);
  if (existsSync(oldCoverFile)) {
    await fs.unlink(oldCoverFile).catch(() => {});
  }

  cachedCovers.delete(albumId);
  scanned.coverBuffer = undefined;
  scanned.track.cover = undefined;

  return c.json({ status: 200, message: 'Đã xóa ảnh bìa thành công' });
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
      await fs.unlink(lrcFile).catch(() => {});
    }
    const scanned = cachedScannedTracks.find(t => t.track.id === trackId);
    if (scanned) scanned.track.lyrics = undefined;
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

  return c.json({ status: 200, message: 'Đã lưu lời bài hát thành công' });
});

// 5. API: Quét xem trước các file nhập mới (Import Preview / Inspect)
app.post('/local-api/import/inspect', async (c) => {
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
});

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
app.post('/local-api/import/confirm', async (c) => {
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
      await fs.unlink(path.join(TEMP_IMPORT_DIR, r)).catch(() => {});
    }
  } catch {
    // bỏ qua
  }

  return c.json({ status: 200, importedCount });
});

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
      const albumId = item.track.albumId;
      if (albumId && !item.coverBuffer) {
        const customPath = path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`);
        if (existsSync(customPath)) {
          try {
            item.coverBuffer = await fs.readFile(customPath);
            item.track.cover = `covers/${albumId}.jpg`;
          } catch {
            // bỏ qua
          }
        }
      }
    }

    const { library, coversByAlbumId } = buildLibrary(scannedTracks);
    const uploader = new R2Uploader(config);

    const totalSteps = scannedTracks.length + coversByAlbumId.size + 1;
    let completedSteps = 0;

    for (const [i, item] of scannedTracks.entries()) {
      completedSteps++;
      const pct = 15 + Math.round((completedSteps / totalSteps) * 70);
      currentSyncProgress = {
        active: true,
        step: `Đang tải âm thanh (${i + 1}/${scannedTracks.length}): "${item.track.title}"`,
        current: i + 1,
        total: scannedTracks.length,
        percent: pct,
        error: null,
      };
      await uploader.uploadAudio(item.track.file, item.filePath);
    }

    let coverIdx = 0;
    for (const [albumId, buffer] of coversByAlbumId.entries()) {
      coverIdx++;
      completedSteps++;
      const pct = 15 + Math.round((completedSteps / totalSteps) * 70);
      currentSyncProgress = {
        active: true,
        step: `Đang tải ảnh bìa album (${coverIdx}/${coversByAlbumId.size})...`,
        current: coverIdx,
        total: coversByAlbumId.size,
        percent: pct,
        error: null,
      };
      await uploader.uploadCover(albumId, buffer);
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
      step: 'Đang cập nhật chỉ mục library.json lên R2...',
      current: totalSteps,
      total: totalSteps,
      percent: 95,
      error: null,
    };

    await uploader.uploadLibrary(library);

    currentSyncProgress = {
      active: false,
      step: `Đồng bộ hoàn tất: ${library.tracks.length} bài hát, ${library.albums.length} albums!`,
      current: totalSteps,
      total: totalSteps,
      percent: 100,
      error: null,
    };

    cachedR2TrackKeys.clear();

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
      for (const t of activeTracks) {
        validKeys.add(t.track.file);
        if (t.track.albumId) validKeys.add(`covers/${t.track.albumId}.jpg`);
        if (t.track.lyrics?.file) validKeys.add(t.track.lyrics.file);
      }

      keys = objects.filter((o): o is typeof o & { Key: string } => Boolean(o.Key && !validKeys.has(o.Key))).map((o) => o.Key);
    }

    let deletedCount = 0;
    for (const k of keys) {
      if (k !== 'library.json') {
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
      ...(localConfig.MUSIC_IMPORT_DIR
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

    // Bảo vệ: Không xóa ổ đĩa gốc (C:\, D:\...)
    const rootPath = path.parse(normPath).root;
    if (normPath.toLowerCase() === rootPath.toLowerCase()) {
      return c.json({ status: 400, error: 'Không thể xóa ổ đĩa gốc của máy tính' }, 400);
    }

    // Bảo vệ: Không xóa thư mục gốc của Thư viện nhạc chính hoặc Thư mục Nhập
    if (
      (localConfig.MUSIC_SOURCE_DIR && normPath.toLowerCase() === path.resolve(localConfig.MUSIC_SOURCE_DIR).toLowerCase()) ||
      (localConfig.MUSIC_IMPORT_DIR && normPath.toLowerCase() === path.resolve(localConfig.MUSIC_IMPORT_DIR).toLowerCase())
    ) {
      return c.json({ status: 400, error: 'Không thể xóa thư mục gốc thư viện chính của ứng dụng' }, 400);
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
  let files: string[] = [];
  try {
    files = await findAudioFiles(localConfig.MUSIC_SOURCE_DIR);
  } catch {
    // bỏ qua
  }

  const overrides = await getOverrides();
  const trashItems = [];

  for (const f of files) {
    const item = await scanAudioFile(f);
    if (!item) continue;
    const ov = overrides.tracks[item.track.id];
    if (ov?.deletedAt && !ov?.purged) {
      const deletedDate = new Date(ov.deletedAt);
      const now = new Date();
      const elapsedDays = Math.floor((now.getTime() - deletedDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysLeft = Math.max(0, 14 - elapsedDays);

      trashItems.push({
        id: item.track.id,
        title: ov.title || item.track.title,
        artist: ov.artist || item.track.artist,
        album: ov.album || item.track.album,
        albumId: item.track.albumId,
        format: path.extname(item.filePath).toUpperCase().replace('.', ''),
        deletedAt: ov.deletedAt,
        daysLeft,
        hasCover: Boolean(item.coverBuffer),
      });
    }
  }

  return c.json({ status: 200, trash: trashItems });
});

// 10. API: Chuyển bài hát vào Thùng rác
app.post('/local-api/tracks/:id/trash', async (c) => {
  const id = c.req.param('id');
  await moveToTrash(id);
  return c.json({ status: 200, message: 'Đã chuyển vào thùng rác (lưu trữ 14 ngày)' });
});

// 10b. API: Chuyển nhiều bài hát vào Thùng rác hàng loạt
app.post('/local-api/tracks/batch/trash', async (c) => {
  const body = (await c.req.json()) as { ids?: string[] };
  const ids = body.ids || [];
  for (const id of ids) {
    await moveToTrash(id);
  }
  return c.json({
    status: 200,
    message: `Đã chuyển ${ids.length} bài hát vào thùng rác (lưu trữ 14 ngày)`,
  });
});

// 11. API: Khôi phục bài hát từ Thùng rác
app.post('/local-api/tracks/:id/restore', async (c) => {
  const id = c.req.param('id');
  await restoreFromTrash(id);
  return c.json({ status: 200, message: 'Đã khôi phục bài hát thành công' });
});

// 12. API: Xóa vĩnh viễn khỏi Thùng rác (hỗ trợ tùy chọn xóa đồng thời trên R2)
app.delete('/local-api/tracks/:id/trash', async (c) => {
  const id = c.req.param('id');
  const deleteFromR2 = c.req.query('deleteFromR2') === 'true';
  await purgeFromTrash(id);

  // 1. Dọn dẹp file lời bài hát cục bộ nếu có
  const localLrc = path.join(LYRICS_DIR, `${id}.lrc`);
  if (existsSync(localLrc)) {
    await fs.unlink(localLrc).catch(() => {});
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
        await fs.unlink(coverPath).catch(() => {});
      }
      cachedCovers.delete(targetAlbumId);
    }
  }

  let r2Deleted = false;
  if (deleteFromR2) {
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
        const res = await s3.send(new ListObjectsV2Command({ Bucket: localConfig.R2_BUCKET, Prefix: 'music/' }));
        if (res.Contents) {
          for (const item of res.Contents) {
            if (item.Key && item.Key.includes(id)) {
              await s3.send(new DeleteObjectCommand({ Bucket: localConfig.R2_BUCKET, Key: item.Key }));
              r2Deleted = true;
            }
          }
        }

        // Xóa lời trên R2 nếu có
        await s3.send(new DeleteObjectCommand({ Bucket: localConfig.R2_BUCKET, Key: `lyrics/${id}.lrc` })).catch(() => {});

        // Xóa ảnh bìa trên R2 nếu album không còn bài nào khác
        if (targetAlbumId && !albumStillInUse) {
          await s3.send(new DeleteObjectCommand({ Bucket: localConfig.R2_BUCKET, Key: `covers/${targetAlbumId}.jpg` })).catch(() => {});
        }
      } catch (e) {
        console.warn('Lỗi xóa file trên R2 khi purge:', e);
      }
    }
  }

  return c.json({
    status: 200,
    message: r2Deleted
      ? 'Đã xóa vĩnh viễn khỏi thùng rác và đã xóa file tương ứng trên Cloudflare R2'
      : 'Đã xóa vĩnh viễn khỏi thùng rác',
    r2Deleted,
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

  // 1. Lưu artist.png (chất lượng cao .PNG không vỡ hạt)
  const artistPng = path.join(artistDir, 'artist.png');
  await fs.writeFile(artistPng, imgBuf);

  // 2. Lưu folder.png cho Windows Explorer
  const folderPng = path.join(artistDir, 'folder.png');
  await fs.writeFile(folderPng, imgBuf);

  // 3. Giữ thêm bản artist.jpg / folder.jpg để tương thích ngược 100% với các công cụ chỉ đọc JPG
  const artistJpg = path.join(artistDir, 'artist.jpg');
  await fs.writeFile(artistJpg, imgBuf).catch(() => {});
  const folderJpg = path.join(artistDir, 'folder.jpg');
  await fs.writeFile(folderJpg, imgBuf).catch(() => {});

  // 4. Áp dụng thông tin metadata tab "Details" (Curator: Kato) chuyên nghiệp cho các file ảnh
  try {
    applyArtistImageMetadata(artistPng, { artistName, curator: 'Kato' });
    applyArtistImageMetadata(folderPng, { artistName, curator: 'Kato' });
    applyArtistImageMetadata(artistJpg, { artistName, curator: 'Kato' });
    applyArtistImageMetadata(folderJpg, { artistName, curator: 'Kato' });
  } catch {
    // Không gián đoạn luồng chính nếu có lỗi metadata
  }

  // 5. Thiết lập thuộc tính ẩn (+h +s) cho các file folder.* sau khi đã ghi metadata
  if (process.platform === 'win32') {
    try {
      execFileSync('attrib', ['+h', '+s', folderPng]);
      execFileSync('attrib', ['+h', '+s', folderJpg]);
    } catch {
      // bỏ qua
    }
  }

  // 6. Cấu hình desktop.ini cho Windows Explorer trỏ tới artist.png
  if (process.platform === 'win32') {
    try {
      const iniPath = path.join(artistDir, 'desktop.ini');
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
    const maxItems = typeof body.maxItems === 'number' ? body.maxItems : 100;
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
      stream.writeSSE({ data: JSON.stringify(event) }).catch(() => {});
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
    const limit = queryLimit ? parseInt(queryLimit, 10) : 500;
    const downloads = await youtubeJobRunner.getDownloads(limit);
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
      return c.redirect(`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`, 302);
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
    const deleted = await youtubeJobRunner.deleteDownloadSync(id, { deleteFiles, deleteR2 });
    // Đồng bộ dọn dẹp khỏi RAM
    cachedScannedTracks = cachedScannedTracks.filter((t) => t.track.id !== id);
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
        await fs.writeFile(LOCAL_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8').catch(() => {});
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
  await fs.writeFile(LOCAL_STATE_FILE, JSON.stringify(parsed.data, null, 2), 'utf-8').catch(() => {});

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
console.log(`\n🚀 Beatify Studio & Downloader đang chạy tại: http://127.0.0.1:${PORT}`);
console.log(`👉 Mở trình duyệt và truy cập: http://127.0.0.1:${PORT}\n`);

serve({ fetch: app.fetch, port: PORT });
