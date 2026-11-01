import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UploadCloud,
  Check,
  RefreshCw,
  Trash2,
  Edit3,
  Music,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../../ui/organisms/PageHeader';
import { Button } from '../../ui/atoms/Button';
import { Badge } from '../../ui/atoms/Controls';
import { Dialog } from '../../ui/organisms/Dialog';
import { requestApi } from '../../core/api-client';

interface ImportItem {
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

export const ImportPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Edit item state
  const [editingItem, setEditingItem] = useState<ImportItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editAlbum, setEditAlbum] = useState('');

  const commitMutation = useMutation({
    mutationFn: async () => {
      return requestApi<{ message?: string }>('/local-api/import/commit', {
        method: 'POST',
        body: JSON.stringify({ items }),
      });
    },
    onSuccess: (res) => {
      toast.success(res?.message || 'Đã nhập thành công các bài hát vào kho nhạc!');
      setItems([]);
      queryClient.invalidateQueries({ queryKey: ['local-tracks'] });
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
      queryClient.invalidateQueries({ queryKey: ['artists-list'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi nhập nhạc: ${msg}`);
    },
  });

  const handleFiles = async (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter((f) =>
      /\.(mp3|flac|m4a|aac|wav|ogg|opus)$/i.test(f.name)
    );

    if (validFiles.length === 0) {
      toast.error('Vui lòng chọn các file âm thanh hợp lệ (MP3, FLAC, M4A...)');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    validFiles.forEach((f) => formData.append('files', f));

    try {
      const res = await requestApi<{ items: ImportItem[] }>('/local-api/import/preview', {
        method: 'POST',
        body: formData,
        headers: {}, // fetch tự sinh boundary cho FormData
      });

      if (res?.items) {
        setItems((prev) => [...prev, ...res.items]);
        toast.success(`Đã phân tích ${res.items.length} file nhạc!`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi phân tích file: ${msg}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleOpenEdit = (it: ImportItem) => {
    setEditingItem(it);
    setEditTitle(it.title);
    setEditArtist(it.artist);
    setEditAlbum(it.album);
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    setItems((prev) =>
      prev.map((i) =>
        i.tempId === editingItem.tempId
          ? { ...i, title: editTitle.trim(), artist: editArtist.trim(), album: editAlbum.trim() }
          : i
      )
    );
    setEditingItem(null);
  };

  const removeItem = (tempId: string) => {
    setItems((prev) => prev.filter((i) => i.tempId !== tempId));
  };

  return (
    <div className="w-full max-w-[1720px] mx-auto px-8 py-6 space-y-6">
      <PageHeader
        title="Nhập file nhạc cục bộ"
        subtitle="Kéo thả các file nhạc từ máy tính để phân tích thẻ ID3 và nhập vào kho nhạc"
        actions={
          items.length > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => commitMutation.mutate()}
              disabled={commitMutation.isPending}
              className="gap-1.5 px-4 font-semibold"
            >
              <Check size={13} />
              <span>Xác nhận nhập ({items.length} bài)</span>
            </Button>
          )
        }
      />

      {/* Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`p-10 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-all cursor-pointer ${isDragging
            ? 'border-[#1DB954] bg-[#1DB954]/10 scale-[1.01]'
            : 'border-[var(--border)] bg-[var(--bg-surface)] hover:border-[#1DB954]/50 hover:bg-[var(--bg-subtle)]'
          }`}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.multiple = true;
          input.accept = 'audio/*,.mp3,.flac,.m4a,.aac,.opus';
          input.onchange = (e) => {
            const fs = (e.target as HTMLInputElement).files;
            if (fs) handleFiles(fs);
          };
          input.click();
        }}
      >
        <div className="w-14 h-14 rounded-full bg-[#1DB954]/10 text-[#1DB954] flex items-center justify-center">
          <UploadCloud size={28} />
        </div>
        <div className="text-center space-y-1">
          <div className="text-[14px] font-bold text-[var(--text-primary)]">
            Kéo thả file nhạc vào đây hoặc click để chọn từ máy tính
          </div>
          <div className="text-[11.5px] text-[var(--text-muted)]">
            Hỗ trợ MP3, FLAC, M4A, Opus, AAC (tự động trích xuất thẻ ID3 và bìa album)
          </div>
        </div>
        {isUploading && (
          <div className="flex items-center gap-2 text-[#1DB954] text-[12px] mt-2">
            <RefreshCw size={14} className="animate-spin" />
            <span>Đang đọc và phân tích thẻ bài hát...</span>
          </div>
        )}
      </div>

      {/* Preview items list */}
      {items.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden shadow-sm space-y-3 p-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
            <span className="text-[13px] font-bold text-[var(--text-primary)]">
              Danh sách bài hát sẵn sàng nhập ({items.length} bài)
            </span>
            <Button
              variant="secondary"
              size="xs"
              onClick={() => setItems([])}
            >
              Xóa tất cả
            </Button>
          </div>

          <div className="divide-y divide-[var(--border)]">
            {items.map((it) => (
              <div
                key={it.tempId}
                className="py-3 px-2 flex items-center justify-between gap-4 hover:bg-[var(--bg-subtle)] rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-lg overflow-hidden border border-[var(--border)] bg-black/30 shrink-0 flex items-center justify-center">
                    <Music size={16} className="text-[var(--text-muted)]" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold text-[var(--text-primary)] truncate">
                        {it.title}
                      </span>
                      {it.hasCover && <Badge variant="success">Có bìa</Badge>}
                    </div>

                    <div className="text-[11.5px] text-[var(--text-secondary)] flex items-center gap-2 mt-0.5 truncate">
                      <span className="font-medium">{it.artist}</span>
                      <span className="text-[var(--text-muted)]">•</span>
                      <span className="text-[var(--text-muted)]">{it.album}</span>
                      <span className="text-[var(--text-muted)]">•</span>
                      <span className=" text-[10.5px] text-[var(--text-muted)]">
                        {it.originalName}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(it)}
                    className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] cursor-pointer"
                    title="Chỉnh sửa thông tin bài hát"
                  >
                    <Edit3 size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => removeItem(it.tempId)}
                    className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-rose-500/10 hover:text-rose-400 text-[var(--text-muted)] cursor-pointer"
                    title="Bỏ qua bài này"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog
        open={Boolean(editingItem)}
        onOpenChange={(o) => !o && setEditingItem(null)}
        title="Chỉnh sửa thông tin bài hát trước khi nhập"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditingItem(null)}>
              Hủy
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveEdit}>
              Cập nhật
            </Button>
          </>
        }
      >
        <div className="space-y-3.5 py-1">
          <div>
            <label className="block text-[11.5px] font-medium text-[var(--text-secondary)] mb-1">
              Tên bài hát
            </label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full h-8 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[#1DB954]"
            />
          </div>

          <div>
            <label className="block text-[11.5px] font-medium text-[var(--text-secondary)] mb-1">
              Nghệ sĩ
            </label>
            <input
              type="text"
              value={editArtist}
              onChange={(e) => setEditArtist(e.target.value)}
              className="w-full h-8 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[#1DB954]"
            />
          </div>

          <div>
            <label className="block text-[11.5px] font-medium text-[var(--text-secondary)] mb-1">
              Album
            </label>
            <input
              type="text"
              value={editAlbum}
              onChange={(e) => setEditAlbum(e.target.value)}
              className="w-full h-8 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[#1DB954]"
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
};
