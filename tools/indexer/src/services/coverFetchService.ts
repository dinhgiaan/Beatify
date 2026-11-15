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

export interface SearchCandidate {
  title: string;
  artist?: string;
  strategy: 'direct' | 'swapped' | 'youtube_extracted' | 'title_only';
}

const YOUTUBE_CHANNEL_REGEX = /(?:Entertainment|Records|Original|Channel|Music|Official|TV|Films|Production|Studio|Media|Band|Club|G5R|7clouds|FAPTV|EvB|GerDnang|Cover|Past live|Audio|Kara)/i;

/**
 * Tạo danh sách các ứng viên tìm kiếm thông minh tự động (Auto-Smart Match):
 * - Tự động bóc tách ca sĩ thật ra khỏi tên kênh YouTube
 * - Tự động đảo ngược Tên bài <-> Ca sĩ
 * - Tự động dọn dẹp các tiền tố/hậu tố video YouTube
 */
export function generateSmartSearchCandidates(title: string, artist?: string): SearchCandidate[] {
  const candidates: SearchCandidate[] = [];
  const rawTitle = title.trim();
  const rawArtist = (artist || '').trim();

  // 1. Tìm trực tiếp (Direct)
  candidates.push({ title: rawTitle, artist: rawArtist, strategy: 'direct' });

  // 2. Kiểm tra nếu title có dạng "Artist - Title" hoặc "Title - Artist" (dạng phổ biến khi tải từ YouTube)
  const splitHyphen = rawTitle.split(/\s+[-–—]\s+/);
  if (splitHyphen.length === 2 && splitHyphen[0] && splitHyphen[1]) {
    const partA = splitHyphen[0].replace(/^[[(][^\])]+[\])]\s*/, '').trim();
    const partB = splitHyphen[1].replace(/\s*[[(][^\])]+[\])].*$/, '').trim();

    // Thử partA = artist, partB = title
    candidates.push({ title: partB, artist: partA, strategy: 'youtube_extracted' });
    // Thử partB = artist, partA = title
    candidates.push({ title: partA, artist: partB, strategy: 'youtube_extracted' });
  }

  // 3. Kiểm tra dạng "Artist: Title"
  const splitColon = rawTitle.split(/:\s+/);
  if (splitColon.length === 2 && splitColon[0] && splitColon[1]) {
    candidates.push({ title: splitColon[1].trim(), artist: splitColon[0].trim(), strategy: 'youtube_extracted' });
  }

  // 4. Nếu Artist là tên kênh YouTube hoặc Title/Artist bị đảo ngược
  if (rawArtist && (YOUTUBE_CHANNEL_REGEX.test(rawArtist) || rawTitle.length < rawArtist.length)) {
    candidates.push({ title: rawArtist, artist: rawTitle, strategy: 'swapped' });
  } else if (rawArtist && rawArtist !== 'Unknown Artist' && rawArtist !== 'Single') {
    candidates.push({ title: rawArtist, artist: rawTitle, strategy: 'swapped' });
  }

  // 5. Thử chỉ tìm bằng title đã làm sạch (bỏ hết ngoặc, prod, v.v.)
  const cleanTitleOnly = rawTitle
    .replace(/\s*[[(](?:Official|MV|Audio|Lyrics?|Visualizer|Live|Vietsub|Remix|Cover|Prod\.?|Beat|Album|Track|Sing My Song)[^)\]]*[)\]]/gi, '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .trim();
  if (cleanTitleOnly && cleanTitleOnly !== rawTitle) {
    candidates.push({ title: cleanTitleOnly, artist: rawArtist, strategy: 'direct' });
  }

  // Lọc trùng ứng viên
  const seen = new Set<string>();
  const uniqueCandidates: SearchCandidate[] = [];
  for (const c of candidates) {
    const key = `${normalizeText(c.title).toLowerCase()}|${normalizeText(c.artist || '').toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueCandidates.push(c);
    }
  }

  return uniqueCandidates;
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
 * Tìm kiếm ảnh bìa kết hợp với Auto-Smart Match đa tầng:
 * - Thử lần lượt các ứng viên thông minh (Direct -> YouTube extracted -> Swapped Title/Artist -> Clean Title)
 * - Ưu tiên iTunes 1400x1400 Studio Quality, sau đó tới Deezer 1000x1000
 */
export async function searchCovers(title: string, artist?: string): Promise<CoverSearchResult[]> {
  const candidates = generateSmartSearchCandidates(title, artist);

  // Thử qua từng ứng viên thông minh trên iTunes
  for (const c of candidates) {
    const itunesResults = await searchItunesCovers(c.title, c.artist);
    if (itunesResults.length > 0 && (itunesResults[0]?.score ?? 0) >= 60) {
      return itunesResults;
    }
  }

  // Nếu iTunes chưa đạt ngưỡng, thử 2 ứng viên đầu tiên trên Deezer
  for (const c of candidates.slice(0, 2)) {
    const deezerResults = await searchDeezerCovers(c.title, c.artist);
    if (deezerResults.length > 0 && (deezerResults[0]?.score ?? 0) >= 60) {
      return deezerResults;
    }
  }

  // Nếu vẫn không có score >= 60, trả về danh sách kết quả tốt nhất tìm được để người dùng xem thủ công
  const fallbackItunes = await searchItunesCovers(title, artist);
  const fallbackDeezer = await searchDeezerCovers(title, artist);
  const combined = [...fallbackItunes, ...fallbackDeezer];
  return combined.sort((a, b) => b.score - a.score);
}

/**
 * Tải ảnh bìa từ URL về Buffer (có cơ chế tự động thử lại 2 lần nếu mạng chập chờn hoặc ECONNRESET)
 */
export async function downloadCoverImage(url: string, retries = 2): Promise<Buffer | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
      }
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
      });
      if (!res.ok) {
        // Nếu độ phân giải 1400x1400 không có sẵn trên Apple CDN, tự động thử 1000x1000 hoặc 600x600
        if (url.includes('/1400x1400bb.')) {
          const fallbackUrl = url.replace('/1400x1400bb.', '/1000x1000bb.');
          return downloadCoverImage(fallbackUrl, 1);
        }
        return null;
      }
      const arrayBuf = await res.arrayBuffer();
      return Buffer.from(arrayBuf);
    } catch (err) {
      if (attempt === retries) {
        console.warn(`[CoverFetch] Lỗi tải ảnh từ "${url}":`, err);
        return null;
      }
    }
  }
  return null;
}
