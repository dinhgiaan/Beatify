import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Trash2,
  RotateCcw,
  RefreshCw,
  Music,
  CheckSquare,
  Square,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../../ui/organisms/PageHeader';
import { Button } from '../../ui/atoms/Button';
import { Checkbox, Badge } from '../../ui/atoms/Controls';
import { ConfirmDialog } from '../../ui/molecules/ConfirmDialog';
import { requestApi } from '../../core/api-client';

interface TrashItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId?: string;
  format: string;
  deletedAt: string;
  daysLeft: number;
}

export const TrashPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [purgeTarget, setPurgeTarget] = useState<TrashItem | null>(null);
  const [isEmptyTrashOpen, setIsEmptyTrashOpen] = useState(false);
  const [isBatchPurgeOpen, setIsBatchPurgeOpen] = useState(false);
  const [deleteFromR2, setDeleteFromR2] = useState(false);

  const { data: trash = [], isLoading, refetch } = useQuery<TrashItem[]>({
    queryKey: ['trash-items'],
    queryFn: async () => {
      const res = await requestApi<{ trash: TrashItem[] }>('/local-api/trash');
      return res.trash || [];
    },
    staleTime: 10000,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['trash-items'] });
    queryClient.invalidateQueries({ queryKey: ['local-tracks'] });
    queryClient.invalidateQueries({ queryKey: ['system-status'] });
    queryClient.invalidateQueries({ queryKey: ['yt-downloads-manager'] });
    queryClient.invalidateQueries({ queryKey: ['yt-downloads'] });
    queryClient.invalidateQueries({ queryKey: ['artists-list'] });
  };

  // Khôi phục 1 bài
  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      return requestApi(`/local-api/tracks/${id}/restore`, { method: 'POST' });
    },
    onSuccess: (_, id) => {
      toast.success('Đã khôi phục bài hát về thư viện');
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      invalidateAll();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi khôi phục: ${msg}`);
    },
  });

  // Khôi phục hàng loạt
  const batchRestoreMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      return requestApi('/local-api/trash/restore', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
    },
    onSuccess: (_, ids) => {
      toast.success(`Đã khôi phục ${ids.length} bài hát về thư viện`);
      setSelectedIds(new Set());
      invalidateAll();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi khôi phục hàng loạt: ${msg}`);
    },
  });

  // Xóa vĩnh viễn 1 bài
  const purgeMutation = useMutation({
    mutationFn: async ({ id, deleteFromR2 }: { id: string; deleteFromR2: boolean }) => {
      return requestApi(`/local-api/tracks/${id}/trash?deleteFromR2=${deleteFromR2}`, {
        method: 'DELETE',
      });
    },
    onSuccess: (_, { id }) => {
      toast.success('Đã xóa vĩnh viễn bài hát');
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      invalidateAll();
      setPurgeTarget(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi xóa vĩnh viễn: ${msg}`);
    },
  });

  // Xóa vĩnh viễn hàng loạt hoặc dọn sạch thùng rác
  const batchPurgeMutation = useMutation({
    mutationFn: async ({ ids, deleteFromR2 }: { ids?: string[]; deleteFromR2: boolean }) => {
      return requestApi('/local-api/trash/empty', {
        method: 'POST',
        body: JSON.stringify({ ids, deleteFromR2 }),
      });
    },
    onSuccess: (data: unknown) => {
      const res = data as { purgedCount?: number; message?: string };
      toast.success(res?.message || 'Đã dọn dẹp thùng rác thành công');
      setSelectedIds(new Set());
      setIsEmptyTrashOpen(false);
      setIsBatchPurgeOpen(false);
      invalidateAll();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi xóa: ${msg}`);
    },
  });

  const isAllSelected = trash.length > 0 && trash.every((t) => selectedIds.has(t.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(trash.map((t) => t.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="w-full max-w-[1720px] mx-auto px-8 py-6 space-y-6">
      <PageHeader
        title="Thùng rác (Lưu trữ an toàn 14 ngày)"
        subtitle="Các bài hát đã xóa tạm thời. Sau 14 ngày hệ thống sẽ tự động dọn dẹp hoặc bạn có thể xóa vĩnh viễn ngay."
        actions={
          <div className="flex items-center gap-2">
            {trash.length > 0 && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setDeleteFromR2(false);
                  setIsEmptyTrashOpen(true);
                }}
                className="gap-1.5"
              >
                <Trash2 size={13} />
                <span>Dọn sạch thùng rác</span>
              </Button>
            )}

            <Button variant="secondary" size="sm" onClick={() => refetch()} className="gap-1.5">
              <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </Button>
          </div>
        }
      />

      {/* Floating Batch Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between p-3.5 px-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-md">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <CheckSquare size={16} className="text-emerald-400" />
            <span>Đã chọn {selectedIds.size} / {trash.length} bài hát</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => batchRestoreMutation.mutate(Array.from(selectedIds))}
              disabled={batchRestoreMutation.isPending}
              className="gap-1.5"
            >
              <RotateCcw size={12} />
              <span>Khôi phục ({selectedIds.size})</span>
            </Button>

            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setDeleteFromR2(false);
                setIsBatchPurgeOpen(true);
              }}
              disabled={batchPurgeMutation.isPending}
              className="gap-1.5"
            >
              <Trash2 size={12} />
              <span>Xóa vĩnh viễn ({selectedIds.size})</span>
            </Button>

            <Button
              variant="text"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-[var(--text-muted)] hover:text-white"
            >
              Hủy chọn
            </Button>
          </div>
        </div>
      )}

      {/* Trash items table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden shadow-sm">
        {trash.length === 0 ? (
          <div className="p-12 text-center text-[var(--text-muted)] flex flex-col items-center justify-center gap-2">
            <Trash2 size={32} className="opacity-40" />
            <p className="text-[13px]">Thùng rác trống. Không có bài hát nào bị xóa.</p>
          </div>
        ) : (
          <div>
            {/* Table Header with Checkbox */}
            <div className="p-3 px-4 border-b border-[var(--border)] bg-[var(--bg-subtle)] flex items-center justify-between text-xs font-semibold text-[var(--text-muted)]">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="p-1 rounded hover:bg-white/10 text-[var(--text-muted)] hover:text-white transition-colors"
                  title={isAllSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                >
                  {isAllSelected ? <CheckSquare size={15} className="text-emerald-400" /> : <Square size={15} />}
                </button>
                <span className="uppercase tracking-wider text-[11px]">Tên bài hát / Nghệ sĩ / Album</span>
              </div>
              <span className="uppercase tracking-wider text-[11px] pr-2">Thao tác</span>
            </div>

            <div className="divide-y divide-[var(--border)]">
              {trash.map((item) => {
                const isSelected = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`p-3.5 px-4 flex items-center justify-between gap-4 transition-colors ${
                      isSelected ? 'bg-emerald-500/10 hover:bg-emerald-500/15' : 'hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => toggleSelectOne(item.id)}
                        className="p-1 rounded text-[var(--text-muted)] hover:text-white transition-colors shrink-0"
                      >
                        {isSelected ? <CheckSquare size={15} className="text-emerald-400" /> : <Square size={15} />}
                      </button>

                      <div className="w-10 h-10 rounded-lg overflow-hidden border border-[var(--border)] bg-black/30 shrink-0 flex items-center justify-center">
                        <Music size={16} className="text-[var(--text-muted)]" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-bold text-[var(--text-primary)] truncate">
                            {item.title}
                          </span>
                          <Badge variant="danger">Còn {item.daysLeft} ngày</Badge>
                        </div>

                        <div className="text-[11.5px] text-[var(--text-secondary)] flex items-center gap-2 mt-0.5 truncate">
                          <span className="font-medium">{item.artist}</span>
                          <span className="text-[var(--text-muted)]">•</span>
                          <span className="text-[var(--text-muted)]">{item.album}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => restoreMutation.mutate(item.id)}
                        disabled={restoreMutation.isPending}
                        className="gap-1.5"
                      >
                        <RotateCcw size={12} />
                        <span>Khôi phục</span>
                      </Button>

                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setPurgeTarget(item);
                          setDeleteFromR2(false);
                        }}
                        disabled={purgeMutation.isPending}
                        className="gap-1.5"
                      >
                        <Trash2 size={12} />
                        <span>Xóa vĩnh viễn</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Purge Single Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(purgeTarget)}
        onOpenChange={(o) => !o && setPurgeTarget(null)}
        title="Xóa vĩnh viễn bài hát?"
        description={
          <div className="space-y-3">
            <p>
              Hành động này không thể hoàn tác. Bài hát <strong>&quot;{purgeTarget?.title}&quot;</strong> sẽ bị xóa vĩnh viễn khỏi hệ thống.
            </p>
            <label className="flex items-center gap-2 text-[11.5px] text-[var(--text-secondary)] cursor-pointer select-none">
              <Checkbox
                checked={deleteFromR2}
                onChange={(e) => setDeleteFromR2(e.target.checked)}
              />
              <span>Xóa đồng thời file bài hát và ảnh bìa trên Cloudflare R2</span>
            </label>
          </div>
        }
        confirmText="Xóa vĩnh viễn"
        variant="danger"
        onConfirm={() => {
          if (purgeTarget) {
            purgeMutation.mutate({ id: purgeTarget.id, deleteFromR2 });
          }
        }}
      />

      {/* Batch Purge Confirm Dialog */}
      <ConfirmDialog
        open={isBatchPurgeOpen}
        onOpenChange={(o) => !o && setIsBatchPurgeOpen(false)}
        title={`Xóa vĩnh viễn ${selectedIds.size} bài hát đã chọn?`}
        description={
          <div className="space-y-3">
            <p>
              Hành động này không thể hoàn tác. <strong>{selectedIds.size} bài hát</strong> được chọn sẽ bị xóa vĩnh viễn khỏi danh sách thùng rác.
            </p>
            <label className="flex items-center gap-2 text-[11.5px] text-[var(--text-secondary)] cursor-pointer select-none">
              <Checkbox
                checked={deleteFromR2}
                onChange={(e) => setDeleteFromR2(e.target.checked)}
              />
              <span>Xóa đồng thời các file tương ứng trên Cloudflare R2</span>
            </label>
          </div>
        }
        confirmText={`Xóa ${selectedIds.size} bài vĩnh viễn`}
        variant="danger"
        onConfirm={() => {
          batchPurgeMutation.mutate({ ids: Array.from(selectedIds), deleteFromR2 });
        }}
      />

      {/* Empty Trash Confirm Dialog */}
      <ConfirmDialog
        open={isEmptyTrashOpen}
        onOpenChange={(o) => !o && setIsEmptyTrashOpen(false)}
        title="Dọn sạch toàn bộ thùng rác?"
        description={
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-rose-400 font-semibold text-xs">
              <AlertTriangle size={15} />
              <span>Cảnh báo: Toàn bộ {trash.length} bài hát trong thùng rác sẽ bị xóa vĩnh viễn!</span>
            </div>
            <p>
              Hành động này không thể hoàn tác. Các bản ghi và file liên kết sẽ bị loại bỏ khỏi cơ sở dữ liệu.
            </p>
            <label className="flex items-center gap-2 text-[11.5px] text-[var(--text-secondary)] cursor-pointer select-none">
              <Checkbox
                checked={deleteFromR2}
                onChange={(e) => setDeleteFromR2(e.target.checked)}
              />
              <span>Xóa đồng thời các file tương ứng trên Cloudflare R2</span>
            </label>
          </div>
        }
        confirmText="Dọn sạch thùng rác ngay"
        variant="danger"
        onConfirm={() => {
          batchPurgeMutation.mutate({ deleteFromR2 });
        }}
      />
    </div>
  );
};

export default TrashPage;
