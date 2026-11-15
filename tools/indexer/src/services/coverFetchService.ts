import { normalizeText } from '@music-app/shared';

export interface CoverSearchResult {
  source: 'itunes' | 'deezer';
  title: string;
  artist: string;
  album?: string;
  artworkUrl: string; // URL ảnh chất lượng cao nhất (1400x1400 hoặc 1000x1000)
  previewUrl: string; // URL ảnh preview nhẹ (300x300)
  width: number;
  height: number;
  score: number; // Độ tương đồng 0 - 100
}

export interface BatchCoverProgress {
  isRunning: boolean;
  total: number;
  current: number;
  currentTrackId?: string;
  currentTrackTitle?: string;
  successCount: number;
  skippedCount: number;
  failedCount: number;
  errors: Array<{ trackId: string; title: string; error: string }>;
}

const USER_AGENT = 'Beatify-Music-App/1.0 (https://github.com/dinhgiaan/Beatify)';
const MIN_REQUEST_INTERVAL_MS = 250;
let lastRequestTime = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Dọn dẹp tiêu đề bài hát để tăng tỷ lệ tìm kiếm chính xác trên iTunes/Apple Music
 */
export function cleanSearchQuery(title: string, artist?: string): string {
  let cleanedTitle = title
    .replace(/\s*[([](?:Official\s*(?:Music\s*)?Video|MV|Audio|Lyric\s*Video|Visualizer|Teaser|Vietsub|Remix|Live)[)\]]/gi, '')
    .replace(/\s*[([](?:feat\.?|ft\.?)[^)\]]+[)\]]/gi, '')
    .replace(/\s*-\s*(?:Official\s*(?:Music\s*)?Video|Official\s*Visualizer|MV|Audio|Visualizer).*$/gi, '')
    .trim();

  // Bỏ bớt ký tự thừa
  cleanedTitle = cleanedTitle.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();

  const cleanedArtist = (artist || '')
    .replace(/\s*[([](?:feat\.?|ft\.?)[^)\]]+[)\]]/gi, '')
    .replace(/,\s*.*$/, '') // Lấy nghệ sĩ chính đầu tiên
    .trim();

  if (cleanedArtist && cleanedArtist !== 'Unknown Artist' && cleanedArtist !== 'Single') {
    return `${cleanedTitle} ${cleanedArtist}`.trim();
  }
  return cleanedTitle;
}

/**
 * Tính điểm tương đồng đơn giản giữa 2 chuỗi (0 - 100)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeText(str1).toLowerCase().trim();
  const s2 = normalizeText(str2).toLowerCase().trim();

  if (s1 === s2) return 100;
  if (s1.includes(s2) || s2.includes(s1)) return 85;

  const words1 = s1.split(/\s+/).filter(Boolean);
  const words2 = s2.split(/\s+/).filter(Boolean);
  if (words1.length === 0 || words2.length === 0) return 0;

  const commonWords = words1.filter((w) => words2.includes(w));
  return Math.round((commonWords.length / Math.max(words1.length, words2.length)) * 80);
}

/**
 * Nâng cấp URL ảnh bìa iTunes lên độ phân giải tối đa (1400x1400 hoặc 3000x3000)
 */
export function upgradeItunesArtworkUrl(rawUrl: string, size = 1400): string {
  if (!rawUrl) return rawUrl;
  // Các định dạng thông thường của Apple: /100x100bb.jpg, /60x60bb.jpg, /512x512bb.jpg
  return rawUrl
    .replace(/\/\d+x\d+bb\.(jpg|png|webp)/i, `/${size}x${size}bb.jpg`)
    .replace(/\/\d+x\d+\.(jpg|png|webp)/i, `/${size}x${size}bb.jpg`);
}

/**
 * Tìm kiếm ảnh bìa chất lượng cao từ iTunes / Apple Music API
 */
