/**
 * Smart Folder Matcher & Suggestion Algorithm
 */

export interface FolderSuggestion {
  folder: string;
  matchedKeyword: string;
  confidence: 'high' | 'medium';
  isNonArtistChannel: boolean;
}

const COMMON_NON_ARTIST_KEYWORDS = [
  'music', 'official', 'channel', 'records', 'entertainment', 'radio',
  'media', 'tổng hợp', 'tong hop', 'nhạc', 'nhac', 'beat', 'beats',
  'mix', 'dj', 'studio', 'tv', 'lofi', 'chill', 'vibe', 'zone',
  'station', 'sound', 'acoustic', 'relax', 'audiophile', 'club',
  'records', 'collective', 'network', 'tuyển tập', 'tuyen tap',
  'liên khúc', 'lien khuc', 'nonstop', 'best of', 'top hits', 'mashup'
];

export function normalizeText(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractFolderBaseName(folderPath: string): string {
  if (!folderPath) return '';
  const cleaned = folderPath.trim().replace(/[\\/]+$/, '');
  const parts = cleaned.split(/[\\/]/);
  return parts[parts.length - 1] || cleaned;
}

export function isNonArtistChannel(artist: string, rawTitle: string, confidence?: string): boolean {
  if (confidence === 'low') return true;
  const normArtist = normalizeText(artist);
  const normTitle = normalizeText(rawTitle);

  for (const kw of COMMON_NON_ARTIST_KEYWORDS) {
    const normKw = normalizeText(kw);
    if (normArtist.includes(normKw) || normTitle.includes(normKw)) {
      return true;
    }
  }
  return false;
}

export function suggestTargetFolder(
  track: {
    rawTitle: string;
    cleanTitle: string;
    artist: string;
    metadataConfidence?: 'high' | 'medium' | 'low';
  },
  folderHistory: string[]
): FolderSuggestion | null {
  if (!folderHistory || folderHistory.length === 0) return null;

  const normTitle = normalizeText(`${track.cleanTitle} ${track.rawTitle}`);
  const isChannelNonArtist = isNonArtistChannel(track.artist, track.rawTitle, track.metadataConfidence);

  let bestMatch: { folder: string; keyword: string; score: number } | null = null;

  for (const folder of folderHistory) {
    const baseName = extractFolderBaseName(folder);
    const normBaseName = normalizeText(baseName);
    if (!normBaseName) continue;

    if (normTitle.includes(normBaseName)) {
      const score = normBaseName.length * 2;
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { folder, keyword: baseName, score };
      }
    }
  }

  if (bestMatch) {
    return {
      folder: bestMatch.folder,
      matchedKeyword: bestMatch.keyword,
      confidence: bestMatch.score >= 8 ? 'high' : 'medium',
      isNonArtistChannel: isChannelNonArtist,
    };
  }

  return null;
}
