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
 * Hỗ trợ:
 * - Chuẩn LRC quốc tế (ID tags: [ar:], [ti:], [al:], [offset:+/-ms])
 * - Offset điều chỉnh thời gian trễ/sớm toàn bài
 * - Phút linh hoạt từ 1-3 chữ số (\d{1,3})
 * - Dấu phân cách millisecond cả '.' và ':'
 * - Dòng chứa nhiều timestamp liên tiếp [00:01.00][00:05.00] Lời
 */
export function parseLrc(content?: string | null): LrcLine[] {
  if (!content) return [];
  const lines = content.split(/\r?\n/);
  const result: LrcLine[] = [];

  // Tag offset chuẩn LRC: [offset:+/-ms] (ví dụ: [offset: 500] hoặc [offset:-200])
  const offsetRegex = /^\[offset:\s*([+-]?\d+)\s*\]/i;
  // Các thẻ metadata chuẩn cần bỏ qua
  const metaTagRegex = /^\[(ar|ti|al|au|by|re|ve|length):/i;
  // Regex khớp timestamp: [mm:ss.xx] hoặc [m:ss.xxx] hoặc [mm:ss:xx]
  const timeRegex = /\[(\d{1,3}):(\d{2})(?:[.:](\d{2,3}))?\]/g;

  let globalOffsetSec = 0;

  // Bước 1: Quét tìm thẻ [offset:...] trong toàn bộ văn bản trước
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const offsetMatch = trimmed.match(offsetRegex);
    if (offsetMatch && offsetMatch[1]) {
      const parsedMs = parseInt(offsetMatch[1], 10);
      if (!isNaN(parsedMs)) {
        globalOffsetSec = parsedMs / 1000;
      }
    }
  }

  // Bước 2: Phân tích từng dòng lời bài hát
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (metaTagRegex.test(trimmed)) continue;

    const matches = Array.from(trimmed.matchAll(timeRegex));
    if (matches.length === 0) continue;

    // Loại bỏ tất cả các cụm timestamp để lấy nội dung text
    const text = trimmed.replace(timeRegex, '').trim();

    for (const match of matches) {
      const minStr = match[1];
      const secStr = match[2];
      if (!minStr || !secStr) continue;

      const minutes = parseInt(minStr, 10);
      const seconds = parseInt(secStr, 10);
      const milliseconds = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;

      // Cộng dồn offset toàn cục (offset > 0 là trễ hơn)
      const calculatedTime = minutes * 60 + seconds + milliseconds / 1000 + globalOffsetSec;
      const time = Math.max(0, Math.round(calculatedTime * 1000) / 1000);

      result.push({ time, text });
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

/**
 * Tìm chỉ số dòng lời đang phát tại thời điểm currentTime (giây)
 * Sử dụng thuật toán Binary Search O(log N) cho hiệu năng tối ưu
 */
export function findActiveLrcIndex(lines: LrcLine[], currentTime: number): number {
  if (!lines || lines.length === 0) return -1;

  let low = 0;
  let high = lines.length - 1;
  let ans = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const line = lines[mid];
    if (line && line.time <= currentTime) {
      ans = mid;
      low = mid + 1; // Tìm tiếp về phía sau xem có dòng nào gần hơn nữa không
    } else {
      high = mid - 1;
    }
  }

  return ans;
}

/**
 * Đảm bảo khoảng trắng chuẩn giữa timestamp LRC và nội dung lời
 * Ví dụ: [00:12.34]Lời hát -> [00:12.34] Lời hát
 */
export function formatLrcSpacing(text?: string | null): string {
  if (!text) return '';
  return text.replace(/(\[\d{1,3}:\d{2}(?:[.:]\d{2,3})?\])([^\s\r\n])/g, '$1 $2');
}

