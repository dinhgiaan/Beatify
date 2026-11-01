import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  RefreshCw,
  Play,
  Pause,
  Edit3,
  Trash2,
  Music,
  Clock,
  ShieldCheck,
  CheckSquare,
  Cloud,
  CloudOff,
  Check,
  AlertTriangle,
  ArrowUpDown,
  X,
  Disc,
  Mic2,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../../ui/organisms/PageHeader';
import { Button } from '../../ui/atoms/Button';
import { Checkbox } from '../../ui/atoms/Controls';
import { Dialog } from '../../ui/organisms/Dialog';
import { ConfirmDialog } from '../../ui/molecules/ConfirmDialog';
import { requestApi } from '../../core/api-client';
import { ArtistHoverCard } from '../artists/components/ArtistHoverCard';
import type { PlayingTrack } from '../../app/Layout';

interface TrackItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId?: string;
  duration: number;
  format: string;
  hasCover: boolean;
  hasLyrics: boolean;
  replayGain?: number;
  filePath: string;
  fileExists?: boolean;
  isSynced?: boolean;
}

type SortField = 'default' | 'title' | 'artist' | 'album' | 'duration';

export const LibraryPage: React.FC<{
  onPlayTrack?: (track: PlayingTrack) => void;
  playingTrackId?: string;
  isAudioPlaying?: boolean;
  onTogglePlayPause?: () => void;
}> = ({ onPlayTrack, playingTrackId, isAudioPlaying, onTogglePlayPause }) => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [syncFilter, setSyncFilter] = useState<'all' | 'unsynced' | 'synced'>('all');
  const [formatFilter, setFormatFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortField>('default');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Selection state for batch operations
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [isBatchTrashOpen, setIsBatchTrashOpen] = useState(false);

  // Editing state
  const [editingTrack, setEditingTrack] = useState<TrackItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editAlbum, setEditAlbum] = useState('');

  // Trash confirm state (single track)
  const [trashTrack, setTrashTrack] = useState<TrackItem | null>(null);

  const { data: tracks = [], isLoading, refetch } = useQuery<TrackItem[]>({
    queryKey: ['local-tracks'],
    queryFn: async () => {
      const res = await requestApi<{ tracks: TrackItem[] }>('/local-api/tracks');
      return res.tracks || [];
    },
    staleTime: 10000,
  });

  const saveOverrideMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      return requestApi(`/local-api/tracks/${id}/override`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast.success('Đã lưu siêu dữ liệu bài hát vào overrides.json');
      queryClient.invalidateQueries({ queryKey: ['local-tracks'] });
      setEditingTrack(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi lưu siêu dữ liệu: ${msg}`);
    },
  });

  const moveToTrashMutation = useMutation({
    mutationFn: async (id: string) => {
      return requestApi(`/local-api/tracks/${id}/trash`, { method: 'POST' });
    },
    onSuccess: () => {
      toast.success('Đã chuyển bài hát vào Thùng rác (lưu trữ 14 ngày)');
      queryClient.invalidateQueries({ queryKey: ['local-tracks'] });
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
      queryClient.invalidateQueries({ queryKey: ['trash-items'] });
      queryClient.invalidateQueries({ queryKey: ['artists-list'] });
      queryClient.invalidateQueries({ queryKey: ['yt-downloads-manager'] });
      queryClient.invalidateQueries({ queryKey: ['yt-downloads'] });
      if (trashTrack) {
        setSelectedTrackIds((prev) => {
          const next = new Set(prev);
          next.delete(trashTrack.id);
          return next;
        });
      }
      setTrashTrack(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi chuyển vào thùng rác: ${msg}`);
    },
  });

  const batchMoveToTrashMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      return requestApi('/local-api/tracks/batch/trash', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
    },
    onSuccess: (_, ids) => {
      toast.success(`Đã chuyển ${ids.length} bài hát vào Thùng rác (lưu trữ 14 ngày)`);
      queryClient.invalidateQueries({ queryKey: ['local-tracks'] });
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
      queryClient.invalidateQueries({ queryKey: ['trash-items'] });
      queryClient.invalidateQueries({ queryKey: ['artists-list'] });
      queryClient.invalidateQueries({ queryKey: ['yt-downloads-manager'] });
      queryClient.invalidateQueries({ queryKey: ['yt-downloads'] });
      setSelectedTrackIds(new Set());
      setIsBatchTrashOpen(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi chuyển nhiều bài vào thùng rác: ${msg}`);
    },
  });

  const unsyncedCount = useMemo(() => tracks.filter((t) => !t.isSynced).length, [tracks]);
  const syncedCount = useMemo(() => tracks.filter((t) => t.isSynced).length, [tracks]);

  // Tổng thời lượng thư viện
  const totalLibraryDuration = useMemo(() => {
    return tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  }, [tracks]);

  // Danh sách định dạng có trong thư viện
  const availableFormats = useMemo(() => {
    const set = new Set<string>();
    tracks.forEach((t) => {
      if (t.format && t.format.trim()) {
        set.add(t.format.toLowerCase().trim());
      }
    });
    return Array.from(set).sort();
  }, [tracks]);

  // Lọc và sắp xếp bài hát
  const filteredTracks = useMemo(() => {
    let list = tracks.filter((t) => {
      if (syncFilter === 'unsynced' && t.isSynced) return false;
      if (syncFilter === 'synced' && !t.isSynced) return false;
      if (formatFilter !== 'all' && t.format?.toLowerCase() !== formatFilter) return false;
      if (!searchTerm) return true;
      const s = searchTerm.toLowerCase();
      return (
        t.title.toLowerCase().includes(s) ||
        t.artist.toLowerCase().includes(s) ||
        t.album.toLowerCase().includes(s)
      );
    });

    if (sortBy !== 'default') {
      list = [...list].sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'title') cmp = a.title.localeCompare(b.title);
        else if (sortBy === 'artist') cmp = a.artist.localeCompare(b.artist);
        else if (sortBy === 'album') cmp = a.album.localeCompare(b.album);
        else if (sortBy === 'duration') cmp = (a.duration || 0) - (b.duration || 0);
        return sortOrder === 'asc' ? cmp : -cmp;
      });
    }

    return list;
  }, [tracks, searchTerm, syncFilter, formatFilter, sortBy, sortOrder]);

  // Selected tracks objects and summary
  const selectedTracksList = useMemo(() => {
    return tracks.filter((t) => selectedTrackIds.has(t.id));
  }, [tracks, selectedTrackIds]);

  const totalSelectedDuration = useMemo(() => {
    return selectedTracksList.reduce((acc, t) => acc + (t.duration || 0), 0);
  }, [selectedTracksList]);

  const toggleSelectTrack = (id: string) => {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isAllSelected = filteredTracks.length > 0 && filteredTracks.every((t) => selectedTrackIds.has(t.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedTrackIds(new Set());
    } else {
      setSelectedTrackIds(new Set(filteredTracks.map((t) => t.id)));
    }
  };

  const handleOpenEdit = (t: TrackItem) => {
    setEditingTrack(t);
    setEditTitle(t.title);
    setEditArtist(t.artist);
    setEditAlbum(t.album);
  };

  const handleSaveEdit = () => {
    if (!editingTrack) return;
    saveOverrideMutation.mutate({
      id: editingTrack.id,
      data: {
        title: editTitle.trim(),
        artist: editArtist.trim(),
        album: editAlbum.trim(),
      },
    });
  };

  const formatDuration = (sec: number) => {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatTotalTime = (sec: number) => {
    if (!sec || isNaN(sec)) return '0m';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const handleSortToggle = (field: SortField) => {
    if (sortBy === field) {
      if (sortOrder === 'asc') {
        setSortOrder('desc');
      } else {
        setSortBy('default');
        setSortOrder('asc');
      }
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  return (
    <div className="w-full max-w-[1720px] mx-auto px-8 py-6 space-y-6">
      <PageHeader
        title="Thư viện nhạc cá nhân"
        subtitle={`Toàn bộ bài hát đang lưu trữ cục bộ trên máy tính (${tracks.length} bài hát)`}
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                refetch();
                toast.success('Đã quét và đối chiếu tệp tin trên ổ cứng!');
              }}
              className="gap-2 shadow-xs cursor-pointer"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
              <span>Quét lại đĩa</span>
            </Button>
          </div>
        }
      />

      {/* 4 Thẻ KPI thống kê thư viện nhanh (Hero Metrics) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl border border-white/[0.08] bg-[var(--bg-surface)] shadow-xs relative overflow-hidden group">
          <div className="absolute right-3 top-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <Music size={44} className="text-[#1DB954]" />
          </div>
          <span className="text-[11.5px] font-medium text-[var(--text-muted)] flex items-center gap-1.5">
            <Music size={13} className="text-[#1DB954]" />
            <span>Tổng bài hát</span>
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              {tracks.length}
            </span>
            <span className="text-xs text-[var(--text-muted)]">bài</span>
          </div>
        </div>

        <div
          onClick={() => setSyncFilter(syncFilter === 'synced' ? 'all' : 'synced')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-xs relative overflow-hidden group ${
            syncFilter === 'synced'
              ? 'border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.12)]'
              : 'border-white/[0.08] bg-[var(--bg-surface)] hover:border-emerald-500/30'
          }`}
          title="Bấm để lọc bài đã upload lên R2"
        >
          <div className="absolute right-3 top-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <Cloud size={44} className="text-emerald-400" />
          </div>
          <span className="text-[11.5px] font-medium text-emerald-400 flex items-center gap-1.5">
            <Check size={13} className="stroke-[2.5]" />
            <span>Đã upload R2</span>
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-emerald-400">
              {syncedCount}
            </span>
            <span className="text-xs text-emerald-400/70">
              ({tracks.length > 0 ? Math.round((syncedCount / tracks.length) * 100) : 0}%)
            </span>
          </div>
        </div>

        <div
          onClick={() => setSyncFilter(syncFilter === 'unsynced' ? 'all' : 'unsynced')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-xs relative overflow-hidden group ${
            syncFilter === 'unsynced'
              ? 'border-amber-500/40 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.12)]'
              : 'border-white/[0.08] bg-[var(--bg-surface)] hover:border-amber-500/30'
          }`}
          title="Bấm để lọc bài chưa upload lên R2"
        >
          <div className="absolute right-3 top-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <CloudOff size={44} className="text-amber-400" />
          </div>
          <span className="text-[11.5px] font-medium text-amber-400 flex items-center gap-1.5">
            <CloudOff size={13} />
            <span>Chưa upload R2</span>
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-amber-400">
              {unsyncedCount}
            </span>
            <span className="text-xs text-amber-400/70">cần đồng bộ</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-white/[0.08] bg-[var(--bg-surface)] shadow-xs relative overflow-hidden group">
          <div className="absolute right-3 top-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <Clock size={44} className="text-indigo-400" />
          </div>
          <span className="text-[11.5px] font-medium text-[var(--text-muted)] flex items-center gap-1.5">
            <Clock size={13} className="text-indigo-400" />
            <span>Tổng thời lượng</span>
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">
              {formatTotalTime(totalLibraryDuration)}
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar lọc, tìm kiếm và phân loại thông minh */}
      <div className="p-3.5 rounded-2xl border border-white/[0.08] bg-[var(--bg-surface)] shadow-sm space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Ô tìm kiếm hiện đại */}
          <div className="flex-1 min-w-[280px] h-10 px-3.5 rounded-xl border border-white/[0.08] bg-black/25 flex items-center gap-2.5 focus-within:border-[#1DB954] focus-within:ring-2 focus-within:ring-[#1DB954]/20 transition-all">
            <Search size={15} className="text-[var(--text-muted)] shrink-0" />
            <input
              id="library-search-input"
              name="librarySearchTerm"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên bài hát, nghệ sĩ hoặc album..."
              className="w-full bg-transparent text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 text-zinc-300 flex items-center justify-center text-xs transition-colors cursor-pointer"
                title="Xóa tìm kiếm"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Bộ lọc trạng thái R2 */}
          <div className="flex items-center p-1 rounded-xl bg-black/30 border border-white/[0.06] shrink-0">
            <button
              type="button"
              onClick={() => setSyncFilter('all')}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                syncFilter === 'all'
                  ? 'bg-white/15 text-white shadow-xs font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span>Tất cả ({tracks.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSyncFilter('unsynced')}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                syncFilter === 'unsynced'
                  ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-xs font-bold'
                  : 'text-zinc-400 hover:text-amber-400'
              }`}
            >
              <CloudOff size={12} />
              <span>Chưa upload ({unsyncedCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setSyncFilter('synced')}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                syncFilter === 'synced'
                  ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 shadow-xs font-bold'
                  : 'text-zinc-400 hover:text-emerald-400'
              }`}
            >
              <Check size={12} className="stroke-[2.5]" />
              <span>Đã upload ({syncedCount})</span>
            </button>
          </div>

          {/* Bộ lọc định dạng âm thanh (nếu có nhiều định dạng) */}
          {availableFormats.length > 1 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-[var(--text-muted)] font-medium">Định dạng:</span>
              <select
                value={formatFilter}
                onChange={(e) => setFormatFilter(e.target.value)}
                className="h-9 px-2.5 rounded-xl border border-white/[0.08] bg-black/30 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#1DB954] cursor-pointer"
              >
                <option value="all">Tất cả ({tracks.length})</option>
                {availableFormats.map((fmt) => (
                  <option key={fmt} value={fmt}>
                    {fmt.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Thanh kết quả tìm kiếm / bộ lọc đang kích hoạt */}
        {(searchTerm || syncFilter !== 'all' || formatFilter !== 'all') && (
          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-xs">
            <span className="text-[var(--text-secondary)]">
              Tìm thấy <strong className="text-[var(--text-primary)] font-bold">{filteredTracks.length}</strong> bài hát phù hợp
            </span>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSyncFilter('all');
                setFormatFilter('all');
              }}
              className="text-[#1DB954] hover:underline font-medium cursor-pointer"
            >
              Xóa toàn bộ bộ lọc
            </button>
          </div>
        )}
      </div>

      {/* Bảng danh sách bài hát chuẩn Spotify Desktop (Modern Grid Data Table) */}
      <div className="rounded-2xl border border-white/[0.08] bg-[var(--bg-surface)] overflow-hidden shadow-sm">
        {/* Tiêu đề các cột (Table Header) */}
        <div className="px-5 py-3 bg-black/35 border-b border-white/[0.08] flex items-center gap-4 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider select-none">
          {/* Cột 1: Checkbox & # */}
          <div className="w-12 shrink-0 flex items-center gap-2">
            <Checkbox
              checked={isAllSelected}
              onChange={toggleSelectAll}
              className="rounded cursor-pointer"
              title={isAllSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            />
            <span className="font-mono text-zinc-500">#</span>
          </div>

          {/* Cột 2: Tiêu đề bài hát & Nghệ sĩ */}
          <div
            onClick={() => handleSortToggle('title')}
            className="flex-1 min-w-[220px] flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors"
          >
            <span>Tiêu đề bài hát</span>
            <ArrowUpDown size={11} className={sortBy === 'title' ? 'text-[#1DB954]' : 'opacity-40'} />
          </div>

          {/* Cột 3: Album */}
          <div
            onClick={() => handleSortToggle('album')}
            className="hidden md:flex flex-1 max-w-[260px] items-center gap-1.5 cursor-pointer hover:text-white transition-colors"
          >
            <span>Album</span>
            <ArrowUpDown size={11} className={sortBy === 'album' ? 'text-[#1DB954]' : 'opacity-40'} />
          </div>

          {/* Cột 4: Trạng thái Cloud (R2) */}
          <div className="w-28 shrink-0 text-center">
            <span>Sao lưu R2</span>
          </div>

          {/* Cột 5: Định dạng */}
          <div className="w-20 shrink-0 text-center hidden sm:block">
            <span>Định dạng</span>
          </div>

          {/* Cột 6: Thời lượng */}
          <div
            onClick={() => handleSortToggle('duration')}
            className="w-16 shrink-0 text-right flex items-center justify-end gap-1 cursor-pointer hover:text-white transition-colors"
          >
            <Clock size={11} />
            <ArrowUpDown size={11} className={sortBy === 'duration' ? 'text-[#1DB954]' : 'opacity-40'} />
          </div>

          {/* Cột 7: Thao tác */}
          <div className="w-20 shrink-0 text-right">
            <span>Thao tác</span>
          </div>
        </div>

        {/* Trạng thái Loading hoặc Rỗng */}
        {isLoading ? (
          <div className="p-16 text-center text-[var(--text-muted)] flex flex-col items-center justify-center gap-3">
            <RefreshCw size={28} className="animate-spin text-[#1DB954]" />
            <p className="text-[13px] font-medium text-[var(--text-secondary)]">Đang quét và tải danh sách bài hát...</p>
          </div>
        ) : filteredTracks.length === 0 ? (
          <div className="p-16 text-center text-[var(--text-muted)] flex flex-col items-center justify-center gap-3">
            <Music size={36} className="opacity-30" />
            <p className="text-[13.5px] font-medium text-zinc-300">Không tìm thấy bài hát nào trong kho nhạc.</p>
            <p className="text-xs text-zinc-500 max-w-sm">
              Hãy kiểm tra lại từ khóa tìm kiếm hoặc bấm nút &quot;Quét lại đĩa&quot; để cập nhật các tệp mới thêm.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {filteredTracks.map((t, idx) => {
              const isSelected = selectedTrackIds.has(t.id);
              const isCurrent = playingTrackId === t.id;
              const isPlayingNow = isCurrent && isAudioPlaying;

              const isLossless = ['flac', 'wav', 'alac'].includes(t.format?.toLowerCase() || '');

              return (
                <div
                  key={t.id}
                  className={`px-5 py-3 flex items-center gap-4 transition-all group select-none ${
                    isCurrent
                      ? 'bg-emerald-500/10 border-l-2 border-l-emerald-400'
                      : isSelected
                      ? 'bg-[#1DB954]/5 border-l-2 border-l-[#1DB954]'
                      : 'hover:bg-white/[0.04]'
                  }`}
                >
                  {/* Cột 1: Checkbox & Số thứ tự / Nút Play */}
                  <div className="w-12 shrink-0 flex items-center gap-2">
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleSelectTrack(t.id)}
                      className="rounded cursor-pointer"
                      title={isSelected ? 'Bỏ chọn bài hát' : 'Chọn bài hát'}
                    />

                    <div className="w-5 flex items-center justify-center">
                      {isPlayingNow ? (
                        /* Sóng nhạc Equalizer nhảy múa sinh động */
                        <span className="flex items-end gap-0.5 h-3.5">
                          <span className="w-0.5 h-3.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDuration: '0.6s' }} />
                          <span className="w-0.5 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDuration: '0.8s', animationDelay: '0.15s' }} />
                          <span className="w-0.5 h-2.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDuration: '0.7s', animationDelay: '0.3s' }} />
                        </span>
                      ) : (
                        <>
                          <span className="font-mono text-xs text-zinc-500 group-hover:hidden">
                            {idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (t.fileExists === false) {
                                toast.error('Tệp âm thanh này không còn tồn tại trên ổ cứng!');
                                return;
                              }
                              if (isCurrent) {
                                onTogglePlayPause?.();
                                return;
                              }
                              onPlayTrack?.({
                                id: t.id,
                                albumId: t.albumId,
                                title: t.title,
                                artist: t.artist,
                                fileUrl: `/local-api/stream/${t.id}`,
                                coverUrl: `/local-api/covers/${t.albumId || t.id}.jpg`,
                              });
                            }}
                            className="hidden group-hover:flex w-5 h-5 rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-black items-center justify-center shadow-sm cursor-pointer transition-transform active:scale-90"
                            title={`Phát: ${t.title}`}
                          >
                            <Play size={10} fill="currentColor" className="ml-0.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Cột 2: Ảnh bìa + Tên bài hát + Nghệ sĩ (có ArtistHoverCard) */}
                  <div className="flex-1 min-w-[220px] flex items-center gap-3">
                    <div
                      onClick={() => {
                        if (t.fileExists === false) return;
                        if (isCurrent) {
                          onTogglePlayPause?.();
                        } else {
                          onPlayTrack?.({
                            id: t.id,
                            albumId: t.albumId,
                            title: t.title,
                            artist: t.artist,
                            fileUrl: `/local-api/stream/${t.id}`,
                            coverUrl: `/local-api/covers/${t.albumId || t.id}.jpg`,
                          });
                        }
                      }}
                      className="w-10 h-10 rounded-xl overflow-hidden border border-white/10 bg-black/40 shrink-0 flex items-center justify-center relative shadow-sm cursor-pointer group/thumb"
                    >
                      <Music size={16} className="text-zinc-600 shrink-0" />
                      {(t.albumId || t.id) && (
                        <img
                          src={`/local-api/covers/${t.albumId || t.id}.jpg`}
                          alt={t.title}
                          className="w-full h-full object-cover absolute inset-0"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center text-white transition-opacity">
                        {isPlayingNow ? <Pause size={13} fill="white" /> : <Play size={13} fill="white" />}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[13px] font-bold truncate ${
                            isCurrent ? 'text-emerald-400 font-extrabold' : 'text-white'
                          }`}
                          title={t.title}
                        >
                          {t.title}
                        </span>

                        {/* Chỉ hiện tag đỏ khi file THỰC SỰ bị mất tệp */}
                        {t.fileExists === false && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                            <AlertTriangle size={9} />
                            <span>Mất tệp</span>
                          </span>
                        )}

                        {/* Badge LRC nếu bài hát có lời */}
                        {t.hasLyrics && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-white/[0.06] text-zinc-300 border border-white/[0.08] shrink-0"
                            title="Bài hát có lời đồng bộ LRC"
                          >
                            <Mic2 size={9} className="text-emerald-400" />
                            <span>LRC</span>
                          </span>
                        )}
                      </div>

                      {/* Tên nghệ sĩ tích hợp ArtistHoverCard xịn sò */}
                      <div className="text-[12px] text-zinc-400 flex items-center gap-2 mt-0.5 truncate">
                        <ArtistHoverCard artistName={t.artist} position="top">
                          <span className="hover:text-emerald-400 hover:underline transition-colors cursor-pointer font-medium">
                            {t.artist}
                          </span>
                        </ArtistHoverCard>
                      </div>
                    </div>
                  </div>

                  {/* Cột 3: Album */}
                  <div className="hidden md:flex flex-1 max-w-[260px] min-w-0 items-center text-xs text-zinc-400 truncate">
                    <Disc size={12} className="text-zinc-600 mr-1.5 shrink-0" />
                    <span className="truncate" title={t.album || 'Không có album'}>
                      {t.album || 'Chưa phân loại'}
                    </span>
                  </div>

                  {/* Cột 4: Trạng thái Cloud (R2) - Biểu tượng tinh tế, không còn badge thô thiển rác mắt */}
                  <div className="w-28 shrink-0 flex items-center justify-center">
                    {t.isSynced ? (
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                        title="Đã sao lưu an toàn lên Cloudflare R2"
                      >
                        <Check size={11} className="stroke-[2.5]" />
                        <span>Đã upload</span>
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/25"
                        title="Chưa upload lên R2 (chỉ lưu trên máy tính)"
                      >
                        <CloudOff size={11} />
                        <span>Chưa upload</span>
                      </span>
                    )}
                  </div>

                  {/* Cột 5: Định dạng âm thanh (Chỉ hiển thị khi có định dạng hợp lệ) */}
                  <div className="w-20 shrink-0 text-center hidden sm:block">
                    {t.format && t.format.trim() ? (
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          isLossless
                            ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                            : 'bg-white/[0.05] text-zinc-300 border border-white/[0.08]'
                        }`}
                        title={`Định dạng tệp âm thanh: ${t.format.toUpperCase()}`}
                      >
                        {t.format}
                      </span>
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
                    )}
                  </div>

                  {/* Cột 6: Thời lượng */}
                  <div className="w-16 shrink-0 text-right text-xs text-zinc-400 font-mono tabular-nums">
                    {formatDuration(t.duration)}
                  </div>

                  {/* Cột 7: Nút Thao tác (Sửa siêu dữ liệu, Chuyển vào thùng rác) */}
                  <div className="w-20 shrink-0 flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(t)}
                      className="p-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 hover:text-white cursor-pointer transition-colors"
                      title="Chỉnh sửa thông tin bài hát (overrides.json)"
                    >
                      <Edit3 size={13} />
                    </button>

                    <button
                      type="button"
                      onClick={() => setTrashTrack(t)}
                      className="p-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-400 text-zinc-400 cursor-pointer transition-colors"
                      title="Chuyển vào Thùng rác (lưu 14 ngày)"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Thanh thao tác hàng loạt nổi (Floating Batch Action Bar) */}
      {selectedTrackIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[var(--bg-surface)]/95 backdrop-blur-xl border border-white/15 shadow-2xl rounded-2xl px-5 py-3 flex items-center gap-4 text-xs animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-[#1DB954]/20 border border-[#1DB954]/40 flex items-center justify-center text-[#1DB954]">
              <CheckSquare size={13} />
            </div>
            <span className="font-medium text-white">
              Đã chọn <strong className="text-[#1DB954]">{selectedTrackIds.size}</strong> bài hát
            </span>
            <span className="text-zinc-400 font-mono text-[11px] border-l border-white/10 pl-2.5 ml-0.5 tabular-nums">
              {formatDuration(totalSelectedDuration)}
            </span>
          </div>

          <div className="h-4 w-[1px] bg-white/10" />

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedTrackIds(new Set())}
              className="h-8 text-xs px-3"
            >
              Bỏ chọn
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setIsBatchTrashOpen(true)}
              className="h-8 text-xs px-3.5 gap-1.5 shadow-sm"
            >
              <Trash2 size={13} />
              <span>Chuyển vào Thùng rác ({selectedTrackIds.size})</span>
            </Button>
          </div>
        </div>
      )}

      {/* Hộp thoại chỉnh sửa siêu dữ liệu bài hát (Dialog) */}
      <Dialog
        open={Boolean(editingTrack)}
        onOpenChange={(o) => !o && setEditingTrack(null)}
        title="Chỉnh sửa thông tin bài hát"
        description="Thay đổi sẽ được lưu an toàn vào overrides.json mà không làm hỏng tệp gốc"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditingTrack(null)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveEdit}
              disabled={saveOverrideMutation.isPending}
            >
              Lưu thay đổi
            </Button>
          </>
        }
      >
        <div className="space-y-3.5 py-1">
          <div>
            <label className="block text-[11.5px] font-medium text-[var(--text-secondary)] mb-1">
              Tên bài hát
            </label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-white/10 bg-black/40 text-[12.5px] text-white focus:outline-none focus:border-[#1DB954]"
            />
          </div>

          <div>
            <label className="block text-[11.5px] font-medium text-[var(--text-secondary)] mb-1">
              Nghệ sĩ
            </label>
            <input
              type="text"
              value={editArtist}
              onChange={(e) => setEditArtist(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-white/10 bg-black/40 text-[12.5px] text-white focus:outline-none focus:border-[#1DB954]"
            />
          </div>

          <div>
            <label className="block text-[11.5px] font-medium text-[var(--text-secondary)] mb-1">
              Album
            </label>
            <input
              type="text"
              value={editAlbum}
              onChange={(e) => setEditAlbum(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-white/10 bg-black/40 text-[12.5px] text-white focus:outline-none focus:border-[#1DB954]"
            />
          </div>
        </div>
      </Dialog>

      {/* Hộp thoại xác nhận chuyển 1 bài vào Thùng rác */}
      {trashTrack && (
        <ConfirmDialog
          open={Boolean(trashTrack)}
          onOpenChange={(o) => !o && setTrashTrack(null)}
          title="Chuyển vào Thùng rác?"
          maxWidth="md"
          description={
            <div className="space-y-3.5 py-1">
              <div className="p-3.5 rounded-2xl border border-white/10 bg-black/30 flex items-center gap-3.5 shadow-xs">
                <div className="w-14 h-14 rounded-xl overflow-hidden border border-white/10 bg-black/40 shrink-0 flex items-center justify-center relative shadow-sm">
                  <Music size={22} className="text-zinc-600 shrink-0" />
                  {(trashTrack.albumId || trashTrack.id) && (
                    <img
                      src={`/local-api/covers/${trashTrack.albumId || trashTrack.id}.jpg`}
                      alt={trashTrack.title}
                      className="w-full h-full object-cover absolute inset-0"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-[13.5px] font-bold text-white truncate" title={trashTrack.title}>
                    {trashTrack.title}
                  </h4>
                  <p className="text-[12px] text-zinc-400 font-medium truncate mt-0.5">
                    {trashTrack.artist}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[11px] text-zinc-300 font-mono bg-white/[0.05] px-2 py-0.5 rounded-md border border-white/10">
                      <Clock size={11} className="text-zinc-400" />
                      {formatDuration(trashTrack.duration)}
                    </span>
                    {trashTrack.format && (
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/10 text-zinc-300">
                        {trashTrack.format}
                      </span>
                    )}
                    {trashTrack.album && (
                      <span className="text-[11px] text-zinc-500 truncate max-w-[150px]" title={trashTrack.album}>
                        {trashTrack.album}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-200/90 text-[11.5px] leading-relaxed">
                <ShieldCheck size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  Bài hát sẽ được ẩn khỏi thư viện và lưu trữ an toàn trong <span className="font-semibold text-amber-300">Thùng rác 14 ngày</span>. Bạn có thể khôi phục bất cứ lúc nào trước khi xóa vĩnh viễn.
                </div>
              </div>
            </div>
          }
          confirmText="Chuyển vào Thùng rác"
          variant="danger"
          isLoading={moveToTrashMutation.isPending}
          onConfirm={() => {
            if (trashTrack) moveToTrashMutation.mutate(trashTrack.id);
          }}
        />
      )}

      {/* Hộp thoại xác nhận chuyển nhiều bài vào Thùng rác */}
      <ConfirmDialog
        open={isBatchTrashOpen}
        onOpenChange={(o) => !o && setIsBatchTrashOpen(false)}
        title={`Chuyển ${selectedTrackIds.size} bài hát vào Thùng rác?`}
        maxWidth="lg"
        description={
          <div className="space-y-3.5 py-1">
            <div className="flex items-center justify-between text-[11.5px] px-3.5 py-2.5 rounded-xl bg-black/30 border border-white/10">
              <span className="text-zinc-300">
                Số lượng: <strong className="text-white font-bold">{selectedTrackIds.size} bài hát</strong>
              </span>
              <span className="text-zinc-300 font-mono flex items-center gap-1.5">
                <Clock size={12} className="text-zinc-500" />
                Tổng: <strong className="text-white">{formatDuration(totalSelectedDuration)}</strong>
              </span>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 border border-white/10 rounded-xl p-2.5 bg-black/20 divide-y divide-white/[0.06]">
              {selectedTracksList.map((t) => (
                <div key={t.id} className="pt-1.5 first:pt-0 flex items-center justify-between gap-3 text-[11.5px]">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg overflow-hidden bg-black/40 shrink-0 border border-white/10 flex items-center justify-center relative">
                      <Music size={13} className="text-zinc-600 shrink-0" />
                      {(t.albumId || t.id) && (
                        <img
                          src={`/local-api/covers/${t.albumId || t.id}.jpg`}
                          alt={t.title}
                          className="w-full h-full object-cover absolute inset-0"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white truncate">{t.title}</p>
                      <p className="text-[10.5px] text-zinc-400 truncate">{t.artist}</p>
                    </div>
                  </div>
                  <span className="text-[10.5px] text-zinc-500 font-mono tabular-nums shrink-0">
                    {formatDuration(t.duration)}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-200/90 text-[11.5px] leading-relaxed">
              <ShieldCheck size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                Toàn bộ các bài hát đã chọn sẽ được lưu trữ an toàn trong <span className="font-semibold text-amber-300">Thùng rác 14 ngày</span>. Bạn có thể khôi phục lại bất kỳ lúc nào trước khi xóa vĩnh viễn.
              </div>
            </div>
          </div>
        }
        confirmText={`Chuyển ${selectedTrackIds.size} bài vào Thùng rác`}
        variant="danger"
        isLoading={batchMoveToTrashMutation.isPending}
        onConfirm={() => {
          batchMoveToTrashMutation.mutate(Array.from(selectedTrackIds));
        }}
      />
    </div>
  );
};
