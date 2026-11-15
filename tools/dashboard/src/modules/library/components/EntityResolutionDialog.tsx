import React, { useState, useEffect, useMemo } from 'react';
import {
  Wand2,
  X,
  CheckCircle2,
  AlertTriangle,
  Download,
  RefreshCw,
  ShieldCheck,
  Search,
  Sparkles,
  Cloud,
  Check,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../ui/atoms/Button';
import { Checkbox } from '../../../ui/atoms/Controls';
import { requestApi } from '../../../core/api-client';

export interface EntityCandidateItem {
  id: string;
  originalTitle: string;
  originalArtist: string;
  originalAlbum?: string;
  resolvedTitle: string;
  resolvedArtist: string;
  resolvedAlbum?: string;
  confidence: 'high' | 'medium' | 'low';
  confidenceReason: string;
  source: 'layer0' | 'layer1' | 'layer2' | 'layer3' | 'itunes' | 'fallback';
  isChanged: boolean;
  isInverted: boolean;
  isChannelAbsorbed: boolean;
  isProtected: boolean;
  diffNotice?: string;
  suggestedAction: 'safe_apply' | 'review_needed' | 'skip';
}

export interface PreviewStats {
  total: number;
  changed: number;
  invertedResolved: number;
  channelCleaned: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  protectedGroundTruth: number;
  safeApplyCount: number;
}

interface PreviewResponse {
  status: number;
  totalTracks: number;
  stats: PreviewStats;
  candidates: EntityCandidateItem[];
  csvReportPath: string;
}

interface ApplyResponse {
  status: number;
  success: boolean;
  appliedCount: number;
  skippedCount: number;
  backupPaths: {
    overrides: string;
    library: string;
  };
  syncedToR2?: boolean;
}

interface EntityResolutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: () => void;
}

type FilterTab = 'needs_fix' | 'all' | 'inverted' | 'channel_cleaned' | 'high_confidence' | 'protected';

