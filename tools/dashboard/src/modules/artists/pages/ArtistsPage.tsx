import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Search,
  Crown,
  Sparkles,
  Camera,
  Folder,
  Clock,
  LayoutGrid,
  List,
  GitMerge,
  Play,
  ArrowUpDown,
  RefreshCw,
  X,
  Music,
  Disc,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../../../ui/organisms/PageHeader';
import { Button } from '../../../ui/atoms/Button';
import { Select } from '../../../ui/atoms/Controls';
import { Tooltip } from '../../../ui/atoms/Tooltip';
import { fetchArtistsApi, openArtistFolderApi, type ArtistDetail } from '../api';
import { ArtistDetailDialog } from '../components/ArtistDetailDialog';
import { ArtistAvatarDialog } from '../components/ArtistAvatarDialog';
import { ArtistMergeDialog } from '../components/ArtistMergeDialog';
import type { PlayingTrack } from '../../../app/Layout';

interface ArtistsPageProps {
  onPlayTrack?: (track: PlayingTrack) => void;
  playingTrackId?: string;
  isAudioPlaying?: boolean;
  onTogglePlayPause?: () => void;
}

function normalize(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function formatDuration(seconds: number): string {
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

function formatFolderDisplay(folderPath: string): string {
  const normalized = folderPath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length <= 2) return segments.join(' / ');
  return segments.slice(-2).join(' / ');
}

export const ArtistsPage: React.FC<ArtistsPageProps> = ({
  onPlayTrack,
  playingTrackId,
  isAudioPlaying,
  onTogglePlayPause,
}) => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'tracks-desc' | 'name-asc' | 'name-desc' | 'duration-desc'>('tracks-desc');
  const [filterAvatar, setFilterAvatar] = useState<'all' | 'has-avatar' | 'no-avatar'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Modals state
  const [selectedArtistDetail, setSelectedArtistDetail] = useState<ArtistDetail | null>(null);
  const [avatarDialogArtist, setAvatarDialogArtist] = useState<ArtistDetail | null>(null);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [mergeInitialTarget, setMergeInitialTarget] = useState<string | undefined>(undefined);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['artists-list'],
    queryFn: fetchArtistsApi,
    staleTime: 60000,
  });

  const artists = data?.artists || [];

  // Filter & Sort
  const filteredArtists = useMemo(() => {
    let result = [...artists];

    // Search filter
    if (searchTerm.trim()) {
      const q = normalize(searchTerm.trim());
      result = result.filter((a) => normalize(a.name).includes(q));
    }

    // Avatar filter
    if (filterAvatar === 'has-avatar') {
      result = result.filter((a) => a.hasAvatar);
    } else if (filterAvatar === 'no-avatar') {
      result = result.filter((a) => !a.hasAvatar);
    }

    // Sort
    if (sortBy === 'tracks-desc') {
      result.sort((x, y) => y.trackCount - x.trackCount);
    } else if (sortBy === 'name-asc') {
      result.sort((x, y) => x.name.localeCompare(y.name));
    } else if (sortBy === 'name-desc') {
      result.sort((x, y) => y.name.localeCompare(x.name));
    } else if (sortBy === 'duration-desc') {
      result.sort((x, y) => y.totalDuration - x.totalDuration);
    }

    return result;
  }, [artists, searchTerm, filterAvatar, sortBy]);

  // Thống kê tổng quan
  const stats = useMemo(() => {
    const totalCount = artists.length;
    const withAvatar = artists.filter((a) => a.hasAvatar).length;
    const totalSec = artists.reduce((acc, a) => acc + a.totalDuration, 0);
    const topArtist = artists.length > 0 ? artists[0] : null;

    return {
      totalCount,
      withAvatar,
      avatarPercent: totalCount > 0 ? Math.round((withAvatar / totalCount) * 100) : 0,
      totalHours: (totalSec / 3600).toFixed(1),
      topArtistName: topArtist?.name || '--',
      topArtistTracks: topArtist?.trackCount || 0,
    };
  }, [artists]);

  const handlePlayFirstTrack = (artist: ArtistDetail, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onPlayTrack || artist.tracks.length === 0) {
      toast.info(`Nghệ sĩ ${artist.name} chưa có bài hát nào`);
      return;
    }
    const first = artist.tracks[0];
    if (first) {
      onPlayTrack({
        id: first.id,
        albumId: first.albumId,
        title: first.title,
        artist: artist.name,
        fileUrl: `/local-api/stream/${first.id}`,
        coverUrl: `/local-api/covers/${first.albumId || first.id}.jpg`,
      });
      toast.success(`Đang phát: ${first.title} (${artist.name})`);
    }
  };

  const handleOpenFolder = async (artist: ArtistDetail, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await openArtistFolderApi(artist.name, artist.folderPath);
      toast.success(res.message || `Đã mở thư mục của ${artist.name} trong Explorer`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể mở thư mục trên máy tính';
      toast.error(msg);
    }
  };

  return (
    <div className="w-full max-w-[1720px] mx-auto px-8 py-6 space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Quản lý Nghệ sĩ"
        subtitle="Duyệt danh sách nghệ sĩ, quản lý ảnh đại diện, thống kê thời lượng và chuẩn hóa tên nghệ sĩ"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setMergeInitialTarget(undefined);
                setIsMergeDialogOpen(true);
              }}
              className="gap-1.5 font-semibold text-xs h-8 px-3"
            >
              <GitMerge size={13} />
              <span>Gộp nghệ sĩ</span>
            </Button>
            <Tooltip position="bottom" align="end" content="Làm mới danh sách nghệ sĩ từ thư viện máy tính">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => refetch()}
                className="gap-1.5 font-semibold text-xs h-8 px-2.5"
              >
                <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
              </Button>
            </Tooltip>
          </div>
        }
      />

      {/* KPI Hero Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: Tổng số nghệ sĩ */}
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Users size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              TỔNG NGHỆ SĨ
            </div>
            <div className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums mt-0.5">
              {stats.totalCount}
            </div>
          </div>
        </div>

        {/* Card 2: Có ảnh đại diện */}
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
            <Camera size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              CÓ AVATAR (ARTIST.JPG)
            </div>
            <div className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums mt-0.5">
              {stats.withAvatar} <span className="text-xs font-normal text-[var(--text-muted)]">({stats.avatarPercent}%)</span>
            </div>
          </div>
        </div>

        {/* Card 3: Nghệ sĩ top 1 */}
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <Crown size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              NGHỆ SĨ NHIỀU BÀI NHẤT
            </div>
            <div className="text-sm font-bold text-[var(--text-primary)] truncate mt-0.5" title={stats.topArtistName}>
              {stats.topArtistName} <span className="text-xs font-normal text-[var(--text-muted)]">({stats.topArtistTracks} bài)</span>
            </div>
          </div>
        </div>

        {/* Card 4: Tổng thời lượng */}
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
            <Clock size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              TỔNG THỜI LƯỢNG
            </div>
            <div className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums mt-0.5">
              {stats.totalHours} <span className="text-xs font-normal text-[var(--text-muted)]">giờ</span>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={14} className="absolute left-3 top-2.5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm kiếm nghệ sĩ theo tên (bỏ dấu tiếng Việt)..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* Filter Pills & Sort */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          {/* Avatar Filter */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setFilterAvatar('all')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                filterAvatar === 'all'
                  ? 'bg-emerald-500 text-black font-semibold shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Tất cả ({artists.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterAvatar('has-avatar')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                filterAvatar === 'has-avatar'
                  ? 'bg-emerald-500 text-black font-semibold shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Có Avatar ({stats.withAvatar})
            </button>
            <button
              type="button"
              onClick={() => setFilterAvatar('no-avatar')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                filterAvatar === 'no-avatar'
                  ? 'bg-emerald-500 text-black font-semibold shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Chưa có ({stats.totalCount - stats.withAvatar})
            </button>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown size={13} className="text-[var(--text-muted)]" />
            <Select
              id="artists-sort-selector"
              name="artistsSort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'tracks-desc' | 'name-asc' | 'name-desc' | 'duration-desc')}
              selectSize="sm"
            >
              <option value="tracks-desc">Nhiều bài hát nhất</option>
              <option value="duration-desc">Thời lượng nhiều nhất</option>
              <option value="name-asc">Tên (A → Z)</option>
              <option value="name-desc">Tên (Z → A)</option>
            </Select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md cursor-pointer transition-colors ${
                viewMode === 'grid'
                  ? 'bg-[var(--bg-surface)] text-emerald-400 shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
              title="Xem dạng thẻ lưới"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md cursor-pointer transition-colors ${
                viewMode === 'table'
                  ? 'bg-[var(--bg-surface)] text-emerald-400 shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
              title="Xem dạng danh sách bảng"
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <RefreshCw size={24} className="animate-spin text-emerald-400" />
          <span className="text-xs text-[var(--text-muted)]">Đang tải danh sách nghệ sĩ...</span>
        </div>
      ) : filteredArtists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-[var(--border)] text-center space-y-3 bg-[var(--bg-surface)]/50">
          <Users size={36} className="text-[var(--text-muted)]" />
          <div className="space-y-1">
            <div className="font-bold text-sm text-[var(--text-primary)]">
              Không tìm thấy nghệ sĩ nào
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              {searchTerm ? 'Thử tìm kiếm với từ khóa khác' : 'Thư viện hiện chưa có bài hát nào'}
            </p>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW - Gọn gàng, tinh tế, tỷ lệ chuẩn Spotify & Apple Music */
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 sm:gap-5">
          {filteredArtists.map((artist) => (
            <Tooltip
              key={artist.name}
              position="top"
              align="center"
              delay={350}
              disabled={Boolean(selectedArtistDetail || avatarDialogArtist || isMergeDialogOpen)}
              className="w-full h-full block"
              content={
                <div className="space-y-2.5 p-1 w-[270px] text-left select-none">
                  {/* Header: Tên nghệ sĩ & Trạng thái Avatar */}
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/[0.08]">
                    <span className="font-bold text-xs text-white tracking-tight truncate">
                      {artist.name}
                    </span>
                    {artist.hasAvatar ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[9.5px] font-semibold text-emerald-400 shrink-0">
                        <CheckCircle2 size={10} className="text-emerald-400" />
                        <span>Có Avatar</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-[9.5px] font-medium text-zinc-400 shrink-0">
                        Bìa Album
                      </span>
                    )}
                  </div>

                  {/* Metrics Chips Row */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[10.5px] text-zinc-200 font-medium">
                      <Music size={11} className="text-emerald-400" />
                      <span>{artist.trackCount} bài</span>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[10.5px] text-zinc-200 font-medium">
                      <Disc size={11} className="text-indigo-400" />
                      <span>{artist.albumCount} album</span>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[10.5px] text-zinc-300 tabular-nums font-medium">
                      <Clock size={11} className="text-amber-400" />
                      <span>{formatDuration(artist.totalDuration)}</span>
                    </span>
                  </div>

                  {/* Danh sách bài hát tiêu biểu */}
                  {artist.tracks.length > 0 && (
                    <div className="space-y-1.5 pt-0.5">
                      <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider uppercase text-zinc-400">
                        <span className="flex items-center gap-1.5 text-zinc-300">
                          <Sparkles size={11} className="text-emerald-400" />
                          <span>Bài hát nổi bật</span>
                        </span>
                        {artist.tracks.length > 3 && (
                          <span className="text-[9.5px] text-zinc-500 font-normal lowercase">
                            +{artist.tracks.length - 3} bài khác
                          </span>
                        )}
                      </div>

                      <div className="space-y-1">
                        {artist.tracks.slice(0, 3).map((track, idx) => (
                          <div
                            key={track.id || idx}
                            className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.04] transition-colors"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[10px] text-zinc-500 font-medium w-3 text-center shrink-0">
                                {idx + 1}
                              </span>
                              <span className="text-[11px] text-zinc-200 font-medium truncate">
                                {track.title}
                              </span>
                            </div>
                            {track.duration > 0 && (
                              <span className="text-[10px] text-zinc-400 tabular-nums shrink-0">
                                {formatTrackDuration(track.duration)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Đường dẫn thư mục cục bộ */}
                  {artist.folderPath && (
                    <div
                      className="pt-2 border-t border-white/[0.08] flex items-center gap-1.5 text-[10.5px] text-zinc-400 min-w-0"
                      title={artist.folderPath}
                    >
                      <Folder size={12} className="text-emerald-400/80 shrink-0" />
                      <span className="text-zinc-500 text-[10px] shrink-0">Lưu tại:</span>
                      <span className="text-zinc-300 font-medium truncate">
                        {formatFolderDisplay(artist.folderPath)}
                      </span>
                    </div>
                  )}
                </div>
              }
            >
              <motion.div
                whileHover={{ y: -4, scale: 1.01 }}
                onClick={() => setSelectedArtistDetail(artist)}
                className="p-4 sm:p-4.5 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] hover:border-emerald-500/50 hover:shadow-xl transition-all cursor-pointer group flex flex-col items-center text-center space-y-3 relative overflow-hidden"
              >
              {/* Avatar tròn với Play overlay - kích thước tinh tế 112px - 128px */}
              <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden border-2 border-[var(--border)] group-hover:border-emerald-500/80 shadow-md bg-black/40 flex items-center justify-center transition-all">
                <img
                  src={artist.avatarUrl}
                  alt={artist.name}
                  className="w-full h-full object-cover group-hover:scale-106 transition-transform duration-300"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />

                {/* Quick play hover button */}
                <button
                  type="button"
                  onClick={(e) => handlePlayFirstTrack(artist, e)}
                  className="absolute inset-0 m-auto w-10 h-10 rounded-full bg-emerald-500 text-black flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 cursor-pointer z-10"
                  title={`Phát nhạc của ${artist.name}`}
                >
                  <Play size={15} fill="black" className="ml-0.5" />
                </button>
              </div>

              {/* Tên nghệ sĩ & số liệu */}
              <div className="w-full space-y-1 min-w-0">
                <div className="font-bold text-sm sm:text-[15px] text-[var(--text-primary)] group-hover:text-emerald-400 transition-colors truncate" title={artist.name}>
                  {artist.name}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] flex items-center justify-center gap-1.5 font-medium flex-wrap">
                  <span>{artist.trackCount} bài</span>
                  {artist.albumCount > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-emerald-400 font-semibold">{artist.albumCount} album</span>
                    </>
                  )}
                  {Number(artist.singleCount) > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-sky-400 font-semibold">{artist.singleCount} đĩa đơn</span>
                    </>
                  )}
                </div>
              </div>

              {/* Card Footer badges & Actions */}
              <div className="w-full pt-2 border-t border-[var(--border)]/60 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                <span className="truncate tabular-nums font-medium">{formatDuration(artist.totalDuration)}</span>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAvatarDialogArtist(artist);
                    }}
                    className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-emerald-400 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                    title="Đổi ảnh đại diện"
                  >
                    <Camera size={13} />
                  </button>
                  {artist.folderPath && (
                    <button
                      type="button"
                      onClick={(e) => handleOpenFolder(artist, e)}
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-emerald-400 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                      title="Mở thư mục trên máy tính"
                    >
                      <Folder size={13} />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
            </Tooltip>
          ))}
        </div>
      ) : (
        /* TABLE LIST VIEW */
        <div className="rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--bg-surface)] shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)] text-[10.5px] font-semibold text-[var(--text-muted)] uppercase tracking-wider select-none">
                <th className="py-3 pl-4 pr-1 w-12 text-center">#</th>
                <th className="py-3 px-3">NGHỆ SĨ</th>
                <th className="py-3 px-3 text-center">SỐ BÀI HÁT</th>
                <th className="py-3 px-3 text-center">SỐ ALBUM</th>
                <th className="py-3 px-3 text-center">AVATAR</th>
                <th className="py-3 px-3 text-right">TỔNG THỜI LƯỢNG</th>
                <th className="py-3 pr-4 pl-3 text-right">THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              {filteredArtists.map((artist, idx) => (
                <tr
                  key={artist.name}
                  onClick={() => setSelectedArtistDetail(artist)}
                  className="border-b border-[var(--border)]/40 last:border-b-0 hover:bg-[var(--bg-hover)] transition-colors group cursor-pointer"
                >
                  <td className="py-3 pl-4 pr-1 text-center text-[var(--text-muted)] text-[11px] tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full overflow-hidden border border-[var(--border)] shrink-0 bg-black/40 flex items-center justify-center shadow-xs">
                        <img
                          src={artist.avatarUrl}
                          alt={artist.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <span className="font-semibold text-sm text-[var(--text-primary)] group-hover:text-emerald-400 transition-colors">
                        {artist.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-center text-[var(--text-secondary)] font-medium">
                    {artist.trackCount} bài
                  </td>
                  <td className="py-3 px-3 text-center text-[var(--text-secondary)]">
                    <span className="font-medium text-emerald-400">{artist.albumCount} album</span>
                    {Number(artist.singleCount) > 0 && (
                      <span className="text-sky-400 text-[11px]"> · {artist.singleCount} đĩa đơn</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">
                    {artist.hasAvatar ? (
                      <span className="text-[10.5px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                        Có ảnh (PNG)
                      </span>
                    ) : (
                      <span className="text-[10.5px] px-2.5 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border)]">
                        Bìa album
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right text-[var(--text-muted)] text-xs tabular-nums">
                    {formatDuration(artist.totalDuration)}
                  </td>
                  <td
                    className="py-3 pr-4 pl-3 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => handlePlayFirstTrack(artist, e)}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-emerald-400 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                        title="Phát bài đầu tiên"
                      >
                        <Play size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setAvatarDialogArtist(artist)}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-emerald-400 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                        title="Đổi ảnh đại diện"
                      >
                        <Camera size={14} />
                      </button>
                      {artist.folderPath && (
                        <button
                          type="button"
                          onClick={(e) => handleOpenFolder(artist, e)}
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-emerald-400 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                          title="Mở thư mục trong Explorer"
                        >
                          <Folder size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      <ArtistDetailDialog
        isOpen={Boolean(selectedArtistDetail)}
        onClose={() => setSelectedArtistDetail(null)}
        artist={selectedArtistDetail}
        onOpenAvatarDialog={(a) => {
          setAvatarDialogArtist(a);
        }}
        onOpenMergeDialog={(a) => {
          setMergeInitialTarget(a.name);
          setIsMergeDialogOpen(true);
        }}
        onPlayTrack={onPlayTrack}
        playingTrackId={playingTrackId}
        isAudioPlaying={isAudioPlaying}
        onTogglePlayPause={onTogglePlayPause}
      />

      <ArtistAvatarDialog
        isOpen={Boolean(avatarDialogArtist)}
        onClose={() => setAvatarDialogArtist(null)}
        artist={avatarDialogArtist}
        onSuccess={(newAvatarUrl) => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ['artists-list'] });
          // Cập nhật ngay avatar cho modal chi tiết nghệ sĩ đang xem
          setSelectedArtistDetail((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              hasAvatar: true,
              avatarUrl: `${newAvatarUrl || `/local-api/artists/${encodeURIComponent(prev.name)}/avatar`}?t=${Date.now()}`,
            };
          });
        }}
      />

      <ArtistMergeDialog
        isOpen={isMergeDialogOpen}
        onClose={() => setIsMergeDialogOpen(false)}
        artists={artists}
        initialTargetArtist={mergeInitialTarget}
        onSuccess={() => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ['artists-list'] });
          queryClient.invalidateQueries({ queryKey: ['library'] });
          // Đóng dialog chi tiết vì các bài hát / tên có thể đã được gộp sang nghệ sĩ khác
          setSelectedArtistDetail(null);
        }}
      />
    </div>
  );
};
