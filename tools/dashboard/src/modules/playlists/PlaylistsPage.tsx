import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ListMusic,
  Heart,
  Plus,
  Play,
  Pause,
  Trash2,
  Music,
  Clock,
  Search,
  Check,
  FolderPlus,
  ChevronRight,
  ArrowLeft,
  Cloud,
  Image as ImageIcon,
  Upload,
  Loader2,
  Edit3,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../../ui/organisms/PageHeader';
import { Button } from '../../ui/atoms/Button';
import { Badge } from '../../ui/atoms/Controls';
import { Dialog } from '../../ui/organisms/Dialog';
import { ConfirmDialog } from '../../ui/molecules/ConfirmDialog';
import { requestApi } from '../../core/api-client';
import { normalizeText, type UserState, type Playlist } from '@music-app/shared';
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
  filePath: string;
}

interface PlaylistsPageProps {
  onPlayTrack?: (t: PlayingTrack) => void;
  playingTrackId?: string;
  isAudioPlaying?: boolean;
  onTogglePlayPause?: () => void;
}

function formatDuration(sec: number): string {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const PlaylistsPage: React.FC<PlaylistsPageProps> = ({
  onPlayTrack,
  playingTrackId,
  isAudioPlaying,
  onTogglePlayPause,
}) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'playlists' | 'favorites'>('playlists');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);

  // Modal tạo Playlist
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
  const [createCoverFile, setCreateCoverFile] = useState<File | null>(null);
  const [createCoverPreview, setCreateCoverPreview] = useState<string | null>(null);
  const createCoverInputRef = React.useRef<HTMLInputElement>(null);

  // Modal chỉnh sửa Playlist
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [editPlaylistName, setEditPlaylistName] = useState('');
  const [editPlaylistDesc, setEditPlaylistDesc] = useState('');
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [editCoverPreview, setEditCoverPreview] = useState<string | null>(null);
  const [editRemoveCover, setEditRemoveCover] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const editCoverInputRef = React.useRef<HTMLInputElement>(null);

  // Modal phóng to xem ảnh bìa Playlist
  const [viewCoverUrl, setViewCoverUrl] = useState<string | null>(null);
  const [viewCoverTitle, setViewCoverTitle] = useState<string | null>(null);

  // Quản lý ảnh bìa playlist đang xem
  const [isUploadingPlaylistCover, setIsUploadingPlaylistCover] = useState(false);
  const activePlaylistCoverInputRef = React.useRef<HTMLInputElement>(null);

  // Modal thêm bài hát vào Playlist
  const [isAddTracksModalOpen, setIsAddTracksModalOpen] = useState(false);
  const [trackSearchQuery, setTrackSearchQuery] = useState('');
  const [selectedTrackIdsToAdd, setSelectedTrackIdsToAdd] = useState<string[]>([]);
  const [selectedPlaylistTrackIds, setSelectedPlaylistTrackIds] = useState<Set<string>>(new Set());

  // Dialog xác nhận xóa playlist
  const [playlistToDelete, setPlaylistToDelete] = useState<Playlist | null>(null);

  // 1. Lấy UserState (Playlists & Favorites) - hỗ trợ cả unwrap tự động của requestApi lẫn dạng lồng
  const { data: rawState } = useQuery<UserState | { data: UserState }>({
    queryKey: ['user-state'],
    queryFn: () => requestApi<UserState | { data: UserState }>('/local-api/state'),
  });

  const userState: UserState = useMemo(() => {
    if (!rawState) {
      return {
        version: 1,
        updatedAt: new Date().toISOString(),
        playlists: [],
        favoriteIds: [],
      };
    }
    if ('playlists' in rawState && Array.isArray(rawState.playlists)) {
      return rawState;
    }
    if ('data' in rawState && rawState.data && 'playlists' in rawState.data) {
      return rawState.data;
    }
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      playlists: [],
      favoriteIds: [],
    };
  }, [rawState]);

  // 2. Lấy danh sách tất cả bài hát trong thư viện (dùng chung queryKey 'local-tracks')
  const { data: tracksRes } = useQuery<{ tracks: TrackItem[] }>({
    queryKey: ['local-tracks'],
    queryFn: () => requestApi<{ tracks: TrackItem[] }>('/local-api/tracks'),
  });

  const allTracks = tracksRes?.tracks || [];
  const tracksMap = useMemo(() => {
    const map = new Map<string, TrackItem>();
    for (const t of allTracks) {
      map.set(t.id, t);
    }
    return map;
  }, [allTracks]);

  // Mutation cập nhật UserState
  const saveStateMutation = useMutation({
    mutationFn: (newState: UserState) =>
      requestApi('/local-api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newState),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-state'] });
      toast.success('Đã đồng bộ danh sách phát & yêu thích lên Cloudflare R2!');
    },
    onError: (err: unknown) => {
      toast.error('Lỗi lưu danh sách phát: ' + String(err));
    },
  });

  const handleSaveState = (updater: (prev: UserState) => UserState) => {
    const updated = updater(userState);
    updated.updatedAt = new Date().toISOString();
    saveStateMutation.mutate(updated);
  };

  // Cập nhật ảnh bìa cho Playlist
  const handleUploadPlaylistCover = async (playlistId: string, file: File) => {
    try {
      setIsUploadingPlaylistCover(true);
      const formData = new FormData();
      formData.append('cover', file);

      const res = await fetch(`/local-api/playlists/${playlistId}/cover`, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: formData,
      });

      if (!res.ok) throw new Error('Không thể lưu ảnh bìa playlist lên server');
      const json = await res.json();
      const newCoverUrl = json.coverUrl || `/local-api/covers/playlist_${playlistId}.jpg?_t=${Date.now()}`;

      handleSaveState((prev) => ({
        ...prev,
        playlists: prev.playlists.map((pl) =>
          pl.id === playlistId ? { ...pl, coverUrl: newCoverUrl, updatedAt: new Date().toISOString() } : pl
        ),
      }));
      toast.success('Đã cập nhật ảnh bìa danh sách phát!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi cập nhật ảnh bìa: ${msg}`);
    } finally {
      setIsUploadingPlaylistCover(false);
      if (activePlaylistCoverInputRef.current) activePlaylistCoverInputRef.current.value = '';
    }
  };

  // Xóa ảnh bìa Playlist
  const handleDeletePlaylistCover = async (playlistId: string) => {
    try {
      setIsUploadingPlaylistCover(true);
      await fetch(`/local-api/playlists/${playlistId}/cover`, {
        method: 'DELETE',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      handleSaveState((prev) => ({
        ...prev,
        playlists: prev.playlists.map((pl) =>
          pl.id === playlistId ? { ...pl, coverUrl: undefined, updatedAt: new Date().toISOString() } : pl
        ),
      }));
      toast.success('Đã xóa ảnh bìa danh sách phát!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi xóa ảnh bìa: ${msg}`);
    } finally {
      setIsUploadingPlaylistCover(false);
    }
  };

  // Tạo playlist
  const handleCreatePlaylist = async () => {
    const trimmed = newPlaylistName.trim();
    if (!trimmed) {
      toast.error('Vui lòng nhập tên danh sách phát');
      return;
    }

    const playlistId = 'pl_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    let coverUrl: string | undefined = undefined;

    // Nếu người dùng có chọn ảnh bìa trước khi tạo
    if (createCoverFile) {
      try {
        const formData = new FormData();
        formData.append('cover', createCoverFile);
        const res = await fetch(`/local-api/playlists/${playlistId}/cover`, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          body: formData,
        });
        if (res.ok) {
          const json = await res.json();
          coverUrl = json.coverUrl || `/local-api/covers/playlist_${playlistId}.jpg?_t=${Date.now()}`;
        }
      } catch {
        // bỏ qua
      }
    }

    const now = new Date().toISOString();
    const newPlaylist: Playlist = {
      id: playlistId,
      name: trimmed,
      description: newPlaylistDesc.trim() || undefined,
      coverUrl,
      trackIds: [],
      createdAt: now,
      updatedAt: now,
    };

    handleSaveState((prev) => ({
      ...prev,
      playlists: [newPlaylist, ...prev.playlists],
    }));

    setIsCreateModalOpen(false);
    setNewPlaylistName('');
    setNewPlaylistDesc('');
    setCreateCoverFile(null);
    setCreateCoverPreview(null);
    setSelectedPlaylistId(newPlaylist.id);
    toast.success(`Đã tạo playlist "${trimmed}"`);
  };

  // Xóa playlist
  const handleDeletePlaylist = () => {
    if (!playlistToDelete) return;
    handleSaveState((prev) => ({
      ...prev,
      playlists: prev.playlists.filter((p) => p.id !== playlistToDelete.id),
    }));
    if (selectedPlaylistId === playlistToDelete.id) {
      setSelectedPlaylistId(null);
    }
    setPlaylistToDelete(null);
    toast.success(`Đã xóa playlist "${playlistToDelete.name}"`);
  };

  // Thêm bài hát vào playlist
  const handleConfirmAddTracks = () => {
    if (!selectedPlaylistId || selectedTrackIdsToAdd.length === 0) {
      setIsAddTracksModalOpen(false);
      return;
    }

    handleSaveState((prev) => ({
      ...prev,
      playlists: prev.playlists.map((pl) => {
        if (pl.id !== selectedPlaylistId) return pl;
        const currentSet = new Set(pl.trackIds);
        for (const tid of selectedTrackIdsToAdd) {
          currentSet.add(tid);
        }
        return {
          ...pl,
          trackIds: Array.from(currentSet),
          updatedAt: new Date().toISOString(),
        };
      }),
    }));

    setIsAddTracksModalOpen(false);
    setSelectedTrackIdsToAdd([]);
    toast.success(`Đã thêm ${selectedTrackIdsToAdd.length} bài hát vào playlist`);
  };

  // Xóa bài hát khỏi playlist
  const handleRemoveTrackFromPlaylist = (trackId: string) => {
    if (!selectedPlaylistId) return;
    handleSaveState((prev) => ({
      ...prev,
      playlists: prev.playlists.map((pl) => {
        if (pl.id !== selectedPlaylistId) return pl;
        return {
          ...pl,
          trackIds: pl.trackIds.filter((id) => id !== trackId),
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  };

  // Xóa nhiều bài hát cùng lúc khỏi playlist
  const handleBatchRemoveTracksFromPlaylist = () => {
    if (!selectedPlaylistId || selectedPlaylistTrackIds.size === 0) return;
    const count = selectedPlaylistTrackIds.size;
    handleSaveState((prev) => ({
      ...prev,
      playlists: prev.playlists.map((pl) => {
        if (pl.id !== selectedPlaylistId) return pl;
        return {
          ...pl,
          trackIds: pl.trackIds.filter((id) => !selectedPlaylistTrackIds.has(id)),
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
    setSelectedPlaylistTrackIds(new Set());
    toast.success(`Đã xóa ${count} bài hát khỏi danh sách phát (Đồng bộ iPhone)!`);
  };

  // Toggle Favorite
  const handleToggleFavorite = (trackId: string) => {
    const isFav = userState.favoriteIds.includes(trackId);
    handleSaveState((prev) => ({
      ...prev,
      favoriteIds: isFav
        ? prev.favoriteIds.filter((id) => id !== trackId)
        : [...prev.favoriteIds, trackId],
    }));
    toast.success(isFav ? 'Đã xóa khỏi danh sách yêu thích' : 'Đã thêm vào bài hát yêu thích ❤️');
  };

  // Playlist hiện đang chọn
  const activePlaylist = useMemo(() => {
    if (!selectedPlaylistId) return null;
    return userState.playlists.find((p) => p.id === selectedPlaylistId) || null;
  }, [userState.playlists, selectedPlaylistId]);

  // Danh sách bài trong active playlist
  const activePlaylistTracks = useMemo(() => {
    if (!activePlaylist) return [];
    return activePlaylist.trackIds
      .map((id) => tracksMap.get(id))
      .filter((t): t is TrackItem => Boolean(t));
  }, [activePlaylist, tracksMap]);

  // Danh sách bài yêu thích hợp lệ
  const favoriteTracks = useMemo(() => {
    return userState.favoriteIds
      .map((id) => tracksMap.get(id))
      .filter((t): t is TrackItem => Boolean(t));
  }, [userState.favoriteIds, tracksMap]);

  // Danh sách ID yêu thích mồ côi (không tồn tại trong thư viện local)
  const orphanFavoriteIds = useMemo(() => {
    return userState.favoriteIds.filter((id) => !tracksMap.has(id));
  }, [userState.favoriteIds, tracksMap]);

  // Dọn dẹp ID yêu thích mồ côi
  const handleCleanOrphanFavorites = () => {
    const validIds = userState.favoriteIds.filter((id) => tracksMap.has(id));
    handleSaveState((prev) => ({
      ...prev,
      favoriteIds: validIds,
    }));
    toast.success(`Đã dọn dẹp ${orphanFavoriteIds.length} bài hát không còn tồn tại trong thư viện!`);
  };

  // Mở modal chỉnh sửa Playlist đã có
  const handleOpenEditPlaylist = (pl: Playlist, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingPlaylist(pl);
    setEditPlaylistName(pl.name);
    setEditPlaylistDesc(pl.description || '');
    setEditCoverFile(null);
    setEditCoverPreview(pl.coverUrl || null);
    setEditRemoveCover(false);
  };

  // Lưu thông tin chỉnh sửa Playlist
  const handleSaveEditPlaylist = async () => {
    if (!editingPlaylist) return;
    const trimmed = editPlaylistName.trim();
    if (!trimmed) {
      toast.error('Vui lòng nhập tên danh sách phát');
      return;
    }

    try {
      setIsSavingEdit(true);
      let finalCoverUrl = editingPlaylist.coverUrl;

      if (editCoverFile) {
        const formData = new FormData();
        formData.append('cover', editCoverFile);
        const res = await fetch(`/local-api/playlists/${editingPlaylist.id}/cover`, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          body: formData,
        });
        if (res.ok) {
          const json = await res.json();
          finalCoverUrl = json.coverUrl || `/local-api/covers/playlist_${editingPlaylist.id}.jpg?_t=${Date.now()}`;
        }
      } else if (editRemoveCover) {
        await fetch(`/local-api/playlists/${editingPlaylist.id}/cover`, {
          method: 'DELETE',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        finalCoverUrl = undefined;
      }

      const now = new Date().toISOString();
      handleSaveState((prev) => ({
        ...prev,
        playlists: prev.playlists.map((pl) =>
          pl.id === editingPlaylist.id
            ? {
                ...pl,
                name: trimmed,
                description: editPlaylistDesc.trim() || undefined,
                coverUrl: finalCoverUrl,
                updatedAt: now,
              }
            : pl
        ),
      }));

      setEditingPlaylist(null);
      toast.success('Đã cập nhật danh sách phát thành công!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi cập nhật danh sách phát: ${msg}`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Bộ lọc bài hát khi thêm vào playlist
  const candidateTracks = useMemo(() => {
    if (!activePlaylist) return [];
    const currentSet = new Set(activePlaylist.trackIds);
    if (!trackSearchQuery.trim()) {
      return allTracks.filter((t) => !currentSet.has(t.id));
    }
    const q = normalizeText(trackSearchQuery);
    return allTracks.filter((t) => {
      if (currentSet.has(t.id)) return false;
      return (
        normalizeText(t.title).includes(q) ||
        normalizeText(t.artist).includes(q) ||
        normalizeText(t.album).includes(q)
      );
    });
  }, [allTracks, activePlaylist, trackSearchQuery]);

  const handlePlay = (track: TrackItem) => {
    if (playingTrackId === track.id && onTogglePlayPause) {
      onTogglePlayPause();
      return;
    }
    if (onPlayTrack) {
      onPlayTrack({
        id: track.id,
        albumId: track.albumId,
        title: track.title,
        artist: track.artist,
        coverUrl: track.hasCover ? `/local-api/covers/${track.albumId || track.id}.jpg` : undefined,
        fileUrl: `/local-api/stream/${track.id}`,
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 max-w-7xl mx-auto w-full gap-6">
      <PageHeader
        title="Danh sách phát & Yêu thích"
        subtitle="Quản lý các tuyển tập âm nhạc cá nhân, tự động đồng bộ 2 chiều tức thì với ứng dụng iPhone qua Cloudflare R2"
        actions={
          <Button
            variant="primary"
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2"
          >
            <Plus size={16} />
            <span>Tạo Playlist mới</span>
          </Button>
        }
      />

      {/* Navigation Tabs */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] pb-2">
        <button
          type="button"
          onClick={() => {
            setActiveTab('playlists');
            setSelectedPlaylistId(null);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'playlists'
              ? 'bg-[#1DB954]/15 text-[#1DB954] border border-[#1DB954]/30'
              : 'text-[var(--text-muted)] hover:text-white hover:bg-white/5'
          }`}
        >
          <ListMusic size={16} />
          <span>Danh sách phát ({userState.playlists.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('favorites');
            setSelectedPlaylistId(null);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'favorites'
              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
              : 'text-[var(--text-muted)] hover:text-white hover:bg-white/5'
          }`}
        >
          <Heart size={16} className={activeTab === 'favorites' ? 'fill-rose-400' : ''} />
          <span>Bài hát yêu thích ({favoriteTracks.length})</span>
          {orphanFavoriteIds.length > 0 && (
            <span
              className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-bold"
              title={`${orphanFavoriteIds.length} bài hát cũ không còn tồn tại trong thư mục nhạc local`}
            >
              +{orphanFavoriteIds.length} cũ
            </span>
          )}
        </button>

        <div className="ml-auto flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <Cloud size={14} className="text-[#1DB954]" />
          <span>Tự động đồng bộ với iPhone</span>
        </div>
      </div>

      {/* TAB 1: DANH SÁCH PHÁT */}
      {activeTab === 'playlists' && (
        <div className="flex-1 flex flex-col gap-6">
          {!selectedPlaylistId ? (
            /* Danh sách các card Playlist */
            userState.playlists.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16 border border-dashed border-[var(--border)] rounded-2xl bg-[var(--bg-surface)] text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#1DB954]/10 flex items-center justify-center text-[#1DB954] mb-4">
                  <FolderPlus size={32} />
                </div>
                <h3 className="text-base font-bold text-white mb-1">Chưa có danh sách phát nào</h3>
                <p className="text-sm text-[var(--text-muted)] max-w-md mb-6">
                  Tạo danh sách phát đầu tiên để sắp xếp bài hát theo sở thích, tâm trạng hoặc chủ đề. Dữ liệu sẽ đồng bộ ngay với iPhone.
                </p>
                <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
                  <Plus size={16} className="mr-2" /> Tạo Playlist mới
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {userState.playlists.map((pl) => (
                  <div
                    key={pl.id}
                    onClick={() => setSelectedPlaylistId(pl.id)}
                    className="group flex flex-col p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] hover:border-[#1DB954]/40 hover:bg-white/[0.03] transition-all cursor-pointer relative"
                  >
                    <div className="aspect-square w-full rounded-lg bg-black/40 border border-[var(--border)] flex items-center justify-center mb-3 relative overflow-hidden group-hover:shadow-lg transition-all">
                      {pl.coverUrl ? (
                        <img
                          src={pl.coverUrl}
                          alt={pl.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <ListMusic size={40} className="text-[#1DB954]/70 group-hover:scale-110 transition-transform" />
                      )}

                      {/* Nút hành động nhanh trên góc ảnh: Xem ảnh lớn & Chỉnh sửa */}
                      <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        {pl.coverUrl && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewCoverUrl(pl.coverUrl || null);
                              setViewCoverTitle(pl.name);
                            }}
                            title="Xem ảnh bìa lớn"
                            className="p-1.5 rounded-lg bg-black/70 hover:bg-black text-white/80 hover:text-[#1DB954] border border-white/10 shadow transition-colors cursor-pointer"
                          >
                            <Eye size={13} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleOpenEditPlaylist(pl, e)}
                          title="Sửa tên, mô tả & Đổi ảnh bìa Playlist"
                          className="p-1.5 rounded-lg bg-black/70 hover:bg-black text-white/80 hover:text-white border border-white/10 shadow transition-colors cursor-pointer"
                        >
                          <Edit3 size={13} />
                        </button>
                      </div>

                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                        <div className="w-10 h-10 rounded-full bg-[#1DB954] text-black flex items-center justify-center shadow-lg">
                          <ChevronRight size={20} />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-sm font-bold text-white truncate group-hover:text-[#1DB954] transition-colors">
                        {pl.name}
                      </h4>
                      <Badge variant="neutral" className="text-[10px] shrink-0">
                        {pl.trackIds.length} bài
                      </Badge>
                    </div>
                    {pl.description && (
                      <p className="text-xs text-[var(--text-muted)] line-clamp-2 mb-2">
                        {pl.description}
                      </p>
                    )}
                    <div className="mt-auto pt-2 text-[11px] text-[var(--text-muted)] flex items-center justify-between">
                      <span
                        onClick={(e) => handleOpenEditPlaylist(pl, e)}
                        className="hover:text-[#1DB954] transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <Edit3 size={11} /> Sửa playlist
                      </span>
                      {pl.coverUrl ? (
                        <span className="text-[#1DB954] text-[10.5px]">Có ảnh bìa</span>
                      ) : (
                        <span className="text-zinc-500 text-[10.5px]">Chưa có ảnh</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* Chi tiết Playlist đang chọn */
            activePlaylist && (
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setSelectedPlaylistId(null)}
                    className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer"
                  >
                    <ArrowLeft size={16} />
                    <span>Quay lại danh sách Playlist</span>
                  </button>

                  <div className="flex items-center gap-2">
                    {selectedPlaylistTrackIds.size > 0 && (
                      <Button
                        variant="danger"
                        onClick={handleBatchRemoveTracksFromPlaylist}
                        className="flex items-center gap-1.5 text-xs bg-rose-500/20 text-rose-300 border-rose-500/30"
                      >
                        <Trash2 size={13} />
                        <span>Xóa {selectedPlaylistTrackIds.size} bài khỏi Playlist</span>
                      </Button>
                    )}

                    <Button
                      variant="secondary"
                      onClick={() => handleOpenEditPlaylist(activePlaylist)}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <Edit3 size={14} />
                      <span>Sửa Playlist</span>
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={() => setIsAddTracksModalOpen(true)}
                      className="flex items-center gap-2 text-xs"
                    >
                      <Plus size={14} />
                      <span>Thêm bài hát</span>
                    </Button>

                    <Button
                      variant="danger"
                      onClick={() => setPlaylistToDelete(activePlaylist)}
                      className="flex items-center gap-2 text-xs"
                    >
                      <Trash2 size={14} />
                      <span>Xóa Playlist</span>
                    </Button>
                  </div>
                </div>

                {/* Header Playlist */}
                <div className="flex items-start gap-5 p-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)]">
                  {/* Khung ảnh bìa Playlist */}
                  <div className="flex flex-col items-center gap-2 shrink-0">
                    <input
                      type="file"
                      ref={activePlaylistCoverInputRef}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file && activePlaylist) {
                          handleUploadPlaylistCover(activePlaylist.id, file);
                        }
                      }}
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                    />

                    <div
                      onClick={() => {
                        if (activePlaylist.coverUrl) {
                          setViewCoverUrl(activePlaylist.coverUrl);
                          setViewCoverTitle(activePlaylist.name);
                        } else {
                          activePlaylistCoverInputRef.current?.click();
                        }
                      }}
                      className="w-24 h-24 rounded-xl bg-black/50 border border-[var(--border)] flex items-center justify-center relative overflow-hidden group cursor-pointer shadow-md hover:border-[#1DB954]/50 transition-colors"
                      title={activePlaylist.coverUrl ? 'Bấm để phóng to xem ảnh bìa' : 'Bấm để thêm ảnh bìa Playlist'}
                    >
                      {activePlaylist.coverUrl ? (
                        <img
                          src={activePlaylist.coverUrl}
                          alt={activePlaylist.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <ListMusic size={36} className="text-[#1DB954]" />
                      )}

                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity gap-1">
                        {activePlaylist.coverUrl ? (
                          <>
                            <Eye size={18} className="text-[#1DB954]" />
                            <span className="text-[10px] font-semibold">Xem ảnh</span>
                          </>
                        ) : (
                          <>
                            <Upload size={18} className="text-[#1DB954]" />
                            <span className="text-[10px] font-semibold">Thêm ảnh</span>
                          </>
                        )}
                      </div>

                      {isUploadingPlaylistCover && (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                          <Loader2 size={20} className="animate-spin text-[#1DB954]" />
                        </div>
                      )}
                    </div>

                    {/* Cụm nút thao tác nhanh ảnh bìa */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => activePlaylistCoverInputRef.current?.click()}
                        disabled={isUploadingPlaylistCover}
                        className="text-[10.5px] text-[#1DB954] hover:underline cursor-pointer transition-colors"
                      >
                        {activePlaylist.coverUrl ? 'Đổi ảnh' : 'Thêm ảnh'}
                      </button>

                      {activePlaylist.coverUrl && (
                        <>
                          <span className="text-zinc-600 text-[10px]">•</span>
                          <button
                            type="button"
                            onClick={() => handleDeletePlaylistCover(activePlaylist.id)}
                            disabled={isUploadingPlaylistCover}
                            className="text-[10.5px] text-rose-400 hover:text-rose-300 hover:underline cursor-pointer transition-colors"
                          >
                            Xóa ảnh
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <Badge variant="primary" className="text-[10px] mb-2 text-[#1DB954] border-[#1DB954]/30">
                      DANH SÁCH PHÁT
                    </Badge>
                    <h2 className="text-2xl font-bold text-white mb-1 truncate">{activePlaylist.name}</h2>
                    {activePlaylist.description && (
                      <p className="text-sm text-[var(--text-muted)] mb-3">{activePlaylist.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                      <span>{activePlaylistTracks.length} bài hát</span>
                      <span>•</span>
                      <span>Đồng bộ 2 chiều với iPhone</span>
                      {activePlaylistTracks.length > 0 && onPlayTrack && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handlePlay(activePlaylistTracks[0])}
                          className="ml-auto flex items-center gap-1.5"
                        >
                          <Play size={14} className="fill-black" />
                          <span>Phát danh sách</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bảng bài hát trong playlist */}
                {activePlaylistTracks.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-[var(--border)] rounded-xl bg-[var(--bg-surface)]">
                    <Music size={28} className="mx-auto text-[var(--text-muted)] mb-2" />
                    <p className="text-sm text-[var(--text-muted)] mb-4">Danh sách phát này chưa có bài hát nào</p>
                    <Button variant="primary" size="sm" onClick={() => setIsAddTracksModalOpen(true)}>
                      <Plus size={14} className="mr-1.5" /> Thêm bài hát ngay
                    </Button>
                  </div>
                ) : (
                  <div className="border border-[var(--border)] rounded-xl bg-[var(--bg-surface)] overflow-hidden">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-xs text-[var(--text-muted)] bg-white/[0.02]">
                          <th className="py-3 px-4 w-16 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <input
                                type="checkbox"
                                checked={
                                  activePlaylistTracks.length > 0 &&
                                  selectedPlaylistTrackIds.size === activePlaylistTracks.length
                                }
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedPlaylistTrackIds(new Set(activePlaylistTracks.map((t) => t.id)));
                                  } else {
                                    setSelectedPlaylistTrackIds(new Set());
                                  }
                                }}
                                className="rounded cursor-pointer accent-[#1DB954]"
                                title="Chọn tất cả bài hát"
                              />
                              <span>#</span>
                            </div>
                          </th>
                          <th className="py-3 px-4">TIÊU ĐỀ</th>
                          <th className="py-3 px-4">NGHỆ SĨ</th>
                          <th className="py-3 px-4">ALBUM</th>
                          <th className="py-3 px-4 text-right w-20">
                            <Clock size={14} className="inline" />
                          </th>
                          <th className="py-3 px-4 w-28 text-center">THAO TÁC</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {activePlaylistTracks.map((track, idx) => {
                          const isPlayingThis = playingTrackId === track.id && isAudioPlaying;
                          const isFav = userState.favoriteIds.includes(track.id);
                          return (
                            <tr
                              key={track.id}
                              className="hover:bg-white/[0.03] transition-colors group"
                            >
                              <td className="py-2.5 px-4 text-center text-xs text-[var(--text-muted)]">
                                <div className="flex items-center justify-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={selectedPlaylistTrackIds.has(track.id)}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      setSelectedPlaylistTrackIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(track.id)) next.delete(track.id);
                                        else next.add(track.id);
                                        return next;
                                      });
                                    }}
                                    className="rounded cursor-pointer accent-[#1DB954]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handlePlay(track)}
                                    className="cursor-pointer text-[var(--text-muted)] hover:text-white"
                                  >
                                    {isPlayingThis ? (
                                      <Pause size={14} className="text-[#1DB954]" />
                                    ) : (
                                      <span className="group-hover:hidden">{idx + 1}</span>
                                    )}
                                    <Play
                                      size={14}
                                      className={`hidden ${!isPlayingThis ? 'group-hover:inline text-[#1DB954]' : ''}`}
                                    />
                                  </button>
                                </div>
                              </td>
                              <td className="py-2.5 px-4 font-semibold text-white">
                                <span className={isPlayingThis ? 'text-[#1DB954]' : ''}>
                                  {track.title}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-[var(--text-muted)]">{track.artist}</td>
                              <td className="py-2.5 px-4 text-[var(--text-muted)]">{track.album || '—'}</td>
                              <td className="py-2.5 px-4 text-right text-xs text-[var(--text-muted)]">
                                {formatDuration(track.duration)}
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleFavorite(track.id)}
                                    title={isFav ? 'Bỏ yêu thích' : 'Yêu thích'}
                                    className="p-1 rounded text-[var(--text-muted)] hover:text-rose-400 transition-colors cursor-pointer"
                                  >
                                    <Heart
                                      size={15}
                                      className={isFav ? 'text-rose-400 fill-rose-400' : ''}
                                    />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveTrackFromPlaylist(track.id)}
                                    title="Xóa khỏi danh sách phát này"
                                    className="p-1 rounded text-[var(--text-muted)] hover:text-red-400 transition-colors cursor-pointer"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {/* TAB 2: BÀI HÁT YÊU THÍCH */}
      {activeTab === 'favorites' && (
        <div className="flex-1 flex flex-col gap-6">
          <div className="flex items-start gap-5 p-6 rounded-2xl border border-rose-500/20 bg-rose-500/5">
            <div className="w-20 h-20 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center shrink-0">
              <Heart size={36} className="text-rose-400 fill-rose-400" />
            </div>
            <div className="flex-1 min-w-0">
              <Badge variant="danger" className="text-[10px] mb-2 text-rose-400 border-rose-500/30">
                BÀI HÁT YÊU THÍCH
              </Badge>
              <h2 className="text-2xl font-bold text-white mb-1">Bộ sưu tập bài hát yêu thích</h2>
              <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                <span>{favoriteTracks.length} bài hát</span>
                <span>•</span>
                <span>Tự động đồng bộ với icon trái tim trên iPhone</span>
                {favoriteTracks.length > 0 && onPlayTrack && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handlePlay(favoriteTracks[0])}
                    className="ml-auto flex items-center gap-1.5"
                  >
                    <Play size={14} className="fill-black" />
                    <span>Phát tất cả</span>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Banner phát hiện ID mồ côi (không còn tồn tại trong thư mục nhạc local) */}
          {orphanFavoriteIds.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs">
              <div className="flex items-center gap-2.5">
                <AlertTriangle size={18} className="text-amber-400 shrink-0" />
                <div>
                  <p className="font-semibold text-amber-200">
                    Phát hiện {orphanFavoriteIds.length} bài hát yêu thích cũ không còn tồn tại trong thư viện local
                  </p>
                  <p className="text-[11px] text-amber-400/80">
                    (Có thể do bài hát đã bị xóa khỏi đĩa, đổi tên file hoặc thay đổi mã SHA1 sau khi tải lại)
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCleanOrphanFavorites}
                className="text-xs bg-amber-500/20 text-amber-200 border-amber-500/40 hover:bg-amber-500/30 shrink-0 cursor-pointer"
              >
                <Trash2 size={12} className="mr-1.5" />
                Dọn dẹp {orphanFavoriteIds.length} liên kết cũ
              </Button>
            </div>
          )}

          {favoriteTracks.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-[var(--border)] rounded-2xl bg-[var(--bg-surface)]">
              <Heart size={32} className="mx-auto text-[var(--text-muted)] mb-3" />
              <h3 className="text-base font-bold text-white mb-1">Chưa có bài hát yêu thích nào</h3>
              <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">
                Bấm vào biểu tượng trái tim cạnh bài hát bất kỳ trên Web hoặc trên iPhone để thêm bài hát vào danh sách này.
              </p>
            </div>
          ) : (
            <div className="border border-[var(--border)] rounded-xl bg-[var(--bg-surface)] overflow-hidden">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] text-xs text-[var(--text-muted)] bg-white/[0.02]">
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="py-3 px-4">TIÊU ĐỀ</th>
                    <th className="py-3 px-4">NGHỆ SĨ</th>
                    <th className="py-3 px-4">ALBUM</th>
                    <th className="py-3 px-4 text-right w-20">
                      <Clock size={14} className="inline" />
                    </th>
                    <th className="py-3 px-4 w-20 text-center">BỎ THÍCH</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {favoriteTracks.map((track, idx) => {
                    const isPlayingThis = playingTrackId === track.id && isAudioPlaying;
                    return (
                      <tr
                        key={track.id}
                        className="hover:bg-white/[0.03] transition-colors group"
                      >
                        <td className="py-2.5 px-4 text-center text-xs text-[var(--text-muted)]">
                          <button
                            type="button"
                            onClick={() => handlePlay(track)}
                            className="cursor-pointer text-[var(--text-muted)] hover:text-white"
                          >
                            {isPlayingThis ? (
                              <Pause size={14} className="text-[#1DB954]" />
                            ) : (
                              <span className="group-hover:hidden">{idx + 1}</span>
                            )}
                            <Play
                              size={14}
                              className={`hidden ${!isPlayingThis ? 'group-hover:inline text-[#1DB954]' : ''}`}
                            />
                          </button>
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-white">
                          <span className={isPlayingThis ? 'text-[#1DB954]' : ''}>
                            {track.title}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-[var(--text-muted)]">{track.artist}</td>
                        <td className="py-2.5 px-4 text-[var(--text-muted)]">{track.album || '—'}</td>
                        <td className="py-2.5 px-4 text-right text-xs text-[var(--text-muted)]">
                          {formatDuration(track.duration)}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleFavorite(track.id)}
                            title="Bỏ thích bài hát này"
                            className="p-1 rounded text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                          >
                            <Heart size={16} className="fill-rose-400" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL TẠO PLAYLIST */}
      <Dialog
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        title="Tạo Danh sách phát mới"
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase">
              Tên danh sách phát *
            </label>
            <input
              type="text"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder="Ví dụ: Nhạc Chill Đêm, Acoustic Việt..."
              className="w-full px-3.5 py-2.5 bg-black/40 border border-[var(--border)] rounded-xl text-sm text-white focus:outline-none focus:border-[#1DB954]"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase">
              Mô tả ngắn (tùy chọn)
            </label>
            <textarea
              value={newPlaylistDesc}
              onChange={(e) => setNewPlaylistDesc(e.target.value)}
              placeholder="Ghi chú về tuyển tập bài hát này..."
              rows={3}
              className="w-full px-3.5 py-2.5 bg-black/40 border border-[var(--border)] rounded-xl text-sm text-white focus:outline-none focus:border-[#1DB954] resize-none"
            />
          </div>

          {/* Chọn ảnh bìa cho Playlist mới */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase">
              Ảnh bìa Playlist (tùy chọn)
            </label>
            <input
              type="file"
              ref={createCoverInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!file.type.startsWith('image/')) {
                  toast.error('Vui lòng chọn file ảnh hợp lệ');
                  return;
                }
                setCreateCoverFile(file);
                const reader = new FileReader();
                reader.onload = (ev) => {
                  setCreateCoverPreview(ev.target?.result as string);
                };
                reader.readAsDataURL(file);
              }}
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
            />
            <div className="flex items-center gap-3 p-3 rounded-xl bg-black/30 border border-[var(--border)]">
              <div className="w-16 h-16 rounded-lg bg-black/50 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                {createCoverPreview ? (
                  <img src={createCoverPreview} alt="Cover Preview" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon size={22} className="text-zinc-500" />
                )}
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => createCoverInputRef.current?.click()}
                    className="text-xs h-7 gap-1"
                  >
                    <Upload size={12} />
                    <span>{createCoverFile ? 'Đổi ảnh' : 'Chọn ảnh bìa'}</span>
                  </Button>
                  {createCoverFile && (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        setCreateCoverFile(null);
                        setCreateCoverPreview(null);
                      }}
                      className="text-xs h-7 px-2"
                    >
                      Xóa
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {createCoverFile ? createCoverFile.name : 'Đề xuất ảnh vuông chuẩn 1:1 (JPG, PNG, WEBP)'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="text" onClick={() => setIsCreateModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" onClick={handleCreatePlaylist}>
              Tạo Playlist
            </Button>
          </div>
        </div>
      </Dialog>

      {/* MODAL THÊM BÀI HÁT VÀO PLAYLIST */}
      <Dialog
        open={isAddTracksModalOpen}
        onOpenChange={setIsAddTracksModalOpen}
        title={`Thêm bài hát vào "${activePlaylist?.name || 'Playlist'}"`}
      >
        <div className="flex flex-col gap-4 max-h-[75vh]">
          {/* Ô tìm kiếm */}
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-3 text-[var(--text-muted)]" />
            <input
              type="text"
              value={trackSearchQuery}
              onChange={(e) => setTrackSearchQuery(e.target.value)}
              placeholder="Tìm kiếm theo tên bài hát, nghệ sĩ, album..."
              className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-[var(--border)] rounded-xl text-sm text-white focus:outline-none focus:border-[#1DB954]"
            />
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)] border border-[var(--border)] rounded-xl bg-black/20 max-h-80">
            {candidateTracks.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--text-muted)]">
                Không tìm thấy bài hát nào phù hợp (hoặc tất cả bài đã có trong danh sách)
              </div>
            ) : (
              candidateTracks.map((t) => {
                const isSelected = selectedTrackIdsToAdd.includes(t.id);
                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSelectedTrackIdsToAdd((prev) =>
                        isSelected ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                      );
                    }}
                    className={`flex items-center gap-3 p-3 hover:bg-white/5 cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#1DB954]/10' : ''
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                        isSelected
                          ? 'bg-[#1DB954] border-[#1DB954] text-black'
                          : 'border-[var(--border)] bg-black/40'
                      }`}
                    >
                      {isSelected && <Check size={14} className="stroke-[3]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{t.title}</div>
                      <div className="text-xs text-[var(--text-muted)] truncate">
                        {t.artist} • {t.album || 'Single'}
                      </div>
                    </div>
                    <div className="text-xs text-[var(--text-muted)] shrink-0">
                      {formatDuration(t.duration)}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-[var(--text-muted)]">
              Đã chọn: <strong className="text-white">{selectedTrackIdsToAdd.length}</strong> bài hát
            </span>
            <div className="flex gap-2">
              <Button variant="text" onClick={() => setIsAddTracksModalOpen(false)}>
                Hủy
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmAddTracks}
                disabled={selectedTrackIdsToAdd.length === 0}
              >
                Thêm vào Playlist ({selectedTrackIdsToAdd.length})
              </Button>
            </div>
          </div>
        </div>
      </Dialog>

      {/* MODAL CHỈNH SỬA PLAYLIST (TÊN, MÔ TẢ & ẢNH BÌA) */}
      <Dialog
        open={Boolean(editingPlaylist)}
        onOpenChange={(open) => {
          if (!open) setEditingPlaylist(null);
        }}
        title={`Chỉnh sửa Danh sách phát "${editingPlaylist?.name || ''}"`}
      >
        <div className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-muted)]">TÊN PLAYLIST *</label>
            <input
              type="text"
              value={editPlaylistName}
              onChange={(e) => setEditPlaylistName(e.target.value)}
              placeholder="Nhập tên playlist..."
              className="w-full px-3.5 py-2.5 bg-black/40 border border-[var(--border)] rounded-xl text-sm text-white focus:outline-none focus:border-[#1DB954]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-muted)]">MÔ TẢ (TÙY CHỌN)</label>
            <textarea
              value={editPlaylistDesc}
              onChange={(e) => setEditPlaylistDesc(e.target.value)}
              placeholder="Thêm mô tả cho playlist này..."
              rows={2}
              className="w-full px-3.5 py-2 bg-black/40 border border-[var(--border)] rounded-xl text-sm text-white focus:outline-none focus:border-[#1DB954] resize-none"
            />
          </div>

          {/* Chọn / Đổi / Xóa ảnh bìa Playlist */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-muted)]">ẢNH BÌA DANH SÁCH PHÁT</label>
            <input
              type="file"
              ref={editCoverInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!file.type.startsWith('image/')) {
                  toast.error('Vui lòng chọn file ảnh hợp lệ');
                  return;
                }
                setEditCoverFile(file);
                setEditRemoveCover(false);
                const reader = new FileReader();
                reader.onload = (ev) => {
                  setEditCoverPreview(ev.target?.result as string);
                };
                reader.readAsDataURL(file);
              }}
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
            />

            <div className="flex items-center gap-3 p-3 rounded-xl bg-black/30 border border-[var(--border)]">
              <div className="w-16 h-16 rounded-lg bg-black/50 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 relative">
                {editCoverPreview && !editRemoveCover ? (
                  <img src={editCoverPreview} alt="Cover Preview" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon size={22} className="text-zinc-500" />
                )}
              </div>

              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => editCoverInputRef.current?.click()}
                    className="text-xs h-7 gap-1"
                  >
                    <Upload size={12} />
                    <span>{editCoverPreview && !editRemoveCover ? 'Đổi ảnh khác' : 'Chọn ảnh bìa'}</span>
                  </Button>

                  {editCoverPreview && !editRemoveCover && (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setViewCoverUrl(editCoverPreview);
                          setViewCoverTitle(editPlaylistName || 'Ảnh bìa Playlist');
                        }}
                        className="text-xs h-7 px-2"
                        title="Xem ảnh lớn"
                      >
                        <Eye size={12} />
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setEditCoverFile(null);
                          setEditRemoveCover(true);
                        }}
                        className="text-xs h-7 px-2 text-rose-300"
                      >
                        Gỡ ảnh
                      </Button>
                    </>
                  )}
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {editCoverFile
                    ? editCoverFile.name
                    : editRemoveCover
                    ? 'Ảnh bìa sẽ được xóa sau khi lưu'
                    : editCoverPreview
                    ? 'Đang dùng ảnh bìa hiện tại'
                    : 'Đề xuất ảnh vuông chuẩn 1:1 (JPG, PNG, WEBP)'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="text"
              onClick={() => setEditingPlaylist(null)}
              disabled={isSavingEdit}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveEditPlaylist}
              disabled={isSavingEdit}
              className="flex items-center gap-1.5"
            >
              {isSavingEdit && <Loader2 size={14} className="animate-spin" />}
              <span>{isSavingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
            </Button>
          </div>
        </div>
      </Dialog>

      {/* MODAL XEM ẢNH BÌA LỚN */}
      <Dialog
        open={Boolean(viewCoverUrl)}
        onOpenChange={(open) => {
          if (!open) {
            setViewCoverUrl(null);
            setViewCoverTitle(null);
          }
        }}
        title={viewCoverTitle ? `Ảnh bìa: ${viewCoverTitle}` : 'Xem ảnh bìa Playlist'}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-full max-w-md aspect-square rounded-2xl overflow-hidden bg-black/60 border border-[var(--border)] shadow-2xl flex items-center justify-center">
            {viewCoverUrl && (
              <img
                src={viewCoverUrl}
                alt="Playlist Cover HD"
                className="w-full h-full object-cover"
              />
            )}
          </div>
          <div className="flex justify-end w-full">
            <Button
              variant="secondary"
              onClick={() => {
                setViewCoverUrl(null);
                setViewCoverTitle(null);
              }}
            >
              Đóng
            </Button>
          </div>
        </div>
      </Dialog>

      {/* CONFIRM DIALOG XÓA PLAYLIST */}
      {playlistToDelete && (
        <ConfirmDialog
          open={Boolean(playlistToDelete)}
          title="Xác nhận xóa Danh sách phát"
          description={`Bạn có chắc chắn muốn xóa danh sách phát "${playlistToDelete.name}" không? Thao tác này sẽ đồng bộ ngay lập tức và xóa trên cả iPhone.`}
          confirmText="Xóa Playlist"
          cancelText="Hủy"
          variant="danger"
          onConfirm={handleDeletePlaylist}
          onClose={() => setPlaylistToDelete(null)}
        />
      )}
    </div>
  );
};
