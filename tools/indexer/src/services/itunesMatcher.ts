import fs from 'fs';
import path from 'path';
import { normalizeText } from '@music-app/shared';
import { findIndexerConfigDir } from './channelClassifier';

export interface ITunesSongItem {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  country?: string;
  primaryGenreName?: string;
  releaseDate?: string;
}

export interface ITunesMatchResult {
  matched: boolean;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  previewUrl?: string;
  confidence: 'high' | 'medium' | 'low';
  confidenceReason: string;
  source: 'itunes';
  country?: 'vn' | 'us';
  storeTrackId?: number;
  similarityScore: { title: number; artist: number };
}

export interface ITunesMatcherOptions {
  noNetwork?: boolean;
  timeoutMs?: number;
  countries?: Array<'vn' | 'us'>;
  cacheDir?: string;
  minTitleScore?: number;
  minArtistScore?: number;
}

const USER_AGENT = 'Beatify-Music-App/1.0 (https://github.com/dinhgiaan/Beatify)';
const MIN_REQUEST_INTERVAL_MS = 200;
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
 * Tính khoảng cách Levenshtein giữa 2 chuỗi
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const d: number[][] = [];
  for (let i = 0; i <= m; i++) {
    const row: number[] = [];
    for (let j = 0; j <= n; j++) {
      row.push(i === 0 ? j : j === 0 ? i : 0);
    }
    d.push(row);
  }

  for (let i = 1; i <= m; i++) {
    const prevRow = d[i - 1];
    const currRow = d[i];
    if (!prevRow || !currRow) continue;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        (prevRow[j] ?? 0) + 1,
        (currRow[j - 1] ?? 0) + 1,
        (prevRow[j - 1] ?? 0) + cost
      );
    }
  }

  return d[m]?.[n] ?? Math.max(m, n);
}

/**
 * Tính điểm tương đồng 0 - 100 giữa 2 chuỗi (kết hợp Jaccard và Levenshtein)
 */
export function calculateSimilarity(s1: string, s2: string): number {
  const norm1 = normalizeText(s1).toLowerCase().trim();
  const norm2 = normalizeText(s2).toLowerCase().trim();

  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 100;
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const ratio = Math.min(norm1.length, norm2.length) / Math.max(norm1.length, norm2.length);
    if (ratio > 0.6) return Math.round(85 + ratio * 15);
  }

  const tokens1 = new Set(norm1.split(/\s+/).filter(Boolean));
  const tokens2 = new Set(norm2.split(/\s+/).filter(Boolean));
  const intersection = new Set([...tokens1].filter((x) => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);
  const jaccard = union.size > 0 ? (intersection.size / union.size) * 100 : 0;

  const maxLen = Math.max(norm1.length, norm2.length);
  const dist = levenshteinDistance(norm1, norm2);
  const lev = maxLen > 0 ? (1 - dist / maxLen) * 100 : 0;

  return Math.round(0.5 * jaccard + 0.5 * lev);
}

/**
 * Phát hiện các modifier bài hát để ngăn ngừa match nhầm Cover/Remix/Karaoke
 */
/**
 * So khớp artist thông minh hỗ trợ đa nghệ sĩ hợp tác (hỗ trợ &, feat, ft, x)
 */
export function calculateArtistSimilarity(itunesArtist: string, candidateArtist: string): number {
  const fullScore = calculateSimilarity(itunesArtist, candidateArtist);
  if (fullScore >= 75) return fullScore;

  // So khớp với nghệ sĩ chính đầu tiên của iTunes
  const primaryItunes = itunesArtist.split(/[,&]|\s+(?:feat\.?|ft\.?|featuring|and|\/)\s+|\s+[xX]\s+/i)[0]?.trim() || '';
  if (primaryItunes) {
    const primaryScore = calculateSimilarity(primaryItunes, candidateArtist);
    if (primaryScore >= 75) return primaryScore;
  }

  // So khớp nếu candidateArtist trùng với bất kỳ nghệ sĩ nào trong iTunes
  const itunesArtists = itunesArtist.split(/[,&]|\s+(?:feat\.?|ft\.?|featuring|and|\/)\s+|\s+[xX]\s+/i).map((a) => a.trim()).filter(Boolean);
  for (const art of itunesArtists) {
    const score = calculateSimilarity(art, candidateArtist);
    if (score >= 80) return score;
  }

  return fullScore;
}

