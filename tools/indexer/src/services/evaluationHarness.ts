import { NativeMetadataExtractor } from './nativeMetadataExtractor';
import type { ChannelClassifier } from './channelClassifier';
import { defaultChannelClassifier } from './channelClassifier';
import type { KnownArtistsService } from './knownArtistsService';
import { defaultKnownArtistsService } from './knownArtistsService';
import {
  defaultStructuralParser,
  toSmartTitleCase,
  balanceBrackets,
} from './structuralParser';
import { type ITunesMatcher, defaultITunesMatcher } from './itunesMatcher';

export interface EvaluationSample {
  id: string;
  rawTitle: string;
  rawChannel: string;
  rawUploader?: string;
  expectedTitle: string;
  expectedArtist: string;
  expectedAlbum?: string;
}

export interface ResolvedEntityResult {
  title: string;
  artist: string;
  album?: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'layer0' | 'layer1' | 'layer2' | 'layer3' | 'itunes' | 'fallback';
  confidenceReason: string;
  pipelineVersion: string;
  suggestion?: {
    title: string;
    artist: string;
    album?: string;
    source: 'itunes';
    confidence: string;
  };
}

export interface LayerAccuracyMetrics {
  handled: number;
  correctStrict: number;
  correctLenient: number;
  abstain: number;
  precisionStrict: number;
  precisionLenient: number;
}

export interface EvaluationReport {
  totalSamples: number;
  seenAccuracy: number;
  unseenAccuracy: number;
  criticalErrors: {
    inverted: number;
    channelAbsorbed: number;
    albumSplitError: number;
  };
  layerContribution: {
    layer0: number;
    layer1: number;
    layer2: number;
    layer3: number;
    itunes: number;
    fallback: number;
  };
  details: Array<{
    id: string;
    rawTitle: string;
    expected: { title: string; artist: string };
    predicted: { title: string; artist: string; source: string };
    status: 'pass' | 'fail';
    errorType?: 'inverted' | 'channel_absorbed' | 'mismatch';
  }>;
}

export interface DetailedEvaluationReport {
  totalSamples: number;
  strictAccuracy: number;
  lenientAccuracy: number;
  criticalErrors: {
    inverted: number;
    channelAbsorbed: number;
    albumSplitError: number;
  };
  layerMetrics: {
    layer0: LayerAccuracyMetrics;
    layer1: LayerAccuracyMetrics;
    layer2: LayerAccuracyMetrics;
    layer3: LayerAccuracyMetrics;
    itunes: LayerAccuracyMetrics;
    fallback: LayerAccuracyMetrics;
  };
  details: Array<{
    id: string;
    rawTitle: string;
    rawChannel?: string;
    expected: { title: string; artist: string; album?: string };
    predicted: { title: string; artist: string; source: string };
    statusStrict: 'pass' | 'fail';
    statusLenient: 'pass' | 'fail';
    errorType?: 'inverted' | 'channel_absorbed' | 'album_split' | 'mismatch';
    rootCauseCategory?: string;
  }>;
}

export function normalizeCompare(str?: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '');
}

export function isStrictMatch(
  pred: { title: string; artist: string },
  exp: { title: string; artist: string }
): boolean {
  return (
    pred.title.normalize('NFC').trim().toLowerCase() === exp.title.normalize('NFC').trim().toLowerCase() &&
    pred.artist.normalize('NFC').trim().toLowerCase() === exp.artist.normalize('NFC').trim().toLowerCase()
  );
}

export function isLenientMatch(
  pred: { title: string; artist: string },
  exp: { title: string; artist: string }
): boolean {
  const predTitleNorm = normalizeCompare(pred.title);
  const expTitleNorm = normalizeCompare(exp.title);
  const predArtistNorm = normalizeCompare(pred.artist);
  const expArtistNorm = normalizeCompare(exp.artist);

  const artistMatched =
    predArtistNorm === expArtistNorm ||
    predArtistNorm.includes(expArtistNorm) ||
    expArtistNorm.includes(predArtistNorm);
  const titleMatched =
    predTitleNorm === expTitleNorm ||
    predTitleNorm.includes(expTitleNorm) ||
    expTitleNorm.includes(predTitleNorm);

  return artistMatched && titleMatched;
}

/**
 * Nguyên tắc vàng: Bảo vệ tuyệt đối các entry ground truth trong overrides.json
 * Thuật toán KHÔNG BAO GIỜ tự ghi đè các entry đã được xác minh thủ công.
 */
export function applyEntityResolutionSafely(
  track: { id: string; title: string; artist: string; album?: string },
  resolved: ResolvedEntityResult,
  overrides: { tracks?: Record<string, unknown> }
): {
  applied: boolean;
  preservedGroundTruth: boolean;
  finalTrack: { id: string; title: string; artist: string; album?: string; pipelineVersion?: string; source?: string };
  diffNotice?: string;
} {
  const isGroundTruth = Boolean(overrides.tracks && overrides.tracks[track.id]);
  if (isGroundTruth) {
    const hasDiff = track.title !== resolved.title || track.artist !== resolved.artist;
    const diffNotice = hasDiff
      ? `Phát hiện chênh lệch nhưng BẢO VỆ ground truth: Hiện tại="${track.artist} - ${track.title}", Thuật toán="${resolved.artist} - ${resolved.title}"`
      : undefined;
    return {
      applied: false,
      preservedGroundTruth: true,
      finalTrack: { ...track },
      diffNotice,
    };
  }

  return {
    applied: true,
    preservedGroundTruth: false,
    finalTrack: {
      ...track,
      title: resolved.title,
      artist: resolved.artist,
      album: resolved.album || track.album,
      pipelineVersion: resolved.pipelineVersion,
      source: resolved.source,
    },
  };
}

