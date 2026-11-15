import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  resolveEntityAsync,
  type ResolvedEntityResult,
  normalizeCompare,
} from './evaluationHarness';
import { defaultChannelClassifier, type ChannelClassifier } from './channelClassifier';
import { defaultKnownArtistsService, type KnownArtistsService } from './knownArtistsService';
import { defaultITunesMatcher, type ITunesMatcher } from './itunesMatcher';
import { getOverrides, saveOverrides } from './overridesManager';
import { normalizeText, type Library, type Track, type Album } from '@music-app/shared';
import { loadConfig } from '../config';
import { R2Uploader } from './r2Uploader';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const findFile = (relPath: string) => {
  const candidates = [
    path.resolve(process.cwd(), relPath),
    path.resolve(process.cwd(), 'tools/indexer', relPath),
    path.resolve(__dirname, '..', relPath),
    path.resolve(__dirname, '../..', relPath),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0] || relPath;
};

export interface EntityCandidateItem {
  id: string;
  originalTitle: string;
  originalArtist: string;
  originalAlbum?: string;
  resolvedTitle: string;
  resolvedArtist: string;
  resolvedAlbum?: string;
  confidence: 'high' | 'medium' | 'low';
  confidenceReason: string;
  source: 'layer0' | 'layer1' | 'layer2' | 'layer3' | 'itunes' | 'fallback';
  isChanged: boolean;
  isInverted: boolean;
  isChannelAbsorbed: boolean;
  isProtected: boolean;
  diffNotice?: string;
  suggestedAction: 'safe_apply' | 'review_needed' | 'skip';
}

export interface EntityResolutionPreviewReport {
  totalTracks: number;
  stats: {
    total: number;
    changed: number;
    invertedResolved: number;
    channelCleaned: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    protectedGroundTruth: number;
    safeApplyCount: number;
  };
  candidates: EntityCandidateItem[];
  csvReportPath: string;
}

export interface EntityResolutionApplyOptions {
  trackIds?: string[];
  applyAllHighConfidence?: boolean;
  syncToR2?: boolean;
  forceProtected?: boolean;
}

export interface EntityResolutionApplyResult {
  success: boolean;
  appliedCount: number;
  skippedCount: number;
  backupPaths: {
    overrides: string;
    library: string;
  };
  syncedToR2: boolean;
  errors?: string[];
}

export class EntityResolutionService {
  private channelClassifier: ChannelClassifier;
  private knownArtistsService: KnownArtistsService;
  private itunesMatcher: ITunesMatcher;

  constructor(
    channelClassifier: ChannelClassifier = defaultChannelClassifier,
    knownArtistsService: KnownArtistsService = defaultKnownArtistsService,
    itunesMatcher: ITunesMatcher = defaultITunesMatcher
  ) {
    this.channelClassifier = channelClassifier;
    this.knownArtistsService = knownArtistsService;
    this.itunesMatcher = itunesMatcher;
  }