/**
 * So khớp title thông minh (bỏ qua - Single, (Single))
 */
export function calculateTitleSimilarity(itunesTitle: string, candidateTitle: string): number {
  const cleanItunes = itunesTitle.replace(/\s*[-–]\s*Single$/i, '').replace(/\s*\((?:Single|Official\s*Audio)\)$/i, '').trim();
  const cleanCand = candidateTitle.replace(/\s*[-–]\s*Single$/i, '').replace(/\s*\((?:Single|Official\s*Audio)\)$/i, '').trim();
  return calculateSimilarity(cleanItunes, cleanCand);
}

export function detectSongModifiers(str: string): {
  isRemix: boolean;
  isCover: boolean;
  isKaraoke: boolean;
  isLive: boolean;
  isAcoustic: boolean;
  isInstrumental: boolean;
} {
  const s = str.toLowerCase();
  return {
    isRemix: /\b(?:remix|rmx)\b/i.test(s),
    isCover: /\b(?:cover|tribute)\b/i.test(s),
    isKaraoke: /\b(?:karaoke|beat)\b/i.test(s),
    isLive: /\b(?:live|concert|tour)\b/i.test(s),
    isAcoustic: /\b(?:acoustic)\b/i.test(s),
    isInstrumental: /\b(?:instrumental|guitar\s*version|piano\s*version)\b/i.test(s),
  };
}

export class ITunesMatcher {
  private cache = new Map<string, ITunesSongItem[]>();
  private cacheFilePath: string;
  private isCacheDirty = false;

  constructor(customCacheDir?: string) {
    const configDir = findIndexerConfigDir();
    const baseDir = customCacheDir || path.resolve(configDir, '../.cache');
    this.cacheFilePath = path.join(baseDir, 'itunes_entity_cache.json');
    this.loadCache();
  }

