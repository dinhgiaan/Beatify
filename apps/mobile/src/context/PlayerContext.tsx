import React, { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { Vibration } from 'react-native';
import {
  type Track,
  smartShuffle,
  sortTracksByMode,
  type TrackSortMode,
} from '@music-app/shared';
import { playerService } from '../services/player/rntpPlayerService';
import type { PlayerState, RepeatMode } from '../services/player/types';
import { statsStorage } from '../services/stats/statsStorage';
import { useLibrary } from './LibraryContext';

export interface PlayerContextValue {
  tracks: Track[];
  currentTrackIndex: number;
  setCurrentTrackIndex: (index: number) => void;
  currentTrack: Track | null;
  playerState: PlayerState;
  repeatMode: RepeatMode;
  isSmartShuffle: boolean;
  setIsSmartShuffle: (val: boolean) => void;
  sortMode: TrackSortMode;
  setSortMode: (mode: TrackSortMode) => void;
  playQueue: (trackList?: Track[], startIndex?: number) => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  skipToTrack: (index: number) => Promise<void>;
  seekOffset: (secondsOffset: number) => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
  cycleRepeat: () => Promise<void>;
  toggleSmartShuffle: () => Promise<void>;
  applySortMode: (mode: TrackSortMode) => void;
  addCustomTrack: (url: string) => Promise<void>;
  handleTrackDeleted: (deletedTrackId: string, remaining: Track[]) => Promise<void>;
  gaplessDeltaMs: number | null;
  atomicWriteBranch: string;
  lastMoveError: string | null;
  recoveryStatus: string;
  writeQueueStatus: string;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { tracks, setTracks, originalTracks, setOriginalTracks } = useLibrary();

  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    isBuffering: false,
    activeTrackId: null,
    positionSec: 0,
    durationSec: 0,
    bufferedSec: null,
  });

  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [isSmartShuffle, setIsSmartShuffle] = useState<boolean>(false);
  const [sortMode, setSortMode] = useState<TrackSortMode>('smart');

  // Thống kê & Ghi đĩa atomic
  const [atomicWriteBranch, setAtomicWriteBranch] = useState<string>('Chưa ghi');
  const [lastMoveError, setLastMoveError] = useState<string | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<string>('Không có khôi phục');
  const [writeQueueStatus, setWriteQueueStatus] = useState<string>('Đã ghi xong (hàng đợi rỗng)');

  const lastRecordedTrackRef = useRef<string | null>(null);
  const currentTrackingTrackIdRef = useRef<string | null>(null);
  const maxListenedSecRef = useRef<number>(0);

  // 1. Khởi tạo player service và đăng ký listener ĐÚNG MỘT LẦN
  useEffect(() => {
    playerService.setup().catch((err) => {
      console.warn('Lỗi setup player:', err);
    });

    const unsubscribe = playerService.subscribe((state) => {
      setPlayerState(state);
      if (state.activeTrackId) {
        const idx = tracks.findIndex((t) => t.id === state.activeTrackId);
        if (idx !== -1) setCurrentTrackIndex(idx);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [tracks]);

  // 2. Tự động ghi nhận lượt nghe và đo thời lượng thực tế (mốc 15s)
  useEffect(() => {
    if (playerState.activeTrackId !== currentTrackingTrackIdRef.current) {
      const prevTrackId = currentTrackingTrackIdRef.current;
      const prevListened = maxListenedSecRef.current;

      if (prevTrackId && prevListened >= 15) {
        statsStorage.updateLastTrackListenedSec(prevTrackId, prevListened).catch((err) => {
          console.warn('Lỗi cập nhật thời lượng nghe thực tế cho bài trước:', err);
        });
      }

      currentTrackingTrackIdRef.current = playerState.activeTrackId;
      maxListenedSecRef.current = Math.max(0, playerState.positionSec || 0);
    } else {
      if (playerState.positionSec > maxListenedSecRef.current) {
        maxListenedSecRef.current = playerState.positionSec;
      }
    }

    if (
      playerState.isPlaying &&
      playerState.activeTrackId &&
      playerState.positionSec >= 15 &&
      lastRecordedTrackRef.current !== playerState.activeTrackId
    ) {
      lastRecordedTrackRef.current = playerState.activeTrackId;
      const t = tracks.find((x) => x.id === playerState.activeTrackId);
      if (t) {
        setWriteQueueStatus('Đang ghi (1 tác vụ)...');
        statsStorage.recordTrackListen({
          trackId: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album,
          durationSec: t.duration || Math.round(playerState.durationSec),
          listenedSec: Math.round(playerState.positionSec),
        })
          .then(() => {
            setAtomicWriteBranch(statsStorage.getLastWriteBranch());
            setLastMoveError(statsStorage.getLastMoveError());
            setRecoveryStatus(statsStorage.getLastRecoveryStatus());
            setWriteQueueStatus(statsStorage.getWriteQueueStatus());
          })
          .catch((err) => {
            console.warn('Lỗi ghi stats:', err);
            setWriteQueueStatus('Lỗi ghi đĩa');
          });
      }
    }
  }, [playerState.isPlaying, playerState.activeTrackId, playerState.positionSec, tracks]);

  // 3. Handlers điều khiển phát nhạc
  const playQueue = useCallback(async (trackList = tracks, startIndex = currentTrackIndex) => {
    if (trackList.length === 0) return;
    await playerService.playQueue(trackList, startIndex);
  }, [tracks, currentTrackIndex]);

  const togglePlay = useCallback(async () => {
    Vibration.vibrate(10);
    if (playerState.isPlaying) {
      await playerService.pause();
    } else {
      if (!playerState.activeTrackId && tracks.length > 0) {
        await playQueue();
      } else if (playerState.activeTrackId) {
        await playerService.play();
      }
    }
  }, [playerState.isPlaying, playerState.activeTrackId, tracks.length, playQueue]);

  const next = useCallback(async () => {
    Vibration.vibrate(10);
    if (tracks.length > 0) {
      await playerService.next();
    }
  }, [tracks.length]);

  const previous = useCallback(async () => {
    Vibration.vibrate(10);
    if (tracks.length > 0) {
      await playerService.previous();
    }
  }, [tracks.length]);

  const skipToTrack = useCallback(async (index: number) => {
    Vibration.vibrate(10);
    if (!playerState.activeTrackId) {
      await playQueue(tracks, index);
    } else {
      await playerService.skipToIndex(index);
    }
  }, [playerState.activeTrackId, tracks, playQueue]);

  const seekOffset = useCallback(async (secondsOffset: number) => {
    Vibration.vibrate(10);
    const currTrack = tracks[currentTrackIndex];
    const totalSec = playerState.durationSec || (currTrack ? currTrack.duration : 0);
    const target = totalSec > 0
      ? Math.min(totalSec, Math.max(0, playerState.positionSec + secondsOffset))
      : Math.max(0, playerState.positionSec + secondsOffset);
    await playerService.seekTo(target);
  }, [tracks, currentTrackIndex, playerState.durationSec, playerState.positionSec]);

  const seekTo = useCallback(async (seconds: number) => {
    Vibration.vibrate(10);
    await playerService.seekTo(seconds);
  }, []);

  const cycleRepeat = useCallback(async () => {
    Vibration.vibrate(10);
    const nextMode: RepeatMode =
      repeatMode === 'off' ? 'track' : repeatMode === 'track' ? 'queue' : 'off';
    setRepeatMode(nextMode);
    await playerService.setRepeatMode(nextMode);
  }, [repeatMode]);

  const toggleSmartShuffle = useCallback(async () => {
    Vibration.vibrate(10);
    if (tracks.length === 0) return;

    if (!isSmartShuffle) {
      setOriginalTracks([...tracks]);
      const currentTrack = tracks[currentTrackIndex];
      const shuffled = smartShuffle(tracks, currentTrack?.id);
      setTracks(shuffled);
      setCurrentTrackIndex(0);
      setIsSmartShuffle(true);
      await playerService.playQueue(shuffled, 0);
    } else {
      const currentTrack = tracks[currentTrackIndex];
      const restored = originalTracks.length > 0 ? originalTracks : tracks;
      const restoredIdx = currentTrack
        ? Math.max(0, restored.findIndex((t) => t.id === currentTrack.id))
        : 0;
      setTracks(restored);
      setCurrentTrackIndex(restoredIdx);
      setIsSmartShuffle(false);
      await playerService.playQueue(restored, restoredIdx);
    }
  }, [tracks, currentTrackIndex, isSmartShuffle, originalTracks, setOriginalTracks, setTracks]);

  const applySortMode = useCallback((mode: TrackSortMode) => {
    Vibration.vibrate(10);
    setSortMode(mode);
    const sorted = sortTracksByMode(tracks, mode);
    setTracks(sorted);
    if (playerState.activeTrackId) {
      const newIdx = sorted.findIndex((t) => t.id === playerState.activeTrackId);
      if (newIdx >= 0) setCurrentTrackIndex(newIdx);
    }
  }, [tracks, playerState.activeTrackId, setTracks]);

  const addCustomTrack = useCallback(async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;

    const newTrack: Track = {
      id: `custom-${Date.now()}`,
      file: trimmed,
      storage: 'r2',
      title: trimmed.split('/').pop()?.split('?')[0] || 'Bài hát của bạn',
      artist: 'Tự tải lên',
      album: 'Beatify Stream',
      duration: 0,
    };

    const newTrackList = [...tracks, newTrack];
    setTracks(newTrackList);
    if (isSmartShuffle) {
      setOriginalTracks((prev) => [...prev, newTrack]);
    }
    await playQueue(newTrackList, newTrackList.length - 1);
  }, [tracks, isSmartShuffle, setTracks, setOriginalTracks, playQueue]);

  // Xử lý khi bài hát bị xóa khỏi app
  const handleTrackDeleted = useCallback(async (trackId: string, updatedList: Track[]) => {
    const targetIdx = tracks.findIndex((t) => t.id === trackId);
    if (tracks[currentTrackIndex]?.id === trackId) {
      if (updatedList.length > 0) {
        const nextIdx = Math.min(targetIdx, updatedList.length - 1);
        setCurrentTrackIndex(nextIdx);
        await playQueue(updatedList, nextIdx);
      } else {
        setCurrentTrackIndex(0);
        await playerService.pause();
      }
    } else if (targetIdx < currentTrackIndex) {
      setCurrentTrackIndex((prev) => Math.max(0, prev - 1));
    }
  }, [tracks, currentTrackIndex, playQueue]);

  const currentTrack: Track | null = tracks[currentTrackIndex] ?? null;
  const gaplessDeltaMs = playerService.getGaplessDeltaMs();

  return (
    <PlayerContext.Provider
      value={{
        tracks,
        currentTrackIndex,
        setCurrentTrackIndex,
        currentTrack,
        playerState,
        repeatMode,
        isSmartShuffle,
        setIsSmartShuffle,
        sortMode,
        setSortMode,
        playQueue,
        togglePlay,
        next,
        previous,
        skipToTrack,
        seekOffset,
        seekTo,
        cycleRepeat,
        toggleSmartShuffle,
        applySortMode,
        addCustomTrack,
        handleTrackDeleted,
        gaplessDeltaMs,
        atomicWriteBranch,
        lastMoveError,
        recoveryStatus,
        writeQueueStatus,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer phải được sử dụng bên trong PlayerProvider');
  }
  return context;
}