  /**
   * Chạy Dry-Run phân giải thực thể trên toàn bộ thư viện hoặc danh sách bài được chọn
   */
  public async preview(options?: {
    trackIds?: string[];
    forceItunes?: boolean;
  }): Promise<EntityResolutionPreviewReport> {
    const libPath = findFile('library.json');
    const overrides = await getOverrides();

    let libData: Library = { version: 1, generatedAt: new Date().toISOString(), tracks: [], albums: [] };
    if (fs.existsSync(libPath)) {
      try {
        libData = JSON.parse(fs.readFileSync(libPath, 'utf-8'));
      } catch {
        // bỏ qua lỗi đọc file json hỏng
      }
    }

    // Fallback: nếu library.json chưa tồn tại (môi trường CI test hoặc máy mới chưa sync),
    // phục hồi danh sách tracks từ overrides.json
    if (libData.tracks.length === 0 && overrides.tracks && Object.keys(overrides.tracks).length > 0) {
      libData.tracks = Object.entries(overrides.tracks).map(([id, t]) => ({
        id,
        title: t.title || 'Unknown Title',
        artist: t.artist || 'Unknown Artist',
        album: t.album || 'Singles',
        albumId: id,
        file: `music/${id}.mp3`,
        duration: 180,
        storage: 'r2' as const,
      }));
    }

    const targetTracks = options?.trackIds && options.trackIds.length > 0
      ? libData.tracks.filter((t) => options.trackIds?.includes(t.id))
      : libData.tracks;

    const candidates: EntityCandidateItem[] = [];
    let changedCount = 0;
    let invertedCount = 0;
    let channelCleanedCount = 0;
    let highConfCount = 0;
    let medConfCount = 0;
    let lowConfCount = 0;
    let protectedCount = 0;
    let safeApplyCount = 0;

    for (const track of targetTracks) {
      // 1. Phân giải thực thể đa tầng (Tầng 0 -> 1 -> 2 -> 3 -> 4 iTunes)
      const combinedTitle = track.title.includes(' - ') || track.title.includes(' | ')
        ? track.title
        : `${track.artist} - ${track.title}`;

      const res: ResolvedEntityResult = await resolveEntityAsync(
        {
          title: combinedTitle,
          channel: track.artist,
          uploader: track.artist,
        },
        this.channelClassifier,
        this.knownArtistsService,
        this.itunesMatcher,
        { enableItunes: options?.forceItunes ?? true }
      );

      // 2. Kiểm tra tính bảo vệ của Ground Truth
      const existingOverride = overrides.tracks?.[track.id] as { reviewed?: boolean } | undefined;
      const isProtected = Boolean(existingOverride?.reviewed);
      if (isProtected) {
        protectedCount++;
      }

      const origTitleNorm = normalizeCompare(track.title);
      const origArtistNorm = normalizeCompare(track.artist);
      const resTitleNorm = normalizeCompare(res.title);
      const resArtistNorm = normalizeCompare(res.artist);

      const isChanged = origTitleNorm !== resTitleNorm || origArtistNorm !== resArtistNorm;
      if (isChanged) changedCount++;

      // Phát hiện đảo vế
      const isInverted = resArtistNorm === origTitleNorm && origTitleNorm.length > 3;
      if (isInverted) invertedCount++;

      // Phát hiện làm sạch kênh
      const isChannelAbsorbed = this.channelClassifier.isAggregatorChannel(track.artist);
      if (isChannelAbsorbed && !this.channelClassifier.isAggregatorChannel(res.artist)) {
        channelCleanedCount++;
      }

      if (res.confidence === 'high') highConfCount++;
      else if (res.confidence === 'medium') medConfCount++;
      else lowConfCount++;

      let suggestedAction: EntityCandidateItem['suggestedAction'] = 'review_needed';
      let diffNotice: string | undefined;

      if (isProtected) {
        suggestedAction = 'skip';
        if (isChanged) {
          diffNotice = `Bảo vệ Ground Truth: Đã xác minh thủ công ("${track.artist} - ${track.title}"). Khác biệt so với thuật toán ("${res.artist} - ${res.title}").`;
        }
      } else if (res.confidence === 'high' && isChanged) {
        suggestedAction = 'safe_apply';
        safeApplyCount++;
      } else if (!isChanged) {
        suggestedAction = 'skip';
      }

      candidates.push({
        id: track.id,
        originalTitle: track.title,
        originalArtist: track.artist,
        originalAlbum: track.album,
        resolvedTitle: res.title,
        resolvedArtist: res.artist,
        resolvedAlbum: res.album || track.album,
        confidence: res.confidence,
        confidenceReason: res.confidenceReason,
        source: res.source,
        isChanged,
        isInverted,
        isChannelAbsorbed,
        isProtected,
        diffNotice,
        suggestedAction,
      });
    }

    // 3. Xuất file CSV Dry-Run Preview
    const reportsDir = path.dirname(findFile('reports/full_swapped_artist_report.csv'));
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const csvPath = path.resolve(reportsDir, 'ENTITY_RESOLUTION_PREVIEW.csv');
    const headers = 'ID | OriginalTitle | OriginalArtist | ResolvedTitle | ResolvedArtist | ResolvedAlbum | Confidence | Source | Inverted | ChannelCleaned | Protected | SuggestedAction | Reason\n';
    const lines = candidates.map((c) =>
      [
        c.id,
        c.originalTitle,
        c.originalArtist,
        c.resolvedTitle,
        c.resolvedArtist,
        c.resolvedAlbum || '',
        c.confidence,
        c.source,
        c.isInverted ? 'YES' : 'NO',
        c.isChannelAbsorbed ? 'YES' : 'NO',
        c.isProtected ? 'PROTECTED' : 'NO',
        c.suggestedAction,
        c.confidenceReason,
      ].join(' | ')
    );
    fs.writeFileSync(csvPath, headers + lines.join('\n'), 'utf-8');

    // Lưu cache iTunes
    this.itunesMatcher.saveCache();

    return {
      totalTracks: targetTracks.length,
      stats: {
        total: targetTracks.length,
        changed: changedCount,
        invertedResolved: invertedCount,
        channelCleaned: channelCleanedCount,
        highConfidence: highConfCount,
        mediumConfidence: medConfCount,
        lowConfidence: lowConfCount,
        protectedGroundTruth: protectedCount,
        safeApplyCount,
      },
      candidates,
      csvReportPath: csvPath,
    };
  }