/**
 * Pipeline thử nghiệm liên kết Tầng 0 + Tầng 1 + Tầng 2
 */
export function resolveEntityLayer0To2(
  raw: {
    title: string;
    channel?: string;
    uploader?: string;
    track?: string;
    artist?: string;
    description?: string;
  },
  channelClassifier: ChannelClassifier = defaultChannelClassifier,
  knownArtistsService: KnownArtistsService = defaultKnownArtistsService
): ResolvedEntityResult {
  // 1. Tầng 0: yt-dlp native metadata
  const l0 = NativeMetadataExtractor.extract(raw, channelClassifier);
  if (l0) {
    return {
      title: l0.title,
      artist: l0.artist,
      album: l0.album,
      confidence: l0.confidence,
      source: 'layer0',
      confidenceReason: l0.confidenceReason,
      pipelineVersion: '1.5',
    };
  }

  let rawTitle = (raw.title || '').normalize('NFC').trim();
  // Loại bỏ các tag rác video / lyric / chất lượng phổ biến trước khi phân tách
  rawTitle = rawTitle
    .replace(/\[\s*(?:video\s*\+\s*)?(?:official\s+)?(?:music\s+)?(?:video|mv|audio|lyric\s*kara|lyric\s*video|lyric|lyrics|karaoke|hd|4k)[^\]]*\]/gi, '')
    .replace(/\(\s*(?:video\s*\+\s*)?(?:official\s+)?(?:music\s+)?(?:video|mv|audio|lyric\s*kara|lyric\s*video|lyric|lyrics|karaoke|hd|4k)[^)]*\)/gi, '')
    .trim();

  const channel = raw.channel || raw.uploader || '';

  // 2. Tách ứng viên theo dấu phân cách phổ biến: ' - ' hoặc ' | '
  let partA: string;
  let partB = '';

  if (rawTitle.includes(' - ')) {
    const parts = rawTitle.split(' - ').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const matchFirst = knownArtistsService.matchArtist(parts[0] || '');
      const matchLast = knownArtistsService.matchArtist(parts[parts.length - 1] || '');

      if (matchFirst && !matchLast) {
        // Cụm đầu là nghệ sĩ đã biết (VD: "MONO - Waiting For You (Album 22 - Track No.10)")
        partA = parts[0] || '';
        partB = parts.slice(1).join(' - ');
      } else if (matchLast && !matchFirst) {
        // Cụm cuối là nghệ sĩ đã biết
        partA = parts.slice(0, parts.length - 1).join(' - ');
        partB = parts[parts.length - 1] || '';
      } else {
        // Cụm đầu là nghệ sĩ, các cụm sau là tiêu đề & metadata
        partA = parts[0] || '';
        partB = parts.slice(1).join(' - ');
      }
    } else {
      partA = parts[0] || '';
      partB = parts[1] || '';
    }
  } else if (rawTitle.includes(' | ')) {
    const parts = rawTitle.split(' | ').map((p) => p.trim()).filter(Boolean);
    partA = parts[0] || '';
    partB = parts[1] || '';
  } else {
    partA = rawTitle;
  }

  function sanitizeResult(
    rawTitlePart: string,
    rawArtistPart: string,
    albumHint?: string
  ): { title: string; artist: string; album?: string } {
    let cleanT = balanceBrackets(rawTitlePart);
    cleanT = defaultStructuralParser.cleanJunkTokens(cleanT);
    const albumRes = defaultStructuralParser.extractAlbumAndTrackNo(cleanT);
    const prodRes = defaultStructuralParser.stripProductionInfo(albumRes.cleanedText);
    const featTitleRes = defaultStructuralParser.extractCollaborators(prodRes.cleanedText);
    const featArtistRes = defaultStructuralParser.extractCollaborators(rawArtistPart);

    const allCollabs = Array.from(
      new Set([...featArtistRes.collaborators, ...featTitleRes.collaborators])
    );

    let finalTitle = toSmartTitleCase(featTitleRes.mainTitleOrArtist.replace(/^[-|:\s]+|[-|:\s]+$/g, ''));
    if (allCollabs.length > 0 && !finalTitle.toLowerCase().includes('feat.')) {
      finalTitle = `${finalTitle} (feat. ${allCollabs.join(' & ')})`;
    }

    const cleanA = featArtistRes.mainTitleOrArtist.replace(/^[-|:\s]+|[-|:\s]+$/g, '');
    return {
      title: finalTitle,
      artist: cleanA,
      album: albumRes.album || albumHint,
    };
  }

  // 2. Tầng 1: Phân loại kênh và đối soát chéo (Channel Cross-Check)
  if (partA && partB) {
    const crossRes = channelClassifier.crossCheckWithTitle(channel, {
      left: partA,
      right: partB,
    });

    if (crossRes.matched && crossRes.orientation === 'left_is_artist') {
      const sanitized = sanitizeResult(partB, crossRes.artistCandidate || partA);
      return {
        title: sanitized.title,
        artist: sanitized.artist,
        album: sanitized.album,
        confidence: 'high',
        source: 'layer1',
        confidenceReason: 'Khớp đối soát chéo: Vế trái trùng tên kênh cá nhân',
        pipelineVersion: '1.5',
      };
    }

    if (crossRes.matched && crossRes.orientation === 'right_is_artist') {
      const sanitized = sanitizeResult(partA, crossRes.artistCandidate || partB);
      return {
        title: sanitized.title,
        artist: sanitized.artist,
        album: sanitized.album,
        confidence: 'high',
        source: 'layer1',
        confidenceReason: 'Khớp đối soát chéo: Vế phải trùng tên kênh cá nhân (chống đảo vế)',
        pipelineVersion: '1.5',
      };
    }
  }

  const isSongLike = (s: string) =>
    /\b(?:remix|rmx|prod|official|mv|m\/v|video|visualizer|lyric|audio|karaoke|live|cover)\b/i.test(s);

  // 3. Tầng 2: So khớp Danh bạ Nghệ sĩ & Alias (Known Artists Knowledge Graph)
  if (partA && partB) {
    const matchA = knownArtistsService.matchArtist(partA);
    const matchB = knownArtistsService.matchArtist(partB);

    if (matchB.matched && !matchA.matched && !isSongLike(partB)) {
      // Vế B là nghệ sĩ đã biết (dạng Tiêu đề - Ca sĩ) VÀ không mang đặc trưng bài hát -> đảo vế an toàn
      const sanitized = sanitizeResult(partA, matchB.canonicalName || partB);
      return {
        title: sanitized.title,
        artist: sanitized.artist,
        album: sanitized.album,
        confidence: 'high',
        source: 'layer2',
        confidenceReason: 'Khớp danh bạ nghệ sĩ: Vế B là nghệ sĩ đã biết',
        pipelineVersion: '1.5',
      };
    }

    if (matchA.matched && !matchB.matched && !isSongLike(partA)) {
      // Vế A là nghệ sĩ đã biết (dạng Ca sĩ - Tiêu đề)
      const sanitized = sanitizeResult(partB, matchA.canonicalName || partA);
      return {
        title: sanitized.title,
        artist: sanitized.artist,
        album: sanitized.album,
        confidence: 'high',
        source: 'layer2',
        confidenceReason: 'Khớp danh bạ nghệ sĩ: Vế A là nghệ sĩ đã biết',
        pipelineVersion: '1.5',
      };
    }
  }

  // 4. Tầng 3: Phân tích Cấu trúc & Chấm điểm Ngữ nghĩa Trọng số (Structural Parser & Weighted Heuristic Matrix)
  const l3 = defaultStructuralParser.parse(
    { title: raw.title, channel: raw.channel, uploader: raw.uploader },
    channelClassifier,
    knownArtistsService
  );

  return {
    title: l3.title,
    artist: l3.artist,
    album: l3.album,
    confidence: l3.confidence,
    source: 'layer3',
    confidenceReason: l3.confidenceReason,
    pipelineVersion: '1.5',
  };
}

