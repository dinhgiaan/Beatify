import * as mm from 'music-metadata';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import fs from 'fs/promises';
import { createReadStream, statSync, existsSync } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { loadConfig, loadLocalConfig } from '../config';
import { findAudioFiles, scanAudioFile, calculateTrackId } from '../services/scanner';
import type { ScannedTrack } from '../services/scanner';
import { buildLibrary } from '../services/libraryBuilder';
import { R2Uploader } from '../services/r2Uploader';
import { getOverrides, setTrackOverride, applyOverridesToScanned, moveToTrash, restoreFromTrash, purgeFromTrash } from '../services/overridesManager';
import { updateFoldersConfig } from '../services/configManager';
import { pickFolderNative } from '../services/folderPicker';
import crypto from 'crypto';
import { TrackOverrideSchema, normalizeText } from '@music-app/shared';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';

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

// Bộ nhớ cache tạm thời cho phiên làm việc local
let cachedScannedTracks: ScannedTrack[] = [];
const cachedCovers = new Map<string, Buffer>();

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

  try {
    const files = await findAudioFiles(localConfig.MUSIC_SOURCE_DIR);
    const overrides = await getOverrides();
    for (const f of files) {
      const item = await scanAudioFile(f);
      if (item) {
        const ov = overrides.tracks[item.track.id];
        if (!ov?.hidden && !ov?.purged) {
          fileCount++;
          try {
            totalBytes += statSync(f).size;
          } catch {
            // bỏ qua
          }
        }
      }
    }
  } catch {
    // bỏ qua lỗi đọc thư mục
  }

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
    freeLimitGB: 10,
    usedPercent: ((totalBytes / (10 * 1024 * 1024 * 1024)) * 100).toFixed(2),
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

  let r2TrackKeys = new Set<string>();
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
        r2TrackKeys = new Set(r2Res.Contents.map((o) => o.Key || ''));
      }
    } catch {
      // Bỏ qua lỗi kết nối mạng tạm thời
    }
  }

  const formatsCount: Record<string, number> = {};
  let tracksWithCover = 0;
  let totalDurationSec = 0;
  let totalLocalSizeBytes = 0;
  let syncedSizeBytes = 0;
  let unsyncedSizeBytes = 0;
  let syncedTracksCount = 0;
  let unsyncedTracksCount = 0;

  const tracks = cachedScannedTracks.map((item) => {
    let sizeBytes = 0;
    try {
      sizeBytes = statSync(item.filePath).size;
    } catch {
      // bỏ qua
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

// 3. API: Phát audio preview
app.get('/local-api/audio/:id', (c) => {
  const id = c.req.param('id');
  const target = cachedScannedTracks.find((t) => t.track.id === id);
  if (!target) return c.text('Not Found', 404);

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
});

// 4. API: Xem ảnh bìa album
app.get('/local-api/cover/:albumId', async (c) => {
  const albumId = c.req.param('albumId');
  let buf = cachedCovers.get(albumId);
  if (!buf) {
    const customPath = path.join(CUSTOM_COVERS_DIR, `${albumId}.jpg`);
    try {
      buf = await fs.readFile(customPath);
      cachedCovers.set(albumId, buf);
    } catch {
      // Bỏ qua nếu không có file custom
    }
  }
  if (!buf) return c.text('No cover', 404);

  return new Response(buf, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});

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

// 9. Giao diện ADMIN CONSOLE CHUYÊN NGHIỆP:
// - Đa trang (Dashboard, Bài hát, Albums & Nghệ sĩ, Nhập nhạc, Cấu hình)
// - Xóa bỏ toàn bộ Emoji thừa, giao diện phẳng chuẩn hệ thống
// - Giảm 30% kích thước font và padding, mật độ thông tin cao
// - Solid Dark Theme nguyên bản, không gradient
app.get('/', (c) => {
  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Beatify Management Console</title>
  <style>
    :root {
      --bg-base: #09090b;
      --bg-surface: #121215;
      --bg-elevated: #18181c;
      --bg-hover: #222227;
      --border: #222227;
      --border-focus: #383842;
      --text-main: #f4f4f5;
      --text-muted: #8b8b96;
      --text-dim: #5c5c66;
      --accent: #10b981;
      --accent-dim: rgba(16, 185, 129, 0.1);
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      background-color: var(--bg-base);
      color: var(--text-main);
      font-family: var(--font);
      font-size: 11.5px;
      line-height: 1.45;
      display: flex;
      height: 100vh;
      overflow: hidden;
      letter-spacing: -0.01em;
    }

    /* Sidebar Navigation */
    aside {
      width: 210px;
      background: var(--bg-surface);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .brand-area {
      padding: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border);
    }
    .brand-name {
      font-size: 12.5px;
      font-weight: 700;
      letter-spacing: 0.3px;
      color: var(--text-main);
    }
    .brand-tag {
      font-size: 9px;
      font-weight: 600;
      background: var(--bg-elevated);
      color: var(--text-muted);
      padding: 2px 5px;
      border-radius: 3px;
      border: 1px solid var(--border);
    }

    .nav-menu {
      list-style: none;
      padding: 8px;
      flex: 1;
      position: relative;
    }
    .nav-indicator {
      position: absolute;
      left: 8px;
      right: 8px;
      height: 30px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 5px;
      pointer-events: none;
      transition: top 0.22s cubic-bezier(0.16, 1, 0.3, 1), height 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease;
      z-index: 1;
      top: 0;
      opacity: 0;
    }
    .nav-label {
      font-size: 9px;
      font-weight: 600;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.8px;
      padding: 8px 8px 4px 8px;
      position: relative;
      z-index: 2;
    }
    .nav-btn {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      border-radius: 5px;
      color: var(--text-muted);
      font-weight: 500;
      font-size: 11.5px;
      cursor: pointer;
      border: 1px solid transparent;
      margin-bottom: 2px;
      user-select: none;
      transition: color 0.18s ease;
      background: transparent;
    }
    .nav-btn:hover {
      color: var(--text-main);
    }
    .nav-btn.active {
      color: var(--accent);
      font-weight: 500;
    }
    .nav-badge {
      font-size: 10px;
      background: var(--bg-base);
      color: var(--text-dim);
      padding: 1px 5px;
      border-radius: 10px;
      transition: color 0.18s ease, border-color 0.18s ease;
    }
    .nav-btn.active .nav-badge {
      color: var(--text-main);
      border: 1px solid var(--border);
    }

    .aside-footer {
      padding: 12px 14px;
      border-top: 1px solid var(--border);
      font-size: 10.5px;
      color: var(--text-dim);
      display: flex;
      justify-content: space-between;
    }

    /* Main Area */
    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-base);
    }

    /* Header Bar */
    header {
      height: 44px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-surface);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      flex-shrink: 0;
    }
    .page-title-crumb {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-main);
    }
    .header-ctrls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .search-box {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      color: var(--text-main);
      padding: 4px 9px;
      border-radius: 5px;
      font-size: 11px;
      width: 220px;
      outline: none;
    }
    .search-box:focus { border-color: var(--border-focus); }

    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 10.5px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      color: var(--text-muted);
    }
    .status-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--text-dim);
    }
    .status-dot.active { background: var(--accent); }

    .btn {
      background: var(--accent);
      color: #000;
      border: none;
      padding: 5px 12px;
      font-size: 11px;
      font-weight: 600;
      border-radius: 5px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .btn:hover { opacity: 0.9; }
    .btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .btn-outline {
      background: var(--bg-elevated);
      color: var(--text-main);
      border: 1px solid var(--border);
    }
    .btn-outline:hover { background: var(--bg-hover); }

    /* Content Area */
    .view-container {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }

    /* Pages Container */
    .tab-page { display: none; }
    .tab-page.active { display: block; }

    /* Metrics Grid */
    .grid-4 {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 14px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-bottom: 14px;
    }
    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px 14px;
    }
    .card-label {
      color: var(--text-dim);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .card-value {
      font-size: 17px;
      font-weight: 700;
      color: var(--text-main);
    }
    .card-caption {
      font-size: 10px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    /* Table styles */
    .data-table-wrapper {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
    }
    .table-top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 9px 12px;
      border-bottom: 1px solid var(--border);
    }
    .table-heading {
      font-size: 11.5px;
      font-weight: 600;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 11px;
    }
    th {
      background: var(--bg-elevated);
      color: var(--text-dim);
      padding: 7px 10px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--border);
      font-weight: 600;
    }
    td {
      padding: 7px 10px;
      border-bottom: 1px solid var(--border);
      color: var(--text-muted);
    }
    tr:hover td {
      background: var(--bg-elevated);
      color: var(--text-main);
    }
    td strong {
      color: var(--text-main);
      font-weight: 500;
    }

    .thumb {
      width: 22px;
      height: 22px;
      border-radius: 3px;
      object-fit: cover;
      background: var(--bg-elevated);
      display: inline-block;
      vertical-align: middle;
    }
    .thumb-placeholder {
      width: 22px;
      height: 22px;
      border-radius: 3px;
      background: var(--bg-elevated);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      color: var(--text-dim);
    }

    .pill-format {
      display: inline-block;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 9px;
      font-weight: 600;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      color: var(--text-muted);
    }

    .badge-synced {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 1.5px 6px;
      border-radius: 4px;
      font-size: 9.5px;
      font-weight: 600;
      background: rgba(16, 185, 129, 0.12);
      color: #10b981;
      border: 1px solid rgba(16, 185, 129, 0.3);
      white-space: nowrap;
    }
    .badge-pending {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 1.5px 6px;
      border-radius: 4px;
      font-size: 9.5px;
      font-weight: 500;
      background: rgba(234, 179, 8, 0.1);
      color: #eab308;
      border: 1px solid rgba(234, 179, 8, 0.25);
      white-space: nowrap;
    }

    .r2-file-tag {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 9.5px;
      color: var(--text-dim);
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      padding: 1px 5px;
      border-radius: 3px;
      letter-spacing: 0.1px;
    }

    .btn-preview {
      background: none;
      border: 1px solid var(--border);
      color: var(--text-muted);
      border-radius: 3px;
      padding: 2px 6px;
      font-size: 10px;
      cursor: pointer;
    }
    .btn-preview:hover {
      background: var(--text-main);
      color: #000;
    }

    /* Drag drop area */
    .upload-zone {
      border: 1px dashed var(--border-focus);
      background: var(--bg-surface);
      border-radius: 6px;
      padding: 30px 20px;
      text-align: center;
      cursor: pointer;
      margin-bottom: 14px;
      transition: all 0.12s;
    }
    .upload-zone:hover, .upload-zone.dragover {
      border-color: var(--accent);
      background: var(--accent-dim);
    }
    .upload-zone h4 {
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 3px;
    }
    .upload-zone p {
      font-size: 10.5px;
      color: var(--text-dim);
    }

    /* Config key-value view */
    .key-value-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .kv-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 10px;
      background: var(--bg-elevated);
      border-radius: 4px;
      border: 1px solid var(--border);
    }
    .kv-key { color: var(--text-dim); font-size: 11px; }
    .kv-val { color: var(--text-main); font-weight: 500; font-size: 11px; }

    /* Custom Media Dock Bar */
    .dock-player {
      height: 52px;
      background: var(--bg-surface);
      border-top: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      flex-shrink: 0;
      gap: 16px;
      user-select: none;
    }
    .dock-left {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 250px;
      min-width: 0;
    }
    .dock-thumb-box {
      width: 36px;
      height: 36px;
      border-radius: 4px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      overflow: hidden;
    }
    .dock-thumb-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .dock-thumb-empty {
      font-size: 9px;
      font-weight: 600;
      color: var(--text-dim);
      letter-spacing: 0.5px;
    }
    .dock-meta {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .dock-title {
      font-weight: 600;
      font-size: 11.5px;
      color: var(--text-main);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dock-sub {
      color: var(--text-dim);
      font-size: 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .dock-center {
      flex: 1;
      max-width: 580px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
    }
    .dock-transport {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .btn-transport {
      background: none;
      border: 1px solid transparent;
      color: var(--text-muted);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 3px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      transition: all 0.15s ease;
    }
    .btn-transport:hover {
      color: var(--text-main);
      background: var(--bg-hover);
      border-color: var(--border);
    }
    .btn-play-main {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--accent);
      color: #000;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 0.1s ease, filter 0.15s ease;
    }
    .btn-play-main:hover {
      filter: brightness(1.1);
    }
    .btn-play-main:active {
      transform: scale(0.95);
    }
    .btn-play-main svg {
      width: 13px;
      height: 13px;
      fill: #000;
    }

    .dock-timeline {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .dock-time {
      font-size: 10px;
      color: var(--text-dim);
      font-variant-numeric: tabular-nums;
      width: 32px;
    }
    .dock-time.right {
      text-align: right;
    }
    .dock-slider-track {
      flex: 1;
      height: 4px;
      background: #27272a;
      border-radius: 2px;
      cursor: pointer;
      position: relative;
      transition: height 0.12s ease;
    }
    .dock-slider-track:hover {
      height: 6px;
    }
    .dock-slider-fill {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 0%;
      background: var(--accent);
      border-radius: 2px;
      pointer-events: none;
    }

    .dock-right {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      width: 230px;
    }
    .dock-format-badge {
      font-size: 9.5px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 3px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      color: var(--text-muted);
      display: none;
    }
    .dock-volume-box {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .btn-mute {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 2px;
      display: flex;
      align-items: center;
    }
    .btn-mute:hover { color: var(--text-main); }
    .btn-mute svg { width: 14px; height: 14px; fill: currentColor; }
    .dock-volume-range {
      width: 75px;
      height: 3px;
      accent-color: var(--accent);
      cursor: pointer;
    }

    /* Modal Edit Metadata */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      backdrop-filter: blur(2px);
    }
    .modal-content {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      width: 440px;
      max-width: 90vw;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    }
    .modal-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
    }
    .modal-title {
      font-size: 12.5px;
      font-weight: 600;
      color: var(--text-main);
    }
    .modal-sub {
      font-size: 10px;
      color: var(--text-dim);
      margin-top: 2px;
    }
    .modal-close {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      padding: 2px 4px;
    }
    .modal-close:hover { color: var(--text-main); }
    .modal-body {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .form-label {
      font-size: 10.5px;
      color: var(--text-muted);
      font-weight: 500;
    }
    .form-input {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      color: var(--text-main);
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 11.5px;
      outline: none;
      width: 100%;
    }
    .form-input:focus {
      border-color: var(--border-focus);
    }
    .modal-footer {
      padding: 10px 16px;
      border-top: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      background: var(--bg-base);
      border-bottom-left-radius: 6px;
      border-bottom-right-radius: 6px;
    }

    /* Filter Pills */
    .filter-pills {
      display: inline-flex;
      gap: 6px;
      align-items: center;
    }
    .filter-pill {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 3px 10px;
      border-radius: 14px;
      font-size: 10.5px;
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
    }
    .filter-pill:hover {
      color: var(--text-main);
      border-color: var(--border-focus);
    }
    .filter-pill.active {
      background: var(--accent);
      color: #000;
      border-color: var(--accent);
      font-weight: 600;
    }

    /* Floating Batch Action Bar */
    .floating-batch-bar {
      position: fixed;
      bottom: 58px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(24, 24, 28, 0.95);
      backdrop-filter: blur(8px);
      border: 1px solid var(--border-focus);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
      border-radius: 8px;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 14px;
      z-index: 999;
      animation: batchSlideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes batchSlideUp {
      from { transform: translate(-50%, 20px); opacity: 0; }
      to { transform: translate(-50%, 0); opacity: 1; }
    }
    .batch-count-badge {
      background: var(--accent);
      color: #000;
      font-weight: 700;
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 10px;
    }
    .btn-sm {
      padding: 3px 8px;
      font-size: 10.5px;
      border-radius: 4px;
    }
    .sortable-th {
      cursor: pointer;
      user-select: none;
      transition: color 0.15s ease;
    }
    .sortable-th:hover {
      color: var(--text-main);
    }
  </style>
</head>
<body>

  <!-- Left Sidebar -->
  <aside>
    <div class="brand-area">
      <div class="brand-name">BEATIFY CONSOLE</div>
      <div class="brand-tag">LOCAL</div>
    </div>
    
    <ul class="nav-menu">
      <div class="nav-indicator" id="navIndicator"></div>
      <div class="nav-label">QUẢN LÝ</div>
      <li class="nav-btn active" data-tab="overview" onclick="switchTab('overview', this)">
        <span>Tổng quan</span>
      </li>
      <li class="nav-btn" data-tab="tracks" onclick="switchTab('tracks', this)">
        <span>Danh sách bài hát</span>
        <span class="nav-badge" id="badgeTracks">0</span>
      </li>
      <li class="nav-btn" data-tab="albums" onclick="switchTab('albums', this)">
        <span>Albums & Ca sĩ</span>
        <span class="nav-badge" id="badgeAlbums">0</span>
      </li>
      <li class="nav-btn" data-tab="import" onclick="switchTab('import', this)">
        <span>Nhập nhạc mới</span>
      </li>
      <li class="nav-btn" data-tab="trash" onclick="switchTab('trash', this)">
        <span>Thùng rác</span>
        <span class="nav-badge" id="badgeTrash">0</span>
      </li>
      
      <div class="nav-label" style="margin-top: 8px;">HỆ THỐNG</div>
      <li class="nav-btn" data-tab="settings" onclick="switchTab('settings', this)">
        <span>Cấu hình & Đồng bộ</span>
      </li>
    </ul>

    <div class="aside-footer" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px;">
      <span id="sidebarClock" style="font-size: 10px; color: var(--text-muted); font-feature-settings: 'tnum'; letter-spacing: -0.2px;">--:--:--</span>
      <span style="color: var(--accent); font-weight: 500;">Active</span>
    </div>
  </aside>

  <!-- Main View Area -->
  <main>
    <header>
      <div class="page-title-crumb" id="headerBreadcrumb">Tổng quan hệ thống</div>
      <div class="header-ctrls">
        <input type="text" id="filterInput" class="search-box" placeholder="Tìm kiếm bài hát, ca sĩ, album..." oninput="onSearchChange()">
        <div class="status-indicator">
          <span class="status-dot" id="headerDot"></span>
          <span id="headerR2Text">R2: Kiểm tra...</span>
        </div>
        <button class="btn btn-outline" onclick="loadAll()">Làm mới</button>
        <button class="btn" id="btnSyncHeader" onclick="executeSync()">Đồng bộ R2</button>
      </div>
    </header>

    <div class="view-container">

      <!-- TAB 1: TỔNG QUAN (DASHBOARD OVERVIEW) -->
      <div id="tab-overview" class="tab-page active">
        <div class="grid-4">
          <div class="card">
            <div class="card-label">Tổng số bài hát</div>
            <div class="card-value" id="statTracks">0</div>
            <div class="card-caption" id="statDuration">Thời lượng: 0 giờ</div>
          </div>
          <div class="card">
            <div class="card-label">Tổng số Albums</div>
            <div class="card-value" id="statAlbums">0</div>
            <div class="card-caption" id="statArtists">0 ca sĩ</div>
          </div>
          <div class="card">
            <div class="card-label">Dung lượng Cloudflare R2</div>
            <div class="card-value" id="statSize">0 MB</div>
            <div class="card-caption" id="statUsed" style="line-height: 1.45;">
              <span id="statR2SyncedText">Đã lên R2: 0 MB (0% / 10 GB)</span><br>
              <span id="statR2EstimateText" style="color: var(--text-dim);">Ước tính khi đồng bộ: 0 MB</span>
            </div>
          </div>
          <div class="card">
            <div class="card-label">Độ phủ ảnh bìa</div>
            <div class="card-value" id="statCoverage">0%</div>
            <div class="card-caption" id="statCoverCount">0 bài có ảnh bìa</div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-label">Phân bố định dạng âm thanh</div>
            <div style="margin-top: 10px;" id="formatDistributionList">
              <span style="color: var(--text-dim);">Chưa có dữ liệu</span>
            </div>
          </div>
          <div class="card">
            <div class="card-label">Tình trạng Cloudflare R2</div>
            <div style="margin-top: 10px;" class="key-value-list">
              <div class="kv-row">
                <span class="kv-key">Bucket</span>
                <span class="kv-val" id="ovBucket">-</span>
              </div>
              <div class="kv-row">
                <span class="kv-key">Tài khoản R2</span>
                <span class="kv-val" id="ovAccount">-</span>
              </div>
              <div class="kv-row">
                <span class="kv-key">Dung lượng R2</span>
                <span class="kv-val" id="ovR2Storage">-</span>
              </div>
              <div class="kv-row">
                <span class="kv-key">Thư mục nguồn</span>
                <span class="kv-val" id="ovDir">-</span>
              </div>
              <div class="kv-row">
                <span class="kv-key">Trạng thái đồng bộ</span>
                <span class="kv-val" id="ovSyncStatus" style="color: var(--accent); font-weight: 600;">Đang kiểm tra...</span>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-label">Bài hát mới thêm gần đây</div>
          <table style="margin-top: 8px;">
            <thead>
              <tr>
                <th style="width: 32px; text-align: center;">#</th>
                <th style="width: 30px;"></th>
                <th>Tiêu đề</th>
                <th>Nghệ sĩ</th>
                <th>Album</th>
                <th style="width: 70px;">Định dạng</th>
                <th style="width: 70px;">Thời lượng</th>
                <th style="width: 60px; text-align: center;">Nghe thử</th>
              </tr>
            </thead>
            <tbody id="recentTracksBody">
              <tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 16px;">Đang tải...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB 2: QUẢN LÝ BÀI HÁT (TRACKS) -->
      <div id="tab-tracks" class="tab-page">
        <div class="data-table-wrapper">
          <div class="table-top-bar" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
              <span class="table-heading">Tất cả bài hát (<span id="tracksTableCount">0</span>)</span>
              <div class="filter-pills" id="quickFilterPills">
                <button type="button" class="filter-pill active" data-filter="all" onclick="setQuickFilter('all', this)">Tất cả (<span id="countFilterAll">0</span>)</button>
                <button type="button" class="filter-pill" data-filter="unsynced" onclick="setQuickFilter('unsynced', this)">Chưa lên R2 (<span id="countFilterUnsynced">0</span>)</button>
                <button type="button" class="filter-pill" data-filter="nocover" onclick="setQuickFilter('nocover', this)">Chưa có bìa (<span id="countFilterNoCover">0</span>)</button>
              </div>
            </div>
            <span id="tracksFeedback" style="color: var(--accent); font-size: 10.5px;"></span>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 32px; text-align: center;"><input type="checkbox" id="checkAllTracks" title="Chọn tất cả bài hát" onchange="toggleSelectAllTracks(this.checked)"></th>
                <th style="width: 28px; text-align: center;">#</th>
                <th style="width: 32px;">Bìa</th>
                <th class="sortable-th" onclick="sortByColumn('title')">Tên bài hát <span id="sort_title" style="font-size: 9px; opacity: 0.6;">↕</span></th>
                <th class="sortable-th" onclick="sortByColumn('artist')">Ca sĩ <span id="sort_artist" style="font-size: 9px; opacity: 0.6;">↕</span></th>
                <th class="sortable-th" onclick="sortByColumn('album')">Album <span id="sort_album" style="font-size: 9px; opacity: 0.6;">↕</span></th>
                <th style="width: 65px;">Định dạng</th>
                <th class="sortable-th" style="width: 65px;" onclick="sortByColumn('size')">Dung lượng <span id="sort_size" style="font-size: 9px; opacity: 0.6;">↕</span></th>
                <th style="width: 105px; text-align: center;">Cloud R2</th>
                <th class="sortable-th" style="width: 65px;" onclick="sortByColumn('duration')">Thời lượng <span id="sort_duration" style="font-size: 9px; opacity: 0.6;">↕</span></th>
                <th style="width: 140px; text-align: center;">Thao tác</th>
              </tr>
            </thead>
            <tbody id="allTracksBody">
              <tr><td colspan="11" style="text-align: center; color: var(--text-dim); padding: 24px;">Đang tải danh sách bài hát...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB 3: ALBUMS & CA SĨ -->
      <div id="tab-albums" class="tab-page">
        <div class="grid-2">
          <div class="data-table-wrapper">
            <div class="table-top-bar">
              <span class="table-heading">Albums (<span id="albumsTableCount">0</span>)</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th style="width: 32px;">Bìa</th>
                  <th>Tên Album</th>
                  <th>Nghệ sĩ</th>
                  <th style="width: 50px;">Số bài</th>
                </tr>
              </thead>
              <tbody id="albumsBody">
                <tr><td colspan="4" style="text-align: center; color: var(--text-dim); padding: 16px;">Đang tải...</td></tr>
              </tbody>
            </table>
          </div>

          <div class="data-table-wrapper">
            <div class="table-top-bar">
              <span class="table-heading">Nghệ sĩ (<span id="artistsTableCount">0</span>)</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Tên Nghệ sĩ</th>
                  <th style="width: 60px;">Số bài</th>
                </tr>
              </thead>
              <tbody id="artistsBody">
                <tr><td colspan="2" style="text-align: center; color: var(--text-dim); padding: 16px;">Đang tải...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 4: NHẬP NHẠC MỚI (IMPORT) -->
      <div id="tab-import" class="tab-page">
        <div class="upload-zone" id="dropArea">
          <h4>Kéo thả file âm thanh & ảnh bìa vào đây</h4>
          <p>Hỗ trợ MP3, M4A, FLAC, AAC, WAV và Ảnh bìa (JPG, PNG, WEBP)</p>
          <input type="file" id="importInput" multiple accept=".mp3,.m4a,.flac,.aac,.wav,.jpg,.jpeg,.png,.webp" style="display: none;">
        </div>

        <div class="card">
          <div class="card-label">Trạng thái nhập file</div>
          <div id="importLog" style="font-size: 11px; color: var(--text-muted); margin-top: 6px;">
            Sẵn sàng nhận file từ máy tính của bạn.
          </div>
        </div>
      </div>

      <!-- TAB 5: CẤU HÌNH & ĐỒNG BỘ -->
      <div id="tab-settings" class="tab-page">
        <div class="card" style="margin-bottom: 14px;">
          <div class="card-label">Thông tin kết nối Cloudflare R2</div>
          <div class="key-value-list" style="margin-top: 10px;">
            <div class="kv-row">
              <span class="kv-key">Trạng thái file .env</span>
              <span class="kv-val" id="cfgStatus">Kiểm tra...</span>
            </div>
            <div class="kv-row">
              <span class="kv-key">R2 Bucket Name</span>
              <span class="kv-val" id="cfgBucket">beatify-music</span>
            </div>
            <div class="kv-row">
              <span class="kv-key">R2 Account ID</span>
              <span class="kv-val" id="cfgAccountId">-</span>
            </div>
            <div class="kv-row">
              <span class="kv-key">Thư mục nguồn PC (MUSIC_SOURCE_DIR)</span>
              <span class="kv-val" id="cfgSourceDir">-</span>
            </div>
            <div class="kv-row">
              <span class="kv-key">Thư mục nhập (MUSIC_IMPORT_DIR)</span>
              <span class="kv-val" id="cfgImportDir">-</span>
            </div>
          </div>
        </div>

        <div class="card" style="margin-bottom: 14px;">
          <div class="card-label">Thay đổi thư mục lưu trữ nhạc trên máy tính</div>
          <p style="color: var(--text-muted); font-size: 11px; margin: 6px 0 10px 0;">
            Chỉ định đường dẫn thư mục chứa nhạc trên PC (hệ thống sẽ tự động cập nhật file .env và quét lại thư viện).
          </p>
          <div style="display: flex; flex-direction: column; gap: 12px; max-width: 680px;">
            <div>
              <label style="display: block; font-size: 10px; color: var(--text-dim); margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">Thư mục nguồn nhạc (MUSIC_SOURCE_DIR)</label>
              <div style="display: flex; gap: 8px; align-items: center;">
                <input type="text" id="inputSourceDir" class="search-box" style="flex: 1; font-size: 11.5px;" placeholder="Ví dụ: D:/Music hoặc D:/apps on phone/Beatify/music_source">
                <button type="button" class="btn" id="btnBrowseSource" style="padding: 7px 14px; font-size: 11px; white-space: nowrap;" onclick="browseFolderFor('inputSourceDir', 'btnBrowseSource')">Chọn thư mục...</button>
              </div>
            </div>
            <div>
              <label style="display: block; font-size: 10px; color: var(--text-dim); margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">Thư mục nhập nhạc mới (MUSIC_IMPORT_DIR) - Tùy chọn</label>
              <div style="display: flex; gap: 8px; align-items: center;">
                <input type="text" id="inputImportDir" class="search-box" style="flex: 1; font-size: 11.5px;" placeholder="Để trống nếu muốn mặc định lưu vào thư mục _imported">
                <button type="button" class="btn" id="btnBrowseImport" style="padding: 7px 14px; font-size: 11px; white-space: nowrap;" onclick="browseFolderFor('inputImportDir', 'btnBrowseImport')">Chọn thư mục...</button>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; margin-top: 2px;">
              <button class="btn" onclick="saveFolderConfig()">Lưu cấu hình đường dẫn</button>
              <span id="saveFolderFeedback" style="font-size: 11px; color: var(--accent);"></span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-label">Thực thi đồng bộ đám mây</div>
          <p style="color: var(--text-muted); font-size: 11px; margin: 8px 0 12px 0;">
            Quét toàn bộ thư mục nguồn, đọc thẻ ID3, tạo library.json và tải file lên Cloudflare R2.
          </p>
          <button class="btn" id="btnSyncSettings" onclick="executeSync()">Tiến hành đồng bộ ngay</button>
          <span id="syncResultText" style="margin-left: 10px; font-size: 11px; color: var(--text-muted);"></span>
        </div>

        <div class="card" style="margin-top: 14px;">
          <div class="card-label">Dọn dẹp file thừa trên Cloudflare R2 (Giải phóng bộ nhớ)</div>
          <p style="color: var(--text-muted); font-size: 11px; margin: 6px 0 10px 0;">
            Khi bạn xóa bài hát trên máy tính, file trên đám mây R2 vẫn được giữ nguyên an toàn. Bấm quét để kiểm tra và dọn dẹp các file thừa mồ côi không còn trong thư viện.
          </p>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button class="btn btn-outline" id="btnScanOrphans" onclick="scanR2Orphans()">Quét file thừa trên R2</button>
            <span id="scanOrphansFeedback" style="font-size: 11px; color: var(--text-muted);"></span>
          </div>
          <div id="orphansResultContainer" style="display: none; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div id="orphansSummary" style="font-size: 11.5px; font-weight: 600;"></div>
              <div style="display: flex; gap: 6px;">
                <button type="button" class="btn btn-outline" style="padding: 2px 8px; font-size: 10px;" onclick="toggleSelectAllOrphans(true)">Chọn tất cả</button>
                <button type="button" class="btn btn-outline" style="padding: 2px 8px; font-size: 10px;" onclick="toggleSelectAllOrphans(false)">Bỏ chọn</button>
              </div>
            </div>
            <div id="orphansList" style="max-height: 220px; overflow-y: auto; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 4px; padding: 6px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 4px;"></div>
            <button class="btn" id="btnConfirmPrune" style="background: #ef4444; color: #fff; border-color: #dc2626;" onclick="executePruneSelectedR2()">Xác nhận xóa các file đã chọn trên R2 (<span id="selectedOrphansCount">0</span> file)</button>
          </div>
        </div>
      </div>

      <!-- TAB 6: THÙNG RÁC (TRASH - 14 NGÀY) -->
      <div id="tab-trash" class="tab-page">
        <div class="card" style="margin-bottom: 14px;">
          <div class="card-label">Kho lưu trữ rác (Hạn lưu trữ 14 ngày)</div>
          <p style="color: var(--text-muted); font-size: 11px; margin: 4px 0 0 0;">
            Các bài hát đã xóa sẽ bị ẩn hoàn toàn khỏi danh mục và app iPhone. Hệ thống tự động hủy vĩnh viễn sau 14 ngày. Tệp âm thanh gốc trên máy tính không bị ảnh hưởng.
          </p>
        </div>

        <div class="data-table-wrapper">
          <div class="table-top-bar">
            <span class="table-heading">Danh sách bài đã xóa (<span id="trashTableCount">0</span>)</span>
            <span style="font-size: 10px; color: var(--text-dim);">Có thể khôi phục lại bất kỳ lúc nào</span>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 32px; text-align: center;">#</th>
                <th style="width: 32px;">Bìa</th>
                <th>Tên bài hát</th>
                <th>Nghệ sĩ</th>
                <th>Album</th>
                <th style="width: 50px;">Định dạng</th>
                <th>Ngày xóa</th>
                <th style="width: 90px;">Thời hạn</th>
                <th style="width: 160px; text-align: center;">Thao tác</th>
              </tr>
            </thead>
            <tbody id="trashBody">
              <tr><td colspan="9" style="text-align: center; color: var(--text-dim); padding: 24px;">Thùng rác trống.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>

    <!-- Bottom Audio Preview Dock -->
    <div class="dock-player">
      <audio id="playerAudio" style="display: none;"></audio>

      <!-- Left: Track info -->
      <div class="dock-left">
        <div class="dock-thumb-box" id="dockThumbBox">
          <span class="dock-thumb-empty">AUD</span>
        </div>
        <div class="dock-meta">
          <div class="dock-title" id="dockTitle">Chưa chọn bài hát</div>
          <div class="dock-sub" id="dockSub">Bấm "Phát" ở danh sách để nghe thử</div>
        </div>
      </div>

      <!-- Center: Controls & Timeline Scrubber -->
      <div class="dock-center">
        <div class="dock-transport">
          <button class="btn-transport" onclick="playPrevTrack()" title="Bài trước (Shift+Left)">⏮</button>
          <button class="btn-transport" onclick="skipTime(-5)" title="Tua lại 5 giây (←)">−5s</button>
          <button class="btn-play-main" id="btnPlayToggle" onclick="togglePlay()" title="Phát / Dừng (Space)">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button class="btn-transport" onclick="skipTime(5)" title="Tua tiếp 5 giây (→)">+5s</button>
          <button class="btn-transport" onclick="playNextTrack()" title="Bài kế tiếp (Shift+Right)">⏭</button>
        </div>
        <div class="dock-timeline">
          <span class="dock-time" id="mediaCurTime">0:00</span>
          <div class="dock-slider-track" id="dockSliderTrack" onclick="seekTrack(event)">
            <div class="dock-slider-fill" id="dockSliderFill"></div>
          </div>
          <span class="dock-time right" id="mediaTotalTime">0:00</span>
        </div>
      </div>

      <!-- Right: Format & Volume -->
      <div class="dock-right">
        <button class="btn-transport" id="btnAutoNext" style="font-size: 10px; padding: 2px 7px; color: var(--text-dim);" onclick="toggleAutoNext()" title="Bật/Tắt tự động phát bài kế tiếp">🔁 Tiếp: Tắt</button>
        <span class="dock-format-badge" id="dockFormatBadge">MP3</span>
        <div class="dock-volume-box">
          <button class="btn-mute" onclick="toggleMute()" title="Bật/Tắt tiếng">
            <svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
          </button>
          <input type="range" class="dock-volume-range" id="mediaVolumeSlider" min="0" max="1" step="0.05" value="1" oninput="onVolumeChange(this.value)">
        </div>
      </div>
    </div>
  </main>

  <!-- Floating Batch Action Bar for Track Management -->
  <div id="floatingBatchBar" class="floating-batch-bar" style="display: none;">
    <div style="display: flex; align-items: center; gap: 8px;">
      <span id="batchSelectedBadge" class="batch-count-badge">0</span>
      <span style="font-size: 11px; color: var(--text-main); font-weight: 500;">bài đang chọn</span>
    </div>
    <div style="height: 16px; width: 1px; background: var(--border);"></div>
    <div style="display: flex; gap: 6px; align-items: center;">
      <button class="btn btn-sm btn-outline" onclick="openBatchEditModal('artist')">👤 Đổi Ca sĩ</button>
      <button class="btn btn-sm btn-outline" onclick="openBatchEditModal('album')">💿 Đổi Album</button>
      <button class="btn btn-sm btn-outline" onclick="triggerBatchTrackCoverPicker()">🖼️ Đổi Bìa</button>
      <input type="file" id="batchTrackCoverInp" accept=".jpg,.jpeg,.png,.webp" style="display: none;" onchange="handleBatchTrackCoverSelected(this)">
      <button class="btn btn-sm" style="background: #ef4444; color: #fff;" onclick="openBatchTrashModal()">🗑️ Thùng rác</button>
      <button class="btn btn-sm btn-outline" style="color: var(--text-dim);" onclick="clearSelectedTracks()">Bỏ chọn</button>
    </div>
  </div>

  <!-- Modal Chỉnh sửa hàng loạt (Batch Edit Modal) -->
  <div id="batchEditModal" class="modal-overlay" style="display: none;">
    <div class="modal-content" style="width: 420px;">
      <div class="modal-header">
        <div>
          <div class="modal-title" id="batchEditTitle">Chỉnh sửa hàng loạt</div>
          <div class="modal-sub" id="batchEditSub">Áp dụng cho các bài hát đã chọn</div>
        </div>
        <button class="modal-close" onclick="closeBatchEditModal()">&times;</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="batchEditField">
        <div class="form-group">
          <label class="form-label" id="batchEditInputLabel">Giá trị mới:</label>
          <input type="text" id="batchEditInputValue" class="form-input" placeholder="...">
        </div>
        <div id="batchEditFeedback" style="font-size: 11px; color: var(--accent); min-height: 16px;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeBatchEditModal()">Hủy bỏ</button>
        <button class="btn" id="btnConfirmBatchEdit" onclick="executeBatchEdit()">Áp dụng</button>
      </div>
    </div>
  </div>

  <!-- Modal Xác nhận Chuyển thùng rác hàng loạt -->
  <div id="batchTrashModal" class="modal-overlay" style="display: none;">
    <div class="modal-content" style="width: 420px;">
      <div class="modal-header">
        <div>
          <div class="modal-title" style="color: #ef4444;">Chuyển vào thùng rác hàng loạt</div>
          <div class="modal-sub">Lưu trữ an toàn 14 ngày trước khi dọn dẹp</div>
        </div>
        <button class="modal-close" onclick="closeBatchTrashModal()">&times;</button>
      </div>
      <div class="modal-body">
        <p style="font-size: 11.5px; color: var(--text-main); line-height: 1.5;">
          Bạn có chắc muốn chuyển <strong id="batchTrashCount" style="color: #fff;">0</strong> bài hát đã chọn vào thùng rác không?
        </p>
        <div style="background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 4px; padding: 10px; font-size: 10.5px; color: var(--text-muted); line-height: 1.5;">
          • Các bài hát sẽ bị ẩn khỏi ứng dụng và danh sách thư viện.<br>
          • Lưu trữ 14 ngày trong thùng rác và có thể khôi phục lại bất kỳ lúc nào.<br>
          • Tệp âm thanh gốc trên máy tính không bị xóa.
        </div>
        <div id="batchTrashFeedback" style="font-size: 11px; color: var(--accent); min-height: 16px; margin-top: 6px;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeBatchTrashModal()">Hủy bỏ</button>
        <button class="btn" style="background: #ef4444; color: #fff;" id="btnConfirmBatchTrash" onclick="executeBatchTrash()">Chuyển vào thùng rác</button>
      </div>
    </div>
  </div>

  <!-- Modal Chỉnh sửa thông tin bài hát (Non-destructive Metadata Override) -->
  <div id="editModal" class="modal-overlay" style="display: none;">
    <div class="modal-content" style="width: 800px; max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column;">
      <div class="modal-header">
        <div>
          <div class="modal-title">Chỉnh sửa thông tin bài hát</div>
          <div class="modal-sub">Ghi đè siêu dữ liệu & ảnh bìa an toàn, không làm thay đổi file gốc</div>
        </div>
        <button class="modal-close" onclick="closeEditModal()">&times;</button>
      </div>
      <div class="modal-body" style="padding: 16px; overflow-y: auto;">
        <input type="hidden" id="editTrackId">

        <!-- Grid 2 Cột ngang -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 18px;">
          <!-- CỘT 1: Thông tin cơ bản & Bìa -->
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <!-- Khung ảnh bìa bài hát / album -->
            <div style="display: flex; gap: 12px; align-items: center; background: var(--bg-elevated); padding: 10px; border-radius: 6px; border: 1px solid var(--border);">
              <div id="editCoverPreviewBox" style="width: 60px; height: 60px; border-radius: 4px; overflow: hidden; background: #000; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <img id="editCoverImg" src="" style="width: 100%; height: 100%; object-fit: cover; display: none;">
                <span id="editCoverEmpty" style="font-size: 9.5px; color: var(--text-dim); text-align: center;">Chưa có bìa</span>
              </div>
              <div style="flex: 1; min-width: 0;">
                <label class="form-label" style="margin-bottom: 4px; font-weight: 600;">Ảnh bìa (Cover Art)</label>
                <input type="file" id="editCoverFile" accept="image/png, image/jpeg, image/webp" style="display: none;" onchange="onCoverFileChosen(event)">
                <div style="display: flex; gap: 6px; margin-top: 3px;">
                  <button type="button" class="btn" style="padding: 4px 9px; font-size: 10.5px;" onclick="document.getElementById('editCoverFile').click()">Chọn ảnh mới</button>
                  <button type="button" id="btnRemoveCover" class="btn" style="padding: 4px 9px; font-size: 10.5px; background: transparent; border: 1px solid var(--border); color: #ef4444; display: none;" onclick="removeTrackCover()">Gỡ bìa</button>
                </div>
                <div style="font-size: 9.5px; color: var(--text-dim); margin-top: 3px;">Hỗ trợ PNG, JPG, WEBP.</div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Tên bài hát (Title)</label>
              <input type="text" id="editTitle" class="form-input" placeholder="Tên bài hát">
            </div>

            <div class="form-group">
              <label class="form-label">Nghệ sĩ trình bày (Artist) <span style="font-size: 9.5px; color: var(--text-dim); font-weight: normal;">(Gợi ý có sẵn)</span></label>
              <input type="text" id="editArtist" list="artistSuggestions" class="form-input" placeholder="Gõ hoặc chọn nghệ sĩ...">
            </div>

            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 10px;">
              <div class="form-group">
                <label class="form-label">Album <span style="font-size: 9.5px; color: var(--text-dim); font-weight: normal;">(Gợi ý)</span></label>
                <input type="text" id="editAlbum" list="albumSuggestions" class="form-input" placeholder="Tên album...">
              </div>
              <div class="form-group">
                <label class="form-label">Năm (Year)</label>
                <input type="number" id="editYear" class="form-input" placeholder="2024">
              </div>
            </div>
          </div>

          <!-- CỘT 2: Lời bài hát & Đồng bộ -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <label class="form-label" style="margin-bottom: 0; font-weight: 600;">Lời bài hát (Lyrics / Đồng bộ .lrc)</label>
              <div style="display: flex; gap: 6px;">
                <button type="button" class="btn" style="padding: 3px 8px; font-size: 10px;" onclick="document.getElementById('editLrcFile').click()">Tải file .lrc</button>
                <input type="file" id="editLrcFile" accept=".lrc,.txt" style="display: none;" onchange="handleLrcUploaded(event)">
              </div>
            </div>
            <textarea id="editLyrics" class="form-input" style="flex: 1; min-height: 190px; height: 100%; font-family: inherit; font-size: 11px; resize: none; line-height: 1.45;" placeholder="Dán lời bài hát thường hoặc lời đồng bộ theo mốc thời gian [00:15.20] vào đây..."></textarea>
            <div style="font-size: 9.5px; color: var(--text-dim);">💡 Lời sẽ được lưu thành file .lrc và tự động đồng bộ lên R2.</div>
          </div>
        </div>

        <div id="editFeedback" style="font-size: 11px; color: var(--accent); min-height: 16px; margin-top: 8px;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn" style="background: var(--bg-elevated); color: var(--text-muted); border: 1px solid var(--border);" onclick="closeEditModal()">Hủy bỏ</button>
        <button class="btn" id="btnSaveOverride" onclick="saveTrackOverride()">Lưu thông tin</button>
      </div>
    </div>
  </div>

  <!-- Modal Xác nhận chuyển vào thùng rác -->
  <div id="deleteConfirmModal" class="modal-overlay" style="display: none;">
    <div class="modal-content" style="width: 420px;">
      <div class="modal-header">
        <div>
          <div class="modal-title" style="color: #ef4444;">Xác nhận chuyển vào thùng rác</div>
          <div class="modal-sub">Lưu trữ an toàn 14 ngày trước khi dọn dẹp</div>
        </div>
        <button class="modal-close" onclick="closeDeleteConfirmModal()">&times;</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="deleteTrackId">
        <p style="font-size: 11.5px; color: var(--text-main); line-height: 1.5;">
          Bạn có chắc muốn chuyển bài hát <strong id="deleteTrackTitle" style="color: #fff;"></strong> vào thùng rác không?
        </p>
        <div style="background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 4px; padding: 10px; font-size: 10.5px; color: var(--text-muted); line-height: 1.5;">
          • Bài hát sẽ bị ẩn ngay lập tức khỏi app iPhone và danh sách phát.<br>
          • Lưu trữ tại thùng rác 14 ngày (bạn có thể khôi phục bất cứ lúc nào).<br>
          • Tệp âm thanh gốc trên ổ cứng máy tính không bị xóa.
        </div>
        <div id="deleteFeedback" style="font-size: 11px; color: var(--accent); min-height: 16px;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn" style="background: var(--bg-elevated); color: var(--text-muted); border: 1px solid var(--border);" onclick="closeDeleteConfirmModal()">Hủy bỏ</button>
        <button class="btn" style="background: #ef4444; color: #fff;" id="btnConfirmDelete" onclick="executeDeleteTrack()">Chuyển vào thùng rác</button>
      </div>
    </div>
  </div>

  <!-- Modal Xác nhận Xóa vĩnh viễn (Purge Confirmation with Clear Options) -->
  <div id="purgeConfirmModal" class="modal-overlay" style="display: none;">
    <div class="modal-content" style="width: 440px;">
      <div class="modal-header">
        <div>
          <div class="modal-title" style="color: #ef4444;">Xác nhận xóa vĩnh viễn</div>
          <div class="modal-sub">Dọn sạch bài hát khỏi hệ thống và tùy chọn đám mây</div>
        </div>
        <button class="modal-close" onclick="closePurgeConfirmModal()">&times;</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="purgeTrackId">
        <p style="font-size: 11.5px; color: var(--text-main); line-height: 1.5; margin-bottom: 12px;">
          Bạn đang chọn xóa vĩnh viễn bài hát: <strong id="purgeTrackTitle" style="color: #fff;"></strong>
        </p>

        <div style="background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 5px; padding: 12px; margin-bottom: 12px; font-size: 11px;">
          <div style="font-weight: 600; color: var(--text-muted); margin-bottom: 8px;">Tùy chọn phạm vi xóa:</div>
          <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer; margin-bottom: 8px;">
            <input type="radio" name="purgeR2Choice" value="local_only" checked style="margin-top: 2px;">
            <div>
              <div style="font-weight: 600; color: var(--text-main);">Chỉ xóa khỏi Beatify & Thùng rác</div>
              <div style="font-size: 10px; color: var(--text-dim);">Xóa bài hát khỏi ứng dụng. Tệp trên Cloudflare R2 (nếu có) được giữ nguyên.</div>
            </div>
          </label>
          <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer;">
            <input type="radio" name="purgeR2Choice" value="both" style="margin-top: 2px;">
            <div>
              <div style="font-weight: 600; color: #ef4444;">Xóa cả trên Cloudflare R2</div>
              <div style="font-size: 10px; color: var(--text-dim);">Xóa bài hát khỏi ứng dụng đồng thời xóa sạch tệp âm thanh tương ứng trên Cloudflare R2.</div>
            </div>
          </label>
        </div>

        <div style="font-size: 10px; color: var(--text-dim); line-height: 1.45;">
          🛡️ Tệp âm thanh gốc trên ổ cứng máy tính vẫn được bảo toàn an toàn 100%.
        </div>
        <div id="purgeFeedback" style="font-size: 11px; color: var(--accent); min-height: 16px; margin-top: 8px;"></div>
      </div>
      <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 8px;">
        <button class="btn" style="background: var(--bg-elevated); color: var(--text-muted); border: 1px solid var(--border);" onclick="closePurgeConfirmModal()">Hủy bỏ</button>
        <button class="btn" style="background: #ef4444; color: #fff;" id="btnConfirmPurge" onclick="executePurgeTrack()">Xác nhận xóa</button>
      </div>
    </div>
  </div>

  <!-- Modal Tiến trình Đồng bộ R2 Thời gian thực -->
  <div id="syncProgressModal" class="modal-overlay" style="display: none;">
    <div class="modal-content" style="width: 480px; padding: 22px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <div style="font-weight: 600; font-size: 13px; color: var(--text-main);">ĐỒNG BỘ CLOUDFLARE R2</div>
        <span id="syncProgressPercent" style="font-weight: 700; color: var(--accent); font-size: 13.5px;">0%</span>
      </div>
      <div style="width: 100%; height: 7px; background: #222227; border-radius: 4px; overflow: hidden; margin-bottom: 12px; border: 1px solid var(--border);">
        <div id="syncProgressBarFill" style="width: 0%; height: 100%; background: var(--accent); transition: width 0.25s ease;"></div>
      </div>
      <div id="syncProgressStepText" style="font-size: 11px; color: var(--text-muted); min-height: 18px; word-break: break-all;">Đang chuẩn bị quét dữ liệu...</div>
      <div id="syncProgressSubText" style="font-size: 10px; color: var(--text-dim); margin-top: 8px;">Vui lòng giữ tab mở trong khi tệp đang được tải lên Cloudflare R2...</div>
    </div>
  </div>

  <!-- Modal Xác nhận nhập nhạc mới (Import Confirmation & Metadata Preview) -->
  <div id="importConfirmModal" class="modal-overlay" style="display: none;">
    <div class="modal-content" style="width: 840px; max-width: 95vw;">
      <div class="modal-header">
        <div>
          <div class="modal-title">Xác nhận nhập nhạc vào kho</div>
          <div class="modal-sub">Kiểm tra và chuẩn hóa tên Ca sĩ, Album trước khi đưa vào thư viện</div>
        </div>
        <button class="modal-close" onclick="closeImportConfirmModal()">&times;</button>
      </div>
      <div class="modal-body" style="max-height: 55vh; overflow-y: auto;">
        <!-- Thanh công cụ hàng loạt khi nhập nhiều bài -->
        <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; background: var(--bg-card); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border);">
          <span style="font-size: 11px; color: var(--text-muted); font-weight: 500;">Áp dụng cho bài đã chọn:</span>
          <input type="text" id="batchArtistInput" list="artistSuggestions" class="form-input" style="width: 140px; padding: 4px 8px; font-size: 11px;" placeholder="Ca sĩ chung...">
          <button type="button" class="btn" style="padding: 4px 8px; font-size: 11px;" onclick="applyBatchArtist()">Áp dụng Ca sĩ</button>
          <input type="text" id="batchAlbumInput" list="albumSuggestions" class="form-input" style="width: 140px; padding: 4px 8px; font-size: 11px;" placeholder="Album chung...">
          <button type="button" class="btn" style="padding: 4px 8px; font-size: 11px;" onclick="applyBatchAlbum()">Áp dụng Album</button>
          <button type="button" class="btn btn-outline" style="padding: 4px 8px; font-size: 11px;" onclick="triggerBatchCoverPicker()">🖼️ Ảnh bìa chung</button>
          <input type="file" id="batchCoverInput" accept=".jpg,.jpeg,.png,.webp" style="display: none;" onchange="handleBatchCoverSelected(this)">
          <span id="importSelectedCount" style="margin-left: auto; font-size: 10.5px; color: var(--text-dim);">Đang chọn 0 bài</span>
        </div>

        <table class="data-table" style="font-size: 11px;">
          <thead>
            <tr>
              <th style="width: 32px;"><input type="checkbox" id="checkAllImport" checked onchange="toggleAllImportCheckboxes(this.checked)"></th>
              <th style="width: 28px; text-align: center;">#</th>
              <th style="width: 50px; text-align: center;">Bìa</th>
              <th style="width: 160px;">Tệp gốc</th>
              <th>Tiêu đề (Title)</th>
              <th style="width: 160px;">Ca sĩ (Artist)</th>
              <th style="width: 140px;">Album</th>
            </tr>
          </thead>
          <tbody id="importPreviewBody"></tbody>
        </table>
        <div id="importFeedback" style="font-size: 11px; color: var(--accent); min-height: 16px; margin-top: 8px;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn" style="background: var(--bg-elevated); color: var(--text-muted); border: 1px solid var(--border);" onclick="closeImportConfirmModal()">Hủy bỏ</button>
        <button class="btn" id="btnCommitImport" onclick="commitImportFiles()">Xác nhận nhập vào kho</button>
      </div>
    </div>
  </div>

  <!-- Datalist gợi ý tìm kiếm Ca sĩ & Album -->
  <datalist id="artistSuggestions"></datalist>
  <datalist id="albumSuggestions"></datalist>

  <script>
    let globalTracks = [];
    let globalAlbums = [];
    let globalArtists = [];

    function updateNavIndicator(el) {
      const indicator = document.getElementById('navIndicator');
      if (!indicator || !el) return;
      indicator.style.top = el.offsetTop + 'px';
      indicator.style.height = el.offsetHeight + 'px';
      indicator.style.opacity = '1';
    }

    // Chuyển tab SPA
    function switchTab(tabKey, el) {
      document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

      const targetPage = document.getElementById('tab-' + tabKey);
      if (targetPage) targetPage.classList.add('active');

      const targetBtn = el || document.querySelector('.nav-btn[data-tab="' + tabKey + '"]');
      if (targetBtn) {
        targetBtn.classList.add('active');
        updateNavIndicator(targetBtn);
      }

      const titles = {
        overview: 'Tổng quan hệ thống',
        tracks: 'Quản lý bài hát',
        albums: 'Quản lý Albums & Nghệ sĩ',
        import: 'Nhập nhạc vào thư viện',
        trash: 'Thùng rác (Lưu trữ 14 ngày)',
        settings: 'Cấu hình & Đồng bộ R2'
      };
      document.getElementById('headerBreadcrumb').textContent = titles[tabKey] || 'Beatify Console';
    }

    // Load trạng thái hệ thống
    async function loadStatus() {
      try {
        const res = await fetch('/local-api/status');
        const d = await res.json();

        document.getElementById('statTracks').textContent = d.fileCount || 0;
        document.getElementById('statSize').textContent = (d.totalMB || 0) + ' MB';
        document.getElementById('statUsed').textContent = d.usedPercent + '% của 10 GB miễn phí';

        document.getElementById('ovBucket').textContent = d.bucket;
        document.getElementById('ovAccount').textContent = d.accountId || '(Chưa cấu hình)';
        document.getElementById('ovDir').textContent = d.sourceDir || '(Chưa cấu hình)';

        document.getElementById('cfgBucket').textContent = d.bucket;
        document.getElementById('cfgAccountId').textContent = d.accountId || '(Chưa điền)';
        document.getElementById('cfgSourceDir').textContent = d.sourceDir || '(Chưa điền)';
        document.getElementById('cfgImportDir').textContent = d.importDir || '(Mặc định)';

        if (d.sourceDir) {
          const inpSrc = document.getElementById('inputSourceDir');
          if (inpSrc && !inpSrc.value) inpSrc.value = d.sourceDir;
        }
        if (d.importDir) {
          const inpImp = document.getElementById('inputImportDir');
          if (inpImp && !inpImp.value) inpImp.value = d.importDir;
        }

        const dot = document.getElementById('headerDot');
        const txt = document.getElementById('headerR2Text');
        const cfgStatus = document.getElementById('cfgStatus');

        if (d.configured) {
          dot.className = 'status-dot active';
          txt.textContent = 'R2: Sẵn sàng';
          cfgStatus.textContent = 'Đã kết nối đầy đủ';
          cfgStatus.style.color = 'var(--accent)';
        } else {
          dot.className = 'status-dot';
          txt.textContent = 'R2: Chưa cấu hình .env';
          cfgStatus.textContent = 'Chưa điền khóa API';
          cfgStatus.style.color = '#eab308';
        }
      } catch (err) {
        console.error(err);
      }
    }

    // Load thư viện chi tiết
    async function loadLibrary() {
      try {
        const res = await fetch('/local-api/library');
        const d = await res.json();

        globalTracks = d.tracks || [];
        globalAlbums = d.albums || [];
        globalArtists = d.artists || [];

        document.getElementById('badgeTracks').textContent = globalTracks.length;
        document.getElementById('badgeAlbums').textContent = globalAlbums.length;
        document.getElementById('statAlbums').textContent = globalAlbums.length;
        document.getElementById('statArtists').textContent = globalArtists.length + ' ca sĩ';
        
        const covVal = (d.stats && typeof d.stats.coverCoveragePercent === 'number') ? d.stats.coverCoveragePercent : 0;
        document.getElementById('statCoverage').textContent = covVal + '%';
        document.getElementById('statCoverCount').textContent = ((d.stats && d.stats.tracksWithCover) || 0) + ' bài có ảnh bìa';
        document.getElementById('statTracks').textContent = (d.stats && typeof d.stats.totalTracks === 'number') ? d.stats.totalTracks : globalTracks.length;
        document.getElementById('statDuration').textContent = 'Thời lượng: ' + ((d.stats && d.stats.totalDurationHours) || '0.0') + ' giờ';

        if (d.stats) {
          const syncedMB = d.stats.syncedSizeMB || '0.0';
          const totalEstMB = d.stats.totalSizeMB || '0.0';
          const unsyncedMB = d.stats.unsyncedSizeMB || '0.0';
          const r2Pct = d.stats.r2UsedPercent || '0.00';
          const unsyncedCount = d.stats.unsyncedTracksCount || 0;

          // Giá trị lớn ở card: Chỉ tính dung lượng các bài ĐÃ LÊN R2
          document.getElementById('statSize').textContent = syncedMB + ' MB';

          const syncTxt = document.getElementById('statR2SyncedText');
          const estTxt = document.getElementById('statR2EstimateText');

          if (syncTxt) {
            syncTxt.textContent = 'Đã lên R2: ' + syncedMB + ' MB (' + r2Pct + '% / 10 GB)';
          }
          if (estTxt) {
            if (unsyncedCount > 0) {
              estTxt.innerHTML = 'Ước tính khi đồng bộ: <strong>' + totalEstMB + ' MB</strong> (<span style="color: #eab308;">+' + unsyncedMB + ' MB</span> chưa tải)';
            } else {
              estTxt.innerHTML = '<span style="color: #10b981;">Toàn bộ bài hát đã lên R2 (100%)</span>';
            }
          }

          const ovStorage = document.getElementById('ovR2Storage');
          if (ovStorage) {
            if (unsyncedCount > 0) {
              ovStorage.innerHTML = '<span style="color: var(--accent); font-weight: 600;">' + syncedMB + ' MB</span> <span style="color: var(--text-dim); font-size: 10px;">(Ước tính: ' + totalEstMB + ' MB)</span>';
            } else {
              ovStorage.innerHTML = '<span style="color: var(--accent); font-weight: 600;">' + syncedMB + ' MB</span>';
            }
          }
        }

        // Phân bố định dạng
        const fmtContainer = document.getElementById('formatDistributionList');
        if (d.stats?.formats && Object.keys(d.stats.formats).length > 0) {
          fmtContainer.innerHTML = Object.entries(d.stats.formats).map(([fmt, count]) => \`
            <div class="kv-row" style="margin-bottom: 4px;">
              <span class="kv-key">\${fmt}</span>
              <span class="kv-val">\${count} bài</span>
            </div>
          \`).join('');
        } else {
          fmtContainer.innerHTML = '<span style="color: var(--text-dim);">Chưa có tệp âm thanh nào</span>';
        }

        const syncEl = document.getElementById('ovSyncStatus');
        if (syncEl && d.stats) {
          const synced = d.stats.syncedTracksCount || 0;
          const total = d.stats.totalTracks || 0;
          if (total === 0) {
            syncEl.innerHTML = '<span style="color: var(--text-dim);">Chưa có bài hát</span>';
          } else if (synced === total) {
            syncEl.innerHTML = '<span style="color: #10b981;">' + synced + '/' + total + ' bài đã lên R2 (100%)</span>';
          } else {
            const pct = Math.round((synced / total) * 100);
            syncEl.innerHTML = '<span style="color: #eab308;">' + synced + '/' + total + ' bài (' + pct + '%) - Cần đồng bộ</span>';
          }
        }

        // Cập nhật số lượng trong Quick Filter Pills
        const cAll = globalTracks.length;
        const cUnsynced = globalTracks.filter(t => !t.isSynced).length;
        const cNoCover = globalTracks.filter(t => !t.hasCover).length;
        const elAll = document.getElementById('countFilterAll');
        if (elAll) elAll.textContent = cAll;
        const elUnsynced = document.getElementById('countFilterUnsynced');
        if (elUnsynced) elUnsynced.textContent = cUnsynced;
        const elNoCover = document.getElementById('countFilterNoCover');
        if (elNoCover) elNoCover.textContent = cNoCover;

        applyTracksFilterAndSort();
        renderRecentTracks(globalTracks.slice(0, 5));
        renderAlbumsTable(globalAlbums);
        renderArtistsTable(globalArtists);
        populateSuggestions();
      } catch (err) {
        console.error(err);
      }
    }

    function populateSuggestions() {
      const artists = Array.from(new Set(globalTracks.map(t => t.artist).filter(Boolean))).sort();
      const albums = Array.from(new Set(globalTracks.map(t => t.album).filter(Boolean))).sort();

      const artistDl = document.getElementById('artistSuggestions');
      if (artistDl) {
        artistDl.innerHTML = artists.map(a => '<option value="' + esc(a) + '">').join('');
      }
      const albumDl = document.getElementById('albumSuggestions');
      if (albumDl) {
        albumDl.innerHTML = albums.map(a => '<option value="' + esc(a) + '">').join('');
      }
    }

    // State bộ lọc, sắp xếp và chọn hàng loạt
    let currentQuickFilter = 'all'; // 'all' | 'unsynced' | 'nocover'
    let currentSortColumn = null;
    let currentSortDirection = 'asc';
    let selectedTrackIds = new Set();
    let autoNextTrack = false;
    let currentPlayingTrackId = null;

    function setQuickFilter(filter, btn) {
      currentQuickFilter = filter;
      document.querySelectorAll('#quickFilterPills .filter-pill').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      applyTracksFilterAndSort();
    }

    function sortByColumn(col) {
      if (currentSortColumn === col) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        currentSortColumn = col;
        currentSortDirection = 'asc';
      }
      ['title', 'artist', 'album', 'size', 'duration'].forEach(c => {
        const icon = document.getElementById('sort_' + c);
        if (!icon) return;
        if (c === currentSortColumn) {
          icon.textContent = currentSortDirection === 'asc' ? '▲' : '▼';
          icon.style.opacity = '1';
        } else {
          icon.textContent = '↕';
          icon.style.opacity = '0.5';
        }
      });
      applyTracksFilterAndSort();
    }

    function getFilteredAndSortedTracks() {
      let list = [...globalTracks];

      if (currentQuickFilter === 'unsynced') {
        list = list.filter(t => !t.isSynced);
      } else if (currentQuickFilter === 'nocover') {
        list = list.filter(t => !t.hasCover);
      }

      const q = (document.getElementById('filterInput')?.value || '').toLowerCase().trim();
      if (q) {
        list = list.filter(t => 
          (t.title && t.title.toLowerCase().includes(q)) ||
          (t.artist && t.artist.toLowerCase().includes(q)) ||
          (t.album && t.album.toLowerCase().includes(q))
        );
      }

      if (currentSortColumn) {
        list.sort((a, b) => {
          let cmp = 0;
          if (currentSortColumn === 'title') {
            cmp = (a.title || '').localeCompare(b.title || '');
          } else if (currentSortColumn === 'artist') {
            cmp = (a.artist || '').localeCompare(b.artist || '');
          } else if (currentSortColumn === 'album') {
            cmp = (a.album || '').localeCompare(b.album || '');
          } else if (currentSortColumn === 'size') {
            cmp = (parseFloat(a.sizeMB) || 0) - (parseFloat(b.sizeMB) || 0);
          } else if (currentSortColumn === 'duration') {
            cmp = (a.duration || 0) - (b.duration || 0);
          }
          return currentSortDirection === 'asc' ? cmp : -cmp;
        });
      }

      return list;
    }

    function applyTracksFilterAndSort() {
      const list = getFilteredAndSortedTracks();
      renderTracksTable(list);
    }

    function renderTracksTable(tracks) {
      document.getElementById('tracksTableCount').textContent = tracks.length;
      const tbody = document.getElementById('allTracksBody');

      if (tracks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 24px; color: var(--text-dim);">Không có bài hát nào phù hợp với bộ lọc.</td></tr>';
        updateCheckAllState(tracks);
        updateFloatingBatchBar();
        return;
      }

      tbody.innerHTML = tracks.map((t, idx) => {
        const isChecked = selectedTrackIds.has(t.id);
        return \`
        <tr style="\${isChecked ? 'background: rgba(16, 185, 129, 0.05);' : ''}">
          <td style="text-align: center;">
            <input type="checkbox" class="track-row-cb" data-id="\${t.id}" \${isChecked ? 'checked' : ''} onchange="toggleTrackSelect('\${t.id}', this.checked)">
          </td>
          <td style="text-align: center; color: var(--text-dim); font-size: 11px;">\${idx + 1}</td>
          <td>
            \${t.hasCover 
              ? (\`<img class="thumb" src="/local-api/cover/\${t.albumId}">\`) 
              : \`<span class="thumb-placeholder">-</span>\`}
          </td>
          <td>
            <div style="font-weight: 500;">\${esc(t.title)}</div>
            <div style="margin-top: 3px;">
              <span class="r2-file-tag" title="Tên file lưu trữ trên Cloudflare R2">☁️ R2: \${esc(t.r2FileName || (t.id + '.' + t.format.toLowerCase()))}</span>
            </div>
          </td>
          <td>\${esc(t.artist)}</td>
          <td>\${esc(t.album)}</td>
          <td><span class="pill-format">\${t.format}</span></td>
          <td>\${t.sizeMB} MB</td>
          <td style="text-align: center;">\${t.isSynced ? '<span class="badge-synced">● Đã lên R2</span>' : '<span class="badge-pending">○ Chưa đồng bộ</span>'}</td>
          <td>\${fmtTime(t.duration)}</td>
          <td style="text-align: center; white-space: nowrap;">
            <button class="btn-preview" onclick="playAudio('\${t.id}', '\${esc(t.title)}', '\${esc(t.artist)}', '\${t.albumId || ''}', '\${t.format}')">Phát</button>
            <button class="btn-preview" style="margin-left: 4px;" onclick="openEditModal('\${t.id}', '\${esc(t.title)}', '\${esc(t.artist)}', '\${esc(t.album || '')}', '\${t.year || ''}')">Sửa</button>
            <button class="btn-preview" style="margin-left: 4px; color: #ef4444; border-color: rgba(239, 68, 68, 0.25);" onclick="confirmDeleteTrack('\${t.id}', '\${esc(t.title)}')">Xóa</button>
          </td>
        </tr>
      \`;
      }).join('');

      updateCheckAllState(tracks);
      updateFloatingBatchBar();
    }

    function updateCheckAllState(tracks) {
      const chkAll = document.getElementById('checkAllTracks');
      if (!chkAll) return;
      if (tracks.length === 0) {
        chkAll.checked = false;
        chkAll.indeterminate = false;
        return;
      }
      const countSelected = tracks.filter(t => selectedTrackIds.has(t.id)).length;
      if (countSelected === 0) {
        chkAll.checked = false;
        chkAll.indeterminate = false;
      } else if (countSelected === tracks.length) {
        chkAll.checked = true;
        chkAll.indeterminate = false;
      } else {
        chkAll.checked = false;
        chkAll.indeterminate = true;
      }
    }

    function toggleTrackSelect(id, checked) {
      if (checked) {
        selectedTrackIds.add(id);
      } else {
        selectedTrackIds.delete(id);
      }
      const list = getFilteredAndSortedTracks();
      updateCheckAllState(list);
      updateFloatingBatchBar();
    }

    function toggleSelectAllTracks(checked) {
      const list = getFilteredAndSortedTracks();
      if (checked) {
        list.forEach(t => selectedTrackIds.add(t.id));
      } else {
        list.forEach(t => selectedTrackIds.delete(t.id));
      }
      renderTracksTable(list);
    }

    function clearSelectedTracks() {
      selectedTrackIds.clear();
      applyTracksFilterAndSort();
    }

    function updateFloatingBatchBar() {
      const bar = document.getElementById('floatingBatchBar');
      const badge = document.getElementById('batchSelectedBadge');
      if (!bar) return;
      if (selectedTrackIds.size > 0) {
        if (badge) badge.textContent = selectedTrackIds.size;
        bar.style.display = 'flex';
      } else {
        bar.style.display = 'none';
      }
    }

    function openBatchEditModal(field) {
      if (selectedTrackIds.size === 0) return;
      const title = document.getElementById('batchEditTitle');
      const sub = document.getElementById('batchEditSub');
      const fld = document.getElementById('batchEditField');
      const lbl = document.getElementById('batchEditInputLabel');
      const inp = document.getElementById('batchEditInputValue');
      const fb = document.getElementById('batchEditFeedback');

      fld.value = field;
      inp.value = '';
      if (fb) fb.textContent = '';

      if (field === 'artist') {
        title.textContent = 'Đổi Ca sĩ hàng loạt';
        sub.textContent = 'Áp dụng ca sĩ mới cho ' + selectedTrackIds.size + ' bài hát đang chọn';
        lbl.textContent = 'Tên Ca sĩ mới:';
        inp.placeholder = 'Nhập tên nghệ sĩ / ca sĩ...';
      } else {
        title.textContent = 'Đổi Album hàng loạt';
        sub.textContent = 'Áp dụng album mới cho ' + selectedTrackIds.size + ' bài hát đang chọn';
        lbl.textContent = 'Tên Album mới:';
        inp.placeholder = 'Nhập tên album...';
      }

      document.getElementById('batchEditModal').style.display = 'flex';
      setTimeout(() => inp.focus(), 50);
    }

    function closeBatchEditModal() {
      document.getElementById('batchEditModal').style.display = 'none';
    }

    async function executeBatchEdit() {
      const field = document.getElementById('batchEditField').value;
      const val = document.getElementById('batchEditInputValue').value.trim();
      const fb = document.getElementById('batchEditFeedback');
      const btn = document.getElementById('btnConfirmBatchEdit');

      if (!val) {
        fb.textContent = 'Vui lòng nhập giá trị mới';
        fb.style.color = '#ef4444';
        return;
      }

      btn.disabled = true;
      fb.textContent = 'Đang cập nhật ' + selectedTrackIds.size + ' bài hát...';
      fb.style.color = 'var(--text-muted)';

      const payload = {
        trackIds: Array.from(selectedTrackIds),
        artist: field === 'artist' ? val : undefined,
        album: field === 'album' ? val : undefined,
      };

      try {
        const res = await fetch('/local-api/tracks/batch-override', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const d = await res.json();
        if (res.ok) {
          fb.textContent = d.message || 'Đã cập nhật thành công!';
          fb.style.color = 'var(--accent)';
          await loadAll();
          setTimeout(() => {
            closeBatchEditModal();
            clearSelectedTracks();
          }, 600);
        } else {
          fb.textContent = 'Lỗi: ' + (d.error || 'Thất bại');
          fb.style.color = '#ef4444';
        }
      } catch (err) {
        fb.textContent = 'Lỗi kết nối: ' + err;
        fb.style.color = '#ef4444';
      } finally {
        btn.disabled = false;
      }
    }

    function triggerBatchTrackCoverPicker() {
      if (selectedTrackIds.size === 0) return;
      document.getElementById('batchTrackCoverInp').click();
    }

    async function handleBatchTrackCoverSelected(inp) {
      const file = inp.files && inp.files[0];
      if (!file) return;

      const badge = document.getElementById('batchSelectedBadge');
      const origText = badge ? badge.textContent : '';
      if (badge) badge.textContent = 'Đang tải bìa...';

      const fd = new FormData();
      fd.append('cover', file);

      try {
        const upRes = await fetch('/local-api/import/upload-cover', { method: 'POST', body: fd });
        const upD = await upRes.json();
        if (!upRes.ok || !upD.coverId) {
          throw new Error(upD.error || 'Không thể tải lên ảnh bìa');
        }

        const res = await fetch('/local-api/tracks/batch-override', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trackIds: Array.from(selectedTrackIds),
            coverId: upD.coverId,
          }),
        });
        const d = await res.json();
        if (res.ok) {
          alert('Đã cập nhật ảnh bìa thành công cho ' + selectedTrackIds.size + ' bài hát!');
          await loadAll();
          clearSelectedTracks();
        } else {
          alert('Lỗi: ' + (d.error || 'Thất bại'));
        }
      } catch (err) {
        alert('Lỗi cập nhật ảnh bìa hàng loạt: ' + err.message);
      } finally {
        inp.value = '';
        if (badge) badge.textContent = origText;
      }
    }

    function openBatchTrashModal() {
      if (selectedTrackIds.size === 0) return;
      document.getElementById('batchTrashCount').textContent = selectedTrackIds.size;
      document.getElementById('batchTrashFeedback').textContent = '';
      document.getElementById('batchTrashModal').style.display = 'flex';
    }

    function closeBatchTrashModal() {
      document.getElementById('batchTrashModal').style.display = 'none';
    }

    async function executeBatchTrash() {
      const fb = document.getElementById('batchTrashFeedback');
      const btn = document.getElementById('btnConfirmBatchTrash');

      btn.disabled = true;
      fb.textContent = 'Đang chuyển ' + selectedTrackIds.size + ' bài vào thùng rác...';
      fb.style.color = 'var(--text-muted)';

      try {
        const res = await fetch('/local-api/tracks/batch-trash', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackIds: Array.from(selectedTrackIds) }),
        });
        const d = await res.json();
        if (res.ok) {
          fb.textContent = d.message || 'Đã chuyển vào thùng rác thành công!';
          fb.style.color = 'var(--accent)';
          await loadAll();
          setTimeout(() => {
            closeBatchTrashModal();
            clearSelectedTracks();
          }, 600);
        } else {
          fb.textContent = 'Lỗi: ' + (d.error || 'Thất bại');
          fb.style.color = '#ef4444';
        }
      } catch (err) {
        fb.textContent = 'Lỗi kết nối: ' + err;
        fb.style.color = '#ef4444';
      } finally {
        btn.disabled = false;
      }
    }

    function renderRecentTracks(tracks) {
      const tbody = document.getElementById('recentTracksBody');
      if (tracks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 12px;">Chưa có bài hát nào</td></tr>';
        return;
      }
      tbody.innerHTML = tracks.map((t, idx) => \`
        <tr style="cursor: pointer;" onclick="playAudio('\${t.id}', '\${esc(t.title)}', '\${esc(t.artist)}', '\${t.albumId || ''}', '\${t.format}')" title="Bấm để nghe thử bài hát này">
          <td style="text-align: center; color: var(--text-dim); font-size: 11px;">\${idx + 1}</td>
          <td>\${t.hasCover ? ('<img class="thumb" src="/local-api/cover/' + t.albumId + '">') : '<span class="thumb-placeholder">-</span>'}</td>
          <td><strong>\${esc(t.title)}</strong></td>
          <td>\${esc(t.artist)}</td>
          <td>\${esc(t.album)}</td>
          <td><span class="pill-format">\${t.format}</span></td>
          <td>\${fmtTime(t.duration)}</td>
          <td style="text-align: center;">
            <button class="btn-preview" style="color: var(--accent); border-color: rgba(16, 185, 129, 0.3);" onclick="event.stopPropagation(); playAudio('\${t.id}', '\${esc(t.title)}', '\${esc(t.artist)}', '\${t.albumId || ''}', '\${t.format}')">Phát</button>
          </td>
        </tr>
      \`).join('');
    }

    function renderAlbumsTable(albums) {
      document.getElementById('albumsTableCount').textContent = albums.length;
      const tbody = document.getElementById('albumsBody');
      if (albums.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-dim); padding: 16px;">Chưa có album</td></tr>';
        return;
      }
      tbody.innerHTML = albums.map(a => \`
        <tr>
          <td>\${a.hasCover ? \`<img class="thumb" src="/local-api/cover/\${a.id}">\` : \`<span class="thumb-placeholder">-</span>\`}</td>
          <td><strong>\${esc(a.title)}</strong></td>
          <td>\${esc(a.artist)}</td>
          <td>\${a.trackCount}</td>
        </tr>
      \`).join('');
    }

    function renderArtistsTable(artists) {
      document.getElementById('artistsTableCount').textContent = artists.length;
      const tbody = document.getElementById('artistsBody');
      if (artists.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: var(--text-dim); padding: 16px;">Chưa có nghệ sĩ</td></tr>';
        return;
      }
      tbody.innerHTML = artists.map(ar => \`
        <tr>
          <td><strong>\${esc(ar.name)}</strong></td>
          <td>\${ar.trackCount}</td>
        </tr>
      \`).join('');
    }

    function playAudio(id, title, artist, albumId, format) {
      currentPlayingTrackId = id;
      const audio = document.getElementById('playerAudio');
      audio.src = '/local-api/audio/' + id;
      audio.play().catch(e => console.log('Audio playback info:', e));
      document.getElementById('dockTitle').textContent = title || 'Chưa có tên bài';
      document.getElementById('dockSub').textContent = artist || 'Chưa rõ nghệ sĩ';
      
      const badge = document.getElementById('dockFormatBadge');
      if (format) {
        badge.textContent = format;
        badge.style.display = 'inline-block';
      }

      const thumbBox = document.getElementById('dockThumbBox');
      if (albumId) {
        thumbBox.innerHTML = '<img class="dock-thumb-img" src="/local-api/cover/' + albumId + '">';
      } else {
        thumbBox.innerHTML = '<span class="dock-thumb-empty">AUD</span>';
      }
      setPlayState(true);
    }

    function playPrevTrack() {
      if (!globalTracks || globalTracks.length === 0) return;
      const currentList = getFilteredAndSortedTracks();
      const list = currentList.length > 0 ? currentList : globalTracks;
      let idx = list.findIndex(t => t.id === currentPlayingTrackId);
      if (idx === -1) idx = 0;
      else idx = (idx - 1 + list.length) % list.length;
      const t = list[idx];
      playAudio(t.id, t.title, t.artist, t.albumId, t.format);
    }

    function playNextTrack() {
      if (!globalTracks || globalTracks.length === 0) return;
      const currentList = getFilteredAndSortedTracks();
      const list = currentList.length > 0 ? currentList : globalTracks;
      let idx = list.findIndex(t => t.id === currentPlayingTrackId);
      if (idx === -1) idx = 0;
      else idx = (idx + 1) % list.length;
      const t = list[idx];
      playAudio(t.id, t.title, t.artist, t.albumId, t.format);
    }

    function toggleAutoNext() {
      autoNextTrack = !autoNextTrack;
      const btn = document.getElementById('btnAutoNext');
      if (btn) {
        btn.textContent = autoNextTrack ? '🔁 Tiếp: BẬT' : '🔁 Tiếp: Tắt';
        btn.style.color = autoNextTrack ? 'var(--accent)' : 'var(--text-dim)';
      }
    }

    function togglePlay() {
      const audio = document.getElementById('playerAudio');
      if (!audio.src) return;
      if (audio.paused) {
        audio.play();
        setPlayState(true);
      } else {
        audio.pause();
        setPlayState(false);
      }
    }

    function setPlayState(isPlaying) {
      const btn = document.getElementById('btnPlayToggle');
      if (!btn) return;
      if (isPlaying) {
        btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
        btn.title = 'Tạm dừng (Space)';
      } else {
        btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
        btn.title = 'Phát (Space)';
      }
    }

    function skipTime(delta) {
      const audio = document.getElementById('playerAudio');
      if (!audio.src) return;
      audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + delta));
    }

    function seekTrack(e) {
      const audio = document.getElementById('playerAudio');
      if (!audio.src || !audio.duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = pos * audio.duration;
    }

    function onVolumeChange(val) {
      const audio = document.getElementById('playerAudio');
      audio.volume = parseFloat(val);
      audio.muted = false;
    }

    function toggleMute() {
      const audio = document.getElementById('playerAudio');
      audio.muted = !audio.muted;
      const slider = document.getElementById('mediaVolumeSlider');
      if (audio.muted) slider.value = 0;
      else slider.value = audio.volume;
    }

    function fmtTime(sec) {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function esc(s) {
      if (!s) return '';
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function onSearchChange() {
      applyTracksFilterAndSort();
    }

    // Modal Edit Metadata & Cover Art
    let pendingCoverFile = null;

    function openEditModal(id, title, artist, album, year) {
      document.getElementById('editTrackId').value = id;
      document.getElementById('editTitle').value = title || '';
      document.getElementById('editArtist').value = artist || '';
      document.getElementById('editAlbum').value = album || '';
      document.getElementById('editYear').value = year || '';
      document.getElementById('editFeedback').textContent = '';

      pendingCoverFile = null;
      document.getElementById('editCoverFile').value = '';
      const img = document.getElementById('editCoverImg');
      const empty = document.getElementById('editCoverEmpty');
      const btnRemove = document.getElementById('btnRemoveCover');

      const t = globalTracks.find(x => x.id === id);
      if (t && t.hasCover && t.albumId) {
        img.src = '/local-api/cover/' + t.albumId + '?t=' + Date.now();
        img.style.display = 'block';
        empty.style.display = 'none';
        if (btnRemove) btnRemove.style.display = 'inline-block';
      } else {
        img.src = '';
        img.style.display = 'none';
        empty.style.display = 'block';
        if (btnRemove) btnRemove.style.display = 'none';
      }

      // Nạp lời bài hát (.lrc) nếu có
      const lyricsArea = document.getElementById('editLyrics');
      if (lyricsArea) lyricsArea.value = '';
      const editLrcFile = document.getElementById('editLrcFile');
      if (editLrcFile) editLrcFile.value = '';

      fetch('/local-api/tracks/' + id + '/lyrics')
        .then(r => r.json())
        .then(ld => {
          if (ld && ld.lyrics && lyricsArea) {
            lyricsArea.value = ld.lyrics;
          }
        })
        .catch(() => {});

      document.getElementById('editModal').style.display = 'flex';
    }

    function onCoverFileChosen(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      pendingCoverFile = file;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = document.getElementById('editCoverImg');
        const empty = document.getElementById('editCoverEmpty');
        const btnRemove = document.getElementById('btnRemoveCover');
        img.src = ev.target.result;
        img.style.display = 'block';
        empty.style.display = 'none';
        if (btnRemove) btnRemove.style.display = 'inline-block';
      };
      reader.readAsDataURL(file);
    }

    async function removeTrackCover() {
      const id = document.getElementById('editTrackId').value;
      if (!confirm('Bạn có chắc muốn xóa ảnh bìa này? Tệp ảnh bìa cũ sẽ được dọn dẹp xóa bỏ hoàn toàn.')) return;
      try {
        const res = await fetch('/local-api/tracks/' + id + '/cover', { method: 'DELETE' });
        if (res.ok) {
          const img = document.getElementById('editCoverImg');
          const empty = document.getElementById('editCoverEmpty');
          const btnRemove = document.getElementById('btnRemoveCover');
          img.src = '';
          img.style.display = 'none';
          empty.style.display = 'block';
          if (btnRemove) btnRemove.style.display = 'none';
          pendingCoverFile = null;
          document.getElementById('editCoverFile').value = '';
          await loadAll();
        }
      } catch (err) {
        alert('Lỗi xóa ảnh bìa: ' + err);
      }
    }

    function handleLrcUploaded(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const lyricsArea = document.getElementById('editLyrics');
        if (lyricsArea) lyricsArea.value = ev.target.result;
      };
      reader.readAsText(file);
    }

    function closeEditModal() {
      document.getElementById('editModal').style.display = 'none';
      pendingCoverFile = null;
    }

    async function saveTrackOverride() {
      const id = document.getElementById('editTrackId').value;
      const title = document.getElementById('editTitle').value.trim();
      const artist = document.getElementById('editArtist').value.trim();
      const album = document.getElementById('editAlbum').value.trim();
      const yearStr = document.getElementById('editYear').value.trim();
      const year = yearStr ? parseInt(yearStr, 10) : undefined;
      const lyricsVal = document.getElementById('editLyrics')?.value ?? '';

      const fb = document.getElementById('editFeedback');
      const btn = document.getElementById('btnSaveOverride');

      if (!title || !artist) {
        fb.textContent = 'Tên bài hát và Nghệ sĩ không được để trống';
        fb.style.color = '#ef4444';
        return;
      }

      btn.disabled = true;
      fb.textContent = 'Đang lưu thông tin...';
      fb.style.color = 'var(--text-muted)';

      try {
        if (pendingCoverFile) {
          fb.textContent = 'Đang tải lên ảnh bìa mới...';
          const coverFd = new FormData();
          coverFd.append('cover', pendingCoverFile);
          const coverRes = await fetch('/local-api/tracks/' + id + '/cover', {
            method: 'POST',
            body: coverFd,
          });
          if (!coverRes.ok) {
            const errD = await coverRes.json();
            throw new Error(errD.error || 'Lỗi lưu ảnh bìa');
          }
        }

        fb.textContent = 'Đang lưu siêu dữ liệu...';
        const res = await fetch('/local-api/tracks/' + id + '/override', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, artist, album, year }),
        });
        const d = await res.json();
        if (!res.ok) {
          throw new Error(d.error || 'Không thể lưu siêu dữ liệu');
        }

        // Lưu lời bài hát (.lrc)
        fb.textContent = 'Đang lưu lời bài hát...';
        await fetch('/local-api/tracks/' + id + '/lyrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lyrics: lyricsVal }),
        });

        fb.textContent = 'Lưu thành công! Đang cập nhật bảng...';
        fb.style.color = 'var(--accent)';
        await loadAll();
        setTimeout(() => closeEditModal(), 600);
      } catch (err) {
        fb.textContent = 'Lỗi: ' + err.message;
        fb.style.color = '#ef4444';
      } finally {
        btn.disabled = false;
      }
    }

    // Thay đổi đường dẫn folder lưu trữ
    async function saveFolderConfig() {
      const sourceDir = document.getElementById('inputSourceDir').value.trim();
      const importDir = document.getElementById('inputImportDir').value.trim();
      const fb = document.getElementById('saveFolderFeedback');

      if (!sourceDir) {
        fb.textContent = 'Vui lòng nhập đường dẫn thư mục nguồn';
        fb.style.color = '#ef4444';
        return;
      }

      fb.textContent = 'Đang lưu cấu hình thư mục...';
      fb.style.color = 'var(--text-muted)';

      try {
        const res = await fetch('/local-api/config/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceDir, importDir }),
        });
        const d = await res.json();
        if (res.ok) {
          fb.textContent = 'Đã lưu và cập nhật thư mục thành công!';
          fb.style.color = 'var(--accent)';
          await loadAll();
          setTimeout(() => { fb.textContent = ''; }, 3000);
        } else {
          fb.textContent = 'Lỗi: ' + (d.error || 'Thất bại');
          fb.style.color = '#ef4444';
        }
      } catch (err) {
        fb.textContent = 'Lỗi kết nối: ' + err;
        fb.style.color = '#ef4444';
      }
    }

    // Mở hộp thoại chọn thư mục Windows nguyên bản
    async function browseFolderFor(inputId, btnId) {
      const inp = document.getElementById(inputId);
      const btn = document.getElementById(btnId);
      const origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Đang chọn...';

      try {
        const res = await fetch('/local-api/browse-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initialPath: inp ? inp.value.trim() : '' }),
        });
        const d = await res.json();
        if (d && d.path) {
          inp.value = d.path;
          await saveFolderConfig();
        }
      } catch (err) {
        alert('Lỗi khi mở cửa sổ chọn thư mục: ' + err);
      } finally {
        btn.disabled = false;
        btn.textContent = origText;
      }
    }

    // Thao tác Thùng rác 14 ngày
    function confirmDeleteTrack(id, title) {
      document.getElementById('deleteTrackId').value = id;
      document.getElementById('deleteTrackTitle').textContent = '"' + title + '"';
      document.getElementById('deleteFeedback').textContent = '';
      document.getElementById('deleteConfirmModal').style.display = 'flex';
    }

    function closeDeleteConfirmModal() {
      document.getElementById('deleteConfirmModal').style.display = 'none';
    }

    async function executeDeleteTrack() {
      const id = document.getElementById('deleteTrackId').value;
      const fb = document.getElementById('deleteFeedback');
      const btn = document.getElementById('btnConfirmDelete');

      btn.disabled = true;
      fb.textContent = 'Đang chuyển vào thùng rác...';
      fb.style.color = 'var(--text-muted)';

      try {
        const res = await fetch('/local-api/tracks/' + id + '/trash', { method: 'POST' });
        const d = await res.json();
        if (res.ok) {
          fb.textContent = 'Đã chuyển vào thùng rác!';
          fb.style.color = 'var(--accent)';
          await loadAll();
          setTimeout(() => closeDeleteConfirmModal(), 500);
        } else {
          fb.textContent = 'Lỗi: ' + (d.error || 'Thất bại');
          fb.style.color = '#ef4444';
        }
      } catch (err) {
        fb.textContent = 'Lỗi kết nối: ' + err;
        fb.style.color = '#ef4444';
      } finally {
        btn.disabled = false;
      }
    }

    async function loadTrash() {
      try {
        const res = await fetch('/local-api/trash');
        const d = await res.json();
        const trash = d.trash || [];

        document.getElementById('trashTableCount').textContent = trash.length;
        document.getElementById('badgeTrash').textContent = trash.length;

        const tbody = document.getElementById('trashBody');
        if (trash.length === 0) {
          tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-dim); padding: 24px;">Thùng rác trống.</td></tr>';
          return;
        }

        tbody.innerHTML = trash.map((t, idx) => \`
          <tr>
            <td style="text-align: center; color: var(--text-dim); font-size: 11px;">\${idx + 1}</td>
            <td>
              \${t.hasCover ? \`<img class="thumb" src="/local-api/cover/\${t.albumId}">\` : \`<span class="thumb-placeholder">-</span>\`}
            </td>
            <td><strong>\${esc(t.title)}</strong></td>
            <td>\${esc(t.artist)}</td>
            <td>\${esc(t.album)}</td>
            <td><span class="pill-format">\${t.format}</span></td>
            <td style="color: var(--text-dim); font-size: 10px;">\${new Date(t.deletedAt).toLocaleDateString('vi-VN')}</td>
            <td>
              <span style="color: \${t.daysLeft <= 3 ? '#ef4444' : 'var(--accent)'}; font-weight: 600; font-size: 10px;">
                Còn \${t.daysLeft} ngày
              </span>
            </td>
            <td style="text-align: center; white-space: nowrap;">
              <button class="btn-preview" style="color: var(--accent); border-color: rgba(16, 185, 129, 0.3);" onclick="restoreTrack('\${t.id}')">Khôi phục</button>
              <button class="btn-preview" style="margin-left: 4px; color: #ef4444; border-color: rgba(239, 68, 68, 0.25);" onclick="openPurgeModal('\${t.id}', '\${esc(t.title)}')">Hủy vĩnh viễn</button>
            </td>
          </tr>
        \`).join('');
      } catch (err) {
        console.error('Lỗi khi tải thùng rác:', err);
      }
    }

    async function restoreTrack(id) {
      try {
        const res = await fetch('/local-api/tracks/' + id + '/restore', { method: 'POST' });
        if (res.ok) {
          await loadAll();
        }
      } catch (err) {
        alert('Lỗi khôi phục: ' + err);
      }
    }

    function openPurgeModal(id, title) {
      document.getElementById('purgeTrackId').value = id;
      document.getElementById('purgeTrackTitle').textContent = '"' + (title || id) + '"';
      document.getElementById('purgeFeedback').textContent = '';
      const localRadio = document.querySelector('input[name="purgeR2Choice"][value="local_only"]');
      if (localRadio) localRadio.checked = true;
      document.getElementById('purgeConfirmModal').style.display = 'flex';
    }

    function closePurgeConfirmModal() {
      document.getElementById('purgeConfirmModal').style.display = 'none';
      document.getElementById('purgeTrackId').value = '';
    }

    async function executePurgeTrack() {
      const id = document.getElementById('purgeTrackId').value;
      if (!id) return;
      const bothChecked = document.querySelector('input[name="purgeR2Choice"][value="both"]')?.checked;
      const btn = document.getElementById('btnConfirmPurge');
      const fb = document.getElementById('purgeFeedback');
      btn.disabled = true;
      fb.textContent = 'Đang xử lý xóa vĩnh viễn...';
      fb.style.color = 'var(--text-muted)';
      try {
        const res = await fetch('/local-api/tracks/' + id + '/trash?deleteFromR2=' + (bothChecked ? 'true' : 'false'), { method: 'DELETE' });
        const d = await res.json();
        if (res.ok) {
          fb.textContent = d.message || 'Đã xóa vĩnh viễn thành công!';
          fb.style.color = 'var(--accent)';
          await loadAll();
          setTimeout(() => closePurgeConfirmModal(), 600);
        } else {
          fb.textContent = 'Lỗi: ' + (d.error || 'Thất bại');
          fb.style.color = '#ef4444';
        }
      } catch (err) {
        fb.textContent = 'Lỗi kết nối: ' + err;
        fb.style.color = '#ef4444';
      } finally {
        btn.disabled = false;
      }
    }

    let syncPollTimer = null;

    async function executeSync() {
      const b1 = document.getElementById('btnSyncHeader');
      const b2 = document.getElementById('btnSyncSettings');
      const resText = document.getElementById('syncResultText');
      const modal = document.getElementById('syncProgressModal');
      const fill = document.getElementById('syncProgressBarFill');
      const pctLabel = document.getElementById('syncProgressPercent');
      const stepText = document.getElementById('syncProgressStepText');

      b1.disabled = true;
      b2.disabled = true;
      resText.textContent = 'Đang tiến hành đồng bộ lên R2...';

      // Mở modal tiến trình thời gian thực
      fill.style.width = '5%';
      pctLabel.textContent = '5%';
      stepText.textContent = 'Đang bắt đầu chuẩn bị...';
      stepText.style.color = 'var(--text-muted)';
      modal.style.display = 'flex';

      // Khởi chạy vòng lặp kiểm tra tiến trình
      if (syncPollTimer) clearInterval(syncPollTimer);
      syncPollTimer = setInterval(async () => {
        try {
          const prRes = await fetch('/local-api/sync/progress');
          const prData = await prRes.json();
          if (prData && prData.progress) {
            const p = prData.progress;
            fill.style.width = p.percent + '%';
            pctLabel.textContent = p.percent + '%';
            stepText.textContent = p.step || 'Đang xử lý...';
            if (p.error) {
              stepText.style.color = '#ef4444';
            }
          }
        } catch (_) {}
      }, 350);

      try {
        const res = await fetch('/local-api/sync', { method: 'POST' });
        const data = await res.json();
        clearInterval(syncPollTimer);

        if (res.ok) {
          fill.style.width = '100%';
          pctLabel.textContent = '100%';
          stepText.textContent = 'Đồng bộ hoàn tất: ' + data.trackCount + ' bài hát, ' + data.albumCount + ' albums!';
          stepText.style.color = 'var(--accent)';
          resText.textContent = 'Đồng bộ hoàn tất: ' + data.trackCount + ' bài, ' + data.albumCount + ' albums.';
          resText.style.color = 'var(--accent)';
          setTimeout(() => {
            modal.style.display = 'none';
          }, 1200);
        } else {
          stepText.textContent = 'Lỗi: ' + (data.error || 'Thất bại');
          stepText.style.color = '#ef4444';
          resText.textContent = 'Lỗi: ' + (data.error || 'Thất bại');
          resText.style.color = '#ef4444';
          setTimeout(() => {
            modal.style.display = 'none';
            alert('Lỗi: ' + (data.error || 'Thất bại'));
          }, 1500);
        }
      } catch (e) {
        clearInterval(syncPollTimer);
        stepText.textContent = 'Lỗi kết nối: ' + e;
        stepText.style.color = '#ef4444';
        resText.textContent = 'Lỗi kết nối: ' + e;
        resText.style.color = '#ef4444';
        setTimeout(() => {
          modal.style.display = 'none';
        }, 1500);
      } finally {
        b1.disabled = false;
        b2.disabled = false;
        await loadAll();
      }
    }

    // Quét và dọn dẹp file mồ côi trên Cloudflare R2 (Hỗ trợ xóa đơn lẻ hoặc hàng loạt)
    let currentOrphansList = [];

    async function scanR2Orphans() {
      const btn = document.getElementById('btnScanOrphans');
      const fb = document.getElementById('scanOrphansFeedback');
      const container = document.getElementById('orphansResultContainer');
      const summary = document.getElementById('orphansSummary');
      const list = document.getElementById('orphansList');

      btn.disabled = true;
      fb.textContent = 'Đang quét bucket Cloudflare R2...';
      container.style.display = 'none';

      try {
        const res = await fetch('/local-api/r2/orphans');
        const d = await res.json();
        if (!res.ok) {
          throw new Error(d.error || 'Lỗi kiểm tra R2');
        }

        btn.disabled = false;
        if (d.totalCount === 0) {
          fb.textContent = '✓ Cloudflare R2 hoàn toàn sạch sẽ, không có file thừa.';
          fb.style.color = 'var(--accent)';
          return;
        }

        currentOrphansList = d.orphans || [];
        fb.textContent = 'Phát hiện ' + d.totalCount + ' file thừa (' + d.totalMB + ' MB)';
        fb.style.color = '#eab308';
        summary.innerHTML = '<span style="color: #ef4444;">Phát hiện ' + d.totalCount + ' file thừa trên Cloudflare R2 (' + d.totalMB + ' MB):</span>';

        list.innerHTML = currentOrphansList.map((o) =>
          '<div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; background: rgba(255,255,255,0.02); border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">' +
            '<label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex: 1; min-width: 0;">' +
              '<input type="checkbox" class="orphan-item-cb" value="' + esc(o.key) + '" checked onchange="updateSelectedOrphansCount()" style="cursor: pointer;">' +
              '<span style="font-family: ui-monospace, monospace; font-size: 10px; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' +
                '☁️ ' + esc(o.key) + ' <span style="color: var(--text-dim);">(' + o.sizeMB + ' MB)</span>' +
              '</span>' +
            '</label>' +
            '<button type="button" class="btn-preview btn-prune-single" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.25); padding: 2px 7px; font-size: 9.5px; margin-left: 8px; white-space: nowrap;" data-key="' + esc(o.key) + '">Xóa file này</button>' +
          '</div>'
        ).join('');

        list.onclick = (e) => {
          const btn = e.target.closest('.btn-prune-single');
          if (btn && btn.getAttribute('data-key')) {
            executePruneSingleR2(btn.getAttribute('data-key'));
          }
        };

        updateSelectedOrphansCount();
        container.style.display = 'block';
      } catch (err) {
        btn.disabled = false;
        fb.textContent = 'Lỗi: ' + err.message;
        fb.style.color = '#ef4444';
      }
    }

    function toggleSelectAllOrphans(select) {
      const cbs = document.querySelectorAll('.orphan-item-cb');
      cbs.forEach((cb) => { cb.checked = select; });
      updateSelectedOrphansCount();
    }

    function updateSelectedOrphansCount() {
      const cbs = document.querySelectorAll('.orphan-item-cb:checked');
      const countEl = document.getElementById('selectedOrphansCount');
      if (countEl) countEl.textContent = cbs.length;
      const btn = document.getElementById('btnConfirmPrune');
      if (btn) btn.disabled = cbs.length === 0;
    }

    // Xóa đơn lẻ 1 file cụ thể trên R2
    async function executePruneSingleR2(key) {
      if (!confirm('Bạn có chắc muốn XÓA VĨNH VIỄN file này trên Cloudflare R2?\\n\\n' + key + '\\n\\nHành động này không thể hoàn tác.')) {
        return;
      }

      const fb = document.getElementById('scanOrphansFeedback');
      fb.textContent = 'Đang xóa ' + key + ' trên R2...';

      try {
        const res = await fetch('/local-api/r2/prune', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys: [key] }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Lỗi khi xóa file');

        alert('Đã xóa thành công file: ' + key);
        await scanR2Orphans();
        await loadAll();
      } catch (err) {
        alert('Lỗi: ' + err.message);
      }
    }

    // Xóa các file đã chọn trên R2 (chọn tất cả hoặc chọn lọc)
    async function executePruneSelectedR2() {
      const checkedBoxes = Array.from(document.querySelectorAll('.orphan-item-cb:checked'));
      const keys = checkedBoxes.map((cb) => cb.value);

      if (keys.length === 0) {
        alert('Vui lòng chọn ít nhất 1 file để xóa');
        return;
      }

      if (!confirm('Bạn có chắc muốn XÓA VĨNH VIỄN ' + keys.length + ' file đã chọn trên Cloudflare R2?\\n\\nHành động này sẽ giải phóng dung lượng và không thể hoàn tác.')) {
        return;
      }

      const btn = document.getElementById('btnConfirmPrune');
      const fb = document.getElementById('scanOrphansFeedback');
      const container = document.getElementById('orphansResultContainer');

      btn.disabled = true;
      btn.textContent = 'Đang xóa ' + keys.length + ' file trên R2...';

      try {
        const res = await fetch('/local-api/r2/prune', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Lỗi khi xóa file trên R2');

        alert(d.message || ('Đã dọn dẹp thành công ' + keys.length + ' file trên R2!'));
        container.style.display = 'none';
        fb.textContent = '✓ Đã dọn dẹp thành công ' + keys.length + ' file trên R2';
        fb.style.color = 'var(--accent)';
        await loadAll();
      } catch (err) {
        alert('Lỗi: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Xác nhận xóa các file đã chọn trên R2';
      }
    }

    // Drag and Drop
    const dropArea = document.getElementById('dropArea');
    const importInput = document.getElementById('importInput');

    dropArea.onclick = () => importInput.click();
    dropArea.ondragover = (e) => { e.preventDefault(); dropArea.classList.add('dragover'); };
    dropArea.ondragleave = () => dropArea.classList.remove('dragover');
    dropArea.ondrop = async (e) => {
      e.preventDefault();
      dropArea.classList.remove('dragover');
      await handleFiles(e.dataTransfer.files);
    };
    importInput.onchange = async () => {
      await handleFiles(importInput.files);
    };

    let pendingImportItems = [];

    async function handleFiles(files) {
      if (!files || files.length === 0) return;
      const log = document.getElementById('importLog');
      log.textContent = 'Đang phân tích siêu dữ liệu của ' + files.length + ' file...';

      const fd = new FormData();
      for (const f of files) {
        fd.append('files', f);
      }

      try {
        const res = await fetch('/local-api/import/inspect', { method: 'POST', body: fd });
        const d = await res.json();
        if (res.ok && d.items && d.items.length > 0) {
          pendingImportItems = d.items;
          renderImportPreviewTable(d.items);
          log.textContent = 'Đã phân tích xong ' + d.items.length + ' file. Vui lòng xác nhận thông tin.';
          document.getElementById('importConfirmModal').style.display = 'flex';
        } else {
          log.textContent = 'Lỗi: ' + (d.error || 'Không thể phân tích file');
        }
      } catch (err) {
        log.textContent = 'Lỗi kết nối: ' + err;
      }
    }

    function renderImportPreviewTable(items) {
      const tbody = document.getElementById('importPreviewBody');
      tbody.innerHTML = items.map((it, idx) => \`
        <tr data-tempid="\${it.tempId}">
          <td style="text-align: center;">
            <input type="checkbox" class="chk-import" checked data-idx="\${idx}" onchange="updateImportSelectedCount()">
          </td>
          <td style="text-align: center; color: var(--text-dim); font-size: 10.5px;">\${idx + 1}</td>
          <td style="text-align: center;">
            <div id="coverBox_\${it.tempId}" style="width: 32px; height: 32px; margin: 0 auto; border-radius: 4px; overflow: hidden; background: var(--bg-elevated); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; cursor: pointer;" title="Bấm để chọn/đổi ảnh bìa" onclick="triggerRowCoverPicker(this.closest('tr').getAttribute('data-tempid'))">
              \${it.coverId 
                ? ('<img src="/local-api/import/cover/' + it.coverId + '" style="width: 100%; height: 100%; object-fit: cover;">')
                : '<span style="font-size: 8.5px; color: var(--text-dim); text-align: center; line-height: 1;">+ Bìa</span>'}
            </div>
            <input type="file" id="coverInp_\${it.tempId}" accept=".jpg,.jpeg,.png,.webp" style="display: none;" onchange="handleRowCoverSelected(this, this.closest('tr').getAttribute('data-tempid'))">
          </td>
          <td style="color: var(--text-dim); max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="\${esc(it.originalName)}">
            \${esc(it.originalName)}
          </td>
          <td>
            <input type="text" class="form-input inp-import-title" value="\${esc(it.title)}" style="padding: 4px 8px; font-size: 11px;">
          </td>
          <td>
            <input type="text" class="form-input inp-import-artist" list="artistSuggestions" value="\${esc(it.artist)}" style="padding: 4px 8px; font-size: 11px;" placeholder="Gõ tên ca sĩ...">
          </td>
          <td>
            <input type="text" class="form-input inp-import-album" list="albumSuggestions" value="\${esc(it.album)}" style="padding: 4px 8px; font-size: 11px;" placeholder="Tên album...">
          </td>
        </tr>
      \`).join('');
      document.getElementById('importFeedback').textContent = '';
      updateImportSelectedCount();
    }

    function updateImportSelectedCount() {
      const all = document.querySelectorAll('.chk-import');
      const checked = document.querySelectorAll('.chk-import:checked');
      const badge = document.getElementById('importSelectedCount');
      if (badge) {
        badge.textContent = 'Đang chọn ' + checked.length + ' / ' + all.length + ' bài';
      }
    }

    function triggerBatchCoverPicker() {
      const inp = document.getElementById('batchCoverInput');
      if (inp) inp.click();
    }

    async function handleBatchCoverSelected(inp) {
      if (!inp.files || inp.files.length === 0) return;
      const file = inp.files[0];
      const formData = new FormData();
      formData.append('cover', file);
      const fb = document.getElementById('importFeedback');
      if (fb) {
        fb.textContent = 'Đang tải ảnh bìa lên...';
        fb.style.color = 'var(--text-muted)';
      }
      try {
        const res = await fetch('/local-api/import/upload-cover', {
          method: 'POST',
          body: formData,
        });
        const d = await res.json();
        if (res.ok && d.coverId) {
          let count = 0;
          const rows = document.querySelectorAll('#importPreviewBody tr');
          rows.forEach(r => {
            const chk = r.querySelector('.chk-import');
            if (chk && chk.checked) {
              const tempId = r.getAttribute('data-tempid');
              const item = pendingImportItems.find(x => x.tempId === tempId);
              if (item) {
                item.coverId = d.coverId;
                const box = document.getElementById('coverBox_' + tempId);
                if (box) {
                  box.innerHTML = '<img src="/local-api/import/cover/' + d.coverId + '" style="width: 100%; height: 100%; object-fit: cover;">';
                }
                count++;
              }
            }
          });
          if (fb) {
            fb.textContent = 'Đã áp dụng ảnh bìa chung cho ' + count + ' bài đã chọn!';
            fb.style.color = 'var(--accent)';
          }
        } else {
          if (fb) {
            fb.textContent = 'Lỗi tải ảnh bìa: ' + (d.error || 'Thất bại');
            fb.style.color = '#ef4444';
          }
        }
      } catch (err) {
        if (fb) {
          fb.textContent = 'Lỗi kết nối khi tải ảnh: ' + err;
          fb.style.color = '#ef4444';
        }
      } finally {
        inp.value = '';
      }
    }

    function triggerRowCoverPicker(tempId) {
      const inp = document.getElementById('coverInp_' + tempId);
      if (inp) inp.click();
    }

    async function handleRowCoverSelected(inp, tempId) {
      if (!inp.files || inp.files.length === 0) return;
      const file = inp.files[0];
      const formData = new FormData();
      formData.append('cover', file);
      const fb = document.getElementById('importFeedback');
      if (fb) {
        fb.textContent = 'Đang tải ảnh bìa lên...';
        fb.style.color = 'var(--text-muted)';
      }
      try {
        const res = await fetch('/local-api/import/upload-cover', {
          method: 'POST',
          body: formData,
        });
        const d = await res.json();
        if (res.ok && d.coverId) {
          const item = pendingImportItems.find(x => x.tempId === tempId);
          if (item) {
            item.coverId = d.coverId;
            const box = document.getElementById('coverBox_' + tempId);
            if (box) {
              box.innerHTML = '<img src="/local-api/import/cover/' + d.coverId + '" style="width: 100%; height: 100%; object-fit: cover;">';
            }
          }
          if (fb) {
            fb.textContent = 'Đã cập nhật ảnh bìa cho bài hát!';
            fb.style.color = 'var(--accent)';
          }
        } else {
          if (fb) {
            fb.textContent = 'Lỗi tải ảnh bìa: ' + (d.error || 'Thất bại');
            fb.style.color = '#ef4444';
          }
        }
      } catch (err) {
        if (fb) {
          fb.textContent = 'Lỗi kết nối khi tải ảnh: ' + err;
          fb.style.color = '#ef4444';
        }
      } finally {
        inp.value = '';
      }
    }

    function applyBatchArtist() {
      const val = document.getElementById('batchArtistInput').value.trim();
      if (!val) return;
      const rows = document.querySelectorAll('#importPreviewBody tr');
      let count = 0;
      rows.forEach(r => {
        const chk = r.querySelector('.chk-import');
        if (chk && chk.checked) {
          const inp = r.querySelector('.inp-import-artist');
          if (inp) {
            inp.value = val;
            count++;
          }
        }
      });
      const fb = document.getElementById('importFeedback');
      if (fb) {
        fb.textContent = 'Đã áp dụng nghệ sĩ "' + val + '" cho ' + count + ' bài đã chọn.';
        fb.style.color = 'var(--accent)';
      }
    }

    function applyBatchAlbum() {
      const val = document.getElementById('batchAlbumInput').value.trim();
      if (!val) return;
      const rows = document.querySelectorAll('#importPreviewBody tr');
      let count = 0;
      rows.forEach(r => {
        const chk = r.querySelector('.chk-import');
        if (chk && chk.checked) {
          const inp = r.querySelector('.inp-import-album');
          if (inp) {
            inp.value = val;
            count++;
          }
        }
      });
      const fb = document.getElementById('importFeedback');
      if (fb) {
        fb.textContent = 'Đã áp dụng album "' + val + '" cho ' + count + ' bài đã chọn.';
        fb.style.color = 'var(--accent)';
      }
    }

    function toggleAllImportCheckboxes(checked) {
      const chks = document.querySelectorAll('.chk-import');
      chks.forEach(c => c.checked = checked);
      updateImportSelectedCount();
    }

    function closeImportConfirmModal() {
      document.getElementById('importConfirmModal').style.display = 'none';
      pendingImportItems = [];
    }

    async function commitImportFiles() {
      const rows = document.querySelectorAll('#importPreviewBody tr');
      const selected = [];

      rows.forEach(r => {
        const chk = r.querySelector('.chk-import');
        if (chk && chk.checked) {
          const tempId = r.getAttribute('data-tempid');
          const orig = pendingImportItems.find(x => x.tempId === tempId);
          if (orig) {
            const title = r.querySelector('.inp-import-title').value.trim() || orig.title;
            const artist = r.querySelector('.inp-import-artist').value.trim() || orig.artist;
            const album = r.querySelector('.inp-import-album').value.trim() || orig.album;
            selected.push({
              tempId: orig.tempId,
              safeFileName: orig.safeFileName,
              title,
              artist,
              album,
              year: orig.year,
              coverId: orig.coverId,
            });
          }
        }
      });

      if (selected.length === 0) {
        alert('Vui lòng chọn ít nhất một bài hát để nhập vào kho!');
        return;
      }

      const fb = document.getElementById('importFeedback');
      const btn = document.getElementById('btnCommitImport');
      btn.disabled = true;
      fb.textContent = 'Đang chuyển ' + selected.length + ' bài hát vào kho...';
      fb.style.color = 'var(--text-muted)';

      try {
        const res = await fetch('/local-api/import/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: selected }),
        });
        const d = await res.json();
        if (res.ok) {
          fb.textContent = 'Đã nhập thành công ' + d.importedCount + ' bài hát vào kho!';
          fb.style.color = 'var(--accent)';
          await loadAll();
          setTimeout(() => closeImportConfirmModal(), 600);
        } else {
          fb.textContent = 'Lỗi: ' + (d.error || 'Thất bại');
          fb.style.color = '#ef4444';
        }
      } catch (err) {
        fb.textContent = 'Lỗi kết nối: ' + err;
        fb.style.color = '#ef4444';
      } finally {
        btn.disabled = false;
      }
    }

    async function loadAll() {
      await loadStatus();
      await loadLibrary();
      await loadTrash();
      const initialActive = document.querySelector('.nav-btn.active');
      if (initialActive) updateNavIndicator(initialActive);
    }

    window.addEventListener('DOMContentLoaded', () => {
      const initialActive = document.querySelector('.nav-btn.active');
      if (initialActive) updateNavIndicator(initialActive);
    });

    const audioEl = document.getElementById('playerAudio');
    audioEl.addEventListener('timeupdate', () => {
      const cur = audioEl.currentTime || 0;
      const dur = audioEl.duration || 0;
      document.getElementById('mediaCurTime').textContent = fmtTime(cur);
      if (dur > 0) {
        const pct = (cur / dur) * 100;
        document.getElementById('dockSliderFill').style.width = pct + '%';
      }
    });

    audioEl.addEventListener('loadedmetadata', () => {
      document.getElementById('mediaTotalTime').textContent = fmtTime(audioEl.duration || 0);
    });

    audioEl.addEventListener('ended', () => {
      if (autoNextTrack && globalTracks.length > 1) {
        playNextTrack();
      } else {
        setPlayState(false);
        document.getElementById('dockSliderFill').style.width = '0%';
        document.getElementById('mediaCurTime').textContent = '0:00';
      }
    });

    window.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) playPrevTrack();
        else skipTime(-5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) playNextTrack();
        else skipTime(5);
      }
    });

    audioEl.addEventListener('play', () => setPlayState(true));
    audioEl.addEventListener('pause', () => setPlayState(false));

    function updateSidebarClock() {
      const el = document.getElementById('sidebarClock');
      if (!el) return;
      const now = new Date();
      const time = now.toLocaleTimeString('vi-VN', { hour12: false });
      const date = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      el.textContent = time + ' • ' + date;
    }
    setInterval(updateSidebarClock, 1000);
    updateSidebarClock();

    loadAll();
  </script>
</body>
</html>`;
  return c.html(html);
});

const PORT = 4000;
console.log(`\n🚀 Beatify Management Console đang chạy tại: http://127.0.0.1:${PORT}`);
console.log(`👉 Mở trình duyệt và truy cập: http://127.0.0.1:${PORT}\n`);

serve({ fetch: app.fetch, port: PORT });