  /**
   * Áp dụng an toàn các thay đổi phân giải thực thể vào overrides.json và library.json
   */
  public async apply(options: EntityResolutionApplyOptions): Promise<EntityResolutionApplyResult> {
    const libPath = findFile('library.json');
    const overridesPath = findFile('overrides.json');

    const overrides = await getOverrides();
    let libData: Library = { version: 1, generatedAt: new Date().toISOString(), tracks: [], albums: [] };
    if (fs.existsSync(libPath)) {
      try {
        libData = JSON.parse(fs.readFileSync(libPath, 'utf-8'));
      } catch {
        // bỏ qua lỗi đọc file json
      }
    }

    if (libData.tracks.length === 0 && overrides.tracks && Object.keys(overrides.tracks).length > 0) {
      libData.tracks = Object.entries(overrides.tracks).map(([id, t]) => ({
        id,
        title: t.title || 'Unknown Title',
        artist: t.artist || 'Unknown Artist',
        album: t.album || 'Singles',
        albumId: id,
        file: `music/${id}.mp3`,
        duration: 180,
        storage: 'r2' as const,
      }));
    }

    // 1. Tạo bản sao lưu an toàn có timestamp
    const nowStr = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const overridesBackup = overridesPath.replace(/\.json$/, `.backup.${nowStr}.json`);
    const libraryBackup = libPath.replace(/\.json$/, `.backup.${nowStr}.json`);

    fs.writeFileSync(overridesBackup, JSON.stringify(overrides, null, 2), 'utf-8');
    fs.writeFileSync(libraryBackup, JSON.stringify(libData, null, 2), 'utf-8');

    // 2. Chạy Preview để lấy các ứng viên đã phân giải
    const previewRes = await this.preview({ trackIds: options.trackIds });

    let appliedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    const tracksToApply = options.applyAllHighConfidence
      ? previewRes.candidates.filter((c) => c.suggestedAction === 'safe_apply')
      : previewRes.candidates.filter((c) => {
        if (options.trackIds && options.trackIds.includes(c.id)) {
          if (c.isProtected && !options.forceProtected) return false;
          return true;
        }
        return false;
      });

    if (!overrides.tracks) {
      overrides.tracks = {};
    }

    const trackMap = new Map<string, Track>();
    for (const t of libData.tracks) {
      trackMap.set(t.id, t);
    }

    for (const c of tracksToApply) {
      if (c.isProtected && !options.forceProtected) {
        skippedCount++;
        continue;
      }

      // Cập nhật overrides.json (BẢO TOÀN các trường metadata đã có như cover, loudnessLufs, replayGain)
      const existingOv = overrides.tracks[c.id] || {};
      overrides.tracks[c.id] = {
        ...existingOv,
        title: c.resolvedTitle,
        artist: c.resolvedArtist,
        album: c.resolvedAlbum || c.originalAlbum,
        source: c.source,
        pipelineVersion: '1.5',
        reviewed: true,
      };

      // Cập nhật đối tượng Track trong library
      const existing = trackMap.get(c.id);
      if (existing) {
        existing.title = c.resolvedTitle;
        existing.artist = c.resolvedArtist;
        if (c.resolvedAlbum) {
          existing.album = c.resolvedAlbum;
        }
      }

      appliedCount++;
    }

    // 3. Lưu an toàn overrides.json
    await saveOverrides(overrides);

    // 4. Tái cấu trúc lại Albums và lưu library.json
    // Nhóm các bài hát theo Album và tính lại albumId an toàn
    const albumGroups = new Map<string, { albumName: string; artistName: string; tracks: Track[] }>();
    for (const t of libData.tracks) {
      const albumKey = `${normalizeText(t.album || 'Singles')}_${normalizeText(t.artist)}`;
      let group = albumGroups.get(albumKey);
      if (!group) {
        group = { albumName: t.album || 'Singles', artistName: t.artist, tracks: [] };
        albumGroups.set(albumKey, group);
      }
      group.tracks.push(t);
    }

    libData.albums = Array.from(albumGroups.values()).map((g): Album => {
      const firstTrack = g.tracks[0];
      return {
        id: firstTrack?.albumId || `album_${normalizeText(g.albumName)}`,
        title: g.albumName,
        artist: g.artistName,
        cover: firstTrack?.cover,
        trackIds: g.tracks.map((t) => t.id),
      };
    });
    libData.generatedAt = new Date().toISOString();

    fs.writeFileSync(libPath, JSON.stringify(libData, null, 2), 'utf-8');

    // 5. Đồng bộ lên R2 nếu được yêu cầu
    let syncedToR2 = false;
    if (options.syncToR2) {
      try {
        const config = loadConfig(false);
        if (config) {
          const uploader = new R2Uploader(config);
          await uploader.uploadLibrary(libData);
          syncedToR2 = true;
        }
      } catch (err: unknown) {
        errors.push(`Đồng bộ R2 thất bại: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      success: appliedCount > 0 || skippedCount > 0,
      appliedCount,
      skippedCount,
      backupPaths: {
        overrides: overridesBackup,
        library: libraryBackup,
      },
      syncedToR2,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}

export const defaultEntityResolutionService = new EntityResolutionService();
