import { z } from 'zod';

// ==========================================
// YouTube Music Downloader Types & Schemas
// ==========================================

export const YoutubeMusicFormatSchema = z.enum(['opus', 'm4a', 'mp3', 'flac']);
export type YoutubeMusicFormat = z.infer<typeof YoutubeMusicFormatSchema>;

export const YoutubeMusicDownloadStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'skipped',
  'cancelled',
  'interrupted',
]);
export type YoutubeMusicDownloadStatus = z.infer<typeof YoutubeMusicDownloadStatusSchema>;

export const YoutubeMusicMetadataSourceSchema = z.enum(['yt-music', 'regex', 'gemini']);
export type YoutubeMusicMetadataSource = z.infer<typeof YoutubeMusicMetadataSourceSchema>;

export const YoutubeMusicLyricsSourceSchema = z.enum([
  'lrclib-synced',
  'lrclib-plain',
  'yt-subs',
  'none',
]);
export type YoutubeMusicLyricsSource = z.infer<typeof YoutubeMusicLyricsSourceSchema>;

export const JobStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_quota',
  'stopped',
  'completed',
  'failed',
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobProgressSchema = z.object({
  current: z.number(),
  total: z.number(),
  percentage: z.number(),
  currentItemTitle: z.string().optional(),
  message: z.string().optional(),
});
export type JobProgress = z.infer<typeof JobProgressSchema>;

export const JobEventSchema = z.object({
  jobId: z.string(),
  status: JobStatusSchema,
  progress: JobProgressSchema,
  error: z
    .object({
      code: z.string(),
      detail: z.string().optional(),
    })
    .optional(),
  resumeAt: z.string().nullable().optional(),
});
export type JobEvent = z.infer<typeof JobEventSchema>;

export const YoutubeMusicDownloadRecordSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  videoId: z.string(),
  sourceUrl: z.string(),
  playlistId: z.string().nullable().optional(),
  playlistIndex: z.number().nullable().optional(),
  title: z.string().nullable().optional(),
  artist: z.string().nullable().optional(),
  albumArtist: z.string().nullable().optional(),
  album: z.string().nullable().optional(),
  year: z.number().nullable().optional(),
  trackNumber: z.number().nullable().optional(),
  duration: z.number().nullable().optional(),
  format: YoutubeMusicFormatSchema,
  libraryRootPath: z.string(),
  relativeFilePath: z.string().nullable().optional(),
  relativeCoverPath: z.string().nullable().optional(),
  relativeLyricsPath: z.string().nullable().optional(),
  metadataSource: YoutubeMusicMetadataSourceSchema.nullable().optional(),
  lyricsSource: YoutubeMusicLyricsSourceSchema.nullable().optional(),
  durationMismatchWarning: z.boolean().default(false),
  candidateLyrics: z.string().nullable().optional(),
  loudnessLufs: z.number().nullable().optional(),
  replayGain: z.number().nullable().optional(),
  status: YoutubeMusicDownloadStatusSchema,
  errorMessage: z.string().nullable().optional(),
  fileExists: z.boolean().optional(),
  lyricsExists: z.boolean().optional(),
  coverExists: z.boolean().optional(),
  uploadedToR2: z.boolean().optional(),
  fileSizeBytes: z.number().optional(),
  fileModifiedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type YoutubeMusicDownloadRecord = z.infer<typeof YoutubeMusicDownloadRecordSchema>;

