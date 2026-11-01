import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  X,
  Play,
  Pause,
  Folder,
  Camera,
  GitMerge,
  Disc,
  Clock,
  Music,
  Users,
  Check,
  CloudOff,
} from 'lucide-react';
import { Button } from '../../../ui/atoms/Button';
import { openArtistFolderApi, type ArtistDetail, type ArtistTrack } from '../api';
import type { PlayingTrack } from '../../../app/Layout';

interface ArtistDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  artist: ArtistDetail | null;
  onOpenAvatarDialog: (artist: ArtistDetail) => void;
  onOpenMergeDialog: (artist: ArtistDetail) => void;
  onPlayTrack?: (track: PlayingTrack) => void;
  playingTrackId?: string;
  isAudioPlaying?: boolean;
  onTogglePlayPause?: () => void;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatTotalTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return `${h} giờ ${m} phút`;
  }
  return `${m} phút`;
}

export const ArtistDetailDialog: React.FC<ArtistDetailDialogProps> = ({
  isOpen,
  onClose,
  artist,
  onOpenAvatarDialog,
  onOpenMergeDialog,
  onPlayTrack,
  playingTrackId,
  isAudioPlaying,
  onTogglePlayPause,
}) => {
  if (!isOpen || !artist) return null;

  const handleOpenFolder = async () => {
    try {
      const res = await openArtistFolderApi(artist.name, artist.folderPath);
      toast.success(res.message || 'Đã mở thư mục trong Windows Explorer');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Không thể mở thư mục: ${msg}`);
    }
  };

  const handlePlayArtistTrack = (track: ArtistTrack) => {
    if (!onPlayTrack) return;
    onPlayTrack({
      id: track.id,
      albumId: track.albumId,
      title: track.title,
      artist: artist.name,
      fileUrl: `/local-api/stream/${track.id}`,
      coverUrl: `/local-api/covers/${track.albumId || track.id}.jpg`,
    });
    toast.success(`Đang phát: ${track.title}`);
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-24 bg-black/75 animate-in fade-in duration-150"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="w-[94vw] max-w-5xl max-h-[88vh] flex flex-col rounded-3xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden"
        >
          {/* Hero Banner Header */}
          <div className="relative p-6 sm:p-7 bg-gradient-to-b from-emerald-950/40 via-[var(--bg-surface)] to-[var(--bg-surface)] border-b border-[var(--border)] shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-black/40 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/60 transition-colors cursor-pointer z-10"
            >
              <X size={18} />
            </button>

            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6">
              {/* Avatar tròn to rõ với nút đổi ảnh nhanh */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => onOpenAvatarDialog(artist)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenAvatarDialog(artist);
                  }
                }}
                className="relative group shrink-0 cursor-pointer focus:outline-none"
                title="Bấm để đổi ảnh đại diện nghệ sĩ"
              >
                <div className="w-36 h-36 sm:w-40 sm:h-40 rounded-full overflow-hidden border-2 border-emerald-500/60 shadow-2xl bg-black/40 flex items-center justify-center transition-all duration-300 group-hover:border-emerald-400 group-hover:shadow-emerald-500/20 group-hover:scale-[1.02]">
                  <img
                    src={artist.avatarUrl}
                    alt={artist.name}
                    className="w-full h-full object-cover group-hover:brightness-75 transition-all duration-300"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                  {!artist.hasAvatar && (
                    <Users size={48} className="text-[var(--text-muted)]" />
                  )}
                  {/* Overlay mờ hiển thị icon camera + chữ khi hover */}
                  <div className="absolute inset-0 rounded-full bg-black/55 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity duration-200">
                    <Camera size={26} className="text-emerald-400 mb-1 drop-shadow" />
                    <span className="text-[11px] font-bold text-white drop-shadow tracking-wide">
                      Đổi avatar
                    </span>
                  </div>
                </div>

                {/* Badge camera nhỏ ở góc dưới */}
                <div className="absolute bottom-1 right-1 w-8 h-8 rounded-full bg-emerald-500 border-2 border-[var(--bg-surface)] text-black flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <Camera size={14} className="stroke-[2.5]" />
                </div>
              </div>

              {/* Thông tin nghệ sĩ */}
              <div className="space-y-2.5 text-center sm:text-left flex-1 min-w-0">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[11px] font-semibold">
                  <span>NGHỆ SĨ TRONG THƯ VIỆN</span>
                </div>
                <h2 className="text-2xl sm:text-4xl font-extrabold text-[var(--text-primary)] tracking-tight truncate">
                  {artist.name}
                </h2>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-[var(--text-secondary)]">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Music size={13} className="text-emerald-400" />
                    <span>{artist.trackCount} bài hát</span>
                  </span>
                  {artist.albumCount > 0 && (
                    <span className="flex items-center gap-1.5 font-medium">
                      <Disc size={13} className="text-emerald-400" />
                      <span>{artist.albumCount} album phòng thu</span>
                    </span>
                  )}
                  {Number(artist.singleCount) > 0 && (
                    <span className="flex items-center gap-1.5 font-medium text-emerald-400">
                      <span>{artist.singleCount} đĩa đơn (Singles)</span>
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 font-medium">
                    <Clock size={13} className="text-emerald-400" />
                    <span>{formatTotalTime(artist.totalDuration)}</span>
                  </span>
                </div>

                {/* Toolbar Buttons */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onOpenAvatarDialog(artist)}
                    className="gap-1.5 text-xs font-semibold"
                  >
                    <Camera size={13} />
                    <span>Đổi ảnh đại diện</span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onOpenMergeDialog(artist)}
                    className="gap-1.5 text-xs font-semibold"
                  >
                    <GitMerge size={13} />
                    <span>Gộp tên nghệ sĩ</span>
                  </Button>
                  {artist.folderPath && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleOpenFolder}
                      className="gap-1.5 text-xs font-semibold"
                    >
                      <Folder size={13} />
                      <span>Mở thư mục</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Body: Albums & Tracks */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-7 space-y-7">
            {/* Albums Section (Chỉ hiển thị Album phòng thu thật) */}
            {artist.albums.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
                  <Disc size={14} className="text-emerald-400" />
                  <span>Album phòng thu ({artist.albums.length})</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                  {artist.albums.map((alb) => (
                    <div
                      key={alb.id}
                      className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] hover:border-emerald-500/40 hover:bg-[var(--bg-hover)] transition-all flex items-center gap-3 cursor-pointer shadow-xs"
                    >
                      <div className="w-12 h-12 rounded-lg bg-black/40 border border-[var(--border)] overflow-hidden shrink-0 flex items-center justify-center">
                        <img
                          src={`/local-api/cover/${alb.id}`}
                          alt={alb.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-xs text-[var(--text-primary)] truncate" title={alb.title}>
                          {alb.title}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          {alb.trackCount} bài {alb.year ? `· ${alb.year}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Singles & EPs Section (Đĩa đơn & Bài lẻ chuẩn Spotify) */}
            {artist.singles && artist.singles.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
                  <Music size={14} className="text-emerald-400" />
                  <span>Đĩa đơn & Bài lẻ (Singles & EPs)</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                  {artist.singles.map((alb) => (
                    <div
                      key={alb.id}
                      className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] hover:border-emerald-500/40 hover:bg-[var(--bg-hover)] transition-all flex items-center gap-3 cursor-pointer shadow-xs"
                    >
                      <div className="w-12 h-12 rounded-lg bg-black/40 border border-[var(--border)] overflow-hidden shrink-0 flex items-center justify-center">
                        <img
                          src={`/local-api/cover/${alb.id}`}
                          alt={alb.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-xs text-[var(--text-primary)] truncate" title={alb.title}>
                          {alb.title}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          {alb.trackCount} bài đĩa đơn
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tracks Section */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
                <Music size={14} className="text-emerald-400" />
                <span>Tất cả bài hát ({artist.tracks.length})</span>
              </h4>

              <div className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--bg-subtle)]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--bg-surface)] text-[10.5px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                      <th className="py-2.5 pl-3 pr-1 w-10 text-center">#</th>
                      <th className="py-2.5 px-3">TÊN BÀI HÁT</th>
                      <th className="py-2.5 px-3">ALBUM</th>
                      <th className="py-2.5 px-3 text-center">ĐỊNH DẠNG</th>
                      <th className="py-2.5 px-3 text-center">TRẠNG THÁI</th>
                      <th className="py-2.5 pr-4 pl-2 text-right">THỜI LƯỢNG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {artist.tracks.map((track, idx) => {
                      const isCurrent = playingTrackId === track.id;
                      const isPlayingNow = isCurrent && isAudioPlaying;
                      return (
                        <tr
                          key={track.id}
                          className={`border-b border-[var(--border)]/40 last:border-b-0 transition-all group cursor-pointer ${
                            isCurrent
                              ? 'bg-emerald-500/10 border-l-2 border-l-emerald-500 hover:bg-emerald-500/15'
                              : 'hover:bg-[var(--bg-hover)]'
                          }`}
                          onClick={() => {
                            if (isCurrent) {
                              onTogglePlayPause?.();
                            } else {
                              handlePlayArtistTrack(track);
                            }
                          }}
                        >
                          <td className="py-2 pl-3 pr-1 text-center text-[11px] tabular-nums">
                            {isCurrent ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onTogglePlayPause?.();
                                }}
                                className="w-5 h-5 rounded-full flex items-center justify-center mx-auto text-emerald-400 hover:scale-110 transition-transform cursor-pointer"
                                title={isPlayingNow ? 'Tạm dừng' : 'Phát tiếp'}
                              >
                                {isPlayingNow ? (
                                  <Pause size={12} fill="currentColor" />
                                ) : (
                                  <Play size={12} fill="currentColor" />
                                )}
                              </button>
                            ) : (
                              <>
                                <span className="group-hover:hidden text-[var(--text-muted)]">{idx + 1}</span>
                                <Play size={11} className="hidden group-hover:inline-block text-emerald-400 mx-auto" />
                              </>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <div
                              className={`font-semibold text-xs transition-colors truncate flex items-center gap-2 ${
                                isCurrent
                                  ? 'text-emerald-400 font-bold'
                                  : 'text-[var(--text-primary)] group-hover:text-emerald-400'
                              }`}
                            >
                              <span>{track.title}</span>
                              {isPlayingNow && (
                                <span
                                  className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"
                                  title="Đang phát"
                                />
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-[var(--text-secondary)] truncate text-[11.5px]">
                            {track.album}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-muted)] font-mono">
                              {track.format}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            {track.isSynced ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <Check size={10} className="stroke-[2.5]" />
                                <span>Đã upload</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                <CloudOff size={10} className="stroke-[2.5]" />
                                <span>Chưa upload</span>
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-4 pl-2 text-right text-[var(--text-muted)] text-[11px] tabular-nums">
                            {formatDuration(track.duration)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
