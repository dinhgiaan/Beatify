import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  CheckCircle2,
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

export const ArtistMergeDialog: React.FC<ArtistMergeDialogProps> = ({
  isOpen,
  onClose,
  artists,
  initialTargetArtist,
  onSuccess,
}) => {
  // Nghệ sĩ đích đang xem / chọn
  const [targetArtist, setTargetArtist] = useState(initialTargetArtist || '');
  // Các nghệ sĩ nguồn muốn gộp
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  // Các bài hát đang được tích chọn trong sơ đồ cây
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());

  // Tìm kiếm ở cột trái
  const [artistSearch, setArtistSearch] = useState('');
  // Bộ lọc cột trái: all | suggestions | selected | popular
  const [artistFilter, setArtistFilter] = useState<'all' | 'suggestions' | 'selected' | 'popular'>('all');

  // Lọc bài hát trong cây ở cột giữa
  const [treeSearch, setTreeSearch] = useState('');

  // Trạng thái mở rộng các node trong cây
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set(['root', 'albums', 'singles', 'sources'])
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
  }, [initialTargetArtist, artists, targetArtist]);

  // Chi tiết nghệ sĩ đích hiện tại
  const targetDetail = useMemo(() => {
    return artists.find((a) => a.name === targetArtist) || null;
  }, [artists, targetArtist]);

  // Gợi ý thông minh: các nghệ sĩ có tên tương tự với targetArtist
  const suggestedSources = useMemo(() => {
    if (!targetArtist) return [];
    const normTarget = normalize(targetArtist);
    return artists.filter(
      (a) =>
        a.name !== targetArtist &&
        (normalize(a.name) === normTarget ||
          normalize(a.name).includes(normTarget) ||
          normTarget.includes(normalize(a.name)))
    );
  }, [artists, targetArtist]);

  // Danh sách nghệ sĩ lọc ở cột trái
  const filteredArtists = useMemo(() => {
    const normSearch = normalize(artistSearch);
    return artists.filter((a) => {
      if (normSearch && !normalize(a.name).includes(normSearch)) {
        return false;
      }
      if (artistFilter === 'suggestions') {
        return suggestedSources.some((s) => s.name === a.name);
      }
      if (artistFilter === 'selected') {
        return selectedSources.has(a.name) || a.name === targetArtist;
      }
      if (artistFilter === 'popular') {
        return a.trackCount >= 4;
      }
      return true;
    });
  }, [artists, artistSearch, artistFilter, suggestedSources, selectedSources, targetArtist]);

  // Danh sách chi tiết các nghệ sĩ nguồn đã chọn
  const sourceDetails = useMemo(() => {
    return artists.filter((a) => selectedSources.has(a.name));
  }, [artists, selectedSources]);

  // Tổng số bài hát từ các nguồn gộp
  const totalSourceTracks = useMemo(() => {
    return sourceDetails.reduce((acc, a) => acc + a.trackCount, 0);
  }, [sourceDetails]);

  // Tổng số bài hát của nghệ sĩ đích sau khi gộp
  const totalAfterMerge = (targetDetail?.trackCount || 0) + totalSourceTracks;

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

  // Toggle chọn nghệ sĩ nguồn để gộp
  const toggleSource = (name: string) => {
    if (name === targetArtist) return;
    const next = new Set(selectedSources);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setSelectedSources(next);
  };

  // Toggle chọn bài hát trong cây
  const toggleTrackSelection = (trackId: string) => {
    const next = new Set(selectedTrackIds);
    if (next.has(trackId)) {
      next.delete(trackId);
    } else {
      next.add(trackId);
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
    <AnimatePresence>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 10 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="w-[96vw] max-w-7xl h-[90vh] max-h-[92vh] flex flex-col rounded-3xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden select-none"
        >
          {/* HEADER CHÍNH */}
          <div className="flex items-center justify-between px-6 py-3.5 border-b border-[var(--border)] bg-[var(--bg-subtle)] shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <GitMerge size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-[15px] text-[var(--text-primary)]">
                    Studio Điều Phối Nghệ Sĩ &amp; Sơ Đồ Cây Thư Viện
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Live Sync R2
                  </span>
                </div>
                <p className="text-[11.5px] text-[var(--text-muted)] m-0">
                  Gộp biến thể nghệ sĩ, duyệt sơ đồ cây bài hát/album, chuyển bài hát sang ca sĩ khác &amp; xóa sạch trên R2 / Local
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                title="Đóng cửa sổ"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* NỘI DUNG 3 CỘT LAYOUT NGANG (HORIZONTAL SPLIT VIEW) */}
          <div className="flex-1 min-h-0 flex divide-x divide-[var(--border)] bg-[var(--bg-surface)]">
            {/* ======================================================== */}
            {/* CỘT 1 (TRÁI - 260px - 280px): DANH MỤC & TÌM KIẾM NGHỆ SĨ */}
            {/* ======================================================== */}
            <div className="w-72 shrink-0 flex flex-col bg-[var(--bg-subtle)]/40 overflow-hidden">
              <div className="p-3 border-b border-[var(--border)] space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)]">
                  <span className="flex items-center gap-1.5">
                    <Users size={14} className="text-emerald-400" />
                    <span>Nghệ Sĩ ({artists.length})</span>
                  </span>
                  {selectedSources.size > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
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
                    onChange={(e) => setArtistSearch(e.target.value)}
                    placeholder="Tìm tên ca sĩ..."
                    className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                  {artistSearch && (
                    <button
                      type="button"
                      onClick={() => setArtistSearch('')}
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
                    { key: 'selected', label: 'Đã chọn' },
                    { key: 'popular', label: 'Nhiều bài' },
                  ].map((flt) => (
                    <button
                      key={flt.key}
                      type="button"
                      onClick={() => setArtistFilter(flt.key as typeof artistFilter)}
                      className={`text-[10px] px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                        artistFilter === flt.key
                          ? 'bg-emerald-500 text-black font-bold'
                          : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border)]'
                      }`}
                    >
                      {flt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Danh sách cuộn nghệ sĩ */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filteredArtists.length === 0 ? (
                  <div className="text-center py-8 text-[11.5px] text-[var(--text-muted)]">
                    Không tìm thấy nghệ sĩ
                  </div>
                ) : (
                  filteredArtists.map((a) => {
                    const isTarget = a.name === targetArtist;
                    const isSource = selectedSources.has(a.name);
                    const isSuggested = suggestedSources.some((s) => s.name === a.name);

                    return (
                      <div
                        key={a.name}
                        onClick={() => {
                          setTargetArtist(a.name);
                        }}
                        className={`group px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 transition-all cursor-pointer border ${
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
                            {a.avatarUrl ? (
                              <img
                                src={a.avatarUrl}
                                alt={a.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.currentTarget as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <Users size={12} className="text-[var(--text-muted)]" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-[12px] font-bold truncate ${
                                  isTarget
                                    ? 'text-emerald-400'
                                    : isSource
                                    ? 'text-amber-300'
                                    : 'text-[var(--text-primary)]'
                                }`}
                              >
                                {a.name}
                              </span>
                              {isSuggested && !isTarget && !isSource && (
                                <span
                                  className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                                  title="Tên tương tự, có thể gộp"
                                />
                              )}
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1.5">
                              <span>{a.trackCount} bài</span>
                              {a.albumCount > 0 && <span>• {a.albumCount} album</span>}
                            </div>
                          </div>
                        </div>

                        {/* Nút thao tác nhanh: chọn gộp nguồn */}
                        {!isTarget && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSource(a.name);
                            }}
                            className={`p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              isSource
                                ? 'bg-amber-500 text-black hover:bg-amber-400'
                                : 'text-[var(--text-muted)] hover:text-amber-300 hover:bg-amber-500/20'
                            }`}
                            title={isSource ? 'Bỏ chọn gộp nguồn' : 'Chọn làm nghệ sĩ nguồn để gộp vào đích'}
                          >
                            <GitMerge size={12} />
                          </button>
                        )}
                        {isTarget && (
                          <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-emerald-500 text-black font-extrabold uppercase shrink-0">
                            Đích
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* ======================================================== */}
            {/* CỘT 2 (GIỮA - RỘNG 48% - 52%): SƠ ĐỒ CÂY TRỰC QUAN       */}
            {/* ======================================================== */}
            <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-surface)] overflow-hidden">
              {/* Toolbar sơ đồ cây */}
              <div className="p-3 border-b border-[var(--border)] flex items-center justify-between gap-3 bg-[var(--bg-subtle)]/30 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                    <Layers size={14} className="text-emerald-400" />
                    <span>Sơ đồ Cây Phân Cấp Thư Viện</span>
                  </span>
                  <div className="flex items-center gap-1 text-[10.5px]">
                    <button
                      type="button"
                      onClick={expandAll}
                      className="px-2 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-white transition-colors"
                    >
                      Mở tất cả
                    </button>
                    <button
                      type="button"
                      onClick={collapseAll}
                      className="px-2 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-white transition-colors"
                    >
                      Thu gọn
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Ô lọc bài hát trong cây */}
                  <div className="relative w-44">
                    <Search size={11} className="absolute left-2 top-2 text-[var(--text-muted)]" />
                    <input
                      type="text"
                      value={treeSearch}
                      onChange={(e) => setTreeSearch(e.target.value)}
                      placeholder="Lọc bài trong cây..."
                      className="w-full pl-6 pr-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-surface)] text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {selectedTrackIds.size > 0 && (
                    <button
                      type="button"
                      onClick={deselectAllTracks}
                      className="text-[10.5px] text-[var(--text-muted)] hover:text-rose-400 font-medium cursor-pointer"
                    >
                      Bỏ chọn ({selectedTrackIds.size})
                    </button>
                  )}
                </div>
              </div>

              {/* KHÔNG GIAN SƠ ĐỒ CÂY CUỘN */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                {!targetDetail ? (
                  <div className="text-center py-20 text-zinc-500">
                    Vui lòng chọn một nghệ sĩ từ danh sách bên trái
                  </div>
                ) : (
                  <div className="space-y-4 font-sans text-xs">
                    {/* NODE GỐC (ROOT NODE) - NGHỆ SĨ ĐÍCH */}
                    <div className="p-3.5 rounded-2xl border-2 border-emerald-500/50 bg-emerald-500/[0.08] shadow-lg flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full overflow-hidden bg-black/60 border-2 border-emerald-500 shadow-md flex items-center justify-center shrink-0">
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
                            <Users size={16} className="text-emerald-400" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-extrabold text-white tracking-wide">
                              {targetDetail.name}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500 text-black uppercase">
                              Nghệ Sĩ Đích
                            </span>
                          </div>
                          <div className="text-[11px] text-emerald-300/80 mt-0.5 flex items-center gap-2">
                            <span>Hiện có: {targetDetail.trackCount} bài hát</span>
                            {selectedSources.size > 0 && (
                              <span className="font-bold text-amber-300">
                                ➔ Sau gộp: {totalAfterMerge} bài (+{totalSourceTracks})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={selectAllTargetTracks}
                          className="text-[10.5px] py-1 px-2.5 h-auto font-semibold gap-1 text-[var(--text-secondary)] hover:text-white"
                        >
                          <CheckSquare size={12} />
                          <span>Chọn tất cả {targetDetail.trackCount} bài</span>
                        </Button>
                      </div>
                    </div>

                    {/* SƠ ĐỒ CÂY CẤU TRÚC: ALBUMS, SINGLES & NGUỒN GỘP */}
                    <div className="pl-4 border-l-2 border-emerald-500/30 space-y-3.5 ml-5">
                      {/* NHÁNH 1: CÁC ALBUM PHÒNG THU CỦA NGHỆ SĨ ĐÍCH */}
                      {targetDetail.albums.length > 0 && (
                        <div className="space-y-2">
                          <div
                            onClick={() => toggleNode('albums')}
                            className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] cursor-pointer hover:text-emerald-400 select-none py-1"
                          >
                            {expandedNodes.has('albums') ? (
                              <ChevronDown size={14} className="text-emerald-400" />
                            ) : (
                              <ChevronRight size={14} className="text-[var(--text-muted)]" />
                            )}
                            <Disc size={14} className="text-emerald-400" />
                            <span>Album Phòng Thu ({targetDetail.albums.length} album)</span>
                          </div>

                          {expandedNodes.has('albums') && (
                            <div className="pl-4 border-l border-white/10 space-y-3 ml-2">
                              {targetDetail.albums.map((album) => {
                                const albumTracks = targetDetail.tracks.filter(
                                  (t) =>
                                    (t.albumId === album.id || t.album === album.title) &&
                                    (!treeSearch.trim() ||
                                      normalize(t.title).includes(normalize(treeSearch)))
                                );
                                if (treeSearch && albumTracks.length === 0) return null;
                                const isExpanded = expandedNodes.has(`album_${album.id}`);

                                return (
                                  <div
                                    key={album.id}
                                    className="p-2.5 rounded-xl border border-[var(--border)] bg-black/20 space-y-2"
                                  >
                                    <div
                                      onClick={() => toggleNode(`album_${album.id}`)}
                                      className="flex items-center justify-between cursor-pointer"
                                    >
                                      <div className="flex items-center gap-2 font-semibold text-[11.5px] text-white">
                                        {isExpanded ? (
                                          <FolderOpen size={13} className="text-amber-400" />
                                        ) : (
                                          <Folder size={13} className="text-amber-400" />
                                        )}
                                        <span>{album.title}</span>
                                        {album.year && (
                                          <span className="text-[10px] text-[var(--text-muted)]">
                                            ({album.year})
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-[10.5px] text-[var(--text-muted)]">
                                        {albumTracks.length} bài
                                      </span>
                                    </div>

                                    {/* Danh sách bài hát trong album */}
                                    {isExpanded && (
                                      <div className="space-y-1 pt-1 border-t border-white/[0.06]">
                                        {albumTracks.map((t) => (
                                          <TrackRowItem
                                            key={t.id}
                                            track={t}
                                            isSelected={selectedTrackIds.has(t.id)}
                                            onToggleSelect={() => toggleTrackSelection(t.id)}
                                            onQuickMove={() => {
                                              setSelectedTrackIds(new Set([t.id]));
                                              setActiveActionTab('move');
                                            }}
                                            onQuickDelete={() => {
                                              setSelectedTrackIds(new Set([t.id]));
                                              setActiveActionTab('delete');
                                              setIsConfirmDeleteOpen(true);
                                            }}
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
                      {(() => {
                        const singlesTracks = targetDetail.tracks.filter(
                          (t) =>
                            (!t.albumId || t.album === 'Singles' || t.album === 'Single') &&
                            (!treeSearch.trim() || normalize(t.title).includes(normalize(treeSearch)))
                        );
                        if (singlesTracks.length === 0) return null;

                        return (
                          <div className="space-y-2">
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
                                    onQuickMove={() => {
                                      setSelectedTrackIds(new Set([t.id]));
                                      setActiveActionTab('move');
                                    }}
                                    onQuickDelete={() => {
                                      setSelectedTrackIds(new Set([t.id]));
                                      setActiveActionTab('delete');
                                      setIsConfirmDeleteOpen(true);
                                    }}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}

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
                              Nhánh Gộp Nguồn ➔ Sẽ hợp nhất vào &quot;{targetDetail.name}&quot; ({selectedSources.size} ca sĩ, {totalSourceTracks} bài)
                            </span>
                          </div>

                          {expandedNodes.has('sources') && (
                            <div className="pl-4 border-l-2 border-dashed border-amber-500/40 space-y-3 ml-2">
                              {sourceDetails.map((src) => {
                                const isExpanded = expandedNodes.has(`source_${src.name}`);
                                const srcTracks = src.tracks.filter(
                                  (t) =>
                                    !treeSearch.trim() ||
                                    normalize(t.title).includes(normalize(treeSearch))
                                );

                                return (
                                  <div
                                    key={src.name}
                                    className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.05] space-y-2"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div
                                        onClick={() => toggleNode(`source_${src.name}`)}
                                        className="flex items-center gap-2 font-bold text-xs text-amber-300 cursor-pointer"
                                      >
                                        {isExpanded ? (
                                          <ChevronDown size={13} />
                                        ) : (
                                          <ChevronRight size={13} />
                                        )}
                                        <span>Nghệ sĩ nguồn: {src.name}</span>
                                        <span className="text-[10px] text-amber-200/70 font-normal">
                                          ({src.trackCount} bài)
                                        </span>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => toggleSource(src.name)}
                                        className="text-[10.5px] text-amber-400 hover:text-rose-400 font-semibold cursor-pointer"
                                        title="Bỏ nghệ sĩ này khỏi danh sách gộp"
                                      >
                                        Bỏ gộp
                                      </button>
                                    </div>

                                    {/* Danh sách bài hát của nguồn */}
                                    {isExpanded && (
                                      <div className="space-y-1 pt-1 border-t border-amber-500/20">
                                        {srcTracks.map((t) => (
                                          <TrackRowItem
                                            key={t.id}
                                            track={t}
                                            badgeText={`từ: ${src.name}`}
                                            isSelected={selectedTrackIds.has(t.id)}
                                            onToggleSelect={() => toggleTrackSelection(t.id)}
                                            onQuickMove={() => {
                                              setSelectedTrackIds(new Set([t.id]));
                                              setActiveActionTab('move');
                                            }}
                                            onQuickDelete={() => {
                                              setSelectedTrackIds(new Set([t.id]));
                                              setActiveActionTab('delete');
                                              setIsConfirmDeleteOpen(true);
                                            }}
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
            {/* CỘT 3 (PHẢI - 320px - 340px): BẢNG ĐIỀU KHIỂN TÁC VỤ   */}
            {/* ======================================================== */}
            <div className="w-80 shrink-0 flex flex-col bg-[var(--bg-subtle)]/50 overflow-hidden">
              {/* Tab chuyển đổi tác vụ */}
              <div className="p-3 border-b border-[var(--border)]">
                <div className="grid grid-cols-3 gap-1 p-1 bg-black/30 rounded-xl border border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setActiveActionTab('merge')}
                    className={`py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      activeActionTab === 'merge'
                        ? 'bg-emerald-500 text-black shadow-md'
                        : 'text-[var(--text-secondary)] hover:text-white'
                    }`}
                  >
                    <GitMerge size={12} />
                    <span>Gộp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveActionTab('move')}
                    className={`py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      activeActionTab === 'move'
                        ? 'bg-blue-500 text-white shadow-md'
                        : 'text-[var(--text-secondary)] hover:text-white'
                    }`}
                  >
                    <MoveRight size={12} />
                    <span>Chuyển</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveActionTab('delete')}
                    className={`py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      activeActionTab === 'delete'
                        ? 'bg-rose-500 text-white shadow-md'
                        : 'text-[var(--text-secondary)] hover:text-white'
                    }`}
                  >
                    <Trash2 size={12} />
                    <span>Xóa</span>
                  </button>
                </div>
              </div>

              {/* NỘI DUNG TỪNG TAB TÁC VỤ */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* ----------------- TAB 1: GỘP NGHỆ SĨ ----------------- */}
                {activeActionTab === 'merge' && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <GitMerge size={14} className="text-emerald-400" />
                        <span>Gộp Các Biến Thể Nghệ Sĩ</span>
                      </span>
                      <p className="text-[11px] text-[var(--text-muted)] m-0 leading-relaxed">
                        Tất cả bài hát của các nghệ sĩ nguồn sẽ được quy tụ về &quot;{targetArtist}&quot;. Hệ thống sẽ lưu alias và cập nhật R2.
                      </p>
                    </div>

                    {/* Danh sách nghệ sĩ nguồn đang chọn */}
                    <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-secondary)]">
                        <span>Nghệ sĩ nguồn ({selectedSources.size}):</span>
                        <span className="text-amber-400 font-bold">{totalSourceTracks} bài</span>
                      </div>

                      {selectedSources.size === 0 ? (
                        <div className="text-center py-4 text-[11px] text-[var(--text-muted)]">
                          Chưa chọn nghệ sĩ nguồn nào. Bấm biểu tượng <GitMerge size={11} className="inline text-amber-400" /> ở cột trái hoặc chọn gợi ý bên dưới.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                          {Array.from(selectedSources).map((src) => (
                            <span
                              key={src}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-medium"
                            >
                              <span>{src}</span>
                              <button
                                type="button"
                                onClick={() => toggleSource(src)}
                                className="text-amber-400 hover:text-rose-400 ml-0.5 cursor-pointer"
                              >
                                <X size={10} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Khối gợi ý thông minh */}
                    {suggestedSources.length > 0 && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-amber-300">
                          <span className="flex items-center gap-1">
                            <Sparkles size={12} />
                            <span>Gợi ý tên gần giống ({suggestedSources.length})</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const next = new Set(selectedSources);
                              suggestedSources.forEach((s) => next.add(s.name));
                              setSelectedSources(next);
                            }}
                            className="text-[10px] text-amber-400 hover:underline cursor-pointer"
                          >
                            Chọn hết
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {suggestedSources.map((s) => {
                            const isSelected = selectedSources.has(s.name);
                            return (
                              <button
                                key={s.name}
                                type="button"
                                onClick={() => toggleSource(s.name)}
                                className={`text-[10.5px] px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-amber-500 text-black border-amber-500 font-bold'
                                    : 'bg-black/30 text-amber-200 border-amber-500/30 hover:border-amber-500/60'
                                }`}
                              >
                                {s.name} ({s.trackCount})
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Nút hành động Gộp */}
                    <Button
                      variant="primary"
                      size="md"
                      onClick={handleMergeSubmit}
                      disabled={isLoading || selectedSources.size === 0}
                      className="w-full justify-center gap-2 py-2.5 font-bold bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20 cursor-pointer"
                    >
                      {isLoading ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <GitMerge size={14} />
                      )}
                      <span>Gộp {selectedSources.size} nghệ sĩ vào {targetArtist}</span>
                    </Button>
                  </div>
                )}

                {/* ----------------- TAB 2: CHUYỂN BÀI HÁT ----------------- */}
                {activeActionTab === 'move' && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                        <MoveRight size={14} />
                        <span>Chuyển Bài Hát Sang Nghệ Sĩ Khác</span>
                      </span>
                      <p className="text-[11px] text-[var(--text-muted)] m-0 leading-relaxed">
                        Tích chọn các bài hát ở sơ đồ cây (giữa), sau đó chọn nghệ sĩ nhận để chuyển sang ngay lập tức.
                      </p>
                    </div>

                    {/* Thông tin số bài đang chọn */}
                    <div className="p-3 rounded-xl border border-blue-500/30 bg-blue-500/[0.06] flex items-center justify-between">
                      <span className="text-xs font-semibold text-blue-300">Bài hát đang chọn:</span>
                      <span className="text-xs font-extrabold text-blue-400 px-2 py-0.5 rounded-md bg-blue-500/20">
                        {selectedTrackIds.size} bài
                      </span>
                    </div>

                    {/* Chọn nghệ sĩ nhận */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-[var(--text-secondary)]">
                        Nghệ sĩ nhận (Đích đến):
                      </label>
                      <select
                        value={moveTargetArtist}
                        onChange={(e) => setMoveTargetArtist(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        <option value="">-- Chọn nghệ sĩ nhận --</option>
                        {artists.map((a) => (
                          <option key={a.name} value={a.name}>
                            {a.name} ({a.trackCount} bài)
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-[var(--text-muted)] m-0">
                        Hoặc nhập tên mới trực tiếp nếu muốn tạo ca sĩ mới.
                      </p>
                      <input
                        type="text"
                        value={moveTargetArtist}
                        onChange={(e) => setMoveTargetArtist(e.target.value)}
                        placeholder="Hoặc gõ tên nghệ sĩ mới..."
                        className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* Album mới (tuỳ chọn) */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-[var(--text-secondary)]">
                        Tên Album mới (Tùy chọn):
                      </label>
                      <input
                        type="text"
                        value={moveTargetAlbum}
                        onChange={(e) => setMoveTargetAlbum(e.target.value)}
                        placeholder="Để trống nếu giữ nguyên..."
                        className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* Nút thực hiện chuyển */}
                    <Button
                      variant="primary"
                      size="md"
                      onClick={handleMoveTracksSubmit}
                      disabled={isLoading || selectedTrackIds.size === 0 || !moveTargetArtist.trim()}
                      className="w-full justify-center gap-2 py-2.5 font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 cursor-pointer"
                    >
                      {isLoading ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <MoveRight size={14} />
                      )}
                      <span>Chuyển {selectedTrackIds.size} bài hát</span>
                    </Button>
                  </div>
                )}

                {/* ----------------- TAB 3: XÓA R2 & LOCAL ----------------- */}
                {activeActionTab === 'delete' && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                        <Trash2 size={14} />
                        <span>Xóa Bài Hát Trên R2 &amp; Local</span>
                      </span>
                      <p className="text-[11px] text-[var(--text-muted)] m-0 leading-relaxed">
                        Tích chọn bài hát cần xóa ở sơ đồ cây. Bạn có thể chọn xóa file trên máy tính và/hoặc trên Cloudflare R2.
                      </p>
                    </div>

                    {/* Thông tin số bài đang chọn */}
                    <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] flex items-center justify-between">
                      <span className="text-xs font-semibold text-rose-300">Bài hát sẽ xóa:</span>
                      <span className="text-xs font-extrabold text-rose-400 px-2 py-0.5 rounded-md bg-rose-500/20">
                        {selectedTrackIds.size} bài
                      </span>
                    </div>

                    {/* Checkbox tùy chọn xóa */}
                    <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] space-y-2.5">
                      <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={deleteLocal}
                          onChange={(e) => setDeleteLocal(e.target.checked)}
                          className="rounded border-[var(--border)] text-rose-500 focus:ring-rose-500"
                        />
                        <span className="flex items-center gap-1.5 font-medium">
                          <HardDrive size={13} className="text-zinc-400" />
                          <span>Xóa file gốc trên đĩa cứng (Local PC)</span>
                        </span>
                      </label>

                      <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={deleteFromR2}
                          onChange={(e) => setDeleteFromR2(e.target.checked)}
                          className="rounded border-[var(--border)] text-rose-500 focus:ring-rose-500"
                        />
                        <span className="flex items-center gap-1.5 font-medium">
                          <Cloud size={13} className="text-zinc-400" />
                          <span>Xóa tệp trên Cloudflare R2 (Audio, Bìa, Lời)</span>
                        </span>
                      </label>
                    </div>

                    {/* Nút mở xác nhận xóa */}
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => setIsConfirmDeleteOpen(true)}
                      disabled={isLoading || selectedTrackIds.size === 0 || (!deleteLocal && !deleteFromR2)}
                      className="w-full justify-center gap-2 py-2.5 font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-500/20 cursor-pointer"
                    >
                      <Trash2 size={14} />
                      <span>Xác nhận Xóa {selectedTrackIds.size} bài hát</span>
                    </Button>
                  </div>
                )}
              </div>

              {/* Footer cột phải: Tóm tắt trạng thái */}
              <div className="p-3 border-t border-[var(--border)] bg-black/30 text-[11px] text-[var(--text-muted)] flex items-center justify-between">
                <span>Trạng thái: Hoạt động</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 size={12} />
                  <span>Sẵn sàng</span>
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* MODAL XÁC NHẬN XÓA NGUY HIỂM */}
      {isConfirmDeleteOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-100">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-[var(--bg-surface)] p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-rose-400">
              <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-white">Xác nhận xóa vĩnh viễn?</h4>
                <p className="text-[11px] text-zinc-400 m-0">Hành động này không thể hoàn tác</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed m-0">
              Bạn có chắc chắn muốn xóa vĩnh viễn <strong className="text-white">{selectedTrackIds.size} bài hát</strong> đã chọn không?
            </p>

            <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-[11.5px] space-y-1.5 text-zinc-300">
              <div className="flex items-center gap-2">
                <HardDrive size={13} className={deleteLocal ? 'text-rose-400' : 'text-zinc-500'} />
                <span>Xóa đĩa cứng Local: {deleteLocal ? 'CÓ (Xóa file vĩnh viễn)' : 'KHÔNG'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Cloud size={13} className={deleteFromR2 ? 'text-rose-400' : 'text-zinc-500'} />
                <span>Xóa Cloudflare R2: {deleteFromR2 ? 'CÓ (Audio, Cover, Lyrics)' : 'KHÔNG'}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsConfirmDeleteOpen(false)}
                disabled={isLoading}
              >
                Hủy bỏ
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleDeleteTracksSubmit}
                disabled={isLoading}
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold gap-1.5"
              >
                {isLoading ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                <span>Xác nhận xóa ngay</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

/**
 * Component hiển thị từng dòng bài hát trong sơ đồ cây
 */
interface TrackRowItemProps {
  track: ArtistTrack;
  badgeText?: string;
  isSelected: boolean;
  onToggleSelect: () => void;
  onQuickMove: () => void;
  onQuickDelete: () => void;
}

const TrackRowItem: React.FC<TrackRowItemProps> = ({
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
      className={`group px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2.5 transition-all cursor-pointer border ${
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
          className="text-zinc-400 hover:text-white"
        >
          {isSelected ? (
            <CheckSquare size={13} className="text-blue-400" />
          ) : (
            <Square size={13} className="opacity-50 group-hover:opacity-100" />
          )}
        </button>

        <span className="text-[12px] font-medium truncate text-[var(--text-primary)]">
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
};