  private loadCache(): void {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const raw = JSON.parse(fs.readFileSync(this.cacheFilePath, 'utf-8'));
        if (typeof raw === 'object' && raw !== null) {
          for (const [k, v] of Object.entries(raw)) {
            if (Array.isArray(v)) {
              this.cache.set(k, v as ITunesSongItem[]);
            }
          }
        }
      }
    } catch {
      // Bỏ qua lỗi nạp cache
    }
  }

  public saveCache(): void {
    if (!this.isCacheDirty) return;
    try {
      const dir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const obj: Record<string, ITunesSongItem[]> = {};
      for (const [k, v] of this.cache.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(obj, null, 2), 'utf-8');
      this.isCacheDirty = false;
    } catch {
      // Bỏ qua lỗi ghi cache
    }
  }

  /**
   * Gọi iTunes Search API với timeout, retry và throttle
   */
  public async searchStore(
    query: string,
    country: 'vn' | 'us' = 'vn',
    options?: ITunesMatcherOptions
  ): Promise<ITunesSongItem[]> {
    const normKey = `${country}:${normalizeText(query).toLowerCase().trim()}`;
    if (this.cache.has(normKey)) {
      return this.cache.get(normKey) || [];
    }

    if (options?.noNetwork) {
      return [];
    }

    await throttle();
    const timeoutMs = options?.timeoutMs || 5000;
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&country=${country}&limit=6`;

    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
          continue;
        }

        const data = (await res.json()) as {
          resultCount?: number;
          results?: ITunesSongItem[];
        };

        const results = (data.results || []).map((r) => ({
          ...r,
          country,
        }));

        this.cache.set(normKey, results);
        this.isCacheDirty = true;
        return results;
      } catch {
        clearTimeout(timer);
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    }

    // Không tìm thấy hoặc lỗi sau 2 lần thử
    this.cache.set(normKey, []);
    this.isCacheDirty = true;
    return [];
  }

  /**
   * Tầng 4: Đối soát và phân giải thực thể qua iTunes Search API
   */
  public async matchEntity(
    input: {
      rawTitle: string;
      channel?: string;
      uploader?: string;
      candidateTitle: string;
      candidateArtist: string;
    },
    options?: ITunesMatcherOptions
  ): Promise<ITunesMatchResult | null> {
    const countries = options?.countries || ['vn', 'us'];
    const minTitleScore = options?.minTitleScore ?? 75;
    const minArtistScore = options?.minArtistScore ?? 70;

    const rawMod = detectSongModifiers(input.rawTitle);

    // Xây dựng các truy vấn tìm kiếm ứng viên
    const queries: string[] = [];
    const cleanCandA = input.candidateArtist.replace(/^[-|:\s]+|[-|:\s]+$/g, '').trim();
    const cleanCandT = input.candidateTitle.replace(/^[-|:\s]+|[-|:\s]+$/g, '').trim();

    if (cleanCandA && cleanCandT && cleanCandA !== 'Unknown Artist') {
      queries.push(`${cleanCandA} ${cleanCandT}`);
      queries.push(`${cleanCandT} ${cleanCandA}`);
    }
    if (cleanCandT) {
      queries.push(cleanCandT);
    }

    let bestMatch: {
      item: ITunesSongItem;
      titleScore: number;
      artistScore: number;
      country: 'vn' | 'us';
    } | null = null;

    for (const country of countries) {
      for (const q of queries) {
        const items = await this.searchStore(q, country, options);

        for (const item of items) {
          const itemMod = detectSongModifiers(`${item.trackName} ${item.artistName}`);

          // Chống Match Nhầm: Từ chối nếu iTunes là Cover/Remix/Karaoke/Instrumental mà bài gốc không phải
          if (!rawMod.isCover && itemMod.isCover) continue;
          if (!rawMod.isKaraoke && itemMod.isKaraoke) continue;
          if (!rawMod.isRemix && itemMod.isRemix) continue;
          if (!rawMod.isInstrumental && itemMod.isInstrumental) continue;

          // So khớp cả Title và Artist
          const titleScore = calculateTitleSimilarity(item.trackName, cleanCandT);
          const artistScore = calculateArtistSimilarity(item.artistName, cleanCandA);

          // Trường hợp đảo vế: Tiêu đề khớp Artist và Ca sĩ khớp Title
          const swappedTitleScore = calculateTitleSimilarity(item.trackName, cleanCandA);
          const swappedArtistScore = calculateArtistSimilarity(item.artistName, cleanCandT);

          const isDirectMatch = titleScore >= minTitleScore && artistScore >= minArtistScore;
          const isSwappedMatch = swappedTitleScore >= minTitleScore && swappedArtistScore >= minArtistScore;

          if (isDirectMatch) {
            const totalScore = titleScore + artistScore;
            const currentBestTotal = bestMatch ? bestMatch.titleScore + bestMatch.artistScore : 0;
            if (totalScore > currentBestTotal) {
              bestMatch = { item, titleScore, artistScore, country };
            }
          } else if (isSwappedMatch) {
            const totalScore = swappedTitleScore + swappedArtistScore;
            const currentBestTotal = bestMatch ? bestMatch.titleScore + bestMatch.artistScore : 0;
            if (totalScore > currentBestTotal) {
              bestMatch = {
                item,
                titleScore: swappedTitleScore,
                artistScore: swappedArtistScore,
                country,
              };
            }
          }
        }

        if (bestMatch && bestMatch.titleScore >= 90 && bestMatch.artistScore >= 90) {
          break; // Đã tìm thấy ứng viên hoàn hảo
        }
      }

      if (bestMatch && bestMatch.titleScore >= 85 && bestMatch.artistScore >= 85) {
        break;
      }
    }

    this.saveCache();

    if (!bestMatch) {
      return null;
    }

    const { item, titleScore, artistScore, country } = bestMatch;
    const confidence = titleScore >= 85 && artistScore >= 80 ? 'high' : 'medium';
    const artworkUrl = item.artworkUrl100
      ? item.artworkUrl100.replace(/\/\d+x\d+bb\./i, '/1400x1400bb.')
      : undefined;

    return {
      matched: true,
      title: item.trackName.trim(),
      artist: item.artistName.trim(),
      album: item.collectionName?.trim(),
      coverUrl: artworkUrl,
      previewUrl: item.previewUrl,
      confidence,
      confidenceReason: `iTunes Store (${country.toUpperCase()}): Khớp cả Title (${titleScore}%) và Artist (${artistScore}%) [TrackID: ${item.trackId}]`,
      source: 'itunes',
      country,
      storeTrackId: item.trackId,
      similarityScore: { title: titleScore, artist: artistScore },
    };
  }
}

export const defaultITunesMatcher = new ITunesMatcher();
