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

export interface LrcLine {
  time: number; // thời gian tính bằng giây
  text: string;
}

/**
 * Phân tích cú pháp chuỗi LRC thành danh sách các dòng có mốc thời gian (seconds)
 */
export function parseLrc(content?: string | null): LrcLine[] {
  if (!content) return [];
  const lines = content.split(/\r?\n/);
  const result: LrcLine[] = [];
  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const matches = Array.from(trimmed.matchAll(timeRegex));
    if (matches.length === 0) continue;

    const text = trimmed.replace(timeRegex, '').trim();
    for (const match of matches) {
      const minStr = match[1];
      const secStr = match[2];
      if (!minStr || !secStr) continue;

      const minutes = parseInt(minStr, 10);
      const seconds = parseInt(secStr, 10);
      const milliseconds = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;
      const time = minutes * 60 + seconds + milliseconds / 1000;
      result.push({ time, text });
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

/**
 * Tìm chỉ số dòng lời đang phát tại thời điểm currentTime (giây)
 */
export function findActiveLrcIndex(lines: LrcLine[], currentTime: number): number {
  if (!lines || lines.length === 0) return -1;
  let activeIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line && line.time <= currentTime) {
      activeIndex = i;
    } else {
      break;
    }
  }
  return activeIndex;
}

