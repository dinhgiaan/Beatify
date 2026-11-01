import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  FileMusic,
  FolderOpen,
  Search,
  RefreshCw,
  FileText,
  X,
  Folder,
  FolderX,
  Copy,
  Check,
  Image,
  AlertCircle,
  Trash2,
  Download,
  Music,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { toast } from 'sonner';
import type { YoutubeMusicDownloadRecord } from '@music-app/shared';
import { PageHeader } from '../../../ui/organisms/PageHeader';
import { Select, Checkbox } from '../../../ui/atoms/Controls';
import { Button } from '../../../ui/atoms/Button';
import { ConfirmDialog } from '../../../ui/molecules/ConfirmDialog';
import { CoverViewerDialog } from '../components/CoverViewerDialog';
import { LyricsEditorDialog } from '../components/LyricsEditorDialog';
import {
  fetchDownloadsHistoryApi,
  deleteDownloadHistoryApi,
  clearDownloadsHistoryApi,
  openYoutubeMusicFolderApi,
  fetchYoutubeMusicConfigApi,
  relinkDownloadApi,
  rescanAllMissingApi,
  fetchDownloadLyricsApi,
  updateDownloadLyricsApi,
} from '../api';

const formatDownloadDate = (dateStr?: string | null) => {
  if (!dateStr) return { date: '---', time: '--:--' };
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { date: '---', time: '--:--' };
    return {
      date: d.toLocaleDateString('vi-VN'),
      time: d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };
  } catch {
    return { date: '---', time: '--:--' };
  }
};

