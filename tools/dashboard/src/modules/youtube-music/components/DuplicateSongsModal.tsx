import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, ArrowLeftRight, CheckCircle2, XCircle, Info } from 'lucide-react';
import type { YoutubeMusicPreviewItem } from '@music-app/shared';

interface DuplicateGroup {
  original: YoutubeMusicPreviewItem;
  originalIndex: number;
  duplicates: { item: YoutubeMusicPreviewItem; index: number }[];
}

interface DuplicateSongsModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: YoutubeMusicPreviewItem[];
  selectedIds: Set<string>;
  /** Swap giữ/bỏ giữa 2 bài trong cùng nhóm */
  onSwapKeep: (keepId: string, dropId: string) => void;
}

function formatDuration(s?: number) {
  if (!s || s <= 0) return '--:--';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export const DuplicateSongsModal: React.FC<DuplicateSongsModalProps> = ({
  isOpen,
  onClose,
  items,
  selectedIds,
  onSwapKeep,
}) => {
  /* ---- Nhóm bài trùng ---- */
  const groups = useMemo<DuplicateGroup[]>(() => {
    const map = new Map<number, DuplicateGroup>();
    items.forEach((item, idx) => {
      if (!item.isDuplicateSong || item.duplicateOfIndex == null) return;
      const origIdx = item.duplicateOfIndex;
      const original = items[origIdx];
      if (!original) return;
        let group = map.get(origIdx);
        if (!group) {
          group = { original, originalIndex: origIdx, duplicates: [] };
          map.set(origIdx, group);
        }
        group.duplicates.push({ item, index: idx });
      });
    return Array.from(map.values()).sort((a, b) => a.originalIndex - b.originalIndex);
  }, [items]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        /* Backdrop */
        <motion.div
          key="dup-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            key="dup-modal"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl border border-amber-500/30 bg-[#1a1a1a] shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-amber-500/20 bg-amber-500/5 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                <div>
                  <h2 className="text-sm font-semibold text-amber-300">
                    {groups.length} nhóm bài trùng
                  </h2>
                  <p className="text-[10.5px] text-amber-400/70 mt-0.5">
                    Mỗi nhóm sẽ chỉ tải 1 file. Bạn có thể chọn giữ bài nào.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            {/* Note */}
            <div className="mx-5 mt-3 mb-0 px-3 py-2 rounded-lg bg-blue-500/8 border border-blue-500/20 flex items-start gap-2 shrink-0">
              <Info size={12} className="text-blue-400 mt-0.5 shrink-0" />
              <p className="text-[10.5px] text-blue-300/80 leading-relaxed">
                Beatify tự động phát hiện các video YouTube khác link nhưng cùng một bài hát.
                Bài <span className="text-green-400 font-medium">Giữ lại ✓</span> sẽ được tải.
                Bài <span className="text-rose-400/80 font-medium">Bỏ qua</span> sẽ bị bỏ chọn tự động.
                Bấm <span className="text-amber-300 font-medium">Đổi chỗ</span> để chọn file khác làm bản chính.
              </p>
            </div>

            {/* Groups list */}
            <div className="overflow-y-auto flex-1 px-5 py-3 space-y-4">
              {groups.map((group, gi) => {
                const allInGroup = [
                  { item: group.original, index: group.originalIndex },
                  ...group.duplicates,
                ];
                const keptId = allInGroup.find(e => selectedIds.has(e.item.id))?.item.id
                  ?? group.original.id;

                return (
                  <div
                    key={group.original.id}
                    className="rounded-lg border border-amber-500/15 bg-amber-500/4 overflow-hidden"
                  >
                    {/* Group header */}
                    <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/15 flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">
                        Nhóm {gi + 1} — {allInGroup.length} video cùng bài
                      </span>
                      {group.original.duplicateReason || group.duplicates[0]?.item.duplicateReason ? (
                        <span className="text-[9.5px] text-amber-400/60 italic">
                          {group.original.duplicateReason || group.duplicates[0]?.item.duplicateReason}
                        </span>
                      ) : null}
                    </div>

                    {/* Items in group */}
                    <div className="divide-y divide-amber-500/8">
                      {allInGroup.map(({ item, index }) => {
                        const isKept = item.id === keptId;
                        const isDrop = !isKept;
                        // Tìm cái còn lại để swap
                        const swapWith = allInGroup.find(e => e.item.id !== item.id);

                        return (
                          <div
                            key={item.id}
                            className={`flex items-start gap-3 px-3 py-2.5 transition-colors ${isKept ? 'bg-green-500/4' : 'bg-rose-500/4 opacity-75'}`}
                          >
                            {/* Thumbnail */}
                            {item.thumbnailUrl ? (
                              <img
                                src={item.thumbnailUrl}
                                alt=""
                                className={`w-12 h-9 object-cover rounded shrink-0 ${isDrop ? 'grayscale opacity-50' : ''}`}
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : (
                              <div className="w-12 h-9 rounded bg-[var(--bg-subtle)] shrink-0 flex items-center justify-center">
                                <span className="text-[16px]">🎵</span>
                              </div>
                            )}

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[9.5px] font-mono text-[var(--text-muted)] bg-[var(--bg-subtle)] px-1 py-0.5 rounded shrink-0">
                                  #{index + 1}
                                </span>
                                {isKept ? (
                                  <span className="flex items-center gap-0.5 text-[9.5px] font-semibold text-green-400 shrink-0">
                                    <CheckCircle2 size={10} />
                                    Giữ lại
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-0.5 text-[9.5px] text-rose-400/70 shrink-0">
                                    <XCircle size={10} />
                                    Bỏ qua
                                  </span>
                                )}
                              </div>
                              <p className={`text-[11.5px] font-medium leading-tight truncate ${isDrop ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>
                                {item.cleanTitle}
                              </p>
                              <p className="text-[10px] text-[var(--text-muted)] truncate">
                                {item.artist}
                                {item.duration ? ` · ${formatDuration(item.duration)}` : ''}
                              </p>
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-[9.5px] text-blue-400/70 hover:text-blue-400 transition-colors mt-0.5"
                              >
                                <ExternalLink size={9} />
                                <span className="truncate max-w-[200px]">{item.url}</span>
                              </a>
                            </div>

                            {/* Swap button — chỉ hiện ở bài "Bỏ qua" */}
                            {isDrop && swapWith && (
                              <button
                                type="button"
                                onClick={() => onSwapKeep(item.id, swapWith.item.id)}
                                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[9.5px] font-medium hover:bg-amber-500/20 transition-colors cursor-pointer"
                                title="Giữ lại bài này, bỏ bài kia"
                              >
                                <ArrowLeftRight size={10} />
                                Đổi chỗ
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-surface)] shrink-0 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-medium hover:bg-amber-500/25 transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

