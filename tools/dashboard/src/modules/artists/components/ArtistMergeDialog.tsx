import React, { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  X,
  GitMerge,
  Search,
  AlertTriangle,
  RefreshCw,
  Folder,
  FolderOpen,
  Disc,
  Music,
  Trash2,
  ChevronRight,
  ChevronDown,
  CheckSquare,
  Square,
  Users,
  MoveRight,
  HardDrive,
  Cloud,
  Layers,
  Sparkles,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Button } from '../../../ui/atoms/Button';
import {
  mergeArtistsApi,
  moveTracksToArtistApi,
  deleteTracksPermanentApi,
  type ArtistDetail,
  type ArtistTrack,
} from '../api';

interface ArtistMergeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  artists: ArtistDetail[];
  initialTargetArtist?: string;
  onSuccess: () => void;
}

function normalize(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Mục nghệ sĩ trong danh mục bên trái (Tối ưu hóa tránh re-render DOM)
 */
interface ArtistListItemProps {
  artist: ArtistDetail;
  isTarget: boolean;
  isSource: boolean;
  isSuggested: boolean;
  onSelectTarget: (name: string) => void;
  onToggleSource: (name: string) => void;
}

const ArtistListItem = React.memo<ArtistListItemProps>(({
  artist,
  isTarget,
  isSource,
  isSuggested,
  onSelectTarget,
  onToggleSource,
}) => {
  return (
    <div
      onClick={() => onSelectTarget(artist.name)}
      className={`group px-3 py-2 rounded-xl flex items-center justify-between gap-2.5 transition-all cursor-pointer border ${
        isTarget
          ? 'bg-emerald-500/15 border-emerald-500/50 shadow-sm'
          : isSource
          ? 'bg-amber-500/10 border-amber-500/40'
          : 'hover:bg-[var(--bg-hover)] border-transparent'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full overflow-hidden bg-black/40 border border-white/10 shrink-0 flex items-center justify-center">
          {artist.avatarUrl ? (
            <img
              src={artist.avatarUrl}
              alt={artist.name}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <Users size={13} className="text-[var(--text-muted)]" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-[12.5px] font-bold truncate ${
                isTarget
                  ? 'text-emerald-400'
                  : isSource
                  ? 'text-amber-300'
                  : 'text-[var(--text-primary)]'
              }`}
            >
              {artist.name}
            </span>
            {isSuggested && !isTarget && !isSource && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                title="Tên tương tự, có thể gộp"
              />
            )}
          </div>
          <div className="text-[10.5px] text-[var(--text-muted)] flex items-center gap-1.5 mt-0.5">
            <span>{artist.trackCount} bài</span>
            {artist.albumCount > 0 && <span>• {artist.albumCount} album</span>}
          </div>
        </div>
      </div>

      {/* Nút thao tác nhanh: chọn gộp nguồn */}
      {!isTarget && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSource(artist.name);
          }}
          className={`p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            isSource
              ? 'bg-amber-500 text-black hover:bg-amber-400'
              : 'text-[var(--text-muted)] hover:text-amber-300 hover:bg-amber-500/20'
          }`}
          title={isSource ? 'Bỏ chọn gộp nguồn' : 'Chọn làm nghệ sĩ nguồn để gộp vào đích'}
        >
          <GitMerge size={13} />
        </button>
      )}
      {isTarget && (
        <span className="text-[9.5px] px-2 py-0.5 rounded bg-emerald-500 text-black font-extrabold uppercase shrink-0 tracking-wide">
          Đích
        </span>
      )}
    </div>
  );
});
ArtistListItem.displayName = 'ArtistListItem';

