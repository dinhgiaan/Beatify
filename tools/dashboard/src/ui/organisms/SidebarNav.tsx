import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Music2,
  History,
  FolderCheck,
  Library,
  Users,
  Trash2,
  ListMusic,
  Sun,
  Moon,
  HardDrive,
  Smartphone,
  QrCode,
} from 'lucide-react';
import { requestApi } from '../../core/api-client';
import { useTheme } from '../../core/theme';
import { ConnectAppModal } from '../../modules/sync/ConnectAppModal';

interface SystemStatus {
  configured: boolean;
  bucket: string;
  accountId: string | null;
  sourceDir: string;
  importDir: string | null;
  fileCount: number;
  totalMB: string;
  syncedMB?: string;
  syncedCount?: number;
  unsyncedMB?: string;
  unsyncedCount?: number;
  freeLimitGB: number;
  usedPercent: string;
}

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const SidebarNav: React.FC<{
  onOpenSyncModal: () => void;
}> = () => {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [isConnectModalOpen, setIsConnectModalOpen] = React.useState(false);

  // Clock state format Vietnam
  const [now, setNow] = React.useState(new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentTimeStr = now.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const currentDateStr = now.toLocaleDateString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const { data: status } = useQuery<SystemStatus>({
    queryKey: ['system-status'],
    queryFn: () => requestApi<SystemStatus>('/local-api/status'),
    refetchInterval: 10000,
  });

  const usedPct = status ? Math.min(100, parseFloat(status.usedPercent) || 0) : 0;

  const navSections: NavSection[] = [

    {
      title: 'TỔNG QUAN',
      items: [
        {
          label: 'Bảng điều khiển',
          path: '/dashboard',
          icon: <LayoutDashboard size={16} />,
        },
      ],
    },
    {
      title: 'NGUỒN NHẠC',
      items: [
        {
          label: 'Tải YouTube',
          path: '/youtube-music',
          icon: <Music2 size={16} />,
        },
        {
          label: 'Quản lý bài tải',
          path: '/youtube-music/manager',
          icon: <FolderCheck size={16} />,
        },
        {
          label: 'Lịch sử',
          path: '/youtube-music/history',
          icon: <History size={16} />,
        },
      ],
    },
    {
      title: 'KHO NHẠC',
      items: [
        {
          label: 'Thư viện',
          path: '/library',
          icon: <Library size={16} />,
        },
        {
          label: 'Danh sách phát',
          path: '/playlists',
          icon: <ListMusic size={16} />,
        },
        {
          label: 'Nghệ sĩ',
          path: '/artists',
          icon: <Users size={16} />,
        },
        {
          label: 'Thùng rác',
          path: '/trash',
          icon: <Trash2 size={16} />,
        },
      ],
    },
  ];

  return (
    <aside
      className="w-64 border-r flex flex-col shrink-0 select-none h-full min-h-0 text-xs relative z-20"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Brand Header & Vietnam Clock */}
      <div className="p-4 border-b border-[var(--border)] shrink-0 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <motion.div
              whileHover={{ scale: 1.08, rotate: -4 }}
              whileTap={{ scale: 0.94 }}
              className="w-7 h-7 rounded-lg bg-[#1DB954] flex items-center justify-center text-black font-black text-xs shrink-0 shadow-sm"
            >
              <span>B</span>
            </motion.div>

            <span className="text-base font-bold tracking-tight text-white">
              Beatify
            </span>
          </div>

          {/* Theme toggle */}
          <motion.button
            type="button"
            onClick={toggleTheme}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer border border-transparent hover:border-[var(--border)]"
            title={`Chuyển sang giao diện ${theme === 'dark' ? 'Sáng' : 'Tối'}`}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </motion.button>
        </div>

        {/* Đồng hồ & Ngày tháng chuẩn định dạng Việt Nam */}
        <div className="px-2 py-1 rounded-md bg-[var(--bg-subtle)] border border-[var(--border)] flex items-center justify-between text-[10px] text-[var(--text-muted)] font-normal">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954] animate-pulse" />
            <span className="text-[10.5px] text-[#1DB954] tabular-nums font-normal">
              {currentTimeStr}
            </span>
          </div>
          <span className="text-[9.5px] text-[var(--text-muted)] font-normal">
            {currentDateStr}
          </span>
        </div>
      </div>

      {/* Navigation container */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {navSections.map((sec) => (
          <div key={sec.title} className="space-y-1">
            <div className="px-3 py-1.5 text-xs font-semibold tracking-wider text-zinc-400 uppercase flex items-center justify-between">
              <span>{sec.title}</span>
            </div>

            {sec.items.map((item) => {
              const isActive =
                item.path === '/dashboard'
                  ? location.pathname === '/dashboard' || location.pathname === '/'
                  : item.path === '/youtube-music/manager'
                  ? location.pathname.startsWith('/youtube-music/manager')
                  : item.path === '/youtube-music/history'
                  ? location.pathname === '/youtube-music/history'
                  : item.path === '/youtube-music'
                  ? location.pathname === '/youtube-music'
                  : location.pathname.startsWith(item.path);

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className="relative block"
                >
                  <motion.div
                    whileHover={{ x: isActive ? 0 : 3 }}
                    transition={{ duration: 0.15 }}
                    className={`relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs transition-colors duration-150 border cursor-pointer ${
                      isActive
                        ? 'border-[#1DB954]/30 text-[#1DB954] font-bold'
                        : 'border-transparent text-zinc-300 hover:text-white hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {/* Active Background Pill sliding via layoutId */}
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-active-bg"
                        className="absolute inset-0 rounded-xl bg-[#1DB954]/12 border border-[#1DB954]/30 pointer-events-none"
                        transition={{
                          type: 'spring',
                          stiffness: 450,
                          damping: 34,
                        }}
                      />
                    )}

                    {/* Active Indicator Bar on the left */}
                    {isActive && (
                      <motion.span
                        layoutId="sidebar-active-indicator"
                        className="w-1 h-3.5 rounded-full bg-[#1DB954] shrink-0 relative z-10"
                        transition={{
                          type: 'spring',
                          stiffness: 450,
                          damping: 34,
                        }}
                      />
                    )}

                    <span
                      className={`shrink-0 transition-transform duration-150 relative z-10 ${
                        isActive
                          ? 'text-[#1DB954]'
                          : 'text-zinc-400 group-hover:text-white'
                      }`}
                    >
                      {item.icon}
                    </span>

                    <span className="truncate text-xs relative z-10">{item.label}</span>

                    {isActive && (
                      <motion.span
                        layoutId="sidebar-active-dot"
                        className="ml-auto w-1.5 h-1.5 rounded-full bg-[#1DB954] shrink-0 relative z-10"
                        transition={{
                          type: 'spring',
                          stiffness: 450,
                          damping: 34,
                        }}
                      />
                    )}
                  </motion.div>
                </NavLink>
              );
            })}
          </div>
        ))}
      </div>

      {/* Storage Dock & iPhone Connect */}
      <div className="p-3 border-t border-[var(--border)] space-y-2.5 shrink-0 bg-[var(--bg-surface)]">
        {/* Nút Kết nối iPhone (Mã QR) */}
        <button
          type="button"
          onClick={() => setIsConnectModalOpen(true)}
          className="w-full flex items-center justify-between p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-emerald-500/30 transition-all cursor-pointer group text-left shadow-sm"
          title="Quét mã QR bằng Camera iPhone để tự động cấu hình kết nối Beatify"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[#1DB954] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Smartphone size={14} />
            </div>
            <div className="min-w-0">
              <div className="text-[11.5px] font-semibold text-white tracking-tight">Kết nối iPhone</div>
              <div className="text-[10px] text-zinc-400 truncate">Quét mã QR đồng bộ</div>
            </div>
          </div>
          <div className="w-6 h-6 rounded-md bg-white/[0.05] flex items-center justify-center text-zinc-400 group-hover:text-emerald-400 shrink-0 transition-colors">
            <QrCode size={12} />
          </div>
        </button>

        {/* Khung dung lượng R2 thiết kế card cao cấp, phân cấp rõ rệt */}
        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
          {/* Tiêu đề chính & Tỷ lệ % */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <HardDrive size={13} className="text-[#1DB954]" />
              <span className="text-[11px] font-bold text-zinc-200 uppercase tracking-wider">
                Dung lượng R2
              </span>
            </div>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${
                usedPct > 80
                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                  : usedPct > 50
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              }`}
            >
              {usedPct.toFixed(1)}%
            </span>
          </div>

          {/* Progress bar có chiều sâu */}
          <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-[width] duration-300 ease-out"
              style={{ width: `${Math.min(100, Math.max(usedPct > 0 ? 3 : 0, usedPct))}%` }}
            />
          </div>

          {/* Tiêu đề phụ: Số liệu chi tiết phân cấp */}
          <div className="space-y-1.5 pt-0.5">
            <div className="flex items-center justify-between text-[10.5px]">
              <span className="text-zinc-300 font-medium">
                Đã dùng:{' '}
                <strong className="text-white font-semibold">
                  {status?.syncedMB ?? '0'} MB
                </strong>{' '}
                <span className="text-zinc-500">({status?.syncedCount ?? 0} bài)</span>
              </span>
              <span className="text-zinc-500 font-medium">/ 10 GB</span>
            </div>

            {/* Thông báo nếu có bài hát chưa upload */}
            {Number(status?.unsyncedCount || 0) > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10.5px] text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                <span className="truncate">
                  Chờ đồng bộ:{' '}
                  <strong className="text-amber-200 font-semibold">
                    {status?.unsyncedMB ?? '0'} MB
                  </strong>{' '}
                  ({status?.unsyncedCount ?? 0} bài)
                </span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Modal Kết nối iPhone bằng mã QR */}
      <ConnectAppModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
      />
    </aside>
  );
};
