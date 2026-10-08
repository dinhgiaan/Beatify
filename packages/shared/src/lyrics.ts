// Tham chiếu tới file lời bài hát (PLAN.md mục 13.2). Chỉ định nghĩa schema ở đây vì
// TrackSchema cần import; phần tra cứu/hiển thị lời thuộc Phase 4.
import { z } from 'zod';

export const LyricsRefSchema = z.object({
  file: z.string(), // "lyrics/{id}.lrc" hoặc "lyrics/{id}.txt"
  format: z.enum(['lrc', 'txt']), // lrc = có mốc thời gian, txt = lời thường
  source: z.enum(['embedded', 'lrclib', 'aligned', 'asr', 'manual', 'sidecar']),
  language: z.string().optional(), // 'vi', 'en', ...
  reviewed: z.boolean().default(false),
});
export type LyricsRef = z.infer<typeof LyricsRefSchema>;
