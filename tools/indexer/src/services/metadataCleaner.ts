export interface CleanedMetadata {
  title: string;
  artist: string;
  albumArtist: string;
  artists: string[];
  album?: string;
  confidence: 'high' | 'medium' | 'low';
  confidenceReason?: string;
  source: 'yt-music' | 'regex';
}

// Các từ khóa rác phổ biến trong tiêu đề YouTube / MV / Audio
const JUNK_PATTERNS = [
  /\[\s*(?:official\s+)?(?:music\s+)?(?:video|mv|audio|lyric\s+video|lyric|lyrics|visualizer|hd|4k|remastered)\s*\]/gi,
  /\(\s*(?:official\s+)?(?:music\s+)?(?:video|mv|audio|lyric\s+video|lyric|lyrics|visualizer|hd|4k|remastered)\s*\)/gi,
  /【\s*(?:official\s+)?(?:music\s+)?(?:video|mv|audio|lyric\s+video)\s*】/gi,
  /\|\s*(?:official\s+)?(?:mv|music\s+video|audio|lyrics?|lyric\s+video)\s*(?=\||$)/gi,
  /\|\s*(?:@?\d+\s*hz|8d(?:\s*audio)?|slowed(?:\s*\+\s*reverb)?|bass\s*boosted|nightcore|speed\s*up|pitched|remaster(?:ed)?|instrumental|karaoke).*$/gi,
  /\s*-\s*(?:official\s+)?(?:mv|music\s+video|audio|lyric\s+video)\s*$/gi,
  /#\w+/g, // hashtags
];

const JUNK_SEGMENT_REGEX =
  /^(?:official\s+)?(?:music\s+)?(?:video|mv|audio|lyric\s+video|lyric|lyrics|visualizer|hd|4k|remastered|karaoke|instrumental|beat)$/i;