export const ArtistMergeDialog: React.FC<ArtistMergeDialogProps> = ({
  isOpen,
  onClose,
  artists,
  initialTargetArtist,
  onSuccess,
}) => {
  // Trạng thái phóng to toàn màn hình
  const [isMaximized, setIsMaximized] = useState(false);

  // Nghệ sĩ đích đang xem / chọn
  const [targetArtist, setTargetArtist] = useState(
    () => initialTargetArtist || (artists.length > 0 ? artists[0]?.name || '' : '')
  );
  // Các nghệ sĩ nguồn muốn gộp
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  // Các bài hát đang được tích chọn trong sơ đồ cây
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());

  // Tìm kiếm ở cột trái
  const [artistSearch, setArtistSearch] = useState('');
  // Bộ lọc cột trái: all | suggestions | selected | popular
  const [artistFilter, setArtistFilter] = useState<'all' | 'suggestions' | 'selected' | 'popular'>('all');
  // Số lượng nghệ sĩ hiển thị ở cột trái (Virtual Chunking chống lag DOM)
  const [visibleLimit, setVisibleLimit] = useState(40);

  // Lọc bài hát trong cây ở cột giữa
  const [treeSearch, setTreeSearch] = useState('');

  // Trạng thái mở rộng các node trong cây (Mặc định mở root, albums, sources)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set(['root', 'albums', 'sources'])
  );

  // Tab tác vụ cột phải: 'merge' | 'move' | 'delete'
  const [activeActionTab, setActiveActionTab] = useState<'merge' | 'move' | 'delete'>('merge');

  // Nghệ sĩ đích để chuyển bài hát đã chọn sang
  const [moveTargetArtist, setMoveTargetArtist] = useState('');
  const [moveTargetAlbum, setMoveTargetAlbum] = useState('');

  // Tùy chọn xóa
  const [deleteFromR2, setDeleteFromR2] = useState(true);
  const [deleteLocal, setDeleteLocal] = useState(true);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  // Khởi tạo targetArtist khi mở modal
  React.useEffect(() => {
    if (initialTargetArtist) {
      setTargetArtist(initialTargetArtist);
    } else if (artists.length > 0 && !targetArtist) {
      setTargetArtist(artists[0]?.name || '');
    }
  }, [initialTargetArtist, artists]);

  // Bộ đệm chuẩn hóa chuỗi tên nghệ sĩ (Tránh tính toán lại regex lặp đi lặp lại)
  const normalizedMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of artists) {
      map.set(a.name, normalize(a.name));
    }
    return map;
  }, [artists]);

  // Chi tiết nghệ sĩ đích hiện tại
  const targetDetail = useMemo(() => {
    return artists.find((a) => a.name === targetArtist) || null;
  }, [artists, targetArtist]);

  // Gợi ý thông minh: các nghệ sĩ có tên tương tự với targetArtist
  const suggestedSources = useMemo(() => {
    if (!targetArtist) return [];
    const normTarget = normalizedMap.get(targetArtist) || normalize(targetArtist);
    if (!normTarget) return [];
    return artists.filter((a) => {
      if (a.name === targetArtist) return false;
      const normA = normalizedMap.get(a.name) || normalize(a.name);
      return normA === normTarget || normA.includes(normTarget) || normTarget.includes(normA);
    });
  }, [artists, targetArtist, normalizedMap]);

  // O(1) Set tra cứu nghệ sĩ gợi ý
  const suggestedSourcesSet = useMemo(() => {
    return new Set(suggestedSources.map((s) => s.name));
  }, [suggestedSources]);

  // Danh sách nghệ sĩ lọc ở cột trái
  const filteredArtists = useMemo(() => {
    const normSearch = normalize(artistSearch);
    return artists.filter((a) => {
      if (normSearch) {
        const normA = normalizedMap.get(a.name) || normalize(a.name);
        if (!normA.includes(normSearch)) return false;
      }
      if (artistFilter === 'suggestions') {
        return suggestedSourcesSet.has(a.name);
      }
      if (artistFilter === 'selected') {
        return selectedSources.has(a.name) || a.name === targetArtist;
      }
      if (artistFilter === 'popular') {
        return a.trackCount >= 4;
      }
      return true;
    });
  }, [artists, artistSearch, artistFilter, suggestedSourcesSet, selectedSources, targetArtist, normalizedMap]);

  // Danh sách hiển thị cắt lớp (Chunking) để DOM mount tức thì < 16ms
  const displayedArtists = useMemo(() => {
    if (artistSearch.trim() || artistFilter !== 'all') {
      return filteredArtists;
    }
    return filteredArtists.slice(0, visibleLimit);
  }, [filteredArtists, visibleLimit, artistSearch, artistFilter]);

  // Danh sách chi tiết các nghệ sĩ nguồn đã chọn
  const sourceDetails = useMemo(() => {
    return artists.filter((a) => selectedSources.has(a.name));
  }, [artists, selectedSources]);

  // Chuẩn hóa từ khóa lọc trong cây
  const normalizedTreeSearch = useMemo(() => normalize(treeSearch), [treeSearch]);

  // Phân loại và lập chỉ mục trước các bài hát trong album và singles của nghệ sĩ đích
  const { albumsWithTracks, singlesTracks } = useMemo(() => {
    if (!targetDetail) {
      return { albumsWithTracks: [], singlesTracks: [] };
    }

    const singles: ArtistTrack[] = [];
    const tracksByAlbum = new Map<string, ArtistTrack[]>();
    for (const al of targetDetail.albums) {
      tracksByAlbum.set(al.id, []);
    }

    for (const track of targetDetail.tracks) {
      if (normalizedTreeSearch && !normalize(track.title).includes(normalizedTreeSearch)) {
        continue;
      }

      if (!track.albumId || track.album === 'Singles' || track.album === 'Single') {
        singles.push(track);
      } else {
        const list = tracksByAlbum.get(track.albumId);
        if (list) {
          list.push(track);
        } else {
          const matchedAl = targetDetail.albums.find((a) => a.title === track.album);
          if (matchedAl) {
            tracksByAlbum.get(matchedAl.id)?.push(track);
          } else {
            singles.push(track);
          }
        }
      }
    }

    const albums = targetDetail.albums
      .map((al) => ({
        album: al,
        tracks: tracksByAlbum.get(al.id) || [],
      }))
      .filter((item) => !normalizedTreeSearch || item.tracks.length > 0);

    return { albumsWithTracks: albums, singlesTracks: singles };
  }, [targetDetail, normalizedTreeSearch]);

  // Danh sách bài hát đã lọc sẵn cho từng nghệ sĩ nguồn
  const sourceDetailsWithTracks = useMemo(() => {
    return sourceDetails.map((src) => ({
      ...src,
      filteredTracks: normalizedTreeSearch
        ? src.tracks.filter((t) => normalize(t.title).includes(normalizedTreeSearch))
        : src.tracks,
    }));
  }, [sourceDetails, normalizedTreeSearch]);

  // Tổng số bài hát từ các nguồn gộp
  const totalSourceTracks = useMemo(() => {
    return sourceDetails.reduce((acc, a) => acc + a.trackCount, 0);
  }, [sourceDetails]);

  // Tổng số bài hát của nghệ sĩ đích sau khi gộp
  const totalAfterMerge = (targetDetail?.trackCount || 0) + totalSourceTracks;

  // Chọn nghệ sĩ đích (memoized callback)
  const selectTarget = useCallback((name: string) => {
    setTargetArtist(name);
  }, []);

  // Toggle chọn nghệ sĩ nguồn để gộp (memoized callback)
  const toggleSource = useCallback((name: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  // Toggle mở rộng node trong cây
  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const expandAll = () => {
    const all = new Set<string>(['root', 'albums', 'singles', 'sources']);
    if (targetDetail) {
      targetDetail.albums.forEach((al) => all.add(`album_${al.id}`));
      sourceDetails.forEach((src) => all.add(`source_${src.name}`));
    }
    setExpandedNodes(all);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  // Toggle chọn bài hát trong cây (memoized callback)
  const toggleTrackSelection = useCallback((trackId: string) => {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  }, []);

  // Chuyển nhanh 1 bài hát (memoized callback)
  const handleQuickMoveTrack = useCallback((trackId: string) => {
    setSelectedTrackIds(new Set([trackId]));
    setActiveActionTab('move');
  }, []);

  // Xóa nhanh 1 bài hát (memoized callback)
  const handleQuickDeleteTrack = useCallback((trackId: string) => {
    setSelectedTrackIds(new Set([trackId]));
    setActiveActionTab('delete');
    setIsConfirmDeleteOpen(true);
  }, []);

  // Chọn toàn bộ bài hát của 1 album
  const toggleSelectAlbumTracks = (albumTracks: ArtistTrack[]) => {
    const next = new Set(selectedTrackIds);
    const allSelected = albumTracks.every((t) => next.has(t.id));
    if (allSelected) {
      albumTracks.forEach((t) => next.delete(t.id));
    } else {
      albumTracks.forEach((t) => next.add(t.id));
    }
    setSelectedTrackIds(next);
  };

  // Chọn toàn bộ bài hát của nghệ sĩ đích
  const selectAllTargetTracks = () => {
    if (!targetDetail) return;
    const next = new Set(selectedTrackIds);
    targetDetail.tracks.forEach((t) => next.add(t.id));
    setSelectedTrackIds(next);
  };

  // Bỏ chọn toàn bộ bài hát
  const deselectAllTracks = () => {
    setSelectedTrackIds(new Set());
  };

  // 1. Thực thi gộp nghệ sĩ
  const handleMergeSubmit = async () => {
    if (!targetArtist) {
      toast.error('Vui lòng chọn nghệ sĩ đích');
      return;
    }
    if (selectedSources.size === 0) {
      toast.error('Vui lòng chọn ít nhất 1 nghệ sĩ nguồn để gộp');
      return;
    }

    setIsLoading(true);
    try {
      const res = await mergeArtistsApi(targetArtist, Array.from(selectedSources));
      toast.success(res.message || 'Đã gộp nghệ sĩ thành công!');
      setSelectedSources(new Set());
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi khi gộp nghệ sĩ: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Thực thi chuyển các bài hát đã chọn sang nghệ sĩ khác
  const handleMoveTracksSubmit = async () => {
    if (selectedTrackIds.size === 0) {
      toast.error('Vui lòng tích chọn ít nhất 1 bài hát trong sơ đồ cây để chuyển');
      return;
    }
    if (!moveTargetArtist || !moveTargetArtist.trim()) {
      toast.error('Vui lòng chọn nghệ sĩ nhận bài hát');
      return;
    }

    setIsLoading(true);
    try {
      const res = await moveTracksToArtistApi(
        Array.from(selectedTrackIds),
        moveTargetArtist.trim(),
        moveTargetAlbum.trim() || undefined
      );
      toast.success(res.message || 'Đã chuyển bài hát thành công!');
      setSelectedTrackIds(new Set());
      setMoveTargetAlbum('');
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi khi chuyển bài hát: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Thực thi xóa bài hát trên R2 và Local
  const handleDeleteTracksSubmit = async () => {
    if (selectedTrackIds.size === 0) {
      toast.error('Vui lòng chọn ít nhất 1 bài hát cần xóa');
      return;
    }

    setIsLoading(true);
    try {
      const res = await deleteTracksPermanentApi(
        Array.from(selectedTrackIds),
        deleteFromR2,
        deleteLocal
      );
      toast.success(res.message || 'Đã xóa bài hát thành công!');
      setSelectedTrackIds(new Set());
      setIsConfirmDeleteOpen(false);
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi khi xóa bài hát: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-100">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className={`flex flex-col border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden select-none transition-all duration-200 ${
          isMaximized
            ? 'fixed inset-0 w-screen h-screen max-w-none max-h-none rounded-none z-[75]'
            : 'w-[98.5vw] max-w-[1780px] h-[94vh] max-h-[96vh] rounded-3xl'
        }`}
      >
        {/* HEADER CHÍNH CỦA STUDIO */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-[var(--border)] bg-[var(--bg-subtle)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <GitMerge size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-[15.5px] text-[var(--text-primary)] tracking-tight">
                  Studio Điều Phối Nghệ Sĩ &amp; Sơ Đồ Cây Thư Viện
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Live Cloudflare R2
                </span>
                <span className="text-[11px] text-[var(--text-muted)] font-medium">
                  ({artists.length} nghệ sĩ tổng cộng)
                </span>
              </div>
              <p className="text-[11.5px] text-[var(--text-muted)] m-0">
                Gộp biến thể nghệ sĩ, duyệt cây bài hát &amp; album trực quan, chuyển bài linh hoạt &amp; xóa sạch trên R2 / Local
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Nút phóng to / thu nhỏ */}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              title={isMaximized ? 'Thu nhỏ kích thước' : 'Phóng to toàn màn hình'}
            >
              {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            {/* Nút đóng */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              title="Đóng cửa sổ"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* NỘI DUNG 3 CỘT LAYOUT NGANG (HORIZONTAL SPLIT VIEW) */}
        <div className="flex-1 min-h-0 flex divide-x divide-[var(--border)] bg-[var(--bg-surface)]">
          {/* ======================================================== */}
          {/* CỘT 1 (TRÁI - 320px): DANH MỤC & TÌM KIẾM NGHỆ SĨ        */}
          {/* ======================================================== */}
          <div className="w-80 shrink-0 flex flex-col bg-[var(--bg-subtle)]/40 overflow-hidden">
            <div className="p-3.5 border-b border-[var(--border)] space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)]">
                <span className="flex items-center gap-1.5">
                  <Users size={14} className="text-emerald-400" />
                  <span>Danh Mục Nghệ Sĩ ({filteredArtists.length})</span>
                </span>
                {selectedSources.size > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                    +{selectedSources.size} nguồn gộp
                  </span>
                )}
              </div>

              {/* Ô tìm kiếm nhanh */}
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={artistSearch}
                  onChange={(e) => {
                    setArtistSearch(e.target.value);
                    setVisibleLimit(40);
                  }}
                  placeholder="Tìm tên ca sĩ..."
                  className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-emerald-500 transition-colors"
                />
                {artistSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setArtistSearch('');
                      setVisibleLimit(40);
                    }}
                    className="absolute right-2 top-2 text-[var(--text-muted)] hover:text-white"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Filter chips */}
              <div className="flex flex-wrap gap-1">
                {[
                  { key: 'all', label: 'Tất cả' },
                  { key: 'suggestions', label: `Gợi ý (${suggestedSources.length})` },
                  { key: 'selected', label: `Đã chọn (${selectedSources.size})` },
                  { key: 'popular', label: '≥ 4 bài' },
                ].map((flt) => (
                  <button
                    key={flt.key}
                    type="button"
                    onClick={() => {
                      setArtistFilter(flt.key as typeof artistFilter);
                      setVisibleLimit(40);
                    }}
                    className={`text-[10.5px] px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      artistFilter === flt.key
                        ? 'bg-emerald-500 text-black font-bold shadow-xs'
                        : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border)]'
                    }`}
                  >
                    {flt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Danh sách cuộn nghệ sĩ (Optimized Chunking) */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {displayedArtists.length === 0 ? (
                <div className="text-center py-12 text-xs text-[var(--text-muted)]">
                  Không tìm thấy nghệ sĩ nào phù hợp
                </div>
              ) : (
                <>
                  {displayedArtists.map((a) => (
                    <ArtistListItem
                      key={a.name}
                      artist={a}
                      isTarget={a.name === targetArtist}
                      isSource={selectedSources.has(a.name)}
                      isSuggested={suggestedSourcesSet.has(a.name)}
                      onSelectTarget={selectTarget}
                      onToggleSource={toggleSource}
                    />
                  ))}

                  {/* Nút tải thêm nghệ sĩ nếu danh sách dài */}
                  {filteredArtists.length > visibleLimit && (
                    <div className="pt-2 pb-1 text-center">
                      <button
                        type="button"
                        onClick={() => setVisibleLimit((prev) => prev + 40)}
                        className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 py-1.5 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all cursor-pointer"
                      >
                        Hiển thị thêm {Math.min(40, filteredArtists.length - visibleLimit)} nghệ sĩ... ({filteredArtists.length - visibleLimit} còn lại)
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ======================================================== */}
          {/* CỘT 2 (GIỮA - RỘNG ~55%): SƠ ĐỒ CÂY PHÂN CẤP TRỰC QUAN   */}
          {/* ======================================================== */}
          <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-surface)] overflow-hidden">
            {/* Toolbar sơ đồ cây */}
            <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between gap-3 bg-[var(--bg-subtle)]/30 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Layers size={15} className="text-emerald-400" />
                  <span>Sơ Đồ Cây Phân Cấp Thư Viện</span>
                </span>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={expandAll}
                    className="px-2.5 py-1 rounded bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-white transition-colors cursor-pointer font-medium"
                  >
                    Mở tất cả
                  </button>
                  <button
                    type="button"
                    onClick={collapseAll}
                    className="px-2.5 py-1 rounded bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-white transition-colors cursor-pointer font-medium"
                  >
                    Thu gọn
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Ô lọc bài hát trong cây */}
                <div className="relative w-56">
                  <Search size={12} className="absolute left-2.5 top-2.5 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={treeSearch}
                    onChange={(e) => setTreeSearch(e.target.value)}
                    placeholder="Lọc bài hát trong cây..."
                    className="w-full pl-7 pr-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-emerald-500"
                  />
                  {treeSearch && (
                    <button
                      type="button"
                      onClick={() => setTreeSearch('')}
                      className="absolute right-2 top-2 text-[var(--text-muted)] hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {selectedTrackIds.size > 0 && (
                  <button
                    type="button"
                    onClick={deselectAllTracks}
                    className="text-xs text-[var(--text-muted)] hover:text-rose-400 font-semibold cursor-pointer"
                  >
                    Bỏ chọn ({selectedTrackIds.size})
                  </button>
                )}
              </div>
            </div>

            {/* KHÔNG GIAN SƠ ĐỒ CÂY CUỘN */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {!targetDetail ? (
                <div className="text-center py-24 text-zinc-500 text-sm">
                  Vui lòng chọn một nghệ sĩ từ danh mục bên trái để hiển thị sơ đồ cây
                </div>
              ) : (
                <div className="space-y-4 font-sans text-xs">
                  {/* NODE GỐC (ROOT NODE) - NGHỆ SĨ ĐÍCH */}
                  <div className="p-4 rounded-2xl border-2 border-emerald-500/50 bg-emerald-500/[0.08] shadow-lg flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-black/60 border-2 border-emerald-500 shadow-md flex items-center justify-center shrink-0">
                        {targetDetail.avatarUrl ? (
                          <img
                            src={targetDetail.avatarUrl}
                            alt={targetDetail.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <Users size={18} className="text-emerald-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[15px] font-extrabold text-white tracking-wide">
                            {targetDetail.name}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500 text-black uppercase tracking-wider">
                            Nghệ Sĩ Đích
                          </span>
                        </div>
                        <div className="text-xs text-emerald-300/80 mt-1 flex items-center gap-2.5">
                          <span>Hiện có: <strong>{targetDetail.trackCount} bài hát</strong></span>
                          <span>•</span>
                          <span>{targetDetail.albumCount} album</span>
                          {selectedSources.size > 0 && (
                            <span className="font-bold text-amber-300 ml-1">
                              ➔ Sau gộp: {totalAfterMerge} bài (+{totalSourceTracks} từ {selectedSources.size} nguồn)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={selectAllTargetTracks}
                        className="text-xs py-1.5 px-3 h-auto font-semibold gap-1.5 text-[var(--text-secondary)] hover:text-white"
                      >
                        <CheckSquare size={13} />
                        <span>Chọn tất cả {targetDetail.trackCount} bài</span>
                      </Button>
                    </div>
                  </div>

                  {/* SƠ ĐỒ CÂY CẤU TRÚC: ALBUMS, SINGLES & NGUỒN GỘP */}
                  <div className="pl-4 border-l-2 border-emerald-500/30 space-y-4 ml-6">
                    {/* NHÁNH 1: CÁC ALBUM PHÒNG THU CỦA NGHỆ SĨ ĐÍCH */}
                    {targetDetail.albums.length > 0 && (
                      <div className="space-y-2.5">
                        <div
                          onClick={() => toggleNode('albums')}
                          className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] cursor-pointer hover:text-emerald-400 select-none py-1"
                        >
                          {expandedNodes.has('albums') ? (
                            <ChevronDown size={14} className="text-emerald-400" />
                          ) : (
                            <ChevronRight size={14} className="text-[var(--text-muted)]" />
                          )}
                          <Disc size={15} className="text-emerald-400" />
                          <span>Album Phòng Thu ({targetDetail.albums.length} album)</span>
                        </div>

                        {expandedNodes.has('albums') && (
                          <div className="pl-4 border-l border-white/10 space-y-3 ml-2">
                            {albumsWithTracks.map(({ album, tracks: albumTracks }) => {
                              const isExpanded = expandedNodes.has(`album_${album.id}`);
                              const isAllSelected =
                                albumTracks.length > 0 &&
                                albumTracks.every((t) => selectedTrackIds.has(t.id));

                              return (
                                <div
                                  key={album.id}
                                  className="p-3 rounded-xl border border-[var(--border)] bg-black/25 space-y-2"
                                >
                                  <div className="flex items-center justify-between">
                                    <div
                                      onClick={() => toggleNode(`album_${album.id}`)}
                                      className="flex items-center gap-2 font-semibold text-xs text-white cursor-pointer select-none"
                                    >
                                      {isExpanded ? (
                                        <FolderOpen size={14} className="text-amber-400" />
                                      ) : (
                                        <Folder size={14} className="text-amber-400" />
                                      )}
                                      <span>{album.title}</span>
                                      {album.year && (
                                        <span className="text-[10.5px] text-[var(--text-muted)]">
                                          ({album.year})
                                        </span>
                                      )}
                                      <span className="text-[10.5px] text-[var(--text-muted)] ml-1">
                                        • {albumTracks.length} bài
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => toggleSelectAlbumTracks(albumTracks)}
                                        className="text-[10.5px] font-medium text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] transition-colors cursor-pointer"
                                      >
                                        {isAllSelected ? 'Bỏ chọn album' : 'Chọn cả album'}
                                      </button>
                                    </div>
                                  </div>

                                  {/* Danh sách bài hát trong album */}
                                  {isExpanded && (
                                    <div className="space-y-1 pt-1.5 border-t border-white/[0.06]">
                                      {albumTracks.map((t) => (
                                        <TrackRowItem
                                          key={t.id}
                                          track={t}
                                          isSelected={selectedTrackIds.has(t.id)}
                                          onToggleSelect={() => toggleTrackSelection(t.id)}
                                          onQuickMove={() => handleQuickMoveTrack(t.id)}
                                          onQuickDelete={() => handleQuickDeleteTrack(t.id)}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* NHÁNH 2: SINGLES & ĐĨA ĐƠN LẺ */}
                    {singlesTracks.length > 0 && (
                      <div className="space-y-2.5">
                        <div
                          onClick={() => toggleNode('singles')}
                          className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] cursor-pointer hover:text-emerald-400 select-none py-1"
                        >
                          {expandedNodes.has('singles') ? (
                            <ChevronDown size={14} className="text-emerald-400" />
                          ) : (
                            <ChevronRight size={14} className="text-[var(--text-muted)]" />
                          )}
                          <Music size={14} className="text-emerald-400" />
                          <span>Đĩa Đơn &amp; Bài Hát Lẻ ({singlesTracks.length} bài)</span>
                        </div>

                        {expandedNodes.has('singles') && (
                          <div className="pl-4 border-l border-white/10 space-y-1 ml-2">
                            {singlesTracks.map((t) => (
                              <TrackRowItem
                                key={t.id}
                                track={t}
                                isSelected={selectedTrackIds.has(t.id)}
                                onToggleSelect={() => toggleTrackSelection(t.id)}
                                onQuickMove={() => handleQuickMoveTrack(t.id)}
                                onQuickDelete={() => handleQuickDeleteTrack(t.id)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* NHÁNH 3: CÁC NGHỆ SĨ NGUỒN ĐANG CHỌN GỘP (MERGE PREVIEW BRANCHES) */}
                    {selectedSources.size > 0 && (
                      <div className="space-y-2.5 pt-2">
                        <div
                          onClick={() => toggleNode('sources')}
                          className="flex items-center gap-2 text-xs font-bold text-amber-300 cursor-pointer select-none py-1"
                        >
                          {expandedNodes.has('sources') ? (
                            <ChevronDown size={14} className="text-amber-400" />
                          ) : (
                            <ChevronRight size={14} className="text-amber-400" />
                          )}
                          <GitMerge size={14} className="text-amber-400" />
                          <span>
                            Nhánh Gộp Nguồn ➔ Hợp nhất vào &quot;{targetDetail.name}&quot; ({selectedSources.size} ca sĩ, {totalSourceTracks} bài)
                          </span>
                        </div>

                        {expandedNodes.has('sources') && (
                          <div className="pl-4 border-l-2 border-dashed border-amber-500/40 space-y-3 ml-2">
                            {sourceDetailsWithTracks.map((src) => {
                              const isExpanded = expandedNodes.has(`source_${src.name}`);

                              return (
                                <div
                                  key={src.name}
                                  className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.05] space-y-2"
                                >
                                  <div className="flex items-center justify-between">
                                    <div
                                      onClick={() => toggleNode(`source_${src.name}`)}
                                      className="flex items-center gap-2 font-bold text-xs text-amber-300 cursor-pointer select-none"
                                    >
                                      {isExpanded ? (
                                        <ChevronDown size={13} />
                                      ) : (
                                        <ChevronRight size={13} />
                                      )}
                                      <span>Nghệ sĩ nguồn: {src.name}</span>
                                      <span className="text-[10.5px] text-amber-200/70 font-normal">
                                        ({src.trackCount} bài)
                                      </span>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => toggleSource(src.name)}
                                      className="text-xs text-amber-400 hover:text-rose-400 font-semibold cursor-pointer px-2 py-0.5 rounded hover:bg-amber-500/10 transition-colors"
                                      title="Bỏ nghệ sĩ này khỏi danh sách gộp"
                                    >
                                      Bỏ gộp
                                    </button>
                                  </div>

                                  {/* Danh sách bài hát của nguồn */}
                                  {isExpanded && (
                                    <div className="space-y-1 pt-1.5 border-t border-amber-500/20">
                                      {src.filteredTracks.map((t) => (
                                        <TrackRowItem
                                          key={t.id}
                                          track={t}
                                          badgeText={`từ: ${src.name}`}
                                          isSelected={selectedTrackIds.has(t.id)}
                                          onToggleSelect={() => toggleTrackSelection(t.id)}
                                          onQuickMove={() => handleQuickMoveTrack(t.id)}
                                          onQuickDelete={() => handleQuickDeleteTrack(t.id)}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ======================================================== */}
          {/* CỘT 3 (PHẢI - 380px): BẢNG ĐIỀU KHIỂN TÁC VỤ ĐA NĂNG     */}
          {/* ======================================================== */}
          <div className="w-96 shrink-0 flex flex-col bg-[var(--bg-subtle)]/50 overflow-hidden">
            {/* Tab chuyển đổi tác vụ */}
            <div className="p-3.5 border-b border-[var(--border)]">
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-black/40 rounded-xl border border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setActiveActionTab('merge')}
                  className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeActionTab === 'merge'
                      ? 'bg-emerald-500 text-black shadow-md'
                      : 'text-[var(--text-secondary)] hover:text-white'
                  }`}
                >
                  <GitMerge size={13} />
                  <span>Gộp</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveActionTab('move')}
                  className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeActionTab === 'move'
                      ? 'bg-blue-500 text-white shadow-md'
                      : 'text-[var(--text-secondary)] hover:text-white'
                  }`}
                >
                  <MoveRight size={13} />
                  <span>Chuyển</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveActionTab('delete')}
                  className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeActionTab === 'delete'
                      ? 'bg-rose-500 text-white shadow-md'
                      : 'text-[var(--text-secondary)] hover:text-white'
                  }`}
                >
                  <Trash2 size={13} />
                  <span>Xóa</span>
                </button>
              </div>
            </div>

            {/* NỘI DUNG TỪNG TAB TÁC VỤ */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {/* ----------------- TAB 1: GỘP NGHỆ SĨ ----------------- */}
              {activeActionTab === 'merge' && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                      <GitMerge size={15} className="text-emerald-400" />
                      <span>Gộp Các Biến Thể Nghệ Sĩ</span>
                    </span>
                    <p className="text-[11.5px] text-[var(--text-muted)] m-0 leading-relaxed">
                      Tất cả bài hát của các nghệ sĩ nguồn sẽ được quy tụ về nghệ sĩ đích &quot;<strong>{targetArtist}</strong>&quot;. Hệ thống sẽ lưu alias và tự động đồng bộ Cloudflare R2.
                    </p>
                  </div>

                  {/* Danh sách nghệ sĩ nguồn đang chọn */}
                  <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
                      <span>Nghệ sĩ nguồn ({selectedSources.size}):</span>
                      <span className="text-amber-400 font-bold">{totalSourceTracks} bài</span>
                    </div>

                    {selectedSources.size === 0 ? (
                      <div className="text-center py-4 text-xs text-[var(--text-muted)]">
                        Chưa chọn nghệ sĩ nguồn nào. Bấm biểu tượng <GitMerge size={12} className="inline text-amber-400" /> ở danh mục bên trái hoặc chọn gợi ý bên dưới.
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                        {Array.from(selectedSources).map((src) => (
                          <span
                            key={src}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-medium"
                          >
                            <span>{src}</span>
                            <button
                              type="button"
                              onClick={() => toggleSource(src)}
                              className="text-amber-400 hover:text-rose-400 ml-0.5 cursor-pointer"
                            >
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Khối gợi ý thông minh */}
                  {suggestedSources.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                        <Sparkles size={13} />
                        <span>Gợi ý tên gần giống ({suggestedSources.length})</span>
                      </div>
                      <p className="text-[11px] text-amber-200/80 m-0 leading-tight">
                        Nhấp vào tên để thêm vào danh sách gộp:
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {suggestedSources.map((s) => {
                          const isPicked = selectedSources.has(s.name);
                          return (
                            <button
                              key={s.name}
                              type="button"
                              onClick={() => toggleSource(s.name)}
                              className={`text-[11px] px-2 py-0.5 rounded-md font-medium border transition-colors cursor-pointer ${
                                isPicked
                                  ? 'bg-amber-500 text-black border-amber-400 font-bold'
                                  : 'bg-black/30 border-amber-500/30 text-amber-200 hover:bg-amber-500/20'
                              }`}
                            >
                              {isPicked ? '✓ ' : '+ '}
                              {s.name} ({s.trackCount} bài)
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Bảng tổng kết số liệu */}
                  <div className="p-3.5 rounded-xl border border-[var(--border)] bg-black/20 space-y-1.5 text-xs">
                    <div className="flex justify-between text-[var(--text-muted)]">
                      <span>Nghệ sĩ đích:</span>
                      <strong className="text-white truncate max-w-[180px]">{targetArtist}</strong>
                    </div>
                    <div className="flex justify-between text-[var(--text-muted)]">
                      <span>Số bài hiện tại:</span>
                      <span className="text-white font-mono">{targetDetail?.trackCount || 0}</span>
                    </div>
                    <div className="flex justify-between text-[var(--text-muted)]">
                      <span>Số bài nhận thêm:</span>
                      <span className="text-amber-400 font-mono">+{totalSourceTracks}</span>
                    </div>
                    <div className="flex justify-between font-bold text-emerald-400 pt-1 border-t border-white/[0.08]">
                      <span>Tổng sau khi gộp:</span>
                      <span className="font-mono">{totalAfterMerge} bài hát</span>
                    </div>
                  </div>

                  {/* Nút hành động Gộp */}
                  <Button
                    variant="primary"
                    onClick={handleMergeSubmit}
                    disabled={isLoading || selectedSources.size === 0}
                    className="w-full py-2.5 h-auto text-xs font-bold gap-2 bg-emerald-500 hover:bg-emerald-400 text-black shadow-md"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Đang xử lý gộp &amp; đồng bộ R2...</span>
                      </>
                    ) : (
                      <>
                        <GitMerge size={14} />
                        <span>Thực thi Gộp {selectedSources.size} Nghệ Sĩ</span>
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* ----------------- TAB 2: CHUYỂN BÀI HÁT ----------------- */}
              {activeActionTab === 'move' && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                      <MoveRight size={15} className="text-blue-400" />
                      <span>Chuyển Bài Hát Sang Ca Sĩ Khác</span>
                    </span>
                    <p className="text-[11.5px] text-[var(--text-muted)] m-0 leading-relaxed">
                      Chuyển các bài hát đã tick chọn trong cây sang một ca sĩ mới. Mã hash <code>track.id</code> được bảo toàn nguyên vẹn 100%.
                    </p>
                  </div>

                  {/* Thông tin số bài đã chọn */}
                  <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-500/[0.08] flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-blue-300">
                        {selectedTrackIds.size} bài hát đã chọn
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        Tick chọn bài hát trong cây để thêm vào
                      </div>
                    </div>
                    {selectedTrackIds.size > 0 && (
                      <button
                        type="button"
                        onClick={deselectAllTracks}
                        className="text-xs text-blue-400 hover:text-white font-medium cursor-pointer"
                      >
                        Bỏ chọn
                      </button>
                    )}
                  </div>

                  {/* Chọn hoặc nhập nghệ sĩ nhận */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--text-secondary)]">
                      Nghệ sĩ nhận bài hát:
                    </label>
                    <input
                      type="text"
                      list="move-artists-datalist"
                      value={moveTargetArtist}
                      onChange={(e) => setMoveTargetArtist(e.target.value)}
                      placeholder="Nhập hoặc chọn tên nghệ sĩ nhận..."
                      className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
                    />
                    <datalist id="move-artists-datalist">
                      {artists.map((a) => (
                        <option key={a.name} value={a.name} />
                      ))}
                    </datalist>
                    <p className="text-[10.5px] text-[var(--text-muted)] m-0">
                      Gõ tên mới để tạo ca sĩ mới, hoặc chọn từ danh sách có sẵn.
                    </p>
                  </div>

                  {/* Chọn hoặc nhập album nhận */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--text-secondary)]">
                      Album nhận (tùy chọn):
                    </label>
                    <input
                      type="text"
                      value={moveTargetAlbum}
                      onChange={(e) => setMoveTargetAlbum(e.target.value)}
                      placeholder="Để trống nếu muốn giữ nguyên album hiện tại"
                      className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>

                  {/* Nút hành động Chuyển */}
                  <Button
                    variant="primary"
                    onClick={handleMoveTracksSubmit}
                    disabled={isLoading || selectedTrackIds.size === 0 || !moveTargetArtist.trim()}
                    className="w-full py-2.5 h-auto text-xs font-bold gap-2 bg-blue-500 hover:bg-blue-400 text-white shadow-md cursor-pointer"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Đang chuyển bài hát...</span>
                      </>
                    ) : (
                      <>
                        <MoveRight size={14} />
                        <span>Chuyển {selectedTrackIds.size} Bài Hát Sang &quot;{moveTargetArtist || '...'}&quot;</span>
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* ----------------- TAB 3: XÓA & DỌN DẸP ----------------- */}
              {activeActionTab === 'delete' && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                      <Trash2 size={15} />
                      <span>Xóa Vĩnh Viễn Bài Hát</span>
                    </span>
                    <p className="text-[11.5px] text-[var(--text-muted)] m-0 leading-relaxed">
                      Xóa hoàn toàn các bài hát đã chọn khỏi cơ sở dữ liệu thư viện. Hỗ trợ dọn dẹp sạch sẽ tệp trên đĩa cứng và trên Cloudflare R2.
                    </p>
                  </div>

                  {/* Thông tin số bài đã chọn */}
                  <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/[0.08] flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-rose-300">
                        {selectedTrackIds.size} bài hát đã chọn để xóa
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        Tick chọn bài hát trong cây để đánh dấu xóa
                      </div>
                    </div>
                  </div>

                  {/* Checkbox tùy chọn xóa */}
                  <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] space-y-3">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deleteLocal}
                        onChange={(e) => setDeleteLocal(e.target.checked)}
                        className="mt-0.5 rounded border-zinc-700 text-rose-500 focus:ring-rose-500"
                      />
                      <div>
                        <div className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                          <HardDrive size={13} className="text-blue-400" />
                          <span>Xóa tệp âm thanh trên đĩa cứng (Local)</span>
                        </div>
                        <p className="text-[10.5px] text-[var(--text-muted)] m-0 mt-0.5 leading-tight">
                          Xóa file nhạc gốc, ảnh bìa, file lời .lrc và dọn thư mục cha nếu trống.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deleteFromR2}
                        onChange={(e) => setDeleteFromR2(e.target.checked)}
                        className="mt-0.5 rounded border-zinc-700 text-rose-500 focus:ring-rose-500"
                      />
                      <div>
                        <div className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                          <Cloud size={13} className="text-emerald-400" />
                          <span>Xóa file bài hát trên Cloudflare R2</span>
                        </div>
                        <p className="text-[10.5px] text-[var(--text-muted)] m-0 mt-0.5 leading-tight">
                          Xóa object nhạc và ảnh bìa trên bucket Cloudflare R2.
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Cảnh báo an toàn */}
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-2.5">
                    <AlertTriangle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-rose-300 m-0 leading-relaxed">
                      Thao tác xóa vĩnh viễn không thể hoàn tác. Vui lòng kiểm tra kỹ danh sách bài hát trước khi xác nhận.
                    </p>
                  </div>

                  {/* Nút mở hộp thoại xác nhận xóa */}
                  <Button
                    variant="danger"
                    onClick={() => setIsConfirmDeleteOpen(true)}
                    disabled={isLoading || selectedTrackIds.size === 0 || (!deleteLocal && !deleteFromR2)}
                    className="w-full py-2.5 h-auto text-xs font-bold gap-2 bg-rose-600 hover:bg-rose-500 text-white shadow-md cursor-pointer"
                  >
                    <Trash2 size={14} />
                    <span>Xóa Vĩnh Viễn {selectedTrackIds.size} Bài Hát</span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MODAL XÁC NHẬN XÓA NGUY HIỂM 2 BƯỚC */}
        {isConfirmDeleteOpen && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-100">
            <div className="w-full max-w-md p-6 rounded-2xl border border-rose-500/40 bg-zinc-950 shadow-2xl space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
                <AlertTriangle size={24} />
              </div>

              <div className="text-center space-y-1.5">
                <h4 className="text-base font-extrabold text-white">
                  Xác nhận xóa {selectedTrackIds.size} bài hát?
                </h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Các bài hát đã chọn sẽ bị xóa vĩnh viễn{' '}
                  {deleteLocal && deleteFromR2
                    ? 'cả trên ổ cứng Local và Cloudflare R2'
                    : deleteLocal
                    ? 'trên ổ cứng Local'
                    : 'trên Cloudflare R2'}
                  . Bạn có chắc chắn muốn thực hiện?
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => setIsConfirmDeleteOpen(false)}
                  disabled={isLoading}
                  className="flex-1 py-2 text-xs font-semibold"
                >
                  Hủy bỏ
                </Button>
                <Button
                  variant="danger"
                  onClick={handleDeleteTracksSubmit}
                  disabled={isLoading}
                  className="flex-1 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white gap-1.5"
                >
                  {isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  <span>Xác nhận xóa</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

/**
 * Hàng bài hát trong sơ đồ cây (Node lá)
 */
interface TrackRowItemProps {
  track: ArtistTrack;
  badgeText?: string;
  isSelected: boolean;
  onToggleSelect: () => void;
  onQuickMove: () => void;
  onQuickDelete: () => void;
}

const TrackRowItem = React.memo<TrackRowItemProps>(({
  track,
  badgeText,
  isSelected,
  onToggleSelect,
  onQuickMove,
  onQuickDelete,
}) => {
  return (
    <div
      onClick={onToggleSelect}
      className={`group px-3 py-1.5 rounded-lg flex items-center justify-between gap-3 transition-all cursor-pointer border ${
        isSelected
          ? 'bg-blue-500/15 border-blue-500/40 text-white'
          : 'hover:bg-white/[0.04] border-transparent text-[var(--text-secondary)]'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          className="text-zinc-400 hover:text-white cursor-pointer"
        >
          {isSelected ? (
            <CheckSquare size={13} className="text-blue-400" />
          ) : (
            <Square size={13} className="opacity-50 group-hover:opacity-100" />
          )}
        </button>

        <span className="text-xs font-medium truncate text-[var(--text-primary)]">
          {track.title}
        </span>

        {badgeText && (
          <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold shrink-0">
            {badgeText}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] text-[var(--text-muted)] font-mono">
          {formatDuration(track.duration)}
        </span>

        {/* Nút hành động nhanh xuất hiện khi hover */}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onQuickMove();
            }}
            className="p-1 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500 hover:text-white transition-colors cursor-pointer"
            title="Chuyển bài hát này sang ca sĩ khác"
          >
            <MoveRight size={11} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onQuickDelete();
            }}
            className="p-1 rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer"
            title="Xóa bài hát này (Local / R2)"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
});
TrackRowItem.displayName = 'TrackRowItem';
