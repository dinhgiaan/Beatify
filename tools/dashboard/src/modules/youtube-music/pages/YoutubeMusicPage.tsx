import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Download,
  AlertCircle,
  RefreshCw,
  StopCircle,
  Link2,
  Music,
  Folder,
  FolderCheck,
  Search,
  Edit3,
  Clipboard,
  Radio,
  Layers,
  FileMusic,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  Sparkles,
} from 'lucide-react';
import { PageHeader } from '../../../ui/organisms/PageHeader';
import { Button } from '../../../ui/atoms/Button';
import { Select, Badge, Checkbox } from '../../../ui/atoms/Controls';
import { Tooltip } from '../../../ui/atoms/Tooltip';
import { CustomFolderDialog } from '../components/CustomFolderDialog';
import { MetadataEditDialog } from '../components/MetadataEditDialog';
import { LyricsEditorDialog } from '../components/LyricsEditorDialog';
import { CoverViewerDialog } from '../components/CoverViewerDialog';
import {
  fetchDependenciesApi,
  updateDependenciesApi,
  previewMusicApi,
  createDownloadJobApi,
  stopDownloadJobApi,
  fetchYoutubeMusicConfigApi,
} from '../api';
import { fetchArtistsApi } from '../../artists/api';
import { useJobSSE } from '../../../core/use-sse';
import type {
  YoutubeMusicFormat,
  YoutubeMusicPreviewResponse,
  YoutubeMusicPreviewItem,
  YoutubeMusicJobPayload,
  JobEvent,
} from '@music-app/shared';

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatEstimatedSize(durationSeconds?: number, format: YoutubeMusicFormat = 'm4a'): string {
  if (!durationSeconds || durationSeconds <= 0) return '';
  const kbpsRate = format === 'm4a' ? 32 : format === 'opus' ? 20 : format === 'mp3' ? 40 : 100;
  const sizeMb = (durationSeconds * kbpsRate + 350) / 1024;
  return `~${sizeMb.toFixed(1)} MB`;
}

// Chuyển đổi ngày phiên bản YYYY.MM.DD sang DD/MM/YYYY chuẩn Việt Nam
function formatYtdlpDate(versionStr?: string | null): string {
  if (!versionStr) return '';
  const match = versionStr.match(/^(\d{4})[.-](\d{2})[.-](\d{2})/);
  if (match && match[1] && match[2] && match[3]) {
    const [, year, month, day] = match;
    return `${day}/${month}/${year}`;
  }
  return versionStr;
}

// Trích xuất thông tin phiên bản & ngày build của FFmpeg
function parseFfmpegInfo(versionStr?: string | null): { tag: string | null; date: string | null } {
  if (!versionStr) return { tag: null, date: null };
  const dateMatch = versionStr.match(/(\d{4})[-.]?(\d{2})[-.]?(\d{2})/);
  let dateFormatted: string | null = null;
  if (dateMatch && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
    const [, year, month, day] = dateMatch;
    const m = parseInt(month || '0', 10);
    const d = parseInt(day || '0', 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      dateFormatted = `${day}/${month}/${year}`;
    }
  }
  const tagMatch = versionStr.match(/version\s+([N\d][^\s,]+)/i);
  let tag: string | null = tagMatch ? tagMatch[1] ?? null : null;
  if (tag && tag.includes('-g')) {
    tag = tag.split('-g')[0] ?? tag;
  }
  return { tag, date: dateFormatted };
}

