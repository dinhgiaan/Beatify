import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Lock, ShieldOff } from 'lucide-react';
import type { YoutubeMusicPreviewItem } from '@music-app/shared';

interface UnavailableSongsModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: YoutubeMusicPreviewItem[];
}

/** Ánh xạ lý do sang tiếng Việt dễ đọc */
function localizeReason(reason?: string): { label: string; color: string; icon: React.ReactNode } {
  const r = (reason || '').toLowerCase();
  if (r.includes('private') || r.includes('private')) {
    return { label: 'Chủ kênh đặt Private', color: 'text-orange-400', icon: <Lock size={10} /> };
  }
  if (r.includes('copyright') || r.includes('block') || r.includes('chặn')) {
    return { label: 'Bị chặn bản quyền', color: 'text-rose-400', icon: <ShieldOff size={10} /> };
  }
  if (r.includes('delete') || r.includes('remov')) {
    return { label: 'Video đã bị xóa', color: 'text-zinc-400', icon: <span className="text-[10px]">🗑</span> };
  }
  return { label: reason || 'Không khả dụng', color: 'text-rose-400', icon: <span className="text-[10px]">⛔</span> };
}

export const UnavailableSongsModal: React.FC<UnavailableSongsModalProps> = ({
  isOpen,
  onClose,
  items,
}) => {
  /* Chỉ lấy bài không khả dụng + giữ nguyên index gốc */
  const unavailableWithIndex = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.isUnavailable);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="unavail-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            key="unavail-modal"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-xl max-h-[75vh] flex flex-col rounded-xl border border-rose-500/30 bg-[#1a1a1a] shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-rose-500/20 bg-rose-500/5 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-lg">⛔</span>
                <div>
                  <h2 className="text-sm font-semibold text-rose-300">
                    {unavailableWithIndex.length} bài bị ẩn / chặn
                  </h2>
                  <p className="text-[10.5px] text-rose-400/70 mt-0.5">
                    Các video này không thể tải. Hệ thống đã tự động bỏ chọn.
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

            {/* Table */}
            <div className="overflow-y-auto flex-1">
              {/* Head */}
              <div className="sticky top-0 z-10 grid grid-cols-[36px_1fr_130px_120px] gap-2 px-4 py-2 bg-[#1a1a1a] border-b border-rose-500/10 text-[9.5px] font-semibold uppercase tracking-wide text-rose-400/50">
                <span className="text-center">#</span>
                <span>Bài hát</span>
                <span>Lý do</span>
                <span>Link YouTube</span>
              </div>

              {unavailableWithIndex.length === 0 ? (
                <p className="text-center text-xs text-[var(--text-muted)] py-8">Không có bài nào.</p>
              ) : (
                <div className="divide-y divide-rose-500/8">
                  {unavailableWithIndex.map(({ item, index }) => {
                    const reason = localizeReason(item.unavailableReason);
                    return (
                      <div
                        key={item.id}
                        className="grid grid-cols-[36px_1fr_130px_120px] gap-2 px-4 py-2.5 items-center hover:bg-rose-500/4 transition-colors"
                      >
                        {/* STT */}
                        <span className="text-[10px] font-mono text-center text-[var(--text-muted)] bg-[var(--bg-subtle)] rounded px-1.5 py-0.5 w-fit mx-auto">
                          {index + 1}
                        </span>

                        {/* Tên bài + nghệ sĩ */}
                        <div className="min-w-0">
                          <p className="text-[11.5px] font-medium text-rose-300/70 line-through truncate leading-tight">
                            {item.cleanTitle || item.rawTitle}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)] truncate">
                            {item.artist}
                          </p>
                        </div>

                        {/* Lý do */}
                        <div className={`flex items-center gap-1 ${reason.color}`}>
                          {reason.icon}
                          <span className="text-[10px] font-medium leading-tight">{reason.label}</span>
                        </div>

                        {/* Link */}
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[10px] text-blue-400/60 hover:text-blue-400 transition-colors truncate"
                          title={item.url}
                        >
                          <ExternalLink size={9} className="shrink-0" />
                          <span className="truncate">YouTube ↗</span>
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-surface)] shrink-0 flex items-center justify-between">
              <p className="text-[10px] text-[var(--text-muted)]">
                Các bài này sẽ không được tải. Nếu bạn có link trực tiếp, hãy thêm thủ công.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="ml-4 px-4 py-1.5 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs font-medium hover:bg-rose-500/25 transition-colors cursor-pointer shrink-0"
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

