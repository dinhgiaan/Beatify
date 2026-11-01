import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Music2,
  Cloud,
  HardDrive,
  FolderCheck,
  History,
  Library,
  FileText,
  Image as ImageIcon,
  ArrowUpRight,
  Play,
  Pause,
  FolderOpen,
  Mic2,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '../../../ui/organisms/PageHeader';
import { Button } from '../../../ui/atoms/Button';
import { AudioFormatBadge, StorageStatusBadge, DownloadTimeDisplay } from '../../../ui/molecules/TrackBadges';
import { formatDownloadDate } from '../../../core/formatters';
import { requestApi } from '../../../core/api-client';
import {
  fetchDependenciesApi,
  fetchDownloadsHistoryApi,
  openDownloadFolderApi,
} from '../../youtube-music/api';
import type { YoutubeMusicDownloadRecord } from '@music-app/shared';
import { toast } from 'sonner';

interface SystemStatus {
  configured: boolean;
  bucket: string;
  accountId: string | null;
  sourceDir: string;
  importDir: string | null;
  fileCount: number;
  totalMB: string;
  syncedMB?: string;
  syncedCount?: number;
  unsyncedMB?: string;
  unsyncedCount?: number;
  freeLimitGB: number;
  usedPercent: string;
}

import type { PlayingTrack } from '../../../app/Layout';

