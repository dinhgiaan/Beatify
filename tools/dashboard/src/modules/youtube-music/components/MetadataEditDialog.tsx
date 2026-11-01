import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit3, RotateCcw, X, Check } from 'lucide-react';
import { Button } from '../../../ui/atoms/Button';
import type { YoutubeMusicPreviewItem } from '@music-app/shared';

interface MetadataEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  item: YoutubeMusicPreviewItem | null;
  currentOverrides?: {
    cleanTitle?: string;
    artist?: string;
    album?: string;
  };
  onSave: (overrides: { cleanTitle: string; artist: string; album: string }) => void;
}

export const MetadataEditDialog: React.FC<MetadataEditDialogProps> = ({
  isOpen,
  onClose,
  item,
  currentOverrides,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');

  useEffect(() => {
    if (item && isOpen) {
      setTitle(currentOverrides?.cleanTitle ?? item.cleanTitle ?? '');
      setArtist(currentOverrides?.artist ?? item.artist ?? '');
      setAlbum(currentOverrides?.album ?? item.album ?? 'Singles');
    }
  }, [item, isOpen, currentOverrides]);

  if (!isOpen || !item) return null;

  const handleApply = () => {
    onSave({
      cleanTitle: title.trim() || item.cleanTitle,
      artist: artist.trim() || item.artist,
      album: album.trim() || 'Singles',
    });
    onClose();
  };

  const handleResetToDefault = () => {
    setTitle(item.cleanTitle);
    setArtist(item.artist);
    setAlbum(item.album || 'Singles');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden flex flex-col select-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
            <div className="flex items-center gap-2">
              <Edit3 size={16} className="text-[#1DB954]" />
              <h3 className="text-xs font-bold text-[var(--text-primary)]">
                Chỉnh sửa thẻ metadata ID3
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>

          {/* Form Content */}
          <div className="p-5 space-y-4">
            <div className="text-[11px] text-[var(--text-muted)] p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)]">
              Tiêu đề gốc YouTube: <span className="font-semibold text-[var(--text-secondary)]">{item.rawTitle}</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-[var(--text-secondary)]">Tên bài hát</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nhập tên bài hát..."
                className="w-full px-3 py-1.5 rounded-lg border text-xs bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[#1DB954]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-[var(--text-secondary)]">Nghệ sĩ / Ca sĩ</label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Nhập tên ca sĩ/nghệ sĩ..."
                className="w-full px-3 py-1.5 rounded-lg border text-xs bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[#1DB954]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-[var(--text-secondary)]">Tên Album</label>
              <input
                type="text"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                placeholder="Singles hoặc tên album..."
                className="w-full px-3 py-1.5 rounded-lg border text-xs bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[#1DB954]"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-subtle)]">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleResetToDefault}
              className="gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <RotateCcw size={12} />
              <span>Khôi phục gốc</span>
            </Button>

            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={onClose} className="text-xs">
                Hủy
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleApply}
                className="gap-1.5 text-xs font-semibold"
              >
                <Check size={12} />
                <span>Lưu thay đổi</span>
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
