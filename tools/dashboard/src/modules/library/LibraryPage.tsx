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
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../../ui/organisms/PageHeader';
import { Button } from '../../ui/atoms/Button';
import { Badge, Checkbox } from '../../ui/atoms/Controls';
import { Dialog } from '../../ui/organisms/Dialog';
import { ConfirmDialog } from '../../ui/molecules/ConfirmDialog';
import { requestApi } from '../../core/api-client';

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

import type { PlayingTrack } from '../../app/Layout';

export const LibraryPage: React.FC<{
  onPlayTrack?: (track: PlayingTrack) => void;
  playingTrackId?: string;
  isAudioPlaying?: boolean;
  onTogglePlayPause?: () => void;
}> = ({ onPlayTrack, playingTrackId, isAudioPlaying, onTogglePlayPause }) => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [syncFilter, setSyncFilter] = useState<'all' | 'unsynced' | 'synced'>('all');

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

  const filteredTracks = useMemo(() => {
    return tracks.filter((t) => {
      if (syncFilter === 'unsynced' && t.isSynced) return false;
      if (syncFilter === 'synced' && !t.isSynced) return false;
      if (!searchTerm) return true;
      const s = searchTerm.toLowerCase();
      return (
        t.title.toLowerCase().includes(s) ||
        t.artist.toLowerCase().includes(s) ||
        t.album.toLowerCase().includes(s)
      );
    });
  }, [tracks, searchTerm, syncFilter]);

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
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-[1720px] mx-auto px-8 py-6 space-y-6">
      <PageHeader
        title="Kho bài hát cục bộ"
        subtitle={`Quản lý toàn bộ bài hát trên máy tính (${tracks.length} bài)`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                refetch();
                toast.success('Đã quét đối chiếu tệp tin trên ổ cứng!');
              }}
              className="gap-1.5"
            >
              <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
              <span>Kiểm tra tệp đĩa</span>
            </Button>
          </div>
        }
      />

      {/* Search & Sync Status Filter Pills */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
          <Search size={16} className="text-[var(--text-muted)] shrink-0" />
          <input
            id="library-search-input"
            name="librarySearchTerm"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm bài hát, nghệ sĩ hoặc album..."
            className="w-full bg-transparent text-[12.5px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              ×
            </button>
          )}
        </div>

        {/* Sync Status Filter Tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setSyncFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              syncFilter === 'all'
                ? 'bg-[var(--primary)] text-black shadow-sm font-bold'
                : 'bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <Music size={12} />
            <span>Tất cả bài hát ({tracks.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSyncFilter('unsynced')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              syncFilter === 'unsynced'
                ? 'bg-amber-500 text-black shadow-sm font-bold'
                : unsyncedCount > 0
                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                : 'bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <CloudOff size={12} />
            <span>Chưa upload R2 ({unsyncedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setSyncFilter('synced')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              syncFilter === 'synced'
                ? 'bg-emerald-500 text-black shadow-sm font-bold'
                : 'bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-emerald-400 hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <Check size={12} className="stroke-[2.5]" />
            <span>Đã upload R2 ({syncedCount})</span>
          </button>
        </div>
      </div>

      {/* Tracks Table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden shadow-sm">
        {/* Table Toolbar Header with Batch Selection */}
        {filteredTracks.length > 0 && (
          <div className="px-4 py-2.5 bg-[var(--bg-subtle)]/60 border-b border-[var(--border)] flex items-center justify-between gap-4 text-xs select-none">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                <Checkbox
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                  className="rounded cursor-pointer"
                />
                <span className="font-medium text-[12px]">
                  {selectedTrackIds.size > 0
                    ? `Đã chọn ${selectedTrackIds.size} / ${filteredTracks.length} bài hát`
                    : 'Chọn tất cả'}
                </span>
              </label>
            </div>

            {selectedTrackIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text-muted)] font-mono tabular-nums mr-1">
                  Tổng thời lượng: {formatDuration(totalSelectedDuration)}
                </span>
                <Button
                  variant="text"
                  size="sm"
                  onClick={() => setSelectedTrackIds(new Set())}
                  className="h-7 text-[11.5px] px-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Bỏ chọn
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setIsBatchTrashOpen(true)}
                  className="h-7 text-[11.5px] px-2.5 gap-1.5"
                >
                  <Trash2 size={12} />
                  <span>Chuyển vào Thùng rác ({selectedTrackIds.size})</span>
                </Button>
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="p-12 text-center text-[var(--text-muted)] flex flex-col items-center justify-center gap-2">
            <RefreshCw size={24} className="animate-spin text-[#1DB954]" />
            <p className="text-[12.5px] font-medium text-[var(--text-secondary)]">Đang quét và tải danh sách bài hát...</p>
          </div>
        ) : filteredTracks.length === 0 ? (
          <div className="p-12 text-center text-[var(--text-muted)] flex flex-col items-center justify-center gap-2">
            <Music size={32} className="opacity-40" />
            <p className="text-[13px]">Không tìm thấy bài hát nào trong kho nhạc.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {filteredTracks.map((t) => {
              const isSelected = selectedTrackIds.has(t.id);
              const isCurrent = playingTrackId === t.id;
              const isPlayingNow = isCurrent && isAudioPlaying;
              return (
                <div
                  key={t.id}
                  className={`p-3.5 px-4 flex items-center justify-between gap-4 transition-all group ${
                    isCurrent
                      ? 'bg-emerald-500/10 border-l-2 border-l-emerald-500 hover:bg-emerald-500/15'
                      : isSelected
                      ? 'bg-[var(--primary)]/5 border-l-2 border-l-[var(--primary)]'
                      : 'hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  {/* Left: Checkbox, Cover & Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="shrink-0 flex items-center justify-center">
                      <Checkbox
                        checked={isSelected}
                        onChange={() => toggleSelectTrack(t.id)}
                        className="rounded cursor-pointer"
                        title={isSelected ? 'Bỏ chọn bài hát' : 'Chọn bài hát'}
                      />
                    </div>

                    <div
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
                      className={`w-11 h-11 rounded-lg overflow-hidden border border-[var(--border)] bg-black/40 shrink-0 flex items-center justify-center relative shadow-sm ${
                        t.fileExists === false ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer group/play'
                      }`}
                    >
                      <Music size={18} className="text-[var(--text-muted)] shrink-0" />
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
                      {t.fileExists !== false && (
                        <div
                          className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity text-white ${
                            isCurrent ? 'opacity-100' : 'opacity-0 group-hover/play:opacity-100'
                          }`}
                        >
                          {isPlayingNow ? (
                            <Pause size={16} fill="white" />
                          ) : (
                            <Play size={16} fill="white" />
                          )}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[13px] font-bold truncate flex items-center gap-2 ${
                            isCurrent ? 'text-emerald-400 font-bold' : 'text-[var(--text-primary)]'
                          }`}
                        >
                          <span>{t.title}</span>
                          {isPlayingNow && (
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"
                              title="Đang phát"
                            />
                          )}
                        </span>
                        {t.fileExists === false ? (
                          <Badge variant="danger" className="text-[9.5px]">Mất tệp</Badge>
                        ) : (
                          <Badge variant="success" className="text-[9.5px]">Có tệp</Badge>
                        )}
                        {/* Tag trạng thái upload R2 */}
                        {t.isSynced ? (
                          <Badge variant="success" className="text-[9.5px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 gap-1 font-semibold flex items-center">
                            <Check size={10} className="stroke-[2.5]" />
                            <span>Đã upload R2</span>
                          </Badge>
                        ) : (
                          <Badge variant="warning" className="text-[9.5px] bg-amber-500/15 text-amber-400 border border-amber-500/30 gap-1 font-semibold flex items-center animate-in fade-in">
                            <CloudOff size={10} className="stroke-[2.5]" />
                            <span>Chưa upload</span>
                          </Badge>
                        )}
                        <Badge variant="neutral">{t.format}</Badge>
                        {t.hasLyrics && <Badge variant="success">LRC</Badge>}
                      </div>

                      <div className="text-[11.5px] text-[var(--text-secondary)] flex items-center gap-2 mt-0.5 truncate">
                        <span className="font-medium">{t.artist}</span>
                        <span className="text-[var(--text-muted)]">•</span>
                        <span className="text-[var(--text-muted)]">{t.album}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11.5px] text-[var(--text-muted)] tabular-nums mr-2">
                      {formatDuration(t.duration)}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(t)}
                      className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] cursor-pointer"
                      title="Chỉnh sửa thông tin"
                    >
                      <Edit3 size={13} />
                    </button>

                    <button
                      type="button"
                      onClick={() => setTrashTrack(t)}
                      className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-rose-500/10 hover:text-rose-400 text-[var(--text-muted)] cursor-pointer"
                      title="Chuyển vào Thùng rác"
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

      {/* Floating Batch Action Bar */}
      {selectedTrackIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[var(--bg-surface)]/95 backdrop-blur-md border border-[var(--border)] shadow-2xl rounded-2xl px-5 py-3 flex items-center gap-4 text-xs animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-[#1DB954]/20 border border-[#1DB954]/40 flex items-center justify-center text-[#1DB954]">
              <CheckSquare size={13} />
            </div>
            <span className="font-medium text-[var(--text-primary)]">
              Đã chọn <strong className="text-[#1DB954]">{selectedTrackIds.size}</strong> bài hát
            </span>
            <span className="text-[var(--text-muted)] font-mono text-[11px] border-l border-[var(--border)] pl-2.5 ml-0.5">
              {formatDuration(totalSelectedDuration)}
            </span>
          </div>

          <div className="h-4 w-[1px] bg-[var(--border)]" />

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

      {/* Edit Dialog */}
      <Dialog
        open={Boolean(editingTrack)}
        onOpenChange={(o) => !o && setEditingTrack(null)}
        title="Chỉnh sửa siêu dữ liệu bài hát"
        description="Thay đổi sẽ được lưu an toàn vào overrides.json mà không sửa đổi file gốc"
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
              className="w-full h-8 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[#1DB954]"
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
              className="w-full h-8 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[#1DB954]"
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
              className="w-full h-8 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[#1DB954]"
            />
          </div>
        </div>
      </Dialog>

      {/* Single Track Trash Confirm Dialog */}
      {trashTrack && (
        <ConfirmDialog
          open={Boolean(trashTrack)}
          onOpenChange={(o) => !o && setTrashTrack(null)}
          title="Chuyển vào Thùng rác?"
          maxWidth="md"
          description={
            <div className="space-y-3.5 py-1">
              {/* Track Preview Card */}
              <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] flex items-center gap-3.5 shadow-xs">
                <div className="w-14 h-14 rounded-lg overflow-hidden border border-[var(--border)] bg-black/40 shrink-0 flex items-center justify-center relative shadow-sm">
                  <Music size={22} className="text-[var(--text-muted)] shrink-0" />
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
                  <h4 className="text-[13.5px] font-bold text-[var(--text-primary)] truncate" title={trashTrack.title}>
                    {trashTrack.title}
                  </h4>
                  <p className="text-[12px] text-[var(--text-secondary)] font-medium truncate mt-0.5">
                    {trashTrack.artist}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)] font-mono bg-[var(--bg-surface)] px-2 py-0.5 rounded-md border border-[var(--border)]">
                      <Clock size={11} className="text-[var(--text-muted)]" />
                      {formatDuration(trashTrack.duration)}
                    </span>
                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-secondary)]">
                      {trashTrack.format}
                    </span>
                    {trashTrack.album && (
                      <span className="text-[11px] text-[var(--text-muted)] truncate max-w-[150px]" title={trashTrack.album}>
                        {trashTrack.album}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Safety notice banner */}
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

      {/* Batch Trash Confirm Dialog */}
      <ConfirmDialog
        open={isBatchTrashOpen}
        onOpenChange={(o) => !o && setIsBatchTrashOpen(false)}
        title={`Chuyển ${selectedTrackIds.size} bài hát vào Thùng rác?`}
        maxWidth="lg"
        description={
          <div className="space-y-3.5 py-1">
            {/* Summary statistics bar */}
            <div className="flex items-center justify-between text-[11.5px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)]">
              <span className="text-[var(--text-secondary)]">
                Số lượng: <strong className="text-[var(--text-primary)] font-bold">{selectedTrackIds.size} bài hát</strong>
              </span>
              <span className="text-[var(--text-secondary)] font-mono flex items-center gap-1.5">
                <Clock size={12} className="text-[var(--text-muted)]" />
                Tổng: <strong className="text-[var(--text-primary)]">{formatDuration(totalSelectedDuration)}</strong>
              </span>
            </div>

            {/* Compact Scrollable List (ngăn chặn tình trạng dài ngoằng làm xấu modal) */}
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 border border-[var(--border)] rounded-xl p-2.5 bg-[var(--bg-subtle)]/60 divide-y divide-[var(--border)]/40">
              {selectedTracksList.map((t) => (
                <div key={t.id} className="pt-1.5 first:pt-0 flex items-center justify-between gap-3 text-[11.5px]">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-md overflow-hidden bg-black/40 shrink-0 border border-[var(--border)] flex items-center justify-center relative">
                      <Music size={13} className="text-[var(--text-muted)] shrink-0" />
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
                      <p className="font-semibold text-[var(--text-primary)] truncate">{t.title}</p>
                      <p className="text-[10.5px] text-[var(--text-secondary)] truncate">{t.artist}</p>
                    </div>
                  </div>
                  <span className="text-[10.5px] text-[var(--text-muted)] font-mono tabular-nums shrink-0">
                    {formatDuration(t.duration)}
                  </span>
                </div>
              ))}
            </div>

            {/* Safety notice banner */}
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
