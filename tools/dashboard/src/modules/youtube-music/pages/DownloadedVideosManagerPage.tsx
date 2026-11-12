import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderOpen,
  Search,
  RefreshCw,
  FileText,
  Trash2,
  Music,
  ExternalLink,
  Play,
  Pause,
  Cloud,
  CloudOff,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  ShieldCheck,
  UploadCloud,
  FolderSync,
  CheckSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import type { YoutubeMusicDownloadRecord } from '@music-app/shared';
import { normalizeText } from '@music-app/shared';
import { PageHeader } from '../../../ui/organisms/PageHeader';
import { ModuleNavTabs } from '../../../ui/molecules/ModuleNavTabs';
import { Select, Checkbox } from '../../../ui/atoms/Controls';
import { Button } from '../../../ui/atoms/Button';
import { ConfirmDialog } from '../../../ui/molecules/ConfirmDialog';
import { CoverViewerDialog } from '../components/CoverViewerDialog';
import { LyricsEditorDialog } from '../components/LyricsEditorDialog';
import { RelocateDialog } from '../components/RelocateDialog';
import { LocalImportReviewModal } from '../components/LocalImportReviewModal';
import { R2UploadReviewModal } from '../components/R2UploadReviewModal';
import {
  fetchDownloadsHistoryApi,
  deleteDownloadCompleteApi,
  relocateDownloadsApi,
  verifyDownloadsApi,
  openDownloadFolderApi,
  getDownloadLyricsApi,
  updateDownloadLyricsApi,
} from '../api';
import { formatBytes, formatSeconds } from '../../../core/formatters';
import { DownloadTimeDisplay } from '../../../ui/molecules/TrackBadges';

