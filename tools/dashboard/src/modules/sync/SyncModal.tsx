import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Cloud,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../ui/atoms/Button';
import { ConfirmDialog } from '../../ui/molecules/ConfirmDialog';
import { requestApi } from '../../core/api-client';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface OrphanItem {
  key: string;
  sizeBytes: number;
  sizeMB: string;
  lastModified: string;
}

interface SyncProgress {
  active: boolean;
  step: string;
  percent: number;
  current: number;
  total: number;
  error: string | null;
}

export const SyncModal: React.FC<SyncModalProps> = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnectionLost, setIsConnectionLost] = useState(false);
  const [syncMode, setSyncMode] = useState<'full' | 'only-new' | 'selected'>('only-new');

  const { data: status } = useQuery({
    queryKey: ['system-status'],
    queryFn: () =>
      requestApi<{ unsyncedCount?: number; unsyncedMB?: string; syncedCount?: number; totalTracks?: number }>(
        '/local-api/status'
      ),
    enabled: isOpen,
  });

  const unsyncedCount = Number(status?.unsyncedCount || 0);

  const [syncProgress, setSyncProgress] = useState<{
    active: boolean;
    step: string;
    percent: number;
    current: number;
    total: number;
    error: string | null;
  }>({
    active: false,
    step: 'Sẵn sàng đồng bộ',
    percent: 0,
    current: 0,
    total: 0,
    error: null,
  });

  const [orphans, setOrphans] = useState<OrphanItem[]>([]);
  const [isScanningOrphans, setIsScanningOrphans] = useState(false);
  const [isConfirmPruneOpen, setIsConfirmPruneOpen] = useState(false);

  // Tự động kiểm tra và cập nhật tiến trình đồng bộ khi mở modal hoặc đang đồng bộ
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let consecutiveLostCount = 0;

    const fetchProgress = async () => {
      try {
        const res = await requestApi<{ progress: SyncProgress }>('/local-api/sync/progress');
        if (res?.progress) {
          consecutiveLostCount = 0;
          setIsConnectionLost(false);
          setSyncProgress((prev) => {
            // Giữ cho percent luôn tăng đơn điệu (monotonic) khi đang active, chống giật lùi
            const safePercent = res.progress.active
              ? Math.max(prev.percent, Math.min(100, Math.max(0, res.progress.percent)))
              : Math.min(100, Math.max(0, res.progress.percent));
            return {
              ...res.progress,
              percent: safePercent,
            };
          });
          if (res.progress.active) {
            setIsSyncing(true);
          } else if (isSyncing) {
            setIsSyncing(false);
            if (res.progress.percent >= 100) {
              toast.success('Đồng bộ Cloudflare R2 hoàn tất!');
              queryClient.invalidateQueries({ queryKey: ['system-status'] });
            } else if (res.progress.error) {
              toast.error(`Lỗi đồng bộ: ${res.progress.error}`);
            }
          }
        }
      } catch {
        consecutiveLostCount++;
        // Nếu đang đồng bộ mà mất kết nối tới server: không ngắt ngay trạng thái đồng bộ
        if (isSyncing) {
          setIsConnectionLost(true);
          // Watchdog: Nếu mất kết nối quá 15 giây liên tiếp, thoát khỏi trạng thái treo
          if (consecutiveLostCount >= 15) {
            setIsSyncing(false);
            setSyncProgress((prev) => ({
              ...prev,
              active: false,
              step: 'Mất kết nối tới server (Hết thời gian chờ 15s)',
              error: 'Server không phản hồi',
            }));
            toast.error('Mất kết nối tới server indexer quá 15 giây. Vui lòng kiểm tra lại tiến trình server.');
          }
        }
      }
    };

    if (isOpen) {
      // Kiểm tra ngay trạng thái thật khi mở modal
      fetchProgress();

      // Liên tục cập nhật mỗi giây khi modal mở
      timer = setInterval(fetchProgress, 1000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isOpen, isSyncing, queryClient]);

  const startSyncMutation = useMutation({
    mutationFn: async (payload: { mode?: 'full' | 'only-new' | 'selected'; trackIds?: string[] } = {}) => {
      setIsSyncing(true);
      setIsConnectionLost(false);
      setSyncMode(payload.mode || 'only-new');
      return requestApi('/local-api/sync', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch')) {
        setIsConnectionLost(true);
        toast.warning('Mất kết nối tới server, đang chờ phản hồi...');
      } else {
        setIsSyncing(false);
        toast.error(`Không thể bắt đầu đồng bộ: ${msg}`);
      }
    },
  });

  const handleScanOrphans = async () => {
    setIsScanningOrphans(true);
    try {
      const res = await requestApi<{ orphans: OrphanItem[]; totalCount: number; totalMB: string }>(
        '/local-api/r2/orphans'
      );
      setOrphans(res.orphans || []);
      if (res.orphans.length === 0) {
        toast.success('R2 sạch sẽ! Không có file thừa mồ côi.');
      } else {
        toast.info(`Tìm thấy ${res.orphans.length} file thừa (${res.totalMB} MB) trên R2.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi quét file thừa: ${msg}`);
    } finally {
      setIsScanningOrphans(false);
    }
  };

  const pruneMutation = useMutation({
    mutationFn: async () => {
      const keys = orphans.map((o) => o.key);
      return requestApi<{ message?: string }>('/local-api/r2/prune', {
        method: 'POST',
        body: JSON.stringify({ keys }),
      });
    },
    onSuccess: (res) => {
      toast.success(res?.message || 'Đã dọn dẹp sạch sẽ các file thừa trên Cloudflare R2!');
      setOrphans([]);
      setIsConfirmPruneOpen(false);
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Lỗi dọn file thừa: ${msg}`);
    },
  });

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
        <div className="w-full max-w-xl bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-[#1DB954]/10 text-[#1DB954]">
                <Cloud size={20} />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-[var(--text-primary)]">
                  Đồng bộ kho nhạc lên Cloudflare R2
                </h3>
                <p className="text-[11.5px] text-[var(--text-muted)] m-0">
                  Tải lên bài hát mới, ảnh bìa album và đồng bộ library.json
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

          {/* Body */}
          <div className="p-6 space-y-6">
            {/* Sync Progress Box */}
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] space-y-3">
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="font-semibold text-[var(--text-primary)]">Tiến trình đồng bộ:</span>
                <span className=" text-[#1DB954] font-bold">{syncProgress.percent}%</span>
              </div>

              <div className="w-full h-2 bg-[var(--bg-surface)] rounded-full overflow-hidden border border-[var(--border)]">
                <div
                  className="h-full bg-[#1DB954] rounded-full transition-[width] duration-300 ease-out"
                  style={{ width: `${syncProgress.percent}%` }}
                />
              </div>

              <div className="text-xs text-zinc-400 truncate flex items-center justify-between">
                <span>{syncProgress.step}</span>
                {isConnectionLost && (
                  <span className="text-amber-400 font-medium animate-pulse ml-2">
                    ⚠️ Mất kết nối tới server, đang chờ...
                  </span>
                )}
              </div>
            </div>

            {/* Sync Action Buttons */}
            <div className="space-y-3">
              {/* Option 1: Chỉ đồng bộ bài mới */}
              <div className="p-3.5 rounded-xl border border-white/[0.08] bg-black/25 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-white">Chỉ đồng bộ bài hát mới</span>
                    {unsyncedCount > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-[#1DB954]/20 text-[#1DB954] border border-[#1DB954]/30">
                        {unsyncedCount} bài chưa lên Cloud
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10.5px] text-zinc-400 bg-white/[0.05]">
                        Đã đầy đủ
                      </span>
                    )}
                  </div>
                  <div className="text-[11.5px] text-zinc-400 mt-0.5">
                    Chỉ tải lên các bài hát mới thêm và cập nhật thư viện, siêu nhanh trong 2-3 giây.
                  </div>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => startSyncMutation.mutate({ mode: 'only-new' })}
                  disabled={isSyncing || syncProgress.active || isConnectionLost || unsyncedCount === 0}
                  className="gap-1.5 px-3.5 py-1.5 font-bold shrink-0 bg-[#1DB954] hover:bg-[#1ed760] text-black cursor-pointer"
                >
                  {isSyncing && syncMode === 'only-new' ? (
                    <RefreshCw size={13} className="animate-spin text-black" />
                  ) : (
                    <Cloud size={13} className="text-black" />
                  )}
                  <span>
                    {isConnectionLost
                      ? 'Đang chờ...'
                      : isSyncing && syncMode === 'only-new'
                      ? 'Đang đồng bộ...'
                      : 'Đồng bộ bài mới'}
                  </span>
                </Button>
              </div>

              {/* Option 2: Đồng bộ toàn bộ thư viện */}
              <div className="p-3.5 rounded-xl border border-white/[0.08] bg-black/15 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-zinc-300">
                    Đồng bộ toàn bộ thư viện
                  </div>
                  <div className="text-[11.5px] text-zinc-500 mt-0.5">
                    Quét lại toàn bộ đĩa, kiểm tra toàn diện ảnh bìa và lời bài hát.
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => startSyncMutation.mutate({ mode: 'full' })}
                  disabled={isSyncing || syncProgress.active || isConnectionLost}
                  className="gap-1.5 px-3.5 py-1.5 font-medium shrink-0 cursor-pointer"
                >
                  {isSyncing && syncMode === 'full' ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <RefreshCw size={13} />
                  )}
                  <span>
                    {isSyncing && syncMode === 'full' ? 'Đang đồng bộ tất cả...' : 'Đồng bộ tất cả'}
                  </span>
                </Button>
              </div>
            </div>

            {/* Orphan files scanner */}
            <div className="pt-4 border-t border-[var(--border)] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[12.5px] font-bold text-[var(--text-primary)]">
                    Dọn dẹp file thừa mồ côi trên Cloudflare R2
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Quét và xóa các bài hát cũ không còn tồn tại trong kho nhạc để tiết kiệm 10GB dung lượng miễn phí
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleScanOrphans}
                  disabled={isScanningOrphans}
                  className="gap-1.5"
                >
                  <RefreshCw size={12} className={isScanningOrphans ? 'animate-spin' : ''} />
                  <span>Quét file thừa</span>
                </Button>
              </div>

              {orphans.length > 0 && (
                <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-2">
                  <div className="flex items-center justify-between text-[11.5px] text-amber-300">
                    <span>
                      Tìm thấy <strong>{orphans.length}</strong> file thừa mồ côi trên R2
                    </span>
                    <Button
                      variant="danger"
                      size="xs"
                      onClick={() => setIsConfirmPruneOpen(true)}
                      className="gap-1"
                    >
                      <Trash2 size={11} />
                      <span>Dọn dẹp ngay</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-6 py-3.5 border-t border-[var(--border)] bg-[var(--bg-subtle)]">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Đóng
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={isConfirmPruneOpen}
        onOpenChange={setIsConfirmPruneOpen}
        title="Dọn dẹp file thừa trên Cloudflare R2?"
        description={`Hệ thống sẽ xóa vĩnh viễn ${orphans.length} file mồ côi trên Cloudflare R2. Các file này không còn trong kho nhạc local của bạn.`}
        confirmText="Xác nhận dọn dẹp"
        variant="danger"
        onConfirm={() => pruneMutation.mutate()}
      />
    </>
  );
};
