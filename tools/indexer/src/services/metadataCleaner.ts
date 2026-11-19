import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function findIndexerConfigDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'config'),
    path.resolve(process.cwd(), 'tools/indexer/config'),
    path.resolve(__dirname, '../../config'),
    path.resolve(__dirname, '../config'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(process.cwd(), 'config');
}

// Tải bảng alias và aggregator channels
let artistAliasesMap: Record<string, string> = {
  'b ray': 'B Ray',
  'bray': 'B Ray',
  'son tung m-tp': 'Sơn Tùng M-TP',
  'son tung': 'Sơn Tùng M-TP',
  'young h': 'Young H',
  'young-h': 'Young H',
  'youngh': 'Young H',
  'dat g': 'Đạt G',
  'datg': 'Đạt G',
  'rum': 'Rum',
  'mr t': 'Mr T',
  'mr.t': 'Mr T',
  'mrt': 'Mr T',
  'wowy': 'Wowy',
  'jombie': 'Jombie',
  'justatee': 'JustaTee',
  'central cee': 'Central Cee',
  'nle choppa': 'NLE Choppa',
  'jack': 'Jack',
  'w-n': 'W/n',
  'w/n': 'W/n',
  'ryco': 'RYCO',
  'megashock': 'MEGASHOCK',
  'tommy teo': 'TOMMY TÈO',
};

const aggregatorChannelsSet = new Set<string>([
  '151 studio',
  'faptv',
  'g5r squad',
  'g5r',
  'evb records',
  'rv underground',
  '7clouds',
  'xmaxa music',
  'blackbi',
  'blackbi original',
  'fueled by ramen',
  'metub network',
  'yeah1 music',
  'viva music',
  'pops music',
  'warner music vietnam',
  'universal music vietnam',
  'sony music entertainment',
  'vietnam underground music',
  'rap viet underground',
  'underground viet nam',
  'v-rap official',
  'hip hop underground vn',
  'fillinus',
  'quang teo',
  'loicathay',
  'focus entertainment',
  'a colors show',
  'rap nha lam',
  'homie boiz official',
  'mv official',
  'rapitalove',
  'westside squad',
  'chillsongs',
  'gmc',
  'cofm',
  'viet underground',
]);

try {
  const cfgDir = findIndexerConfigDir();
  const aliasPath = path.join(cfgDir, 'artistAliases.json');
  if (fs.existsSync(aliasPath)) {
    const raw = JSON.parse(fs.readFileSync(aliasPath, 'utf-8'));
    artistAliasesMap = { ...artistAliasesMap, ...raw };
  }
  const aggPath = path.join(cfgDir, 'aggregatorChannels.json');
  if (fs.existsSync(aggPath)) {
    const raw = JSON.parse(fs.readFileSync(aggPath, 'utf-8'));
    if (Array.isArray(raw.exactChannels)) {
      for (const ch of raw.exactChannels) {
        aggregatorChannelsSet.add(normalizeToken(ch));
      }
    }
  }
} catch {
  // dùng mặc định in-memory
}

