import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, X, ExternalLink } from 'lucide-react';
import { Button } from '../../../ui/atoms/Button';

interface CoverViewerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl?: string;
  title?: string;
  artist?: string;
}

export const CoverViewerDialog: React.FC<CoverViewerDialogProps> = ({
  isOpen,
  onClose,
  imageUrl,
  title,
  artist,
}) => {
  if (!isOpen || !imageUrl) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden flex flex-col select-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
            <div className="flex items-center gap-2 min-w-0">
              <ImageIcon size={16} className="text-[#1DB954] shrink-0" />
              <div className="min-w-0">
                <h3 className="text-xs font-semibold text-[var(--text-primary)] truncate">
                  {title || 'Ảnh bìa chất lượng cao'}
                </h3>
                {artist && (
                  <p className="text-[10px] text-[var(--text-muted)] m-0 truncate">
                    {artist}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>

          {/* Image Display */}
          <div className="p-4 flex items-center justify-center bg-black/40">
            <div className="w-full aspect-square rounded-lg overflow-hidden border border-[var(--border)] shadow-md flex items-center justify-center bg-[var(--bg-subtle)]">
              <img
                src={imageUrl}
                alt={title || 'Cover Art'}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--border)] bg-[var(--bg-subtle)] text-[11px]">
            <span className="text-[10px] text-[var(--text-muted)]">
              Chuẩn 1:1 tỉ lệ vuông dành cho đĩa nhạc
            </span>
            <div className="flex items-center gap-2">
              <a
                href={imageUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[10.5px] text-[#1DB954] hover:underline"
              >
                <span>Mở ảnh gốc</span>
                <ExternalLink size={11} />
              </a>
              <Button variant="secondary" size="sm" onClick={onClose} className="h-7 text-xs">
                Đóng
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
