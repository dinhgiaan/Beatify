import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  X,
  Music,
  Check,
  Trash2,
  Edit2,
  FolderOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../ui/atoms/Button';
import { Input } from '../../../ui/atoms/Input';
import { Checkbox } from '../../../ui/atoms/Controls';
import { requestApi } from '../../../core/api-client';

export interface ImportItem {
  tempId: string;
  originalName: string;
  safeFileName: string;
  title: string;
  artist: string;
  album: string;
  year?: number;
  duration?: number;
  hasCover: boolean;
  coverId?: string;
}

interface LocalImportReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const LocalImportReviewModal: React.FC<LocalImportReviewModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [items, setItems] = useState<ImportItem[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [uploadToR2Immediately, setUploadToR2Immediately] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Edit item inline
  const [editingTempId, setEditingTempId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editAlbum, setEditAlbum] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFiles = async (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter((f) =>
      /\.(mp3|flac|m4a|aac|wav|ogg|opus)$/i.test(f.name)
    );

    if (validFiles.length === 0) {
      toast.error('Vui lòng chọn các file âm thanh hợp lệ (MP3, FLAC, M4A, AAC, WAV...)');
      return;
    }

    setIsParsing(true);
    const formData = new FormData();
    validFiles.forEach((f) => formData.append('files', f));

    try {
      const res = await requestApi<{ items: ImportItem[] }>('/local-api/import/preview', {
        method: 'POST',
        body: formData,
        headers: {},
      });

      if (res?.items && res.items.length > 0) {
        setItems((prev) => [...prev, ...res.items]);
        toast.success(`Đã phân tích thẻ ID3 của ${res.items.length} file nhạc!`);
      } else {
        toast.info('Không tìm thấy thông tin bài hát trong các file đã chọn');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi phân tích file: ${msg}`);
    } finally {
      setIsParsing(false);
    }
  };

  const handleCommitImport = async () => {
    if (items.length === 0) return;
    setIsCommitting(true);

    try {
      const res = await requestApi<{ importedCount?: number; message?: string }>('/local-api/import/commit', {
        method: 'POST',
        body: JSON.stringify({
          items,
          uploadToR2Immediately,
        }),
      });

      toast.success(
        res?.message ||
        `Đã nhập thành công ${items.length} bài hát vào thư viện${uploadToR2Immediately ? ' và tải lên Cloudflare R2' : ''
        }!`
      );
      setItems([]);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi nhập nhạc: ${msg}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleStartEdit = (it: ImportItem) => {
    setEditingTempId(it.tempId);
    setEditTitle(it.title);
    setEditArtist(it.artist);
    setEditAlbum(it.album);
  };

  const handleSaveEdit = (tempId: string) => {
    setItems((prev) =>
      prev.map((i) =>
        i.tempId === tempId
          ? { ...i, title: editTitle.trim(), artist: editArtist.trim(), album: editAlbum.trim() }
          : i
      )
    );
    setEditingTempId(null);
  };

  const handleRemoveItem = (tempId: string) => {
    setItems((prev) => prev.filter((i) => i.tempId !== tempId));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-3xl max-h-[90vh] bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 select-none">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[#1DB954]/15 border border-[#1DB954]/30 flex items-center justify-center text-[#1DB954] shrink-0">
              <UploadCloud size={15} />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-[var(--text-primary)]">
                Nhập file nhạc từ máy tính
              </h3>
              <p className="text-[11px] text-[var(--text-muted)] truncate">
                Xem trước & chỉnh sửa siêu dữ liệu ID3 trước khi đưa vào kho nhạc
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isCommitting || isParsing}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".mp3,.flac,.m4a,.aac,.wav,.ogg,.opus"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              handleFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Dropzone hoặc nút chọn thêm file */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files) {
                handleFiles(e.dataTransfer.files);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors cursor-pointer flex flex-col items-center justify-center gap-2 ${isDragging
                ? 'border-[#1DB954] bg-[#1DB954]/10'
                : 'border-[var(--border)] bg-black/20 hover:border-zinc-500 hover:bg-black/30'
              }`}
          >
            <div className="w-10 h-10 rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] flex items-center justify-center text-[#1DB954]">
              <FolderOpen size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-white">
                {isParsing
                  ? 'Đang đọc thẻ ID3...'
                  : 'Bấm để chọn file hoặc kéo thả file âm thanh vào đây'}
              </div>
              <div className="text-[11px] text-zinc-400 pt-0.5">
                Hỗ trợ định dạng MP3, FLAC, M4A, AAC, WAV, OGG, OPUS
              </div>
            </div>
          </div>

          {/* Danh sách các bài hát xem trước */}
          {items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 px-1">
                <span>Danh sách bài hát xem trước ({items.length} bài)</span>
                <span className="text-[11px] text-zinc-500 font-normal">
                  Bấm biểu tượng bút để sửa tên/ca sĩ nếu cần
                </span>
              </div>

              <div className="border border-[var(--border)] rounded-xl overflow-hidden divide-y divide-[var(--border)] bg-[var(--bg-surface)]">
                {items.map((item, idx) => {
                  const isEditing = editingTempId === item.tempId;

                  return (
                    <div
                      key={item.tempId}
                      className="p-3 flex items-center gap-3 hover:bg-[var(--bg-hover)] transition-colors text-xs"
                    >
                      {/* STT */}
                      <span className="text-[11px]  text-zinc-500 w-5 text-center shrink-0">
                        {idx + 1}
                      </span>

                      {/* Cover Thumbnail */}
                      <div className="w-9 h-9 rounded-md bg-[var(--bg-subtle)] border border-[var(--border)] overflow-hidden shrink-0 flex items-center justify-center">
                        {item.coverId ? (
                          <img
                            src={`/local-api/import/cover/${item.coverId}`}
                            alt="Cover"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Music size={14} className="text-zinc-600" />
                        )}
                      </div>

                      {/* Info / Editing Form */}
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <Input
                              value={editTitle}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditTitle(e.target.value)}
                              placeholder="Tiêu đề bài hát"
                              className="text-xs"
                              autoFocus
                            />
                            <Input
                              value={editArtist}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditArtist(e.target.value)}
                              placeholder="Nghệ sĩ"
                              className="text-xs"
                            />
                            <div className="flex gap-1.5">
                              <Input
                                value={editAlbum}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditAlbum(e.target.value)}
                                placeholder="Album"
                                className="text-xs flex-1"
                              />
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleSaveEdit(item.tempId)}
                                className="px-2 bg-[#1DB954] text-black h-8 shrink-0"
                              >
                                <Check size={12} />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="font-bold text-white truncate max-w-md">
                              {item.title}
                            </div>
                            <div className="text-[11px] text-zinc-400 truncate">
                              <span>{item.artist}</span>
                              <span className="mx-1.5">•</span>
                              <span>{item.album}</span>
                              <span className="mx-1.5">•</span>
                              <span className=" text-zinc-500">{item.originalName}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      {!isEditing && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(item)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                            title="Chỉnh sửa thông tin"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.tempId)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                            title="Loại bỏ bài này"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 border-t border-[var(--border)] bg-[var(--bg-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
          <label className="flex items-center gap-2 cursor-pointer select-none text-zinc-300">
            <Checkbox
              checked={uploadToR2Immediately}
              onChange={(e) => setUploadToR2Immediately(e.target.checked)}
              disabled={isCommitting || items.length === 0}
            />
            <span className="font-medium">Tự động tải lên Cloudflare R2 sau khi nhập</span>
          </label>

          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={isCommitting || isParsing}
            >
              Hủy bỏ
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCommitImport}
              disabled={isCommitting || isParsing || items.length === 0}
              className="bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold gap-1.5 px-4"
            >
              <Check size={14} />
              <span>{isCommitting ? 'Đang nhập...' : `Xác nhận nhập (${items.length} bài)`}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
