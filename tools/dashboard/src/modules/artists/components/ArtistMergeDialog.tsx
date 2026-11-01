import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  X,
  GitMerge,
  Search,
  Check,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../../../ui/atoms/Button';
import { mergeArtistsApi, type ArtistDetail } from '../api';

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

export const ArtistMergeDialog: React.FC<ArtistMergeDialogProps> = ({
  isOpen,
  onClose,
  artists,
  initialTargetArtist,
  onSuccess,
}) => {
  const [targetArtist, setTargetArtist] = useState(initialTargetArtist || '');
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Khởi tạo targetArtist khi mở modal
  React.useEffect(() => {
    if (initialTargetArtist) {
      setTargetArtist(initialTargetArtist);
    } else if (artists.length > 0 && !targetArtist) {
      setTargetArtist(artists[0]?.name || '');
    }
  }, [initialTargetArtist, artists, targetArtist]);

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

  // Danh sách nghệ sĩ lọc theo tìm kiếm để chọn nguồn
  const filteredArtists = useMemo(() => {
    return artists.filter((a) => {
      if (a.name === targetArtist) return false;
      if (!searchTerm.trim()) return true;
      return normalize(a.name).includes(normalize(searchTerm));
    });
  }, [artists, targetArtist, searchTerm]);

  // Tổng số bài hát bị ảnh hưởng khi gộp
  const totalAffectedTracks = useMemo(() => {
    return artists
      .filter((a) => selectedSources.has(a.name))
      .reduce((acc, a) => acc + a.trackCount, 0);
  }, [artists, selectedSources]);

  if (!isOpen) return null;

  const toggleSource = (name: string) => {
    const next = new Set(selectedSources);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setSelectedSources(next);
  };

  const handleSelectAllSuggestions = () => {
    const next = new Set(selectedSources);
    suggestedSources.forEach((s) => next.add(s.name));
    setSelectedSources(next);
  };

  const handleSubmit = async () => {
    if (!targetArtist) {
      toast.error('Vui lòng chọn tên nghệ sĩ chuẩn');
      return;
    }
    if (selectedSources.size === 0) {
      toast.error('Vui lòng chọn ít nhất 1 nghệ sĩ nguồn cần gộp');
      return;
    }

    setIsLoading(true);
    try {
      const res = await mergeArtistsApi(targetArtist, Array.from(selectedSources));
      toast.success(res.message || 'Đã gộp nghệ sĩ thành công!');
      setSelectedSources(new Set());
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi khi gộp nghệ sĩ: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="w-full max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-2xl space-y-5"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <GitMerge size={16} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[var(--text-primary)]">
                  Gộp Nghệ sĩ (Artist Aliases)
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Chuẩn hóa các biến thể tên về một nghệ sĩ chuẩn duy nhất
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Chọn Nghệ sĩ Đích */}
          <div className="space-y-1.5">
            <label className="text-[11.5px] font-semibold text-[var(--text-secondary)]">
              1. Chọn Nghệ sĩ chuẩn (Đích đến):
            </label>
            <select
              value={targetArtist}
              onChange={(e) => {
                setTargetArtist(e.target.value);
                setSelectedSources(new Set());
              }}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-emerald-500"
            >
              {artists.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name} ({a.trackCount} bài)
                </option>
              ))}
            </select>
          </div>

          {/* Gợi ý thông minh */}
          {suggestedSources.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle size={13} />
                  <span>Phát hiện {suggestedSources.length} tên tương tự có thể gộp:</span>
                </span>
                <button
                  type="button"
                  onClick={handleSelectAllSuggestions}
                  className="text-[10.5px] text-amber-400 hover:underline font-medium cursor-pointer"
                >
                  Chọn tất cả gợi ý
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {suggestedSources.map((s) => {
                  const isChecked = selectedSources.has(s.name);
                  return (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => toggleSource(s.name)}
                      className={`text-[11px] px-2 py-0.5 rounded-md border transition-all cursor-pointer flex items-center gap-1 ${
                        isChecked
                          ? 'bg-amber-500 text-black border-amber-500 font-semibold'
                          : 'bg-black/30 text-amber-200 border-amber-500/30 hover:border-amber-500/60'
                      }`}
                    >
                      <span>{s.name}</span>
                      <span className="opacity-70 text-[9.5px]">({s.trackCount} bài)</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Chọn Nghệ sĩ Nguồn */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11.5px] font-semibold text-[var(--text-secondary)]">
                2. Chọn các nghệ sĩ nguồn cần gộp vào &quot;{targetArtist}&quot;:
              </label>
              <span className="text-[11px] text-emerald-400 font-medium">
                Đã chọn: {selectedSources.size} ({totalAffectedTracks} bài)
              </span>
            </div>

            {/* Ô tìm kiếm */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm tên nghệ sĩ nguồn..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Danh sách cuộn chọn */}
            <div className="max-h-44 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-2 space-y-1">
              {filteredArtists.length === 0 ? (
                <div className="text-center py-4 text-[11px] text-[var(--text-muted)]">
                  Không tìm thấy nghệ sĩ phù hợp
                </div>
              ) : (
                filteredArtists.map((a) => {
                  const isChecked = selectedSources.has(a.name);
                  return (
                    <div
                      key={a.name}
                      onClick={() => toggleSource(a.name)}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                          : 'hover:bg-[var(--bg-hover)] text-[var(--text-primary)]'
                      }`}
                    >
                      <span className="font-medium truncate">{a.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10.5px] text-[var(--text-muted)]">
                          {a.trackCount} bài
                        </span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="rounded text-emerald-500 cursor-pointer"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
            <span className="text-[11px] text-[var(--text-muted)]">
              {selectedSources.size > 0 && `Gộp ${totalAffectedTracks} bài hát về "${targetArtist}"`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={onClose}
                disabled={isLoading}
              >
                Hủy bỏ
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                disabled={isLoading || selectedSources.size === 0}
                className="gap-1.5"
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Đang gộp...</span>
                  </>
                ) : (
                  <>
                    <Check size={13} />
                    <span>Xác nhận gộp</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
