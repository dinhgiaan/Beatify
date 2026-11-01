import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Trash2,
  RotateCcw,
  RefreshCw,
  Music,
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
  const [purgeTarget, setPurgeTarget] = useState<TrashItem | null>(null);
  const [deleteFromR2, setDeleteFromR2] = useState(false);

  const { data: trash = [], isLoading, refetch } = useQuery<TrashItem[]>({
    queryKey: ['trash-items'],
    queryFn: async () => {
      const res = await requestApi<{ trash: TrashItem[] }>('/local-api/trash');
      return res.trash || [];
    },
    staleTime: 10000,
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      return requestApi(`/local-api/tracks/${id}/restore`, { method: 'POST' });
    },
    onSuccess: () => {
      toast.success('Đã khôi phục bài hát về thư viện');
      queryClient.invalidateQueries({ queryKey: ['trash-items'] });
      queryClient.invalidateQueries({ queryKey: ['local-tracks'] });
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi khôi phục: ${msg}`);
    },
  });

  const purgeMutation = useMutation({
    mutationFn: async ({ id, deleteFromR2 }: { id: string; deleteFromR2: boolean }) => {
      return requestApi(`/local-api/tracks/${id}/trash?deleteFromR2=${deleteFromR2}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      toast.success('Đã xóa vĩnh viễn bài hát');
      queryClient.invalidateQueries({ queryKey: ['trash-items'] });
      queryClient.invalidateQueries({ queryKey: ['local-tracks'] });
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
      queryClient.invalidateQueries({ queryKey: ['yt-downloads-manager'] });
      queryClient.invalidateQueries({ queryKey: ['yt-downloads'] });
      queryClient.invalidateQueries({ queryKey: ['artists-list'] });
      setPurgeTarget(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi xóa vĩnh viễn: ${msg}`);
    },
  });

  return (
    <div className="w-full max-w-[1720px] mx-auto px-8 py-6 space-y-6">
      <PageHeader
        title="Thùng rác (Lưu trữ an toàn 14 ngày)"
        subtitle="Các bài hát đã xóa tạm thời. Sau 14 ngày hệ thống sẽ tự động dọn dẹp hoặc bạn có thể xóa vĩnh viễn ngay."
        actions={
          <Button variant="secondary" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            <span>Làm mới</span>
          </Button>
        }
      />

      {/* Trash items table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden shadow-sm">
        {trash.length === 0 ? (
          <div className="p-12 text-center text-[var(--text-muted)] flex flex-col items-center justify-center gap-2">
            <Trash2 size={32} className="opacity-40" />
            <p className="text-[13px]">Thùng rác trống. Không có bài hát nào bị xóa.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {trash.map((item) => (
              <div
                key={item.id}
                className="p-3.5 px-4 flex items-center justify-between gap-4 hover:bg-[var(--bg-subtle)] transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-lg overflow-hidden border border-[var(--border)] bg-black/30 shrink-0 flex items-center justify-center">
                    <Music size={16} className="text-[var(--text-muted)]" />
                  </div>

                  <div className="min-w-0">
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
                    className="gap-1.5"
                  >
                    <Trash2 size={12} />
                    <span>Xóa vĩnh viễn</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Purge Confirm Dialog */}
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
    </div>
  );
};