export const DownloadedVideosManagerPage: React.FC<{
  onPlayTrack?: (track: { id: string; title: string; artist: string; fileUrl: string; coverUrl?: string }) => void;
  onOpenSyncModal?: () => void;
  playingTrackId?: string;
  isAudioPlaying?: boolean;
  onTogglePlayPause?: () => void;
}> = ({ onPlayTrack, onOpenSyncModal, playingTrackId, isAudioPlaying, onTogglePlayPause }) => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'uploaded' | 'missing'>('all');
  const [formatFilter, setFormatFilter] = useState<string>('all');

  const [itemToDelete, setItemToDelete] = useState<YoutubeMusicDownloadRecord | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(true);
  const [deleteR2, setDeleteR2] = useState(false);

  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [batchDeleteFiles, setBatchDeleteFiles] = useState(true);
  const [batchDeleteR2, setBatchDeleteR2] = useState(false);

  const [isRelocateOpen, setIsRelocateOpen] = useState(false);
  const [relocateSingleItem, setRelocateSingleItem] = useState<YoutubeMusicDownloadRecord | null>(null);

  const [isLocalImportOpen, setIsLocalImportOpen] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [isR2UploadReviewOpen, setIsR2UploadReviewOpen] = useState(false);
  const [tracksForR2Review, setTracksForR2Review] = useState<YoutubeMusicDownloadRecord[]>([]);

  const [viewingCover, setViewingCover] = useState<{
    id?: string;
    url: string;
    title: string;
    artist: string;
  } | null>(null);

  const [editingLyricsItem, setEditingLyricsItem] = useState<{
    record: YoutubeMusicDownloadRecord;
    lyricsText: string;
    source: string;
  } | null>(null);

  // 1. Lấy danh sách video/bài hát đã tải (tự động đồng bộ thời gian thực mỗi 3 giây)
  const { data: downloads = [], isLoading, refetch } = useQuery({
    queryKey: ['yt-downloads-manager'],
    queryFn: () => fetchDownloadsHistoryApi(500),
    staleTime: 1000,
    refetchInterval: 3000,
  });

  // 2. Mutation kiểm tra tệp đĩa & trạng thái R2 Cloud
  const verifyMutation = useMutation({
    mutationFn: verifyDownloadsApi,
    onSuccess: (updatedList) => {
      queryClient.setQueryData(['yt-downloads-manager'], updatedList);
      queryClient.invalidateQueries({ queryKey: ['yt-downloads'] });
      queryClient.invalidateQueries({ queryKey: ['local-tracks'] });
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
      toast.success(`Đã quét & kiểm tra ${updatedList.length} bài hát trên ổ cứng!`);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi kiểm tra tệp: ${msg}`);
    },
  });

  // 3. Mutation xóa bài hát (đồng bộ đĩa cứng và Cloudflare R2)
  const deleteMutation = useMutation({
    mutationFn: ({ id, deleteFiles, deleteR2 }: { id: string; deleteFiles: boolean; deleteR2: boolean }) =>
      deleteDownloadCompleteApi(id, { deleteFiles, deleteR2 }),
    onSuccess: () => {
      toast.success('Đã xóa bài hát thành công');
      queryClient.invalidateQueries({ queryKey: ['yt-downloads-manager'] });
      queryClient.invalidateQueries({ queryKey: ['yt-downloads'] });
      queryClient.invalidateQueries({ queryKey: ['youtube-music-history'] });
      queryClient.invalidateQueries({ queryKey: ['local-tracks'] });
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
      queryClient.invalidateQueries({ queryKey: ['trash-items'] });
      queryClient.invalidateQueries({ queryKey: ['artists-list'] });
      setItemToDelete(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi xóa bài hát: ${msg}`);
    },
  });

  // 3b. Mutation xóa hàng loạt bài hát đã chọn
  const batchDeleteMutation = useMutation({
    mutationFn: async ({ ids, deleteFiles, deleteR2 }: { ids: string[]; deleteFiles: boolean; deleteR2: boolean }) => {
      let successCount = 0;
      for (const id of ids) {
        try {
          await deleteDownloadCompleteApi(id, { deleteFiles, deleteR2 });
          successCount++;
        } catch {
          // Bỏ qua lỗi từng bài để tiếp tục các bài còn lại
        }
      }
      return { successCount, total: ids.length };
    },
    onSuccess: (res) => {
      toast.success(`Đã xóa thành công ${res.successCount}/${res.total} bài hát`);
      setSelectedTrackIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['yt-downloads-manager'] });
      queryClient.invalidateQueries({ queryKey: ['yt-downloads'] });
      queryClient.invalidateQueries({ queryKey: ['youtube-music-history'] });
      queryClient.invalidateQueries({ queryKey: ['local-tracks'] });
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
      queryClient.invalidateQueries({ queryKey: ['trash-items'] });
      queryClient.invalidateQueries({ queryKey: ['artists-list'] });
      setIsBatchDeleting(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi xóa hàng loạt: ${msg}`);
    },
  });

  // 4. Mutation tìm lại tệp khi đổi thư mục (Smart Relocate)
  const relocateMutation = useMutation({
    mutationFn: relocateDownloadsApi,
    onSuccess: (res) => {
      if (res.relocatedCount > 0) {
        toast.success(`Đã tìm thấy và kết nối lại ${res.relocatedCount} bài hát!`);
      } else {
        toast.info('Không tìm thấy tệp trùng khớp nào trong thư mục này');
      }
      queryClient.invalidateQueries({ queryKey: ['yt-downloads-manager'] });
      setIsRelocateOpen(false);
      setRelocateSingleItem(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi định vị lại tệp: ${msg}`);
    },
  });

  // 6. Mở vị trí tệp trên máy tính (Windows Explorer)
  const handleOpenFolder = async (record: YoutubeMusicDownloadRecord) => {
    try {
      const res = await openDownloadFolderApi(record.id);
      if (res.opened) {
        toast.success('Đã mở thư mục chứa tệp trong Explorer');
      } else {
        toast.error('Không tìm thấy tệp trên ổ cứng');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi mở thư mục: ${msg}`);
    }
  };

  // Thống kê số lượng theo trạng thái
  const stats = useMemo(() => {
    const total = downloads.length;
    let uploadedCount = 0;
    let pendingCount = 0;
    let missingCount = 0;

    for (const d of downloads) {
      if (d.fileExists === false) {
        missingCount++;
      }
      if (d.uploadedToR2) {
        uploadedCount++;
      } else {
        pendingCount++;
      }
    }

    return { total, uploadedCount, pendingCount, missingCount };
  }, [downloads]);

  // Bộ lọc danh sách
  const filteredDownloads = useMemo(() => {
    return downloads.filter((d) => {
      // Lọc theo Tab
      if (activeTab === 'pending' && d.uploadedToR2) return false;
      if (activeTab === 'uploaded' && !d.uploadedToR2) return false;
      if (activeTab === 'missing' && d.fileExists !== false) return false;

      // Lọc theo Format
      if (formatFilter !== 'all' && d.format !== formatFilter) return false;

      // Tìm kiếm từ khóa (bỏ dấu tiếng Việt, không phân biệt hoa thường)
      if (searchTerm.trim() !== '') {
        const q = normalizeText(searchTerm);
        const titleMatch = normalizeText(d.title || '').includes(q);
        const artistMatch = normalizeText(d.artist || '').includes(q);
        const albumMatch = normalizeText(d.album || '').includes(q);
        const videoIdMatch = normalizeText(d.videoId || '').includes(q);
        const pathMatch = normalizeText(d.relativeFilePath || '').includes(q);
        if (!titleMatch && !artistMatch && !albumMatch && !videoIdMatch && !pathMatch) {
          return false;
        }
      }

      return true;
    });
  }, [downloads, activeTab, formatFilter, searchTerm]);

  // Kiểm tra trạng thái đã chọn tất cả các bài đang hiển thị trong bộ lọc
  const isAllFilteredSelected = useMemo(() => {
    if (filteredDownloads.length === 0) return false;
    return filteredDownloads.every((d) => selectedTrackIds.has(d.id));
  }, [filteredDownloads, selectedTrackIds]);

  // Toggle chọn tất cả / bỏ chọn tất cả
  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      const next = new Set(selectedTrackIds);
      filteredDownloads.forEach((d) => next.delete(d.id));
      setSelectedTrackIds(next);
    } else {
      const next = new Set(selectedTrackIds);
      filteredDownloads.forEach((d) => next.add(d.id));
      setSelectedTrackIds(next);
    }
  };

  // Phát nhạc nghe thử qua Audio Dock
  const handlePlayAudio = (record: YoutubeMusicDownloadRecord) => {
    if (!onPlayTrack) {
      toast.info('Trình phát âm thanh chưa sẵn sàng');
      return;
    }
    const coverUrl = record.relativeCoverPath
      ? `/local-api/static/${encodeURIComponent(record.relativeCoverPath)}`
      : record.videoId && !record.videoId.startsWith('pending_')
        ? `https://i.ytimg.com/vi/${record.videoId}/hqdefault.jpg`
        : undefined;

    onPlayTrack({
      id: record.id,
      title: record.title || 'Unknown Title',
      artist: record.artist || 'Unknown Artist',
      fileUrl: `/api/youtube-music/downloads/${record.id}/stream`,
      coverUrl,
    });
  };

  return (
    <div className="w-full max-w-[1720px] mx-auto px-8 py-6 space-y-6">
      <PageHeader
        title="Quản lý bài đã tải"
        subtitle="Quản lý tệp cục bộ, phân loại trạng thái upload Cloudflare R2 và kiểm tra đĩa cứng"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Nút kiểm tra tệp đĩa */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => verifyMutation.mutate()}
              disabled={verifyMutation.isPending}
              className="gap-1.5 text-xs font-semibold h-8 px-3"
              title="Quét lại toàn bộ ổ cứng để kiểm tra tệp âm thanh và lời bài hát"
            >
              <ShieldCheck
                size={14}
                className={verifyMutation.isPending ? 'animate-spin text-[#1DB954]' : 'text-[#1DB954]'}
              />
              <span>{verifyMutation.isPending ? 'Đang kiểm tra...' : 'Kiểm tra tệp đĩa'}</span>
            </Button>

            {/* Nút nhập file từ máy tính */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsLocalImportOpen(true)}
              className="gap-1.5 text-xs font-semibold h-8 px-3"
              title="Kéo thả hoặc chọn file nhạc từ máy tính để phân tích thẻ ID3 và đưa vào kho"
            >
              <UploadCloud size={14} className="text-[#1DB954]" />
              <span>Nhập file từ máy</span>
            </Button>

            {/* Nút đổi thư mục & tìm lại tệp thông minh */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setRelocateSingleItem(null);
                setIsRelocateOpen(true);
              }}
              className="gap-1.5 text-xs font-semibold h-8 px-3"
              title="Tìm lại tệp khi bạn di chuyển thư mục hoặc đổi tên ổ đĩa"
            >
              <FolderSync size={14} className="text-[#1DB954]" />
              <span>Đổi thư mục / Tìm lại</span>
            </Button>

            {/* Nút đồng bộ R2 Cloud */}
            {onOpenSyncModal && (
              <Button
                variant="primary"
                size="sm"
                onClick={onOpenSyncModal}
                className="gap-1.5 text-xs font-bold h-8 px-3.5 bg-[#1DB954] hover:bg-[#1ed760] text-black"
                title="Mở cửa sổ đồng bộ lên Cloudflare R2"
              >
                <Cloud size={14} className="text-black" />
                <span>Đồng bộ R2 Cloud</span>
              </Button>
            )}

            {/* Nút làm mới */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              className="h-8 px-2.5"
              title="Làm mới danh sách"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            </Button>
          </div>
        }
      />

      {/* Sub-tabs điều hướng thống nhất giữa Quản lý tệp/R2 và Lịch sử chi tiết */}
      <ModuleNavTabs
        tabs={[
          { label: 'Quản lý tệp & R2', path: '/youtube-music/manager' },
          { label: 'Lịch sử tải & Chi tiết', path: '/youtube-music/history' },
        ]}
      />

      {/* Batch Action Bar: Thanh hành động khi có bài được tick chọn */}
      <AnimatePresence>
        {selectedTrackIds.size > 0 && (
          <motion.div
            initial={{ y: -12, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -12, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="p-2.5 px-4 rounded-xl border border-[#1DB954]/40 bg-[#1DB954]/10 flex flex-wrap items-center justify-between gap-3 text-xs shadow-md"
          >
            <div className="flex items-center gap-2 text-white font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#1DB954]" />
              <span>Đã chọn {selectedTrackIds.size} bài hát</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  const selectedItems = downloads.filter((d) => selectedTrackIds.has(d.id));
                  setTracksForR2Review(selectedItems);
                  setIsR2UploadReviewOpen(true);
                }}
                className="bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold h-8 px-3.5 gap-1.5 cursor-pointer"
              >
                <Cloud size={13} className="text-black" />
                <span>Tải lên Cloudflare R2 ({selectedTrackIds.size} bài)</span>
              </Button>

              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setBatchDeleteFiles(false);
                  const hasR2 = downloads.some((d) => selectedTrackIds.has(d.id) && d.uploadedToR2);
                  setBatchDeleteR2(hasR2);
                  setIsBatchDeleting(true);
                }}
                className="h-8 px-3 gap-1.5 cursor-pointer text-white bg-rose-600 hover:bg-rose-700"
                title="Xóa các bài hát đã chọn (có tùy chọn xóa cứng file trên ổ đĩa)"
              >
                <Trash2 size={13} />
                <span>Xóa đã chọn ({selectedTrackIds.size})</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedTrackIds(new Set())}
                className="h-8 px-3 text-zinc-400 hover:text-white"
              >
                Bỏ chọn
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs lọc trạng thái Upload */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-[var(--bg-subtle)] rounded-xl border border-[var(--border)]">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'all'
                ? 'text-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {activeTab === 'all' && (
              <motion.span
                layoutId="manager-active-tab-bg"
                className="absolute inset-0 bg-[#1DB954] rounded-lg -z-0"
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              />
            )}
            <span className="relative z-10">Tất cả</span>
            <span className={`relative z-10 px-1.5 py-0.2 rounded-full text-[11px] ${activeTab === 'all' ? 'bg-black/20 text-black' : 'bg-black/40 text-zinc-300'}`}>
              {stats.total}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'pending'
                ? 'text-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {activeTab === 'pending' && (
              <motion.span
                layoutId="manager-active-tab-bg"
                className="absolute inset-0 bg-amber-400 rounded-lg -z-0"
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              />
            )}
            <CloudOff size={13} className="relative z-10" />
            <span className="relative z-10">Chưa upload R2</span>
            <span className={`relative z-10 px-1.5 py-0.2 rounded-full text-[11px] ${activeTab === 'pending' ? 'bg-black/20 text-black' : 'bg-amber-400/20 text-amber-300'}`}>
              {stats.pendingCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('uploaded')}
            className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'uploaded'
                ? 'text-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {activeTab === 'uploaded' && (
              <motion.span
                layoutId="manager-active-tab-bg"
                className="absolute inset-0 bg-[#1DB954] rounded-lg -z-0"
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              />
            )}
            <CheckCircle2 size={13} className="relative z-10" />
            <span className="relative z-10">Đã upload R2</span>
            <span className={`relative z-10 px-1.5 py-0.2 rounded-full text-[11px] ${activeTab === 'uploaded' ? 'bg-black/20 text-black' : 'bg-[#1DB954]/20 text-[#1DB954]'}`}>
              {stats.uploadedCount}
            </span>
          </button>

          {stats.missingCount > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('missing')}
              className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'missing'
                  ? 'text-white shadow-sm'
                  : 'text-rose-400 hover:text-rose-300'
              }`}
            >
              {activeTab === 'missing' && (
                <motion.span
                  layoutId="manager-active-tab-bg"
                  className="absolute inset-0 bg-rose-500 rounded-lg -z-0"
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                />
              )}
              <AlertTriangle size={13} className="relative z-10" />
              <span className="relative z-10">Tệp bị thiếu</span>
              <span className="relative z-10 px-1.5 py-0.2 rounded-full text-[11px] bg-rose-950 text-rose-300">
                {stats.missingCount}
              </span>
            </button>
          )}
        </div>

        {/* Thanh tìm kiếm & lọc format */}
        <div className="flex items-center gap-2 flex-1 sm:flex-initial">
          <div className="relative flex-1 sm:w-64">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              id="manager-search-input"
              name="managerSearchTerm"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên bài, nghệ sĩ..."
              className="w-full h-8 pl-8 pr-3 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#1DB954]"
            />
          </div>

          <Select
            id="manager-format-filter-select"
            name="managerFormatFilter"
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value)}
            selectSize="sm"
            className="w-24 shrink-0 text-xs h-8"
          >
            <option value="all">Mọi định dạng</option>
            <option value="m4a">M4A</option>
            <option value="flac">FLAC</option>
            <option value="mp3">MP3</option>
            <option value="opus">Opus</option>
          </Select>

          {/* Nút bấm chọn tất cả nhanh trên thanh công cụ */}
          {filteredDownloads.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleToggleSelectAll}
              className={`h-8 px-3 text-xs gap-1.5 font-semibold shrink-0 cursor-pointer transition-colors ${
                isAllFilteredSelected
                  ? 'bg-[#1DB954]/20 border-[#1DB954]/50 text-[#1DB954]'
                  : 'text-zinc-300 hover:text-white'
              }`}
              title={isAllFilteredSelected ? 'Bỏ chọn tất cả bài hát đang hiển thị' : 'Chọn tất cả bài hát đang hiển thị'}
            >
              <CheckSquare size={13} className={isAllFilteredSelected ? 'text-[#1DB954]' : 'text-zinc-400'} />
              <span>{isAllFilteredSelected ? 'Bỏ chọn tất cả' : `Chọn tất cả (${filteredDownloads.length})`}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Danh sách bài hát */}
      {filteredDownloads.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-[var(--border)] rounded-2xl bg-[var(--bg-surface)] space-y-2">
          <Music size={36} className="mx-auto text-zinc-600 mb-2" />
          <h3 className="text-sm font-bold text-white">Không tìm thấy bài hát nào</h3>
          <p className="text-xs text-zinc-400">
            {searchTerm
              ? 'Không có kết quả khớp với từ khóa tìm kiếm.'
              : activeTab === 'pending'
                ? 'Tuyệt vời! Tất cả bài hát đã được đồng bộ lên Cloudflare R2.'
                : activeTab === 'missing'
                  ? 'Tất cả các tệp đều đang tồn tại đầy đủ trên đĩa cứng.'
                  : 'Chưa có bài hát nào được tải về.'}
          </p>
        </div>
      ) : (
        <div className="border border-[var(--border)] rounded-xl bg-[var(--bg-surface)] overflow-hidden divide-y divide-[var(--border)] shadow-sm">
          {/* Header chọn tất cả đầu bảng */}
          <div className="px-3.5 py-2 bg-[var(--bg-subtle)]/70 flex items-center justify-between text-xs border-b border-[var(--border)] select-none">
            <div className="flex items-center gap-3">
              <Checkbox
                id="select-all-downloads-checkbox"
                checked={isAllFilteredSelected}
                onChange={handleToggleSelectAll}
                className="shrink-0 cursor-pointer"
              />
              <label
                htmlFor="select-all-downloads-checkbox"
                className="font-semibold text-zinc-300 hover:text-white cursor-pointer flex items-center gap-2"
              >
                <span>{isAllFilteredSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</span>
                <span className="text-zinc-500 font-normal">
                  ({filteredDownloads.length} bài{selectedTrackIds.size > 0 ? ` • Đã chọn ${selectedTrackIds.size}` : ''})
                </span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[var(--bg-surface)] hover:bg-[#1DB954]/15 hover:text-[#1DB954] text-zinc-300 border border-[var(--border)] transition-colors cursor-pointer"
              >
                {isAllFilteredSelected ? 'Bỏ chọn tất cả' : `Chọn tất cả (${filteredDownloads.length})`}
              </button>
            </div>
          </div>
          {filteredDownloads.map((item, index) => {
            const isFileMissing = item.fileExists === false;

            return (
              <div
                key={item.id || index}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--bg-subtle)] transition-colors group"
              >
                {/* Cột 1: Checkbox, Thumbnail & Metadata */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Checkbox chọn để thao tác hàng loạt */}
                  <Checkbox
                    checked={selectedTrackIds.has(item.id)}
                    onChange={(e) => {
                      const next = new Set(selectedTrackIds);
                      if (e.target.checked) {
                        next.add(item.id);
                      } else {
                        next.delete(item.id);
                      }
                      setSelectedTrackIds(next);
                    }}
                    className="shrink-0 cursor-pointer"
                  />

                  {/* Thumbnail Cover 1:1 có nút Play */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewingCover({
                        id: item.id,
                        url: `/local-api/downloads/${encodeURIComponent(item.id)}/cover`,
                        title: item.title || '',
                        artist: item.artist || '',
                      });
                    }}
                    className="relative w-12 h-12 rounded-lg overflow-hidden border border-[var(--border)] bg-black/60 shrink-0 group/cover cursor-pointer hover:ring-1 hover:ring-[#1DB954]"
                    title="Bấm để phóng to xem ảnh bìa"
                  >
                    <img
                      src={`/local-api/downloads/${encodeURIComponent(item.id)}/cover`}
                      alt={item.title || 'Cover'}
                      className="w-full h-full object-cover"
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

                    {/* Nút Play/Pause nghe thử đè lên Cover */}
                    {!isFileMissing && (
                      <button
                        type="button"
                        onClick={() => {
                          if (playingTrackId === item.id && isAudioPlaying) {
                            onTogglePlayPause?.();
                          } else {
                            handlePlayAudio(item);
                          }
                        }}
                        className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity cursor-pointer text-white hover:text-[#1DB954] ${
                          playingTrackId === item.id && isAudioPlaying
                            ? 'opacity-100 text-[#1DB954]'
                            : 'opacity-0 group-hover/cover:opacity-100'
                        }`}
                        title={playingTrackId === item.id && isAudioPlaying ? 'Tạm dừng' : 'Nghe thử ngay'}
                      >
                        {playingTrackId === item.id && isAudioPlaying ? (
                          <Pause size={18} className="fill-current text-[#1DB954]" />
                        ) : (
                          <Play size={18} className="fill-current" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Thông tin bài hát */}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white truncate max-w-md">
                        {item.title || 'Unknown Title'}
                      </span>

                      {/* Link gốc YouTube */}
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-zinc-500 hover:text-white transition-colors"
                        title="Mở video gốc trên YouTube"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-zinc-400 truncate">
                      <span className="font-medium text-zinc-300">{item.artist || 'Nghệ sĩ chưa rõ'}</span>
                      <span>•</span>
                      <span>{item.album || 'Singles'}</span>
                      {item.year && (
                        <>
                          <span>•</span>
                          <span className="text-zinc-300">{item.year}</span>
                        </>
                      )}
                      <span>•</span>
                      <span>{formatSeconds(item.duration)}</span>
                      <span>•</span>
                      <span className="text-[11px] uppercase px-1 py-0.2 rounded bg-black/40 border border-white/5">
                        {item.format}
                      </span>
                      {item.replayGain !== undefined && item.replayGain !== null && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                          title={`Âm lượng đo: ${item.loudnessLufs ?? '--'} LUFS (Cân bằng ReplayGain)`}
                        >
                          RG: {item.replayGain >= 0 ? `+${item.replayGain}` : item.replayGain} dB
                        </span>
                      )}
                    </div>

                    {/* Đường dẫn tệp cục bộ */}
                    {item.relativeFilePath && (
                      <div className="text-[11px]  text-zinc-500 truncate" title={item.relativeFilePath}>
                        {item.relativeFilePath}
                      </div>
                    )}
                  </div>
                </div>

                {/* Cột 2: Badges trạng thái Upload & Tệp */}
                <div className="flex flex-wrap items-center gap-2 shrink-0 sm:justify-end text-xs">
                  {/* Badge Upload Cloudflare R2 */}
                  {item.uploadedToR2 ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border border-[#1DB954]/30 bg-[#1DB954]/10 text-[#1DB954]">
                      <Cloud size={12} />
                      <span>Đã lên Cloud</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border border-amber-400/30 bg-amber-400/10 text-amber-300">
                      <CloudOff size={12} />
                      <span>Chưa upload</span>
                    </span>
                  )}

                  {/* Badge Tệp đĩa */}
                  {isFileMissing ? (
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border border-rose-500/30 bg-rose-500/10 text-rose-300">
                      <span className="flex items-center gap-1">
                        <AlertTriangle size={12} />
                        <span>Mất tệp</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setRelocateSingleItem(item);
                          setIsRelocateOpen(true);
                        }}
                        className="text-[#1DB954] hover:underline cursor-pointer font-bold"
                        title="Chỉ định lại đường dẫn tệp mới cho bài hát này"
                      >
                        Tìm lại
                      </button>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px]  text-zinc-400 border border-[var(--border)] bg-black/30" title="Tệp có sẵn trên đĩa">
                      <HardDrive size={11} className="text-[#1DB954]" />
                      <span>{formatBytes(item.fileSizeBytes) || 'Có tệp'}</span>
                    </span>
                  )}

                  {/* Badge Lời bài hát (.lrc) */}
                  {item.relativeLyricsPath || item.lyricsExists ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await getDownloadLyricsApi(item.id);
                          setEditingLyricsItem({
                            record: item,
                            lyricsText: res.lyrics,
                            source: res.source,
                          });
                        } catch (err: unknown) {
                          const msg = err instanceof Error ? err.message : String(err);
                          toast.error(`Lỗi nạp lời bài hát: ${msg}`);
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 cursor-pointer"
                      title="Bấm để xem và sửa lời đồng bộ"
                    >
                      <FileText size={11} />
                      <span>.lrc</span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-zinc-500 border border-transparent">
                      Chưa lời
                    </span>
                  )}

                  {/* Nút Upload trực tiếp lên Cloudflare R2 (mở Review Modal) */}
                  {!item.uploadedToR2 && !isFileMissing && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setTracksForR2Review([item]);
                        setIsR2UploadReviewOpen(true);
                      }}
                      className="h-7 px-2.5 text-[11px] font-bold bg-[#1DB954] text-black hover:bg-[#1ed760] gap-1 shrink-0 cursor-pointer"
                      title="Xem lại metadata và tải bài hát này lên Cloudflare R2"
                    >
                      <UploadCloud size={12} />
                      <span>Lên R2</span>
                    </Button>
                  )}

                  {/* Ngày tải */}
                  <div className="hidden md:flex items-center px-2 shrink-0">
                    <DownloadTimeDisplay dateStr={item.createdAt} />
                  </div>

                  {/* Nút hành động */}
                  <div className="flex items-center gap-1 pl-1">
                    {/* Mở thư mục Windows Explorer */}
                    <button
                      type="button"
                      onClick={() => handleOpenFolder(item)}
                      disabled={isFileMissing}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[var(--bg-hover)] disabled:opacity-40 transition-colors cursor-pointer"
                      title="Mở thư mục chứa tệp trong Explorer"
                    >
                      <FolderOpen size={14} />
                    </button>

                    {/* Nghe thử */}
                    {!isFileMissing && (
                      <button
                        type="button"
                        onClick={() => {
                          if (playingTrackId === item.id && isAudioPlaying) {
                            onTogglePlayPause?.();
                          } else {
                            handlePlayAudio(item);
                          }
                        }}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          playingTrackId === item.id && isAudioPlaying
                            ? 'text-[#1DB954] bg-[#1DB954]/10'
                            : 'text-zinc-400 hover:text-[#1DB954] hover:bg-[var(--bg-hover)]'
                        }`}
                        title={playingTrackId === item.id && isAudioPlaying ? 'Tạm dừng bài hát' : 'Nghe thử bài hát'}
                      >
                        {playingTrackId === item.id && isAudioPlaying ? (
                          <Pause size={14} className="fill-current text-[#1DB954]" />
                        ) : (
                          <Play size={14} />
                        )}
                      </button>
                    )}

                    {/* Xóa */}
                    <button
                      type="button"
                      onClick={() => {
                        setItemToDelete(item);
                        setDeleteFiles(true);
                        setDeleteR2(Boolean(item.uploadedToR2));
                      }}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                      title="Xóa bài hát"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog xác nhận xóa đơn lẻ (đồng bộ đĩa cứng & Cloudflare R2) */}
      {itemToDelete && (
        <ConfirmDialog
          open={Boolean(itemToDelete)}
          onOpenChange={(open) => !open && setItemToDelete(null)}
          title="Xóa bài hát đã tải?"
          description={
            <div className="space-y-3">
              <p>
                Bạn có chắc chắn muốn xóa &ldquo;{itemToDelete.title || 'bài hát này'}&rdquo; không?
              </p>

              <div className="space-y-2 pt-1 border-t border-[var(--border)]">
                <label htmlFor="single-delete-files-checkbox" className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
                  <Checkbox
                    id="single-delete-files-checkbox"
                    name="singleDeleteFilesCheckbox"
                    checked={deleteFiles}
                    onChange={(e) => setDeleteFiles(e.target.checked)}
                  />
                  <span>Xóa vĩnh viễn tệp âm thanh và tệp lời trên đĩa cứng (Local)</span>
                </label>

                {itemToDelete.uploadedToR2 && (
                  <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 space-y-1.5">
                    <label htmlFor="single-delete-r2-checkbox" className="flex items-start gap-2 text-xs text-amber-300 font-semibold cursor-pointer select-none">
                      <Checkbox
                        id="single-delete-r2-checkbox"
                        name="singleDeleteR2Checkbox"
                        checked={deleteR2}
                        onChange={(e) => setDeleteR2(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>Đồng bộ xóa tệp này trên Cloudflare R2 (khỏi app mobile)</span>
                    </label>
                    <div className="text-[10.5px] text-zinc-400 pl-5 break-all">
                      Đồng bộ xóa: music/{itemToDelete.trackId ? `${itemToDelete.trackId}.*` : (itemToDelete.relativeFilePath ? itemToDelete.relativeFilePath.split(/[/\\]/).pop() : itemToDelete.id)} &amp; cập nhật library.json
                    </div>
                  </div>
                )}
              </div>
            </div>
          }
          confirmText="Xác nhận xóa"
          variant="danger"
          isLoading={deleteMutation.isPending}
          onConfirm={() => {
            if (itemToDelete) {
              deleteMutation.mutate({
                id: itemToDelete.id,
                deleteFiles,
                deleteR2,
              });
            }
          }}
        />
      )}

      {/* Dialog xác nhận xóa hàng loạt (Batch Delete) */}
      {isBatchDeleting && (
        <ConfirmDialog
          open={isBatchDeleting}
          onOpenChange={(open) => !open && setIsBatchDeleting(false)}
          title={`Xóa ${selectedTrackIds.size} bài hát đã chọn?`}
          description={
            <div className="space-y-3">
              <p>
                Bạn có chắc chắn muốn xóa toàn bộ <strong>{selectedTrackIds.size}</strong> bài hát đang được chọn khỏi danh sách quản lý không?
              </p>

              <div className="space-y-2 pt-1 border-t border-[var(--border)]">
                <label htmlFor="batch-delete-files-checkbox" className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
                  <Checkbox
                    id="batch-delete-files-checkbox"
                    name="batchDeleteFilesCheckbox"
                    checked={batchDeleteFiles}
                    onChange={(e) => setBatchDeleteFiles(e.target.checked)}
                  />
                  <span>Xóa vĩnh viễn tệp âm thanh và tệp lời trên đĩa cứng (Local)</span>
                </label>

                {batchDeleteR2 && (
                  <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 space-y-1.5">
                    <label htmlFor="batch-delete-r2-checkbox" className="flex items-start gap-2 text-xs text-amber-300 font-semibold cursor-pointer select-none">
                      <Checkbox
                        id="batch-delete-r2-checkbox"
                        name="batchDeleteR2Checkbox"
                        checked={batchDeleteR2}
                        onChange={(e) => setBatchDeleteR2(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>Đồng bộ xóa các bài đã tải lên khỏi Cloudflare R2</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          }
          confirmText={`Xóa ${selectedTrackIds.size} bài hát`}
          variant="danger"
          isLoading={batchDeleteMutation.isPending}
          onConfirm={() => {
            batchDeleteMutation.mutate({
              ids: Array.from(selectedTrackIds),
              deleteFiles: batchDeleteFiles,
              deleteR2: batchDeleteR2,
            });
          }}
        />
      )}

      {/* Dialog xem ảnh bìa lớn kèm tải / đổi ảnh HD */}
      {viewingCover && (
        <CoverViewerDialog
          isOpen={Boolean(viewingCover)}
          onClose={() => setViewingCover(null)}
          imageUrl={viewingCover.url}
          title={viewingCover.title}
          artist={viewingCover.artist}
          trackId={viewingCover.id}
          onCoverUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ['yt-downloads'] });
            queryClient.invalidateQueries({ queryKey: ['local-tracks'] });
          }}
        />
      )}

      {/* Dialog chỉnh sửa lời bài hát (.lrc) */}
      {editingLyricsItem && (
        <LyricsEditorDialog
          isOpen={Boolean(editingLyricsItem)}
          onClose={() => setEditingLyricsItem(null)}
          item={{
            id: editingLyricsItem.record.id,
            title: editingLyricsItem.record.title || '',
            artist: editingLyricsItem.record.artist || '',
            duration: editingLyricsItem.record.duration,
            sourceUrl: editingLyricsItem.record.sourceUrl,
            lyricsSource: editingLyricsItem.source,
          }}
          currentLyrics={editingLyricsItem.lyricsText}
          initialSource={editingLyricsItem.source}
          onSave={async (newLyrics) => {
            try {
              await updateDownloadLyricsApi(editingLyricsItem.record.id, newLyrics);
              toast.success('Đã lưu lời bài hát .lrc thành công');
              queryClient.invalidateQueries({ queryKey: ['yt-downloads-manager'] });
              setEditingLyricsItem(null);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              toast.error(`Lỗi lưu lời: ${msg}`);
            }
          }}
        />
      )}

      {/* Dialog đổi thư mục & tìm lại tệp thông minh (Smart Relocate) */}
      <RelocateDialog
        isOpen={isRelocateOpen}
        onClose={() => {
          setIsRelocateOpen(false);
          setRelocateSingleItem(null);
        }}
        singleItem={relocateSingleItem}
        isLoading={relocateMutation.isPending}
        onRelocateAuto={async (targetDir) => {
          await relocateMutation.mutateAsync({ mode: 'auto-scan', targetDir });
        }}
        onRelocatePrefix={async (oldPrefix, newPrefix) => {
          await relocateMutation.mutateAsync({ mode: 'replace-prefix', oldPrefix, newPrefix });
        }}
        onRelocateSingle={async (id, newFullPath) => {
          await relocateMutation.mutateAsync({ mode: 'single-file', id, newFullPath });
        }}
      />

      {/* Modal Nhập file nhạc cục bộ từ máy tính & Review ID3 */}
      <LocalImportReviewModal
        isOpen={isLocalImportOpen}
        onClose={() => setIsLocalImportOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['yt-downloads-manager'] });
          queryClient.invalidateQueries({ queryKey: ['system-status'] });
        }}
      />

      {/* Modal Review trước khi Upload lên Cloudflare R2 */}
      <R2UploadReviewModal
        isOpen={isR2UploadReviewOpen}
        onClose={() => {
          setIsR2UploadReviewOpen(false);
          setTracksForR2Review([]);
        }}
        items={tracksForR2Review}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['yt-downloads-manager'] });
          queryClient.invalidateQueries({ queryKey: ['system-status'] });
          setSelectedTrackIds(new Set());
        }}
      />
    </div>
  );
};
