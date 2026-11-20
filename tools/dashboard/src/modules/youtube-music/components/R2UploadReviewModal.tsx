import React, { useState } from 'react';
import {
  Cloud,
  X,
  FileText,
  AlertCircle,
  HardDrive,
  Music,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../ui/atoms/Button';
import type { YoutubeMusicDownloadRecord } from '@music-app/shared';
import { uploadDownloadToR2Api } from '../api';

interface R2UploadReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: YoutubeMusicDownloadRecord[];
  onSuccess: () => void;
}

const formatBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
};

export const R2UploadReviewModal: React.FC<R2UploadReviewModalProps> = ({
  isOpen,
  onClose,
  items,
  onSuccess,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentTitle, setCurrentTitle] = useState('');

  if (!isOpen || items.length === 0) return null;

  const totalBytes = items.reduce((acc, it) => acc + (it.fileSizeBytes || 0), 0);

  const handleStartUpload = async () => {
    setIsUploading(true);
    let successCount = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      setCurrentTitle(item.title || 'bài hát');

      try {
        await uploadDownloadToR2Api(item.id);
        successCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Lỗi tải bài "${item.title}": ${msg}`);
      }
      setCurrentIndex(i + 1);
    }

    setIsUploading(false);
    toast.success(`Đã tải thành công ${successCount}/${items.length} bài hát lên Cloudflare R2!`);
    onSuccess();
    onClose();
  };

  const progressPercent =
    items.length > 0 ? Math.round((currentIndex / items.length) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-2xl max-h-[85vh] bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 select-none">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[#1DB954]/15 border border-[#1DB954]/30 flex items-center justify-center text-[#1DB954] shrink-0">
              <Cloud size={15} />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-[var(--text-primary)]">
                Xác nhận tải lên Cloudflare R2
              </h3>
              <p className="text-[11px] text-[var(--text-muted)] truncate">
                Xem lại danh sách và metadata bài hát trước khi đưa vào kho nhạc mây
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Thống kê & Lưu ý */}
        <div className="p-4 space-y-3">
          <div className="p-3 rounded-lg border border-[#1DB954]/20 bg-[#1DB954]/5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-zinc-300">
              <CheckCircle2 size={16} className="text-[#1DB954]" />
              <span>
                Sẵn sàng tải <strong className="text-white">{items.length} bài hát</strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5  text-zinc-400">
              <HardDrive size={13} className="text-[#1DB954]" />
              <span>Tổng dung lượng: {formatBytes(totalBytes)}</span>
            </div>
          </div>

          {/* Progress Bar khi đang upload */}
          {isUploading && (
            <div className="p-3 rounded-lg border border-[var(--border)] bg-black/40 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-zinc-300 font-semibold">
                  <Loader2 size={13} className="animate-spin text-[#1DB954]" />
                  <span>
                    Đang tải bài ({currentIndex}/{items.length}): &ldquo;{currentTitle}&rdquo;
                  </span>
                </span>
                <span className=" text-[#1DB954] font-bold">{progressPercent}%</span>
              </div>
              <div className="w-full h-1.5 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#1DB954] rounded-full transition-all duration-200"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Danh sách bài hát */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-zinc-400 px-1">
              Danh sách chi tiết bài hát chuẩn bị lên R2:
            </div>
            <div className="border border-[var(--border)] rounded-xl max-h-64 overflow-y-auto divide-y divide-[var(--border)] bg-[var(--bg-surface)]">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-2.5 flex items-center gap-3 hover:bg-[var(--bg-hover)] transition-colors text-xs"
                >
                  <span className="text-[11px]  text-zinc-500 w-5 text-center shrink-0">
                    {idx + 1}
                  </span>

                  {/* Thumbnail */}
                  <div className="w-8 h-8 rounded-md bg-[var(--bg-subtle)] border border-[var(--border)] overflow-hidden shrink-0 flex items-center justify-center">
                    {item.relativeCoverPath ? (
                      <img
                        src={`/api/youtube-music/downloads/${item.id}/cover`}
                        alt="Cover"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Music size={13} className="text-zinc-600" />
                    )}
                  </div>

                  {/* Thông tin */}
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-white truncate max-w-sm">
                      {item.title || 'Unknown Title'}
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate">
                      <span>{item.artist || 'Chưa rõ nghệ sĩ'}</span>
                      <span className="mx-1.5">•</span>
                      <span>{item.album || 'Single'}</span>
                      <span className="mx-1.5">•</span>
                      <span className=" text-zinc-500 uppercase">{item.format}</span>
                    </div>
                  </div>

                  {/* Dung lượng & Lời */}
                  <div className="flex items-center gap-2 shrink-0">
                    {item.relativeLyricsPath || item.lyricsExists ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                        <FileText size={10} />
                        <span>.lrc</span>
                      </span>
                    ) : null}

                    <span className=" text-[11px] text-zinc-400">
                      {formatBytes(item.fileSizeBytes)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 border-t border-[var(--border)] bg-[var(--bg-subtle)] flex items-center justify-between text-xs">
          <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
            <AlertCircle size={13} className="text-amber-400" />
            <span>Tự động cập nhật file library.json trên mây sau khi hoàn tất.</span>
          </span>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={isUploading}>
              Hủy bỏ
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleStartUpload}
              disabled={isUploading || items.length === 0}
              className="bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold gap-1.5 px-4"
            >
              <Cloud size={14} className="text-black" />
              <span>
                {isUploading ? 'Đang tải lên...' : `Xác nhận tải lên (${items.length} bài)`}
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
