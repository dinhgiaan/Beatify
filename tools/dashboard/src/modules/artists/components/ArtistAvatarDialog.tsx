import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  X,
  Camera,
  Link2,
  RefreshCw,
  FolderCheck,
  Check,
} from 'lucide-react';
import { Button } from '../../../ui/atoms/Button';
import { updateArtistAvatarApi, type ArtistDetail } from '../api';

interface ArtistAvatarDialogProps {
  isOpen: boolean;
  onClose: () => void;
  artist: ArtistDetail | null;
  onSuccess: (newAvatarUrl?: string) => void;
}

export const ArtistAvatarDialog: React.FC<ArtistAvatarDialogProps> = ({
  isOpen,
  onClose,
  artist,
  onSuccess,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen || !artist) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) {
      toast.error('Vui lòng dán link YouTube (kênh hoặc video) hoặc link ảnh');
      return;
    }

    setIsLoading(true);
    try {
      const res = await updateArtistAvatarApi(artist.name, urlInput.trim());
      toast.success(res.message || `Đã cập nhật ảnh đại diện cho ${artist.name}`);
      setUrlInput('');
      onSuccess(res.avatarUrl);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi cập nhật avatar: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isLoading) {
            onClose();
          }
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-2xl space-y-5"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Camera size={16} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[var(--text-primary)]">
                  Cập nhật Avatar Nghệ sĩ
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  {artist.name}
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

          {/* Current Avatar Preview */}
          <div className="flex flex-col items-center justify-center py-2 space-y-2">
            <div className="w-24 h-24 rounded-full border-2 border-emerald-500/40 p-1 shadow-lg bg-black/30">
              <div className="w-full h-full rounded-full overflow-hidden bg-[var(--bg-subtle)] flex items-center justify-center">
                <img
                  src={artist.avatarUrl}
                  alt={artist.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">
              {artist.hasAvatar ? 'Đã có ảnh đại diện (artist.jpg)' : 'Chưa có ảnh riêng (Dùng bìa album)'}
            </span>
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11.5px] font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                <Link2 size={13} className="text-emerald-400" />
                <span>Link YouTube Channel hoặc Link Ảnh:</span>
              </label>
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://www.youtube.com/@channel hoặc link ảnh..."
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-emerald-500 transition-colors"
                autoFocus
              />
              <p className="text-[10.5px] text-[var(--text-muted)] leading-relaxed">
                Hệ thống sẽ tự động trích xuất avatar vuông độ phân giải cao 900x900 pixel, lưu tệp <code className="text-emerald-400">artist.jpg</code> và cấu hình icon thư mục Windows Explorer.
              </p>
            </div>

            {/* Folder hint */}
            {artist.folderPath && (
              <div className="p-2.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] text-[10.5px] text-[var(--text-muted)] flex items-center gap-2 truncate">
                <FolderCheck size={13} className="text-emerald-400 shrink-0" />
                <span className="truncate" title={artist.folderPath}>
                  Lưu tại: {artist.folderPath}
                </span>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border)]">
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={onClose}
                disabled={isLoading}
              >
                Hủy bỏ
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                disabled={isLoading || !urlInput.trim()}
                className="gap-1.5"
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Đang tải avatar...</span>
                  </>
                ) : (
                  <>
                    <Check size={13} />
                    <span>Lưu ảnh đại diện</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
