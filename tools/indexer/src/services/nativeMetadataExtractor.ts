import type { ChannelClassifier } from './channelClassifier';
import { defaultChannelClassifier } from './channelClassifier';

export interface NativeYtDlpInput {
  title?: string;
  artist?: string;
  track?: string;
  album?: string;
  channel?: string;
  uploader?: string;
  description?: string;
}

export interface ExtractedNativeMetadata {
  title: string;
  artist: string;
  album?: string;
  artists: string[];
  confidence: 'high' | 'medium' | 'low';
  confidenceReason: string;
  source: 'layer0';
  pipelineVersion: string;
}

function normalizeNfc(text?: string): string {
  return (text || '').normalize('NFC').trim();
}

const INVALID_ARTIST_PATTERNS = [
  /^unknown/i,
  /^various\s+artists$/i,
  /^(?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?|mv|channel)$/i,
  /^(?:official|music|video|audio|lyrics?)$/i,
];

function isValidEntityString(str?: string): boolean {
  if (!str) return false;
  const s = str.trim();
  if (s.length < 1 || s.length > 120) return false;
  for (const pat of INVALID_ARTIST_PATTERNS) {
    if (pat.test(s)) return false;
  }
  return true;
}

function cleanTrackGarbage(track: string): string {
  return track
    .replace(/\[\s*(?:video\s*\+\s*)?(?:official\s+)?(?:music\s+)?(?:video|mv|audio|lyric\s*kara|lyric\s*video|lyric|lyrics|karaoke|hd|4k)[^\]]*\]/gi, '')
    .replace(/\(\s*(?:video\s*\+\s*)?(?:official\s+)?(?:music\s+)?(?:video|mv|audio|lyric\s*kara|lyric\s*video|lyric|lyrics|karaoke|hd|4k)[^)]*\)/gi, '')
    .trim();
}

function parseMultipleArtists(artistStr: string): string[] {
  if (!artistStr.includes(',')) {
    return [artistStr];
  }
  return artistStr
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
}

export const NativeMetadataExtractor = {
  /**
   * Tầng 0: Trích xuất metadata từ trường gốc của yt-dlp / YouTube Music.
   * Kèm Sanity Check chặt chẽ:
   * - Phải có cặp artist + track hợp lệ
   * - Artist không được trùng tên kênh Aggregator / Hãng phân phối
   * - Track được làm sạch các tag rác video/lyric
   * - Hỗ trợ tách danh sách nhiều nghệ sĩ phân tách bằng dấu phẩy
   */
  extract(
    raw: NativeYtDlpInput,
    classifier: ChannelClassifier = defaultChannelClassifier
  ): ExtractedNativeMetadata | null {
    // 1. Kiểm tra cặp track + artist chính thức từ YouTube Music
    const rawTrack = normalizeNfc(raw.track);
    const rawArtist = normalizeNfc(raw.artist);

    if (isValidEntityString(rawTrack) && isValidEntityString(rawArtist)) {
      // SANITY CHECK: Artist không được là kênh aggregator
      if (classifier.isAggregatorChannel(rawArtist)) {
        return null; // Từ chối fast-pass, nhường cho các tầng sau thẩm định
      }

      const cleanTrack = cleanTrackGarbage(rawTrack);
      if (!isValidEntityString(cleanTrack)) {
        return null;
      }

      const artists = parseMultipleArtists(rawArtist);
      const album = normalizeNfc(raw.album) || undefined;

      return {
        title: cleanTrack,
        artist: rawArtist,
        album,
        artists,
        confidence: 'high',
        confidenceReason: 'Khớp cặp artist + track chuẩn từ YouTube Music metadata qua Sanity Check',
        source: 'layer0',
        pipelineVersion: '1.5',
      };
    }

    // 2. Kiểm tra kênh phân phối chính thức "- Topic"
    const channelName = normalizeNfc(raw.channel || raw.uploader);
    if (/ - Topic$/i.test(channelName)) {
      const artistFromTopic = channelName.replace(/\s*-\s*Topic$/i, '').trim();
      const titleCandidate = rawTrack ? cleanTrackGarbage(rawTrack) : cleanTrackGarbage(normalizeNfc(raw.title));

      if (
        isValidEntityString(artistFromTopic) &&
        isValidEntityString(titleCandidate) &&
        !classifier.isAggregatorChannel(artistFromTopic)
      ) {
        return {
          title: titleCandidate,
          artist: artistFromTopic,
          album: normalizeNfc(raw.album) || undefined,
          artists: parseMultipleArtists(artistFromTopic),
          confidence: 'high',
          confidenceReason: 'Nhận diện kênh YouTube Music Topic chính thức (- Topic) qua Sanity Check',
          source: 'layer0',
          pipelineVersion: '1.5',
        };
      }
    }

    // 3. Phân tích mô tả chuẩn phân phối: "Provided to YouTube by ..."
    const description = raw.description || '';
    if (description.includes('Provided to YouTube by')) {
      const lines = description.split('\n').map((l) => l.trim()).filter(Boolean);
      const providedIdx = lines.findIndex((l) => l.startsWith('Provided to YouTube by'));
      if (providedIdx >= 0 && lines.length > providedIdx + 2) {
        // Cấu trúc phân phối chuẩn YouTube:
        // Line 0: "Provided to YouTube by <Distributor>"
        // Line 1: Track Title
        // Line 2: Artist Name
        // Line 3: Album Title
        const candidateTitle = cleanTrackGarbage(lines[providedIdx + 1] || '');
        const candidateArtist = lines[providedIdx + 2] || '';
        const candidateAlbum = lines[providedIdx + 3] || '';

        if (
          isValidEntityString(candidateTitle) &&
          isValidEntityString(candidateArtist) &&
          !classifier.isAggregatorChannel(candidateArtist)
        ) {
          return {
            title: candidateTitle,
            artist: candidateArtist,
            album: isValidEntityString(candidateAlbum) ? candidateAlbum : undefined,
            artists: parseMultipleArtists(candidateArtist),
            confidence: 'high',
            confidenceReason: 'Bóc tách từ cấu trúc phân phối bản quyền "Provided to YouTube by"',
            source: 'layer0',
            pipelineVersion: '1.5',
          };
        }
      }
    }

    return null;
  },
};
