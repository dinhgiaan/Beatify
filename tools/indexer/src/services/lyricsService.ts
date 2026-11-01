import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';

export interface LyricsResult {
  source: 'lrclib-synced' | 'lrclib-plain' | 'yt-subs' | 'none';
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  durationMismatchWarning: boolean;
  durationDiffSeconds?: number;
}

interface LrcLibTrack {
  id: number;
  name: string;
  trackName?: string;
  artistName: string;
  albumName?: string;
  duration: number;
  instrumental: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
  statusCode?: number;
}

const USER_AGENT = 'Beatify-Music-App/1.0 (https://github.com/dinhgiaan/Beatify)';
const LRCLIB_BASE = 'https://lrclib.net/api';
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 300;

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function fetchWithRetry(url: string, retries = 3): Promise<unknown | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle();

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
      });

      if (response.status === 200) {
        const body = (await response.json()) as LrcLibTrack | { statusCode?: number };
        if (body && typeof body === 'object' && 'statusCode' in body && body.statusCode === 503) {
          if (attempt < retries) {
            await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1200));
            continue;
          }
          return null;
        }
        return body;
      }

      if (response.status === 404) {
        return null;
      }

      // Xử lý 503 Service Unavailable, 502 Bad Gateway, 429 Rate Limit
      if ((response.status >= 500 || response.status === 429) && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1500));
        continue;
      }

      return null;
    } catch {
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000));
      }
    }
  }
  return null;
}

export function formatLrcSpacing(text?: string | null): string {
  if (!text) return '';
  return text.replace(/(\[\d{2}:\d{2}(?:\.\d{2,3})?\])([^\s\r\n])/g, '$1 $2');
}

