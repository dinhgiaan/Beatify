import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useOutletContext } from 'react-router-dom';
import { Layout, type PlayingTrack } from './Layout';
import { Loader2 } from 'lucide-react';

const DashboardPage = React.lazy(() =>
  import('../modules/dashboard/pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const YoutubeMusicPage = React.lazy(() =>
  import('../modules/youtube-music/pages/YoutubeMusicPage').then((m) => ({ default: m.YoutubeMusicPage }))
);
const HistoryPage = React.lazy(() =>
  import('../modules/youtube-music/pages/HistoryPage').then((m) => ({ default: m.HistoryPage }))
);
const DownloadedVideosManagerPage = React.lazy(() =>
  import('../modules/youtube-music/pages/DownloadedVideosManagerPage').then((m) => ({
    default: m.DownloadedVideosManagerPage,
  }))
);
const LibraryPage = React.lazy(() =>
  import('../modules/library/LibraryPage').then((m) => ({ default: m.LibraryPage }))
);
const ArtistsPage = React.lazy(() =>
  import('../modules/artists/pages/ArtistsPage').then((m) => ({ default: m.ArtistsPage }))
);
const ImportPage = React.lazy(() =>
  import('../modules/import/ImportPage').then((m) => ({ default: m.ImportPage }))
);
const TrashPage = React.lazy(() =>
  import('../modules/trash/TrashPage').then((m) => ({ default: m.TrashPage }))
);
const PlaylistsPage = React.lazy(() =>
  import('../modules/playlists/PlaylistsPage').then((m) => ({ default: m.PlaylistsPage }))
);

const PageLoadingFallback: React.FC = () => (
  <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-3 min-h-[400px]">
    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
      <Loader2 size={20} className="animate-spin" />
    </div>
    <span className="text-xs text-[var(--text-muted)] font-medium">Đang tải phân hệ...</span>
  </div>
);

interface OutletContextType {
  onPlayTrack?: (t: PlayingTrack) => void;
  onOpenSyncModal?: () => void;
  playingTrackId?: string;
  isAudioPlaying?: boolean;
  onTogglePlayPause?: () => void;
}

function DashboardRoute() {
  const ctx = useOutletContext<OutletContextType>() || {};
  return (
    <DashboardPage
      onPlayTrack={ctx.onPlayTrack}
      onOpenSyncModal={ctx.onOpenSyncModal}
      playingTrackId={ctx.playingTrackId}
      isAudioPlaying={ctx.isAudioPlaying}
      onTogglePlayPause={ctx.onTogglePlayPause}
    />
  );
}

function LibraryRoute() {
  const ctx = useOutletContext<OutletContextType>() || {};
  return (
    <LibraryPage
      onPlayTrack={ctx.onPlayTrack}
      onOpenSyncModal={ctx.onOpenSyncModal}
      playingTrackId={ctx.playingTrackId}
      isAudioPlaying={ctx.isAudioPlaying}
      onTogglePlayPause={ctx.onTogglePlayPause}
    />
  );
}

function ArtistsRoute() {
  const ctx = useOutletContext<OutletContextType>() || {};
  return (
    <ArtistsPage
      onPlayTrack={ctx.onPlayTrack}
      playingTrackId={ctx.playingTrackId}
      isAudioPlaying={ctx.isAudioPlaying}
      onTogglePlayPause={ctx.onTogglePlayPause}
    />
  );
}

function HistoryRoute() {
  const ctx = useOutletContext<OutletContextType>() || {};
  return (
    <HistoryPage
      onPlayTrack={ctx.onPlayTrack}
      playingTrackId={ctx.playingTrackId}
      isAudioPlaying={ctx.isAudioPlaying}
      onTogglePlayPause={ctx.onTogglePlayPause}
    />
  );
}

function DownloadedManagerRoute() {
  const ctx = useOutletContext<OutletContextType>() || {};
  return (
    <DownloadedVideosManagerPage
      onPlayTrack={ctx.onPlayTrack}
      onOpenSyncModal={ctx.onOpenSyncModal}
      playingTrackId={ctx.playingTrackId}
      isAudioPlaying={ctx.isAudioPlaying}
      onTogglePlayPause={ctx.onTogglePlayPause}
    />
  );
}

function PlaylistsRoute() {
  const ctx = useOutletContext<OutletContextType>() || {};
  return (
    <PlaylistsPage
      onPlayTrack={ctx.onPlayTrack}
      playingTrackId={ctx.playingTrackId}
      isAudioPlaying={ctx.isAudioPlaying}
      onTogglePlayPause={ctx.onTogglePlayPause}
    />
  );
}

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route
            path="dashboard"
            element={
              <Suspense fallback={<PageLoadingFallback />}>
                <DashboardRoute />
              </Suspense>
            }
          />
          <Route
            path="youtube-music"
            element={
              <Suspense fallback={<PageLoadingFallback />}>
                <YoutubeMusicPage />
              </Suspense>
            }
          />
          <Route
            path="youtube-music/manager"
            element={
              <Suspense fallback={<PageLoadingFallback />}>
                <DownloadedManagerRoute />
              </Suspense>
            }
          />
          <Route
            path="youtube-music/history"
            element={
              <Suspense fallback={<PageLoadingFallback />}>
                <HistoryRoute />
              </Suspense>
            }
          />
          <Route
            path="library"
            element={
              <Suspense fallback={<PageLoadingFallback />}>
                <LibraryRoute />
              </Suspense>
            }
          />
          <Route
            path="playlists"
            element={
              <Suspense fallback={<PageLoadingFallback />}>
                <PlaylistsRoute />
              </Suspense>
            }
          />
          <Route
            path="artists"
            element={
              <Suspense fallback={<PageLoadingFallback />}>
                <ArtistsRoute />
              </Suspense>
            }
          />
          <Route
            path="import"
            element={
              <Suspense fallback={<PageLoadingFallback />}>
                <ImportPage />
              </Suspense>
            }
          />
          <Route
            path="trash"
            element={
              <Suspense fallback={<PageLoadingFallback />}>
                <TrashPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