export async function searchItunesCovers(title: string, artist?: string): Promise<CoverSearchResult[]> {
  await throttle();
  const query = cleanSearchQuery(title, artist);

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=6`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!res.ok) return [];

    const data = (await res.json()) as {
      resultCount?: number;
      results?: Array<{
        trackName?: string;
        artistName?: string;
        collectionName?: string;
        artworkUrl100?: string;
        artworkUrl60?: string;
      }>;
    };

    if (!data.results || data.results.length === 0) return [];

    const results: CoverSearchResult[] = [];

    for (const item of data.results) {
      const rawArtwork = item.artworkUrl100 || item.artworkUrl60;
      if (!rawArtwork) continue;

      const trackTitle = item.trackName || '';
      const trackArtist = item.artistName || '';

      const titleScore = calculateSimilarity(title, trackTitle);
      const artistScore = artist ? calculateSimilarity(artist, trackArtist) : 70;
      const totalScore = Math.round(titleScore * 0.6 + artistScore * 0.4);

      // Ảnh chuẩn nét nhất 1400x1400 (hoàn hảo cho retina display)
      const hiResUrl = upgradeItunesArtworkUrl(rawArtwork, 1400);
      const previewUrl = upgradeItunesArtworkUrl(rawArtwork, 300);

      results.push({
        source: 'itunes',
        title: trackTitle,
        artist: trackArtist,
        album: item.collectionName,
        artworkUrl: hiResUrl,
        previewUrl,
        width: 1400,
        height: 1400,
        score: totalScore,
      });
    }

    return results.sort((a, b) => b.score - a.score);
  } catch (err) {
    console.warn(`[CoverFetch] Lỗi tìm kiếm iTunes cho "${query}":`, err);
    return [];
  }
}

/**
 * Tìm kiếm ảnh bìa từ Deezer API (Fallback 1000x1000)
 */
export async function searchDeezerCovers(title: string, artist?: string): Promise<CoverSearchResult[]> {
  await throttle();
  const query = cleanSearchQuery(title, artist);
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!res.ok) return [];

    const data = (await res.json()) as {
      data?: Array<{
        title?: string;
        artist?: { name?: string };
        album?: {
          title?: string;
          cover_xl?: string;
          cover_big?: string;
          cover_medium?: string;
        };
      }>;
    };

    if (!data.data || data.data.length === 0) return [];

    const results: CoverSearchResult[] = [];

    for (const item of data.data) {
      const coverUrl = item.album?.cover_xl || item.album?.cover_big;
      if (!coverUrl) continue;

      const trackTitle = item.title || '';
      const trackArtist = item.artist?.name || '';

      const titleScore = calculateSimilarity(title, trackTitle);
      const artistScore = artist ? calculateSimilarity(artist, trackArtist) : 70;
      const totalScore = Math.round(titleScore * 0.6 + artistScore * 0.4);

      results.push({
        source: 'deezer',
        title: trackTitle,
        artist: trackArtist,
        album: item.album?.title,
        artworkUrl: coverUrl,
        previewUrl: item.album?.cover_medium || coverUrl,
        width: 1000,
        height: 1000,
        score: totalScore,
      });
    }

    return results.sort((a, b) => b.score - a.score);
  } catch (err) {
    console.warn(`[CoverFetch] Lỗi tìm kiếm Deezer cho "${query}":`, err);
    return [];
  }
}

/**
 * Tìm kiếm ảnh bìa kết hợp (Ưu tiên iTunes 1400x1400, sau đó tới Deezer 1000x1000)
 */
export async function searchCovers(title: string, artist?: string): Promise<CoverSearchResult[]> {
  const itunesResults = await searchItunesCovers(title, artist);
  if (itunesResults.length > 0 && (itunesResults[0]?.score ?? 0) >= 60) {
    return itunesResults;
  }

  const deezerResults = await searchDeezerCovers(title, artist);
  const combined = [...itunesResults, ...deezerResults];
  return combined.sort((a, b) => b.score - a.score);
}

/**
 * Tải ảnh bìa từ URL về Buffer
 */
export async function downloadCoverImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch (err) {
    console.warn(`[CoverFetch] Lỗi tải ảnh từ "${url}":`, err);
    return null;
  }
}