interface DashboardPageProps {
  onPlayTrack?: (track: PlayingTrack) => void;
  onOpenSyncModal?: () => void;
  playingTrackId?: string;
  isAudioPlaying?: boolean;
  onTogglePlayPause?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onPlayTrack,
  onOpenSyncModal,
  playingTrackId,
  isAudioPlaying,
  onTogglePlayPause,
}) => {
  // 1. Fetch System & Storage Status
  const { data: status, refetch: refetchStatus, isFetching: isFetchingStatus } = useQuery<SystemStatus>({
    queryKey: ['system-status'],
    queryFn: () => requestApi<SystemStatus>('/local-api/status'),
    staleTime: 15000,
  });

  // 2. Fetch Dependencies Status
  const {
    data: deps,
    refetch: refetchDeps,
    isFetching: isFetchingDeps,
    isLoading: isLoadingDeps,
  } = useQuery({
    queryKey: ['yt-deps'],
    queryFn: fetchDependenciesApi,
    staleTime: 60000,
  });

  const isDepsLoading = isLoadingDeps || (!deps && isFetchingDeps);

  // 3. Fetch Download History
  const {
    data: history = [],
    refetch: refetchHistory,
    isFetching: isFetchingHistory,
    isLoading: isLoadingHistory,
  } = useQuery<YoutubeMusicDownloadRecord[]>({
    queryKey: ['yt-downloads'],
    queryFn: () => fetchDownloadsHistoryApi(),
    staleTime: 15000,
  });

  const isHistoryLoading = isLoadingHistory || (history.length === 0 && isFetchingHistory);

  // 4. Fetch Toàn bộ kho nhạc Thư viện (để đồng nhất số liệu với ổ cứng máy tính)
  const {
    data: libraryTracks = [],
    refetch: refetchTracks,
    isFetching: isFetchingTracks,
    isLoading: isLoadingTracks,
  } = useQuery<Array<{ id: string; hasLyrics: boolean; hasCover: boolean; isSynced?: boolean }>>({
    queryKey: ['local-tracks'],
    queryFn: async () => {
      const res = await requestApi<{ tracks: Array<{ id: string; hasLyrics: boolean; hasCover: boolean; isSynced?: boolean }> }>('/local-api/tracks');
      return res.tracks || [];
    },
    staleTime: 15000,
  });

  const isTracksLoading = isLoadingTracks || (libraryTracks.length === 0 && isFetchingTracks);
  const isStatusLoading = !status && isFetchingStatus;
  const [metricsScope, setMetricsScope] = React.useState<'library' | 'youtube'>('library');
  const isMetricsLoading = metricsScope === 'library' ? isTracksLoading : isHistoryLoading;

  const isRefreshing = isFetchingStatus || isFetchingDeps || isFetchingHistory;

  const handleRefreshAll = () => {
    refetchStatus();
    refetchDeps();
    refetchHistory();
    refetchTracks();
    toast.success('Đã làm mới dữ liệu Bảng điều khiển');
  };

  // Metrics calculation linh hoạt theo Scope (Kho nhạc thư viện vs Nhạc tải YouTube)
  const metrics = useMemo(() => {
    if (metricsScope === 'library' && libraryTracks.length > 0) {
      const total = libraryTracks.length;
      const uploaded = libraryTracks.filter((t) => t.isSynced).length;
      const withLyrics = libraryTracks.filter((t) => t.hasLyrics).length;
      const withCover = libraryTracks.filter((t) => t.hasCover).length;

      const r2Pct = total > 0 ? ((uploaded / total) * 100).toFixed(0) : '0';
      const lyricsPct = total > 0 ? ((withLyrics / total) * 100).toFixed(0) : '0';
      const coverPct = total > 0 ? ((withCover / total) * 100).toFixed(0) : '0';

      return {
        total,
        uploaded,
        withLyrics,
        withCover,
        r2Pct,
        lyricsPct,
        coverPct,
        ytCount: history.length,
        importedCount: Math.max(0, total - history.length),
      };
    }

    // Mặc định hoặc khi chọn scope youtube
    const total = history.length;
    let uploaded = 0;
    let withLyrics = 0;
    let withCover = 0;

    for (const item of history) {
      if (item.uploadedToR2) uploaded++;
      if (item.lyricsSource && item.lyricsSource !== 'none') withLyrics++;
      if (item.relativeCoverPath || item.coverExists) withCover++;
    }

    const r2Pct = total > 0 ? ((uploaded / total) * 100).toFixed(0) : '0';
    const lyricsPct = total > 0 ? ((withLyrics / total) * 100).toFixed(0) : '0';
    const coverPct = total > 0 ? ((withCover / total) * 100).toFixed(0) : '0';

    return {
      total,
      uploaded,
      withLyrics,
      withCover,
      r2Pct,
      lyricsPct,
      coverPct,
      ytCount: history.length,
      importedCount: Math.max(0, (libraryTracks.length || total) - history.length),
    };
  }, [metricsScope, libraryTracks, history]);

  const recentDownloads = useMemo(() => {
    return [...history].slice(0, 6);
  }, [history]);

  const usedPct = status ? Math.min(100, parseFloat(status.usedPercent) || 0) : 0;
  const storageColor =
    usedPct > 80 ? 'text-rose-400' : usedPct > 50 ? 'text-amber-400' : 'text-emerald-400';

  const handlePlayAudio = (record: YoutubeMusicDownloadRecord) => {
    if (!onPlayTrack) {
      toast.info('Trình phát âm thanh chưa sẵn sàng');
      return;
    }
    const coverUrl = record.relativeCoverPath
      ? `/local-api/static/${encodeURIComponent(record.relativeCoverPath)}`
      : record.videoId && !record.videoId.startsWith('pending_')
        ? `https://i.ytimg.com/vi/${record.videoId}/hqdefault.jpg`
        : `/local-api/covers/${record.id}.jpg`;

    onPlayTrack({
      id: record.id,
      title: record.title || 'Unknown Title',
      artist: record.artist || 'Unknown Artist',
      fileUrl: `/api/youtube-music/downloads/${record.id}/stream`,
      coverUrl,
    });
  };

  const handleOpenFolder = async (record: YoutubeMusicDownloadRecord) => {
    try {
      const res = await openDownloadFolderApi(record.id);
      if (res.opened) {
        toast.success('Đã mở thư mục trong Windows Explorer');
      } else {
        toast.error('Không tìm thấy thư mục của bài hát');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Không thể mở thư mục: ${msg}`);
    }
  };

  return (
    <div className="w-full max-w-[1720px] mx-auto px-8 py-6 space-y-6">
      {/* 1. Header & Actions */}
      <PageHeader
        title="Bảng điều khiển"
        subtitle="Tổng quan kho nhạc cá nhân, trạng thái đồng bộ Cloudflare R2 và công cụ xử lý âm thanh"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefreshAll}
              disabled={isRefreshing}
              className="h-8 px-3 text-xs font-semibold flex items-center gap-1.5"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </Button>

            {onOpenSyncModal && (
              <Button
                variant="primary"
                size="sm"
                onClick={onOpenSyncModal}
                className="h-8 px-3.5 text-xs font-bold bg-[#1DB954] hover:bg-[#1ed760] text-black flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Cloud size={14} className="text-black" />
                <span>Đồng bộ R2 Cloud</span>
              </Button>
            )}
          </div>
        }
      />

      {/* 2. Hero KPI Metric Cards (Grid 4 cột) kèm Toggle Scope thống kê */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <span className="font-semibold text-white">Thống kê dữ liệu:</span>
            <span>{metricsScope === 'library' ? 'Toàn bộ kho nhạc thực tế trên ổ cứng' : 'Các bài hát tải qua YouTube'}</span>
          </div>

          {/* Toggle Scope: Toàn bộ thư viện máy vs Chỉ nhạc YouTube */}
          <div className="relative flex items-center p-0.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] text-[11px] font-semibold">
            {/* Tab 1: Toàn bộ thư viện */}
            <button
              type="button"
              onClick={() => setMetricsScope('library')}
              className={`relative px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 select-none ${
                metricsScope === 'library'
                  ? 'text-emerald-300 font-bold'
                  : 'text-[var(--text-muted)] hover:text-white'
              }`}
            >
              {metricsScope === 'library' && (
                <motion.span
                  layoutId="dashboard-scope-active-bg"
                  className="absolute inset-0 bg-emerald-500/20 rounded-md border border-emerald-500/30 shadow-xs"
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                />
              )}
              <span className="relative z-10">Toàn bộ thư viện</span>
              <span className="relative z-10">
                {isTracksLoading ? (
                  <span className="w-4 h-3 bg-white/10 rounded animate-pulse inline-block align-middle" />
                ) : (
                  <span>({libraryTracks.length || status?.fileCount || 0})</span>
                )}
              </span>
            </button>

            {/* Tab 2: Nhạc tải YouTube */}
            <button
              type="button"
              onClick={() => setMetricsScope('youtube')}
              className={`relative px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 select-none ${
                metricsScope === 'youtube'
                  ? 'text-rose-300 font-bold'
                  : 'text-[var(--text-muted)] hover:text-white'
              }`}
            >
              {metricsScope === 'youtube' && (
                <motion.span
                  layoutId="dashboard-scope-active-bg"
                  className="absolute inset-0 bg-rose-500/20 rounded-md border border-rose-500/35 shadow-xs"
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                />
              )}
              <span className="relative z-10">Nhạc tải YouTube</span>
              <span className="relative z-10">
                {isHistoryLoading ? (
                  <span className="w-4 h-3 bg-white/10 rounded animate-pulse inline-block align-middle" />
                ) : (
                  <span>({history.length})</span>
                )}
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Tổng số bài hát */}
          <motion.div
            whileHover={{ y: -2, transition: { duration: 0.15 } }}
            className="p-4 rounded-xl border bg-[var(--bg-surface)] border-[var(--border)] shadow-xs flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {metricsScope === 'library' ? 'Kho nhạc toàn diện' : 'Bài tải YouTube'}
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#1DB954]/15 text-[#1DB954] flex items-center justify-center">
                <Music2 size={16} />
              </div>
            </div>
            <div className="mt-3">
              {isMetricsLoading ? (
                <div className="space-y-1.5 py-1">
                  <div className="w-20 h-6 bg-white/10 rounded animate-pulse" />
                  <div className="w-36 h-3 bg-white/5 rounded animate-pulse" />
                </div>
              ) : (
                <>
                  <div className="text-2xl font-black text-white tabular-nums tracking-tight">
                    {metrics.total} <span className="text-xs font-normal text-[var(--text-muted)]">bài hát</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                    <span>{metrics.ytCount} từ YouTube • {metrics.importedCount} tệp nhập máy</span>
                  </div>
                </>
              )}
            </div>
          </motion.div>

          {/* Card 2: Đồng bộ Cloudflare R2 */}
          <motion.div
            whileHover={{ y: -2, transition: { duration: 0.15 } }}
            className="p-4 rounded-xl border bg-[var(--bg-surface)] border-[var(--border)] shadow-xs flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Cloudflare R2
              </span>
              <div className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center">
                <Cloud size={16} />
              </div>
            </div>
            <div className="mt-3">
              {isMetricsLoading ? (
                <div className="space-y-1.5 py-1">
                  <div className="w-28 h-6 bg-white/10 rounded animate-pulse" />
                  <div className="w-32 h-3 bg-white/5 rounded animate-pulse" />
                </div>
              ) : (
                <>
                  <div className="text-2xl font-black text-sky-400 tabular-nums tracking-tight">
                    {metrics.uploaded} <span className="text-xs font-normal text-[var(--text-muted)]">/ {metrics.total} bài ({metrics.r2Pct}%)</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                    <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
                    <span>Bucket: <strong className="text-white font-medium">{status?.bucket || 'beatify-music'}</strong></span>
                  </div>
                </>
              )}
            </div>
          </motion.div>

          {/* Card 3: Dung lượng lưu trữ */}
          <motion.div
            whileHover={{ y: -2, transition: { duration: 0.15 } }}
            className="p-4 rounded-xl border bg-[var(--bg-surface)] border-[var(--border)] shadow-xs flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Dung lượng R2 Cloud
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
                <HardDrive size={16} />
              </div>
            </div>
            <div className="mt-3">
              {isStatusLoading ? (
                <div className="space-y-1.5 py-1">
                  <div className="w-24 h-6 bg-white/10 rounded animate-pulse" />
                  <div className="w-full h-1.5 bg-white/5 rounded animate-pulse mt-2" />
                </div>
              ) : (
                <>
                  <div className={`text-2xl font-black tabular-nums tracking-tight ${storageColor}`}>
                    {status?.syncedMB ?? '0'} <span className="text-xs font-normal text-[var(--text-muted)]">MB ({usedPct.toFixed(1)}%)</span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-[var(--bg-subtle)] rounded-full overflow-hidden mt-2">
                    <div
                       className="h-full bg-[#1DB954] rounded-full transition-all duration-300"
                       style={{ width: `${Math.min(100, usedPct)}%` }}
                    />
                  </div>
                  <div className="mt-2 space-y-0.5 text-[11px]">
                    <div className="flex items-center justify-between text-[var(--text-secondary)]">
                      <span>(Đã upload: {status?.syncedMB ?? '0'}MB - {status?.syncedCount ?? 0} bài)</span>
                      <span className="text-[var(--text-muted)]">10 GB Free</span>
                    </div>
                    {Number(status?.unsyncedCount || 0) > 0 && (
                      <div className="text-[10.5px] text-amber-400/90 font-medium">
                        Chưa upload: {status?.unsyncedMB ?? '0'}MB - {status?.unsyncedCount ?? 0} bài
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>

          {/* Card 4: Độ phủ Lời bài hát & Ảnh bìa */}
          <motion.div
            whileHover={{ y: -2, transition: { duration: 0.15 } }}
            className="p-4 rounded-xl border bg-[var(--bg-surface)] border-[var(--border)] shadow-xs flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Metadata & Lời .lrc
              </span>
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center">
                <Mic2 size={16} />
              </div>
            </div>
            <div className="mt-3 space-y-1">
              {isMetricsLoading ? (
                <div className="space-y-2 py-1">
                  <div className="flex items-center justify-between">
                    <div className="w-24 h-3 bg-white/10 rounded animate-pulse" />
                    <div className="w-12 h-3 bg-white/10 rounded animate-pulse" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="w-20 h-3 bg-white/10 rounded animate-pulse" />
                    <div className="w-12 h-3 bg-white/10 rounded animate-pulse" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)] flex items-center gap-1.5">
                      <FileText size={12} className="text-purple-400" />
                      <span>Lời .lrc (Karaoke):</span>
                    </span>
                    <span className="font-bold text-white tabular-nums">{metrics.withLyrics} ({metrics.lyricsPct}%)</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)] flex items-center gap-1.5">
                      <ImageIcon size={12} className="text-emerald-400" />
                      <span>Ảnh bìa 1:1:</span>
                    </span>
                    <span className="font-bold text-white tabular-nums">{metrics.withCover} ({metrics.coverPct}%)</span>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* 3. Công cụ & Trạng thái Engine Hệ thống */}
      <div className="p-4 rounded-xl border bg-[var(--bg-surface)] border-[var(--border)] shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-[#1DB954]" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Môi trường xử lý âm thanh & Engine hệ thống
            </h3>
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">
            Tự động kiểm tra và đồng bộ PATH máy chủ
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* yt-dlp */}
          <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-[var(--text-primary)]">yt-dlp Engine</span>
              {isDepsLoading ? (
                <span className="text-[11px] font-medium text-amber-400 flex items-center gap-1.5 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                  <span>Đang kiểm tra...</span>
                </span>
              ) : (
                <span className={`text-[11px] font-medium ${deps?.ytdlp?.installed ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {deps?.ytdlp?.installed ? '● Sẵn sàng' : '○ Chưa cài đặt'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              Bản phát hành:{' '}
              {isDepsLoading ? (
                <span className="text-zinc-500 italic">Đang phát hiện...</span>
              ) : (
                <strong className="text-white">
                  {(() => {
                    const v = deps?.ytdlp?.version;
                    if (!v) return deps?.ytdlp?.installed ? 'Khả dụng' : 'Không có';
                    const parts = v.split('.');
                    if (parts.length === 3 && parts[0]?.length === 4) {
                      return `${parts[2]}/${parts[1]}/${parts[0]}`;
                    }
                    return v;
                  })()}
                </strong>
              )}
            </p>
            {isDepsLoading ? (
              <p className="text-[10px] text-zinc-500 italic truncate">Đang quét PATH hệ thống...</p>
            ) : deps?.ytdlp?.path ? (
              <p className="text-[10px] text-[var(--text-muted)] truncate select-all" title={deps.ytdlp.path}>
                Đường dẫn: {deps.ytdlp.path}
              </p>
            ) : null}
          </div>

          {/* FFmpeg */}
          <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-[var(--text-primary)]">FFmpeg Engine</span>
              {isDepsLoading ? (
                <span className="text-[11px] font-medium text-amber-400 flex items-center gap-1.5 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                  <span>Đang kiểm tra...</span>
                </span>
              ) : (
                <span className={`text-[11px] font-medium ${deps?.ffmpeg?.installed ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {deps?.ffmpeg?.installed ? '● Hoạt động' : '○ Chưa cài đặt'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              Chức năng: <strong className="text-white">Remux bitstream & Nhúng bìa</strong>
            </p>
            {isDepsLoading ? (
              <p className="text-[10px] text-zinc-500 italic truncate">Đang quét PATH hệ thống...</p>
            ) : deps?.ffmpeg?.path ? (
              <p className="text-[10px] text-[var(--text-muted)] truncate select-all" title={deps.ffmpeg.path}>
                Đường dẫn: {deps.ffmpeg.path}
              </p>
            ) : null}
          </div>

          {/* Node.js */}
          <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-[var(--text-primary)]">Node.js Runtime</span>
              <span className="text-[11px] font-medium text-emerald-400">
                ● Phục vụ Server
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              Phiên bản:{' '}
              {isDepsLoading ? (
                <span className="text-zinc-500 italic">Đang kiểm tra...</span>
              ) : (
                <strong className="text-white">{deps?.runtime?.version || 'v24.x'}</strong>
              )}
            </p>
            <p className="text-[10px] text-[var(--text-muted)] truncate">
              Cổng API: <strong className="text-white">127.0.0.1:4000</strong>
            </p>
          </div>
        </div>
      </div>

      {/* 4. Bài hát tải gần đây & Lối tắt nhanh */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cột trái (2/3): Bảng bài hát tải gần đây */}
        <div className="lg:col-span-2 p-4 rounded-xl border bg-[var(--bg-surface)] border-[var(--border)] shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
            <div className="flex items-center gap-2">
              <History size={16} className="text-[#1DB954]" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Bài hát đã tải gần đây
              </h3>
            </div>
            <Link
              to="/youtube-music/history"
              className="text-xs font-medium text-[#1DB954] hover:underline flex items-center gap-1.5"
            >
              <span>Xem tất cả</span>
              {isHistoryLoading ? (
                <span className="w-5 h-3 bg-white/10 rounded animate-pulse inline-block align-middle" />
              ) : (
                <span>({history.length})</span>
              )}
              <ArrowUpRight size={13} />
            </Link>
          </div>

          {isHistoryLoading ? (
            <div className="space-y-2 py-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-subtle)]/60 border border-[var(--border)]/60 animate-pulse"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-5 h-3 bg-white/10 rounded shrink-0" />
                    <div className="w-9 h-9 rounded-md bg-white/10 shrink-0" />
                    <div className="space-y-1.5 min-w-0">
                      <div className="w-36 sm:w-52 h-3.5 bg-white/10 rounded" />
                      <div className="w-24 sm:w-32 h-2.5 bg-white/5 rounded" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-14 h-4 bg-white/5 rounded hidden sm:block" />
                    <div className="w-9 h-5 bg-white/10 rounded" />
                    <div className="w-12 h-5 bg-white/10 rounded" />
                    <div className="w-6 h-6 bg-white/10 rounded-full" />
                    <div className="w-6 h-6 bg-white/10 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentDownloads.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-muted)] flex flex-col items-center justify-center gap-2">
              <Music2 size={24} className="opacity-30" />
              <span>Chưa có bài hát nào được tải về. Hãy nhập link YouTube để bắt đầu tải!</span>
            </div>
          ) : (
            <div className="space-y-1.5 animate-in fade-in duration-200">
              {recentDownloads.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors border border-transparent hover:border-[var(--border)] group text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-5 text-center text-[var(--text-muted)]  text-[11px] shrink-0">
                      {idx + 1}
                    </span>

                    {/* Thumbnail */}
                    <div className="w-9 h-9 rounded-md bg-[var(--bg-subtle)] border border-[var(--border)] overflow-hidden shrink-0 relative">
                      {item.relativeCoverPath ? (
                        <img
                          src={`/api/youtube-music/downloads/${item.id}/cover`}
                          alt={item.title || 'Track cover'}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                          <Music2 size={14} />
                        </div>
                      )}
                    </div>

                    {/* Tiêu đề & Nghệ sĩ */}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-white truncate max-w-[200px] sm:max-w-xs md:max-w-sm">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] truncate max-w-[240px] flex items-center gap-1.5">
                        <span className="truncate">{item.artist}</span>
                        {item.album && (
                          <>
                            <span>•</span>
                            <span className="truncate">{item.album}</span>
                          </>
                        )}
                        <span className="sm:hidden text-[10px] text-[var(--text-muted)] opacity-80">
                          • {formatDownloadDate(item.createdAt).relative}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Thời gian tải (Download Date & Time) - Hiển thị chuẩn như bên Lịch sử */}
                  <div className="hidden sm:flex items-center px-3 shrink-0">
                    <DownloadTimeDisplay dateStr={item.createdAt} />
                  </div>

                  {/* Actions & Format */}
                  <div className="flex items-center gap-2 shrink-0">
                    <AudioFormatBadge format={item.format} />
                    <StorageStatusBadge fileExists={item.fileExists} uploadedToR2={item.uploadedToR2} />

                    <button
                      type="button"
                      disabled={item.fileExists === false}
                      onClick={() => {
                        if (item.fileExists === false) {
                          toast.error('Tệp không tồn tại trên ổ cứng');
                          return;
                        }
                        if (playingTrackId === item.id && isAudioPlaying) {
                          onTogglePlayPause?.();
                        } else {
                          handlePlayAudio(item);
                        }
                      }}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${playingTrackId === item.id && isAudioPlaying
                          ? 'bg-[#1DB954] text-black shadow-md'
                          : 'bg-[var(--bg-subtle)] hover:bg-[#1DB954] hover:text-black text-white'
                        }`}
                      title={
                        item.fileExists === false
                          ? 'Tệp đã bị xóa khỏi đĩa cứng'
                          : playingTrackId === item.id && isAudioPlaying
                            ? 'Tạm dừng'
                            : 'Phát nghe thử'
                      }
                    >
                      {playingTrackId === item.id && isAudioPlaying ? (
                        <Pause size={12} fill="currentColor" />
                      ) : (
                        <Play size={12} fill="currentColor" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenFolder(item)}
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                      title="Mở thư mục chứa file"
                    >
                      <FolderOpen size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cột phải (1/3): Lối tắt tính năng nhanh */}
        <div className="p-4 rounded-xl border bg-[var(--bg-surface)] border-[var(--border)] shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Lối tắt tính năng
            </h3>
          </div>

          <div className="space-y-2">
            <Link
              to="/youtube-music"
              className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[#1DB954]/10 border border-[var(--border)] hover:border-[#1DB954]/30 transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#1DB954]/15 text-[#1DB954] flex items-center justify-center shrink-0">
                  <Music2 size={16} />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-[#1DB954] transition-colors">
                    Tải nhạc YouTube
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Tải audio, metadata & lời .lrc tự động
                  </div>
                </div>
              </div>
              <ArrowUpRight size={14} className="text-[var(--text-muted)] group-hover:text-[#1DB954] transition-colors" />
            </Link>

            <Link
              to="/youtube-music/manager"
              className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[#1DB954]/10 border border-[var(--border)] hover:border-[#1DB954]/30 transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
                  <FolderCheck size={16} />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-sky-400 transition-colors">
                    Quản lý bài đã tải
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Kiểm tra file đĩa & Upload lên Cloudflare R2
                  </div>
                </div>
              </div>
              <ArrowUpRight size={14} className="text-[var(--text-muted)] group-hover:text-sky-400 transition-colors" />
            </Link>

            <Link
              to="/youtube-music/history"
              className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[#1DB954]/10 border border-[var(--border)] hover:border-[#1DB954]/30 transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                  <History size={16} />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-purple-400 transition-colors">
                    Lịch sử tải nhạc
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Tra cứu metadata, thẻ Vorbis/ID3 và lời .lrc
                  </div>
                </div>
              </div>
              <ArrowUpRight size={14} className="text-[var(--text-muted)] group-hover:text-purple-400 transition-colors" />
            </Link>

            <Link
              to="/library"
              className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-subtle)] hover:bg-[#1DB954]/10 border border-[var(--border)] hover:border-[#1DB954]/30 transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                  <Library size={16} />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors">
                    Thư viện bài hát
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Duyệt album, ca sĩ và danh sách phát
                  </div>
                </div>
              </div>
              <ArrowUpRight size={14} className="text-[var(--text-muted)] group-hover:text-amber-400 transition-colors" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
