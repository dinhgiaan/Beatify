import fs from 'fs/promises';
import { existsSync, statSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { spawn, execFileSync, exec } from 'child_process';
import { YoutubeService, type YoutubePreviewEntry } from './youtubeService';
import { LyricsService } from './lyricsService';
import { loadConfig, loadLocalConfig } from '../config';
import { findAudioFiles, scanAudioFile, calculateTrackId } from './scanner';
import type { ScannedTrack } from './scanner';
import { buildLibrary } from './libraryBuilder';
import { R2Uploader } from './r2Uploader';
import { getOverrides, applyOverridesToScanned, purgeFromTrash } from './overridesManager';
import { PathSanitizer } from './pathSanitizer';
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import {
  type YoutubeMusicJobPayload,
  type YoutubeMusicDownloadRecord,
  type YoutubeMusicConfig,
  type JobEvent,
  type JobStatus,
  type YoutubeMusicPreviewItem,
  type YoutubeMusicPreviewResponse,
  type RelocateDownloadsRequest,
  type DeleteDownloadOptions,
  normalizeText,
} from '@music-app/shared';

const STATE_DIR = path.resolve(
  process.cwd().endsWith('indexer') ? process.cwd() : path.join(process.cwd(), 'tools/indexer'),
  '.state'
);
const DOWNLOADS_FILE = path.join(STATE_DIR, 'youtube_downloads.json');
const CONFIG_FILE = path.join(STATE_DIR, 'youtube_config.json');

async function safeAtomicWrite(targetPath: string, content: string): Promise<void> {
  const dir = path.dirname(targetPath);
  if (!existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }
  const tempPath = `${targetPath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await fs.writeFile(tempPath, content, 'utf-8');

  let renamed = false;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await fs.rename(tempPath, targetPath);
      renamed = true;
      break;
    } catch (err: unknown) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, attempt * 50));
    }
  }

  if (!renamed) {
    try {
      await fs.copyFile(tempPath, targetPath);
      await fs.unlink(tempPath).catch(() => {});
    } catch (copyErr) {
      await fs.unlink(tempPath).catch(() => {});
      throw lastErr || copyErr;
    }
  }
}

class YoutubeJobRunner extends EventEmitter {
  private activeJobs = new Map<string, { stopRequested: boolean }>();
  private saveQueue: Promise<void> = Promise.resolve();

  constructor() {
    super();
    this.ensureStateDir();
  }

  private async ensureStateDir() {
    await fs.mkdir(STATE_DIR, { recursive: true });
  }

  // 1. Quản lý cấu hình
  async getConfig(): Promise<YoutubeMusicConfig> {
    await this.ensureStateDir();
    const local = loadLocalConfig();
    const defaultRoot = local.MUSIC_SOURCE_DIR || local.MUSIC_IMPORT_DIR || 'D:\\music for app';

    if (existsSync(CONFIG_FILE)) {
      try {
        const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          libraryRootPath: parsed.libraryRootPath || defaultRoot,
          preferredFormat: parsed.preferredFormat || 'm4a',
          fetchLyrics: parsed.fetchLyrics !== undefined ? parsed.fetchLyrics : true,
          concurrency: parsed.concurrency || 2,
          customFolderHistory: parsed.customFolderHistory || [],
        };
      } catch {
        // fallback
      }
    }

    return {
      libraryRootPath: defaultRoot,
      preferredFormat: 'm4a',
      fetchLyrics: true,
      concurrency: 2,
      customFolderHistory: [],
    };
  }

  async saveConfig(partial: Partial<YoutubeMusicConfig>): Promise<YoutubeMusicConfig> {
    const current = await this.getConfig();
    const updated: YoutubeMusicConfig = {
      ...current,
      ...partial,
      customFolderHistory: partial.customFolderHistory || current.customFolderHistory,
    };
    await this.ensureStateDir();
    await fs.writeFile(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  }

  // 2. Lịch sử tải nhạc
  async getDownloads(limit?: number): Promise<YoutubeMusicDownloadRecord[]> {
    await this.ensureStateDir();
    if (!existsSync(DOWNLOADS_FILE)) return [];
    try {
      const raw = await fs.readFile(DOWNLOADS_FILE, 'utf-8');
      const list: YoutubeMusicDownloadRecord[] = JSON.parse(raw);
      // Kiểm tra thực tế file có tồn tại trên đĩa cứng không
      for (const item of list) {
        if (item.relativeFilePath && item.libraryRootPath) {
          const cleanRelative = item.relativeFilePath.replace(/^[/\\]+/, '');
          const fullAudioPath = path.resolve(item.libraryRootPath, cleanRelative);
          item.fileExists = existsSync(fullAudioPath);
          if (item.fileExists && !item.fileSizeBytes) {
            try {
              item.fileSizeBytes = statSync(fullAudioPath).size;
            } catch {
              // bỏ qua
            }
          }
        } else {
          item.fileExists = false;
        }
      }
      return typeof limit === 'number' && limit > 0 ? list.slice(0, limit) : list;
    } catch {
      return [];
    }
  }

  private async saveDownloads(list: YoutubeMusicDownloadRecord[]): Promise<void> {
    this.saveQueue = this.saveQueue
      .then(async () => {
        await this.ensureStateDir();
        await safeAtomicWrite(DOWNLOADS_FILE, JSON.stringify(list, null, 2));
      })
      .catch((err) => {
        console.warn('[YoutubeJobRunner] Lỗi lưu downloads.json:', err);
      });
    return this.saveQueue;
  }

  async addOrUpdateDownload(record: YoutubeMusicDownloadRecord): Promise<void> {
    try {
      const list = await this.getDownloads(1000);
      const idx = list.findIndex((r) => r.id === record.id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...record, updatedAt: new Date().toISOString() };
      } else {
        list.unshift(record);
      }
      await this.saveDownloads(list);
    } catch (err) {
      console.warn('[YoutubeJobRunner] Không thể lưu bản ghi download:', err);
    }
  }

  async deleteDownload(id: string, deleteFiles = false): Promise<boolean> {
    const list = await this.getDownloads(1000);
    const target = list.find((r) => r.id === id);
    if (!target) return false;

    if (deleteFiles && target.relativeFilePath) {
      const fullPath = path.resolve(target.libraryRootPath, target.relativeFilePath);
      if (existsSync(fullPath)) {
        await fs.unlink(fullPath).catch(() => {});
      }
      if (target.relativeLyricsPath) {
        const lrcPath = path.resolve(target.libraryRootPath, target.relativeLyricsPath);
        if (existsSync(lrcPath)) {
          await fs.unlink(lrcPath).catch(() => {});
        }
      }
    }

    const filtered = list.filter((r) => r.id !== id);
    await this.saveDownloads(filtered);
    return true;
  }

  async clearAllDownloads(): Promise<number> {
    const list = await this.getDownloads(1000);
    const count = list.length;
    await this.saveDownloads([]);
    return count;
  }

  // 3. Phân tích trước khi tải (Preview)
  async preview(urls: string[], maxItems = 1000): Promise<YoutubeMusicPreviewResponse> {
    const allItems: YoutubeMusicPreviewItem[] = [];
    let isPlaylist = false;
    let playlistTitle: string | undefined;

    const existingDownloads = await this.getDownloads(5000);
    const existingMap = new Map<string, YoutubeMusicDownloadRecord>();
    for (const d of existingDownloads) {
      existingMap.set(d.id, d);
      existingMap.set(d.videoId, d);
      if (d.sourceUrl) existingMap.set(d.sourceUrl, d);
    }

    const entriesToProcess: YoutubePreviewEntry[] = [];

    for (const url of urls) {
      if (entriesToProcess.length >= maxItems) break;
      const res = await YoutubeService.previewUrl(url, maxItems);
      if (res.isPlaylist) {
        isPlaylist = true;
        playlistTitle = res.playlistTitle;
      }
      for (const entry of res.entries) {
        if (entriesToProcess.length >= maxItems) break;
        entriesToProcess.push(entry);
      }
    }

    // Tra cứu lời đồng bộ từ LRCLIB song song cho TOÀN BỘ bài hát (batch 10 bài/lần)
    // Đối với bài đơn (single): có thử thêm YouTube CC nếu LRCLIB chưa có.
    // Đối với playlist lớn: ưu tiên LRCLIB HTTP tốc độ cao (~100ms) để phản hồi tức thì cho cả 250+ bài.
    const lyricsResults = new Map<string, { source: 'lrclib-synced' | 'lrclib-plain' | 'yt-subs' | 'none'; text: string }>();
    const chunkSize = 10;
    for (let i = 0; i < entriesToProcess.length; i += chunkSize) {
      const chunk = entriesToProcess.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (entry) => {
          let source: 'lrclib-synced' | 'lrclib-plain' | 'yt-subs' | 'none' = 'none';
          let text = '';
          try {
            // Thử 1: Title + Artist
            let lrc = await LyricsService.fetchLyrics(
              entry.cleaned.title,
              entry.cleaned.artist,
              entry.duration
            );

            // Thử 2: Đảo ngược Artist + Title nếu chưa ra
            if ((!lrc || lrc.source === 'none') && entry.cleaned.artist && entry.cleaned.title) {
              const flipped = await LyricsService.fetchLyrics(
                entry.cleaned.artist,
                entry.cleaned.title,
                entry.duration
              );
              if (flipped && flipped.source !== 'none') {
                lrc = flipped;
              }
            }

            if (lrc?.syncedLyrics && !lrc.durationMismatchWarning) {
              source = 'lrclib-synced';
              text = lrc.syncedLyrics;
            } else {
              // Nếu LRCLIB không có hoặc thời lượng lệch (> 3s), thử lấy phụ đề chính thức YouTube CC chuẩn theo video
              const ytSub = await LyricsService.extractYouTubeSubtitles(entry.url);
              if (ytSub?.syncedLyrics) {
                source = 'yt-subs';
                text = ytSub.syncedLyrics;
              } else if (lrc?.syncedLyrics) {
                // Dự phòng: nếu YouTube CC không có, chấp nhận bản synced từ LRCLIB
                source = 'lrclib-synced';
                text = lrc.syncedLyrics;
              } else if (lrc?.plainLyrics) {
                source = 'lrclib-plain';
                text = lrc.plainLyrics;
              } else if (ytSub?.plainLyrics) {
                source = 'yt-subs';
                text = ytSub.plainLyrics;
              }
            }
          } catch {
            // Bỏ qua lỗi tra cứu lời
          }
          lyricsResults.set(entry.id, { source, text });
        })
      );
    }

    for (const entry of entriesToProcess) {
      const matched = existingMap.get(entry.id) || existingMap.get(entry.url);
      const isAlreadyDownloaded = Boolean(matched);
      const fileMissing = matched ? (matched.fileExists === false) : false;
      const lrcInfo = lyricsResults.get(entry.id);

      allItems.push({
        id: entry.id,
        url: entry.url,
        rawTitle: entry.originalTitle,
        cleanTitle: entry.cleaned.title,
        artist: entry.cleaned.artist,
        album: entry.cleaned.album || 'Singles',
        year: entry.year,
        duration: entry.duration,
        thumbnailUrl: entry.thumbnailUrl,
        channelUrl: entry.channelUrl,
        metadataConfidence: entry.cleaned.confidence,
        metadataConfidenceReason: entry.cleaned.confidenceReason,
        metadataSource: entry.cleaned.source,
        isAlreadyDownloaded,
        fileMissing,
        lyricsSource: lrcInfo?.source || 'none',
        customLyrics: lrcInfo?.text || undefined,
        hasCover: Boolean(entry.thumbnailUrl),
        isUnavailable: entry.isUnavailable,
        unavailableReason: entry.unavailableReason,
        fileSizeBytes: matched?.fileSizeBytes,
      });
    }

    // Đánh dấu các video trùng lặp bài hát trong playlist (cùng Artist + Title)
    const songKeyMap = new Map<string, number>();
    allItems.forEach((item, idx) => {
      if (item.isUnavailable) return;
      const key = `${normalizeText(item.artist || '').toLowerCase()}|${normalizeText(item.cleanTitle || '').toLowerCase()}`;
      if (!key || key === '|') return;

      const firstIdx = songKeyMap.get(key);
      if (firstIdx !== undefined) {
        item.isDuplicateSong = true;
        item.duplicateOfIndex = firstIdx;
        item.duplicateReason = `Video này có cùng tên bài và ca sĩ với video ở vị trí #${firstIdx}. Khi tải về, Beatify sẽ gom thành 1 file chất lượng cao nhất để tránh trùng rác thư viện và tiết kiệm dung lượng iPhone & R2 (bản tải sau sẽ là bản lưu lại).`;
      } else {
        songKeyMap.set(key, idx + 1);
      }
    });

    return {
      isPlaylist,
      playlistTitle,
      totalCount: allItems.length,
      items: allItems,
    };
  }

  // 4. Khởi tạo Job tải nhạc
  async createJob(payload: YoutubeMusicJobPayload): Promise<string> {
    const jobId = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    this.activeJobs.set(jobId, { stopRequested: false });

    // Chạy bất đồng bộ trong background
    this.executeJob(jobId, payload).catch((err) => {
      console.error(`Lỗi thực thi job ${jobId}:`, err);
    });

    return jobId;
  }

  stopJob(jobId: string): void {
    const job = this.activeJobs.get(jobId);
    if (job) {
      job.stopRequested = true;
      this.emitEvent(jobId, {
        jobId,
        status: 'stopped',
        progress: { current: 0, total: 0, percentage: 0, message: 'Đã dừng tiến trình' },
      });
    }
  }

  private emitEvent(jobId: string, event: JobEvent): void {
    this.emit(`job:${jobId}`, event);
  }

  private async executeJob(jobId: string, payload: YoutubeMusicJobPayload): Promise<void> {
    const {
      urls,
      libraryRootPath,
      preferredFormat = 'm4a',
      fetchLyrics = true,
      concurrency = 2,
      customFolderMap = {},
      itemOverrides = {},
    } = payload;

    const localConfig = loadLocalConfig();
    const coversDir = path.resolve(
      process.cwd().endsWith('indexer') ? process.cwd() : path.join(process.cwd(), 'tools/indexer'),
      'custom_covers'
    );
    const lyricsDir = path.resolve(
      process.cwd().endsWith('indexer') ? process.cwd() : path.join(process.cwd(), 'tools/indexer'),
      'lyrics'
    );

    const total = urls.length;
    let completed = 0;
    let failed = 0;

    // Lấy danh sách bài đã tải thành công trước đó để tránh tải lại (Resume thông minh)
    const existingDownloads = await this.getDownloads(5000);
    const completedExistingMap = new Map<string, YoutubeMusicDownloadRecord>();
    for (const d of existingDownloads) {
      if (d.status === 'completed' && d.fileExists !== false && d.relativeFilePath) {
        if (d.sourceUrl) completedExistingMap.set(d.sourceUrl, d);
        if (d.videoId) completedExistingMap.set(d.videoId, d);
      }
    }

    this.emitEvent(jobId, {
      jobId,
      status: 'running',
      progress: {
        current: 0,
        total,
        percentage: 0,
        message: `Bắt đầu tải ${total} bài hát...`,
      },
    });

    const activeJob = this.activeJobs.get(jobId);

    // Worker pool xử lý song song với concurrency cấu hình được
    let currentIndex = 0;
    const workerCount = Math.min(concurrency, total);
    const completedItemIds = new Set<string>();
    const activeItemIds = new Set<string>();
    const failedItemIds = new Set<string>();
    const failedDetails: { id?: string; url: string; title?: string; artist?: string; error: string }[] = [];

    const workers = Array.from({ length: workerCount }, async () => {
      while (currentIndex < urls.length) {
        if (activeJob?.stopRequested) break;

        const i = currentIndex++;
        const url = urls[i];
        if (!url) continue;

        const downloadId = `${jobId}_${i + 1}`;
        const override = itemOverrides[url] || itemOverrides[`item_${i}`];

        // Tìm customFolder đa chiều (theo url, override.customFolder, index hoặc ID)
        let customFolder =
          customFolderMap[url] ||
          override?.customFolder ||
          customFolderMap[`item_${i}`];

        if (!customFolder) {
          for (const [key, val] of Object.entries(customFolderMap)) {
            if (val && (url.includes(key) || key.includes(url) || (override?.id && key === override.id))) {
              customFolder = val;
              break;
            }
          }
        }

        const targetDir =
          (customFolder && customFolder.trim()) ||
          libraryRootPath ||
          localConfig.MUSIC_SOURCE_DIR ||
          'D:\\music for app';

        const now = new Date().toISOString();
        const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
        const realVideoId = (ytMatch && ytMatch[1]) ? ytMatch[1] : `video_${i + 1}`;

        const record: YoutubeMusicDownloadRecord = {
          id: downloadId,
          jobId,
          videoId: realVideoId,
          sourceUrl: url,
          title: override?.cleanTitle || 'Đang tải...',
          artist: override?.artist || 'Unknown',
          album: override?.album || 'Singles',
          format: preferredFormat || 'm4a',
          libraryRootPath: targetDir,
          durationMismatchWarning: false,
          status: 'running',
          createdAt: now,
          updatedAt: now,
        };

        // Kiểm tra xem bài hát đã tải thành công trước đó hay chưa (hỗ trợ tiếp tục tải / Resume không tốn công tải lại)
        const existingCompleted = completedExistingMap.get(url) || completedExistingMap.get(realVideoId);
        if (existingCompleted && existingCompleted.relativeFilePath) {
          const absPath = path.resolve(existingCompleted.libraryRootPath || targetDir, existingCompleted.relativeFilePath);
          if (existsSync(absPath)) {
            completed++;
            completedItemIds.add(url);
            if (override?.id) completedItemIds.add(override.id);
            record.status = 'completed';
            record.title = existingCompleted.title;
            record.artist = existingCompleted.artist;
            record.album = existingCompleted.album;
            record.relativeFilePath = existingCompleted.relativeFilePath;
            record.relativeCoverPath = existingCompleted.relativeCoverPath;
            record.relativeLyricsPath = existingCompleted.relativeLyricsPath;
            record.duration = existingCompleted.duration;
            record.lyricsExists = existingCompleted.lyricsExists;
            record.coverExists = existingCompleted.coverExists;
            record.lyricsSource = existingCompleted.lyricsSource;
            record.fileSizeBytes = existingCompleted.fileSizeBytes;
            record.fileExists = true;
            await this.addOrUpdateDownload(record).catch(() => {});
            continue;
          }
        }

        activeItemIds.add(url);
        if (override?.id) activeItemIds.add(override.id);
        await this.addOrUpdateDownload(record).catch(() => {});

        try {
          this.emitEvent(jobId, {
            jobId,
            status: 'running',
            progress: {
              current: completed,
              total,
              percentage: Math.round((completed / total) * 100),
              message: `Đang tải (${i + 1}/${total}): ${override?.cleanTitle || url}`,
            },
            completedItemIds: Array.from(completedItemIds),
            activeItemIds: Array.from(activeItemIds),
          });

          // Tải bài hát bằng YoutubeService
          const res = await YoutubeService.downloadAndProcess({
            url,
            targetDir,
            coversDir,
            lyricsDir: fetchLyrics ? lyricsDir : '',
            format: preferredFormat as 'm4a' | 'mp3' | 'flac',
            title: override?.cleanTitle,
            artist: override?.artist,
            album: override?.album,
            year: override?.year,
            duration: override?.duration,
            thumbnailUrl: override?.thumbnailUrl,
            channelUrl: override?.channelUrl,
            lyricsText: fetchLyrics ? override?.customLyrics : undefined,
            onProgress: (pct, stage) => {
              const currentTrackPart = (pct / 100) * (100 / total);
              const overallPct = Math.min(99, Math.round((completed / total) * 100 + currentTrackPart));
              this.emitEvent(jobId, {
                jobId,
                status: 'running',
                progress: {
                  current: completed,
                  total,
                  percentage: overallPct,
                  message: `${stage} (${i + 1}/${total})`,
                },
                completedItemIds: Array.from(completedItemIds),
                activeItemIds: Array.from(activeItemIds),
              });
            },
          });

          const relFilePath = path.relative(targetDir, res.filePath);
          const ext = path.extname(res.filePath);
          const baseNoExt = res.filePath.slice(0, -ext.length);
          const relCover = res.hasCover ? path.relative(targetDir, `${baseNoExt}.jpg`) : null;
          const relLyrics = res.hasLyrics ? path.relative(targetDir, `${baseNoExt}.lrc`) : null;

          record.status = 'completed';
          record.title = res.title;
          record.artist = res.artist;
          record.album = res.album;
          record.year = res.year;
          record.duration = res.duration;
          record.relativeFilePath = relFilePath;
          record.relativeCoverPath = relCover;
          record.relativeLyricsPath = relLyrics;
          record.lyricsExists = res.hasLyrics;
          record.coverExists = res.hasCover;
          record.lyricsSource = res.hasLyrics ? 'lrclib-synced' : 'none';
          record.loudnessLufs = res.loudnessLufs;
          record.replayGain = res.replayGain;

          completed++;
          completedItemIds.add(url);
          if (override?.id) completedItemIds.add(override.id);
          activeItemIds.delete(url);
          if (override?.id) activeItemIds.delete(override.id);

          await this.addOrUpdateDownload(record).catch(() => {});
        } catch (err: unknown) {
          failed++;
          activeItemIds.delete(url);
          if (override?.id) activeItemIds.delete(override.id);
          failedItemIds.add(url);
          if (override?.id) failedItemIds.add(override.id);
          const errStr = err instanceof Error ? err.message : String(err);
          failedDetails.push({
            id: override?.id,
            url,
            title: override?.cleanTitle || record.title || undefined,
            artist: override?.artist || record.artist || undefined,
            error: errStr,
          });
          record.status = 'failed';
          record.errorMessage = errStr;
          await this.addOrUpdateDownload(record).catch(() => {});
        }
      }
    });

    try {
      await Promise.all(workers);
    } catch (err) {
      console.warn('[YoutubeJobRunner] Lỗi trong luồng workers:', err);
    } finally {
      const isStopped = activeJob?.stopRequested;
      const finalStatus: JobStatus = isStopped ? 'stopped' : failed === total ? 'failed' : 'completed';

      this.emitEvent(jobId, {
        jobId,
        status: finalStatus,
        progress: {
          current: completed + failed,
          total,
          percentage: 100,
          message: isStopped
            ? 'Tiến trình đã dừng lại'
            : `Hoàn tất tải ${completed}/${total} bài hát${failed > 0 ? ` (${failed} bài lỗi)` : ''}`,
        },
        completedItemIds: Array.from(completedItemIds),
        activeItemIds: [],
        failedItemIds: Array.from(failedItemIds),
        failedDetails,
      });

      this.activeJobs.delete(jobId);
    }
  }

  // 5. Lyrics & File Actions
  async getDownloadLyrics(id: string): Promise<{ lyrics: string; source: string; hasSynced: boolean }> {
    const list = await this.getDownloads();
    let item = list.find((r) => r.id === id);
    if (!item) {
      item = list.find((r) => r.trackId === id || r.videoId === id);
    }
    if (!item) {
      throw new Error('Không tìm thấy thông tin bài hát');
    }

    let lrcPath: string | null = null;
    const candidates: string[] = [];

    // Danh sách các thư mục gốc có thể chứa file
    const rootDirs: string[] = [];
    if (item.libraryRootPath) rootDirs.push(item.libraryRootPath);
    try {
      const cfg = loadLocalConfig();
      if (cfg.MUSIC_SOURCE_DIR && !rootDirs.includes(cfg.MUSIC_SOURCE_DIR)) {
        rootDirs.push(cfg.MUSIC_SOURCE_DIR);
      }
      if (cfg.MUSIC_IMPORT_DIR && !rootDirs.includes(cfg.MUSIC_IMPORT_DIR)) {
        rootDirs.push(cfg.MUSIC_IMPORT_DIR);
      }
    } catch {
      // bỏ qua
    }

    // Thử ghép các rootDirs với relativeLyricsPath & relativeFilePath
    for (const rDir of rootDirs) {
      if (item.relativeLyricsPath) {
        candidates.push(path.resolve(rDir, item.relativeLyricsPath));
      }
      if (item.relativeFilePath) {
        const audioFullPath = path.resolve(rDir, item.relativeFilePath);
        candidates.push(audioFullPath.replace(path.extname(audioFullPath), '.lrc'));
      }
    }

    // Thư mục custom lyrics của indexer
    if (item.trackId) {
      const customPath = path.resolve(
        process.cwd().endsWith('indexer') ? process.cwd() : path.join(process.cwd(), 'tools/indexer'),
        'lyrics',
        `${item.trackId}.lrc`
      );
      candidates.push(customPath);
    }

    for (const c of candidates) {
      if (existsSync(c)) {
        lrcPath = c;
        break;
      }
    }

    if (lrcPath && existsSync(lrcPath)) {
      const text = await fs.readFile(lrcPath, 'utf-8');
      const hasSynced = /\[\d{2}:\d{2}/.test(text);
      return { lyrics: text, source: 'lrc-file', hasSynced };
    }

    // Nếu chưa có file .lrc trên đĩa, tự động thử tìm kiếm nhanh từ LRCLIB
    if (item.title && item.artist) {
      try {
        const lrclibRes = await LyricsService.fetchLyrics(item.title, item.artist, item.duration || undefined);
        const lrcContent = lrclibRes.syncedLyrics || lrclibRes.plainLyrics || '';
        if (lrcContent) {
          const hasSynced = /\[\d{2}:\d{2}/.test(lrcContent);
          return { lyrics: lrcContent, source: lrclibRes.source, hasSynced };
        }
      } catch {
        // bỏ qua
      }
    }

    return { lyrics: '', source: 'none', hasSynced: false };
  }

  async updateDownloadLyrics(id: string, lyrics: string): Promise<{ success: boolean; relativeLyricsPath?: string }> {
    const list = await this.getDownloads();
    let item = list.find((r) => r.id === id);
    if (!item) {
      item = list.find((r) => r.trackId === id || r.videoId === id);
    }
    if (!item || !item.relativeFilePath) {
      throw new Error('Không tìm thấy thông tin bài hát');
    }

    let lrcPath: string | null = null;
    let baseDir = item.libraryRootPath || '';
    if (!baseDir || !existsSync(baseDir)) {
      try {
        const cfg = loadLocalConfig();
        if (cfg.MUSIC_SOURCE_DIR && existsSync(cfg.MUSIC_SOURCE_DIR)) {
          baseDir = cfg.MUSIC_SOURCE_DIR;
        }
      } catch {
        // bỏ qua
      }
    }

    if (item.relativeLyricsPath && baseDir) {
      lrcPath = path.resolve(baseDir, item.relativeLyricsPath);
    } else if (item.relativeFilePath && baseDir) {
      const audioFullPath = path.resolve(baseDir, item.relativeFilePath);
      lrcPath = audioFullPath.replace(path.extname(audioFullPath), '.lrc');
    }

    if (!lrcPath) {
      throw new Error('Không xác định được đường dẫn file .lrc');
    }

    const parentDir = path.dirname(lrcPath);
    if (!existsSync(parentDir)) {
      await fs.mkdir(parentDir, { recursive: true });
    }

    await fs.writeFile(lrcPath, lyrics, 'utf-8');

    // Lưu đồng thời vào thư mục custom lyrics của indexer để đồng bộ
    if (item.trackId) {
      const customDir = path.resolve(
        process.cwd().endsWith('indexer') ? process.cwd() : path.join(process.cwd(), 'tools/indexer'),
        'lyrics'
      );
      if (!existsSync(customDir)) {
        await fs.mkdir(customDir, { recursive: true });
      }
      await fs.writeFile(path.join(customDir, `${item.trackId}.lrc`), lyrics, 'utf-8');
    }

    // Cập nhật trạng thái trong youtube_downloads.json
    const relativeLyrics = path.relative(baseDir, lrcPath);
    item.relativeLyricsPath = relativeLyrics;
    item.lyricsExists = true;
    item.lyricsSource = /\[\d{2}:\d{2}/.test(lyrics) ? 'lrclib-synced' : 'lrclib-plain';
    item.updatedAt = new Date().toISOString();
    await this.saveDownloads(list);

    return { success: true, relativeLyricsPath: relativeLyrics };
  }

  async verifyDownloads(r2UploadedKeys?: Set<string>): Promise<YoutubeMusicDownloadRecord[]> {
    const list = await this.getDownloads(1000);
    const updated = await Promise.all(
      list.map(async (record) => {
        let fileExists = false;
        let fileSizeBytes: number | undefined;
        let fileModifiedAt: string | undefined;

        if (record.relativeFilePath) {
          const fullAudioPath = path.resolve(record.libraryRootPath, record.relativeFilePath);
          if (existsSync(fullAudioPath)) {
            fileExists = true;
            try {
              const st = await fs.stat(fullAudioPath);
              fileSizeBytes = st.size;
              fileModifiedAt = st.mtime.toISOString();
            } catch {
              // bỏ qua lỗi stat
            }
          }
        }

        let lyricsExists = false;
        if (record.relativeLyricsPath) {
          const fullLyricsPath = path.resolve(record.libraryRootPath, record.relativeLyricsPath);
          lyricsExists = existsSync(fullLyricsPath);
        } else if (record.relativeFilePath) {
          const altLrc = path.resolve(
            record.libraryRootPath,
            record.relativeFilePath.replace(path.extname(record.relativeFilePath), '.lrc')
          );
          lyricsExists = existsSync(altLrc);
        }

        let coverExists = false;
        if (record.relativeCoverPath) {
          const fullCoverPath = path.resolve(record.libraryRootPath, record.relativeCoverPath);
          coverExists = existsSync(fullCoverPath);
        } else if (record.relativeFilePath) {
          const altCover = path.resolve(
            record.libraryRootPath,
            record.relativeFilePath.replace(path.extname(record.relativeFilePath), '.jpg')
          );
          coverExists = existsSync(altCover);
        }

        const effectiveLyricsSource: YoutubeMusicDownloadRecord['lyricsSource'] =
          record.lyricsSource && record.lyricsSource !== 'none'
            ? record.lyricsSource
            : lyricsExists
            ? 'lrclib-synced'
            : 'none';

        // Tính toán hoặc lấy trackId (SHA-1 12 ký tự của file âm thanh)
        let trackId = record.trackId;
        if (!trackId && fileExists && record.relativeFilePath) {
          const fullAudioPath = path.resolve(record.libraryRootPath, record.relativeFilePath);
          try {
            trackId = await calculateTrackId(fullAudioPath);
          } catch {
            // bỏ qua
          }
        }

        // Kiểm tra xem bài này đã upload lên R2 chưa (đối chiếu key music/<trackId>.<ext>)
        let uploadedToR2 = record.uploadedToR2 ?? false;
        if (r2UploadedKeys && record.relativeFilePath) {
          const ext = path.extname(record.relativeFilePath).toLowerCase();
          const r2Key = trackId ? `music/${trackId}${ext}` : null;
          const baseName = path.basename(record.relativeFilePath).toLowerCase();

          if (r2Key && r2UploadedKeys.has(r2Key)) {
            uploadedToR2 = true;
          } else if (
            r2UploadedKeys.has(record.relativeFilePath) ||
            Array.from(r2UploadedKeys).some((k) => k.toLowerCase().endsWith(baseName))
          ) {
            uploadedToR2 = true;
          } else if (record.uploadedToR2 && !r2Key) {
            uploadedToR2 = true;
          } else {
            uploadedToR2 = false;
          }
        }

        return {
          ...record,
          trackId,
          fileExists,
          fileSizeBytes,
          fileModifiedAt,
          lyricsExists,
          coverExists,
          lyricsSource: effectiveLyricsSource,
          uploadedToR2,
          updatedAt: new Date().toISOString(),
        };
      })
    );

    await this.saveDownloads(updated);
    return updated;
  }

  /**
   * Đồng bộ trạng thái "Đã lên Cloud" theo danh sách trackId đã upload lên R2 (dùng khi chạy pnpm indexer sync)
   */
  async syncUploadedTrackIds(trackIds: Set<string>): Promise<number> {
    const list = await this.getDownloads(2000);
    let changed = false;
    let count = 0;

    for (const item of list) {
      let tid = item.trackId;
      if (!tid && item.relativeFilePath && item.libraryRootPath) {
        const cleanRelative = item.relativeFilePath.replace(/^[/\\]+/, '');
        const fullAudioPath = path.resolve(item.libraryRootPath, cleanRelative);
        if (existsSync(fullAudioPath)) {
          try {
            tid = await calculateTrackId(fullAudioPath);
            item.trackId = tid;
            changed = true;
          } catch {
            // bỏ qua lỗi băm SHA-1
          }
        }
      }

      if (tid && trackIds.has(tid)) {
        if (!item.uploadedToR2) {
          item.uploadedToR2 = true;
          item.updatedAt = new Date().toISOString();
          changed = true;
          count++;
        }
      }
    }

    if (changed) {
      await this.saveDownloads(list);
    }
    return count;
  }

  /**
   * Tự động kiểm tra và đồng bộ trạng thái R2 cho các bài tải về dựa trên danh sách key thực tế trên R2
   */
  async syncWithR2Keys(r2UploadedKeys: Set<string>): Promise<number> {
    if (!r2UploadedKeys || r2UploadedKeys.size === 0) return 0;
    const list = await this.getDownloads(2000);
    let changed = false;
    let count = 0;

    for (const item of list) {
      let tid = item.trackId;
      const cleanRelative = item.relativeFilePath ? item.relativeFilePath.replace(/^[/\\]+/, '') : '';
      const fullAudioPath = cleanRelative && item.libraryRootPath
        ? path.resolve(item.libraryRootPath, cleanRelative)
        : null;

      if (!tid && fullAudioPath && existsSync(fullAudioPath)) {
        try {
          tid = await calculateTrackId(fullAudioPath);
          item.trackId = tid;
          changed = true;
        } catch {
          // bỏ qua lỗi băm SHA-1
        }
      }

      if (item.relativeFilePath) {
        const ext = path.extname(item.relativeFilePath).toLowerCase();
        const r2Key = tid ? `music/${tid}${ext}` : null;
        const baseName = path.basename(item.relativeFilePath).toLowerCase();

        let isUploaded = false;
        if (r2Key && r2UploadedKeys.has(r2Key)) {
          isUploaded = true;
        } else if (
          r2UploadedKeys.has(item.relativeFilePath) ||
          Array.from(r2UploadedKeys).some((k) => k.toLowerCase().endsWith(baseName))
        ) {
          isUploaded = true;
        }

        if (isUploaded && !item.uploadedToR2) {
          item.uploadedToR2 = true;
          item.updatedAt = new Date().toISOString();
          changed = true;
          count++;
        }
      }
    }

    if (changed) {
      await this.saveDownloads(list);
    }
    return count;
  }

  async getDownloadAudioPath(id: string): Promise<string | null> {
    const list = await this.getDownloads(1000);
    const item = list.find((r) => r.id === id);
    if (!item) return null;
    if (item.relativeFilePath && item.libraryRootPath) {
      const cleanRelative = item.relativeFilePath.replace(/^[/\\]+/, '');
      const fullAudioPath = path.resolve(item.libraryRootPath, cleanRelative);
      if (existsSync(fullAudioPath)) return fullAudioPath;
      const parent = path.dirname(fullAudioPath);
      if (existsSync(parent)) return parent;
    }
    if (item.libraryRootPath && existsSync(item.libraryRootPath)) {
      return item.libraryRootPath;
    }
    return null;
  }

  openFolderInExplorer(targetPath: string): boolean {
    if (!targetPath) return false;
    const normalized = path.normalize(path.resolve(targetPath));
    const targetExists = existsSync(normalized);
    let pathToOpen = normalized;
    let isFile: boolean;

    if (targetExists) {
      try {
        isFile = statSync(normalized).isFile();
      } catch {
        isFile = path.extname(normalized).length > 0;
      }
    } else {
      const parentDir = path.dirname(normalized);
      if (existsSync(parentDir)) {
        pathToOpen = parentDir;
        isFile = false;
      } else {
        return false;
      }
    }

    if (process.platform === 'win32') {
      if (isFile) {
        exec(`explorer.exe /select,"${pathToOpen}"`);
      } else {
        exec(`explorer.exe "${pathToOpen}"`);
      }
      return true;
    } else {
      const child = spawn('xdg-open', [pathToOpen], { detached: true, stdio: 'ignore' });
      child.unref();
      return true;
    }
  }

  // 10. Tìm lại tệp khi đổi thư mục lưu trữ (Smart Relocate / Re-link)
  async relocateDownloads(req: RelocateDownloadsRequest): Promise<{
    relocatedCount: number;
    matchedRecords: YoutubeMusicDownloadRecord[];
  }> {
    const list = await this.getDownloads(1000);
    let relocatedCount = 0;
    const matchedRecords: YoutubeMusicDownloadRecord[] = [];

    if (req.mode === 'auto-scan') {
      const local = loadLocalConfig();
      const targetDir = req.targetDir || local.MUSIC_SOURCE_DIR || local.MUSIC_IMPORT_DIR || 'D:\\music for app';
      if (!existsSync(targetDir)) {
        throw new Error(`Thư mục đích không tồn tại: ${targetDir}`);
      }

      const allFiles = await findAudioFiles(targetDir);
      // Map tên file viết thường -> đường dẫn đầy đủ
      const fileMap = new Map<string, string>();
      for (const f of allFiles) {
        fileMap.set(path.basename(f).toLowerCase(), f);
      }

      for (const record of list) {
        const currentFull = record.relativeFilePath
          ? path.resolve(record.libraryRootPath, record.relativeFilePath)
          : null;
        const isMissing = !currentFull || !existsSync(currentFull);

        if (isMissing && record.relativeFilePath) {
          const baseName = path.basename(record.relativeFilePath).toLowerCase();
          const found = fileMap.get(baseName);
          if (found) {
            record.libraryRootPath = targetDir;
            record.relativeFilePath = path.relative(targetDir, found).replace(/\\/g, '/');
            record.fileExists = true;
            try {
              const st = await fs.stat(found);
              record.fileSizeBytes = st.size;
              record.fileModifiedAt = st.mtime.toISOString();
            } catch {
              // bỏ qua
            }

            // Kiểm tra file lyrics đi kèm tại thư mục mới
            const lrcCandidate = found.replace(path.extname(found), '.lrc');
            if (existsSync(lrcCandidate)) {
              record.relativeLyricsPath = path.relative(targetDir, lrcCandidate).replace(/\\/g, '/');
              record.lyricsExists = true;
            }

            relocatedCount++;
            matchedRecords.push(record);
          }
        }
      }
    } else if (req.mode === 'replace-prefix' && req.oldPrefix && req.newPrefix) {
      const oldNorm = req.oldPrefix.replace(/\\/g, '/').toLowerCase();
      const newNorm = req.newPrefix.replace(/\\/g, '/');

      for (const record of list) {
        const currentNorm = record.libraryRootPath.replace(/\\/g, '/');
        if (currentNorm.toLowerCase().startsWith(oldNorm)) {
          const escaped = oldNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const updatedRoot = currentNorm.replace(new RegExp(`^${escaped}`, 'i'), newNorm);
          record.libraryRootPath = updatedRoot;
          const testPath = record.relativeFilePath
            ? path.resolve(updatedRoot, record.relativeFilePath)
            : null;
          record.fileExists = testPath ? existsSync(testPath) : false;
          if (record.fileExists) {
            relocatedCount++;
            matchedRecords.push(record);
          }
        }
      }
    } else if (req.mode === 'single-file' && req.id && req.newFullPath) {
      const record = list.find((r) => r.id === req.id);
      if (record && existsSync(req.newFullPath)) {
        const dir = path.dirname(req.newFullPath);
        const base = path.basename(req.newFullPath);
        record.libraryRootPath = dir;
        record.relativeFilePath = base;
        record.fileExists = true;
        try {
          const st = await fs.stat(req.newFullPath);
          record.fileSizeBytes = st.size;
          record.fileModifiedAt = st.mtime.toISOString();
        } catch {
          // bỏ qua
        }
        relocatedCount++;
        matchedRecords.push(record);
      }
    }

    await this.saveDownloads(list);
    return { relocatedCount, matchedRecords };
  }

  // 11. Tải bài hát đã tải lên Cloudflare R2 và cập nhật library.json
  async uploadDownloadToR2(id: string): Promise<YoutubeMusicDownloadRecord> {
    const list = await this.getDownloads(1000);
    const item = list.find((r) => r.id === id);
    if (!item || !item.relativeFilePath) {
      throw new Error('Không tìm thấy thông tin bài hát đã tải');
    }

    let audioPath = path.resolve(item.libraryRootPath, item.relativeFilePath);
    if (!existsSync(audioPath)) {
      throw new Error(`Tệp âm thanh không tồn tại trên ổ cứng: ${audioPath}`);
    }

    const config = loadConfig();
    if (!config) {
      throw new Error('Chưa cấu hình Cloudflare R2 trong file .env');
    }

    // Nếu tệp nằm ngoài MUSIC_SOURCE_DIR, bảo toàn cấu trúc phân cấp Nghệ sĩ / Album khi đưa vào nguồn chính
    const sourceDir = path.resolve(config.MUSIC_SOURCE_DIR);
    await fs.mkdir(sourceDir, { recursive: true });
    if (!path.resolve(audioPath).startsWith(sourceDir)) {
      const targetFileName = path.basename(audioPath);
      const artistFolder = PathSanitizer.sanitizeSegment(item.artist || 'Unknown Artist');
      const albumFolder = PathSanitizer.sanitizeSegment(item.album || 'Singles');
      const targetSubDir = path.join(sourceDir, artistFolder, albumFolder);
      await fs.mkdir(targetSubDir, { recursive: true });
      const destPath = path.join(targetSubDir, targetFileName);
      await fs.copyFile(audioPath, destPath);

      // Copy luôn file lyrics .lrc nếu có
      const srcLrc = audioPath.replace(path.extname(audioPath), '.lrc');
      if (existsSync(srcLrc)) {
        await fs.copyFile(srcLrc, path.join(targetSubDir, targetFileName.replace(path.extname(targetFileName), '.lrc'))).catch(() => {});
      }

      // Copy luôn file cover .jpg nếu có
      const srcCover = audioPath.replace(path.extname(audioPath), '.jpg');
      if (existsSync(srcCover)) {
        await fs.copyFile(srcCover, path.join(targetSubDir, targetFileName.replace(path.extname(targetFileName), '.jpg'))).catch(() => {});
      }

      audioPath = destPath;
      item.libraryRootPath = sourceDir;
      item.relativeFilePath = path.relative(sourceDir, destPath);
      item.relativeLyricsPath = path.relative(sourceDir, destPath.replace(path.extname(destPath), '.lrc'));
    }

    const scanned = await scanAudioFile(audioPath);
    if (!scanned) {
      throw new Error('Không thể phân tích metadata tệp âm thanh');
    }

    const uploader = new R2Uploader(config);
    // 1. Tải audio lên R2: music/<filename>
    await uploader.uploadAudio(scanned.track.file, audioPath);

    // 2. Tải ảnh bìa lên R2: covers/<albumId>.jpg nếu có
    if (scanned.coverBuffer && scanned.track.albumId) {
      await uploader.uploadCover(scanned.track.albumId, scanned.coverBuffer);
    }

    // 3. Tải lyrics lên R2: lyrics/<trackId>.lrc nếu có
    const sidecarLrc = audioPath.replace(path.extname(audioPath), '.lrc');
    if (existsSync(sidecarLrc)) {
      const lrcContent = await fs.readFile(sidecarLrc, 'utf-8');
      if (scanned.track.lyrics?.file) {
        await uploader.uploadLyrics(scanned.track.lyrics.file, lrcContent);
      }
    }

    // 4. Quét lại toàn bộ thư mục và cập nhật library.json trên Cloudflare R2
    try {
      const allFiles = await findAudioFiles(sourceDir);
      const rawTracks: ScannedTrack[] = [];
      for (const f of allFiles) {
        const t = await scanAudioFile(f);
        if (t) rawTracks.push(t);
      }
      const overrides = await getOverrides();
      const activeTracks = applyOverridesToScanned(rawTracks, overrides);
      const { library } = buildLibrary(activeTracks);
      await uploader.uploadLibrary(library);
    } catch (libErr) {
      console.warn('Lỗi cập nhật library.json:', libErr);
    }

    item.uploadedToR2 = true;
    item.trackId = scanned.track.id;
    item.fileExists = true;
    item.updatedAt = new Date().toISOString();
    await this.saveDownloads(list);
    return item;
  }

  // 12. Xóa bài hát đồng bộ (trên đĩa và trên Cloudflare R2)
  async deleteDownloadSync(id: string, options: DeleteDownloadOptions): Promise<boolean> {
    const list = await this.getDownloads(1000);
    const item = list.find((r) => r.id === id);
    if (!item) return false;

    const audioPath = item.relativeFilePath
      ? path.resolve(item.libraryRootPath, item.relativeFilePath)
      : null;
    const lrcPath = item.relativeLyricsPath
      ? path.resolve(item.libraryRootPath, item.relativeLyricsPath)
      : audioPath
      ? audioPath.replace(path.extname(audioPath), '.lrc')
      : null;

    let resolvedTrackId = item.trackId;
    if (!resolvedTrackId && audioPath && existsSync(audioPath)) {
      try {
        resolvedTrackId = await calculateTrackId(audioPath);
      } catch {
        // bỏ qua
      }
    }

    // 1. Xóa trên Cloudflare R2 nếu được yêu cầu
    if (options.deleteR2) {
      const config = loadConfig();
      if (config) {
        const s3 = new S3Client({
          region: 'auto',
          endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: config.R2_ACCESS_KEY_ID,
            secretAccessKey: config.R2_SECRET_ACCESS_KEY,
          },
        });

        // 1.1 Xóa file âm thanh trên R2 (khớp trackId hoặc tên tệp)
        try {
          const res = await s3.send(new ListObjectsV2Command({ Bucket: config.R2_BUCKET, Prefix: 'music/' }));
          if (res.Contents) {
            const baseName = item.relativeFilePath ? path.basename(item.relativeFilePath).toLowerCase() : null;
            for (const obj of res.Contents) {
              if (!obj.Key) continue;
              const keyLower = obj.Key.toLowerCase();
              let matched = false;
              if (resolvedTrackId && keyLower.includes(resolvedTrackId.toLowerCase())) {
                matched = true;
              }
              if (baseName && keyLower.endsWith(`/${baseName}`)) {
                matched = true;
              }
              if (matched) {
                await s3.send(new DeleteObjectCommand({ Bucket: config.R2_BUCKET, Key: obj.Key })).catch(() => {});
              }
            }
          }
        } catch (e) {
          console.warn('Lỗi quét đối tượng music/ trên R2 khi xóa:', e);
        }

        // 1.2 Xóa file lyrics trên R2 nếu có
        if (resolvedTrackId) {
          await s3.send(new DeleteObjectCommand({ Bucket: config.R2_BUCKET, Key: `lyrics/${resolvedTrackId}.lrc` })).catch(() => {});
        }
        if (item.relativeFilePath) {
          const lrcBaseName = path.basename(item.relativeFilePath).replace(path.extname(item.relativeFilePath), '.lrc');
          await s3.send(new DeleteObjectCommand({ Bucket: config.R2_BUCKET, Key: `lyrics/${lrcBaseName}` })).catch(() => {});
        }

        // 1.3 Cập nhật lại library.json trên Cloudflare R2 để app iPhone đồng bộ ngay lập tức
        try {
          const local = loadLocalConfig();
          const sourceDir = path.resolve(local.MUSIC_SOURCE_DIR);
          if (existsSync(sourceDir)) {
            const allFiles = await findAudioFiles(sourceDir);
            const rawTracks: ScannedTrack[] = [];
            for (const f of allFiles) {
              // Bỏ qua chính file đang bị xóa nếu nó vẫn còn trên đĩa
              if (audioPath && path.resolve(f).toLowerCase() === path.resolve(audioPath).toLowerCase()) {
                continue;
              }
              const t = await scanAudioFile(f);
              if (t) rawTracks.push(t);
            }
            const overrides = await getOverrides();
            const activeTracks = applyOverridesToScanned(rawTracks, overrides);
            const { library } = buildLibrary(activeTracks);
            const uploader = new R2Uploader(config);
            await uploader.uploadLibrary(library);

            // 1.4 Dọn dẹp ảnh bìa album mồ côi trên R2 nếu không còn bài hát nào dùng
            const activeAlbumIds = new Set<string>();
            for (const t of activeTracks) {
              if (t.track.albumId) activeAlbumIds.add(t.track.albumId);
            }
            if (item.artist) {
              const albumName = item.album || 'Singles';
              const albumKey = `${normalizeText(item.artist)}|${normalizeText(albumName)}`;
              const targetAlbumId = crypto.createHash('sha1').update(albumKey).digest('hex').slice(0, 12);
              if (!activeAlbumIds.has(targetAlbumId)) {
                await s3.send(new DeleteObjectCommand({ Bucket: config.R2_BUCKET, Key: `covers/${targetAlbumId}.jpg` })).catch(() => {});
              }
            }
            if (resolvedTrackId && !activeTracks.some((t) => t.track.id === resolvedTrackId)) {
              await s3.send(new DeleteObjectCommand({ Bucket: config.R2_BUCKET, Key: `covers/${resolvedTrackId}.jpg` })).catch(() => {});
            }
          }
        } catch (libErr) {
          console.warn('Lỗi re-upload library.json lên R2 sau khi xóa:', libErr);
        }
      }
    }

    // Luôn đánh dấu purged trong overrides để scanner, library và status không bao giờ tính lại bài này
    if (resolvedTrackId) {
      try {
        await purgeFromTrash(resolvedTrackId);
      } catch {
        // bỏ qua
      }
    }

    // 2. Xóa file trên đĩa cứng máy tính nếu được yêu cầu
    if (options.deleteFiles) {
      if (audioPath && existsSync(audioPath)) {
        await fs.unlink(audioPath).catch(() => {});
        // Xóa file ảnh bìa riêng của bài hát nếu có
        const trackCover = audioPath.replace(path.extname(audioPath), '.jpg');
        if (existsSync(trackCover)) {
          await fs.unlink(trackCover).catch(() => {});
        }
      }
      if (lrcPath && existsSync(lrcPath)) {
        await fs.unlink(lrcPath).catch(() => {});
      }
      if (item.relativeCoverPath) {
        const coverPath = path.resolve(item.libraryRootPath, item.relativeCoverPath);
        if (existsSync(coverPath)) {
          await fs.unlink(coverPath).catch(() => {});
        }
      }

      // Xóa các file phụ trợ trong thư mục bài hát (info.txt, desktop.ini, folder.jpg)
      if (audioPath) {
        const trackDir = path.dirname(audioPath);
        const normRoot = path.resolve(item.libraryRootPath).toLowerCase();
        const normTrack = path.resolve(trackDir).toLowerCase();
        if (normTrack !== normRoot) {
          const extraFiles = ['info.txt', 'desktop.ini', 'folder.jpg', '.DS_Store', 'cover.jpg'];
          for (const extra of extraFiles) {
            const extraPath = path.join(trackDir, extra);
            if (existsSync(extraPath)) {
              if (process.platform === 'win32') {
                try { execFileSync('attrib', ['-h', '-s', '-r', extraPath]); } catch { /* bỏ qua lỗi gỡ thuộc tính */ }
              }
              await fs.unlink(extraPath).catch(() => {});
            }
          }

          // Dọn dẹp thư mục rỗng: Xóa thư mục chứa bài hát và các thư mục cha rỗng (không vượt quá root)
          await this.cleanEmptyDirectories(trackDir, item.libraryRootPath);
        }
      }
    }

    // 3. Xóa bản ghi khỏi danh sách
    const filtered = list.filter((r) => r.id !== id);
    await this.saveDownloads(filtered);
    return true;
  }

  // Dọn dẹp an toàn các thư mục rỗng từ startDir ngược lên đến rootDir (tuyệt đối không xóa rootDir)
  private async cleanEmptyDirectories(startDir: string, rootDir: string): Promise<void> {
    let current = path.resolve(startDir);
    const stopRoot = path.resolve(rootDir);

    while (current && current.toLowerCase() !== stopRoot.toLowerCase()) {
      if (!current.toLowerCase().startsWith(stopRoot.toLowerCase())) {
        break;
      }
      try {
        const entries = await fs.readdir(current);
        if (entries.length === 0) {
          await fs.rmdir(current);
          current = path.dirname(current);
        } else {
          // Thư mục vẫn còn chứa file hoặc thư mục con khác
          break;
        }
      } catch {
        break;
      }
    }
  }
}

export const youtubeJobRunner = new YoutubeJobRunner();