export const EntityResolutionDialog: React.FC<EntityResolutionDialogProps> = ({
  open,
  onOpenChange,
  onApplied,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [enableItunes, setEnableItunes] = useState(true);
  const [syncToR2, setSyncToR2] = useState(false);
  const [stats, setStats] = useState<PreviewStats | null>(null);
  const [candidates, setCandidates] = useState<EntityCandidateItem[]>([]);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('needs_fix');

  // Load preview data when dialog opens
  useEffect(() => {
    if (open) {
      loadPreview();
    }
  }, [open, enableItunes]);

  const loadPreview = async () => {
    setIsLoading(true);
    try {
      const res = await requestApi<PreviewResponse>('/local-api/entity-resolution/preview', {
        method: 'POST',
        body: JSON.stringify({ forceItunes: enableItunes }),
      });
      setStats(res.stats);
      setCandidates(res.candidates);

      // Mặc định chọn các bài độ tin cậy cao cần sửa (không phải ground truth)
      const initialSelected = new Set<string>();
      for (const c of res.candidates) {
        if (c.isChanged && c.confidence === 'high' && !c.isProtected) {
          initialSelected.add(c.id);
        }
      }
      setSelectedTrackIds(initialSelected);
    } catch (err) {
      toast.error('Lỗi phân tích thực thể âm nhạc: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadCsv = async () => {
    try {
      const csvContent = await requestApi<string>('/local-api/entity-resolution/report');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ENTITY_RESOLUTION_PREVIEW_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Đã tải xuống báo cáo CSV xem trước (Dry-Run)!');
    } catch (err) {
      toast.error('Không thể tải file CSV: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleApplySelected = async (applyAllHigh: boolean = false) => {
    if (!applyAllHigh && selectedTrackIds.size === 0) {
      toast.warning('Chưa chọn bài hát nào để áp dụng!');
      return;
    }

    setIsApplying(true);
    try {
      const res = await requestApi<ApplyResponse>('/local-api/entity-resolution/apply', {
        method: 'POST',
        body: JSON.stringify({
          trackIds: applyAllHigh ? undefined : Array.from(selectedTrackIds),
          applyAllHighConfidence: applyAllHigh,
          syncToR2,
        }),
      });

      toast.success(
        `Đã chuẩn hóa thành công ${res.appliedCount} bài hát! Bản sao lưu tại ${res.backupPaths.overrides}`
      );
      if (res.syncedToR2) {
        toast.info('Đã đồng bộ thư viện mới lên Cloudflare R2!');
      }

      onApplied?.();
      onOpenChange(false);
    } catch (err) {
      toast.error('Lỗi khi áp dụng chuẩn hóa: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsApplying(false);
    }
  };

  // Toggle selection
  const toggleSelectTrack = (trackId: string) => {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  };

  // Filter candidates
  const filteredCandidates = useMemo(() => {
    return candidates.filter((item) => {
      // Tab filter
      if (filterTab === 'needs_fix' && !item.isChanged) return false;
      if (filterTab === 'inverted' && !item.isInverted) return false;
      if (filterTab === 'channel_cleaned' && !item.isChannelAbsorbed) return false;
      if (filterTab === 'high_confidence' && item.confidence !== 'high') return false;
      if (filterTab === 'protected' && !item.isProtected) return false;

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesOriginal =
          item.originalTitle.toLowerCase().includes(q) ||
          item.originalArtist.toLowerCase().includes(q);
        const matchesResolved =
          item.resolvedTitle.toLowerCase().includes(q) ||
          item.resolvedArtist.toLowerCase().includes(q);
        if (!matchesOriginal && !matchesResolved) return false;
      }

      return true;
    });
  }, [candidates, filterTab, searchTerm]);

  const handleSelectAllVisible = () => {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      for (const item of filteredCandidates) {
        if (!item.isProtected && item.isChanged && item.confidence === 'high') {
          next.add(item.id);
        }
      }
      return next;
    });
  };

  const handleDeselectAllVisible = () => {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      for (const item of filteredCandidates) {
        next.delete(item.id);
      }
      return next;
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-6xl max-h-[92vh] bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 select-none">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 shadow-xs">
              <Wand2 size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
                  Chuẩn hóa Thực thể Âm nhạc Đa Tầng (Multi-Layer Music Entity Resolution)
                </h3>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
                  v1.5 AI-Driven
                </span>
              </div>
              <p className="text-[11.5px] text-[var(--text-muted)] mt-0.5">
                Tự động sửa lỗi đảo vế (Tên bài ↔ Ca sĩ), loại bỏ tên kênh YouTube, chuẩn hóa Album và cộng tác nghệ sĩ an toàn.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Hero KPI Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 px-5 py-3 border-b border-[var(--border)] bg-black/20 text-xs">
          <div className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]/60">
            <div className="text-[11px] text-[var(--text-muted)]">Tổng bài hát</div>
            <div className="text-base font-bold text-[var(--text-primary)] mt-0.5">
              {stats ? stats.total : '...'}
            </div>
          </div>

          <div className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10">
            <div className="text-[11px] text-amber-300 font-medium flex items-center gap-1">
              <AlertTriangle size={12} /> Cần chuẩn hóa
            </div>
            <div className="text-base font-bold text-amber-400 mt-0.5">
              {stats ? stats.changed : '...'}
            </div>
          </div>

          <div className="p-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10">
            <div className="text-[11px] text-rose-300 font-medium flex items-center gap-1">
              <RotateCcw size={12} /> Đảo vế phát hiện
            </div>
            <div className="text-base font-bold text-rose-400 mt-0.5">
              {stats ? stats.invertedResolved : '...'}
            </div>
          </div>

          <div className="p-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10">
            <div className="text-[11px] text-blue-300 font-medium flex items-center gap-1">
              <Sparkles size={12} /> Đã lọc kênh YT
            </div>
            <div className="text-base font-bold text-blue-400 mt-0.5">
              {stats ? stats.channelCleaned : '...'}
            </div>
          </div>

          <div className="p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10">
            <div className="text-[11px] text-emerald-300 font-medium flex items-center gap-1">
              <CheckCircle2 size={12} /> Tự tin cao
            </div>
            <div className="text-base font-bold text-emerald-400 mt-0.5">
              {stats ? stats.highConfidence : '...'}
            </div>
          </div>

          <div className="p-2.5 rounded-xl border border-purple-500/30 bg-purple-500/10">
            <div className="text-[11px] text-purple-300 font-medium flex items-center gap-1">
              <ShieldCheck size={12} /> Ground Truth
            </div>
            <div className="text-base font-bold text-purple-400 mt-0.5">
              {stats ? stats.protectedGroundTruth : '...'}
            </div>
          </div>
        </div>

        {/* Toolbar & Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 border-b border-[var(--border)] bg-[var(--bg-subtle)] text-xs">
          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            <button
              onClick={() => setFilterTab('needs_fix')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                filterTab === 'needs_fix'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              Cần sửa ({stats?.changed ?? 0})
            </button>
            <button
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                filterTab === 'all'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              Tất cả ({stats?.total ?? 0})
            </button>
            <button
              onClick={() => setFilterTab('inverted')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                filterTab === 'inverted'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              Đảo vế ({stats?.invertedResolved ?? 0})
            </button>
            <button
              onClick={() => setFilterTab('channel_cleaned')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                filterTab === 'channel_cleaned'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              Lọc kênh ({stats?.channelCleaned ?? 0})
            </button>
            <button
              onClick={() => setFilterTab('high_confidence')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                filterTab === 'high_confidence'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              Độ tin cậy cao ({stats?.highConfidence ?? 0})
            </button>
            <button
              onClick={() => setFilterTab('protected')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                filterTab === 'protected'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              Đã bảo vệ ({stats?.protectedGroundTruth ?? 0})
            </button>
          </div>

          {/* Search & Actions */}
          <div className="flex items-center gap-2.5">
            <div className="relative w-48 sm:w-64">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <input
                type="text"
                placeholder="Tìm bài hát, ca sĩ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
              />
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={loadPreview}
              disabled={isLoading}
              className="gap-1.5 text-xs h-8"
              title="Quét lại toàn bộ thư viện"
            >
              <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
              <span>Quét lại</span>
            </Button>
          </div>
        </div>

        {/* Sub-toolbar: Selection actions & Options */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2 border-b border-[var(--border)] bg-black/10 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-[var(--text-muted)]">
              Đã chọn: <strong className="text-indigo-400">{selectedTrackIds.size}</strong> bài
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSelectAllVisible}
                className="px-2 py-1 rounded bg-[var(--bg-hover)] text-[var(--text-primary)] hover:bg-[var(--border)] text-[11px] font-medium transition-colors cursor-pointer"
              >
                Chọn tất cả hiển thị
              </button>
              <button
                type="button"
                onClick={handleDeselectAllVisible}
                className="px-2 py-1 rounded bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[11px] font-medium transition-colors cursor-pointer"
              >
                Bỏ chọn
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={enableItunes}
                onChange={(e) => setEnableItunes(e.target.checked)}
              />
              <span className="text-[11.5px] text-[var(--text-primary)]">
                Bật Tầng 4: Đối chiếu iTunes (Storefront vn & us)
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={syncToR2}
                onChange={(e) => setSyncToR2(e.target.checked)}
              />
              <span className="text-[11.5px] text-[var(--text-primary)] flex items-center gap-1">
                <Cloud size={13} className="text-cyan-400" />
                <span>Đồng bộ lên R2 ngay sau khi lưu</span>
              </span>
            </label>
          </div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-[var(--text-muted)] gap-3">
              <RefreshCw size={28} className="animate-spin text-indigo-400" />
              <p className="text-sm font-medium">Đang chạy bộ phân giải đa tầng trên 365 bài hát...</p>
              <p className="text-xs text-[var(--text-muted)]">
                Tầng 0 (yt-dlp) → Tầng 1 (Kênh) → Tầng 2 (Danh bạ) → Tầng 3 (Cấu trúc) → Tầng 4 (iTunes)
              </p>
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)] gap-2">
              <CheckCircle2 size={32} className="text-emerald-400" />
              <p className="text-sm font-medium">Không tìm thấy bài hát nào phù hợp với bộ lọc!</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredCandidates.map((item) => {
                const isSelected = selectedTrackIds.has(item.id);
                const isProtected = item.isProtected;

                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs ${
                      isProtected
                        ? 'bg-purple-500/5 border-purple-500/20'
                        : isSelected
                        ? 'bg-indigo-500/10 border-indigo-500/40 shadow-xs'
                        : item.isChanged
                        ? 'bg-[var(--bg-surface)] border-[var(--border)] hover:border-zinc-500/40'
                        : 'bg-black/10 border-transparent opacity-80'
                    }`}
                  >
                    {/* Left: Checkbox & Track Comparison */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="pt-0.5 shrink-0">
                        {isProtected ? (
                          <div title="Bài hát đã được bạn xác nhận thủ công, luôn được bảo vệ tuyệt đối!">
                            <ShieldCheck size={18} className="text-purple-400" />
                          </div>
                        ) : (
                          <Checkbox
                            checked={isSelected}
                            disabled={!item.isChanged}
                            onChange={() => toggleSelectTrack(item.id)}
                          />
                        )}
                      </div>

                      <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-2">
                        {/* Original */}
                        <div className="min-w-0 pr-2">
                          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                            Hiện tại
                          </div>
                          <div className="font-semibold text-[var(--text-primary)] truncate mt-0.5">
                            {item.originalArtist}
                          </div>
                          <div className="text-[var(--text-muted)] truncate">
                            {item.originalTitle}
                          </div>
                          {item.originalAlbum && (
                            <div className="text-[10.5px] text-zinc-500 truncate italic">
                              📁 {item.originalAlbum}
                            </div>
                          )}
                        </div>

                        {/* Resolved */}
                        <div className="min-w-0 pl-2 border-l border-[var(--border)]">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-indigo-400 uppercase tracking-wider font-bold">
                              Đề xuất sau chuẩn hóa
                            </span>
                            {item.isInverted && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                                Đã sửa đảo vế
                              </span>
                            )}
                            {item.isChannelAbsorbed && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
                                Đã lọc kênh
                              </span>
                            )}
                          </div>
                          <div className="font-semibold text-emerald-400 truncate mt-0.5">
                            {item.resolvedArtist}
                          </div>
                          <div className="text-[var(--text-primary)] font-medium truncate">
                            {item.resolvedTitle}
                          </div>
                          {item.resolvedAlbum && (
                            <div className="text-[10.5px] text-zinc-400 truncate italic">
                              📁 {item.resolvedAlbum}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Layer, Confidence & Evidence Badges */}
                    <div className="flex flex-wrap md:flex-col items-end gap-1.5 shrink-0 min-w-[180px]">
                      <div className="flex items-center gap-1.5">
                        {/* Layer Badge */}
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold border ${
                            item.source === 'layer0'
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                              : item.source === 'layer1'
                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                              : item.source === 'layer2'
                              ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                              : item.source === 'layer3'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              : item.source === 'itunes'
                              ? 'bg-pink-500/20 text-pink-300 border-pink-500/30'
                              : 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30'
                          }`}
                        >
                          {item.source === 'layer0'
                            ? 'Tầng 0: yt-dlp'
                            : item.source === 'layer1'
                            ? 'Tầng 1: Kênh'
                            : item.source === 'layer2'
                            ? 'Tầng 2: Danh bạ'
                            : item.source === 'layer3'
                            ? 'Tầng 3: Cấu trúc'
                            : item.source === 'itunes'
                            ? 'Tầng 4: iTunes'
                            : 'Fallback'}
                        </span>

                        {/* Confidence Badge */}
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                            item.confidence === 'high'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : item.confidence === 'medium'
                              ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                          }`}
                        >
                          {item.confidence.toUpperCase()}
                        </span>
                      </div>

                      {/* Evidence snippets */}
                      {item.confidenceReason && (
                        <div
                          className="text-[10px] text-[var(--text-muted)] text-right max-w-[240px] truncate"
                          title={item.confidenceReason}
                        >
                          {item.confidenceReason}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-subtle)]">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownloadCsv}
              className="gap-1.5 text-xs border-[var(--border)]"
              title="Tải file CSV chi tiết kết quả phân tích để kiểm toán thủ công"
            >
              <Download size={13} />
              <span>Tải báo cáo CSV (Dry-Run)</span>
            </Button>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Đóng
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleApplySelected(false)}
              disabled={isApplying || selectedTrackIds.size === 0}
              className="gap-1.5 text-xs border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 font-semibold"
            >
              {isApplying ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <Check size={13} />
              )}
              <span>Áp dụng đã chọn ({selectedTrackIds.size} bài)</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={() => handleApplySelected(true)}
              disabled={isApplying || !stats || stats.safeApplyCount === 0}
              className="gap-1.5 text-xs bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold shadow-md"
            >
              {isApplying ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <Sparkles size={13} />
              )}
              <span>Áp dụng an toàn tất cả ({stats?.safeApplyCount ?? 0} bài)</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