export const YoutubeMusicPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [urlInput, setUrlInput] = useState<string>(() => {
    try {
      return sessionStorage.getItem('yt_url_input') || '';
    } catch {
      return '';
    }
  });

  const [previewData, setPreviewData] = useState<YoutubeMusicPreviewResponse | null>(() => {
    try {
      const saved = sessionStorage.getItem('yt_preview_data');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem('yt_selected_ids');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Configuration State
  const [preferredFormat, setPreferredFormat] = useState<YoutubeMusicFormat>('m4a');
  const [fetchLyrics, setFetchLyrics] = useState(true);
  const [concurrency, setConcurrency] = useState(2);
  const [libraryRootPath, setLibraryRootPath] = useState('');

  // Overrides per item
  const [itemOverrides, setItemOverrides] = useState<
    Record<
      string,
      {
        id?: string;
        cleanTitle?: string;
        artist?: string;
        album?: string;
        year?: number;
        duration?: number;
        customLyrics?: string;
        customFolder?: string;
        thumbnailUrl?: string;
        channelUrl?: string;
      }
    >
  >(() => {
    try {
      const saved = sessionStorage.getItem('yt_item_overrides');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [customFolderMap, setCustomFolderMap] = useState<Record<string, string>>({});

  // Lưu state vào sessionStorage để khi chuyển trang khác rồi quay lại không bị mất
  useEffect(() => {
    try {
      if (urlInput) {
        sessionStorage.setItem('yt_url_input', urlInput);
      } else {
        sessionStorage.removeItem('yt_url_input');
      }
    } catch {
      // ignore
    }
  }, [urlInput]);

  useEffect(() => {
    try {
      if (previewData) {
        sessionStorage.setItem('yt_preview_data', JSON.stringify(previewData));
      } else {
        sessionStorage.removeItem('yt_preview_data');
      }
    } catch {
      // ignore
    }
  }, [previewData]);

  useEffect(() => {
    try {
      sessionStorage.setItem('yt_selected_ids', JSON.stringify(Array.from(selectedIds)));
    } catch {
      // ignore
    }
  }, [selectedIds]);

  useEffect(() => {
    try {
      sessionStorage.setItem('yt_item_overrides', JSON.stringify(itemOverrides));
    } catch {
      // ignore
    }
  }, [itemOverrides]);

  // Active Job State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<{
    percent: number;
    message: string;
    status: string;
  } | null>(null);

  // Dialog States
  const [editingItem, setEditingItem] = useState<YoutubeMusicPreviewItem | null>(null);
  const [lyricsEditingItem, setLyricsEditingItem] = useState<YoutubeMusicPreviewItem | null>(null);
  const [viewingCover, setViewingCover] = useState<{
    url: string;
    title: string;
    artist: string;
  } | null>(null);
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [folderDialogTargetIds, setFolderDialogTargetIds] = useState<string[]>([]);

  // 1. Fetch Dependency Status
  const { data: deps, refetch: refetchDeps } = useQuery({
    queryKey: ['yt-deps'],
    queryFn: fetchDependenciesApi,
    staleTime: 60000,
  });

  const ffmpegInfo = parseFfmpegInfo(deps?.ffmpeg.version);

  // 2. Fetch Config
  const { data: config } = useQuery({
    queryKey: ['yt-config'],
    queryFn: fetchYoutubeMusicConfigApi,
    staleTime: 60000,
  });

  // 3. Fetch Artists List để tự động phát hiện thư mục nghệ sĩ có sẵn trong thư viện
  const { data: artistsData } = useQuery({
    queryKey: ['artists-list'],
    queryFn: fetchArtistsApi,
    staleTime: 60000,
  });

  // Map tra cứu thư mục của nghệ sĩ trong thư viện
  const artistFolderMap = useMemo(() => {
    const map = new Map<string, { artistName: string; folderPath: string; trackCount: number }>();
    if (!artistsData?.artists) return map;
    for (const a of artistsData.artists) {
      if (a.folderPath) {
        const normKey = a.name.normalize('NFC').toLowerCase().trim();
        map.set(normKey, {
          artistName: a.name,
          folderPath: a.folderPath,
          trackCount: a.trackCount,
        });
      }
    }
    return map;
  }, [artistsData]);

  // Helper tìm thư mục của nghệ sĩ nếu đã tồn tại trong thư viện máy tính
  const getExistingArtistFolder = (artistName?: string | null) => {
    if (!artistName) return null;
    const norm = artistName.normalize('NFC').toLowerCase().trim();
    return artistFolderMap.get(norm) || null;
  };

  useEffect(() => {
    if (config) {
      if (config.libraryRootPath) setLibraryRootPath(config.libraryRootPath);
      if (config.preferredFormat) setPreferredFormat(config.preferredFormat);
      if (config.fetchLyrics !== undefined) setFetchLyrics(config.fetchLyrics);
      if (config.concurrency) setConcurrency(config.concurrency);
    }
  }, [config]);

  // 3. SSE Listener for Active Job
  useJobSSE(activeJobId, (event: JobEvent) => {
    setJobProgress({
      percent: event.progress.percentage,
      message: event.progress.message || '',
      status: event.status,
    });

    if (event.status === 'completed') {
      toast.success('Đã tải hoàn tất toàn bộ danh sách bài hát!');
      setActiveJobId(null);
      // Cập nhật trạng thái xem trước sang "Đã tải"
      setPreviewData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((item) => {
            if (selectedIds.has(item.id)) {
              return {
                ...item,
                isAlreadyDownloaded: true,
                fileMissing: false,
              };
            }
            return item;
          }),
        };
      });
      queryClient.invalidateQueries({ queryKey: ['yt-downloads'] });
      queryClient.invalidateQueries({ queryKey: ['yt-downloads-manager'] });
      queryClient.invalidateQueries({ queryKey: ['youtube-music-history'] });
      queryClient.invalidateQueries({ queryKey: ['local-tracks'] });
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
    } else if (event.status === 'failed') {
      toast.error(`Tiến trình tải thất bại: ${event.error?.detail || 'Lỗi không xác định'}`);
      setActiveJobId(null);
    } else if (event.status === 'stopped') {
      toast.info('Tiến trình tải đã được dừng.');
      setActiveJobId(null);
    }
  });

  const totalPages = Math.max(1, Math.ceil((previewData?.items.length || 0) / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentItems = previewData ? previewData.items.slice(startIndex, endIndex) : [];

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const totalSelectedEstimatedSize = React.useMemo(() => {
    if (!previewData || selectedIds.size === 0) return '';
    const totalSeconds = previewData.items
      .filter((i) => selectedIds.has(i.id))
      .reduce((acc, i) => acc + (i.duration || 0), 0);
    return formatEstimatedSize(totalSeconds, preferredFormat);
  }, [previewData, selectedIds, preferredFormat]);

  // Quick selection helpers
  const handleSelectOnlyWithLrc = () => {
    if (!previewData) return;
    const next = new Set<string>();
    previewData.items.forEach((item) => {
      const hasCustom = Boolean(itemOverrides[item.url]?.customLyrics || itemOverrides[item.id]?.customLyrics);
      if (item.lyricsSource === 'lrclib-synced' || item.lyricsSource === 'yt-subs' || hasCustom) {
        next.add(item.id);
      }
    });
    setSelectedIds(next);
    toast.info(`Đã chọn ${next.size} bài có lời đồng bộ (.lrc)`);
  };

  const handleSelectOnlyUnDownloaded = () => {
    if (!previewData) return;
    const next = new Set<string>();
    previewData.items.forEach((item) => {
      if (!item.isAlreadyDownloaded || item.fileMissing) {
        next.add(item.id);
      }
    });
    setSelectedIds(next);
    toast.info(`Đã chọn ${next.size} bài chưa có trong máy`);
  };

  // 4. Preview Mutation
  const previewMutation = useMutation({
    mutationFn: previewMusicApi,
    onSuccess: (res) => {
      setPreviewData(res);
      setSelectedIds(new Set(res.items.map((i) => i.id)));
      setCurrentPage(1);
      toast.success(
        res.isPlaylist
          ? `Đã phân tích playlist: ${res.playlistTitle} (${res.totalCount} bài)`
          : `Đã phân tích thành công: ${res.items[0]?.cleanTitle || '1 bài hát'}`
      );
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi phân tích bài hát: ${msg}`);
    },
  });

  // 5. Update yt-dlp Mutation
  const updateDepsMutation = useMutation({
    mutationFn: updateDependenciesApi,
    onSuccess: (res) => {
      toast.success(res.output || 'Đã cập nhật yt-dlp lên phiên bản mới nhất!');
      refetchDeps();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi cập nhật yt-dlp: ${msg}`);
    },
  });

  // 6. Download Job Mutation
  const downloadJobMutation = useMutation({
    mutationFn: createDownloadJobApi,
    onSuccess: ({ jobId }) => {
      setActiveJobId(jobId);
      setJobProgress({ percent: 0, message: 'Đang bắt đầu tải...', status: 'running' });
      toast.success('Đã tạo tiến trình tải nhạc thành công!');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Không thể bắt đầu tải: ${msg}`);
    },
  });

  const handlePreview = () => {
    const urls = urlInput
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urls.length === 0) {
      toast.error('Vui lòng dán ít nhất 1 đường dẫn YouTube hoặc YouTube Music');
      return;
    }

    previewMutation.mutate({ urls });
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrlInput((prev) => (prev ? `${prev}\n${text.trim()}` : text.trim()));
        toast.success('Đã dán liên kết từ clipboard!');
      }
    } catch {
      toast.error('Không thể đọc dữ liệu từ clipboard');
    }
  };

  const handleStartDownload = () => {
    if (!previewData || previewData.items.length === 0) return;

    const selectedItems = previewData.items.filter((i) => selectedIds.has(i.id));
    if (selectedItems.length === 0) {
      toast.error('Vui lòng chọn ít nhất 1 bài hát để tải về');
      return;
    }

    const mergedOverrides: Record<
      string,
      {
        id?: string;
        cleanTitle?: string;
        artist?: string;
        album?: string;
        year?: number;
        duration?: number;
        customLyrics?: string;
        customFolder?: string;
        thumbnailUrl?: string;
        channelUrl?: string;
      }
    > = { ...itemOverrides };

    const finalFolderMap: Record<string, string> = { ...customFolderMap };
    for (let idx = 0; idx < selectedItems.length; idx++) {
      const item = selectedItems[idx];
      const folder = customFolderMap[item.url] || customFolderMap[item.id];
      if (folder) {
        finalFolderMap[item.url] = folder;
        finalFolderMap[item.id] = folder;
        finalFolderMap[`item_${idx}`] = folder;
      }
    }

    for (const item of selectedItems) {
      const explicitUrlOverride = itemOverrides[item.url] || {};
      const explicitIdOverride = itemOverrides[item.id] || {};
      const chosenFolder = customFolderMap[item.url] || customFolderMap[item.id];
      mergedOverrides[item.url] = {
        id: item.id,
        cleanTitle: item.cleanTitle,
        artist: item.artist,
        album: item.album,
        year: item.year,
        duration: item.duration,
        thumbnailUrl: item.thumbnailUrl,
        channelUrl: item.channelUrl,
        customLyrics: item.customLyrics,
        customFolder: chosenFolder,
        ...explicitIdOverride,
        ...explicitUrlOverride,
      };
    }

    const payload: YoutubeMusicJobPayload = {
      urls: selectedItems.map((i) => i.url),
      libraryRootPath: libraryRootPath || 'D:\\Music',
      preferredFormat,
      fetchLyrics,
      useGeminiCleaning: true,
      concurrency,
      maxItemsPerJob: 100,
      customFolderMap: finalFolderMap,
      itemOverrides: mergedOverrides,
    };

    downloadJobMutation.mutate(payload);
  };

  const handleStopJob = async () => {
    if (!activeJobId) return;
    try {
      await stopDownloadJobApi(activeJobId);
      toast.info('Đang yêu cầu dừng tiến trình tải...');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi khi dừng: ${msg}`);
    }
  };

  const toggleSelectAll = () => {
    if (!previewData) return;
    if (selectedIds.size === previewData.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(previewData.items.map((i) => i.id)));
    }
  };

  const toggleSelectItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCustomFolderForSelected = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      toast.error('Vui lòng chọn bài hát để áp dụng thư mục');
      return;
    }
    setFolderDialogTargetIds(ids);
    setIsFolderDialogOpen(true);
  };

  const handleAutoMatchFolders = () => {
    if (!previewData || previewData.items.length === 0) return;

    const targets = selectedIds.size > 0
      ? previewData.items.filter((i) => selectedIds.has(i.id))
      : previewData.items;

    let matchedCount = 0;
    const newCustomFolderMap = { ...customFolderMap };

    for (const item of targets) {
      const match = getExistingArtistFolder(item.artist);
      if (match) {
        newCustomFolderMap[item.id] = match.folderPath;
        newCustomFolderMap[item.url] = match.folderPath;
        matchedCount++;
      }
    }

    if (matchedCount > 0) {
      setCustomFolderMap(newCustomFolderMap);
      toast.success(`Đã tự động khớp thư mục lưu cho ${matchedCount} bài hát theo thư viện có sẵn!`);
    } else {
      toast.info('Chưa tìm thấy thư mục của nghệ sĩ này trong thư viện máy tính.');
    }
  };

  return (
    <div className="w-full max-w-[1720px] mx-auto px-8 py-6 space-y-6">
      <PageHeader
        title="Tải nhạc YouTube"
        subtitle="Tải audio, bìa album 1:1 và lời bài hát .lrc"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AnimatePresence mode="wait">
              {!deps ? (
                <motion.div
                  key="deps-loading"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="h-8 flex items-center gap-2 px-3 rounded-lg border text-xs select-none shadow-sm"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border)',
                  }}
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1DB954] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1DB954]" />
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)] font-medium">
                    Đang kiểm tra hệ thống...
                  </span>
                  <div className="flex items-center gap-1.5 opacity-50">
                    <div className="w-10 h-2 rounded bg-[var(--text-muted)] animate-pulse" />
                    <span className="text-[var(--border)]">|</span>
                    <div className="w-10 h-2 rounded bg-[var(--text-muted)] animate-pulse" />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="deps-loaded"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  transition={{
                    width: { type: 'spring', stiffness: 220, damping: 25 },
                    opacity: { duration: 0.25 },
                  }}
                  className="overflow-hidden"
                >
                  <div
                    className="h-8 flex items-center gap-1.5 px-2.5 rounded-lg border text-xs select-none shadow-sm whitespace-nowrap"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {/* 1. Tooltip yt-dlp */}
                    <Tooltip
                      position="bottom"
                      align="end"
                      content={
                        <div className="space-y-1.5 w-80 max-w-[360px] p-1">
                          <div className="flex items-center justify-between pb-1 border-b border-[var(--border)]">
                            <span className="font-semibold text-xs text-[var(--text-primary)]">yt-dlp Engine</span>
                            <span className={`text-[11px] font-medium ${deps.ytdlp.installed ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {deps.ytdlp.installed ? 'Hoạt động tốt' : 'Chưa cài đặt'}
                            </span>
                          </div>

                          <div className="space-y-1 text-[11px]">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[var(--text-muted)] shrink-0">Bản phát hành (Version):</span>
                              <span className="font-semibold text-[var(--text-primary)]">
                                {formatYtdlpDate(deps.ytdlp.version) || deps.ytdlp.version || 'Khả dụng'}
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[var(--text-muted)] shrink-0">Trạng thái phiên bản:</span>
                              <span className="text-right text-[10.5px] text-[var(--text-secondary)]">
                                {deps.ytdlp.canUpdate
                                  ? 'Bản chính thức (Quản lý qua WinGet / CLI)'
                                  : 'Bản mới nhất hệ thống'}
                              </span>
                            </div>
                            <p className="text-[10px] text-[var(--text-muted)] m-0 leading-normal italic">
                              * yt-dlp quy ước số phiên bản theo ngày phát hành chính thức (CalVer: dd/mm/yyyy).
                            </p>
                          </div>

                          <p className="text-[10.5px] text-[var(--text-muted)] m-0 leading-normal">
                            Trình trích xuất & tải bitstream âm thanh Opus/AAC gốc từ YouTube Music với tốc độ tối đa.
                          </p>

                          {deps.ytdlp.path && (
                            <div className="pt-1.5 border-t border-[var(--border)] space-y-0.5">
                              <span className="text-[10px] font-semibold text-[var(--text-secondary)] block">
                                Đường dẫn tệp thực thi đầy đủ (Full Path):
                              </span>
                              <div className="text-[10px] text-[var(--text-muted)] break-all bg-[var(--bg-subtle)] px-2 py-1 rounded border border-[var(--border)] leading-tight select-all ">
                                {deps.ytdlp.path}
                              </div>
                            </div>
                          )}
                        </div>
                      }
                    >
                      <div className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-[var(--bg-hover)] transition-colors cursor-pointer">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${deps.ytdlp.installed ? 'bg-[#1DB954]' : 'bg-rose-500'
                            }`}
                        />
                        <span className="font-medium text-xs">yt-dlp</span>
                        {deps.ytdlp.version && (
                          <span className="text-[11px] text-[var(--text-muted)] ">
                            {formatYtdlpDate(deps.ytdlp.version)}
                          </span>
                        )}
                      </div>
                    </Tooltip>

                    <span className="text-[var(--border)] select-none shrink-0">|</span>

                    {/* 2. Tooltip FFmpeg */}
                    <Tooltip
                      position="bottom"
                      align="end"
                      content={
                        <div className="space-y-1.5 w-80 max-w-[360px] p-1">
                          <div className="flex items-center justify-between pb-1 border-b border-[var(--border)]">
                            <span className="font-semibold text-xs text-[var(--text-primary)]">FFmpeg Engine</span>
                            <span className={`text-[11px] font-medium ${deps.ffmpeg.installed ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {deps.ffmpeg.installed ? 'Hoạt động tốt' : 'Chưa cài đặt'}
                            </span>
                          </div>

                          <div className="space-y-1 text-[11px]">
                            {ffmpegInfo.date && (
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-[var(--text-muted)] shrink-0">Bản phát hành / Build:</span>
                                <span className="font-semibold text-[var(--text-primary)]">
                                  {ffmpegInfo.date} {ffmpegInfo.tag ? `(${ffmpegInfo.tag})` : ''}
                                </span>
                              </div>
                            )}
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[var(--text-muted)] shrink-0">Trạng thái phiên bản:</span>
                              <span className="text-right text-[10.5px] text-[var(--text-secondary)]">
                                Bản build hệ thống (Quản lý qua WinGet)
                              </span>
                            </div>
                            <p className="text-[10px] text-[var(--text-muted)] m-0 leading-normal italic">
                              * FFmpeg Gyan/WinGet cung cấp bản build rolling release tối ưu hóa xử lý đa luồng & âm thanh chất lượng cao.
                            </p>
                          </div>

                          <p className="text-[10.5px] text-[var(--text-muted)] m-0 leading-normal">
                            Remux stream gốc sang .opus/.m4a không suy hao (stream copy), nhúng ảnh bìa 1:1 và Vorbis Comment/ID3.
                          </p>

                          {deps.ffmpeg.path && (
                            <div className="pt-1.5 border-t border-[var(--border)] space-y-0.5">
                              <span className="text-[10px] font-semibold text-[var(--text-secondary)] block">
                                Đường dẫn tệp thực thi đầy đủ (Full Path):
                              </span>
                              <div className="text-[10px] text-[var(--text-muted)] break-all bg-[var(--bg-subtle)] px-2 py-1 rounded border border-[var(--border)] leading-tight select-all ">
                                {deps.ffmpeg.path}
                              </div>
                            </div>
                          )}
                        </div>
                      }
                    >
                      <div className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-[var(--bg-hover)] transition-colors cursor-pointer">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${deps.ffmpeg.installed ? 'bg-[#1DB954]' : 'bg-rose-500'
                            }`}
                        />
                        <span className="font-medium text-xs">ffmpeg</span>
                        {ffmpegInfo.date && (
                          <span className="text-[11px] text-[var(--text-muted)] ">
                            {ffmpegInfo.date}
                          </span>
                        )}
                      </div>
                    </Tooltip>

                    <span className="text-[var(--border)] select-none shrink-0">|</span>

                    {/* 3. Tooltip JS Runtime */}
                    <Tooltip
                      position="bottom"
                      align="end"
                      content={
                        <div className="space-y-1.5 w-80 max-w-[360px] p-1">
                          <div className="flex items-center justify-between pb-1 border-b border-[var(--border)]">
                            <span className="font-semibold text-xs text-[var(--text-primary)]">JavaScript Runtime</span>
                            <span className="text-[11px] font-medium text-emerald-400">
                              Sẵn sàng ({deps.runtime.type.toUpperCase()})
                            </span>
                          </div>

                          <div className="space-y-1 text-[11px]">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[var(--text-muted)] shrink-0">Môi trường thực thi:</span>
                              <span className="font-semibold text-[var(--text-primary)]">
                                Node.js {deps.runtime.version}
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[var(--text-muted)] shrink-0">Trạng thái:</span>
                              <span className="text-right text-[10.5px] text-[var(--text-secondary)]">
                                Đang phục vụ Web Server & Worker Queue
                              </span>
                            </div>
                          </div>

                          <p className="text-[10.5px] text-[var(--text-muted)] m-0 leading-normal">
                            Nền tảng chạy backend cục bộ, xử lý hàng đợi tải song song và điều khiển sub-process.
                          </p>

                          {deps.runtime.path && (
                            <div className="pt-1.5 border-t border-[var(--border)] space-y-0.5">
                              <span className="text-[10px] font-semibold text-[var(--text-secondary)] block">
                                Đường dẫn tệp thực thi đầy đủ (Full Path):
                              </span>
                              <div className="text-[10px] text-[var(--text-muted)] break-all bg-[var(--bg-subtle)] px-2 py-1 rounded border border-[var(--border)] leading-tight select-all ">
                                {deps.runtime.path}
                              </div>
                            </div>
                          )}
                        </div>
                      }
                    >
                      <div className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-[var(--bg-hover)] transition-colors cursor-pointer">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                        <span className="font-medium text-xs">Node</span>
                        {deps.runtime.version && (
                          <span className="text-[11px] text-[var(--text-muted)] ">
                            {deps.runtime.version}
                          </span>
                        )}
                      </div>
                    </Tooltip>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Nút làm mới trạng thái Dependencies */}
            <Tooltip position="bottom" align="end" content="Kiểm tra và làm mới trạng thái môi trường công cụ">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => refetchDeps()}
                className="gap-1.5 font-semibold text-xs h-8 px-2.5"
                title="Làm mới dependencies"
              >
                <RefreshCw size={12} />
              </Button>
            </Tooltip>

            {deps?.ytdlp.canUpdate && (
              <Tooltip position="bottom" align="end" content="Kiểm tra và nâng cấp yt-dlp lên bản mới nhất qua WinGet">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => updateDepsMutation.mutate()}
                  disabled={updateDepsMutation.isPending}
                  className="gap-1.5 font-semibold text-xs h-8 px-3"
                >
                  <RefreshCw size={13} className={updateDepsMutation.isPending ? 'animate-spin' : ''} />
                  <span>Cập nhật yt-dlp</span>
                </Button>
              </Tooltip>
            )}
          </div>
        }
      />

      {/* Cảnh báo thiếu dependencies nếu có */}
      {deps && !deps.ready && (
        <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-[12px] flex items-start gap-2.5 animate-in fade-in">
          <AlertCircle size={16} className="shrink-0 text-rose-400 mt-0.5" />
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="font-semibold text-rose-200 flex items-center gap-1.5">
              <span>Hệ thống chưa tìm thấy:</span>
              <span className=" text-white underline">
                {[!deps.ytdlp.installed && 'yt-dlp', !deps.ffmpeg.installed && 'ffmpeg'].filter(Boolean).join(' & ')}
              </span>
            </div>
            <div className="text-[11.5px] opacity-90">
              Mở PowerShell và chạy lệnh sau để tự động cài đặt qua WinGet:
            </div>
            <div className="p-2 rounded bg-black/60  text-[11px] text-emerald-400 border border-white/10 select-all overflow-x-auto">
              winget install --id yt-dlp.yt-dlp ; winget install --id Gyan.FFmpeg
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-[11.5px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
            <Link2 size={13} className="text-[#1DB954]" />
            <span>Nhập link bài nhạc</span>
          </label>
          <button
            type="button"
            onClick={handlePasteClipboard}
            className="text-[11px] text-[#1DB954] hover:text-[#1ed760] flex items-center gap-1 cursor-pointer font-medium"
          >
            <Clipboard size={11} />
            <span>Dán</span>
          </button>
        </div>

        <textarea
          id="yt-music-url-input"
          name="youtubeUrlInput"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Nhập link YouTube (mỗi link 1 dòng)"
          className="w-full h-20 p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-[12px] focus:outline-none focus:border-[#1DB954] transition-colors resize-y leading-relaxed text-[var(--text-primary)]"
        />

        {/* Toolbar & Config */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-3 text-[11.5px]">
            {/* Format Selector */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="yt-format-selector" className="text-[var(--text-muted)] font-medium">Định dạng:</label>
              <Select
                id="yt-format-selector"
                name="preferredFormat"
                value={preferredFormat}
                onChange={(e) => setPreferredFormat(e.target.value as YoutubeMusicFormat)}
                selectSize="sm"
              >
                <option value="m4a">M4A (AAC 256k)</option>
                <option value="mp3">MP3 (320k)</option>
                <option value="flac">FLAC (Lossless)</option>
                <option value="opus">Opus (160k)</option>
              </Select>
            </div>

            {/* Fetch Lyrics Checkbox */}
            <label htmlFor="yt-fetch-lyrics-checkbox" className="flex items-center gap-1.5 cursor-pointer select-none">
              <Checkbox
                id="yt-fetch-lyrics-checkbox"
                name="fetchLyrics"
                checked={fetchLyrics}
                onChange={(e) => setFetchLyrics(e.target.checked)}
              />
              <span className="text-[var(--text-secondary)]">Tải lời (.lrc)</span>
            </label>

            {/* Concurrency Selector */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="yt-concurrency-selector" className="text-[var(--text-muted)] font-medium">Luồng:</label>
              <Select
                id="yt-concurrency-selector"
                name="concurrency"
                value={concurrency}
                onChange={(e) => setConcurrency(parseInt(e.target.value, 10))}
                selectSize="sm"
              >
                <option value={1}>1 bài</option>
                <option value={2}>2 bài</option>
                <option value={3}>3 bài</option>
                <option value={4}>4 bài</option>
              </Select>
            </div>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={handlePreview}
            disabled={previewMutation.isPending || !urlInput.trim()}
            className="gap-1.5 px-4 font-semibold"
          >
            {previewMutation.isPending ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Search size={13} />
            )}
            <span>Phân tích link</span>
          </Button>
        </div>
      </div>

      {/* Active Job Progress Banner */}
      {activeJobId && jobProgress && (
        <div className="p-3.5 rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 shadow-md space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin text-[#1DB954]" />
              <span className="text-[12.5px] font-bold text-[var(--text-primary)]">
                Đang tải nhạc...
              </span>
              <span className="text-[11.5px] text-[#1DB954] ">
                {jobProgress.percent}%
              </span>
            </div>
            <Button
              variant="danger"
              size="xs"
              onClick={handleStopJob}
              className="gap-1"
            >
              <StopCircle size={12} />
              <span>Dừng</span>
            </Button>
          </div>

          <div className="w-full h-1.5 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#1DB954] rounded-full transition-[width] duration-300 ease-out"
              style={{ width: `${jobProgress.percent}%` }}
            />
          </div>

          <div className="text-xs text-zinc-400  truncate">
            {jobProgress.message}
          </div>
        </div>
      )}

      {/* 5. STEP 2: Elegant Preview Table */}
      <AnimatePresence>
        {previewData && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-sm overflow-hidden"
          >
            {/* Table Action Bar */}
            <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)] flex items-center justify-between gap-3 flex-wrap text-[11px]">
              <div className="flex items-center gap-2.5 truncate">
                {previewData.isPlaylist ? (
                  previewData.playlistId?.startsWith('RD') ? (
                    <Radio size={14} className="text-amber-500 shrink-0" />
                  ) : (
                    <Layers size={14} className="text-[#1DB954] shrink-0" />
                  )
                ) : (
                  <FileMusic size={14} className="text-[#1DB954] shrink-0" />
                )}
                <span className="font-bold text-[12.5px] text-[var(--text-primary)] truncate">
                  {previewData.playlistTitle || 'Danh sách bài hát'}
                </span>
                <span className="text-[10.5px] px-2 py-0.5 rounded border border-[#1DB954]/30 bg-[#1DB954]/10 text-[#1DB954] font-medium tabular-nums shrink-0">
                  {selectedIds.size}/{previewData.totalCount} đã chọn {selectedIds.size > 0 && totalSelectedEstimatedSize ? `(${totalSelectedEstimatedSize})` : ''}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                {selectedIds.size > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={openCustomFolderForSelected}
                    className="h-7 px-2.5 text-[10.5px] font-medium flex items-center gap-1 text-[#1DB954] border-[#1DB954]/30 hover:bg-[#1DB954]/10 cursor-pointer"
                    title="Gom nhóm các bài đã chọn vào một thư mục chung"
                  >
                    <Folder size={11} />
                    <span>Đổi thư mục ({selectedIds.size})</span>
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleAutoMatchFolders}
                  className="h-7 px-2.5 text-[10.5px] font-medium flex items-center gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 cursor-pointer"
                  title="Tự động phát hiện nghệ sĩ của các bài hát và khớp với thư mục sẵn có trong thư viện máy tính"
                >
                  <FolderCheck size={11} />
                  <span>Tự động khớp thư mục {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}</span>
                </Button>
                {previewData.items.some((i) => i.isAlreadyDownloaded && !i.fileMissing) && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSelectOnlyUnDownloaded}
                    className="h-7 px-2.5 text-[10.5px] font-medium cursor-pointer"
                    title="Chỉ chọn những bài chưa có trong thư viện máy tính"
                  >
                    Chỉ bài chưa tải
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSelectOnlyWithLrc}
                  className="h-7 px-2.5 text-[10.5px] font-medium cursor-pointer"
                  title="Chỉ chọn những bài có phụ đề / lời bài hát đồng bộ .lrc"
                >
                  Chỉ bài có .lrc
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={toggleSelectAll}
                  className="h-7 px-2.5 text-[10.5px] font-medium cursor-pointer"
                >
                  {selectedIds.size === previewData.items.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleStartDownload}
                  disabled={downloadJobMutation.isPending || activeJobId !== null || selectedIds.size === 0}
                  className="h-7 px-3 text-[11px] font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Download size={11} />
                  <span>
                    {downloadJobMutation.isPending
                      ? 'Đang kích hoạt...'
                      : `Tải về (${selectedIds.size})`}
                  </span>
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setPreviewData(null);
                    setSelectedIds(new Set());
                    setUrlInput('');
                    sessionStorage.removeItem('yt_preview_data');
                    sessionStorage.removeItem('yt_selected_ids');
                    sessionStorage.removeItem('yt_url_input');
                    sessionStorage.removeItem('yt_item_overrides');
                    toast.info('Đã xóa danh sách xem trước');
                  }}
                  className="h-7 px-2.5 text-[10.5px] font-medium text-rose-400 hover:text-rose-300 border-rose-500/20 hover:bg-rose-500/10 cursor-pointer"
                  title="Xoá danh sách xem trước để nhập link mới"
                >
                  <X size={11} />
                  <span>Xoá danh sách</span>
                </Button>
              </div>
            </div>

            {/* Table Content */}
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg-subtle)] shadow-xs">
                  <tr className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] select-none">
                    <th className="py-2.5 pl-3 pr-1 w-10 text-center">
                      <Checkbox
                        checked={
                          previewData.items.length > 0 &&
                          selectedIds.size === previewData.items.length
                        }
                        onChange={toggleSelectAll}
                        title="Chọn / Bỏ chọn tất cả"
                      />
                    </th>
                    <th className="py-2.5 px-1 w-10 text-center text-[var(--text-muted)]">#</th>
                    <th className="py-2.5 px-3 min-w-[240px]">Bài hát &amp; Nghệ sĩ</th>
                    <th className="py-2.5 px-3 w-36 lg:w-44">Album</th>
                    <th className="py-2.5 px-3 w-40 lg:w-48 whitespace-nowrap">Thư mục lưu</th>
                    <th className="py-2.5 px-3 w-28 text-right whitespace-nowrap">Thời lượng</th>
                    <th className="py-2.5 px-2 w-24 text-center whitespace-nowrap">Độ tin cậy</th>
                    <th className="py-2.5 pr-4 pl-2 w-44 lg:w-52 text-right whitespace-nowrap">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {currentItems.map((item, index) => {
                    const isSelected = selectedIds.has(item.id);
                    const globalIndex = startIndex + index + 1;
                    const override = itemOverrides[item.url] || itemOverrides[item.id];
                    const title = override?.cleanTitle || item.cleanTitle;
                    const artist = override?.artist || item.artist;
                    const album = override?.album || item.album || 'Singles';
                    const customFolder = customFolderMap[item.url] || customFolderMap[item.id];

                    return (
                      <tr
                        key={item.id}
                        onClick={() => toggleSelectItem(item.id)}
                        className={`transition-colors group cursor-pointer ${
                          !isSelected
                            ? 'opacity-60 bg-[var(--bg-subtle)]/40 hover:bg-[var(--bg-hover)]'
                            : index % 2 === 1
                              ? 'bg-[var(--bg-subtle)]/20 hover:bg-[var(--bg-hover)]'
                              : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)]'
                        }`}
                      >
                        <td
                          className="py-2 pl-3 pr-1 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={isSelected}
                            onChange={() => toggleSelectItem(item.id)}
                          />
                        </td>
                        <td className="py-2 px-1 text-center text-[var(--text-muted)] text-[10.5px] tabular-nums font-medium">
                          {globalIndex}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* Thumbnail with Click to Zoom */}
                            <div
                              onClick={(e) => {
                                if (item.thumbnailUrl) {
                                  e.stopPropagation();
                                  setViewingCover({
                                    url: item.thumbnailUrl,
                                    title,
                                    artist,
                                  });
                                }
                              }}
                              className={`w-9 h-9 rounded-lg border border-[var(--border)] overflow-hidden shrink-0 flex items-center justify-center bg-black/40 text-[var(--text-muted)] ${
                                item.thumbnailUrl
                                  ? 'cursor-pointer hover:opacity-85 hover:ring-1 hover:ring-[#1DB954]'
                                  : ''
                              }`}
                              title={item.thumbnailUrl ? 'Bấm để phóng to xem ảnh bìa gốc' : undefined}
                            >
                              {item.thumbnailUrl ? (
                                <img
                                  src={item.thumbnailUrl}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <Music size={13} />
                              )}
                            </div>

                            {/* Title & Artist with Inline Edit */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-[12px] text-[var(--text-primary)] truncate">
                                  {title}
                                </span>
                                {override && (
                                  <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-400 font-medium shrink-0">
                                    Đã sửa
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingItem(item);
                                  }}
                                  className="p-0.5 rounded text-[var(--text-muted)] hover:text-[#1DB954] transition-colors opacity-60 group-hover:opacity-100 cursor-pointer"
                                  title="Chỉnh sửa Tên bài hát, Nghệ sĩ hoặc Album"
                                >
                                  <Edit3 size={11} />
                                </button>
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-0.5 rounded text-[var(--text-muted)] hover:text-[#1DB954] transition-colors opacity-60 group-hover:opacity-100 cursor-pointer inline-flex items-center"
                                  title="Mở nghe trên YouTube (Tab mới)"
                                >
                                  <ExternalLink size={10} />
                                </a>
                              </div>
                              <div className="text-[10.5px] text-[var(--text-muted)] truncate mt-0.5">
                                {artist || 'Nghệ sĩ chưa rõ'}
                              </div>
                              {item.rawTitle !== title && (
                                <div className="text-[9.5px] text-[var(--text-muted)]/70 truncate">
                                  Gốc: {item.rawTitle}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-[var(--text-secondary)] text-[10.5px]">
                          <span className="truncate block max-w-[140px]" title={album}>
                            {album}
                          </span>
                        </td>
                        <td
                          className="py-2 px-3 text-[10.5px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {customFolder ? (
                            <div className="flex items-center gap-1 min-w-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setFolderDialogTargetIds([item.id]);
                                  setIsFolderDialogOpen(true);
                                }}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#1DB954]/40 bg-[#1DB954]/10 text-[#1DB954] font-medium max-w-[130px] truncate hover:opacity-90 transition-opacity cursor-pointer text-[10px]"
                                title={`Đường dẫn lưu đã chọn: ${customFolder}\n(Bấm để đổi thư mục khác)`}
                              >
                                <FolderCheck size={11} className="shrink-0 text-[#1DB954]" />
                                <span className="truncate">{customFolder.split(/[\\/]/).filter(Boolean).slice(-1)[0] || customFolder}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setCustomFolderMap((prev) => {
                                    const next = { ...prev };
                                    delete next[item.id];
                                    delete next[item.url];
                                    return next;
                                  });
                                  toast.info('Đã khôi phục mặc định lưu theo nghệ sĩ');
                                }}
                                className="text-[var(--text-muted)] hover:text-rose-400 p-0.5 rounded hover:bg-[var(--bg-hover)] cursor-pointer"
                                title="Xóa thư mục riêng (quay về mặc định theo nghệ sĩ)"
                              >
                                <X size={11} />
                              </button>
                            </div>
                          ) : (() => {
                            const matchedArtistFolder = getExistingArtistFolder(artist);
                            if (matchedArtistFolder) {
                              return (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCustomFolderMap((prev) => ({
                                        ...prev,
                                        [item.id]: matchedArtistFolder.folderPath,
                                        [item.url]: matchedArtistFolder.folderPath,
                                      }));
                                      toast.success(`Đã chọn nhanh thư mục: ${matchedArtistFolder.folderPath}`);
                                    }}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-medium max-w-[145px] truncate transition-colors cursor-pointer text-[10px]"
                                    title={`Nghệ sĩ "${matchedArtistFolder.artistName}" đã có sẵn thư mục trong thư viện máy tính!\nĐường dẫn: ${matchedArtistFolder.folderPath}\nBấm 1-click để chọn nhanh thư mục này.`}
                                  >
                                    <FolderCheck size={11} className="shrink-0 text-emerald-400" />
                                    <span className="truncate">{matchedArtistFolder.artistName}</span>
                                    <span className="text-[8.5px] px-1 rounded bg-emerald-500/20 text-emerald-300 font-semibold shrink-0">Có sẵn</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFolderDialogTargetIds([item.id]);
                                      setIsFolderDialogOpen(true);
                                    }}
                                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5 rounded hover:bg-[var(--bg-hover)] cursor-pointer"
                                    title="Duyệt thư mục khác..."
                                  >
                                    <Folder size={11} />
                                  </button>
                                </div>
                              );
                            }
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  setFolderDialogTargetIds([item.id]);
                                  setIsFolderDialogOpen(true);
                                }}
                                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline truncate text-[10.5px] flex items-center gap-1 cursor-pointer"
                                title="Bấm để đặt thư mục lưu riêng cho bài này"
                              >
                                <span className="truncate">Theo nghệ sĩ</span>
                                <Folder size={10} className="shrink-0 opacity-40 hover:opacity-100" />
                              </button>
                            );
                          })()}
                        </td>
                        <td className="py-2 px-3 text-right text-[10.5px] tabular-nums leading-tight whitespace-nowrap">
                          <div className="text-[var(--text-primary)] font-medium">
                            {formatDuration(item.duration)}
                          </div>
                          {item.duration && (
                            <div className="text-[9.5px] text-[var(--text-muted)]">
                              {formatEstimatedSize(item.duration, preferredFormat)}
                            </div>
                          )}
                        </td>
                        <td
                          className="py-2 px-2 text-center whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {item.metadataConfidence === 'high' ? (
                            <Badge variant="success" className="text-[9px] py-0 px-1.5">
                              Cao
                            </Badge>
                          ) : (
                            <Tooltip
                              position="left"
                              content={
                                <div className="space-y-1 text-left max-w-[220px]">
                                  <div className="font-semibold text-[10.5px] text-[var(--text-primary)]">
                                    {item.metadataConfidence === 'medium'
                                      ? 'Độ tin cậy vừa'
                                      : 'Độ tin cậy thấp'}
                                  </div>
                                  <p className="text-[10px] text-[var(--text-muted)] m-0 leading-normal">
                                    {item.metadataConfidenceReason ||
                                      (item.metadataConfidence === 'medium'
                                        ? 'Tiêu đề dùng dấu gạch đứng (|), có thể chứa thông tin phụ hoặc cần kiểm tra lại nghệ sĩ.'
                                        : 'Tiêu đề không có dấu phân cách rõ ràng; tên kênh đăng video được dùng tạm làm tên nghệ sĩ.')}
                                  </p>
                                </div>
                              }
                            >
                              <Badge
                                variant={item.metadataConfidence === 'medium' ? 'warning' : 'danger'}
                                className="text-[9px] py-0 px-1.5 cursor-help"
                              >
                                {item.metadataConfidence === 'medium' ? 'Vừa' : 'Thấp'}
                              </Badge>
                            </Tooltip>
                          )}
                        </td>
                        <td className="py-2 pr-4 pl-2 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1 flex-nowrap">
                            {/* 1. Download Status Badge */}
                            {item.isAlreadyDownloaded ? (
                              item.fileMissing ? (
                                <Tooltip
                                  position="bottom"
                                  align="end"
                                  content={
                                    <div className="space-y-1 text-left max-w-[240px]">
                                      <div className="font-semibold text-[12px] text-amber-300">
                                        Tệp âm thanh bị mất
                                      </div>
                                      <p className="text-[11px] text-[var(--text-secondary)] m-0 leading-normal">
                                        Bài này từng tải nhưng file trên máy đã bị xóa hoặc đổi tên. Sẵn sàng tải lại!
                                      </p>
                                    </div>
                                  }
                                >
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-medium shrink-0 cursor-help">
                                    Mất file
                                  </span>
                                </Tooltip>
                              ) : (
                                <Tooltip
                                  position="bottom"
                                  align="end"
                                  content={
                                    <div className="space-y-1 text-left max-w-[240px]">
                                      <div className="font-semibold text-[12px] text-emerald-400">
                                        Đã có trong thư viện
                                      </div>
                                      <p className="text-[11px] text-[var(--text-secondary)] m-0 leading-normal">
                                        File đã có sẵn trong thư mục thư viện máy tính.
                                      </p>
                                    </div>
                                  }
                                >
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-medium shrink-0 cursor-help">
                                    Đã có
                                  </span>
                                </Tooltip>
                              )
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border)] font-medium shrink-0">
                                Chưa tải
                              </span>
                            )}

                            {/* 2. Lyrics Status Badge with Click to View / Edit */}
                            <Tooltip
                              position="bottom"
                              align="end"
                              delay={50}
                              content={
                                <div className="space-y-1 text-left max-w-[250px]">
                                  <div className="font-semibold text-[12px] text-[var(--text-primary)]">
                                    {override?.customLyrics
                                      ? 'Lời bài hát đã chỉnh sửa'
                                      : item.lyricsSource === 'lrclib-synced'
                                        ? 'Lời đồng bộ (.lrc) từ LrcLib'
                                        : item.lyricsSource === 'yt-subs'
                                          ? 'Lời đồng bộ (.lrc) từ CC YouTube'
                                          : item.lyricsSource === 'lrclib-plain'
                                            ? 'Lời dạng văn bản (Text)'
                                            : item.lyricsSource === 'none'
                                              ? 'Chưa có lời bài hát'
                                              : 'Đang kiểm tra lời...'}
                                  </div>
                                  <p className="text-[11px] text-[var(--text-secondary)] m-0 leading-normal">
                                    Bấm vào đây để xem trực tiếp và chỉnh sửa lời bài hát trước khi tải.
                                  </p>
                                </div>
                              }
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLyricsEditingItem(item);
                                }}
                                className="cursor-pointer transition-transform hover:scale-105"
                              >
                                {override?.customLyrics ? (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-medium shrink-0">
                                    .lrc (Đã sửa)
                                  </span>
                                ) : item.lyricsSource === 'lrclib-synced' || item.lyricsSource === 'yt-subs' ? (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-medium shrink-0">
                                    .lrc
                                  </span>
                                ) : item.lyricsSource === 'lrclib-plain' ? (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25 font-medium shrink-0">
                                    Text
                                  </span>
                                ) : item.lyricsSource === 'none' ? (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 font-medium shrink-0">
                                    Thiếu lời
                                  </span>
                                ) : (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border)] font-medium shrink-0">
                                    Chờ quét
                                  </span>
                                )}
                              </button>
                            </Tooltip>

                            {/* 3. Cover Art Status Badge with Click to Zoom */}
                            <Tooltip
                              position="bottom"
                              align="end"
                              delay={50}
                              content={
                                <div className="space-y-1 text-left max-w-[240px]">
                                  <div className="font-semibold text-[12px] text-[var(--text-primary)]">
                                    {item.hasCover || item.thumbnailUrl ? 'Có ảnh bìa (Bấm để phóng to)' : 'Chưa có ảnh bìa'}
                                  </div>
                                  <p className="text-[11px] text-[var(--text-secondary)] m-0 leading-normal">
                                    {item.hasCover || item.thumbnailUrl
                                      ? 'Đã tìm thấy thumbnail chất lượng cao để làm ảnh bìa 1:1.'
                                      : 'Video không có thumbnail hợp lệ hoặc không thể xử lý ảnh bìa.'}
                                  </p>
                                </div>
                              }
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  if (item.thumbnailUrl) {
                                    e.stopPropagation();
                                    setViewingCover({
                                      url: item.thumbnailUrl,
                                      title,
                                      artist,
                                    });
                                  }
                                }}
                                className={item.thumbnailUrl ? 'cursor-pointer transition-transform hover:scale-105' : ''}
                              >
                                {item.hasCover || item.thumbnailUrl ? (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-medium shrink-0">
                                    Có bìa
                                  </span>
                                ) : (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 font-medium shrink-0">
                                    Thiếu bìa
                                  </span>
                                )}
                              </button>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {previewData && previewData.items.length > 0 && (
              <div className="px-4 py-2.5 border-t border-[var(--border)] bg-[var(--bg-subtle)] flex flex-wrap items-center justify-between gap-3 text-[11px]">
                {/* Left: Page Size Select & Item Range */}
                <div className="flex items-center gap-2 text-[10.5px] text-[var(--text-muted)]">
                  <span>Hiển thị</span>
                  <Select
                    selectSize="sm"
                    value={String(pageSize)}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="h-6 text-[10.5px] py-0 px-2 bg-[var(--bg-surface)] font-medium"
                  >
                    <option value="25">25 bài / trang</option>
                    <option value="50">50 bài / trang</option>
                    <option value="100">100 bài / trang</option>
                    <option value="200">200 bài / trang</option>
                  </Select>
                  <span className="tabular-nums">
                    ({startIndex + 1} - {Math.min(endIndex, previewData.items.length)} / {previewData.items.length} bài)
                  </span>
                </div>

                {/* Right: Icon Buttons (First, Prev, 1/4, Next, Last) */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage <= 1}
                    title="Trang đầu"
                    className="p-1 rounded border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <ChevronsLeft size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    title="Trang trước"
                    className="p-1 rounded border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <ChevronLeft size={13} />
                  </button>

                  <span className="px-2.5 py-0.5 text-[11px] font-bold text-[var(--text-primary)] tabular-nums select-none">
                    {currentPage} / {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    title="Trang sau"
                    className="p-1 rounded border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <ChevronRight size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage >= totalPages}
                    title="Trang cuối"
                    className="p-1 rounded border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <ChevronsRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Metadata Dialog */}
      <MetadataEditDialog
        isOpen={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
        item={editingItem}
        currentOverrides={editingItem ? itemOverrides[editingItem.url] || itemOverrides[editingItem.id] : undefined}
        onSave={(data) => {
          if (!editingItem) return;
          setItemOverrides((prev) => ({
            ...prev,
            [editingItem.url]: {
              ...prev[editingItem.url],
              ...data,
            },
            [editingItem.id]: {
              ...prev[editingItem.id],
              ...data,
            },
          }));
          toast.success('Đã cập nhật siêu dữ liệu bài hát!');
        }}
      />

      {/* Lyrics Editor Dialog */}
      <LyricsEditorDialog
        isOpen={Boolean(lyricsEditingItem)}
        onClose={() => setLyricsEditingItem(null)}
        item={lyricsEditingItem}
        currentLyrics={
          lyricsEditingItem
            ? itemOverrides[lyricsEditingItem.url]?.customLyrics !== undefined
              ? itemOverrides[lyricsEditingItem.url]?.customLyrics
              : itemOverrides[lyricsEditingItem.id]?.customLyrics !== undefined
                ? itemOverrides[lyricsEditingItem.id]?.customLyrics
                : lyricsEditingItem.customLyrics
            : undefined
        }
        initialSource={
          lyricsEditingItem
            ? itemOverrides[lyricsEditingItem.url]?.customLyrics !== undefined ||
              itemOverrides[lyricsEditingItem.id]?.customLyrics !== undefined
              ? 'custom'
              : lyricsEditingItem.lyricsSource || undefined
            : undefined
        }
        onSave={(text) => {
          if (!lyricsEditingItem) return;
          setItemOverrides((prev) => ({
            ...prev,
            [lyricsEditingItem.url]: {
              ...prev[lyricsEditingItem.url],
              customLyrics: text,
            },
            [lyricsEditingItem.id]: {
              ...prev[lyricsEditingItem.id],
              customLyrics: text,
            },
          }));
          toast.success('Đã lưu lời bài hát tuỳ chỉnh!');
        }}
        onLyricsFetched={(lyrics, source) => {
          if (!lyricsEditingItem) return;
          setItemOverrides((prev) => ({
            ...prev,
            [lyricsEditingItem.url]: {
              ...prev[lyricsEditingItem.url],
              customLyrics: lyrics,
            },
            [lyricsEditingItem.id]: {
              ...prev[lyricsEditingItem.id],
              customLyrics: lyrics,
            },
          }));
          setPreviewData((prev) =>
            prev
              ? {
                  ...prev,
                  items: prev.items.map((it) =>
                    it.id === lyricsEditingItem.id || it.url === lyricsEditingItem.url
                      ? {
                          ...it,
                          customLyrics: lyrics,
                          lyricsSource: source as any,
                        }
                      : it
                  ),
                }
              : null
          );
        }}
      />

      {/* Cover Full Viewer Dialog */}
      <CoverViewerDialog
        isOpen={Boolean(viewingCover)}
        onClose={() => setViewingCover(null)}
        imageUrl={viewingCover?.url}
        title={viewingCover?.title}
        artist={viewingCover?.artist}
      />

      {/* Custom Folder Dialog */}
      <CustomFolderDialog
        isOpen={isFolderDialogOpen}
        onClose={() => setIsFolderDialogOpen(false)}
        selectedCount={folderDialogTargetIds.length}
        folderHistory={config?.customFolderHistory || []}
        suggestedFolder={
          folderDialogTargetIds.length === 1
            ? (() => {
                const target = previewData?.items.find((i) => i.id === folderDialogTargetIds[0]);
                const match = getExistingArtistFolder(target?.artist);
                return match?.folderPath;
              })()
            : undefined
        }
        onApply={(folder) => {
          setCustomFolderMap((prev) => {
            const next = { ...prev };
            folderDialogTargetIds.forEach((id) => {
              next[id] = folder;
              const matchedItem = previewData?.items.find((i) => i.id === id);
              if (matchedItem?.url) {
                next[matchedItem.url] = folder;
              }
            });
            return next;
          });
          toast.success(`Đã áp dụng thư mục cho ${folderDialogTargetIds.length} bài hát!`);
        }}
        onResetDefault={() => {
          setCustomFolderMap((prev) => {
            const idsToRemove = new Set(folderDialogTargetIds);
            const next: Record<string, string> = {};
            for (const [k, v] of Object.entries(prev)) {
              if (!idsToRemove.has(k)) {
                next[k] = v;
              }
            }
            return next;
          });
          toast.success('Đã đặt lại thư mục mặc định');
        }}
      />
    </div>
  );
};