export const HistoryPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [formatFilter, setFormatFilter] = useState<'all' | 'opus' | 'm4a' | 'mp3' | 'flac'>('all');
  const [lyricsFilter, setLyricsFilter] = useState<'all' | 'synced' | 'none'>('all');
  const [coverFilter, setCoverFilter] = useState<'all' | 'has_cover' | 'no_cover'>('all');
  const [quickFilter, setQuickFilter] = useState<'all' | 'missing_lyrics' | 'missing_cover' | 'missing_any'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Pagination states: default 50 items per page
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Selection states for batch operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Confirm dialogs
  const [itemToDelete, setItemToDelete] = useState<YoutubeMusicDownloadRecord | null>(null);
  const [deleteLocalFilesSingle, setDeleteLocalFilesSingle] = useState(false);
  const [isConfirmBatchDeleteOpen, setIsConfirmBatchDeleteOpen] = useState(false);
  const [deleteLocalFilesBatch, setDeleteLocalFilesBatch] = useState(false);
  const [isConfirmClearAllOpen, setIsConfirmClearAllOpen] = useState(false);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);

  // Relink missing files states
  const [relinkingId, setRelinkingId] = useState<string | null>(null);
  const [isRescanningAll, setIsRescanningAll] = useState(false);

  // Cover image viewer modal state
  const [viewingCoverItem, setViewingCoverItem] = useState<{
    imageUrl?: string;
    title?: string;
    artist?: string;
  } | null>(null);

  // Lyrics editor dialog state for downloaded tracks
  const [lyricsEditingRecord, setLyricsEditingRecord] = useState<YoutubeMusicDownloadRecord | null>(null);
  const [editingRecordLyrics, setEditingRecordLyrics] = useState<string | undefined>(undefined);
  const [editingRecordLyricsSource, setEditingRecordLyricsSource] = useState<string | undefined>(undefined);

  const handleOpenLyricsEditor = async (record: YoutubeMusicDownloadRecord) => {
    try {
      const res = await fetchDownloadLyricsApi(record.id);
      setEditingRecordLyrics(res.lyrics);
      setEditingRecordLyricsSource(res.source);
      setLyricsEditingRecord(record);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Không thể đọc file lời: ${msg || 'Có lỗi xảy ra'}`);
      setEditingRecordLyrics('');
      setEditingRecordLyricsSource('none');
      setLyricsEditingRecord(record);
    }
  };

  const handleSaveRecordLyrics = async (newLyrics: string) => {
    if (!lyricsEditingRecord) return;
    try {
      await updateDownloadLyricsApi(lyricsEditingRecord.id, newLyrics);
      queryClient.invalidateQueries({ queryKey: ['youtube-music-history'] });
      queryClient.invalidateQueries({ queryKey: ['yt-downloads'] });
      toast.success('Đã lưu và ghi đè file lời bài hát (.lrc) trên ổ cứng thành công!');
      setLyricsEditingRecord(null);
      setEditingRecordLyrics(undefined);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi khi lưu lời bài hát: ${msg || 'Không thể lưu file'}`);
      throw err;
    }
  };

  const getCoverUrl = (item: YoutubeMusicDownloadRecord): string => {
    return `/local-api/downloads/${encodeURIComponent(item.id)}/cover`;
  };

  // Lấy cấu hình để biết thư mục gốc mặc định
  const { data: serverConfig } = useQuery({
    queryKey: ['youtube-music-config'],
    queryFn: fetchYoutubeMusicConfigApi,
    staleTime: 60000,
  });
  const defaultLibraryPath = serverConfig?.libraryRootPath || 'D:\\Music';

  // Lấy dữ liệu lịch sử tải
  const { data: history = [], isLoading, refetch, isFetching } = useQuery<YoutubeMusicDownloadRecord[]>({
    queryKey: ['youtube-music-history'],
    queryFn: () => fetchDownloadsHistoryApi(1000),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, deleteFiles }: { id: string; deleteFiles: boolean }) =>
      deleteDownloadHistoryApi(id, deleteFiles),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['youtube-music-history'] });
      queryClient.invalidateQueries({ queryKey: ['yt-downloads'] });
      toast.success(
        variables.deleteFiles
          ? 'Đã xóa bài hát và tệp tin trên ổ cứng thành công'
          : 'Đã xóa bài hát khỏi lịch sử tải'
      );
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi khi xóa bài hát: ${msg || 'Không thể xóa'}`);
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: () => clearDownloadsHistoryApi(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['youtube-music-history'] });
      queryClient.invalidateQueries({ queryKey: ['yt-downloads'] });
      setIsConfirmClearAllOpen(false);
      setSelectedIds(new Set());
      toast.success(`Đã xóa toàn bộ lịch sử (${res.count} bài)!`);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi khi xóa toàn bộ lịch sử: ${msg || 'Không thể xóa'}`);
    },
  });

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredHistory.length && filteredHistory.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredHistory.map((i) => i.id)));
    }
  };

  const handleDeleteBatch = async () => {
    if (selectedIds.size === 0) return;
    setIsDeletingBatch(true);
    try {
      for (const id of Array.from(selectedIds)) {
        await deleteDownloadHistoryApi(id, deleteLocalFilesBatch);
      }
      queryClient.invalidateQueries({ queryKey: ['youtube-music-history'] });
      queryClient.invalidateQueries({ queryKey: ['yt-downloads'] });
      toast.success(
        deleteLocalFilesBatch
          ? `Đã xóa ${selectedIds.size} bài và tệp tin trên ổ cứng`
          : `Đã xóa ${selectedIds.size} bài khỏi lịch sử`
      );
      setSelectedIds(new Set());
      setIsConfirmBatchDeleteOpen(false);
      setDeleteLocalFilesBatch(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi khi xóa: ${msg || 'Có lỗi xảy ra'}`);
    } finally {
      setIsDeletingBatch(false);
    }
  };

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      // 1. Filter theo từ khóa
      const term = searchTerm.toLowerCase().trim();
      const matchSearch =
        !term ||
        (item.title && item.title.toLowerCase().includes(term)) ||
        (item.artist && item.artist.toLowerCase().includes(term)) ||
        (item.album && item.album.toLowerCase().includes(term)) ||
        (item.relativeFilePath && item.relativeFilePath.toLowerCase().includes(term));

      if (!matchSearch) return false;

      // 2. Filter theo định dạng
      if (formatFilter !== 'all' && item.format !== formatFilter) {
        return false;
      }

      // 3. Filter theo lời bài hát
      const hasLyrics = Boolean(item.relativeLyricsPath) || (Boolean(item.lyricsSource) && item.lyricsSource !== 'none');
      if (lyricsFilter === 'synced' && !hasLyrics) {
        return false;
      }
      if (lyricsFilter === 'none' && hasLyrics) {
        return false;
      }

      // 4. Filter theo ảnh bìa
      if (coverFilter === 'has_cover' && !item.relativeCoverPath) {
        return false;
      }
      if (coverFilter === 'no_cover' && item.relativeCoverPath) {
        return false;
      }

      // 5. Quick filter bài cần chú ý (thiếu lời / thiếu bìa)
      if (quickFilter === 'missing_lyrics' && hasLyrics) {
        return false;
      }
      if (quickFilter === 'missing_cover' && item.relativeCoverPath) {
        return false;
      }
      if (quickFilter === 'missing_any' && hasLyrics && item.relativeCoverPath) {
        return false;
      }

      return true;
    });
  }, [history, searchTerm, formatFilter, lyricsFilter, coverFilter, quickFilter]);

  // Reset về trang 1 mỗi khi lọc thay đổi
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, formatFilter, lyricsFilter, coverFilter, quickFilter, pageSize]);

  // Phân trang
  const totalItems = filteredHistory.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedHistory = useMemo(() => {
    const start = (validPage - 1) * pageSize;
    return filteredHistory.slice(start, start + pageSize);
  }, [filteredHistory, validPage, pageSize]);

  const stats = useMemo(() => {
    const total = history.length;
    const completed = history.filter((i) => i.status === 'completed').length;
    const withLyrics = history.filter(
      (i) => i.status === 'completed' && (Boolean(i.relativeLyricsPath) || (Boolean(i.lyricsSource) && i.lyricsSource !== 'none'))
    ).length;
    const withoutLyrics = completed - withLyrics;
    const withCover = history.filter((i) => Boolean(i.relativeCoverPath)).length;
    const withoutCover = completed - withCover;
    const missingAny = history.filter(
      (i) =>
        i.status === 'completed' &&
        (!(Boolean(i.relativeLyricsPath) || (Boolean(i.lyricsSource) && i.lyricsSource !== 'none')) || !i.relativeCoverPath)
    ).length;
    const missingFiles = history.filter((i) => i.status === 'completed' && i.fileExists === false).length;
    return { total, completed, withLyrics, withoutLyrics, withCover, withoutCover, missingAny, missingFiles };
  }, [history]);

  const handleCopyPath = (pathStr?: string | null, id?: string) => {
    if (!pathStr) return;
    navigator.clipboard.writeText(pathStr);
    if (id) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    }
    toast.success('Đã sao chép đường dẫn file!');
  };

  const handleOpenFolder = (targetPath?: string | null) => {
    const dir = targetPath ? targetPath : defaultLibraryPath;
    openYoutubeMusicFolderApi(dir);
  };

  const handleAutoRelink = async (item: YoutubeMusicDownloadRecord) => {
    setRelinkingId(item.id);
    try {
      const res = await relinkDownloadApi(item.id);
      if (res.found && res.relativeFilePath) {
        toast.success(`Đã tự động tìm thấy bài hát tại: "${res.relativeFilePath}"!`);
        refetch();
      } else {
        toast.info('Không tìm thấy tệp tin trên máy tính.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi khi định vị lại: ${msg || 'Không thể quét'}`);
    } finally {
      setRelinkingId(null);
    }
  };

  const handleRescanAllMissing = async () => {
    setIsRescanningAll(true);
    try {
      const res = await rescanAllMissingApi();
      if (res.relinked > 0) {
        toast.success(`Đã tự động tìm lại thành công ${res.relinked}/${res.totalMissing} bài hát!`);
        refetch();
      } else {
        toast.info(`Đã quét ${res.totalMissing} bài bị mất file nhưng chưa tìm thấy vị trí mới trong thư viện.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi khi quét: ${msg}`);
    } finally {
      setIsRescanningAll(false);
    }
  };

  return (
    <div className="w-full max-w-[1720px] mx-auto px-8 py-6 space-y-6">
      {/* 1. Page Header */}
      <PageHeader
        title="Lịch sử Tải nhạc"
        subtitle="Quản lý và tra cứu các bài hát đã tải về máy local, thẻ metadata Vorbis/ID3 và lời bài hát .lrc"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-8 px-3 text-xs font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </Button>

            <button
              type="button"
              onClick={() => handleOpenFolder(defaultLibraryPath)}
              className="h-8 flex items-center gap-1.5 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shadow-xs"
              title="Mở thư mục nhạc trên máy tính"
            >
              <FolderOpen size={13} className="text-[var(--text-muted)]" />
              <span>Mở thư mục nhạc</span>
            </button>

            {stats.missingFiles > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRescanAllMissing}
                disabled={isRescanningAll}
                className="h-8 px-3 text-xs font-semibold flex items-center gap-1.5 shadow-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                title="Tự động quét lại toàn bộ thư viện để tìm lại các bài bị mất file do dời folder"
              >
                <Search size={12} className={isRescanningAll ? 'animate-spin' : ''} />
                <span>Tìm lại file mất ({stats.missingFiles})</span>
              </Button>
            )}

            <Button
              variant="danger"
              size="sm"
              onClick={() => setIsConfirmClearAllOpen(true)}
              disabled={history.length === 0}
              className="h-8 px-3 text-xs font-semibold flex items-center gap-1.5 shadow-xs"
              title="Xóa toàn bộ bản ghi lịch sử tải"
            >
              <Trash2 size={12} />
              <span>Xóa tất cả</span>
            </Button>
          </div>
        }
      />

      {/* 2. Interactive Stats Bar with motion hover */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        <motion.div
          whileHover={{ y: -3, transition: { duration: 0.15 } }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setFormatFilter('all');
            setLyricsFilter('all');
            setCoverFilter('all');
            setQuickFilter('all');
          }}
          className="p-3.5 rounded-xl border bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer shadow-xs"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Tổng số bài</div>
          <div className="text-[20px] font-bold text-[var(--text-primary)] mt-1 tabular-nums">
            {stats.total}
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -3, transition: { duration: 0.15 } }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setQuickFilter('all');
            setLyricsFilter('all');
            setCoverFilter('all');
          }}
          className="p-3.5 rounded-xl border bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer shadow-xs"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="text-[11px] text-emerald-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <CheckCircle2 size={12} />
            Hoàn tất
          </div>
          <div className="text-[20px] font-bold text-emerald-400 mt-1 tabular-nums">
            {stats.completed}
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -3, transition: { duration: 0.15 } }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setLyricsFilter('synced');
            setQuickFilter('all');
          }}
          className={`p-3.5 rounded-xl border transition-colors cursor-pointer shadow-xs ${
            lyricsFilter === 'synced'
              ? 'border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/25'
              : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border-[var(--border)]'
          }`}
        >
          <div className="text-[11px] text-emerald-400 uppercase tracking-wider font-semibold">Có lời .lrc</div>
          <div className="text-[20px] font-bold text-emerald-400 mt-1 tabular-nums">
            {stats.withLyrics}
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -3, transition: { duration: 0.15 } }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setQuickFilter(quickFilter === 'missing_lyrics' ? 'all' : 'missing_lyrics');
            setLyricsFilter('all');
            setCoverFilter('all');
          }}
          className={`p-3.5 rounded-xl border transition-colors cursor-pointer shadow-xs ${
            quickFilter === 'missing_lyrics'
              ? 'border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-500/25'
              : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border-[var(--border)]'
          }`}
        >
          <div className="text-[11px] text-amber-400 uppercase tracking-wider font-semibold">Chưa có lời</div>
          <div className="text-[20px] font-bold text-amber-400 mt-1 tabular-nums">
            {stats.withoutLyrics}
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -3, transition: { duration: 0.15 } }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setCoverFilter('has_cover');
            setQuickFilter('all');
          }}
          className={`p-3.5 rounded-xl border transition-colors cursor-pointer shadow-xs ${
            coverFilter === 'has_cover'
              ? 'border-sky-500/50 bg-sky-500/10 ring-1 ring-sky-500/25'
              : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border-[var(--border)]'
          }`}
        >
          <div className="text-[11px] text-sky-400 uppercase tracking-wider font-semibold">Có ảnh bìa</div>
          <div className="text-[20px] font-bold text-sky-400 mt-1 tabular-nums">
            {stats.withCover}
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -3, transition: { duration: 0.15 } }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setQuickFilter(quickFilter === 'missing_cover' ? 'all' : 'missing_cover');
            setLyricsFilter('all');
            setCoverFilter('all');
          }}
          className={`p-3.5 rounded-xl border transition-colors cursor-pointer shadow-xs ${
            quickFilter === 'missing_cover'
              ? 'border-rose-500/50 bg-rose-500/10 ring-1 ring-rose-500/25'
              : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border-[var(--border)]'
          }`}
        >
          <div className="text-[11px] text-rose-400 uppercase tracking-wider font-semibold">Thiếu ảnh bìa</div>
          <div className="text-[20px] font-bold text-rose-400 mt-1 tabular-nums">
            {stats.withoutCover}
          </div>
        </motion.div>
      </div>

      {/* 3. Toolbar: Search, Format Pills, Quick Filters & Selection Action */}
      <div
        className="p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 shadow-xs select-none"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs w-full focus-within:ring-1 focus-within:ring-[#1DB954]/50"
            style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
          >
            <Search size={14} className="text-[var(--text-muted)] shrink-0" />
            <input
              id="history-search-input"
              name="historySearchTerm"
              type="text"
              placeholder="Tìm bài hát, ca sĩ, album, file..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent border-none outline-none text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                title="Xóa từ khóa tìm kiếm"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Filter Chips & Selection Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Format selector */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-[var(--text-muted)] font-medium mr-1 uppercase">Định dạng:</span>
            {(['all', 'm4a', 'mp3', 'opus', 'flac'] as const).map((fmt) => {
              const isActive = formatFilter === fmt;
              return (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setFormatFilter(fmt)}
                  className={`relative px-2.5 py-1 rounded-md text-xs border transition-colors cursor-pointer font-medium ${
                    isActive
                      ? 'text-black font-bold border-transparent'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="history-fmt-active-bg"
                      className="absolute inset-0 bg-[#1DB954] rounded-md -z-0"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10">{fmt === 'all' ? 'Tất cả' : fmt.toUpperCase()}</span>
                </button>
              );
            })}
          </div>

          <div className="h-4 w-px bg-[var(--border)] mx-1 hidden sm:block" />

          {/* Quick status filters */}
          <div className="flex items-center gap-1">
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'synced', label: 'Có .lrc' },
              { id: 'none', label: 'Thiếu lời' },
              { id: 'has_cover', label: 'Có bìa' },
              { id: 'no_cover', label: 'Thiếu bìa' },
            ].map((f) => {
              const isActive =
                (f.id === 'all' && lyricsFilter === 'all' && coverFilter === 'all' && quickFilter === 'all') ||
                (f.id === 'synced' && lyricsFilter === 'synced') ||
                (f.id === 'none' && lyricsFilter === 'none') ||
                (f.id === 'has_cover' && coverFilter === 'has_cover') ||
                (f.id === 'no_cover' && coverFilter === 'no_cover');
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    if (f.id === 'all') {
                      setLyricsFilter('all');
                      setCoverFilter('all');
                      setQuickFilter('all');
                    } else if (f.id === 'synced') {
                      setLyricsFilter(lyricsFilter === 'synced' ? 'all' : 'synced');
                      setQuickFilter('all');
                    } else if (f.id === 'none') {
                      setLyricsFilter(lyricsFilter === 'none' ? 'all' : 'none');
                      setQuickFilter('all');
                    } else if (f.id === 'has_cover') {
                      setCoverFilter(coverFilter === 'has_cover' ? 'all' : 'has_cover');
                      setQuickFilter('all');
                    } else if (f.id === 'no_cover') {
                      setCoverFilter(coverFilter === 'no_cover' ? 'all' : 'no_cover');
                      setQuickFilter('all');
                    }
                  }}
                  className={`relative px-2.5 py-1 rounded-md text-xs border transition-colors cursor-pointer font-medium ${
                    isActive
                      ? 'text-black font-bold border-transparent'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="history-status-active-bg"
                      className="absolute inset-0 bg-[#1DB954] rounded-md -z-0"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10">{f.label}</span>
                </button>
              );
            })}
          </div>

          {/* Batch delete bar if selected */}
          <AnimatePresence>
            {selectedIds.size > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2 bg-[var(--bg-subtle)] px-3 py-1 rounded-lg border border-[var(--border)] ml-auto shadow-xs"
              >
                <span className="text-xs text-[var(--text-muted)]">
                  Đã chọn <strong className="text-[#1DB954]">{selectedIds.size}</strong> bài
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setIsConfirmBatchDeleteOpen(true)}
                  disabled={isDeletingBatch}
                  className="h-7 px-2.5 text-xs font-semibold flex items-center gap-1"
                >
                  <Trash2 size={11} />
                  <span>{isDeletingBatch ? 'Đang xóa...' : `Xóa (${selectedIds.size})`}</span>
                </Button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-[var(--text-muted)] hover:underline cursor-pointer"
                >
                  Bỏ chọn
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 4. Action bar above list */}
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)] px-1">
        <div className="flex items-center gap-2.5">
          {filteredHistory.length > 0 && (
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="px-2.5 py-1 rounded-lg text-xs font-medium border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] cursor-pointer"
            >
              {selectedIds.size === filteredHistory.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              refetch();
              toast.success('Đang quét lại tệp tin trong thư mục lưu...');
            }}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] cursor-pointer"
            title="Quét lại toàn bộ ổ đĩa để kiểm tra các file có còn tồn tại không"
          >
            <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
            <span>Kiểm tra thư mục lưu</span>
          </button>
          <span className="text-xs">
            Hiển thị <strong>{paginatedHistory.length}</strong> / <strong>{totalItems}</strong> bài hát (Tổng: {stats.total})
          </span>
        </div>

        {/* Page size changer dropdown */}
        <div className="flex items-center gap-1.5 text-xs">
          <span>Mỗi trang:</span>
          <Select
            id="history-page-size-select"
            name="historyPageSize"
            selectSize="sm"
            value={String(pageSize)}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="w-24 text-xs h-7 py-0"
          >
            <option value="20">20 bài</option>
            <option value="50">50 bài</option>
            <option value="100">100 bài</option>
            <option value="200">200 bài</option>
          </Select>
        </div>
      </div>

      {/* 5. Songs Table/List */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-[var(--text-muted)] border rounded-xl bg-[var(--bg-surface)]">
          Đang tải danh sách bài hát...
        </div>
      ) : filteredHistory.length === 0 ? (
        <div
          className="p-12 text-center rounded-xl border border-dashed space-y-2"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border)',
            color: 'var(--text-muted)',
          }}
        >
          <FileMusic size={32} className="mx-auto opacity-40" />
          <p className="text-xs m-0">
            {searchTerm || formatFilter !== 'all' || lyricsFilter !== 'all' || coverFilter !== 'all' || quickFilter !== 'all'
              ? 'Không tìm thấy bài hát nào khớp với bộ lọc hiện tại.'
              : 'Chưa có bài hát nào được tải về.'}
          </p>
          {(searchTerm || formatFilter !== 'all' || lyricsFilter !== 'all' || coverFilter !== 'all' || quickFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setFormatFilter('all');
                setLyricsFilter('all');
                setCoverFilter('all');
                setQuickFilter('all');
              }}
              className="text-xs text-[#1DB954] hover:underline mt-1 cursor-pointer block mx-auto font-medium"
            >
              Đặt lại tất cả bộ lọc
            </button>
          )}
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden bg-[var(--bg-surface)] shadow-sm" style={{ borderColor: 'var(--border)' }}>
          {/* Table Header */}
          <div
            className="flex items-center gap-3 px-4 py-2.5 border-b bg-[var(--bg-subtle)] text-[10.5px] font-bold text-[var(--text-muted)] uppercase tracking-wider select-none"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="w-5 shrink-0 flex items-center justify-center">
              <Checkbox
                checked={selectedIds.size > 0 && selectedIds.size === filteredHistory.length}
                onChange={handleToggleSelectAll}
                title="Chọn tất cả"
              />
            </div>
            <div className="w-8 shrink-0 text-center whitespace-nowrap">#</div>
            <div className="flex-1 min-w-0 pr-2 whitespace-nowrap">Bài hát / Nghệ sĩ</div>
            <div className="w-20 shrink-0 text-center whitespace-nowrap hidden sm:block">Trạng thái</div>
            <div className="w-20 shrink-0 text-center hidden md:block whitespace-nowrap">Lời bài hát</div>
            <div className="w-20 shrink-0 text-center hidden md:block whitespace-nowrap">Ảnh bìa</div>
            <div className="w-24 shrink-0 text-center hidden lg:block whitespace-nowrap">Thời gian tải</div>
            <div className="w-[200px] 2xl:w-[280px] shrink-0 hidden xl:block whitespace-nowrap">Đường dẫn tệp tin</div>
            <div className="w-20 shrink-0 text-center whitespace-nowrap">Thao tác</div>
          </div>

          {/* Table Rows (Compact Height, Aligned Columns) */}
          <div className="divide-y divide-[var(--border)]">
            {paginatedHistory.map((item, index) => {
              const rowIndex = (validPage - 1) * pageSize + index + 1;
              const isSelected = selectedIds.has(item.id);

              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 px-4 py-2 transition-colors text-xs min-h-[42px] ${
                    isSelected
                      ? 'bg-[#1DB954]/10 hover:bg-[#1DB954]/15'
                      : 'hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {/* Checkbox */}
                  <div className="w-5 shrink-0 flex items-center justify-center">
                    <Checkbox
                      checked={isSelected}
                      onChange={() => handleToggleSelect(item.id)}
                      title="Chọn bài hát"
                    />
                  </div>

                  {/* Index Number (#) */}
                  <div className="w-8 shrink-0 text-center text-xs tabular-nums text-[var(--text-muted)] font-medium">
                    {rowIndex}
                  </div>

                  {/* Title & Artist/Album/Format info with Thumbnail */}
                  <div className="flex-1 min-w-0 pr-2 flex items-center gap-3">
                    {/* Thumbnail with Click to Zoom */}
                    <div
                      onClick={(e) => {
                        const coverUrl = getCoverUrl(item);
                        if (coverUrl) {
                          e.stopPropagation();
                          setViewingCoverItem({
                            imageUrl: coverUrl,
                            title: item.title || undefined,
                            artist: item.artist || undefined,
                          });
                        }
                      }}
                      className={`w-9 h-9 rounded-lg border overflow-hidden shrink-0 flex items-center justify-center text-[var(--text-muted)] ${
                        getCoverUrl(item)
                          ? 'cursor-pointer hover:opacity-85 hover:ring-1 hover:ring-[#1DB954]'
                          : ''
                      }`}
                      style={{
                        backgroundColor: 'var(--bg-subtle)',
                        borderColor: 'var(--border)',
                      }}
                      title={getCoverUrl(item) ? 'Bấm để phóng to xem ảnh bìa' : undefined}
                    >
                      {(() => {
                        const coverUrl = getCoverUrl(item);
                        return coverUrl ? (
                          <img
                            src={coverUrl}
                            alt=""
                            className="w-full h-full object-cover select-none"
                            loading="lazy"
                            onError={(e) => {
                              const target = e.currentTarget as HTMLImageElement;
                              const ytMatch = item.sourceUrl?.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
                              const realYtId = ytMatch ? ytMatch[1] : (item.videoId && !item.videoId.startsWith('video_') ? item.videoId : '');
                              if (realYtId && !target.src.includes('ytimg.com')) {
                                target.src = `https://i.ytimg.com/vi/${realYtId}/hqdefault.jpg`;
                              } else {
                                target.style.display = 'none';
                              }
                            }}
                          />
                        ) : (
                          <Music size={14} />
                        );
                      })()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-[var(--text-primary)] truncate max-w-[280px] sm:max-w-[400px] 2xl:max-w-[500px]">
                          {item.title || 'Unknown Title'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                        <span className="truncate max-w-[160px] sm:max-w-[220px] font-medium">{item.artist || 'Unknown Artist'}</span>
                        <span>•</span>
                        <span className="truncate max-w-[140px] sm:max-w-[200px] text-[var(--text-secondary)]">
                          {item.album || 'Singles'}
                        </span>
                        <span>•</span>
                        <span className={`text-[9.5px] uppercase px-1.5 py-0.5 rounded border font-bold shrink-0 ${
                          item.format === 'opus'
                            ? 'bg-purple-500/10 border-purple-500/25 text-purple-400'
                            : item.format === 'm4a'
                            ? 'bg-blue-500/10 border-blue-500/25 text-blue-400'
                            : item.format === 'flac'
                            ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                            : 'bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-secondary)]'
                        }`}>
                          {item.format}
                        </span>
                        <span className="lg:hidden text-[10px] text-[var(--text-muted)] shrink-0">
                          • {formatDownloadDate(item.createdAt).date}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Slot 1: Trạng thái tải & Tồn tại file trên ổ đĩa */}
                  <div className="w-20 shrink-0 hidden sm:flex items-center justify-center">
                    {item.status === 'completed' ? (
                      item.fileExists === false ? (
                        <button
                          type="button"
                          onClick={() => handleAutoRelink(item)}
                          disabled={relinkingId === item.id}
                          className="inline-flex items-center justify-center gap-1 w-full py-1 rounded-md text-[11px] font-semibold border bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25 transition-colors cursor-pointer"
                          title={`File không còn tồn tại ở: ${item.libraryRootPath}\\${item.relativeFilePath || ''}\nBấm để quét tự động tìm lại vị trí mới!`}
                        >
                          {relinkingId === item.id ? (
                            <RefreshCw size={11} className="shrink-0 animate-spin" />
                          ) : (
                            <Search size={11} className="shrink-0" />
                          )}
                          <span>Định vị lại</span>
                        </button>
                      ) : (
                        <span
                          className="inline-flex items-center justify-center gap-1 w-full py-1 rounded-md text-[11px] font-semibold border bg-emerald-500/10 border-emerald-500/25 text-emerald-400 cursor-help"
                          title={`File tồn tại sẵn sàng trên ổ đĩa:\n${item.libraryRootPath}\\${item.relativeFilePath || ''}`}
                        >
                          <CheckCircle2 size={11} className="shrink-0" />
                          <span>Hoàn tất</span>
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center justify-center gap-1 w-full py-1 rounded-md text-[11px] font-semibold border bg-rose-500/15 border-rose-500/30 text-rose-400">
                        <XCircle size={11} className="shrink-0" />
                        <span>Lỗi</span>
                      </span>
                    )}
                  </div>

                  {/* Slot 2: Lời bài hát (.lrc / Plain / Thiếu lời) */}
                  <div className="w-20 shrink-0 hidden md:flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => handleOpenLyricsEditor(item)}
                      className="w-full cursor-pointer hover:opacity-85 transition-opacity"
                      title="Bấm để xem và sửa lời bài hát (.lrc) trên ổ đĩa"
                    >
                      {item.lyricsExists || item.lyricsSource === 'lrclib-synced' || item.lyricsSource === 'yt-subs' || (item.relativeLyricsPath && item.lyricsSource !== 'lrclib-plain') ? (
                        <span className="inline-flex items-center justify-center gap-1 w-full py-1 rounded-md text-[11px] font-semibold border bg-emerald-500/10 border-emerald-500/25 text-emerald-400">
                          <CheckCircle2 size={11} className="shrink-0" />
                          <span>.lrc</span>
                        </span>
                      ) : item.lyricsSource === 'lrclib-plain' ? (
                        <span className="inline-flex items-center justify-center gap-1 w-full py-1 rounded-md text-[11px] font-semibold border bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-secondary)]">
                          <FileText size={11} className="shrink-0" />
                          <span>Plain</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center gap-1 w-full py-1 rounded-md text-[11px] font-semibold border bg-rose-500/15 border-rose-500/30 text-rose-400">
                          <AlertCircle size={11} className="shrink-0" />
                          <span>Thiếu lời</span>
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Slot 3: Ảnh bìa (Có bìa / Thiếu bìa) */}
                  <div className="w-20 shrink-0 hidden md:flex items-center justify-center">
                    {item.relativeCoverPath ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const coverUrl = getCoverUrl(item);
                          if (coverUrl) {
                            setViewingCoverItem({
                              imageUrl: coverUrl,
                              title: item.title || undefined,
                              artist: item.artist || undefined,
                            });
                          }
                        }}
                        className="inline-flex items-center justify-center gap-1 w-full py-1 rounded-md text-[11px] font-semibold border bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                        title="Bấm để xem ảnh bìa gốc"
                      >
                        <Image size={11} className="shrink-0" />
                        <span>Có bìa</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center justify-center gap-1 w-full py-1 rounded-md text-[11px] font-semibold border bg-rose-500/15 border-rose-500/30 text-rose-400">
                        <AlertCircle size={11} className="shrink-0" />
                        <span>Thiếu bìa</span>
                      </span>
                    )}
                  </div>

                  {/* Slot 4: Thời gian tải (Download Date & Time) */}
                  <div
                    className="w-24 shrink-0 hidden lg:flex flex-col items-center justify-center text-center tabular-nums leading-tight cursor-default"
                    title={`Thời gian tải: ${formatDownloadDate(item.createdAt).time} ngày ${formatDownloadDate(item.createdAt).date}`}
                  >
                    <span className="text-xs font-semibold text-[var(--text-secondary)]">
                      {formatDownloadDate(item.createdAt).time}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {formatDownloadDate(item.createdAt).date}
                    </span>
                  </div>

                  {/* File Path Pill with Copy */}
                  <div className="w-[200px] 2xl:w-[280px] shrink-0 hidden xl:flex items-center">
                    {item.relativeFilePath ? (
                      <div
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] w-full truncate ${
                          item.fileExists === false
                            ? 'bg-amber-500/10 border-amber-500/25 text-amber-400/90'
                            : 'text-[var(--text-muted)] bg-[var(--bg-subtle)] border-[var(--border)]'
                        }`}
                        title={
                          item.fileExists === false
                            ? `Tệp tin không còn tồn tại trên ổ đĩa!\nThư mục: ${item.libraryRootPath}\nFile: ${item.relativeFilePath}`
                            : `Thư mục: ${item.libraryRootPath}\nFile: ${item.relativeFilePath}`
                        }
                      >
                        {item.fileExists === false ? (
                          <FolderX size={12} className="shrink-0 text-amber-400" />
                        ) : (
                          <Folder size={12} className="shrink-0" />
                        )}
                        <span className={`truncate flex-1 font-mono ${item.fileExists === false ? 'line-through opacity-75' : ''}`}>
                          {item.relativeFilePath}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyPath(item.relativeFilePath, item.id)}
                          className="ml-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
                          title="Sao chép đường dẫn file"
                        >
                          {copiedId === item.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)] italic">-</span>
                    )}
                  </div>

                  {/* Action buttons (Folder / Relink, Re-download, & Delete with ConfirmDialog) */}
                  <div className="w-20 shrink-0 flex items-center justify-center gap-1">
                    {item.fileExists === false ? (
                      <button
                        type="button"
                        onClick={() => handleAutoRelink(item)}
                        disabled={relinkingId === item.id}
                        className="p-1.5 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 transition-colors cursor-pointer"
                        title="Tự động quét tìm vị trí mới của file này trong thư viện"
                      >
                        {relinkingId === item.id ? (
                          <RefreshCw size={13} className="animate-spin" />
                        ) : (
                          <Search size={13} />
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const fullTarget =
                            item.relativeFilePath && item.libraryRootPath
                              ? `${item.libraryRootPath}\\${item.relativeFilePath}`
                              : item.libraryRootPath;
                          handleOpenFolder(fullTarget);
                        }}
                        className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                        title="Mở thư mục và chọn đúng file này trong Windows Explorer"
                      >
                        <FolderOpen size={13} />
                      </button>
                    )}

                    {item.sourceUrl && (
                      <a
                        href={`/youtube-music?url=${encodeURIComponent(item.sourceUrl)}`}
                        className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                          item.fileExists === false
                            ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25'
                            : 'border-[var(--border)] hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                        title={
                          item.fileExists === false
                            ? 'Tải lại bài hát: File nhạc đã bị xóa trên ổ đĩa. Bấm để tự động điền link YouTube và tải lại ngay!'
                            : 'Tải lại: Chuyển sang trang tải với link YouTube gốc của bài này'
                        }
                      >
                        <Download size={13} />
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => setItemToDelete(item)}
                      disabled={deleteMutation.isPending}
                      className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-rose-500/10 hover:border-rose-500/30 text-[var(--text-muted)] hover:text-rose-500 transition-colors cursor-pointer"
                      title="Xóa bản ghi này khỏi lịch sử tải"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls Footer */}
          {totalPages > 1 && (
            <div
              className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t bg-[var(--bg-subtle)] text-xs"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="text-xs tabular-nums text-[var(--text-muted)]">
                Đang xem trang <strong>{validPage}</strong> / <strong>{totalPages}</strong> ({totalItems} bản ghi)
              </span>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={validPage <= 1}
                  className="h-7 w-7 p-0 flex items-center justify-center cursor-pointer text-xs"
                  title="Trang đầu"
                >
                  <ChevronsLeft size={13} />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={validPage <= 1}
                  className="h-7 w-7 p-0 flex items-center justify-center cursor-pointer text-xs"
                  title="Trang trước"
                >
                  <ChevronLeft size={13} />
                </Button>

                <span className="px-2.5 font-bold tabular-nums text-xs text-[var(--text-primary)]">
                  {validPage} / {totalPages}
                </span>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={validPage >= totalPages}
                  className="h-7 w-7 p-0 flex items-center justify-center cursor-pointer text-xs"
                  title="Trang tiếp"
                >
                  <ChevronRight size={13} />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={validPage >= totalPages}
                  className="h-7 w-7 p-0 flex items-center justify-center cursor-pointer text-xs"
                  title="Trang cuối"
                >
                  <ChevronsRight size={13} />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. Confirm Dialog for Single Item Delete */}
      <ConfirmDialog
        open={Boolean(itemToDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setItemToDelete(null);
            setDeleteLocalFilesSingle(false);
          }
        }}
        title="Xóa bài hát khỏi lịch sử"
        description={
          <div className="space-y-3">
            <div>
              Bạn có chắc chắn muốn xóa bài hát{' '}
              <strong className="text-[var(--text-primary)]">"{itemToDelete?.title || 'Unknown'}"</strong> khỏi lịch sử tải không?
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-rose-500/25 bg-rose-500/10 cursor-pointer hover:bg-rose-500/15 transition-colors select-none">
              <div className="pt-0.5">
                <Checkbox
                  checked={deleteLocalFilesSingle}
                  onChange={(e) => setDeleteLocalFilesSingle(e.target.checked)}
                />
              </div>
              <div className="min-w-0 flex-1 text-xs leading-tight">
                <div className="font-semibold text-rose-400">Xóa vĩnh viễn tệp tin trên ổ đĩa</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-1">
                  Tự động xóa sạch file nhạc (.m4a/.mp3), file lời (.lrc), ảnh bìa và thư mục bài hát trên máy.
                </div>
              </div>
            </label>
          </div>
        }
        confirmText={deleteLocalFilesSingle ? 'Xóa cả tệp trên ổ đĩa' : 'Chỉ xóa lịch sử'}
        isDestructive
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (itemToDelete) {
            deleteMutation.mutate({ id: itemToDelete.id, deleteFiles: deleteLocalFilesSingle });
            setItemToDelete(null);
            setDeleteLocalFilesSingle(false);
          }
        }}
      />

      {/* 7. Confirm Dialog for Batch Delete */}
      <ConfirmDialog
        open={isConfirmBatchDeleteOpen}
        onOpenChange={(open) => {
          setIsConfirmBatchDeleteOpen(open);
          if (!open) setDeleteLocalFilesBatch(false);
        }}
        title="Xóa các bài hát đã chọn"
        description={
          <div className="space-y-3">
            <div>
              Bạn có chắc chắn muốn xóa <strong className="text-[#1DB954]">{selectedIds.size} bài hát</strong> đã chọn khỏi lịch sử tải không?
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-rose-500/25 bg-rose-500/10 cursor-pointer hover:bg-rose-500/15 transition-colors select-none">
              <div className="pt-0.5">
                <Checkbox
                  checked={deleteLocalFilesBatch}
                  onChange={(e) => setDeleteLocalFilesBatch(e.target.checked)}
                />
              </div>
              <div className="min-w-0 flex-1 text-xs leading-tight">
                <div className="font-semibold text-rose-400">Xóa vĩnh viễn tệp tin của {selectedIds.size} bài trên ổ đĩa</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-1">
                  Xóa toàn bộ file âm thanh, lời bài hát, ảnh bìa và thư mục con tương ứng trên máy tính.
                </div>
              </div>
            </label>
          </div>
        }
        confirmText={deleteLocalFilesBatch ? `Xóa cả file (${selectedIds.size}) bài` : `Xóa (${selectedIds.size}) bài`}
        isDestructive
        isLoading={isDeletingBatch}
        onConfirm={handleDeleteBatch}
      />

      {/* 8. Confirm Dialog for Clear All History */}
      <ConfirmDialog
        open={isConfirmClearAllOpen}
        onOpenChange={setIsConfirmClearAllOpen}
        title="Xóa toàn bộ lịch sử tải"
        description={
          <div>
            Thao tác này sẽ xóa toàn bộ <strong className="text-rose-400">{stats.total} bài hát</strong> khỏi danh sách lịch sử tải về.
            <div className="mt-1.5 text-xs text-[var(--text-muted)]">
              (Lưu ý: Các file âm thanh trên ổ cứng máy tính vẫn được giữ nguyên an toàn).
            </div>
          </div>
        }
        confirmText="Xóa tất cả"
        isDestructive
        isLoading={clearAllMutation.isPending}
        onConfirm={() => clearAllMutation.mutate()}
      />

      {/* Full Cover Viewer Modal */}
      <CoverViewerDialog
        isOpen={viewingCoverItem !== null}
        onClose={() => setViewingCoverItem(null)}
        imageUrl={viewingCoverItem?.imageUrl}
        title={viewingCoverItem?.title}
        artist={viewingCoverItem?.artist}
      />

      {/* Lyrics Editor Modal cho bài đã tải */}
      {lyricsEditingRecord && (
        <LyricsEditorDialog
          isOpen={Boolean(lyricsEditingRecord)}
          onClose={() => {
            setLyricsEditingRecord(null);
            setEditingRecordLyrics(undefined);
            setEditingRecordLyricsSource(undefined);
          }}
          item={{
            id: lyricsEditingRecord.id,
            title: lyricsEditingRecord.title,
            cleanTitle: lyricsEditingRecord.title,
            artist: lyricsEditingRecord.artist,
            duration: lyricsEditingRecord.duration,
            url: lyricsEditingRecord.sourceUrl,
            sourceUrl: lyricsEditingRecord.sourceUrl,
          }}
          currentLyrics={editingRecordLyrics}
          initialSource={editingRecordLyricsSource}
          onSave={handleSaveRecordLyrics}
        />
      )}
    </div>
  );
};
