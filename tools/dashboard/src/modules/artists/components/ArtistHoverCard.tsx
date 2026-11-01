import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  User,
  Music,
  Disc,
  Clock,
  Folder,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchArtistsApi, openArtistFolderApi, type ArtistDetail } from '../api';

interface ArtistHoverCardProps {
  artistName?: string | null;
  children: React.ReactNode;
  className?: string;
  position?: 'top' | 'bottom';
}

function normalize(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const ArtistHoverCard: React.FC<ArtistHoverCardProps> = ({
  artistName,
  children,
  className = '',
  position = 'top',
}) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const triggerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tận dụng cache nghệ sĩ đã tải trong app
  const { data } = useQuery({
    queryKey: ['artists-list'],
    queryFn: fetchArtistsApi,
    staleTime: 60000,
  });

  const artistInfo: ArtistDetail | undefined = React.useMemo(() => {
    if (!artistName || !data?.artists) return undefined;
    const q = normalize(artistName);
    return data.artists.find((a) => normalize(a.name) === q);
  }, [artistName, data?.artists]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const gap = 10;
    const cardWidth = 280;

    let left = rect.left + rect.width / 2 - cardWidth / 2;
    // Đảm bảo không tràn màn hình trái / phải
    left = Math.max(12, Math.min(left, window.innerWidth - cardWidth - 12));

    let top: number;
    if (position === 'top') {
      top = rect.top - gap;
    } else {
      top = rect.bottom + gap;
    }

    setCoords({ top, left });
  }, [position]);

  const handleMouseEnter = () => {
    if (!artistName) return;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    openTimeoutRef.current = setTimeout(() => {
      updatePosition();
      setIsOpen(true);
    }, 200);
  };

  const handleMouseLeave = () => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  };

  const handlePopoverMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handlePopoverMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  };

  // Đóng khi người dùng cuộn trang
  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = () => setIsOpen(false);
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', handleScroll, { capture: true });
  }, [isOpen]);

  // Dọn dẹp timers khi unmount
  useEffect(() => {
    return () => {
      if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const handleGoToArtistProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    if (artistName) {
      navigate(`/artists?search=${encodeURIComponent(artistName)}`);
    }
  };

  const handleOpenFolder = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!artistName) return;
    try {
      const res = await openArtistFolderApi(artistName, artistInfo?.folderPath);
      toast.success(res.message || `Đã mở thư mục của ${artistName}`);
    } catch {
      toast.error('Không thể mở thư mục trên máy tính');
    }
  };

  const handleCopyName = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!artistName) return;
    navigator.clipboard.writeText(artistName);
    setIsCopied(true);
    toast.success(`Đã sao chép tên: "${artistName}"`);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`inline-block ${className}`}
    >
      {children}

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isOpen && artistName && coords && (
              <motion.div
                ref={popoverRef}
                onMouseEnter={handlePopoverMouseEnter}
                onMouseLeave={handlePopoverMouseLeave}
                initial={{ opacity: 0, y: position === 'top' ? 8 : -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: position === 'top' ? 6 : -6, scale: 0.96 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="fixed z-[10001] w-[280px] p-3.5 rounded-2xl border border-white/10 shadow-2xl text-left select-none pointer-events-auto backdrop-blur-2xl space-y-3"
                style={{
                  top: `${coords.top}px`,
                  left: `${coords.left}px`,
                  transform: position === 'top' ? 'translateY(-100%)' : 'translateY(0)',
                  backgroundColor: 'rgba(20, 20, 24, 0.96)',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)',
                }}
              >
                {/* Header: Avatar, Tên nghệ sĩ & Badge */}
                <div className="flex items-center gap-3 pb-2.5 border-b border-white/[0.08]">
                  <div className="relative w-11 h-11 rounded-full overflow-hidden border border-white/15 bg-black/40 shrink-0 flex items-center justify-center shadow-md">
                    {artistInfo?.avatarUrl ? (
                      <img
                        src={artistInfo.avatarUrl}
                        alt={artistName}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <User size={20} className="text-zinc-400" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-white tracking-tight truncate" title={artistName}>
                      {artistName}
                    </h4>
                    <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-medium text-emerald-400">
                      {artistInfo ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Trong thư viện Beatify</span>
                        </>
                      ) : (
                        <span className="text-zinc-400">Nghệ sĩ âm nhạc</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Thống kê nhanh (nếu tìm thấy trong thư viện) */}
                {artistInfo ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[10.5px] text-zinc-200 font-medium">
                        <Music size={11} className="text-emerald-400" />
                        <span>{artistInfo.trackCount} bài</span>
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[10.5px] text-zinc-200 font-medium">
                        <Disc size={11} className="text-indigo-400" />
                        <span>{artistInfo.albumCount} album</span>
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[10.5px] text-zinc-300 tabular-nums font-medium">
                        <Clock size={11} className="text-amber-400" />
                        <span>{formatDuration(artistInfo.totalDuration)}</span>
                      </span>
                    </div>

                    {/* 1 bài hát tiêu biểu */}
                    {artistInfo.tracks?.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-300 px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.04] truncate">
                        <Sparkles size={11} className="text-emerald-400 shrink-0" />
                        <span className="text-zinc-500 text-[10px] shrink-0">Nổi bật:</span>
                        <span className="truncate font-medium">{artistInfo.tracks[0].title}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-400">
                    Bấm nút bên dưới để tìm và khám phá các tác phẩm của nghệ sĩ này.
                  </p>
                )}

                {/* Hàng nút CTA nhỏ nhỏ thao tác nhanh */}
                <div className="pt-2 border-t border-white/[0.08] flex items-center gap-1.5">
                  {/* Nút 1: Hồ sơ nghệ sĩ */}
                  <button
                    type="button"
                    onClick={handleGoToArtistProfile}
                    className="flex-1 h-7 px-2.5 rounded-lg bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold text-[11px] flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    title={`Mở trang hồ sơ nghệ sĩ ${artistName}`}
                  >
                    <ExternalLink size={12} strokeWidth={2.5} />
                    <span>Hồ sơ</span>
                  </button>

                  {/* Nút 2: Mở thư mục trên máy tính (nếu có) */}
                  {artistInfo?.folderPath && (
                    <button
                      type="button"
                      onClick={handleOpenFolder}
                      className="h-7 px-2.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-zinc-200 hover:text-white font-medium text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      title="Mở thư mục trên máy tính (Explorer)"
                    >
                      <Folder size={12} className="text-emerald-400" />
                      <span>Thư mục</span>
                    </button>
                  )}

                  {/* Nút 3: Sao chép tên */}
                  <button
                    type="button"
                    onClick={handleCopyName}
                    className="w-7 h-7 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-zinc-300 hover:text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
                    title="Sao chép tên nghệ sĩ"
                  >
                    {isCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};