function isJunkSegment(seg: string): boolean {
  const s = seg.replace(/^[[(【\s]+|[\]) 】\s]+$/g, '').trim();
  if (!s) return true;
  if (JUNK_SEGMENT_REGEX.test(s)) return true;
  if (/^@?\d+\s*hz$/i.test(s)) return true;
  if (/^(?:8d(?:\s*audio)?|slowed(?:\s*\+\s*reverb)?|bass\s*boosted|nightcore|speed\s*up|pitched)$/i.test(s)) return true;
  if (/^#\w+/.test(s)) return true;
  return false;
}

export const MetadataCleaner = {
  /**
   * Chuẩn hóa tên kênh phát hành về tên nghệ sĩ:
   * - Cắt hậu tố: ' - Topic', ' Official Channel', ' Official', ' Channel'
   * - Xử lý VEVO: 'AdeleVEVO' -> 'Adele', 'TaylorSwiftVEVO' -> 'Taylor Swift'
   */
  normalizeChannelName(channelName?: string): string {
    if (!channelName) return 'Unknown Artist';
    let clean = channelName.normalize('NFC').trim();

    // 1. Cắt Topic
    clean = clean.replace(/\s*-\s*Topic$/i, '').trim();

    // 2. Cắt VEVO (kể cả viết liền như AdeleVEVO, TaylorSwiftVEVO)
    if (/VEVO$/i.test(clean)) {
      clean = clean.replace(/VEVO$/i, '').trim();
      clean = clean.replace(/([a-z])([A-Z])/g, '$1 $2');
    }

    // 3. Cắt Official Channel / Official
    clean = clean.replace(/\s+(?:Official(?:\s+Channel)?|Channel)$/i, '').trim();

    return clean || 'Unknown Artist';
  },

  /**
   * Chuyển chuỗi ALL CAPS sang Title Case an toàn cho tiếng Việt
   */
  toSafeTitleCase(str: string): string {
    if (!str) return '';
    const isAllUpper = str === str.toUpperCase() && str !== str.toLowerCase() && str.length > 3;
    if (!isAllUpper) return str;

    return str
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  },

  /**
   * Tách danh sách nghệ sĩ khi có các từ nối feat., ft., x, &, dấu phẩy
   * Tự động loại bỏ thông tin sản xuất (prod. by ...)
   */
  parseArtists(artistStr: string): { mainArtist: string; artists: string[] } {
    if (!artistStr) return { mainArtist: 'Unknown Artist', artists: [] };
    let cleanStr = artistStr.normalize('NFC').trim();

    // Loại bỏ phần prod. by khỏi danh sách nghệ sĩ biểu diễn chính
    cleanStr = cleanStr.replace(/\s*[([](?:prod(?:\.|\s+by)?)[^)\]]*[)\]]/gi, '').trim();

    const tokens = cleanStr
      .split(/(?:\s+(?:feat\.?|ft\.?|featuring)\s+)|(?:\s+[xX&]\s+)|(?:\s*,\s*)/i)
      .map((a) => a.trim().replace(/^[@#]/, ''))
      .filter(Boolean);

    if (tokens.length === 0) {
      const fallback = cleanStr || 'Unknown Artist';
      return { mainArtist: fallback, artists: [fallback] };
    }

    return {
      mainArtist: tokens[0] || 'Unknown Artist',
      artists: tokens,
    };
  },

  /**
   * Chấm điểm khả năng một phân đoạn là Nghệ sĩ hay Tên bài hát:
   * Điểm dương cao: Nghệ sĩ (có ft, x, trùng channel, prod. by)
   * Điểm âm: Tên bài hát (chứa Remix, Cover, Live, Acoustic, Version...)
   */
  scoreAsArtist(text: string, normalizedChannel: string): number {
    let score = 0;
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();
    const normChanLower = (normalizedChannel || '').toLowerCase();

    // 1. Trùng hoặc chứa tên kênh chính thức
    if (normChanLower && normChanLower !== 'unknown artist') {
      if (lower === normChanLower) score += 25;
      else if (lower.includes(normChanLower) || normChanLower.includes(lower)) score += 15;
    }

    // 2. Chứa từ nối đa nghệ sĩ
    if (/\b(?:feat\.?|ft\.?|featuring)\b/i.test(trimmed)) score += 12;
    if (/\s+[xX&]\s+/.test(trimmed)) score += 10;
    if (/\b(?:prod(?:\.|\s+by)?)\b/i.test(trimmed)) score += 4;

    // 3. Trừ điểm nặng nếu chứa từ khóa bài hát / phiên bản
    if (/\b(?:remix|cover|acoustic|live|version|karaoke|instrumental|piano|guitar|beat)\b/i.test(lower)) {
      score -= 25;
    }
    if (/\b(?:ver\.?|slowed|reverb|speed\s*up|nightcore|mashup|medley|ost)\b/i.test(lower)) {
      score -= 20;
    }
    if (/\([^)]{2,}\)/.test(trimmed) && !/\b(?:ft|feat)\b/i.test(trimmed)) {
      score -= 6;
    }

    return score;
  },

  /**
   * Làm sạch toàn diện metadata từ dữ liệu trích xuất của YouTube
   */
  clean(raw: {
    title: string;
    uploader?: string;
    channel?: string;
    artist?: string;
    track?: string;
    album?: string;
  }): CleanedMetadata {
    // 1. Ưu tiên dữ liệu YouTube Music chính thống nếu có cả track và artist
    if (raw.track && raw.artist) {
      const { mainArtist, artists } = this.parseArtists(raw.artist);
      return {
        title: this.toSafeTitleCase(raw.track.normalize('NFC').trim()),
        artist: mainArtist,
        albumArtist: mainArtist,
        artists,
        album: raw.album ? raw.album.normalize('NFC').trim() : undefined,
        confidence: 'high',
        confidenceReason: 'Khớp dữ liệu chuẩn từ YouTube Music',
        source: 'yt-music',
      };
    }

    const normChannel = this.normalizeChannelName(raw.channel || raw.uploader);
    let rawTitle = (raw.title || '').normalize('NFC').trim();

    // 2. Loại bỏ các từ khóa rác inline
    for (const pattern of JUNK_PATTERNS) {
      rawTitle = rawTitle.replace(pattern, ' ');
    }

      // Cắt đuôi phân cách | nếu sau nó là các tag audio/kênh hiệu ứng
      rawTitle = rawTitle.replace(/\s*\|\s*(?:@?\d+\s*hz|8d|slowed|remaster|bass|audio|official).*$/i, '');

      // 3. Xử lý phân tách theo dấu Pipe `|`
      if (rawTitle.includes('|')) {
        const rawSegments = rawTitle.split('|').map((s) => s.trim()).filter(Boolean);
        const validSegments = rawSegments.filter((seg) => !isJunkSegment(seg));

        if (validSegments.length >= 2) {
          let bestArtistIdx = -1;
          let highestScore = -999;
          for (let i = 0; i < validSegments.length; i++) {
            const seg = validSegments[i];
            if (!seg) continue;
            const sc = this.scoreAsArtist(seg, normChannel);
            if (sc > highestScore) {
              highestScore = sc;
              bestArtistIdx = i;
            }
          }

            const artistPart = validSegments[bestArtistIdx];
            if (bestArtistIdx !== -1 && highestScore > 0 && artistPart) {
              const remainingSegments = validSegments.filter((_, idx) => idx !== bestArtistIdx);

              // Lọc segment cuối nếu là tag album/series (như RAPITALOVE, METUB Network)
              let albumTag: string | undefined = raw.album?.trim() || undefined;
              const candidateTitleSegments: string[] = [];

              for (let i = 0; i < remainingSegments.length; i++) {
                const seg = remainingSegments[i];
                if (!seg) continue;
                const isLast = i === remainingSegments.length - 1;
                // Nếu segment cuối ngắn (dưới 15 ký tự) hoặc ALL CAPS và không chứa dấu nối bài hát, coi là Album / Series
                if (isLast && remainingSegments.length > 1 && (seg === seg.toUpperCase() || seg.length < 15)) {
                  if (!albumTag) albumTag = seg;
                } else {
                  candidateTitleSegments.push(seg);
                }
              }

              let finalTitle = (candidateTitleSegments.length > 0 ? candidateTitleSegments : remainingSegments).join(' - ');
              finalTitle = finalTitle.replace(/\s{2,}/g, ' ').replace(/^[-–—|]\s*/, '').replace(/\s*[-–—|]$/, '').trim();

              const { mainArtist, artists } = this.parseArtists(artistPart);

              // Trích xuất ft. trong title nếu có
              const featMatch = finalTitle.match(/^(.*?)(?:\s+(?:feat\.?|ft\.?|featuring)\s+(.*))$/i);
              if (featMatch && featMatch[1] && featMatch[2]) {
                finalTitle = featMatch[1].trim();
                const extraArtists = this.parseArtists(featMatch[2].trim()).artists;
                for (const ea of extraArtists) {
                  if (!artists.includes(ea)) {
                    artists.push(ea);
                  }
                }
              }

              return {
                title: this.toSafeTitleCase(finalTitle) || 'Unknown Title',
                artist: mainArtist,
                albumArtist: mainArtist,
                artists,
                album: albumTag,
                confidence: 'high',
                confidenceReason: 'Phân tách chuẩn xác theo cấu trúc dấu phân cách |',
                source: 'regex',
              };
            }
          }
        }

        // 4. Xử lý phân tách theo dấu gạch ngang: CHỈ tách khi có khoảng trắng xung quanh (\s+[-–—]\s+)
        // Bảo vệ các từ ghép như M-TP, Spider-Man, G-Dragon, K-ICM, Jay-Z không bị cắt
        const cleanTitle = rawTitle.replace(/\s{2,}/g, ' ').replace(/^[-–—|]\s*/, '').replace(/\s*[-–—|]$/, '').trim();
        const dashParts = cleanTitle.split(/\s+[-–—]\s+/);

        if (dashParts.length === 2 && dashParts[0] && dashParts[1]) {
          const partA = dashParts[0].trim();
          const partB = dashParts[1].trim();
          const scoreA = this.scoreAsArtist(partA, normChannel);
          const scoreB = this.scoreAsArtist(partB, normChannel);

          // 4.1. Cấu trúc Title - Subtitle/Remix (Ví dụ: Xích Thêm Chút - XTC Remix)
          const isSubtitleB = /\b(?:remix|ver\.?|version|cover|acoustic|live|instrumental|beat)\b/i.test(partB);
          if (isSubtitleB && scoreA <= 0 && scoreB < -15) {
            const fallbackArtist = this.normalizeChannelName(raw.artist || raw.channel || raw.uploader);
            const { mainArtist, artists } = this.parseArtists(fallbackArtist);
            return {
              title: this.toSafeTitleCase(`${partA} (${partB})`),
              artist: mainArtist,
              albumArtist: mainArtist,
              artists,
              album: raw.album?.trim() || undefined,
              confidence: 'medium',
              confidenceReason: 'Ghép phụ đề phiên bản (Remix/Cover) và nhận diện kênh làm nghệ sĩ',
              source: 'regex',
            };
          }

          // 4.2. Cấu trúc quốc tế Artist - Title ft. Collaborator (Ví dụ: Meek Mill - Going Bad ft. Drake)
          const featMatchInB = partB.match(/^(.*?)(?:\s+(?:feat\.?|ft\.?|featuring)\s+(.*))$/i);
          if (featMatchInB && featMatchInB[1] && featMatchInB[2] && featMatchInB[1].trim() && scoreA >= 0) {
            const { mainArtist, artists } = this.parseArtists(partA);
            const finalTitle = featMatchInB[1].trim();
            const extraArtists = this.parseArtists(featMatchInB[2].trim()).artists;
            for (const ea of extraArtists) {
              if (!artists.includes(ea)) {
                artists.push(ea);
              }
            }
            return {
              title: this.toSafeTitleCase(finalTitle),
              artist: mainArtist,
              albumArtist: mainArtist,
              artists,
              album: raw.album?.trim() || undefined,
              confidence: 'high',
              confidenceReason: 'Nhận diện định dạng Artist - Title ft. Collaborator',
              source: 'regex',
            };
          }

          // 4.3. Cấu trúc Title - Artist phổ biến tại Việt Nam (Cơn Mưa Cuối - JustaTee x Binz)
          if (scoreB > scoreA) {
            const { mainArtist, artists } = this.parseArtists(partB);
            return {
              title: this.toSafeTitleCase(partA),
              artist: mainArtist,
              albumArtist: mainArtist,
              artists,
              album: raw.album?.trim() || undefined,
              confidence: 'high',
              confidenceReason: 'Nhận diện định dạng Tên bài hát - Nghệ sĩ',
              source: 'regex',
            };
          } else {
            // Dạng Artist - Title (Vũ. - Bước Qua Mùa Cô Đơn)
            const { mainArtist, artists } = this.parseArtists(partA);
            let finalTitle = partB;
            const featMatch = finalTitle.match(/^(.*?)(?:\s+(?:feat\.?|ft\.?|featuring)\s+(.*))$/i);
            if (featMatch && featMatch[1] && featMatch[2]) {
              finalTitle = featMatch[1].trim();
              const extraArtists = this.parseArtists(featMatch[2].trim()).artists;
              for (const ea of extraArtists) {
                if (!artists.includes(ea)) {
                  artists.push(ea);
                }
              }
            }
            return {
              title: this.toSafeTitleCase(finalTitle),
              artist: mainArtist,
              albumArtist: mainArtist,
              artists,
              album: raw.album?.trim() || undefined,
              confidence: 'high',
              confidenceReason: 'Nhận diện định dạng Nghệ sĩ - Tên bài hát',
              source: 'regex',
            };
          }
        }

        // 5. Fallback: Dùng tên kênh làm nghệ sĩ
        const fallbackArtist = this.normalizeChannelName(raw.artist || raw.channel || raw.uploader);
        const { mainArtist, artists } = this.parseArtists(fallbackArtist);

        let fallbackTitle = cleanTitle.replace(/\s*\|\s*.*$/, '').trim();
        const featMatch = fallbackTitle.match(/^(.*?)(?:\s+(?:feat\.?|ft\.?|featuring)\s+(.*))$/i);
        if (featMatch && featMatch[1] && featMatch[2]) {
          fallbackTitle = featMatch[1].trim();
          const extraArtists = this.parseArtists(featMatch[2].trim()).artists;
          for (const ea of extraArtists) {
            if (!artists.includes(ea)) {
              artists.push(ea);
            }
          }
        }

        return {
          title: this.toSafeTitleCase(fallbackTitle) || 'Unknown Title',
          artist: mainArtist,
          albumArtist: mainArtist,
          artists,
          album: raw.album?.trim() || undefined,
          confidence: 'medium',
          confidenceReason: 'Sử dụng tên kênh làm nghệ sĩ',
          source: 'regex',
        };
      },
    };
