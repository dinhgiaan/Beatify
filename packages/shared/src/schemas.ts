// Schema dùng chung cho app, API và indexer (PLAN.md mục 7.2).
// Quy tắc tương thích (mục 7.4): chỉ thêm trường tuỳ chọn, không đổi nghĩa hay xoá trường đã có.
import { z } from 'zod';

import { LyricsRefSchema } from './lyrics';

export const TrackSchema = z.object({
  id: z.string(), // ổn định, xem mục 7.1
  title: z.string(),
  artist: z.string(),
  albumId: z.string().optional(),
  album: z.string().optional(),
  trackNumber: z.number().int().optional(),
  discNumber: z.number().int().optional(),
  year: z.number().int().optional(),
  genre: z.string().optional(),
  duration: z.number(), // giây
  file: z.string(), // key trong storage, vd "music/a1b2c3d4e5f6.mp3"
  storage: z.enum(['r2']).default('r2'),
  cover: z.string().optional(), // vd "covers/{albumId}.jpg"
  coverVersion: z.string().optional(), // 8 ký tự đầu của sha1 ảnh bìa để bust cache (PLAN.md mục 7.2)
  coverAspect: z.number().positive().optional(), // Tỉ lệ chiều rộng / chiều cao của ảnh bìa (w / h), vd 1.778 cho 16:9, 1.0 cho ảnh vuông
  loudnessLufs: z.number().optional(), // độ ồn tích hợp (LUFS)
  replayGain: z.number().optional(), // dB cần chỉnh (thường âm)
  lyrics: LyricsRefSchema.optional(), // Phase 4
  bpm: z.number().positive().optional(), // Nhịp/phút (BPM), vd 128.5
  key: z.string().optional(), // Mã Camelot, vd "8A", "11B"
  introEnd: z.number().nonnegative().optional(), // Giây kết thúc intro dạo đầu (vào beat/vocal)
  outroStart: z.number().nonnegative().optional(), // Giây bắt đầu outro kết bài (hạ năng lượng/fade)
});
export type Track = z.infer<typeof TrackSchema>;

export const AlbumSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  year: z.number().int().optional(),
  cover: z.string().optional(),
  coverVersion: z.string().optional(), // 8 ký tự đầu của sha1 ảnh bìa để bust cache (PLAN.md mục 7.2)
  trackIds: z.array(z.string()), // đã sắp theo số thứ tự bài
});
export type Album = z.infer<typeof AlbumSchema>;

// Toàn bộ thư viện, sinh bởi indexer.
// Lưu ý cho app (mục 7.4): phải đọc trường `version` TRƯỚC khi parse bằng schema này,
// vì version lớn hơn 1 sẽ không khớp z.literal(1) và cần hiện "Cần cập nhật app" thay vì crash.
export const LibrarySchema = z.object({
  version: z.literal(1),
  generatedAt: z.iso.datetime(),
  tracks: z.array(TrackSchema),
  albums: z.array(AlbumSchema),
});
export type Library = z.infer<typeof LibrarySchema>;

export const PlaylistSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  coverUrl: z.string().optional(), // đường dẫn ảnh bìa tùy chỉnh (file://, http://, data:)
  trackIds: z.array(z.string()), // tham chiếu Track.id
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Playlist = z.infer<typeof PlaylistSchema>;

// Dữ liệu người dùng, dùng cho lưu local, xuất/nhập và đồng bộ
export const UserStateSchema = z.object({
  version: z.literal(1),
  updatedAt: z.iso.datetime(),
  playlists: z.array(PlaylistSchema),
  favoriteIds: z.array(z.string()),
});
export type UserState = z.infer<typeof UserStateSchema>;

// Thông tin phản hồi kiểm tra sức khỏe thư viện (/api/health)
export const HealthSchema = z.object({
  status: z.literal('ok'),
  trackCount: z.number().int().nonnegative(),
  albumCount: z.number().int().nonnegative(),
  generatedAt: z.string().optional(),
  dataVersion: z.number().int().optional(),
});
export type Health = z.infer<typeof HealthSchema>;

// Cấu trúc Override không phá huỷ (PLAN.md mục 13.1 và skill local-dashboard)
export const TrackOverrideSchema = z.object({
  title: z.string().min(1).optional(),
  artist: z.string().min(1).optional(),
  album: z.string().optional(),
  year: z.number().int().optional(),
  trackNumber: z.number().int().optional(),
  loudnessLufs: z.number().optional(),
  replayGain: z.number().optional(),
  cover: z.string().optional(),
  hidden: z.boolean().optional(),
  deletedAt: z.string().optional(),
  purged: z.boolean().optional(),
  purgedAt: z.string().optional(),
  pipelineVersion: z.string().optional(),
  source: z.string().optional(),
  reviewed: z.boolean().optional(),
});
export type TrackOverride = z.infer<typeof TrackOverrideSchema>;

export const OverridesSchema = z.object({
  version: z.literal(1).default(1),
  tracks: z.record(z.string(), TrackOverrideSchema).default({}),
  artistAliases: z.record(z.string(), z.string()).optional().default({}),
});
export type Overrides = z.infer<typeof OverridesSchema>;

// Response chuẩn cho toàn bộ API JSON (trừ endpoint binary)
export interface ApiResponse<T> {
  status: number;
  message: string;
  data: T | null;
  error: string | null;
}

// Request cập nhật bài hát (dùng cho mobile và API)
export const UpdateTrackSchema = z.object({
  title: z.string().min(1).optional(),
  artist: z.string().min(1).optional(),
  album: z.string().optional(),
  year: z.number().int().optional(),
  lyrics: z.string().optional(),
  cover: z.string().optional(),
});
export type UpdateTrack = z.infer<typeof UpdateTrackSchema>;

// Schema bản ghi lịch sử nghe bài hát cho Replay & Stats
// passthrough() cho phép giữ lại các trường mở rộng trong tương lai, tránh mất dữ liệu khi app phiên bản khác đọc/ghi
export const ListeningRecordSchema = z.object({
  trackId: z.string(),
  title: z.string(),
  artist: z.string(),
  album: z.string().optional(),
  durationSec: z.number(),
  listenedSec: z.number(),
  timestamp: z.number(),
}).passthrough();