export const LyricsService = {
  /**
   * Tìm kiếm lời bài hát đồng bộ từ LRCLIB với nhiều lớp dự phòng thông minh
   */
  async fetchLyrics(
    title: string,
    artist: string,
    durationSeconds?: number
  ): Promise<LyricsResult> {
    if (!title) {
      return { source: 'none', durationMismatchWarning: false };
    }

    const cleanTitle = title.normalize('NFC').trim();
    const cleanArtist = (artist || '').normalize('NFC').trim();

    // 1. Thử lấy chính xác bằng /api/get (artist_name + track_name)
    const getParams = new URLSearchParams({
      track_name: cleanTitle,
      artist_name: cleanArtist,
    });
    if (durationSeconds && durationSeconds > 0) {
      getParams.append('duration', Math.round(durationSeconds).toString());
    }

    const exactMatch = (await fetchWithRetry(
      `${LRCLIB_BASE}/get?${getParams.toString()}`
    )) as LrcLibTrack | null;

    if (exactMatch && !exactMatch.instrumental) {
      if (exactMatch.syncedLyrics) {
        return {
          source: 'lrclib-synced',
          syncedLyrics: formatLrcSpacing(exactMatch.syncedLyrics),
          plainLyrics: exactMatch.plainLyrics,
          durationMismatchWarning: false,
        };
      }
      if (exactMatch.plainLyrics) {
        return {
          source: 'lrclib-plain',
          plainLyrics: exactMatch.plainLyrics,
          durationMismatchWarning: false,
        };
      }
    }

    // 2. Thử tìm kiếm qua /api/search theo cả artist và title
    const searchParams = new URLSearchParams({
      track_name: cleanTitle,
    });
    if (cleanArtist) {
      searchParams.append('artist_name', cleanArtist);
    }

    let searchResults = (await fetchWithRetry(
      `${LRCLIB_BASE}/search?${searchParams.toString()}`
    )) as LrcLibTrack[] | null;

    // 3. Fallback mở rộng: nếu tìm theo artist + track_name chưa ra, thử tìm theo query q rộng hơn
    if (!Array.isArray(searchResults) || searchResults.length === 0) {
      const qParams = new URLSearchParams({
        q: `${cleanTitle} ${cleanArtist}`.trim(),
      });
      searchResults = (await fetchWithRetry(
        `${LRCLIB_BASE}/search?${qParams.toString()}`
      )) as LrcLibTrack[] | null;
    }

    if (Array.isArray(searchResults) && searchResults.length > 0) {
      // Ưu tiên bài có syncedLyrics
      const candidates = searchResults.filter((r) => !r.instrumental && (r.syncedLyrics || r.plainLyrics));

      const firstCandidate = candidates[0];
      if (firstCandidate) {
        let best = firstCandidate;
        let minDiff = Infinity;

        if (durationSeconds && durationSeconds > 0) {
          for (const cand of candidates) {
            const diff = Math.abs(cand.duration - durationSeconds);
            if (cand.syncedLyrics && diff < minDiff) {
              minDiff = diff;
              best = cand;
            }
          }
        }

        const durationDiff = durationSeconds ? Math.abs(best.duration - durationSeconds) : 0;
        const mismatch = durationDiff > 3;

        if (best.syncedLyrics) {
          return {
            source: 'lrclib-synced',
            syncedLyrics: formatLrcSpacing(best.syncedLyrics),
            plainLyrics: best.plainLyrics,
            durationMismatchWarning: mismatch,
            durationDiffSeconds: durationDiff,
          };
        }
        if (best.plainLyrics) {
          return {
            source: 'lrclib-plain',
            plainLyrics: best.plainLyrics,
            durationMismatchWarning: mismatch,
            durationDiffSeconds: durationDiff,
          };
        }
      }
    }

    return { source: 'none', durationMismatchWarning: false };
  },

  /**
   * Chuyển đổi định dạng phụ đề WebVTT/SRT sang định dạng lời đồng bộ .lrc tiêu chuẩn
   */
  convertVttToLrc(vttContent: string): { syncedLyrics: string; plainLyrics: string } | null {
    if (!vttContent || !vttContent.includes('-->')) {
      return null;
    }

    const lines = vttContent.split(/\r?\n/);
    const lrcLines: string[] = [];
    const plainLines: string[] = [];

    // Regex bắt mốc thời gian: 00:01:23.456 --> 00:01:25.789 hoặc 01:23.456 --> 01:25.789
    const timeRegex = /(?:(\d{2}):)?(\d{2}):(\d{2})[.,](\d{2,3})\s*-->/;

    let lastTextLine = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;

      const match = line.match(timeRegex);
      if (match) {
        const hours = parseInt(match[1] || '0', 10);
        const minutes = parseInt(match[2] || '0', 10) + hours * 60;
        const seconds = parseInt(match[3] || '0', 10);
        const ms = (match[4] || '00').slice(0, 2).padEnd(2, '0');

        const timestamp = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${ms}]`;

        // Đọc các dòng text phụ đề theo sau
        let textLine = '';
        let j = i + 1;
        while (j < lines.length && lines[j]?.trim() && !lines[j]?.includes('-->')) {
          const currentLine = lines[j];
          if (currentLine) {
            const rawText = currentLine
              .replace(/<[^>]+>/g, '') // Xóa thẻ HTML/styling
              .trim();
            if (rawText) {
              textLine += (textLine ? ' ' : '') + rawText;
            }
          }
          j++;
        }

        if (
          textLine &&
          !textLine.toLowerCase().includes('[music]') &&
          !textLine.toLowerCase().includes('[âm nhạc]') &&
          textLine !== lastTextLine
        ) {
          lastTextLine = textLine;
          lrcLines.push(`${timestamp} ${textLine}`);
          plainLines.push(textLine);
        }
      }
    }

    if (lrcLines.length === 0) {
      return null;
    }

    return {
      syncedLyrics: lrcLines.join('\n'),
      plainLyrics: plainLines.join('\n'),
    };
  },

  /**
   * Tự động trích xuất phụ đề chính thức (Official CC) từ YouTube sang lời đồng bộ .lrc
   */
  async extractYouTubeSubtitles(
    url: string,
    signal?: AbortSignal
  ): Promise<{ syncedLyrics: string; plainLyrics: string } | null> {
    if (!url) return null;

    const tempDir = path.join(
      os.tmpdir(),
      `yt_sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    );

    try {
      await fsPromises.mkdir(tempDir, { recursive: true });
      const outputTemplate = path.join(tempDir, 'sub.%(ext)s');

      await new Promise<void>((resolve, reject) => {
        execFile(
          'yt-dlp',
          [
            '--write-sub',
            '--write-auto-sub',
            '--sub-lang',
            'vi,en,en-US,en-orig,vi-VN',
            '--sub-format',
            'vtt/lrc/srt',
            '--skip-download',
            '--no-warnings',
            '--no-call-home',
            '-o',
            outputTemplate,
            '--',
            url,
          ],
          { signal },
          (err) => {
            if (err && !fs.existsSync(tempDir)) {
              return reject(err);
            }
            resolve();
          }
        );
      });

      if (!fs.existsSync(tempDir)) return null;
      const files = await fsPromises.readdir(tempDir);

      // 1. Ưu tiên phụ đề tiếng Việt chính thức, sau đó phụ đề tiếng Việt tự động
      const viManualFile = files.find((f) => f.startsWith('sub.') && f.includes('.vi.') && !f.includes('.vi-orig.'));
      const viAnyFile = viManualFile || files.find((f) => f.startsWith('sub.') && f.toLowerCase().includes('.vi'));
      if (viAnyFile) {
        const content = await fsPromises.readFile(path.join(tempDir, viAnyFile), 'utf-8');
        const converted = this.convertVttToLrc(content);
        if (converted) return converted;
      }

      // 2. Ưu tiên phụ đề tiếng Anh chính thức
      const enManualFile = files.find(
        (f) =>
          f.startsWith('sub.') &&
          f.includes('.en.') &&
          (f.endsWith('.vtt') || f.endsWith('.lrc') || f.endsWith('.srt'))
      );
      if (enManualFile) {
        const content = await fsPromises.readFile(path.join(tempDir, enManualFile), 'utf-8');
        const converted = this.convertVttToLrc(content);
        if (converted) return converted;
      }

      // 3. Bất kỳ file phụ đề nào trích xuất được
      const anySub = files.find(
        (f) =>
          f.startsWith('sub.') &&
          (f.endsWith('.vtt') || f.endsWith('.lrc') || f.endsWith('.srt'))
      );
      if (anySub) {
        const content = await fsPromises.readFile(path.join(tempDir, anySub), 'utf-8');
        const converted = this.convertVttToLrc(content);
        if (converted) return converted;
      }

      return null;
    } catch {
      return null;
    } finally {
      try {
        await fsPromises.rm(tempDir, { recursive: true, force: true });
      } catch {
        // bỏ qua
      }
    }
  },
};
