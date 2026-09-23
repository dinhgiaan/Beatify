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
  loudnessLufs: z.number().optional(), // độ ồn tích hợp (LUFS)
  replayGain: z.number().optional(), // dB cần chỉnh (thường âm)
  lyrics: LyricsRefSchema.optional(), // Phase 4
});
export type Track = z.infer<typeof TrackSchema>;

export const AlbumSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  year: z.number().int().optional(),
  cover: z.string().optional(),
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

// Response chuẩn cho toàn bộ API JSON (trừ endpoint binary)
export interface ApiResponse<T> {
  status: number;
  message: string;
  data: T | null;
  error: string | null;
}
