import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, X, ExternalLink, Download, Upload, Loader2, Sparkles } from 'lucide-react';
import { Button } from '../../../ui/atoms/Button';
import { toast } from 'sonner';

interface CoverViewerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl?: string;
  title?: string;
  artist?: string;
  trackId?: string;
  onCoverUpdated?: (newUrl: string) => void;
}

export const CoverViewerDialog: React.FC<CoverViewerDialogProps> = ({
  isOpen,
  onClose,
  imageUrl,
  title,
  artist,
  trackId,
  onCoverUpdated,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentCoverUrl, setCurrentCoverUrl] = useState<string | undefined>(imageUrl);

  // Đồng bộ lại coverUrl khi mở dialog
  React.useEffect(() => {
    setCurrentCoverUrl(imageUrl);
  }, [imageUrl, isOpen]);

  if (!isOpen || !currentCoverUrl) return null;

  // Tải file ảnh chất lượng cao về máy tính
  const handleDownloadCover = async () => {
    try {
      const targetUrl = currentCoverUrl;
      const res = await fetch(targetUrl);
      if (!res.ok) throw new Error('Không thể tải ảnh từ server');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeTitle = (title || 'Track').replace(/[/\\?%*:|"<>]/g, '_');
      const safeArtist = (artist || 'Artist').replace(/[/\\?%*:|"<>]/g, '_');
      a.download = `${safeArtist} - ${safeTitle} - Cover.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Đã tải ảnh bìa chất lượng cao về máy tính!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi tải ảnh về máy: ${msg}`);
      window.open(currentCoverUrl, '_blank');
    }
  };

  // Chọn ảnh từ máy tính để cập nhật làm bìa mới
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !trackId) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn file hình ảnh hợp lệ (.jpg, .png, .webp)');
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('cover', file);

      // Thử endpoint track trước, fallback sang download record nếu cần
      let res = await fetch(`/local-api/tracks/${trackId}/cover`, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: formData,
      });

      if (!res.ok) {
        res = await fetch(`/api/youtube-music/downloads/${trackId}/cover`, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          body: formData,
        });
      }

      if (!res.ok) {
        throw new Error('Lỗi server khi lưu ảnh bìa mới');
      }

      const newCoverWithTimestamp = `/local-api/covers/${trackId}.jpg?_t=${Date.now()}`;
      setCurrentCoverUrl(newCoverWithTimestamp);
      onCoverUpdated?.(newCoverWithTimestamp);
      toast.success('Đã cập nhật ảnh bìa HD thành công!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Không thể cập nhật ảnh bìa: ${msg}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Tự động tải lại ảnh bìa HD từ YouTube
  const handleFetchYouTubeCover = async () => {
    if (!trackId) return;
    try {
      setIsUploading(true);
      const res = await fetch(`/local-api/tracks/${trackId}/fetch-yt-cover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Không tìm thấy ảnh bìa từ YouTube');
      }
      const newCoverWithTimestamp = `${json.coverUrl || `/local-api/covers/${trackId}.jpg`}?_t=${Date.now()}`;
      setCurrentCoverUrl(newCoverWithTimestamp);
      onCoverUpdated?.(newCoverWithTimestamp);
      toast.success(json.message || 'Đã tải và cập nhật ảnh bìa HD từ YouTube thành công!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi tải ảnh bìa YouTube: ${msg}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col select-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
            <div className="flex items-center gap-2 min-w-0">
              <ImageIcon size={16} className="text-[#1DB954] shrink-0" />
              <div className="min-w-0">
                <h3 className="text-xs font-semibold text-[var(--text-primary)] truncate">
                  {title || 'Ảnh bìa chất lượng cao (HD)'}
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
              <div className="p-4 flex items-center justify-center bg-black/40 relative">
                <div className="w-full aspect-square rounded-xl overflow-hidden border border-[var(--border)] shadow-md flex items-center justify-center bg-[var(--bg-subtle)] relative group">
                  <img
                    src={currentCoverUrl}
                    alt={title || 'Cover Art'}
                    className="w-full h-full object-cover"
                  />
                  {isUploading && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-white">
                      <Loader2 size={24} className="animate-spin text-[#1DB954]" />
                      <span className="text-xs font-medium">Đang lưu ảnh mới...</span>
                    </div>
                  )}
                </div>
              </div>

                  {/* Footer Actions */}
                  <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-subtle)] text-[11px] gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      {/* Nút Tải ảnh HD về máy tính */}
                      <button
                        type="button"
                        onClick={handleDownloadCover}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/15 text-white border border-white/10 transition-colors cursor-pointer active:scale-95 shadow-xs"
                        title="Tải ảnh bìa gốc độ nét cao về máy tính"
                      >
                        <Download size={13} className="text-[#1DB954]" />
                        <span>Tải ảnh HD</span>
                      </button>

                      {/* Nút Lấy bìa YouTube HD (Ưu tiên) */}
                      {trackId && (
                        <button
                          type="button"
                          onClick={handleFetchYouTubeCover}
                          disabled={isUploading}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors cursor-pointer active:scale-95 shadow-xs disabled:opacity-50"
                          title="Tự động tìm kiếm video YouTube tương ứng và lấy ảnh bìa HD chất lượng cao nhất"
                        >
                          {isUploading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                          <span>Lấy bìa YouTube</span>
                        </button>
                      )}

                      {/* Nút Đổi ảnh bìa mới từ máy tính (nếu có trackId) */}
                      {trackId && (
                        <>
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1DB954] hover:bg-[#1ed760] text-black transition-colors cursor-pointer active:scale-95 shadow-xs disabled:opacity-50"
                            title="Chọn file ảnh từ máy tính để đổi bìa"
                          >
                            <Upload size={13} />
                            <span>Đổi ảnh mới</span>
                          </button>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      <a
                        href={currentCoverUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white transition-colors"
                        title="Mở ảnh tab mới"
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
