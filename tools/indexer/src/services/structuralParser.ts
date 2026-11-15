import fs from 'fs';
import path from 'path';
import {
  findIndexerConfigDir,
  normalizeSearchToken,
  stripSpaces,
  type ChannelClassifier,
  defaultChannelClassifier,
} from './channelClassifier';
import {
  type KnownArtistsService,
  defaultKnownArtistsService,
} from './knownArtistsService';

export interface ScoringWeights {
  channelExactMatch: number;
  knownArtistMatch: number;
  collabPatternMatch: number;
  songKeywordPenalty: number;
  trackNumberPenalty: number;
  albumKeywordPenalty: number;
}

export interface ScoringThresholds {
  minScoreDelta: number;
  confidenceHighMargin: number;
  confidenceMediumMargin: number;
}

export interface ScoringConfig {
  weights: ScoringWeights;
  thresholds: ScoringThresholds;
}

export interface ParsedStructureResult {
  title: string;
  artist: string;
  album?: string;
  trackNumber?: number;
  collaborators: string[];
  scoreA: number;
  scoreB: number;
  scoreDelta: number;
  orientation: 'left_is_artist' | 'right_is_artist' | 'single_candidate';
  confidence: 'high' | 'medium' | 'low';
  confidenceReason: string;
  source: 'layer3';
  pipelineVersion: string;
}

const DEFAULT_CONFIG: ScoringConfig = {
  weights: {
    channelExactMatch: 30,
    knownArtistMatch: 50,
    collabPatternMatch: 20,
    songKeywordPenalty: -40,
    trackNumberPenalty: -30,
    albumKeywordPenalty: -25,
  },
  thresholds: {
    minScoreDelta: 15,
    confidenceHighMargin: 35,
    confidenceMediumMargin: 15,
  },
};

const SONG_KEYWORDS = [
  'remix',
  'rmx',
  'cover',
  'live',
  'acoustic',
  'version',
  'ver',
  'ost',
  'mv',
  'm/v',
  'video',
  'visualizer',
  'karaoke',
  'slowed',
  'reverb',
  'audio',
  'sped up',
  'speed up',
  'mashup',
  'clean',
];

const JUNK_INLINE_PATTERNS = [
  /\[\s*(?:video\s*\+\s*)?(?:official\s+)?(?:visual\s+)?(?:music\s+)?(?:video|mv|audio|visualizer|lyric\s*kara|lyric\s*video|lyric|lyrics|karaoke|hd|4k|movie)[^\]]*\]/gi,
  /\(\s*(?:video\s*\+\s*)?(?:official\s+)?(?:visual\s+)?(?:music\s+)?(?:video|mv|audio|visualizer|lyric\s*kara|lyric\s*video|lyric|lyrics|karaoke|hd|4k|movie)[^)]*\)/gi,
  /【\s*(?:official\s+)?(?:music\s+)?(?:video|mv|audio|lyric\s*video)[^】]*】/gi,
  /\|\s*(?:official\s+)?(?:mv|music\s+video|audio|lyrics?|lyric\s*video|visualizer)[^|]*$/gi,
  /\s*\*[^*]*official[^*]*\*\s*/gi,
  /\s*#\w+/g,
];

/**
 * Tự động sửa chữa các cặp ngoặc đơn / ngoặc vuông bị thiếu ngoặc đóng hoặc ngoặc đóng mồ côi
 * Ví dụ: "YN1 pt.2 (ft. yugaki" -> "YN1 pt.2 (ft. yugaki)"
 * "B Ray)" -> "B Ray"
 */
export function balanceBrackets(text: string): string {
  let res = text.trim();
  const openParens = (res.match(/\(/g) || []).length;
  const closeParens = (res.match(/\)/g) || []).length;
  if (closeParens > openParens) {
    const diff = closeParens - openParens;
    for (let i = 0; i < diff; i++) {
      res = res.replace(/\)$/, '').trim();
    }
  } else if (openParens > closeParens) {
    res = res + ')'.repeat(openParens - closeParens);
  }

  const openBrackets = (res.match(/\[/g) || []).length;
  const closeBrackets = (res.match(/\]/g) || []).length;
  if (closeBrackets > openBrackets) {
    const diff = closeBrackets - openBrackets;
    for (let i = 0; i < diff; i++) {
      res = res.replace(/\]$/, '').trim();
    }
  } else if (openBrackets > closeBrackets) {
    res = res + ']'.repeat(openBrackets - closeBrackets);
  }

  return res;
}

/**
 * Chuyển chuỗi ALL CAPS sang Title Case thông minh cho tiếng Việt
 */