export const YoutubeMusicJobPayloadSchema = z.object({
  urls: z.array(z.string().url()).min(1),
  libraryRootPath: z.string().min(1),
  preferredFormat: YoutubeMusicFormatSchema.default('m4a'),
  fetchLyrics: z.boolean().default(true),
  useGeminiCleaning: z.boolean().default(true),
  concurrency: z.number().int().min(1).max(4).default(2),
  maxItemsPerJob: z.number().int().min(1).max(200).default(100),
  customFolderMap: z.record(z.string(), z.string()).optional(),
  itemOverrides: z
    .record(
      z.string(),
      z.object({
        id: z.string().optional(),
        cleanTitle: z.string().optional(),
        artist: z.string().optional(),
        album: z.string().optional(),
        year: z.number().optional(),
        duration: z.number().optional(),
        customLyrics: z.string().optional(),
        customFolder: z.string().optional(),
        thumbnailUrl: z.string().optional(),
        channelUrl: z.string().optional(),
      })
    )
    .optional(),
});
export type YoutubeMusicJobPayload = z.infer<typeof YoutubeMusicJobPayloadSchema>;

export const YoutubeMusicPreviewItemSchema = z.object({
  id: z.string(),
  url: z.string(),
  rawTitle: z.string(),
  cleanTitle: z.string(),
  artist: z.string(),
  album: z.string().optional(),
  year: z.number().optional(),
  duration: z.number().optional(),
  thumbnailUrl: z.string().optional(),
  channelUrl: z.string().optional(),
  metadataConfidence: z.enum(['high', 'medium', 'low']),
  metadataConfidenceReason: z.string().optional(),
  metadataSource: YoutubeMusicMetadataSourceSchema,
  isAlreadyDownloaded: z.boolean().default(false),
  fileMissing: z.boolean().optional(),
  lyricsSource: YoutubeMusicLyricsSourceSchema.nullable().optional(),
  customLyrics: z.string().optional(),
  hasCover: z.boolean().optional(),
});
export type YoutubeMusicPreviewItem = z.infer<typeof YoutubeMusicPreviewItemSchema>;

export const YoutubeMusicPreviewResponseSchema = z.object({
  isPlaylist: z.boolean(),
  playlistTitle: z.string().optional(),
  playlistId: z.string().optional(),
  totalCount: z.number(),
  items: z.array(YoutubeMusicPreviewItemSchema),
});
export type YoutubeMusicPreviewResponse = z.infer<typeof YoutubeMusicPreviewResponseSchema>;

export const YoutubeMusicDependencyStatusSchema = z.object({
  ready: z.boolean(),
  ytdlp: z.object({
    installed: z.boolean(),
    version: z.string().nullable(),
    path: z.string().nullable(),
    canUpdate: z.boolean(),
  }),
  ffmpeg: z.object({
    installed: z.boolean(),
    version: z.string().nullable(),
    path: z.string().nullable(),
  }),
  runtime: z.object({
    type: z.enum(['deno', 'node', 'none']),
    version: z.string().nullable(),
    path: z.string().nullable().optional(),
  }),
  needsShellRestart: z.boolean().default(false),
  errors: z.array(z.string()).default([]),
});
export type YoutubeMusicDependencyStatus = z.infer<typeof YoutubeMusicDependencyStatusSchema>;

export const YoutubeMusicConfigSchema = z.object({
  libraryRootPath: z.string().default('D:\\Music'),
  preferredFormat: YoutubeMusicFormatSchema.default('m4a'),
  fetchLyrics: z.boolean().default(true),
  concurrency: z.number().int().min(1).max(4).default(2),
  customFolderHistory: z.array(z.string()).default([]),
});
export type YoutubeMusicConfig = z.infer<typeof YoutubeMusicConfigSchema>;

export const RelocateDownloadsRequestSchema = z.object({
  mode: z.enum(['auto-scan', 'replace-prefix', 'single-file']),
  targetDir: z.string().optional(),
  oldPrefix: z.string().optional(),
  newPrefix: z.string().optional(),
  id: z.string().optional(),
  newFullPath: z.string().optional(),
});
export type RelocateDownloadsRequest = z.infer<typeof RelocateDownloadsRequestSchema>;

export const DeleteDownloadOptionsSchema = z.object({
  deleteFiles: z.boolean().default(false),
  deleteR2: z.boolean().default(false),
});
export type DeleteDownloadOptions = z.infer<typeof DeleteDownloadOptionsSchema>;