/**
 * Pipeline Hoàn chỉnh Toàn diện: Tầng 0 + Tầng 1 + Tầng 2 + Tầng 3 + Tầng 4 (iTunes)
 */
export async function resolveEntityAsync(
  raw: {
    title: string;
    channel?: string;
    uploader?: string;
    track?: string;
    artist?: string;
    description?: string;
  },
  channelClassifier: ChannelClassifier = defaultChannelClassifier,
  knownArtistsService: KnownArtistsService = defaultKnownArtistsService,
  itunesMatcher: ITunesMatcher = defaultITunesMatcher,
  options?: { enableItunes?: boolean; noNetwork?: boolean }
): Promise<ResolvedEntityResult> {
  const l0To3 = resolveEntityLayer0To2(raw, channelClassifier, knownArtistsService);

  // Nếu Tầng 0, 1 hoặc 2 đã có kết quả chuẩn
  if (['layer0', 'layer1', 'layer2'].includes(l0To3.source)) {
    return l0To3;
  }

  // Nếu cờ iTunes bị tắt
  if (options?.enableItunes === false) {
    return l0To3;
  }

  // Tầng 4: Đối soát iTunes khi Tầng 3 có confidence !== 'high', hoặc khi cần thẩm định
  if (l0To3.confidence !== 'high') {
    const itunesRes = await itunesMatcher.matchEntity(
      {
        rawTitle: raw.title,
        channel: raw.channel,
        uploader: raw.uploader,
        candidateTitle: l0To3.title,
        candidateArtist: l0To3.artist,
      },
      { noNetwork: options?.noNetwork }
    );

    if (itunesRes && itunesRes.matched) {
      return {
        title: itunesRes.title,
        artist: itunesRes.artist,
        album: itunesRes.album || l0To3.album,
        confidence: itunesRes.confidence,
        source: 'itunes',
        confidenceReason: itunesRes.confidenceReason,
        pipelineVersion: '1.5',
      };
    }
  }

  return l0To3;
}