function normalizeToken(text?: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

// Các từ khóa rác phổ biến trong tiêu đề YouTube / MV / Audio
const JUNK_PATTERNS = [
  /\[\s*(?:official\s+)?(?:music\s+)?(?:video|mv|audio|lyric\s+video|lyric|lyrics|visualizer|hd|4k|remastered)\s*\]/gi,
  /\(\s*(?:official\s+)?(?:music\s+)?(?:video|mv|audio|lyric\s+video|lyric|lyrics|visualizer|hd|4k|remastered)\s*\)/gi,
  /【\s*(?:official\s+)?(?:music\s+)?(?:video|mv|audio|lyric\s+video)\s*】/gi,
  /\|\s*(?:official\s+)?(?:mv|music\s+video|audio|lyrics?|lyric\s+video)\s*(?=\||$)/gi,
  /\|\s*(?:@?\d+\s*hz|8d(?:\s*audio)?|slowed(?:\s*\+\s*reverb)?|bass\s*boosted|nightcore|speed\s*up|pitched|remaster(?:ed)?|instrumental|karaoke).*$/gi,
  // Cắt hậu tố video rác không có ngoặc ở cuối
  /(?:\s+[-–—|]\s*|\s+)(?:official\s+)?(?:music\s+)?(?:video|mv|audio|lyric\s+video|visualizer|hd|4k)\s*$/gi,
  // Cắt năm kèm rác dạng "- 2015 [Video Lyrics]" hoặc "- 2021"
  /(?:\s+[-–—]\s*)\d{4}\s*(?:\[[^\]]*\]|\([^)]*\))?\s*$/gi,
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
   * Chuẩn hóa tên nghệ sĩ theo bảng artistAliases
   */
  canonicalizeArtist(artistName: string): string {
    if (!artistName) return 'Unknown Artist';
    const trimmed = artistName.normalize('NFC').trim();
    const token = normalizeToken(trimmed);
    const lower = trimmed.toLowerCase();

    // 1. Khớp chính xác lowercase hoặc token
    if (artistAliasesMap[lower]) return artistAliasesMap[lower];
    if (artistAliasesMap[token]) return artistAliasesMap[token];

    // 2. Tra cứu case-insensitive
    for (const [k, v] of Object.entries(artistAliasesMap)) {
      if (k.toLowerCase() === lower || normalizeToken(k) === token) {
        return v;
      }
    }

    return trimmed;
  },

  /**
   * Kiểm tra kênh có phải là kênh phân phối / tổng hợp (Aggregator) không
   */
  isAggregatorChannel(channelName?: string): boolean {
    if (!channelName) return false;
    const token = normalizeToken(channelName);
    if (aggregatorChannelsSet.has(token)) return true;

    for (const exact of aggregatorChannelsSet) {
      if (token === exact || token.includes(exact) || exact.includes(token)) {
        return true;
      }
    }

    // Heuristics từ khóa
    const heuristics = ['records', 'entertainment', 'network', 'underground', 'studio'];
    for (const h of heuristics) {
      if (token.includes(h)) return true;
    }

    return false;
  },

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

    // 3. Cắt Official Channel / Official / Channel
    clean = clean.replace(/\s+(?:Official(?:\s+Channel)?|Channel)$/i, '').trim();

    return this.canonicalizeArtist(clean) || 'Unknown Artist';
  },

  /**
   * Chuyển chuỗi ALL CAPS sang Title Case an toàn cho tiếng Việt,
   * giữ nguyên phần (ft. X) nếu có
   */
  toSafeTitleCase(str: string): string {
    if (!str) return '';
    const trimmed = str.trim();

    // Bảo tồn phần (ft. ...) không bị lowercase tên nghệ sĩ
    const ftMatch = trimmed.match(/^(.*?)\s*(\(ft\.[^)]+\))\s*$/i);
    if (ftMatch && ftMatch[1] && ftMatch[2]) {
      const basePart = ftMatch[1].trim();
      const ftPart = ftMatch[2].trim();
      return `${this.toSafeTitleCase(basePart)} ${ftPart}`;
    }

    const isAllUpper = trimmed === trimmed.toUpperCase() && trimmed !== trimmed.toLowerCase() && trimmed.length > 3;
    if (!isAllUpper) return trimmed;

    return trimmed
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  },

  /**
   * Chuẩn hóa định dạng nghệ sĩ hợp tác về chuẩn (ft. X)
   */
  normalizeFeaturedFormat(title: string): string {
    if (!title) return '';
    let result = title.normalize('NFC');

    // Chuyển [ft. X] hoặc [feat. X] -> (ft. X)
    result = result.replace(/\[\s*(?:feat\.?|ft\.?|featuring)\s+([^\]]+)\]/gi, '(ft. $1)');

    // Chuyển (feat. X) hoặc (Feat. X) hoặc (ft X) -> (ft. X)
    result = result.replace(/\(\s*(?:feat\.?|featuring)\s+([^)]+)\)/gi, '(ft. $1)');
    result = result.replace(/\(\s*ft\.?\s+([^)]+)\)/gi, (m, artistPart) => {
      return `(ft. ${artistPart.trim()})`;
    });

    // Chuyển ft. X ở cuối không có ngoặc -> (ft. X)
    result = result.replace(/(?:\s+[-–—]\s*|\s+)(?:feat\.?|ft\.?|featuring)\s+([^()[\]]+)$/i, ' (ft. $1)');

    return result.trim();
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

    // Loại bỏ (ft. ...) nếu còn sót trong tên nghệ sĩ
    cleanStr = cleanStr.replace(/\s*[([](?:ft\.?|feat\.?|featuring)[^)\]]*[)\]]/gi, '').trim();

    const tokens = cleanStr
      .split(/(?:\s+(?:feat\.?|ft\.?|featuring)\s+)|(?:\s+[xX&]\s+)|(?:\s*,\s*)/i)
      .map((a) => this.canonicalizeArtist(a.trim().replace(/^[@#]/, '')))
      .filter(Boolean);

    if (tokens.length === 0) {
      const fallback = this.canonicalizeArtist(cleanStr) || 'Unknown Artist';
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
    const token = normalizeToken(trimmed);
    const normChanLower = (normalizedChannel || '').toLowerCase();

      // 0. Nếu trùng với artist alias đã biết -> cộng điểm rất cao
      if (artistAliasesMap[lower] || artistAliasesMap[token]) {
        score += 35;
      }

      // 1. Trùng hoặc chứa tên kênh chính thức (nếu không phải aggregator)
      if (normChanLower && normChanLower !== 'unknown artist' && !this.isAggregatorChannel(normalizedChannel)) {
        if (lower === normChanLower) score += 25;
        else if (lower.includes(normChanLower) || normChanLower.includes(lower)) score += 15;
      }

      // 2. Chứa từ nối đa nghệ sĩ
      if (/\b(?:feat\.?|ft\.?|featuring)\b/i.test(trimmed)) score += 12;
      if (/\s+[xX&]\s+/.test(trimmed)) score += 10;
      if (/\b(?:prod(?:\.|\s+by)?)\b/i.test(trimmed)) score += 4;

      // 3. Tên chứa các từ khóa đặc trưng nghệ sĩ Hip-hop / Rap
      if (/\b(?:yung|young|mc|dj|lil|big)\b/i.test(lower)) score += 10;

      // 4. Trừ điểm nặng nếu chứa từ khóa bài hát / phiên bản
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
        const cleanTitle = this.normalizeFeaturedFormat(
          this.toSafeTitleCase(raw.track.normalize('NFC').trim())
        );
        return {
          title: cleanTitle,
          artist: this.canonicalizeArtist(mainArtist),
          albumArtist: this.canonicalizeArtist(mainArtist),
          artists: artists.map((a) => this.canonicalizeArtist(a)),
          album: raw.album ? raw.album.normalize('NFC').trim() : undefined,
          confidence: 'high',
          confidenceReason: 'Khớp dữ liệu chuẩn từ YouTube Music',
          source: 'yt-music',
        };
      }

      const isAggregator = this.isAggregatorChannel(raw.channel || raw.uploader);
      const normChannel = isAggregator ? '' : this.normalizeChannelName(raw.channel || raw.uploader);
      let rawTitle = (raw.title || '').normalize('NFC').trim();

      // 2. Tiền xử lý dọn rác cơ bản
      // Loại bỏ dấu ngoặc vuông prefix như [CHO BẢO], [ALBUM 2020]
      let albumPrefix: string | undefined = undefined;
      const albumPrefixMatch = rawTitle.match(/^\[([A-Z0-9\s_À-Ỹà-ỹ]{2,20})\]\s*/i);
      if (albumPrefixMatch && albumPrefixMatch[1]) {
        const tag = albumPrefixMatch[1].trim();
        if (!isJunkSegment(tag)) {
          albumPrefix = tag;
        }
        rawTitle = rawTitle.slice(albumPrefixMatch[0].length).trim();
      }

      // Loại bỏ số thứ tự track ở đầu: "03. ", "03 - ", "3. "
      rawTitle = rawTitle.replace(/^\d{1,2}[.-]\s+/, '').trim();

      // Loại bỏ các mẫu từ khóa rác inline
      for (const pattern of JUNK_PATTERNS) {
        rawTitle = rawTitle.replace(pattern, ' ');
      }

      // Dọn các dấu ngoặc kép bọc chữ như "VIỆT" -> VIỆT
      rawTitle = rawTitle.replace(/["“”«»]/g, '');

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

                  let albumTag: string | undefined = raw.album?.trim() || albumPrefix || undefined;
                  const candidateTitleSegments: string[] = [];

                  for (let i = 0; i < remainingSegments.length; i++) {
                    const seg = remainingSegments[i];
                    if (!seg) continue;
                      const isLast = i === remainingSegments.length - 1;
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

                        finalTitle = this.normalizeFeaturedFormat(finalTitle);

                        return {
                          title: this.toSafeTitleCase(finalTitle) || 'Unknown Title',
                          artist: this.canonicalizeArtist(mainArtist),
                          albumArtist: this.canonicalizeArtist(mainArtist),
                          artists: artists.map((a) => this.canonicalizeArtist(a)),
                          album: albumTag,
                          confidence: 'high',
                          confidenceReason: 'Phân tách chuẩn xác theo cấu trúc dấu phân cách |',
                          source: 'regex',
                        };
                      }
                    }
                  }

                  // 4. Xử lý phân tách theo dấu gạch ngang (\s+[-–—]\s+)
                  const cleanTitle = rawTitle.replace(/\s{2,}/g, ' ').replace(/^[-–—|]\s*/, '').replace(/\s*[-–—|]$/, '').trim();
                  const dashParts = cleanTitle.split(/\s+[-–—]\s+/);

                  if (dashParts.length >= 2) {
                    // Lọc bỏ các segment không phải artist/title (như năm "2015", "Prod. Masew")
                    const validDashParts = dashParts.filter((p) => {
                      const tr = p.trim();
                      if (/^\d{4}$/.test(tr)) return false;
                      if (/^prod(?:\.|\s+by)/i.test(tr)) return false;
                      return true;
                    });

                    if (validDashParts.length === 2 && validDashParts[0] && validDashParts[1]) {
                      const partA = validDashParts[0].trim();
                      const partB = validDashParts[1].trim();
                      const scoreA = this.scoreAsArtist(partA, normChannel);
                      const scoreB = this.scoreAsArtist(partB, normChannel);

                      // 4.1. Cấu trúc Subtitle/Remix
                      const isSubtitleB = /\b(?:remix|ver\.?|version|cover|acoustic|live|instrumental|beat)\b/i.test(partB);
                      if (isSubtitleB && scoreA <= 0 && scoreB < -15) {
                        const fallbackArtist = normChannel || this.normalizeChannelName(raw.artist || raw.channel || raw.uploader);
                        const { mainArtist, artists } = this.parseArtists(fallbackArtist);
                        return {
                          title: this.normalizeFeaturedFormat(this.toSafeTitleCase(`${partA} (${partB})`)),
                          artist: this.canonicalizeArtist(mainArtist),
                          albumArtist: this.canonicalizeArtist(mainArtist),
                          artists: artists.map((a) => this.canonicalizeArtist(a)),
                          album: raw.album?.trim() || albumPrefix || undefined,
                          confidence: 'medium',
                          confidenceReason: 'Ghép phụ đề phiên bản (Remix/Cover) và nhận diện kênh làm nghệ sĩ',
                          source: 'regex',
                        };
                      }

                      // 4.2. Cấu trúc quốc tế Artist - Title ft. Collaborator
                      const featMatchInB = partB.match(/^(.*?)(?:\s+(?:feat\.?|ft\.?|featuring)\s+(.*))$/i);
                      if (featMatchInB && featMatchInB[1] && featMatchInB[2] && featMatchInB[1].trim() && scoreA >= 0) {
                        const { mainArtist, artists } = this.parseArtists(partA);
                        let finalTitle = featMatchInB[1].trim();
                        const extraArtists = this.parseArtists(featMatchInB[2].trim()).artists;
                        for (const ea of extraArtists) {
                          if (!artists.includes(ea)) {
                            artists.push(ea);
                          }
                        }
                        finalTitle = this.normalizeFeaturedFormat(`${finalTitle} (ft. ${featMatchInB[2].trim()})`);

                        return {
                          title: this.toSafeTitleCase(finalTitle),
                          artist: this.canonicalizeArtist(mainArtist),
                          albumArtist: this.canonicalizeArtist(mainArtist),
                          artists: artists.map((a) => this.canonicalizeArtist(a)),
                          album: raw.album?.trim() || albumPrefix || undefined,
                          confidence: 'high',
                          confidenceReason: 'Nhận diện định dạng Artist - Title ft. Collaborator',
                          source: 'regex',
                        };
                      }

                      // 4.3. Cấu trúc Title - Artist phổ biến tại Việt Nam
                      if (scoreB > scoreA) {
                        // Kiểm tra xem partB có chứa ft. trong ngoặc không (ví dụ "B Ray (ft. Đạt G)")
                        let artistCandidate = partB;
                        let extraFeatFromArtist = '';
                        const ftInArtistMatch = partB.match(/^(.*?)\s*[([](?:ft\.?|feat\.?|featuring)\s+([^\])]+)[)\]]$/i);
                        if (ftInArtistMatch && ftInArtistMatch[1] && ftInArtistMatch[2]) {
                          artistCandidate = ftInArtistMatch[1].trim();
                          extraFeatFromArtist = ftInArtistMatch[2].trim();
                        }

                          const { mainArtist, artists } = this.parseArtists(artistCandidate);
                          let finalTitle = partA;

                            // Nếu có ft từ artistPart, ghép vào title
                            if (extraFeatFromArtist) {
                              finalTitle = `${finalTitle} (ft. ${extraFeatFromArtist})`;
                              const extraArtists = this.parseArtists(extraFeatFromArtist).artists;
                              for (const ea of extraArtists) {
                                if (!artists.includes(ea)) {
                                  artists.push(ea);
                                }
                              }
                            }

                              // Xử lý nếu partA có ft.
                              const featMatch = finalTitle.match(/^(.*?)(?:\s+(?:feat\.?|ft\.?|featuring)\s+(.*))$/i);
                              if (featMatch && featMatch[1] && featMatch[2]) {
                                finalTitle = featMatch[1].trim();
                                const extraArtists = this.parseArtists(featMatch[2].trim()).artists;
                                for (const ea of extraArtists) {
                                  if (!artists.includes(ea)) {
                                    artists.push(ea);
                                  }
                                }
                                finalTitle = `${finalTitle} (ft. ${featMatch[2].trim()})`;
                              }

                                    finalTitle = this.normalizeFeaturedFormat(finalTitle);

                                    return {
                                      title: this.toSafeTitleCase(finalTitle),
                                      artist: this.canonicalizeArtist(mainArtist),
                                      albumArtist: this.canonicalizeArtist(mainArtist),
                                      artists: artists.map((a) => this.canonicalizeArtist(a)),
                                      album: raw.album?.trim() || albumPrefix || undefined,
                                      confidence: 'high',
                                      confidenceReason: 'Nhận diện định dạng Tên bài hát - Nghệ sĩ',
                                      source: 'regex',
                                    };
                                  } else {
                                  // Dạng Artist - Title
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
                                    finalTitle = `${finalTitle} (ft. ${featMatch[2].trim()})`;
                                  }

                                  finalTitle = this.normalizeFeaturedFormat(finalTitle);

                                  return {
                                    title: this.toSafeTitleCase(finalTitle),
                                    artist: this.canonicalizeArtist(mainArtist),
                                    albumArtist: this.canonicalizeArtist(mainArtist),
                                    artists: artists.map((a) => this.canonicalizeArtist(a)),
                                    album: raw.album?.trim() || albumPrefix || undefined,
                                    confidence: 'high',
                                    confidenceReason: 'Nhận diện định dạng Nghệ sĩ - Tên bài hát',
                                    source: 'regex',
                                  };
                                }
                              }
                            }

                            // 5. Fallback: Dùng tên kênh làm nghệ sĩ nếu không phải aggregator
                            const fallbackArtist = normChannel || 'Unknown Artist';
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
                                fallbackTitle = `${fallbackTitle} (ft. ${featMatch[2].trim()})`;
                              }

                            fallbackTitle = this.normalizeFeaturedFormat(fallbackTitle);

                            return {
                              title: this.toSafeTitleCase(fallbackTitle) || 'Unknown Title',
                              artist: this.canonicalizeArtist(mainArtist),
                              albumArtist: this.canonicalizeArtist(mainArtist),
                              artists: artists.map((a) => this.canonicalizeArtist(a)),
                              album: raw.album?.trim() || albumPrefix || undefined,
                              confidence: 'medium',
                              confidenceReason: 'Sử dụng tên kênh làm nghệ sĩ',
                              source: 'regex',
                            };
                          },
                        };
