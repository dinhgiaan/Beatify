import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useOutletContext } from 'react-router-dom';
import { Layout, type PlayingTrack } from './Layout';
import { DashboardPage } from '../modules/dashboard/pages/DashboardPage';
import { YoutubeMusicPage } from '../modules/youtube-music/pages/YoutubeMusicPage';
import { HistoryPage } from '../modules/youtube-music/pages/HistoryPage';
import { DownloadedVideosManagerPage } from '../modules/youtube-music/pages/DownloadedVideosManagerPage';
import { LibraryPage } from '../modules/library/LibraryPage';
import { ArtistsPage } from '../modules/artists/pages/ArtistsPage';
import { ImportPage } from '../modules/import/ImportPage';
import { TrashPage } from '../modules/trash/TrashPage';

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
  return <HistoryPage />;
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

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardRoute />} />
          <Route path="youtube-music" element={<YoutubeMusicPage />} />
          <Route path="youtube-music/manager" element={<DownloadedManagerRoute />} />
          <Route path="youtube-music/history" element={<HistoryRoute />} />
          <Route path="library" element={<LibraryRoute />} />
          <Route path="artists" element={<ArtistsRoute />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="trash" element={<TrashPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