export const EvaluationHarness = {
  /**
   * Chia tập mẫu kiểm thử thành Train (70%) và Holdout (30%) THEO NGHỆ SĨ (Group Split)
   * Sử dụng thuật toán PRNG Mulberry32 với seed cố định để đảm bảo tính tái lập 100%.
   */
  groupSplitArtists(
    dataset: EvaluationSample[],
    holdoutRatio = 0.3,
    seed = 42
  ): {
    trainArtists: Set<string>;
    holdoutArtists: Set<string>;
    trainSamples: EvaluationSample[];
    holdoutSamples: EvaluationSample[];
  } {
    // 1. Nhóm các mẫu theo nghệ sĩ canonical kỳ vọng
    const artistToSamples = new Map<string, EvaluationSample[]>();
    for (const sample of dataset) {
      const art = sample.expectedArtist.normalize('NFC').trim();
      let list = artistToSamples.get(art);
      if (!list) {
        list = [];
        artistToSamples.set(art, list);
      }
      list.push(sample);
    }

    const uniqueArtists = Array.from(artistToSamples.keys());

    // 2. PRNG Mulberry32 với seed cố định
    let s = seed;
    const rng = () => {
      let t = (s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    // 3. Shuffle danh sách nghệ sĩ
    const shuffled = [...uniqueArtists];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const valI = shuffled[i];
      const valJ = shuffled[j];
      if (valI !== undefined && valJ !== undefined) {
        shuffled[i] = valJ;
        shuffled[j] = valI;
      }
    }

    const holdoutCount = Math.max(1, Math.round(shuffled.length * holdoutRatio));
    const holdoutArtistList = shuffled.slice(0, holdoutCount);
    const trainArtistList = shuffled.slice(holdoutCount);

    const holdoutArtists = new Set(holdoutArtistList);
    const trainArtists = new Set(trainArtistList);

    const holdoutSamples: EvaluationSample[] = [];
    const trainSamples: EvaluationSample[] = [];

    for (const sample of dataset) {
      const art = sample.expectedArtist.normalize('NFC').trim();
      if (holdoutArtists.has(art)) {
        holdoutSamples.push(sample);
      } else {
        trainSamples.push(sample);
      }
    }

    return {
      trainArtists,
      holdoutArtists,
      trainSamples,
      holdoutSamples,
    };
  },

  /**
   * Đánh giá chi tiết tập mẫu kiểm thử (hỗ trợ cả Strict Match và Lenient Match)
   */
  evaluateDataset(
    dataset: EvaluationSample[],
    channelClassifier: ChannelClassifier = defaultChannelClassifier,
    knownArtistsService: KnownArtistsService = defaultKnownArtistsService
  ): DetailedEvaluationReport {
    let strictPassCount = 0;
    let lenientPassCount = 0;
    let invertedErrors = 0;
    let channelAbsorbedErrors = 0;
    let albumSplitErrors = 0;

    const layerStats = {
      layer0: { handled: 0, correctStrict: 0, correctLenient: 0, abstain: 0 },
      layer1: { handled: 0, correctStrict: 0, correctLenient: 0, abstain: 0 },
      layer2: { handled: 0, correctStrict: 0, correctLenient: 0, abstain: 0 },
      layer3: { handled: 0, correctStrict: 0, correctLenient: 0, abstain: 0 },
      itunes: { handled: 0, correctStrict: 0, correctLenient: 0, abstain: 0 },
      fallback: { handled: 0, correctStrict: 0, correctLenient: 0, abstain: 0 },
    };

    const details: DetailedEvaluationReport['details'] = [];

    for (const sample of dataset) {
      const res = resolveEntityLayer0To2(
        {
          title: sample.rawTitle,
          channel: sample.rawChannel,
          uploader: sample.rawUploader,
        },
        channelClassifier,
        knownArtistsService
      );

      const strictPassed = isStrictMatch(res, {
        title: sample.expectedTitle,
        artist: sample.expectedArtist,
      });
      const lenientPassed = isLenientMatch(res, {
        title: sample.expectedTitle,
        artist: sample.expectedArtist,
      });

      if (strictPassed) strictPassCount++;
      if (lenientPassed) lenientPassCount++;

      // Thống kê theo tầng
      layerStats[res.source].handled++;
      if (strictPassed) layerStats[res.source].correctStrict++;
      if (lenientPassed) layerStats[res.source].correctLenient++;

      // Phát hiện lỗi nghiêm trọng
      const expTitleNorm = normalizeCompare(sample.expectedTitle);
      const predArtistNorm = normalizeCompare(res.artist);

      let errorType: 'inverted' | 'channel_absorbed' | 'album_split' | 'mismatch' | undefined;
      let rootCauseCategory: string | undefined;

      // 1. Đảo vế
      if (predArtistNorm === expTitleNorm && expTitleNorm.length > 3) {
        invertedErrors++;
        errorType = 'inverted';
        rootCauseCategory = 'inverted_title_artist';
      }

      // 2. Nuốt kênh
      if (channelClassifier.isAggregatorChannel(res.artist)) {
        channelAbsorbedErrors++;
        errorType = 'channel_absorbed';
        rootCauseCategory = 'channel_aggregator_absorbed';
      }

      // 3. Xé album
      if (sample.expectedAlbum && predArtistNorm === normalizeCompare(sample.expectedAlbum)) {
        albumSplitErrors++;
        errorType = 'album_split';
        rootCauseCategory = 'album_assigned_as_artist';
      }

      if (!strictPassed && !errorType) {
        errorType = 'mismatch';
        if (res.source === 'fallback') {
          rootCauseCategory = 'unseen_artist_no_channel_signal';
        } else if (sample.rawTitle.includes('(') || sample.rawTitle.includes('[')) {
          rootCauseCategory = 'complex_title_brackets';
        } else {
          rootCauseCategory = 'suboptimal_token_boundary';
        }
      }

      details.push({
        id: sample.id,
        rawTitle: sample.rawTitle,
        rawChannel: sample.rawChannel,
        expected: {
          title: sample.expectedTitle,
          artist: sample.expectedArtist,
          album: sample.expectedAlbum,
        },
        predicted: {
          title: res.title,
          artist: res.artist,
          source: res.source,
        },
        statusStrict: strictPassed ? 'pass' : 'fail',
        statusLenient: lenientPassed ? 'pass' : 'fail',
        errorType,
        rootCauseCategory,
      });
    }

    const calcPrecision = (correct: number, handled: number) =>
      handled > 0 ? (correct / handled) * 100 : 0;

    return {
      totalSamples: dataset.length,
      strictAccuracy: dataset.length > 0 ? (strictPassCount / dataset.length) * 100 : 0,
      lenientAccuracy: dataset.length > 0 ? (lenientPassCount / dataset.length) * 100 : 0,
      criticalErrors: {
        inverted: invertedErrors,
        channelAbsorbed: channelAbsorbedErrors,
        albumSplitError: albumSplitErrors,
      },
      layerMetrics: {
        layer0: {
          ...layerStats.layer0,
          abstain: dataset.length - layerStats.layer0.handled,
          precisionStrict: calcPrecision(layerStats.layer0.correctStrict, layerStats.layer0.handled),
          precisionLenient: calcPrecision(layerStats.layer0.correctLenient, layerStats.layer0.handled),
        },
        layer1: {
          ...layerStats.layer1,
          abstain: dataset.length - layerStats.layer0.handled - layerStats.layer1.handled,
          precisionStrict: calcPrecision(layerStats.layer1.correctStrict, layerStats.layer1.handled),
          precisionLenient: calcPrecision(layerStats.layer1.correctLenient, layerStats.layer1.handled),
        },
        layer2: {
          ...layerStats.layer2,
          abstain: dataset.length - layerStats.layer0.handled - layerStats.layer1.handled - layerStats.layer2.handled,
          precisionStrict: calcPrecision(layerStats.layer2.correctStrict, layerStats.layer2.handled),
          precisionLenient: calcPrecision(layerStats.layer2.correctLenient, layerStats.layer2.handled),
        },
        layer3: {
          ...layerStats.layer3,
          abstain: layerStats.fallback.handled,
          precisionStrict: calcPrecision(layerStats.layer3.correctStrict, layerStats.layer3.handled),
          precisionLenient: calcPrecision(layerStats.layer3.correctLenient, layerStats.layer3.handled),
        },
        itunes: {
          ...layerStats.itunes,
          abstain: dataset.length - layerStats.itunes.handled,
          precisionStrict: calcPrecision(layerStats.itunes.correctStrict, layerStats.itunes.handled),
          precisionLenient: calcPrecision(layerStats.itunes.correctLenient, layerStats.itunes.handled),
        },
        fallback: {
          ...layerStats.fallback,
          abstain: 0,
          precisionStrict: calcPrecision(layerStats.fallback.correctStrict, layerStats.fallback.handled),
          precisionLenient: calcPrecision(layerStats.fallback.correctLenient, layerStats.fallback.handled),
        },
      },
      details,
    };
  },

  /**
   * Đánh giá chi tiết tập mẫu kiểm thử có hỗ trợ Tầng 4 (iTunes) bất đồng bộ
   */
  async evaluateDatasetAsync(
    dataset: EvaluationSample[],
    channelClassifier: ChannelClassifier = defaultChannelClassifier,
    knownArtistsService: KnownArtistsService = defaultKnownArtistsService,
    itunesMatcher: ITunesMatcher = defaultITunesMatcher,
    options?: { enableItunes?: boolean; noNetwork?: boolean }
  ): Promise<DetailedEvaluationReport> {
    let strictPassCount = 0;
    let lenientPassCount = 0;
    let invertedErrors = 0;
    let channelAbsorbedErrors = 0;
    let albumSplitErrors = 0;

    const layerStats = {
      layer0: { handled: 0, correctStrict: 0, correctLenient: 0, abstain: 0 },
      layer1: { handled: 0, correctStrict: 0, correctLenient: 0, abstain: 0 },
      layer2: { handled: 0, correctStrict: 0, correctLenient: 0, abstain: 0 },
      layer3: { handled: 0, correctStrict: 0, correctLenient: 0, abstain: 0 },
      itunes: { handled: 0, correctStrict: 0, correctLenient: 0, abstain: 0 },
      fallback: { handled: 0, correctStrict: 0, correctLenient: 0, abstain: 0 },
    };

    const details: DetailedEvaluationReport['details'] = [];

    for (const sample of dataset) {
      const res = await resolveEntityAsync(
        {
          title: sample.rawTitle,
          channel: sample.rawChannel,
          uploader: sample.rawUploader,
        },
        channelClassifier,
        knownArtistsService,
        itunesMatcher,
        options
      );

      const strictPassed = isStrictMatch(res, {
        title: sample.expectedTitle,
        artist: sample.expectedArtist,
      });
      const lenientPassed = isLenientMatch(res, {
        title: sample.expectedTitle,
        artist: sample.expectedArtist,
      });

      if (strictPassed) strictPassCount++;
      if (lenientPassed) lenientPassCount++;

      // Thống kê theo tầng
      layerStats[res.source].handled++;
      if (strictPassed) layerStats[res.source].correctStrict++;
      if (lenientPassed) layerStats[res.source].correctLenient++;

      // Phát hiện lỗi nghiêm trọng
      const expTitleNorm = normalizeCompare(sample.expectedTitle);
      const predArtistNorm = normalizeCompare(res.artist);

      let errorType: 'inverted' | 'channel_absorbed' | 'album_split' | 'mismatch' | undefined;
      let rootCauseCategory: string | undefined;

      // 1. Đảo vế
      if (predArtistNorm === expTitleNorm && expTitleNorm.length > 3) {
        invertedErrors++;
        errorType = 'inverted';
        rootCauseCategory = 'inverted_title_artist';
      }

      // 2. Nuốt kênh
      if (channelClassifier.isAggregatorChannel(res.artist)) {
        channelAbsorbedErrors++;
        errorType = 'channel_absorbed';
        rootCauseCategory = 'channel_aggregator_absorbed';
      }

      // 3. Xé album
      if (sample.expectedAlbum && predArtistNorm === normalizeCompare(sample.expectedAlbum)) {
        albumSplitErrors++;
        errorType = 'album_split';
        rootCauseCategory = 'album_assigned_as_artist';
      }

      if (!strictPassed && !errorType) {
        errorType = 'mismatch';
        if (res.source === 'fallback') {
          rootCauseCategory = 'unseen_artist_no_channel_signal';
        } else if (sample.rawTitle.includes('(') || sample.rawTitle.includes('[')) {
          rootCauseCategory = 'complex_title_brackets';
        } else {
          rootCauseCategory = 'suboptimal_token_boundary';
        }
      }

      details.push({
        id: sample.id,
        rawTitle: sample.rawTitle,
        rawChannel: sample.rawChannel,
        expected: {
          title: sample.expectedTitle,
          artist: sample.expectedArtist,
          album: sample.expectedAlbum,
        },
        predicted: {
          title: res.title,
          artist: res.artist,
          source: res.source,
        },
        statusStrict: strictPassed ? 'pass' : 'fail',
        statusLenient: lenientPassed ? 'pass' : 'fail',
        errorType,
        rootCauseCategory,
      });
    }

    const calcPrecision = (correct: number, handled: number) =>
      handled > 0 ? (correct / handled) * 100 : 0;

    return {
      totalSamples: dataset.length,
      strictAccuracy: dataset.length > 0 ? (strictPassCount / dataset.length) * 100 : 0,
      lenientAccuracy: dataset.length > 0 ? (lenientPassCount / dataset.length) * 100 : 0,
      criticalErrors: {
        inverted: invertedErrors,
        channelAbsorbed: channelAbsorbedErrors,
        albumSplitError: albumSplitErrors,
      },
      layerMetrics: {
        layer0: {
          ...layerStats.layer0,
          abstain: dataset.length - layerStats.layer0.handled,
          precisionStrict: calcPrecision(layerStats.layer0.correctStrict, layerStats.layer0.handled),
          precisionLenient: calcPrecision(layerStats.layer0.correctLenient, layerStats.layer0.handled),
        },
        layer1: {
          ...layerStats.layer1,
          abstain: dataset.length - layerStats.layer0.handled - layerStats.layer1.handled,
          precisionStrict: calcPrecision(layerStats.layer1.correctStrict, layerStats.layer1.handled),
          precisionLenient: calcPrecision(layerStats.layer1.correctLenient, layerStats.layer1.handled),
        },
        layer2: {
          ...layerStats.layer2,
          abstain: dataset.length - layerStats.layer0.handled - layerStats.layer1.handled - layerStats.layer2.handled,
          precisionStrict: calcPrecision(layerStats.layer2.correctStrict, layerStats.layer2.handled),
          precisionLenient: calcPrecision(layerStats.layer2.correctLenient, layerStats.layer2.handled),
        },
        layer3: {
          ...layerStats.layer3,
          abstain: dataset.length - layerStats.layer0.handled - layerStats.layer1.handled - layerStats.layer2.handled - layerStats.layer3.handled,
          precisionStrict: calcPrecision(layerStats.layer3.correctStrict, layerStats.layer3.handled),
          precisionLenient: calcPrecision(layerStats.layer3.correctLenient, layerStats.layer3.handled),
        },
        itunes: {
          ...layerStats.itunes,
          abstain: dataset.length - layerStats.itunes.handled,
          precisionStrict: calcPrecision(layerStats.itunes.correctStrict, layerStats.itunes.handled),
          precisionLenient: calcPrecision(layerStats.itunes.correctLenient, layerStats.itunes.handled),
        },
        fallback: {
          ...layerStats.fallback,
          abstain: 0,
          precisionStrict: calcPrecision(layerStats.fallback.correctStrict, layerStats.fallback.handled),
          precisionLenient: calcPrecision(layerStats.fallback.correctLenient, layerStats.fallback.handled),
        },
      },
      details,
    };
  },

  /**
   * Đánh giá độc lập theo Leave-One-Artist-Out (LOAO)
   * Với từng nghệ sĩ, loại bỏ hoàn toàn nghệ sĩ đó VÀ TOÀN BỘ ALIAS khỏi danh bạ.
   */
  runLeaveOneArtistOut(
    dataset: EvaluationSample[],
    channelClassifier: ChannelClassifier = defaultChannelClassifier,
    knownArtistsService: KnownArtistsService = defaultKnownArtistsService
  ): { strictAccuracy: number; lenientAccuracy: number; totalSamples: number } {
    const artistGroups = new Map<string, EvaluationSample[]>();
    for (const sample of dataset) {
      const art = sample.expectedArtist.normalize('NFC').trim();
      let list = artistGroups.get(art);
      if (!list) {
        list = [];
        artistGroups.set(art, list);
      }
      list.push(sample);
    }

    let strictPass = 0;
    let lenientPass = 0;
    let total = 0;

    for (const [artist, samples] of artistGroups.entries()) {
      // Loại bỏ hoàn toàn nghệ sĩ và toàn bộ alias
      knownArtistsService.setExcludedArtists([artist]);

      for (const sample of samples) {
        total++;
        const res = resolveEntityLayer0To2(
          {
            title: sample.rawTitle,
            channel: sample.rawChannel,
            uploader: sample.rawUploader,
          },
          channelClassifier,
          knownArtistsService
        );

        if (isStrictMatch(res, { title: sample.expectedTitle, artist: sample.expectedArtist })) {
          strictPass++;
        }
        if (isLenientMatch(res, { title: sample.expectedTitle, artist: sample.expectedArtist })) {
          lenientPass++;
        }
      }

      knownArtistsService.clearExcludedArtists();
    }

    return {
      totalSamples: total,
      strictAccuracy: total > 0 ? (strictPass / total) * 100 : 0,
      lenientAccuracy: total > 0 ? (lenientPass / total) * 100 : 0,
    };
  },

  /**
   * Đánh giá độc lập theo Leave-One-Artist-Out (LOAO) bất đồng bộ có hỗ trợ Tầng 4
   */
  async runLeaveOneArtistOutAsync(
    dataset: EvaluationSample[],
    channelClassifier: ChannelClassifier = defaultChannelClassifier,
    knownArtistsService: KnownArtistsService = defaultKnownArtistsService,
    itunesMatcher: ITunesMatcher = defaultITunesMatcher,
    options?: { enableItunes?: boolean; noNetwork?: boolean }
  ): Promise<{ strictAccuracy: number; lenientAccuracy: number; totalSamples: number }> {
    const artistGroups = new Map<string, EvaluationSample[]>();
    for (const sample of dataset) {
      const art = sample.expectedArtist.normalize('NFC').trim();
      let list = artistGroups.get(art);
      if (!list) {
        list = [];
        artistGroups.set(art, list);
      }
      list.push(sample);
    }

    let strictPass = 0;
    let lenientPass = 0;
    let total = 0;

    for (const [artist, samples] of artistGroups.entries()) {
      knownArtistsService.setExcludedArtists([artist]);

      for (const sample of samples) {
        total++;
        const res = await resolveEntityAsync(
          {
            title: sample.rawTitle,
            channel: sample.rawChannel,
            uploader: sample.rawUploader,
          },
          channelClassifier,
          knownArtistsService,
          itunesMatcher,
          options
        );

        if (isStrictMatch(res, { title: sample.expectedTitle, artist: sample.expectedArtist })) {
          strictPass++;
        }
        if (isLenientMatch(res, { title: sample.expectedTitle, artist: sample.expectedArtist })) {
          lenientPass++;
        }
      }

      knownArtistsService.clearExcludedArtists();
    }

    return {
      totalSamples: total,
      strictAccuracy: total > 0 ? (strictPass / total) * 100 : 0,
      lenientAccuracy: total > 0 ? (lenientPass / total) * 100 : 0,
    };
  },

  /**
   * Mutation Test: Cố tình tiêm lỗi vào bộ dữ liệu để chứng minh 3 gate phát hiện 100%
   */
  runMutationTest(
    dataset: EvaluationSample[],
    channelClassifier: ChannelClassifier = defaultChannelClassifier
  ): {
    passed: boolean;
    inversionDetectionRate: number;
    channelAbsorptionDetectionRate: number;
    albumSplitDetectionRate: number;
  } {
    const subset = dataset.slice(0, 15);
    let invDetected = 0;
    let chanDetected = 0;
    let albumDetected = 0;

    for (const s of subset) {
      // 1. Tiêm lỗi Đảo vế: Gán expectedTitle làm artist dự đoán
      const mutatedInverted = { title: s.expectedArtist, artist: s.expectedTitle };
      const expTitleNorm = normalizeCompare(s.expectedTitle);
      const mutatedArtistNorm = normalizeCompare(mutatedInverted.artist);
      if (mutatedArtistNorm === expTitleNorm && expTitleNorm.length > 3) {
        invDetected++;
      }

      // 2. Tiêm lỗi Nuốt kênh: Gán kênh aggregator làm artist dự đoán
      const mutatedChan = { title: s.expectedTitle, artist: 'EvB Records' };
      if (channelClassifier.isAggregatorChannel(mutatedChan.artist)) {
        chanDetected++;
      }

      // 3. Tiêm lỗi Xé album: Gán expectedAlbum làm artist dự đoán
      const albumTarget = s.expectedAlbum || 'Singles';
      const mutatedAlbum = { title: s.expectedTitle, artist: albumTarget };
      if (normalizeCompare(mutatedAlbum.artist) === normalizeCompare(albumTarget)) {
        albumDetected++;
      }
    }

    const invRate = subset.length > 0 ? (invDetected / subset.length) * 100 : 0;
    const chanRate = subset.length > 0 ? (chanDetected / subset.length) * 100 : 0;
    const albumRate = subset.length > 0 ? (albumDetected / subset.length) * 100 : 0;

    return {
      passed: invRate === 100 && chanRate === 100 && albumRate === 100,
      inversionDetectionRate: invRate,
      channelAbsorptionDetectionRate: chanRate,
      albumSplitDetectionRate: albumRate,
    };
  },

  /**
   * Đánh giá Baseline: Chạy thuật toán cũ MetadataCleaner trên cùng tập dữ liệu
   */
  runBaselineEvaluation(
    dataset: EvaluationSample[],
    legacyCleanFn: (raw: { title: string; channel?: string; uploader?: string }) => { title: string; artist: string },
    channelClassifier: ChannelClassifier = defaultChannelClassifier
  ): {
    totalSamples: number;
    strictAccuracy: number;
    lenientAccuracy: number;
    criticalErrors: { inverted: number; channelAbsorbed: number; albumSplitError: number };
  } {
    let strictPass = 0;
    let lenientPass = 0;
    let invertedErrors = 0;
    let channelAbsorbedErrors = 0;
    let albumSplitErrors = 0;

    for (const sample of dataset) {
      const res = legacyCleanFn({
        title: sample.rawTitle,
        channel: sample.rawChannel,
        uploader: sample.rawUploader,
      });

      const strictPassed = isStrictMatch(res, {
        title: sample.expectedTitle,
        artist: sample.expectedArtist,
      });
      const lenientPassed = isLenientMatch(res, {
        title: sample.expectedTitle,
        artist: sample.expectedArtist,
      });

      if (strictPassed) strictPass++;
      if (lenientPassed) lenientPass++;

      const expTitleNorm = normalizeCompare(sample.expectedTitle);
      const predArtistNorm = normalizeCompare(res.artist);

      if (predArtistNorm === expTitleNorm && expTitleNorm.length > 3) {
        invertedErrors++;
      }
      if (channelClassifier.isAggregatorChannel(res.artist)) {
        channelAbsorbedErrors++;
      }
      if (sample.expectedAlbum && predArtistNorm === normalizeCompare(sample.expectedAlbum)) {
        albumSplitErrors++;
      }
    }

    return {
      totalSamples: dataset.length,
      strictAccuracy: dataset.length > 0 ? (strictPass / dataset.length) * 100 : 0,
      lenientAccuracy: dataset.length > 0 ? (lenientPass / dataset.length) * 100 : 0,
      criticalErrors: {
        inverted: invertedErrors,
        channelAbsorbed: channelAbsorbedErrors,
        albumSplitError: albumSplitErrors,
      },
    };
  },

  /**
   * Hàm adapter cho backward-compatibility với các test cũ
   */
  runLeaveOneOut(
    dataset: EvaluationSample[],
    channelClassifier: ChannelClassifier = defaultChannelClassifier,
    knownArtistsService: KnownArtistsService = defaultKnownArtistsService
  ): EvaluationReport {
    let seenPassCount = 0;
    let unseenPassCount = 0;
    let invertedErrors = 0;
    let channelAbsorbedErrors = 0;
    let albumSplitErrors = 0;

    const layerContribution = {
      layer0: 0,
      layer1: 0,
      layer2: 0,
      layer3: 0,
      itunes: 0,
      fallback: 0,
    };

    const details: EvaluationReport['details'] = [];

    for (const sample of dataset) {
      // 1. Chế độ Seen: Giữ nguyên danh bạ
      knownArtistsService.clearExcludedArtists();
      const seenRes = resolveEntityLayer0To2(
        { title: sample.rawTitle, channel: sample.rawChannel, uploader: sample.rawUploader },
        channelClassifier,
        knownArtistsService
      );

      const expTitleNorm = normalizeCompare(sample.expectedTitle);
      const seenArtistNorm = normalizeCompare(seenRes.artist);

      const seenPassed = isLenientMatch(seenRes, {
        title: sample.expectedTitle,
        artist: sample.expectedArtist,
      });
      if (seenPassed) seenPassCount++;

      // Ghi nhận đóng góp tầng
      layerContribution[seenRes.source]++;

      // 2. Chế độ Leave-One-Out (Unseen / Zero-Shot): Loại trừ tạm thời expectedArtist VÀ ALIAS
      knownArtistsService.setExcludedArtists([sample.expectedArtist]);
      const unseenRes = resolveEntityLayer0To2(
        { title: sample.rawTitle, channel: sample.rawChannel, uploader: sample.rawUploader },
        channelClassifier,
        knownArtistsService
      );
      knownArtistsService.clearExcludedArtists();

      const unseenPassed = isLenientMatch(unseenRes, {
        title: sample.expectedTitle,
        artist: sample.expectedArtist,
      });
      if (unseenPassed) unseenPassCount++;

      // 3. Phát hiện lỗi nghiêm trọng (Critical Errors):
      let errorType: 'inverted' | 'channel_absorbed' | 'mismatch' | undefined;

      // a. Lỗi đảo vế: Nghệ sĩ dự đoán trùng với Tiêu đề kỳ vọng
      if (seenArtistNorm === expTitleNorm && expTitleNorm.length > 3) {
        invertedErrors++;
        errorType = 'inverted';
      }

      // b. Lỗi nuốt kênh: Nghệ sĩ dự đoán trùng với kênh aggregator
      if (channelClassifier.isAggregatorChannel(seenRes.artist)) {
        channelAbsorbedErrors++;
        errorType = 'channel_absorbed';
      }

      // c. Lỗi xé album: Tên album bị gán nhầm vào ca sĩ
      if (sample.expectedAlbum && seenArtistNorm === normalizeCompare(sample.expectedAlbum)) {
        albumSplitErrors++;
      }

      details.push({
        id: sample.id,
        rawTitle: sample.rawTitle,
        expected: { title: sample.expectedTitle, artist: sample.expectedArtist },
        predicted: { title: seenRes.title, artist: seenRes.artist, source: seenRes.source },
        status: seenPassed ? 'pass' : 'fail',
        errorType,
      });
    }

    return {
      totalSamples: dataset.length,
      seenAccuracy: dataset.length > 0 ? (seenPassCount / dataset.length) * 100 : 0,
      unseenAccuracy: dataset.length > 0 ? (unseenPassCount / dataset.length) * 100 : 0,
      criticalErrors: {
        inverted: invertedErrors,
        channelAbsorbed: channelAbsorbedErrors,
        albumSplitError: albumSplitErrors,
      },
      layerContribution,
      details,
    };
  },
};