export function toSmartTitleCase(str: string): string {
  if (!str) return '';
  const trimmed = str.trim();
  const isAllUpper = trimmed === trimmed.toUpperCase() && trimmed !== trimmed.toLowerCase() && trimmed.length > 3;
  if (!isAllUpper) return trimmed;

  return trimmed
    .toLowerCase()
    .split(' ')
    .map((word) => {
      // Giữ nguyên các chữ viết tắt đặc thù nếu cần
      if (['ft', 'mv', 'rmx', 'ep'].includes(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export class StructuralParser {
  private config: ScoringConfig;

  constructor(configDir?: string, customConfig?: Partial<ScoringConfig>) {
    const dir = findIndexerConfigDir(configDir);
    const cfgPath = path.join(dir, 'entityScoringConfig.json');

    try {
      if (fs.existsSync(cfgPath)) {
        const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
        this.config = {
          weights: { ...DEFAULT_CONFIG.weights, ...raw.weights },
          thresholds: { ...DEFAULT_CONFIG.thresholds, ...raw.thresholds },
        };
      } else {
        this.config = DEFAULT_CONFIG;
      }
    } catch {
      this.config = DEFAULT_CONFIG;
    }

    if (customConfig) {
      if (customConfig.weights) {
        this.config.weights = { ...this.config.weights, ...customConfig.weights };
      }
      if (customConfig.thresholds) {
        this.config.thresholds = { ...this.config.thresholds, ...customConfig.thresholds };
      }
    }
  }

  /**
   * Bóc tách Nhãn Album / Mixtape và Số thứ tự bài (Track No)
   */
  extractAlbumAndTrackNo(text: string): {
    cleanedText: string;
    album?: string;
    trackNumber?: number;
  } {
    let s = text.trim();
    let album: string | undefined;
    let trackNumber: number | undefined;

    // 1. Dạng tiền tố: [CHO BẢO] 02. hoặc [UNhiddenGem Mixtape] 4. hoặc [2G17]
    const prefixAlbumMatch = s.match(
      /^\[(.*?(?:Mixtape|Album|EP|2G\d+|CHO\s+BẢO|Rapitalove).*?)\]\s*(?:(\d+)[.:\s-]+)?/i
    );
    if (prefixAlbumMatch) {
      const rawAlbum = prefixAlbumMatch[1] || '';
      album = rawAlbum.replace(/\s*Mixtape$/i, '').trim() || rawAlbum.trim();
      if (prefixAlbumMatch[2]) {
        trackNumber = parseInt(prefixAlbumMatch[2], 10);
      }
      s = s.slice(prefixAlbumMatch[0].length).trim();
    }

    // 2. Dạng hậu tố hoặc giữa: Album "Ác Mộng Đẹp" hoặc EP 'Dữ Liệu Quý'
    if (!album) {
      const explicitAlbumMatch = s.match(/(?:Album|EP)\s*["']([^"']+)["']/i);
      if (explicitAlbumMatch && explicitAlbumMatch[1]) {
        album = explicitAlbumMatch[1].trim();
        s = s
          .replace(explicitAlbumMatch[0], '')
          .replace(/\|\s*\|/g, '|')
          .replace(/^[-|:\s]+|[-|:\s]+$/g, '')
          .trim();
      }
    }

    // 3. Dạng số thứ tự đơn thuần đầu bài: "02. Tên Bài" hoặc "4. Tên Bài" (yêu cầu dấu chấm, hai chấm hoặc gạch nối)
    if (trackNumber === undefined) {
      const trackNoMatch = s.match(/^(\d{1,2})[.:-]\s*([^\d].*)$/);
      if (trackNoMatch && trackNoMatch[1] && trackNoMatch[2]) {
        trackNumber = parseInt(trackNoMatch[1], 10);
        s = trackNoMatch[2].trim();
      }
    }

    // 4. Dạng Chapter: Chapter 3: Đẹp -> Tên bài = Đẹp (Chapter 3)
    const chapterMatch = s.match(/Chapter\s*(\d+)[\s:]+(.*)/i);
    if (chapterMatch && chapterMatch[1] && chapterMatch[2]) {
      s = `${chapterMatch[2].trim()} (Chapter ${chapterMatch[1]})`;
    }

    return { cleanedText: s, album, trackNumber };
  }

  /**
   * Bóc tách thông tin sản xuất (Prod. by ...) ra khỏi chuỗi
   */
  stripProductionInfo(text: string): { cleanedText: string; producer?: string } {
    let s = text;
    let producer: string | undefined;

    // Pattern: (Prod. by Mikeezy) hoặc (Prod by Hổ) hoặc [Prod. Duckie] hoặc ( Prod. Duckie )
    const prodRegex = /\s*[([]\s*(?:prod(?:[\s.]*by|[\s.]*be)?)\s*([^)\].]+)(?:\.|\s*)?[)\]]/i;
    const match = s.match(prodRegex);
    if (match && match[1]) {
      let p = match[1].trim();
      if (p.toLowerCase().startsWith('by ')) {
        p = p.slice(3).trim();
      }
      producer = p;
      s = s.replace(match[0], ' ').trim();
    } else {
      // Dạng inline không ngoặc: " - Prod. Ducnn"
      const inlineProdMatch = s.match(/\s*[-|]\s*Prod(?:\.|\s*by|\.\s*by)?\s+([^\s\-|]+)/i);
      if (inlineProdMatch && inlineProdMatch[1]) {
        let p = inlineProdMatch[1].trim();
        if (p.toLowerCase().startsWith('by ')) {
          p = p.slice(3).trim();
        }
        producer = p;
        s = s.replace(inlineProdMatch[0], ' ').trim();
      }
    }

    return { cleanedText: s.replace(/\s+/g, ' ').trim(), producer };
  }

  /**
   * Bóc tách nghệ sĩ hợp tác (feat./ft.) và chuẩn hóa thành (feat. ...)
   */
  extractCollaborators(text: string): {
    mainTitleOrArtist: string;
    collaborators: string[];
    formattedFeatSuffix: string;
  } {
    let s = text;
    const collaborators: string[] = [];

    // 1. Bóc tách dạng trong ngoặc: (ft. Hazel) hoặc (feat. Mai Xuân Thứ)
    const bracketFeatRegex = /\s*[([](?:feat\.?|ft\.?|featuring)\s+([^\])]+)[)\]]/gi;
    let bMatch: RegExpExecArray | null;
    while ((bMatch = bracketFeatRegex.exec(s)) !== null) {
      if (bMatch[1]) {
        const parts = bMatch[1].split(/[,&]|\s+and\s+|\s+[xX]\s+/i).map((p) => p.trim()).filter(Boolean);
        collaborators.push(...parts);
      }
    }
    s = s.replace(bracketFeatRegex, ' ').trim();

    // 2. Bóc tách dạng không ngoặc: " ft. Young-H" hoặc " Ft.MANBO", không ngắt ở tên có dấu gạch ngang như K-ICM
    const inlineFeatRegex = /(?:\s+|^|[([])(?:feat\.?|ft\.?|featuring)\s*([^([|]+?)(?=\s+-\s+|$|[)\]([|])/gi;
    let iMatch: RegExpExecArray | null;
    while ((iMatch = inlineFeatRegex.exec(s)) !== null) {
      if (iMatch[1]) {
        const parts = iMatch[1].split(/[,&]|\s+and\s+|\s+[xX]\s+/i).map((p) => p.trim()).filter(Boolean);
        collaborators.push(...parts);
      }
    }
    s = s.replace(inlineFeatRegex, ' ').trim();

    const uniqueCollabs = Array.from(new Set(collaborators.map((c) => c.trim()))).filter(Boolean);
    const formattedFeatSuffix = uniqueCollabs.length > 0 ? ` (feat. ${uniqueCollabs.join(' & ')})` : '';

    return {
      mainTitleOrArtist: s.replace(/\s+/g, ' ').trim(),
      collaborators: uniqueCollabs,
      formattedFeatSuffix,
    };
  }

  /**
   * Dọn dẹp các từ khóa rác video/lyric inline
   */
  cleanJunkTokens(text: string): string {
    let s = text;
    for (const pat of JUNK_INLINE_PATTERNS) {
      s = s.replace(pat, ' ');
    }
    return s
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/\[\s+/g, '[')
      .replace(/\s+\]/g, ']')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Chấm điểm khả năng một phân đoạn là Tên Nghệ sĩ (Artist Score)
   */
  scoreAsArtist(
    candidate: string,
    channelName?: string,
    channelClassifier: ChannelClassifier = defaultChannelClassifier,
    knownArtistsService: KnownArtistsService = defaultKnownArtistsService
  ): { score: number; signals: string[] } {
    let score = 0;
    const signals: string[] = [];
    const trimmed = candidate.trim();
    if (!trimmed) return { score: -100, signals: ['empty'] };

    const token = normalizeSearchToken(trimmed);
    const compact = stripSpaces(trimmed);

    // 1. Phạt cực nặng nếu phân đoạn trùng tên kênh Aggregator / Hãng đĩa
    if (channelClassifier.isAggregatorChannel(trimmed)) {
      score += this.config.weights.songKeywordPenalty * 2; // -80
      signals.push('is_aggregator_channel_penalty');
      return { score, signals };
    }

    // 2. Khớp với danh bạ nghệ sĩ đã biết (+50 điểm)
    const knownMatch = knownArtistsService.matchArtist(trimmed);
    if (knownMatch.matched) {
      score += this.config.weights.knownArtistMatch;
      signals.push(`known_artist_match_${knownMatch.canonicalName}`);
    }

    // 3. Khớp chính xác hoặc gần đúng với tên kênh cá nhân uploader (+30 điểm)
    if (channelName && !channelClassifier.isAggregatorChannel(channelName)) {
      const cleanChan = channelClassifier.normalizeChannelName(channelName);
      const chanToken = normalizeSearchToken(cleanChan);
      const chanCompact = stripSpaces(cleanChan);

      if (token === chanToken && token.length >= 2) {
        score += this.config.weights.channelExactMatch;
        signals.push('channel_exact_match');
      } else if (
        chanCompact.length >= 4 &&
        compact.length >= 4 &&
        (chanCompact.includes(compact) || compact.includes(chanCompact))
      ) {
        score += Math.round(this.config.weights.channelExactMatch * 0.7); // +21
        signals.push('channel_compact_contain');
      }
    }

    // 4. Có mẫu kết hợp hợp tác (collab: feat., ft., x, &) (+20 điểm)
    if (/\b(?:feat\.?|ft\.?|featuring)\b/i.test(trimmed) || /\s+[xX&]\s+/.test(trimmed)) {
      score += this.config.weights.collabPatternMatch;
      signals.push('collab_pattern');
    }

    // 5. Phạt điểm nếu chứa từ khóa đặc trưng của Bài hát (-40 điểm)
    const lower = trimmed.toLowerCase();
    for (const kw of SONG_KEYWORDS) {
      const regex = new RegExp(`(?:^|\\s|\\[|\\()${kw}(?:$|\\s|\\]|\\))`, 'i');
      if (regex.test(lower)) {
        score += this.config.weights.songKeywordPenalty;
        signals.push(`song_keyword_${kw}`);
        break;
      }
    }

    // 6. Phạt điểm nếu bắt đầu bằng số thứ tự bài (-30 điểm)
    if (/^\d{1,2}[.:\s-]/.test(trimmed)) {
      score += this.config.weights.trackNumberPenalty;
      signals.push('track_number_penalty');
    }

    // 7. Phạt điểm nếu chứa từ khóa Album/Mixtape (-25 điểm)
    if (/\b(?:album|mixtape|ep|chapter)\b/i.test(lower)) {
      score += this.config.weights.albumKeywordPenalty;
      signals.push('album_keyword_penalty');
    }

    return { score, signals };
  }

  /**
   * Tầng 3: Phân tích cấu trúc phân đoạn và giải quyết thực thể âm nhạc
   */
  parse(
    raw: { title: string; channel?: string; uploader?: string; album?: string },
    channelClassifier: ChannelClassifier = defaultChannelClassifier,
    knownArtistsService: KnownArtistsService = defaultKnownArtistsService
  ): ParsedStructureResult {
    // 1. Tự động cân bằng ngoặc
    let processedTitle = balanceBrackets(raw.title || '');

    // 2. Bóc tách thông tin Album / Mixtape và Số thứ tự bài
    const albumRes = this.extractAlbumAndTrackNo(processedTitle);
    processedTitle = albumRes.cleanedText;
    const extractedAlbum = albumRes.album || raw.album;
    const extractedTrackNo = albumRes.trackNumber;

    // 3. Dọn dẹp rác video/lyric inline
    processedTitle = this.cleanJunkTokens(processedTitle);

    // 4. Bóc tách thông tin sản xuất (Producer)
    const prodRes = this.stripProductionInfo(processedTitle);
    processedTitle = prodRes.cleanedText;

    const channel = raw.channel || raw.uploader || '';

    // 5. Tách phân đoạn ứng viên (theo ' - ' hoặc ' | ')
    let candidateLeft: string;
    let candidateRight = '';

    if (processedTitle.includes(' - ')) {
      const parts = processedTitle.split(' - ').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 3) {
        // Trường hợp nhiều gạch nối: "1NG - 2CAN - DICK - Ai Đưa Em Về..."
        // Cụm cuối cùng thường là Tên bài, các cụm trước là Nghệ sĩ hợp tác
        candidateLeft = parts.slice(0, parts.length - 1).join(', ');
        candidateRight = parts[parts.length - 1] || '';
      } else {
        candidateLeft = parts[0] || '';
        candidateRight = parts[1] || '';
      }
    } else if (processedTitle.includes(' | ')) {
      const parts = processedTitle.split(' | ').map((p) => p.trim()).filter(Boolean);
      candidateLeft = parts[0] || '';
      candidateRight = parts[1] || '';
    } else {
      candidateLeft = processedTitle;
    }

    candidateLeft = balanceBrackets(candidateLeft);
    if (candidateRight) {
      candidateRight = balanceBrackets(candidateRight);
    }

    // 6. Tính điểm ngữ nghĩa của 2 ứng viên Left & Right
    const scoreResLeft = this.scoreAsArtist(candidateLeft, channel, channelClassifier, knownArtistsService);
    const scoreResRight = this.scoreAsArtist(candidateRight, channel, channelClassifier, knownArtistsService);

    const scoreA = scoreResLeft.score;
    const scoreB = scoreResRight.score;
    const scoreDelta = Math.abs(scoreA - scoreB);

    let mainArtistCandidate: string;
    let songTitleCandidate: string;
    let orientation: ParsedStructureResult['orientation'] = 'single_candidate';

    if (candidateLeft && candidateRight) {
      if (scoreA >= scoreB) {
        orientation = 'left_is_artist';
        mainArtistCandidate = candidateLeft;
        songTitleCandidate = candidateRight;
      } else {
        orientation = 'right_is_artist';
        mainArtistCandidate = candidateRight;
        songTitleCandidate = candidateLeft;
      }
    } else {
      mainArtistCandidate = channelClassifier.normalizeChannelName(channel) || 'Unknown Artist';
      songTitleCandidate = candidateLeft || 'Unknown Title';
    }

    // 7. Bóc tách và chuyển đổi Featuring sang đuôi tiêu đề bài hát
    const featArtistRes = this.extractCollaborators(mainArtistCandidate);
    const featTitleRes = this.extractCollaborators(songTitleCandidate);

    const allCollabs = Array.from(
      new Set([...featArtistRes.collaborators, ...featTitleRes.collaborators])
    );
    const cleanMainArtist = featArtistRes.mainTitleOrArtist;
    let cleanTitle = featTitleRes.mainTitleOrArtist;

    // Gắn đuôi feat vào tiêu đề nếu có nghệ sĩ kết hợp
    if (allCollabs.length > 0 && !cleanTitle.toLowerCase().includes('feat.')) {
      cleanTitle = `${cleanTitle} (feat. ${allCollabs.join(' & ')})`;
    }

    // 8. Chuẩn hóa Title Case thông minh và làm sạch ký tự đầu/cuối
    cleanTitle = toSmartTitleCase(cleanTitle.replace(/^[-|:\s]+|[-|:\s]+$/g, ''));
    let canonicalArtist = cleanMainArtist.replace(/^[-|:\s]+|[-|:\s]+$/g, '');

    // Nếu nghệ sĩ chính khớp danh bạ canonical, áp dụng tên canonical chuẩn có dấu
    const finalKnownMatch = knownArtistsService.matchArtist(canonicalArtist);
    if (finalKnownMatch.matched && finalKnownMatch.canonicalName) {
      canonicalArtist = finalKnownMatch.canonicalName;
    }

    // 9. Hiệu chỉnh Độ tin cậy (Calibrated Confidence)
    let confidence: 'high' | 'medium' | 'low';
    const consensusSignals = (orientation === 'left_is_artist' ? scoreResLeft.signals : scoreResRight.signals).length;

    if (scoreDelta >= this.config.thresholds.confidenceHighMargin && consensusSignals >= 2) {
      confidence = 'high';
    } else if (scoreDelta >= this.config.thresholds.confidenceMediumMargin) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    const confidenceReason = `Ma trận Heuristic Tầng 3: Δ=${scoreDelta}đ (ScoreA=${scoreA}, ScoreB=${scoreB}), Tín hiệu: [${(orientation === 'left_is_artist' ? scoreResLeft.signals : scoreResRight.signals).join(', ')}]`;

    return {
      title: cleanTitle,
      artist: canonicalArtist,
      album: extractedAlbum,
      trackNumber: extractedTrackNo,
      collaborators: allCollabs,
      scoreA,
      scoreB,
      scoreDelta,
      orientation,
      confidence,
      confidenceReason,
      source: 'layer3',
      pipelineVersion: '1.5',
    };
  }
}

export const defaultStructuralParser = new StructuralParser();
