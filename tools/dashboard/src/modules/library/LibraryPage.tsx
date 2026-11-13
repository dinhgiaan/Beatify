import React, { useState, useMemo, useEffect } from 'react';
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
  Image as ImageIcon,
  Volume2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Upload,
  Loader2,
  ListPlus,
  FolderPlus,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../../ui/organisms/PageHeader';
import { Button } from '../../ui/atoms/Button';
import { Checkbox } from '../../ui/atoms/Controls';
import { Dialog } from '../../ui/organisms/Dialog';
import { ConfirmDialog } from '../../ui/molecules/ConfirmDialog';
import { requestApi } from '../../core/api-client';
import { ArtistHoverCard } from '../artists/components/ArtistHoverCard';
import { CoverViewerDialog } from '../youtube-music/components/CoverViewerDialog';
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
  replayGain?: number;
  filePath: string;
  fileExists?: boolean;
  isSynced?: boolean;
}

type SortField = 'default' | 'title' | 'artist' | 'album' | 'duration';
export type QuickFilter =
  | 'all'
  | 'synced'
  | 'unsynced'
  | 'missing_lyrics'
  | 'missing_cover'
  | 'missing_any'
  | 'missing_file';

export const LibraryPage: React.FC<{
  onPlayTrack?: (track: PlayingTrack, newQueue?: PlayingTrack[]) => void;
  playingTrackId?: string;
  isAudioPlaying?: boolean;
  onTogglePlayPause?: () => void;
}> = ({ onPlayTrack, playingTrackId, isAudioPlaying, onTogglePlayPause }) => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [formatFilter, setFormatFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortField>('default');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, quickFilter, formatFilter]);

  // Selection state for batch operations
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [isBatchTrashOpen, setIsBatchTrashOpen] = useState(false);

  // Editing state
  const [editingTrack, setEditingTrack] = useState<TrackItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editAlbum, setEditAlbum] = useState('');
  const [coverTimestamp, setCoverTimestamp] = useState<number>(Date.now());
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const editCoverInputRef = React.useRef<HTMLInputElement>(null);

  // Dialog xem ảnh bìa lớn HD
  const [viewingCover, setViewingCover] = useState<{
    isOpen: boolean;
    trackId: string;
    imageUrl: string;
    title: string;
    artist: string;
  } | null>(null);

  // Batch Cover state (Đổi ảnh bìa cho nhiều bài cùng lúc)
  const [isBatchCoverOpen, setIsBatchCoverOpen] = useState(false);
  const [batchCoverPreview, setBatchCoverPreview] = useState<string | null>(null);
  const [batchCoverFile, setBatchCoverFile] = useState<File | null>(null);
  const [isBatchUploadingCover, setIsBatchUploadingCover] = useState(false);
  const batchCoverInputRef = React.useRef<HTMLInputElement>(null);

  // Modal thêm bài hát vào Playlist từ trang Thư viện
  const [isAddToPlaylistModalOpen, setIsAddToPlaylistModalOpen] = useState(false);
  const [tracksToAddToPlaylist, setTracksToAddToPlaylist] = useState<string[]>([]);

  // Lấy UserState (Playlists) để phục vụ thêm bài hát vào playlist
  const { data: userStateRes } = useQuery<UserState | { data: UserState }>({
    queryKey: ['user-state'],
    queryFn: () => requestApi<UserState | { data: UserState }>('/local-api/state'),
  });

  const userPlaylists: Playlist[] = useMemo(() => {
    if (!userStateRes) return [];
    if ('playlists' in userStateRes && Array.isArray(userStateRes.playlists)) {
      return userStateRes.playlists;
    }
    if ('data' in userStateRes && userStateRes.data && 'playlists' in userStateRes.data) {
      return userStateRes.data.playlists;
    }
    return [];
  }, [userStateRes]);

  // Trash confirm state (single track)
  const [trashTrack, setTrashTrack] = useState<TrackItem | null>(null);

  const { data: tracks = [], isLoading, refetch } = useQuery<TrackItem[]>({
    queryKey: ['local-tracks'],
    queryFn: async () => {
      const res = await requestApi<{ tracks: TrackItem[] }>('/local-api/tracks');
      return res.tracks || [];
    },
    staleTime: 1000,
    refetchInterval: 3000,
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

  // Tự động quét và nạp lời hàng loạt từ LRCLIB
  const batchFetchLyricsMutation = useMutation({
    mutationFn: async (ids?: string[]) => {
      return requestApi<{
        message: string;
        total: number;
        successCount: number;
        notFoundCount: number;
      }>('/local-api/lyrics/batch-fetch', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Đã hoàn tất tìm kiếm lời bài hát');
      queryClient.invalidateQueries({ queryKey: ['local-tracks'] });
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
      setSelectedTrackIds(new Set());
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi tải lời bài hát: ${msg}`);
    },
  });

  // Quét & Chuẩn hóa âm lượng hàng loạt theo EBU R128 (ReplayGain)
  const batchReplayGainMutation = useMutation({
    mutationFn: async (ids?: string[]) => {
      return requestApi<{
        message: string;
        total: number;
        successCount: number;
      }>('/local-api/tracks/batch-replaygain', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Đã đo và chuẩn hóa ReplayGain thành công');
      queryClient.invalidateQueries({ queryKey: ['local-tracks'] });
      setSelectedTrackIds(new Set());
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi đo ReplayGain: ${msg}`);
    },
  });

  const unsyncedCount = useMemo(() => tracks.filter((t) => !t.isSynced).length, [tracks]);
  const syncedCount = useMemo(() => tracks.filter((t) => t.isSynced).length, [tracks]);
  const missingLyricsCount = useMemo(() => tracks.filter((t) => !t.hasLyrics).length, [tracks]);
  const missingCoverCount = useMemo(() => tracks.filter((t) => !t.hasCover).length, [tracks]);
  const missingAnyCount = useMemo(() => tracks.filter((t) => !t.hasLyrics || !t.hasCover).length, [tracks]);
  const missingFilesCount = useMemo(() => tracks.filter((t) => t.fileExists === false).length, [tracks]);

  // Tổng thời lượng thư viện
  const totalLibraryDuration = useMemo(() => {
    return tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  }, [tracks]);

  // Hàm suy luận định dạng tệp chuẩn xác từ t.format hoặc đuôi filePath
  const getTrackFormat = (t: TrackItem): string => {
    if (t.format && t.format.trim()) return t.format.toLowerCase().trim();
    if (t.filePath) {
      const ext = t.filePath.split('.').pop();
      if (ext && ext.length <= 5) return ext.toLowerCase().trim();
    }
    return '';
  };

  // Danh sách định dạng có trong thư viện
  const availableFormats = useMemo(() => {
    const set = new Set<string>();
    tracks.forEach((t) => {
      const fmt = getTrackFormat(t);
      if (fmt) {
        set.add(fmt);
      }
    });
    return Array.from(set).sort();
  }, [tracks]);

  // Lọc và sắp xếp bài hát
  const filteredTracks = useMemo(() => {
    let list = tracks.filter((t) => {
      // 1. Lọc theo Quick Filter
      if (quickFilter === 'synced' && !t.isSynced) return false;
      if (quickFilter === 'unsynced' && t.isSynced) return false;
      if (quickFilter === 'missing_lyrics' && t.hasLyrics) return false;
      if (quickFilter === 'missing_cover' && t.hasCover) return false;
      if (quickFilter === 'missing_any' && t.hasLyrics && t.hasCover) return false;
      if (quickFilter === 'missing_file' && t.fileExists !== false) return false;

      // 2. Lọc theo Format
      const fmt = getTrackFormat(t);
      if (formatFilter !== 'all' && fmt !== formatFilter) return false;

      // 3. Tìm kiếm từ khóa (bỏ dấu tiếng Việt, không phân biệt hoa thường)
      if (searchTerm.trim()) {
        const query = normalizeText(searchTerm);
        const matchTitle = normalizeText(t.title || '').includes(query);
        const matchArtist = normalizeText(t.artist || '').includes(query);
        const matchAlbum = normalizeText(t.album || '').includes(query);
        if (!matchTitle && !matchArtist && !matchAlbum) {
          return false;
        }
      }

      return true;
    });

    if (sortBy !== 'default') {
      list = [...list].sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'title') cmp = (a.title || '').localeCompare(b.title || '');
        else if (sortBy === 'artist') cmp = (a.artist || '').localeCompare(b.artist || '');
        else if (sortBy === 'album') cmp = (a.album || '').localeCompare(b.album || '');
        else if (sortBy === 'duration') cmp = (a.duration || 0) - (b.duration || 0);
        return sortOrder === 'asc' ? cmp : -cmp;
      });
    }

    return list;
  }, [tracks, searchTerm, quickFilter, formatFilter, sortBy, sortOrder]);

  // Phân trang danh sách bài hát
  const totalPages = Math.ceil(filteredTracks.length / pageSize) || 1;
  const validPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedTracks = useMemo(() => {
    if (pageSize >= 99999) return filteredTracks;
    const start = (validPage - 1) * pageSize;
    return filteredTracks.slice(start, start + pageSize);
  }, [filteredTracks, validPage, pageSize]);

  // Hàm phát nhạc kèm Queue ngữ cảnh của trang hiện tại
  const handlePlayTrackItem = (t: TrackItem) => {
    if (t.fileExists === false) {
      toast.error('Tệp âm thanh này không còn tồn tại trên ổ cứng!');
      return;
    }
    if (playingTrackId === t.id) {
      onTogglePlayPause?.();
      return;
    }
    const currentQueue: PlayingTrack[] = paginatedTracks
      .filter((track) => track.fileExists !== false)
      .map((track) => ({
        id: track.id,
        albumId: track.albumId,
        title: track.title,
        artist: track.artist,
        fileUrl: `/local-api/stream/${track.id}`,
        coverUrl: track.hasCover ? `/local-api/covers/${track.id || track.albumId}.jpg` : undefined,
      }));

    onPlayTrack?.(
      {
        id: t.id,
        albumId: t.albumId,
        title: t.title,
        artist: t.artist,
        fileUrl: `/local-api/stream/${t.id}`,
        coverUrl: t.hasCover ? `/local-api/covers/${t.id || t.albumId}.jpg` : undefined,
      },
      currentQueue
    );
  };

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

  // Tải ảnh bìa chất lượng cao về máy tính
  const handleDownloadTrackCover = async (track: TrackItem) => {
    try {
      const coverUrl = `/local-api/covers/${track.id || track.albumId}.jpg`;
      const res = await fetch(coverUrl);
      if (!res.ok) throw new Error('Bài hát chưa có ảnh bìa hoặc không thể tải từ server');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeTitle = (track.title || 'Track').replace(/[/\\?%*:|"<>]/g, '_');
      const safeArtist = (track.artist || 'Artist').replace(/[/\\?%*:|"<>]/g, '_');
      a.download = `${safeArtist} - ${safeTitle} - Cover.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Đã tải ảnh bìa "${safeTitle}" về máy tính!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi tải ảnh: ${msg}`);
    }
  };

  // Chọn ảnh từ máy tính để tải lên làm bìa mới (HD)
  const handleUploadNewCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingTrack) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn file hình ảnh hợp lệ (.jpg, .png, .webp)');
      return;
    }

    try {
      setIsUploadingCover(true);
      const formData = new FormData();
      formData.append('cover', file);

      const res = await fetch(`/local-api/tracks/${editingTrack.id}/cover`, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Lỗi server khi lưu ảnh bìa mới');
      }

      setCoverTimestamp(Date.now());
      queryClient.invalidateQueries({ queryKey: ['local-tracks'] });
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
      toast.success('Đã cập nhật ảnh bìa mới sắc nét (HD) thành công!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Không thể cập nhật ảnh bìa: ${msg}`);
    } finally {
      setIsUploadingCover(false);
      if (editCoverInputRef.current) editCoverInputRef.current.value = '';
    }
  };

  // Xóa ảnh bìa của bài hát
  const handleDeleteCover = async () => {
    if (!editingTrack) return;
    try {
      setIsUploadingCover(true);
      const res = await fetch(`/local-api/tracks/${editingTrack.id}/cover`, {
        method: 'DELETE',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (!res.ok) throw new Error('Lỗi server khi xóa ảnh bìa');
      setCoverTimestamp(Date.now());
      queryClient.invalidateQueries({ queryKey: ['local-tracks'] });
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
      toast.success('Đã xóa ảnh bìa thành công!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Không thể xóa ảnh bìa: ${msg}`);
    } finally {
      setIsUploadingCover(false);
    }
  };

  // Chọn ảnh cho chế độ đổi ảnh bìa hàng loạt
  const handleBatchFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn file hình ảnh hợp lệ (.jpg, .png, .webp)');
      return;
    }
    setBatchCoverFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setBatchCoverPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Áp dụng ảnh bìa cho toàn bộ các bài hát đã chọn
  const handleApplyBatchCover = async () => {
    if (!batchCoverFile || selectedTrackIds.size === 0) {
      toast.error('Vui lòng chọn file ảnh trước khi áp dụng');
      return;
    }

    try {
      setIsBatchUploadingCover(true);
      const formData = new FormData();
      formData.append('cover', batchCoverFile);
      formData.append('ids', JSON.stringify(Array.from(selectedTrackIds)));

      const res = await fetch('/local-api/tracks/batch-cover', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Lỗi server khi đổi ảnh bìa hàng loạt');
      }

      const json = await res.json();
      toast.success(json.message || `Đã đổi ảnh bìa thành công cho ${selectedTrackIds.size} bài hát!`);
      setIsBatchCoverOpen(false);
      setBatchCoverFile(null);
      setBatchCoverPreview(null);
      setCoverTimestamp(Date.now());
      queryClient.invalidateQueries({ queryKey: ['local-tracks'] });
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Không thể đổi ảnh bìa hàng loạt: ${msg}`);
    } finally {
      setIsBatchUploadingCover(false);
    }
  };

  // Tự động tải lại ảnh bìa từ YouTube cho 1 bài hát
  const handleFetchYouTubeCover = async (trackId: string) => {
    try {
      setIsUploadingCover(true);
      const res = await fetch(`/local-api/tracks/${trackId}/fetch-yt-cover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Không thể tải ảnh bìa YouTube cho bài này');
      }

      setCoverTimestamp(Date.now());
      queryClient.invalidateQueries({ queryKey: ['local-tracks'] });
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
      toast.success(json.message || 'Đã tải ảnh bìa YouTube HD thành công!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi tải ảnh bìa YouTube: ${msg}`);
    } finally {
      setIsUploadingCover(false);
    }
  };

  // Tự động tải lại ảnh bìa từ YouTube hàng loạt cho toàn bộ bài hát đã chọn
  const handleBatchFetchYouTubeCover = async () => {
    if (selectedTrackIds.size === 0) {
      toast.error('Vui lòng chọn ít nhất 1 bài hát');
      return;
    }

    const toastId = toast.loading(`Đang tự động tìm & tải ảnh bìa YouTube HD cho ${selectedTrackIds.size} bài hát...`);
    try {
      setIsBatchUploadingCover(true);
      const res = await fetch('/local-api/tracks/batch-fetch-yt-cover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ ids: Array.from(selectedTrackIds) }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Lỗi server khi tải ảnh bìa YouTube hàng loạt');
      }

      toast.dismiss(toastId);
      toast.success(json.message || `Đã tải và cập nhật ảnh bìa YouTube cho ${selectedTrackIds.size} bài hát!`);
      setIsBatchCoverOpen(false);
      setCoverTimestamp(Date.now());
      queryClient.invalidateQueries({ queryKey: ['local-tracks'] });
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
    } catch (err: unknown) {
      toast.dismiss(toastId);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Không thể tải ảnh bìa YouTube hàng loạt: ${msg}`);
    } finally {
      setIsBatchUploadingCover(false);
    }
  };

  // Thêm 1 hoặc nhiều bài hát vào Playlist từ trang Thư viện
  const handleConfirmAddToPlaylist = async (playlistId: string) => {
    if (!tracksToAddToPlaylist.length) return;
    try {
      const currentState = await requestApi<UserState | { data: UserState }>('/local-api/state');
      const stateObj: UserState =
        'playlists' in currentState && Array.isArray(currentState.playlists)
          ? currentState
          : 'data' in currentState && currentState.data && 'playlists' in currentState.data
            ? currentState.data
            : { version: 1, updatedAt: new Date().toISOString(), playlists: [], favoriteIds: [] };

      const targetPlaylist = stateObj.playlists.find((p) => p.id === playlistId);
      if (!targetPlaylist) {
        toast.error('Không tìm thấy danh sách phát');
        return;
      }

      // Thêm bài hát mà không trùng lặp
      const existingSet = new Set(targetPlaylist.trackIds);
      let addedCount = 0;
      for (const id of tracksToAddToPlaylist) {
        if (!existingSet.has(id)) {
          targetPlaylist.trackIds.push(id);
          existingSet.add(id);
          addedCount++;
        }
      }

      targetPlaylist.updatedAt = new Date().toISOString();
      stateObj.updatedAt = new Date().toISOString();

      await requestApi('/local-api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stateObj),
      });

      queryClient.invalidateQueries({ queryKey: ['user-state'] });
      toast.success(
        addedCount > 0
          ? `Đã thêm ${addedCount} bài hát vào playlist "${targetPlaylist.name}" (Đồng bộ iPhone)!`
          : `Các bài hát đã có sẵn trong playlist "${targetPlaylist.name}"`
      );
      setIsAddToPlaylistModalOpen(false);
      setTracksToAddToPlaylist([]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi thêm vào playlist: ${msg}`);
    }
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
        <div
          onClick={() => setQuickFilter('all')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-xs relative overflow-hidden group ${quickFilter === 'all'
            ? 'border-[#1DB954]/40 bg-[#1DB954]/10 shadow-[0_0_20px_rgba(29,185,84,0.12)] ring-1 ring-[#1DB954]/30'
            : 'border-white/[0.08] bg-[var(--bg-surface)] hover:border-[#1DB954]/30'
            }`}
          title="Bấm để hiển thị toàn bộ bài hát"
        >
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
          onClick={() => setQuickFilter(quickFilter === 'synced' ? 'all' : 'synced')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-xs relative overflow-hidden group ${quickFilter === 'synced'
            ? 'border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.12)] ring-1 ring-emerald-500/30'
            : 'border-white/[0.08] bg-[var(--bg-surface)] hover:border-emerald-500/30'
            }`}
          title="Bấm để lọc bài đã upload lên R2 (bấm lại để bỏ chọn)"
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
          onClick={() => setQuickFilter(quickFilter === 'unsynced' ? 'all' : 'unsynced')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-xs relative overflow-hidden group ${quickFilter === 'unsynced'
            ? 'border-amber-500/40 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.12)] ring-1 ring-amber-500/30'
            : 'border-white/[0.08] bg-[var(--bg-surface)] hover:border-amber-500/30'
            }`}
          title="Bấm để lọc bài chưa upload lên R2 (bấm lại để bỏ chọn)"
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
      <div className="p-4 rounded-2xl border border-white/[0.08] bg-[var(--bg-surface)] shadow-sm space-y-3.5">
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

          {/* Nút hành động nhanh: Quét lời & ReplayGain */}
          <div className="flex items-center gap-2 shrink-0">
            {missingLyricsCount > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => batchFetchLyricsMutation.mutate(undefined)}
                disabled={batchFetchLyricsMutation.isPending}
                className="gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                title="Tự động tra cứu và lưu file lời bài hát .lrc từ LRCLIB cho toàn bộ bài còn thiếu"
              >
                <Mic2 size={13} className={batchFetchLyricsMutation.isPending ? 'animate-pulse' : ''} />
                <span>
                  {batchFetchLyricsMutation.isPending ? 'Đang tìm kiếm...' : `Tự động tải lời (${missingLyricsCount})`}
                </span>
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              onClick={() => batchReplayGainMutation.mutate(undefined)}
              disabled={batchReplayGainMutation.isPending}
              className="gap-1.5"
              title="Đo độ ồn LUFS chuẩn EBU R128 bằng ffmpeg và tính ReplayGain cân bằng âm lượng"
            >
              <Volume2 size={13} className={batchReplayGainMutation.isPending ? 'animate-pulse' : ''} />
              <span>{batchReplayGainMutation.isPending ? 'Đang đo âm lượng...' : 'Đo ReplayGain'}</span>
            </Button>
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

        {/* Hàng Quick Filter Pills (Bộ lọc thông minh 1-click) */}
        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-white/[0.06]">
          <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mr-1">
            Lọc nhanh:
          </span>

          <button
            type="button"
            onClick={() => setQuickFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${quickFilter === 'all'
              ? 'bg-white/15 text-white border border-white/20 shadow-xs'
              : 'text-zinc-400 hover:text-white bg-black/20 hover:bg-black/30'
              }`}
          >
            <span>Tất cả</span>
            <span className="text-[10.5px] opacity-75 font-mono">({tracks.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setQuickFilter(quickFilter === 'synced' ? 'all' : 'synced')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${quickFilter === 'synced'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 shadow-xs'
              : 'text-zinc-400 hover:text-emerald-400 bg-black/20 hover:bg-black/30'
              }`}
          >
            <Cloud size={12} className="text-emerald-400" />
            <span>Đã upload R2</span>
            <span className="text-[10.5px] opacity-75 font-mono">({syncedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setQuickFilter(quickFilter === 'unsynced' ? 'all' : 'unsynced')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${quickFilter === 'unsynced'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35 shadow-xs'
              : 'text-zinc-400 hover:text-amber-400 bg-black/20 hover:bg-black/30'
              }`}
          >
            <CloudOff size={12} className="text-amber-400" />
            <span>Chưa upload R2</span>
            <span className="text-[10.5px] opacity-75 font-mono">({unsyncedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setQuickFilter(quickFilter === 'missing_lyrics' ? 'all' : 'missing_lyrics')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${quickFilter === 'missing_lyrics'
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/35 shadow-xs'
              : 'text-zinc-400 hover:text-rose-400 bg-black/20 hover:bg-black/30'
              }`}
          >
            <Mic2 size={12} className="text-rose-400" />
            <span>Chưa có lời</span>
            <span className="text-[10.5px] opacity-75 font-mono">({missingLyricsCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setQuickFilter(quickFilter === 'missing_cover' ? 'all' : 'missing_cover')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${quickFilter === 'missing_cover'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35 shadow-xs'
              : 'text-zinc-400 hover:text-amber-400 bg-black/20 hover:bg-black/30'
              }`}
          >
            <ImageIcon size={12} className="text-amber-400" />
            <span>Chưa có ảnh bìa</span>
            <span className="text-[10.5px] opacity-75 font-mono">({missingCoverCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setQuickFilter(quickFilter === 'missing_any' ? 'all' : 'missing_any')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${quickFilter === 'missing_any'
              ? 'bg-orange-500/20 text-orange-300 border border-orange-500/35 shadow-xs'
              : 'text-zinc-400 hover:text-orange-400 bg-black/20 hover:bg-black/30'
              }`}
          >
            <AlertTriangle size={12} className="text-orange-400" />
            <span>Thiếu lời / bìa</span>
            <span className="text-[10.5px] opacity-75 font-mono">({missingAnyCount})</span>
          </button>

          {missingFilesCount > 0 && (
            <button
              type="button"
              onClick={() => setQuickFilter(quickFilter === 'missing_file' ? 'all' : 'missing_file')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${quickFilter === 'missing_file'
                ? 'bg-rose-500/30 text-rose-300 border border-rose-500/50 shadow-xs'
                : 'text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25'
                }`}
            >
              <AlertTriangle size={12} />
              <span>Mất tệp đĩa ({missingFilesCount})</span>
            </button>
          )}
        </div>

        {/* Thanh kết quả tìm kiếm / bộ lọc đang kích hoạt */}
        {(searchTerm || quickFilter !== 'all' || formatFilter !== 'all') && (
          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-xs">
            <span className="text-[var(--text-secondary)]">
              Tìm thấy <strong className="text-[var(--text-primary)] font-bold">{filteredTracks.length}</strong> bài hát phù hợp
            </span>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setQuickFilter('all');
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
            <span className=" text-zinc-500">#</span>
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
          <div className="w-36 shrink-0 text-center">
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
          <div className="w-32 shrink-0 text-right">
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
              {paginatedTracks.map((t, idx) => {
                const rowIndex = (validPage - 1) * pageSize + idx + 1;
                const isSelected = selectedTrackIds.has(t.id);
                const isCurrent = playingTrackId === t.id;
                const isPlayingNow = isCurrent && isAudioPlaying;

                const trackFormat = getTrackFormat(t);
                const isLossless = ['flac', 'wav', 'alac'].includes(trackFormat);

                return (
                  <div
                    key={t.id}
                    className={`px-5 py-3 flex items-center gap-4 transition-all group select-none ${isCurrent
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
                          <span
                            className="flex items-end gap-0.5 h-3.5 cursor-pointer"
                            onClick={() => handlePlayTrackItem(t)}
                            title="Tạm dừng"
                          >
                            <span className="w-0.5 h-3.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDuration: '0.6s' }} />
                            <span className="w-0.5 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDuration: '0.8s', animationDelay: '0.15s' }} />
                            <span className="w-0.5 h-2.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDuration: '0.7s', animationDelay: '0.3s' }} />
                          </span>
                        ) : (
                          <>
                            <span className=" text-xs text-zinc-500 group-hover:hidden">
                              {rowIndex}
                            </span>
                            <button
                              type="button"
                              onClick={() => handlePlayTrackItem(t)}
                              disabled={t.fileExists === false}
                              className="hidden group-hover:flex w-5 h-5 rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-black items-center justify-center shadow-sm cursor-pointer transition-transform active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed"
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
                              coverUrl: t.hasCover ? `/local-api/covers/${t.id || t.albumId}.jpg` : undefined,
                            });
                          }
                        }}
                        className="w-10 h-10 rounded-xl overflow-hidden border border-white/10 bg-black/40 shrink-0 flex items-center justify-center relative shadow-sm cursor-pointer group/thumb"
                      >
                        <Music size={16} className="text-zinc-600 shrink-0" />
                        {
                          t.hasCover && (t.id || t.albumId) && (
                            <img
                              src={`/local-api/covers/${t.id || t.albumId}.jpg`}
                              alt={t.title}
                              className="w-full h-full object-cover absolute inset-0"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          )
                        }
                        < div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center text-white transition-opacity">
                          {isPlayingNow ? <Pause size={13} fill="white" /> : <Play size={13} fill="white" />}
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[13px] font-bold truncate ${isCurrent ? 'text-emerald-400 font-extrabold' : 'text-white'
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

                    {/* Cột 4: Trạng thái Cloud (R2) - Luôn hiển thị trên 1 dòng chuẩn chỉ */}
                    <div className="w-36 shrink-0 flex items-center justify-center">
                      {t.isSynced ? (
                        <span
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 whitespace-nowrap shadow-xs"
                          title="Đã sao lưu an toàn lên Cloudflare R2"
                        >
                          <Check size={11} className="stroke-[2.5]" />
                          <span>Đã upload</span>
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/25 whitespace-nowrap shadow-xs"
                          title="Chưa upload lên R2 (chỉ lưu trên máy tính)"
                        >
                          <CloudOff size={11} />
                          <span>Chưa upload</span>
                        </span>
                      )}
                    </div>

                    {/* Cột 5: Định dạng âm thanh */}
                    <div className="w-20 shrink-0 text-center hidden sm:block">
                      {trackFormat ? (
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${isLossless
                            ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                            : 'bg-white/[0.05] text-zinc-300 border border-white/[0.08]'
                            }`}
                          title={`Định dạng tệp âm thanh: ${trackFormat.toUpperCase()}`}
                        >
                          {trackFormat}
                        </span>
                      ) : (
                        <span className="text-zinc-600 text-xs">—</span>
                      )}
                    </div>

                    {/* Cột 6: Thời lượng */}
                    <div className="w-16 shrink-0 text-right text-xs text-zinc-400  tabular-nums">
                      {formatDuration(t.duration)}
                    </div>

                      {/* Cột 7: Nút Thao tác (Thêm vào Playlist, Xem/Đổi ảnh bìa, Sửa siêu dữ liệu, Chuyển vào thùng rác) */}
                      <div className="w-32 shrink-0 flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setTracksToAddToPlaylist([t.id]);
                            setIsAddToPlaylistModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] hover:bg-blue-500/20 hover:border-blue-500/40 hover:text-blue-400 text-zinc-400 cursor-pointer transition-colors"
                          title="Thêm bài này vào Danh sách phát (Playlist)"
                        >
                          <ListPlus size={13} />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const coverUrl = `/local-api/covers/${t.id || t.albumId}.jpg?_t=${coverTimestamp}`;
                            setViewingCover({
                              isOpen: true,
                              trackId: t.id,
                              imageUrl: coverUrl,
                              title: t.title,
                              artist: t.artist,
                            });
                          }}
                          className="p-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] hover:bg-emerald-500/20 hover:border-emerald-500/40 hover:text-emerald-400 text-zinc-400 cursor-pointer transition-colors"
                          title="Xem, tải về hoặc đổi ảnh bìa HD"
                        >
                          <ImageIcon size={13} />
                        </button>

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
                )
              }

      {/* Thanh điều khiển phân trang (Pagination Footer) */ }
      {
                  filteredTracks.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 border-t border-white/[0.08] bg-black/25 text-xs">
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-400">
                          Hiển thị{' '}
                          <strong className="text-white font-medium">
                            {Math.min(filteredTracks.length, (validPage - 1) * pageSize + 1)} - {Math.min(filteredTracks.length, validPage * pageSize)}
                          </strong>{' '}
                          trên tổng số <strong className="text-[#1DB954]">{filteredTracks.length}</strong> bài hát
                        </span>

                        {/* Selector số bài mỗi trang */}
                        <div className="flex items-center gap-1.5 pl-3 border-l border-white/10 text-zinc-400">
                          <span>Mỗi trang:</span>
                          <select
                            value={pageSize}
                            onChange={(e) => {
                              setPageSize(Number(e.target.value));
                              setCurrentPage(1);
                            }}
                            className="bg-white/[0.05] border border-white/10 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:border-[#1DB954] cursor-pointer"
                          >
                            <option value={25} className="bg-zinc-900 text-white">25 bài</option>
                            <option value={50} className="bg-zinc-900 text-white">50 bài</option>
                            <option value={100} className="bg-zinc-900 text-white">100 bài</option>
                            <option value={200} className="bg-zinc-900 text-white">200 bài</option>
                            <option value={99999} className="bg-zinc-900 text-white">Tất cả</option>
                          </select>
                        </div>
                      </div>

                      {/* Điều hướng chuyển trang */}
                      {totalPages > 1 && (
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setCurrentPage(1)}
                            disabled={validPage <= 1}
                            className="h-7 w-7 p-0 flex items-center justify-center border-white/10"
                            title="Về trang đầu"
                          >
                            <ChevronsLeft size={13} />
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={validPage <= 1}
                            className="h-7 px-2 flex items-center gap-1 border-white/10 text-xs"
                            title="Trang trước"
                          >
                            <ChevronLeft size={13} />
                            <span className="hidden sm:inline">Trước</span>
                          </Button>

                          <div className="flex items-center gap-1 px-1">
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                              .filter((p) => p === 1 || p === totalPages || Math.abs(p - validPage) <= 1)
                              .map((p, idx, arr) => {
                                const prev = arr[idx - 1];
                                const hasGap = prev && p - prev > 1;
                                return (
                                  <React.Fragment key={p}>
                                    {hasGap && <span className="px-1 text-zinc-600">...</span>}
                                    <button
                                      type="button"
                                      onClick={() => setCurrentPage(p)}
                                      className={`h-7 min-w-7 px-2 rounded text-xs font-semibold cursor-pointer transition-colors ${validPage === p
                                        ? 'bg-[#1DB954] text-black font-bold shadow-xs'
                                        : 'bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08]'
                                        }`}
                                    >
                                      {p}
                                    </button>
                                  </React.Fragment>
                                );
                              })}
                          </div>

                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={validPage >= totalPages}
                            className="h-7 px-2 flex items-center gap-1 border-white/10 text-xs"
                            title="Trang sau"
                          >
                            <span className="hidden sm:inline">Sau</span>
                            <ChevronRight size={13} />
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={validPage >= totalPages}
                            className="h-7 w-7 p-0 flex items-center justify-center border-white/10"
                            title="Đến trang cuối"
                          >
                            <ChevronsRight size={13} />
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                }
    </div>

      {/* Thanh thao tác hàng loạt nổi (Floating Batch Action Bar) */}
          {
            selectedTrackIds.size > 0 && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[var(--bg-surface)]/95 backdrop-blur-xl border border-white/15 shadow-2xl rounded-2xl px-5 py-3 flex items-center gap-4 text-xs animate-in slide-in-from-bottom-4 duration-200">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-[#1DB954]/20 border border-[#1DB954]/40 flex items-center justify-center text-[#1DB954]">
                    <CheckSquare size={13} />
                  </div>
                  <span className="font-medium text-white">
                    Đã chọn <strong className="text-[#1DB954]">{selectedTrackIds.size}</strong> bài hát
                  </span>
                  <span className="text-zinc-400  text-[11px] border-l border-white/10 pl-2.5 ml-0.5 tabular-nums">
                    {formatDuration(totalSelectedDuration)}
                  </span>
                </div>

                <div className="h-4 w-[1px] bg-white/10" />

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => batchFetchLyricsMutation.mutate(Array.from(selectedTrackIds))}
                    disabled={batchFetchLyricsMutation.isPending}
                    className="h-8 text-xs px-3 gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                    title="Tìm kiếm và lưu file .lrc từ LRCLIB cho các bài đã chọn"
                  >
                    <Mic2 size={12} className={batchFetchLyricsMutation.isPending ? 'animate-pulse' : ''} />
                    <span>Tải lời LRCLIB</span>
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => batchReplayGainMutation.mutate(Array.from(selectedTrackIds))}
                    disabled={batchReplayGainMutation.isPending}
                    className="h-8 text-xs px-3 gap-1.5"
                    title="Đo độ ồn LUFS và tính ReplayGain chuẩn hóa âm lượng cho các bài đã chọn"
                  >
                    <Volume2 size={12} className={batchReplayGainMutation.isPending ? 'animate-pulse' : ''} />
                    <span>Đo ReplayGain</span>
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setBatchCoverFile(null);
                      setBatchCoverPreview(null);
                      setIsBatchCoverOpen(true);
                    }}
                    className="h-8 text-xs px-3 gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10"
                    title="Tự động tải lại ảnh bìa HD từ YouTube cho toàn bộ các bài hát đã chọn cùng lúc"
                  >
                    <Sparkles size={12} />
                    <span>Tải ảnh bìa YouTube ({selectedTrackIds.size} bài)</span>
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setTracksToAddToPlaylist(Array.from(selectedTrackIds));
                      setIsAddToPlaylistModalOpen(true);
                    }}
                    className="h-8 text-xs px-3 gap-1.5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                    title="Thêm các bài hát đã chọn vào danh sách phát và tự động đồng bộ với iPhone"
                  >
                    <ListPlus size={13} />
                    <span>Thêm vào Playlist ({selectedTrackIds.size})</span>
                  </Button>

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
            )
          }

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
              {/* Khối quản lý ảnh bìa sắc nét HD */}
              {editingTrack && (
                <div className="p-3.5 rounded-2xl bg-black/30 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11.5px] font-semibold text-zinc-300 flex items-center gap-1.5">
                      <ImageIcon size={14} className="text-[#1DB954]" />
                      <span>Ảnh bìa bài hát (Album Artwork HD)</span>
                    </label>
                    <span className="text-[10px] text-zinc-400">Tỷ lệ vuông 1:1</span>
                  </div>

                  <div className="flex items-center gap-3.5">
                    {/* Khung xem ảnh bìa */}
                    <div className="w-20 h-20 rounded-xl overflow-hidden border border-white/10 bg-black/50 shrink-0 flex items-center justify-center relative shadow-md group">
                      <Music size={24} className="text-zinc-600 shrink-0" />
                      {(editingTrack.id || editingTrack.albumId) && (
                        <img
                          key={coverTimestamp}
                          src={`/local-api/covers/${editingTrack.id || editingTrack.albumId}.jpg?_t=${coverTimestamp}`}
                          alt={editTitle}
                          className="w-full h-full object-cover absolute inset-0"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                      {isUploadingCover && (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                          <Loader2 size={18} className="animate-spin text-[#1DB954]" />
                        </div>
                      )}
                    </div>

                    {/* Các nút bấm thao tác ảnh bìa */}
                    <div className="flex-1 space-y-2">
                      <input
                        type="file"
                        ref={editCoverInputRef}
                        onChange={handleUploadNewCover}
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Nút Lấy ảnh từ YouTube HD (Ưu tiên cao nhất) */}
                        <button
                          type="button"
                          onClick={() => handleFetchYouTubeCover(editingTrack.id)}
                          disabled={isUploadingCover}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors cursor-pointer active:scale-95 shadow-xs disabled:opacity-50"
                          title="Tự động tìm kiếm video trên YouTube và tải ảnh bìa gốc HD chất lượng cao"
                        >
                          {isUploadingCover ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                          <span>Lấy ảnh từ YouTube</span>
                        </button>

                        {/* Nút Đổi ảnh bìa mới từ máy tính */}
                        <button
                          type="button"
                          onClick={() => editCoverInputRef.current?.click()}
                          disabled={isUploadingCover}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/15 text-zinc-300 border border-white/10 transition-colors cursor-pointer active:scale-95 shadow-xs disabled:opacity-50"
                          title="Chọn file ảnh từ máy tính (nếu muốn tải ảnh cá nhân)"
                        >
                          <Upload size={13} />
                          <span>Từ máy tính</span>
                        </button>

                        {/* Nút Tải ảnh HD về máy */}
                        <button
                          type="button"
                          onClick={() => handleDownloadTrackCover(editingTrack)}
                          disabled={isUploadingCover}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/15 text-white border border-white/10 transition-colors cursor-pointer active:scale-95 shadow-xs"
                          title="Tải ảnh bìa gốc độ nét cao về máy tính"
                        >
                          <Download size={13} className="text-[#1DB954]" />
                          <span>Tải ảnh HD</span>
                        </button>

                        {/* Nút Xóa ảnh bìa */}
                        <button
                          type="button"
                          onClick={handleDeleteCover}
                          disabled={isUploadingCover}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors cursor-pointer active:scale-95 shadow-xs"
                          title="Xóa ảnh bìa của bài hát"
                        >
                          <Trash2 size={12} />
                          <span>Xóa</span>
                        </button>
                      </div>
                      <p className="text-[10.5px] text-zinc-400 leading-tight">
                        Tự động cào ảnh gốc YouTube (1:1 HD 600x600) hoặc chọn file từ máy tính. Tự động đồng bộ lên R2.
                      </p>
                    </div>
                  </div>
                </div>
              )}

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
          {
            trashTrack && (
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
                        {(trashTrack.id || trashTrack.albumId) && (
                          <img
                            src={`/local-api/covers/${trashTrack.id || trashTrack.albumId}.jpg`}
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
                          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-300  bg-white/[0.05] px-2 py-0.5 rounded-md border border-white/10">
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
            )
          }

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
                  <span className="text-zinc-300  flex items-center gap-1.5">
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
                          {(t.id || t.albumId) && (
                            <img
                              src={`/local-api/covers/${t.id || t.albumId}.jpg`}
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
                      <span className="text-[10.5px] text-zinc-500  tabular-nums shrink-0">
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

          {/* Hộp thoại Đổi ảnh bìa hàng loạt cho nhiều bài hát */}
          <Dialog
            open={isBatchCoverOpen}
            onOpenChange={(o) => {
              if (!o) {
                setIsBatchCoverOpen(false);
                setBatchCoverFile(null);
                setBatchCoverPreview(null);
              }
            }}
            title={`Tải lại ảnh bìa cho ${selectedTrackIds.size} bài hát đã chọn`}
            description="Tự động cào ảnh gốc từ YouTube (HD) hoặc chọn một file ảnh từ máy tính để áp dụng chung"
            actions={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setIsBatchCoverOpen(false);
                    setBatchCoverFile(null);
                    setBatchCoverPreview(null);
                  }}
                  disabled={isBatchUploadingCover}
                >
                  Đóng
                </Button>
                {batchCoverFile && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleApplyBatchCover}
                    disabled={isBatchUploadingCover}
                    className="flex items-center gap-1.5"
                  >
                    {isBatchUploadingCover ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Đang lưu...</span>
                      </>
                    ) : (
                      <>
                        <Upload size={13} />
                        <span>Áp dụng ảnh máy tính ({selectedTrackIds.size} bài)</span>
                      </>
                    )}
                  </Button>
                )}
              </>
            }
          >
            <div className="space-y-4 py-2">
              {/* Lựa chọn 1 (Chính): Tải tự động từ YouTube */}
              <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-red-400 shrink-0" />
                      <h4 className="text-sm font-semibold text-white">
                        Tự động tải lại ảnh bìa từ YouTube (Khuyên dùng)
                      </h4>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      Hệ thống tự động tìm video YouTube tương ứng của từng bài trong <strong>{selectedTrackIds.size} bài</strong>, tải ảnh bìa gốc độ phân giải cao nhất (HD maxresdefault), crop vuông 600x600 chuẩn mực và đồng bộ lên R2.
                    </p>
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleBatchFetchYouTubeCover}
                  disabled={isBatchUploadingCover}
                  className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold flex items-center justify-center gap-2 py-2"
                >
                  {isBatchUploadingCover ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Đang tải ảnh bìa YouTube...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      <span>Bắt đầu tải ảnh bìa YouTube ({selectedTrackIds.size} bài)</span>
                    </>
                  )}
                </Button>
              </div>

              {/* Lựa chọn 2: Tự chọn ảnh từ máy tính nếu cần */}
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-white/10" />
                <span className="flex-shrink mx-3 text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                  Hoặc tự chọn ảnh từ máy tính
                </span>
                <div className="flex-grow border-t border-white/10" />
              </div>

              <input
                type="file"
                ref={batchCoverInputRef}
                onChange={handleBatchFileSelect}
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
              />

              <div className="flex flex-col items-center justify-center p-4 border border-dashed border-white/15 hover:border-white/30 rounded-xl bg-black/20 transition-colors">
                {batchCoverPreview ? (
                  <div className="flex flex-col items-center gap-2.5">
                    <div className="w-24 h-24 rounded-lg overflow-hidden border border-white/20 shadow-md relative">
                      <img src={batchCoverPreview} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => batchCoverInputRef.current?.click()}
                        className="text-xs h-7"
                      >
                        Chọn ảnh khác
                      </Button>
                      <span className="text-[11px] text-zinc-400 font-mono truncate max-w-[150px]">
                        {batchCoverFile?.name}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => batchCoverInputRef.current?.click()}
                    className="flex flex-col items-center gap-1.5 cursor-pointer text-center py-2"
                  >
                    <Upload size={18} className="text-zinc-400" />
                    <span className="text-xs text-zinc-300">Chọn 1 file ảnh từ máy để áp dụng chung</span>
                    <span className="text-[10px] text-zinc-500">Hỗ trợ JPG, PNG, WEBP</span>
                  </div>
                )}
              </div>
            </div>
          </Dialog>

          {/* Hộp thoại Chọn Playlist để thêm bài hát */}
          <Dialog
            open={isAddToPlaylistModalOpen}
            onOpenChange={setIsAddToPlaylistModalOpen}
            title={`Thêm ${tracksToAddToPlaylist.length} bài hát vào Danh sách phát`}
            description="Dữ liệu sẽ tự động đồng bộ tức thì với ứng dụng iPhone qua Cloudflare R2"
          >
            <div className="space-y-3 py-2">
              {userPlaylists.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-white/10 rounded-xl bg-black/20">
                  <FolderPlus size={32} className="mx-auto text-zinc-500 mb-2" />
                  <p className="text-sm text-zinc-300 font-semibold mb-1">Chưa có danh sách phát nào</p>
                  <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                    Vui lòng qua trang Playlist để tạo danh sách phát đầu tiên.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {userPlaylists.map((pl) => (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => handleConfirmAddToPlaylist(pl.id)}
                      className="w-full flex items-center gap-3.5 p-3 rounded-xl border border-white/[0.08] bg-black/30 hover:bg-white/[0.05] hover:border-[#1DB954]/50 transition-all text-left cursor-pointer group"
                    >
                      <div className="w-12 h-12 rounded-lg bg-black/50 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                        {pl.coverUrl ? (
                          <img src={pl.coverUrl} alt={pl.name} className="w-full h-full object-cover" />
                        ) : (
                          <ListPlus size={20} className="text-[#1DB954]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-white group-hover:text-[#1DB954] transition-colors truncate">
                          {pl.name}
                        </h4>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {pl.trackIds.length} bài hát {pl.description ? `• ${pl.description}` : ''}
                        </p>
                      </div>
                      <div className="text-xs font-semibold text-[#1DB954] opacity-0 group-hover:opacity-100 transition-opacity">
                        + Thêm
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Dialog>

          {/* Hộp thoại xem ảnh bìa lớn HD kèm tải / đổi ảnh */}
          {viewingCover && (
            <CoverViewerDialog
              isOpen={viewingCover.isOpen}
              onClose={() => setViewingCover(null)}
              imageUrl={viewingCover.imageUrl}
              title={viewingCover.title}
              artist={viewingCover.artist}
              trackId={viewingCover.trackId}
              onCoverUpdated={() => {
                setCoverTimestamp(Date.now());
                queryClient.invalidateQueries({ queryKey: ['local-tracks'] });
                queryClient.invalidateQueries({ queryKey: ['system-status'] });
              }}
            />
          )}
        </div >
        );
};
