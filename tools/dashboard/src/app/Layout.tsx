import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, useNavigate } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Music,
  Play,
  Pause,
  X,
  Volume2,
  VolumeX,
  RotateCcw,
  RotateCw,
  Repeat,
  Repeat1,
  Shuffle,
  Mic2,
  Minus,
  Plus,
  Infinity as InfinityIcon,
  Sparkles,
} from 'lucide-react';
import { SidebarNav } from '../ui/organisms/SidebarNav';
import { SyncModal } from '../modules/sync/SyncModal';
import { ErrorBoundary } from '../ui/molecules/ErrorBoundary';
import { requestApi } from '../core/api-client';
import { parseLrc, findActiveLrcIndex, type LrcLine } from '@music-app/shared';
import { ArtistHoverCard } from '../modules/artists/components/ArtistHoverCard';

export interface PlayingTrack {
  id?: string;
  albumId?: string;
  title: string;
  artist: string;
  fileUrl: string;
  coverUrl?: string;
}

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // Audio player dock state
  const [currentTrack, setCurrentTrack] = useState<PlayingTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [loopMode, setLoopMode] = useState<'none' | 'count' | 'infinite'>('none');
  const [remainingLoops, setRemainingLoops] = useState(1);
  const [customLoopCount, setCustomLoopCount] = useState<number>(1);
  const [isLoopPopoverOpen, setIsLoopPopoverOpen] = useState(false);
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
  const [currentLyrics, setCurrentLyrics] = useState<string | null>(null);
  const [isAutoScrollLyrics, setIsAutoScrollLyrics] = useState(true);
  const [lyricsFontSize, setLyricsFontSize] = useState<'normal' | 'large'>('large');

  // Đóng màn hình lời bài hát khi nhấn phím Escape
  useEffect(() => {
    if (!isLyricsOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLyricsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLyricsOpen]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const loopPopoverRef = useRef<HTMLDivElement | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const lyricsLinesRef = useRef<(HTMLDivElement | null)[]>([]);
  const isUserScrollingRef = useRef(false);
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevActiveIndexRef = useRef<number>(-1);

  // Phân tích cú pháp lời đồng bộ (LRC)
  const parsedLyrics = useMemo<LrcLine[]>(() => {
    if (!currentLyrics) return [];
    return parseLrc(currentLyrics);
  }, [currentLyrics]);

  const hasSyncedLyrics = parsedLyrics.length > 0;

  // Cập nhật currentTime theo 60fps mượt mà khi audio đang phát
  useEffect(() => {
    if (!isPlaying) return;
    let animId: number;
    const tick = () => {
      if (audioRef.current && !audioRef.current.paused) {
        setCurrentTime(audioRef.current.currentTime);
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  // Xác định câu hát khớp với currentTime của audio (Spotify-style)
  const activeLyricIndex = useMemo(() => {
    if (!hasSyncedLyrics) return -1;
    return findActiveLrcIndex(parsedLyrics, currentTime);
  }, [hasSyncedLyrics, parsedLyrics, currentTime]);

  // Tự động cuộn êm ái bám sát từng câu hát (Spotify-style) phản hồi tức thì
  useEffect(() => {
    if (!isLyricsOpen || !hasSyncedLyrics || activeLyricIndex < 0 || !isAutoScrollLyrics) {
      return;
    }
    // Chỉ cuộn khi câu hát thật sự chuyển sang câu mới
    if (prevActiveIndexRef.current === activeLyricIndex) {
      return;
    }
    prevActiveIndexRef.current = activeLyricIndex;

    if (isUserScrollingRef.current) return;

    const container = lyricsContainerRef.current;
    const activeEl = lyricsLinesRef.current[activeLyricIndex];
    if (!container || !activeEl) return;

    // Vị trí cuộn đưa câu đang hát vào khoảng 38% phía trên màn hình (vị trí vàng của mắt)
    const targetScroll = activeEl.offsetTop - container.clientHeight * 0.38;

    container.scrollTo({
      top: Math.max(0, targetScroll),
      behavior: 'smooth',
    });
  }, [activeLyricIndex, isLyricsOpen, hasSyncedLyrics, isAutoScrollLyrics]);

  // Cuộn ngay đến dòng đang hát khi vừa mở popup lời bài hát
  useEffect(() => {
    if (isLyricsOpen && hasSyncedLyrics && activeLyricIndex >= 0) {
      prevActiveIndexRef.current = activeLyricIndex;
      const timer = setTimeout(() => {
        const container = lyricsContainerRef.current;
        const activeEl = lyricsLinesRef.current[activeLyricIndex];
        if (container && activeEl) {
          const targetScroll = activeEl.offsetTop - container.clientHeight * 0.38;
          container.scrollTo({
            top: Math.max(0, targetScroll),
            behavior: 'smooth',
          });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLyricsOpen]);

  // Tạm dừng auto-scroll CHỈ KHI người dùng thật sự lăn chuột hoặc chạm vuốt tay
  const handleUserScrollInteraction = () => {
    isUserScrollingRef.current = true;
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 2000);
  };

  // Bấm vào câu hát để tua nhạc đến mốc thời gian đó (Seek on click)
  const handleSeekToLyricTime = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
      if (!isPlaying) {
        audioRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  };

  // Click outside to close loop popover
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (loopPopoverRef.current && !loopPopoverRef.current.contains(e.target as Node)) {
        setIsLoopPopoverOpen(false);
      }
    };
    if (isLoopPopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isLoopPopoverOpen]);

  // Phát trạng thái player cho toàn bộ ứng dụng (ArtistHoverCard, modals, các trang khác)
  useEffect(() => {
    const detail = {
      trackId: currentTrack?.id,
      isPlaying,
      currentTrack,
    };
    (window as unknown as { __BEATIFY_PLAYER_STATE__?: unknown }).__BEATIFY_PLAYER_STATE__ = detail;
    window.dispatchEvent(new CustomEvent('beatify-player-status', { detail }));
  }, [currentTrack, isPlaying]);

  // Lắng nghe sự kiện phát bài hát từ các popup hoặc hover card toàn app
  useEffect(() => {
    const handleExternalPlay = (e: Event) => {
      const track = (e as CustomEvent<PlayingTrack>).detail;
      if (track) {
        handlePlayTrack(track);
      }
    };
    const handleExternalTogglePlay = (e: Event) => {
      const detail = (e as CustomEvent<{ trackId?: string }>).detail;
      if (detail?.trackId && currentTrack?.id && detail.trackId !== currentTrack.id) {
        return;
      }
      togglePlayPause();
    };

    window.addEventListener('beatify-play-track', handleExternalPlay);
    window.addEventListener('beatify-toggle-play', handleExternalTogglePlay);
    return () => {
      window.removeEventListener('beatify-play-track', handleExternalPlay);
      window.removeEventListener('beatify-toggle-play', handleExternalTogglePlay);
    };
  }, [currentTrack, isPlaying]);

  const handlePlayTrack = async (track: PlayingTrack) => {
    // Nếu bấm lại chính bài hát đang có trong player: toggle phát / tạm dừng
    if (currentTrack?.id && track.id && currentTrack.id === track.id) {
      if (audioRef.current) {
        if (isPlaying) {
          audioRef.current.pause();
          setIsPlaying(false);
        } else {
          audioRef.current.play().catch(() => {});
          setIsPlaying(true);
        }
      }
      return;
    }

    // Tự động suy luận coverUrl từ albumId hoặc trackId nếu chưa có
    const resolvedCoverUrl =
      track.coverUrl ||
      (track.albumId ? `/local-api/covers/${track.albumId}.jpg` : undefined) ||
      (track.id ? `/local-api/covers/${track.id}.jpg` : undefined);

    const trackWithCover = {
      ...track,
      coverUrl: resolvedCoverUrl,
    };

    setCurrentTrack(trackWithCover);
    setIsPlaying(true);
    setCurrentLyrics(null);

    // Tìm kiếm lời bài hát tương ứng nếu có
    if (track.id) {
      try {
        const res = await requestApi<{ lyrics?: string }>(`/api/youtube-music/downloads/${track.id}/lyrics`).catch(() => null);
        if (res?.lyrics) {
          setCurrentLyrics(res.lyrics);
        } else {
          const lrcRes = await requestApi<{ lyrics?: string }>(`/local-api/tracks/${track.id}/lyrics`).catch(() => null);
          if (lrcRes?.lyrics) {
            setCurrentLyrics(lrcRes.lyrics);
          }
        }
      } catch {
        // bỏ qua lỗi tìm lời
      }
    }

    if (audioRef.current) {
      audioRef.current.src = track.fileUrl;
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current.play().catch(() => {});
    }
  };

  const togglePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const toggleShuffle = () => {
    setIsShuffle((prev) => {
      const next = !prev;
      if (next) {
        toast.success('Đã BẬT phát ngẫu nhiên (Shuffle)', {
          description: 'Danh sách bài hát sẽ được phát theo thứ tự xáo trộn.',
        });
      } else {
        toast.info('Đã TẮT phát ngẫu nhiên', {
          description: 'Bài hát sẽ phát theo thứ tự danh sách thông thường.',
        });
      }
      return next;
    });
  };

  const handleTurnOffLoop = () => {
    setLoopMode('none');
    setIsLoopPopoverOpen(false);
    toast.info('Đã TẮT vòng lặp bài hát', {
      description: 'Bài hát sẽ dừng khi phát xong.',
    });
  };

  const handleApplyLoopCount = (count: number) => {
    const validCount = Math.max(1, count || 1);
    setLoopMode('count');
    setRemainingLoops(validCount);
    setIsLoopPopoverOpen(false);
    toast.success(`Đã BẬT lặp lại: ${validCount} lần`, {
      description: `Bài hát sẽ tự động phát lại ${validCount} lần.`,
    });
  };

  const handleApplyInfiniteLoop = () => {
    setLoopMode('infinite');
    setIsLoopPopoverOpen(false);
    toast.success('Đã BẬT lặp lại vô tận (∞)', {
      description: 'Bài hát sẽ liên tục phát lại không ngừng.',
    });
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleProgressSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const target = ratio * (duration || 0);
    audioRef.current.currentTime = target;
    setCurrentTime(target);
  };

  const seekBackward5s = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5);
    }
  };

  const seekForward5s = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 5);
    }
  };

  const handleAudioEnded = () => {
    if (loopMode === 'infinite') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
    } else if (loopMode === 'count' && remainingLoops > 0) {
      const nextCount = remainingLoops - 1;
      setRemainingLoops(nextCount);
      if (nextCount > 0) {
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        }
      } else {
        setLoopMode('none');
        setIsPlaying(false);
      }
    } else {
      setIsPlaying(false);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    if (audioRef.current) {
      audioRef.current.volume = val;
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      setIsMuted(false);
      audioRef.current.volume = volume || 0.5;
    } else {
      setIsMuted(true);
      audioRef.current.volume = 0;
    }
  };

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="h-screen overflow-hidden flex flex-col select-none"
      style={{ backgroundColor: 'var(--bg-page)' }}
    >
      <Toaster
        position="top-right"
        richColors
        closeButton
        duration={3500}
        visibleToasts={4}
        gap={8}
      />

      {/* Workspace Area: Sidebar & Main Page Content */}
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
        <SidebarNav onOpenSyncModal={() => setIsSyncModalOpen(true)} />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Scrollable Page Outlet with Error Boundary */}
          <main className="flex-1 overflow-y-auto">
            <div className="content-compact-scale animate-in fade-in duration-150">
              <ErrorBoundary>
                <Outlet
                  context={{
                    onPlayTrack: handlePlayTrack,
                    onOpenSyncModal: () => setIsSyncModalOpen(true),
                    playingTrackId: currentTrack?.id,
                    isAudioPlaying: isPlaying,
                    onTogglePlayPause: togglePlayPause,
                  }}
                />
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </div>

      {/* Audio Player Dock - Footer Bar chuẩn Spotify (chân trang cố định trong flex, không che đè Sidebar) */}
      <AnimatePresence>
        {currentTrack && (
          <motion.div
            data-player-dock="true"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="shrink-0 w-full z-40 border-t border-[var(--border)] bg-[var(--bg-surface)] px-6 py-2.5 flex items-center justify-between shadow-[0_-10px_40px_rgba(0,0,0,0.85)] gap-4 select-none relative"
            style={{ backgroundColor: 'var(--bg-surface)' }}
          >
            {/* Left: Cover & Info */}
            <div className="flex items-center gap-3 min-w-0 w-[240px] shrink-0">
              <div className="w-11 h-11 rounded-lg overflow-hidden border border-[var(--border)] bg-black/40 shrink-0 flex items-center justify-center shadow-sm relative">
                <Music size={18} className="text-[#1DB954] shrink-0" />
                {currentTrack.coverUrl && (
                  <img
                    key={`${currentTrack.id || ''}-${currentTrack.coverUrl}`}
                    src={currentTrack.coverUrl}
                      alt={currentTrack.title}
                      className="w-full h-full object-cover absolute inset-0"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-bold text-[var(--text-primary)] truncate" title={currentTrack.title}>
                    {currentTrack.title}
                  </div>
                  <ArtistHoverCard artistName={currentTrack.artist} position="top">
                    <button
                      type="button"
                      className="text-[11px] text-[var(--text-muted)] hover:text-white truncate cursor-pointer transition-colors block text-left hover:underline"
                      title={`Xem thông tin nghệ sĩ "${currentTrack.artist}"`}
                    >
                      {currentTrack.artist}
                    </button>
                  </ArtistHoverCard>
                </div>
              </div>

              {/* Center: Controls & Timeline */}
              <div className="flex flex-col items-center gap-1.5 flex-1 max-w-[620px]">
                {/* Buttons row */}
                <div className="flex items-center gap-3">
                  {/* Shuffle Button */}
                  <button
                    type="button"
                    onClick={toggleShuffle}
                    className={`p-1.5 rounded hover:bg-[var(--bg-hover)] transition-colors cursor-pointer ${
                      isShuffle ? 'text-[#1DB954]' : 'text-[var(--text-muted)] hover:text-white'
                    }`}
                    title={isShuffle ? 'Ngẫu nhiên: BẬT' : 'Ngẫu nhiên: Tắt'}
                  >
                    <Shuffle size={14} />
                  </button>

                  {/* Seek Backward 5s */}
                  <button
                    type="button"
                    onClick={seekBackward5s}
                    className="p-1.5 rounded text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                    title="Tua lùi 5 giây"
                  >
                    <RotateCcw size={14} />
                  </button>

                  {/* Play / Pause Main Button */}
                  <motion.button
                    type="button"
                    onClick={togglePlayPause}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    className="w-9 h-9 rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-black flex items-center justify-center shadow-md shadow-[#1DB954]/25 cursor-pointer shrink-0"
                  >
                    {isPlaying ? <Pause size={16} fill="black" /> : <Play size={16} fill="black" className="ml-0.5" />}
                  </motion.button>

                  {/* Seek Forward 5s */}
                  <button
                    type="button"
                    onClick={seekForward5s}
                    className="p-1.5 rounded text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                    title="Tua tới 5 giây"
                  >
                    <RotateCw size={14} />
                  </button>

                  {/* Loop Button with custom popover */}
                  <div className="relative" ref={loopPopoverRef}>
                    <button
                      type="button"
                      onClick={() => setIsLoopPopoverOpen((prev) => !prev)}
                      className={`flex items-center gap-0.5 p-1.5 rounded hover:bg-[var(--bg-hover)] transition-colors cursor-pointer ${
                        loopMode !== 'none' ? 'text-[#1DB954] bg-[#1DB954]/10' : 'text-[var(--text-muted)] hover:text-white'
                      }`}
                      title={
                        loopMode === 'none'
                          ? 'Vòng lặp: Đang tắt (Bấm để tùy chọn)'
                          : loopMode === 'count'
                          ? `Vòng lặp: Còn ${remainingLoops} lần (Bấm để tùy chọn)`
                          : 'Vòng lặp: Vô tận (Bấm để tùy chọn)'
                      }
                    >
                      {loopMode === 'count' ? <Repeat1 size={14} /> : <Repeat size={14} />}
                      {loopMode === 'count' && (
                        <span className="text-[10px] font-bold">{remainingLoops}</span>
                      )}
                      {loopMode === 'infinite' && (
                        <span className="text-[11px] font-bold leading-none">∞</span>
                      )}
                    </button>

                    {/* Custom Horizontal Loop Capsule Popover */}
                    <AnimatePresence>
                      {isLoopPopoverOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          transition={{ duration: 0.12, ease: 'easeOut' }}
                          className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 p-1 rounded-full border border-white/10 select-none z-[80] whitespace-nowrap shadow-2xl"
                          style={{
                            backgroundColor: 'rgba(22, 22, 26, 0.98)',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.08)',
                          }}
                        >
                          {/* Nút 1: Tắt vòng lặp */}
                          <button
                            type="button"
                            onClick={handleTurnOffLoop}
                            className={`h-7 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                              loopMode === 'none'
                                ? 'bg-white/15 text-white shadow-xs border border-white/20'
                                : 'text-zinc-400 hover:text-white hover:bg-white/10'
                            }`}
                            title="Tắt vòng lặp bài hát"
                          >
                            <RotateCcw size={12} className={loopMode === 'none' ? 'text-white' : 'text-zinc-400'} />
                            <span>Tắt</span>
                          </button>

                          {/* Divider */}
                          <div className="w-px h-4 bg-white/15" />

                          {/* Nút 2: Stepper Nhập số lần lặp & Nút Bật (Dàn ngang) */}
                          <div className="flex items-center gap-1 bg-white/5 p-0.5 rounded-full border border-white/10">
                            <button
                              type="button"
                              onClick={() => setCustomLoopCount((prev) => Math.max(1, prev - 1))}
                              disabled={customLoopCount <= 1}
                              className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/20 text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              title="Giảm 1 lần"
                            >
                              <Minus size={11} />
                            </button>

                            {/* Ô nhập số không có spinner mặc định */}
                            <input
                              type="number"
                              min={1}
                              max={99}
                              value={customLoopCount}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (isNaN(val)) {
                                  setCustomLoopCount(1);
                                } else {
                                  setCustomLoopCount(Math.min(99, Math.max(1, val)));
                                }
                              }}
                              className="w-7 h-6 bg-transparent text-center text-white font-extrabold text-xs focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none selection:bg-[#1DB954] selection:text-black"
                              title="Nhập số lần lặp"
                            />

                            <button
                              type="button"
                              onClick={() => setCustomLoopCount((prev) => Math.min(99, prev + 1))}
                              disabled={customLoopCount >= 99}
                              className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/20 text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              title="Tăng 1 lần"
                            >
                              <Plus size={11} />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleApplyLoopCount(customLoopCount)}
                              className={`h-6 px-2.5 ml-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all ${
                                loopMode === 'count'
                                  ? 'bg-[#1DB954] text-black shadow-sm'
                                  : 'bg-white/10 hover:bg-[#1DB954] text-white hover:text-black'
                              }`}
                              title={`Bật lặp lại ${customLoopCount} lần`}
                            >
                              <Repeat1 size={11} strokeWidth={2.5} />
                              <span>Lặp {customLoopCount} lần</span>
                            </button>
                          </div>

                          {/* Divider */}
                          <div className="w-px h-4 bg-white/15" />

                          {/* Nút 3: Lặp vô tận */}
                          <button
                            type="button"
                            onClick={handleApplyInfiniteLoop}
                            className={`h-7 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                              loopMode === 'infinite'
                                ? 'bg-[#1DB954] text-black font-bold shadow-sm'
                                : 'text-zinc-400 hover:text-white hover:bg-white/10'
                            }`}
                            title="Lặp lại liên tục không ngừng"
                          >
                            <InfinityIcon size={13} />
                            <span>Vô tận</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Lyrics Popup Button */}
                  <button
                    type="button"
                    onClick={() => setIsLyricsOpen((prev) => !prev)}
                    className={`p-1.5 rounded hover:bg-[var(--bg-hover)] transition-colors cursor-pointer ${
                      isLyricsOpen ? 'text-[#1DB954] bg-[#1DB954]/10' : 'text-[var(--text-muted)] hover:text-white'
                    }`}
                    title="Xem lời bài hát"
                  >
                    <Mic2 size={14} />
                  </button>
                </div>

                {/* Timeline Slider & Time */}
                <div className="w-full flex items-center gap-2.5 text-[11px] tabular-nums text-[var(--text-muted)]">
                  <span className="w-9 text-right">{formatTime(currentTime)}</span>
                  <div
                    ref={progressBarRef}
                    onClick={handleProgressSeek}
                    className="flex-1 h-1.5 bg-[var(--bg-subtle)] hover:h-2 rounded-full overflow-hidden cursor-pointer relative transition-all"
                  >
                    <div
                      className="h-full bg-[#1DB954] rounded-full transition-all duration-75"
                      style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-9">{formatTime(duration)}</span>
                </div>
              </div>

              {/* Right: Volume & Close */}
              <div className="flex items-center gap-3 w-[200px] justify-end shrink-0">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="p-1 rounded text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer"
                    title={isMuted ? 'Bật âm thanh' : 'Tắt tiếng'}
                  >
                    {isMuted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-16 h-1 bg-[var(--bg-subtle)] accent-[#1DB954] rounded-lg cursor-pointer"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (audioRef.current) audioRef.current.pause();
                    setCurrentTrack(null);
                    setIsPlaying(false);
                    setIsLyricsOpen(false);
                  }}
                  className="p-1 rounded text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer ml-1"
                  title="Đóng trình phát"
                >
                  <X size={16} />
                </button>
              </div>

              <audio
                ref={audioRef}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleAudioEnded}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

      {/* Full Lyrics Stage Screen - Chuẩn Apple Music & Spotify Immersive Stage (z-[9995]) */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isLyricsOpen && currentTrack && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="fixed inset-x-0 top-0 bottom-[74px] z-[9995] bg-[#070709] flex flex-col pointer-events-auto select-none overflow-hidden"
              >
                {/* Lớp nền Ambient Art & Multi-layer Glow phản chiếu màu sắc từ ảnh bìa album */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
                  {currentTrack.coverUrl ? (
                    <div
                      className="absolute inset-0 bg-cover bg-center scale-150 blur-[120px] opacity-35 transition-all duration-1000"
                      style={{ backgroundImage: `url(${currentTrack.coverUrl})` }}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-tr from-emerald-950/40 via-zinc-900 to-black/90" />
                  )}
                  {/* Quầng sáng đa sắc nhịp nhàng tạo chiều sâu không gian */}
                  <div
                    className="absolute top-1/4 left-1/4 w-[520px] h-[520px] bg-[#1DB954]/15 rounded-full blur-[140px] animate-pulse"
                    style={{ animationDuration: '6s' }}
                  />
                  <div
                    className="absolute bottom-1/4 right-1/3 w-[460px] h-[460px] bg-indigo-500/12 rounded-full blur-[150px] animate-pulse"
                    style={{ animationDuration: '8s', animationDelay: '2s' }}
                  />
                  {/* Lớp vignette phủ mờ gradient đảm bảo độ tương phản hoàn hảo cho lời bài hát */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/75 to-[#070709]/95" />
                </div>

                {/* Top Header Bar */}
                <div className="relative z-10 h-16 px-6 lg:px-12 border-b border-white/[0.08] flex items-center justify-between shrink-0 bg-black/30 backdrop-blur-xl">
                  {/* Left: Badge sân khấu & Tiêu đề nhỏ */}
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-white/10 text-white border border-white/15 shadow-sm">
                      <Sparkles size={12} className="text-[#1DB954]" />
                      <span>Sân khấu lời bài hát</span>
                    </span>
                    <span className="text-xs text-zinc-400 hidden sm:inline">
                      • Bấm vào bất kỳ câu nào để tua nhạc đến mốc đó
                    </span>
                  </div>

                  {/* Right: Điều khiển (Cỡ chữ, Tự cuộn, Nút Đóng) */}
                  <div className="flex items-center gap-2.5">
                    {/* Nút chỉnh cỡ chữ */}
                    <div className="flex items-center p-0.5 rounded-xl bg-white/[0.08] border border-white/10 text-xs">
                      <button
                        type="button"
                        onClick={() => setLyricsFontSize('normal')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          lyricsFontSize === 'normal'
                            ? 'bg-white/20 text-white shadow-xs'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Cỡ chữ vừa"
                      >
                        A-
                      </button>
                      <button
                        type="button"
                        onClick={() => setLyricsFontSize('large')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          lyricsFontSize === 'large'
                            ? 'bg-white/20 text-white shadow-xs'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Cỡ chữ lớn"
                      >
                        A+
                      </button>
                    </div>

                    {/* Nút Tự cuộn */}
                    {hasSyncedLyrics && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsAutoScrollLyrics((prev) => {
                            const next = !prev;
                            if (next) toast.success('Đã BẬT tự động cuộn lời');
                            else toast.info('Đã TẮT tự động cuộn lời');
                            return next;
                          });
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                          isAutoScrollLyrics
                            ? 'bg-[#1DB954]/20 border-[#1DB954]/40 text-[#1DB954] shadow-xs'
                            : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                        }`}
                        title={isAutoScrollLyrics ? 'Tự cuộn đang bật' : 'Bấm để bật tự cuộn'}
                      >
                        <RotateCcw
                          size={11}
                          className={isAutoScrollLyrics ? 'animate-spin' : ''}
                          style={{ animationDuration: '10s' }}
                        />
                        <span>{isAutoScrollLyrics ? 'Tự cuộn: Bật' : 'Tự cuộn: Tắt'}</span>
                      </button>
                    )}

                    {/* Nút Đóng */}
                    <button
                      type="button"
                      onClick={() => setIsLyricsOpen(false)}
                      className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-zinc-300 hover:text-white flex items-center justify-center transition-all cursor-pointer shrink-0 ml-1"
                      title="Đóng lời bài hát (Phím Escape)"
                    >
                      <X size={17} />
                    </button>
                  </div>
                </div>

                {/* Main Content: Split Screen - Left Hero Art & Right Fluid Lyrics Stage */}
                <div className="relative z-10 flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden px-6 lg:px-14 py-8 gap-8 lg:gap-14">
                  {/* Cột trái: Album Art & Mini Player Stage (Now Playing Hero) */}
                  <div className="hidden md:flex flex-col justify-center items-center w-[300px] lg:w-[360px] shrink-0 space-y-6 select-none">
                    {/* Bìa Album lớn với hiệu ứng Glow hào quang */}
                    <div className="relative group/cover">
                      {currentTrack.coverUrl && (
                        <div
                          className="absolute -inset-3 rounded-3xl bg-cover bg-center blur-2xl opacity-45 group-hover/cover:opacity-65 transition-opacity duration-500"
                          style={{ backgroundImage: `url(${currentTrack.coverUrl})` }}
                        />
                      )}
                      <div className="relative w-64 h-64 lg:w-72 lg:h-72 rounded-3xl overflow-hidden border border-white/15 bg-black/60 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.9)] flex items-center justify-center">
                        {currentTrack.coverUrl ? (
                          <img
                            src={currentTrack.coverUrl}
                            alt={currentTrack.title}
                            className="w-full h-full object-cover transition-transform duration-700 group-hover/cover:scale-105"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <Music size={64} className="text-zinc-600" />
                        )}
                      </div>
                    </div>

                    {/* Tên bài hát & Nghệ sĩ */}
                    <div className="text-center w-full max-w-[320px] space-y-1.5">
                      <h2
                        className="text-xl lg:text-2xl font-black text-white tracking-tight truncate drop-shadow-md"
                        title={currentTrack.title}
                      >
                        {currentTrack.title}
                      </h2>
                      <div className="flex items-center justify-center">
                        <ArtistHoverCard artistName={currentTrack.artist} position="top">
                          <button
                            type="button"
                            className="text-sm text-zinc-300 hover:text-emerald-400 font-medium transition-colors cursor-pointer truncate hover:underline"
                            title={`Xem thông tin nghệ sĩ ${currentTrack.artist}`}
                          >
                            {currentTrack.artist}
                          </button>
                        </ArtistHoverCard>
                      </div>
                    </div>

                    {/* Sóng âm Equalizer nhảy múa sinh động khi bài đang phát */}
                    <div className="flex items-center gap-1 h-6">
                      {isPlaying ? (
                        <>
                          <span className="w-1 h-6 bg-emerald-400 rounded-full animate-bounce" style={{ animationDuration: '0.6s' }} />
                          <span className="w-1 h-4 bg-emerald-400 rounded-full animate-bounce" style={{ animationDuration: '0.8s', animationDelay: '0.15s' }} />
                          <span className="w-1 h-5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDuration: '0.7s', animationDelay: '0.3s' }} />
                          <span className="w-1 h-3 bg-emerald-400 rounded-full animate-bounce" style={{ animationDuration: '0.9s', animationDelay: '0.2s' }} />
                          <span className="w-1 h-5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDuration: '0.75s', animationDelay: '0.1s' }} />
                        </>
                      ) : (
                        <span className="text-xs text-zinc-500 font-medium">Đang tạm dừng</span>
                      )}
                    </div>

                    {/* Mini Quick Controls ngay trên Stage */}
                    <div className="flex items-center gap-4 pt-1">
                      <button
                        type="button"
                        onClick={seekBackward5s}
                        className="p-2.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        title="Tua lùi 5 giây"
                      >
                        <RotateCcw size={18} />
                      </button>

                      <button
                        type="button"
                        onClick={togglePlayPause}
                        className="w-12 h-12 rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-black flex items-center justify-center shadow-lg transition-transform active:scale-90 cursor-pointer"
                        title={isPlaying ? 'Tạm dừng (Phím Space)' : 'Phát tiếp (Phím Space)'}
                      >
                        {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={seekForward5s}
                        className="p-2.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        title="Tua tới 5 giây"
                      >
                        <RotateCw size={18} />
                      </button>
                    </div>

                    {/* Timeline trực quan mini */}
                    <div className="w-full max-w-[280px] flex items-center gap-2 text-xs text-zinc-400 tabular-nums">
                      <span className="w-8 text-right font-mono">{formatTime(currentTime)}</span>
                      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 rounded-full transition-all duration-100"
                          style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="w-8 font-mono">{formatTime(duration)}</span>
                    </div>
                  </div>

                  {/* Cột phải: Sân khấu cuộn lời bài hát đắm chìm (Fluid Lyrics Stage) */}
                  <div
                    ref={lyricsContainerRef}
                    onWheel={handleUserScrollInteraction}
                    onTouchMove={handleUserScrollInteraction}
                    className="flex-1 h-full min-h-0 overflow-y-auto px-2 lg:px-8 py-8 select-text scroll-smooth"
                    style={{
                      maskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)',
                      WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)',
                    }}
                  >
                    <div className="max-w-2xl w-full">
                      {hasSyncedLyrics ? (
                        <div className="space-y-4 py-8">
                          {parsedLyrics.map((line, idx) => {
                            const isActive = idx === activeLyricIndex;
                            const isPast = activeLyricIndex >= 0 && idx < activeLyricIndex;

                            return (
                              <div
                                key={idx}
                                ref={(el) => {
                                  lyricsLinesRef.current[idx] = el;
                                }}
                                onClick={() => handleSeekToLyricTime(line.time)}
                                className={`group/line rounded-2xl cursor-pointer transition-all duration-300 select-text py-2.5 px-4 relative ${
                                  isActive
                                    ? 'bg-white/[0.06] text-white opacity-100 font-black scale-[1.02] origin-left shadow-xs'
                                    : isPast
                                    ? 'text-zinc-400 opacity-25 hover:opacity-75 font-bold hover:text-zinc-200'
                                    : 'text-zinc-300 opacity-40 hover:opacity-90 font-bold hover:text-white'
                                }`}
                                title={`Bấm để tua đến: ${Math.floor(line.time / 60)}:${String(Math.floor(line.time % 60)).padStart(2, '0')}`}
                              >
                                {isActive && (
                                  <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-7 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                                )}

                                <span
                                  className={`tracking-tight block leading-[1.65] transition-all duration-200 ${
                                    lyricsFontSize === 'large'
                                      ? isActive
                                        ? 'text-[28px] sm:text-[34px]'
                                        : 'text-[24px] sm:text-[28px]'
                                      : isActive
                                      ? 'text-[22px] sm:text-[26px]'
                                      : 'text-[18px] sm:text-[22px]'
                                  } ${
                                    isActive
                                      ? 'text-white drop-shadow-[0_4px_24px_rgba(255,255,255,0.4)]'
                                      : ''
                                  }`}
                                >
                                  {line.text || '♪'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : currentLyrics ? (
                        <div className="space-y-4 py-8">
                          {currentLyrics.split('\n').map((rawLine, idx) => {
                            const cleanLine = rawLine.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, '').trim();
                            if (!cleanLine) return <div key={idx} className="h-4" />;
                            return (
                              <p
                                key={idx}
                                className={`font-semibold text-white/80 hover:text-white transition-colors cursor-default leading-[1.7] ${
                                  lyricsFontSize === 'large'
                                    ? 'text-[24px] sm:text-[28px]'
                                    : 'text-[19px] sm:text-[22px]'
                                }`}
                              >
                                {cleanLine}
                              </p>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center py-28 text-zinc-500 gap-4">
                          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 shadow-lg">
                            <Mic2 size={32} className="text-emerald-400 animate-pulse" />
                          </div>
                          <div>
                            <p className="text-base font-bold text-zinc-200">Chưa có lời đồng bộ cho bài hát này</p>
                            <p className="text-xs text-zinc-500 max-w-sm mt-1">
                              Bạn có thể dùng tính năng &quot;Chỉnh sửa lời bài hát&quot; trong mục Tải nhạc hoặc thêm tệp .lrc vào cùng thư mục bài hát.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Cloudflare Sync Modal */}
      <SyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
      />
    </div>
  );
};
