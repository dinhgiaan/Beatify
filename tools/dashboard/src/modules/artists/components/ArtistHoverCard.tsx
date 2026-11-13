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
  Play,
  Pause,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchArtistsApi, openArtistFolderApi, type ArtistDetail, type ArtistTrack } from '../api';
import type { PlayingTrack } from '../../../app/Layout';

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

function formatTrackDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const ArtistHoverCard: React.FC<ArtistHoverCardProps> = ({
  artistName,
  children,
  className = '',
  position = 'top',
}) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; actualPosition: 'top' | 'bottom' } | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Đồng bộ trạng thái Media Player toàn cầu realtime
  const [playerState, setPlayerState] = useState<{ trackId?: string; isPlaying: boolean }>(() => {
    if (typeof window !== 'undefined') {
      const globalState = (window as unknown as { __BEATIFY_PLAYER_STATE__?: { trackId?: string; isPlaying?: boolean } }).__BEATIFY_PLAYER_STATE__;
      if (globalState) {
        return { trackId: globalState.trackId, isPlaying: !!globalState.isPlaying };
      }
    }
    return { trackId: undefined, isPlaying: false };
  });

  const triggerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialScrollYRef = useRef<number>(0);

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

  // Lắng nghe thay đổi trạng thái phát nhạc từ player dock hoặc các nguồn khác
  useEffect(() => {
    const handlePlayerStatus = (e: Event) => {
      const detail = (e as CustomEvent<{ trackId?: string; isPlaying: boolean }>).detail;
      if (detail) {
        setPlayerState({ trackId: detail.trackId, isPlaying: !!detail.isPlaying });
      }
    };
    window.addEventListener('beatify-player-status', handlePlayerStatus);
    return () => window.removeEventListener('beatify-player-status', handlePlayerStatus);
  }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const gap = 8;
    const cardWidth = 300;

    let left = rect.left + rect.width / 2 - cardWidth / 2;
    // Đảm bảo không tràn màn hình trái / phải
    left = Math.max(12, Math.min(left, window.innerWidth - cardWidth - 12));

    // Tự động đảo chiều nếu khoảng trống không đủ
    let actualPosition: 'top' | 'bottom' = position;
    if (position === 'top' && rect.top < 250) {
      actualPosition = 'bottom';
    } else if (position === 'bottom' && window.innerHeight - rect.bottom < 250) {
      actualPosition = 'top';
    }

    let top: number;
    if (actualPosition === 'top') {
      top = rect.top - gap;
    } else {
      top = rect.bottom + gap;
    }

    setCoords({ top, left, actualPosition });
  }, [position]);

  const handleMouseEnter = () => {
    if (!artistName) return;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    openTimeoutRef.current = setTimeout(() => {
      initialScrollYRef.current = window.scrollY;
      updatePosition();
      setIsOpen(true);
    }, 150);
  };

  const handleMouseLeave = () => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
    // Tăng thời gian chờ an toàn lên 350ms để người dùng di chuột qua cầu nối không bị đóng
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 350);
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
    }, 350);
  };

  // Đóng khi cuộn trang thực sự, nhưng bỏ qua nếu cuộn bên trong popover hoặc chỉ là vi rung động (<30px)
  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = (e: Event) => {
      if (popoverRef.current && popoverRef.current.contains(e.target as Node)) {
        return;
      }
      if (Math.abs(window.scrollY - initialScrollYRef.current) > 30) {
        setIsOpen(false);
      }
    };
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

  // Đồng bộ Play/Pause với Media Player chân trang
  const handlePlayTrack = (track: ArtistTrack, e: React.MouseEvent) => {
    e.stopPropagation();
    const isThisTrackCurrent = playerState.trackId === track.id;
    const isThisTrackPlaying = isThisTrackCurrent && playerState.isPlaying;

    if (isThisTrackCurrent) {
      // Toggle bài đang phát trong player
      window.dispatchEvent(new CustomEvent('beatify-toggle-play', { detail: { trackId: track.id } }));
      if (isThisTrackPlaying) {
        toast.info(`Đã tạm dừng: ${track.title}`);
      } else {
        toast.success(`Đang phát: ${track.title}`);
      }
      return;
    }

    // Chuyển sang bài mới
    const payload: PlayingTrack = {
      id: track.id,
      albumId: track.albumId,
      title: track.title,
      artist: artistName || 'Unknown Artist',
      fileUrl: `/local-api/stream/${track.id}`,
      coverUrl: track.id ? `/local-api/covers/${track.id}.jpg` : (track.albumId ? `/local-api/covers/${track.albumId}.jpg` : undefined),
    };

    window.dispatchEvent(new CustomEvent('beatify-play-track', { detail: payload }));
    toast.success(`Đang phát: ${track.title}`);
  };

  const actualPosition = coords?.actualPosition || position;

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
                initial={{ opacity: 0, y: actualPosition === 'top' ? 8 : -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: actualPosition === 'top' ? 6 : -6, scale: 0.96 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="fixed z-[10001] w-[300px] p-3.5 rounded-2xl border border-white/10 shadow-2xl text-left select-none pointer-events-auto backdrop-blur-2xl space-y-3"
                style={{
                  top: `${coords.top}px`,
                  left: `${coords.left}px`,
                  transform: actualPosition === 'top' ? 'translateY(-100%)' : 'translateY(0)',
                  backgroundColor: 'rgba(18, 18, 22, 0.96)',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)',
                }}
              >
                {/* Lớp đệm vô hình (Hover Bridge) nối liền giữa trigger và popover để chuột không bị lọt ra ngoài gây tự tắt */}
                <div
                  className={`absolute left-0 right-0 h-3.5 bg-transparent pointer-events-auto ${
                    actualPosition === 'top' ? '-bottom-3.5' : '-top-3.5'
                  }`}
                  aria-hidden="true"
                />

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
                  <div className="space-y-2.5">
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

                    {/* Danh sách bài hát nổi bật (1 đến 3 bài tiêu biểu có nút Play/Pause đồng bộ realtime) */}
                    {artistInfo.tracks?.length > 0 && (
                      <div className="space-y-1.5 pt-0.5">
                        <div className="flex items-center justify-between text-[10.5px] font-semibold text-zinc-400 uppercase tracking-wider px-0.5">
                          <span>Bài hát nổi bật</span>
                          <span className="text-[10px] text-zinc-500 font-normal">
                            Top {Math.min(3, artistInfo.tracks.length)}
                          </span>
                        </div>

                        <div className="space-y-1">
                          {artistInfo.tracks.slice(0, 3).map((track) => {
                            const isThisTrackCurrent = playerState.trackId === track.id;
                            const isThisTrackPlaying = isThisTrackCurrent && playerState.isPlaying;

                            return (
                              <div
                                key={track.id}
                                onClick={(e) => handlePlayTrack(track, e)}
                                className={`group flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer ${
                                  isThisTrackCurrent
                                    ? 'bg-emerald-500/15 border-emerald-500/35 shadow-[0_0_12px_rgba(16,185,129,0.12)]'
                                    : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.04] hover:border-white/10'
                                }`}
                                title={isThisTrackPlaying ? `Tạm dừng: ${track.title}` : `Phát bài này: ${track.title}`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <button
                                    type="button"
                                    onClick={(e) => handlePlayTrack(track, e)}
                                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 shadow-sm transition-all active:scale-90 cursor-pointer ${
                                      isThisTrackPlaying
                                        ? 'bg-emerald-400 text-black shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                                        : isThisTrackCurrent
                                        ? 'bg-emerald-500 text-black'
                                        : 'bg-emerald-500 hover:bg-emerald-400 text-black'
                                    }`}
                                    title={isThisTrackPlaying ? 'Tạm dừng bài này' : 'Phát bài này'}
                                  >
                                    {isThisTrackPlaying ? (
                                      <Pause size={10} fill="currentColor" />
                                    ) : (
                                      <Play size={10} fill="currentColor" className="ml-0.5" />
                                    )}
                                  </button>

                                  <span
                                    className={`text-[11.5px] truncate transition-colors ${
                                      isThisTrackCurrent
                                        ? 'font-semibold text-emerald-400'
                                        : 'font-medium text-zinc-200 group-hover:text-white'
                                    }`}
                                  >
                                    {track.title}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {/* Sóng nhạc nhảy sống động khi bài đang phát */}
                                  {isThisTrackPlaying && (
                                    <span className="flex items-end gap-0.5 h-3">
                                      <span className="w-0.5 h-3 bg-emerald-400 rounded-full animate-bounce" style={{ animationDuration: '0.6s' }} />
                                      <span className="w-0.5 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDuration: '0.8s', animationDelay: '0.15s' }} />
                                      <span className="w-0.5 h-2.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDuration: '0.7s', animationDelay: '0.3s' }} />
                                    </span>
                                  )}

                                  <span className="text-[10px] text-zinc-500 tabular-nums">
                                    {formatTrackDuration(track.duration)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-400">
                    Bấm nút bên dưới để tìm và khám phá các tác phẩm của nghệ sĩ này.
                  </p>
                )}

                {/* Hàng nút CTA nhỏ thao tác nhanh */}
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
