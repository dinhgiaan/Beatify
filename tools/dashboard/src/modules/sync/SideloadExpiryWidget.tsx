import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, AlertOctagon, RefreshCw, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

export const SideloadExpiryWidget: React.FC<{
  onOpenConnectModal?: () => void;
}> = ({ onOpenConnectModal }) => {
  const [lastDate, setLastDate] = useState<number>(() => {
    const saved = localStorage.getItem('beatify_sideload_last_date');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed)) return parsed;
    }
    const now = Date.now();
    localStorage.setItem('beatify_sideload_last_date', now.toString());
    return now;
  });

  const [remainingDays, setRemainingDays] = useState<number>(7);

  useEffect(() => {
    const calculateRemaining = () => {
      const elapsedMs = Date.now() - lastDate;
      const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
      const remaining = Math.max(0, Math.ceil(7 - elapsedDays));
      setRemainingDays(remaining);
    };

    calculateRemaining();
    const timer = setInterval(calculateRemaining, 60000); // kiểm tra mỗi phút
    return () => clearInterval(timer);
  }, [lastDate]);

  const handleResetDays = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = Date.now();
    setLastDate(now);
    localStorage.setItem('beatify_sideload_last_date', now.toString());
    setRemainingDays(7);
    toast.success('Đã làm mới chu kỳ 7 ngày cho Sideload iPhone! 🎉');
  };

  const isExpired = remainingDays <= 0;
  const isUrgent = remainingDays <= 2 && remainingDays > 0;

  return (
    <div
      className={`p-2.5 rounded-xl border transition-all text-xs select-none ${
        isExpired
          ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          : isUrgent
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          : 'bg-white/[0.03] border-white/[0.08] text-zinc-300'
      }`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {isExpired ? (
            <AlertOctagon size={13} className="text-rose-400 shrink-0 animate-bounce" />
          ) : isUrgent ? (
            <AlertTriangle size={13} className="text-amber-400 shrink-0" />
          ) : (
            <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
          )}

          <span className="font-semibold text-[11px] truncate">
            {isExpired
              ? 'App hết hạn 7 ngày!'
              : isUrgent
              ? `Sắp hết hạn: Còn ${remainingDays} ngày`
              : `Sideload: Còn ${remainingDays} ngày`}
          </span>
        </div>

        <button
          type="button"
          onClick={handleResetDays}
          className="p-1 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0"
          title="Bấm vào đây nếu bạn vừa cắm cáp gia hạn app bằng Sideloadly hôm nay"
        >
          <RefreshCw size={11} />
        </button>
      </div>

      {onOpenConnectModal && (
        <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-white/[0.04]">
          <span className="text-zinc-500">SideStore / Sideload</span>
          <button
            type="button"
            onClick={onOpenConnectModal}
            className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer font-medium transition-colors"
          >
            <Smartphone size={11} />
            <span>Mã QR kết nối</span>
          </button>
        </div>
      )}
    </div>
  );
};
