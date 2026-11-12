import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { Vibration, AppState } from 'react-native';
import {
  type Track,
  smartShuffle,
  sortTracksByMode,
  type TrackSortMode,
  type SmartTransitionSettings,
} from '@music-app/shared';
import { playerService } from '../services/player/rntpPlayerService';
import { transitionManager } from '../services/player/transitionManager';
import { loadTransitionSettings } from '../services/player/transitionPreferences';
import type { PlayerState, RepeatMode } from '../services/player/types';
import { statsStorage } from '../services/stats/statsStorage';
import {
  loadRecentTracks,
  saveRecentTracks,
  addTrackToRecentList,
  updateRecentLimit,
  DEFAULT_RECENT_LIMIT,
  type RecentTracksData,
} from '../services/recent/recentTracksStorage';
import {
  loadVinylModePreference,
  saveVinylModePreference,
} from '../services/player/turntablePreferences';
import { useLibrary, resolveTrackUrls } from './LibraryContext';
import { useOffline } from './OfflineContext';

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
  recentTracks: Track[];
  recentLimit: number;
  setRecentLimit: (limit: number) => Promise<void>;
  clearRecentTracks: () => Promise<void>;
  playQueue: (trackList?: Track[], startIndex?: number) => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  skipToTrack: (index: number) => Promise<void>;
  seekOffset: (secondsOffset: number) => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
  cycleRepeat: () => Promise<void>;
  customLoopTarget: number | null;
  customLoopRemaining: number | null;
  setCustomLoopCount: (count: number | null) => Promise<void>;
  isVinylMode: boolean;
  toggleVinylMode: () => void;
  transitionSettings: SmartTransitionSettings;
  updateTransitionSettings: (settings: Partial<SmartTransitionSettings>) => void;
  toggleSmartShuffle: () => Promise<void>;
  applySortMode: (mode: TrackSortMode) => void;
  addCustomTrack: (url: string) => Promise<void>;
  removeFromQueue: (index: number) => Promise<void>;
  moveQueueItem: (fromIndex: number, toIndex: number) => Promise<void>;
  sleepTimerMinutes: number | null;
  sleepTimerRemainingSec: number | null;
  setSleepTimer: (minutes: number | null) => void;
  handleTrackDeleted: (deletedTrackId: string, remaining: Track[]) => Promise<void>;
  gaplessDeltaMs: number | null;
  atomicWriteBranch: string;
  lastMoveError: string | null;
  recoveryStatus: string;
  writeQueueStatus: string;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { tracks, setTracks, originalTracks, setOriginalTracks, serverUrl, serverToken } = useLibrary();
  const { getOfflineAudioUri } = useOffline();

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
  const [customLoopTarget, setCustomLoopTarget] = useState<number | null>(null);
  const [customLoopRemaining, setCustomLoopRemaining] = useState<number | null>(null);
  const customLoopRemainingRef = useRef<number | null>(null);
  const lastLoopPosRef = useRef<number>(0);
  const lastLoopTrackIdRef = useRef<string | null>(null);
  const [isSmartShuffle, setIsSmartShuffle] = useState<boolean>(false);
  const [isVinylMode, setIsVinylMode] = useState<boolean>(false);
  const [transitionSettings, setTransitionSettings] = useState<SmartTransitionSettings>({
    enabled: true,
    durationSec: 4,
    safeMode: false,
  });
  const [sortMode, setSortMode] = useState<TrackSortMode>('smart');

  // Thống kê & Ghi đĩa atomic
  const [atomicWriteBranch, setAtomicWriteBranch] = useState<string>('Chưa ghi');
  const [lastMoveError, setLastMoveError] = useState<string | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<string>('Không có khôi phục');
  const [writeQueueStatus, setWriteQueueStatus] = useState<string>('Đã ghi xong (hàng đợi rỗng)');

  // Sleep Timer (Hẹn giờ tắt nhạc)
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepTimerRemainingSec, setSleepTimerRemainingSec] = useState<number | null>(null);

  // Nghe gần đây (Recently Played)
  const [recentTracksData, setRecentTracksData] = useState<RecentTracksData>({
    limit: DEFAULT_RECENT_LIMIT,
    trackIds: [],
  });

  const lastRecordedTrackRef = useRef<string | null>(null);
  const lastRecordedRecentTrackRef = useRef<string | null>(null);
  const currentTrackingTrackIdRef = useRef<string | null>(null);
  const maxListenedSecRef = useRef<number>(0);

  // Nạp danh sách bài nghe gần đây và cấu hình turntable từ đĩa khi khởi động
  useEffect(() => {
    loadRecentTracks().then((data) => {
      setRecentTracksData(data);
    });
    loadVinylModePreference().then(setIsVinylMode);
    loadTransitionSettings().then(setTransitionSettings);
  }, []);

  const updateTransitionSettings = useCallback((newSettings: Partial<SmartTransitionSettings>) => {
    transitionManager.updateSettings(newSettings);
    setTransitionSettings((prev) => ({
      ...prev,
      ...newSettings,
    }));
  }, []);

  // 1. Khởi tạo player service và đăng ký listener ĐÚNG MỘT LẦN (State ổn định, không re-render theo tick tiến trình)
  useEffect(() => {
    playerService.setup().catch((err) => {
      console.warn('Lỗi setup player:', err);
    });

    const unsubscribe = playerService.subscribe((state) => {
      // Chỉ cập nhật state ổn định (isPlaying, isBuffering, activeTrackId), loại bỏ re-render theo từng tick tiến trình
      setPlayerState((prev) => {
        if (
          prev.isPlaying === state.isPlaying &&
          prev.activeTrackId === state.activeTrackId &&
          prev.isBuffering === state.isBuffering
        ) {
          return prev;
        }
        return {
          ...prev,
          isPlaying: state.isPlaying,
          isBuffering: state.isBuffering,
          activeTrackId: state.activeTrackId,
          durationSec: state.durationSec,
        };
      });

      if (state.activeTrackId) {
        const idx = tracks.findIndex((t) => t.id === state.activeTrackId);
        if (idx !== -1) setCurrentTrackIndex(idx);
      }

      // Theo dõi mốc 15s trực tiếp qua ref trong listener mà không gây re-render PlayerContext
      const pos = state.positionSec || 0;
      const dur = state.durationSec || 0;

      // Kiểm tra vòng lặp tùy chỉnh (Custom Loop Countdown)
      if (
        customLoopRemainingRef.current !== null &&
        customLoopRemainingRef.current > 0 &&
        state.activeTrackId &&
        state.activeTrackId === lastLoopTrackIdRef.current &&
        dur > 5
      ) {
        // Nếu bài hát trước đó ở gần cuối (> 75% duration hoặc > duration - 2.5s) và giờ nhảy về đầu (< 2.5s)
        if (lastLoopPosRef.current >= Math.max(dur - 2.5, dur * 0.75) && pos < 2.5) {
          const nextRemaining = customLoopRemainingRef.current - 1;
          customLoopRemainingRef.current = nextRemaining;
          setCustomLoopRemaining(nextRemaining);

          if (nextRemaining <= 0) {
            // Đã lặp đủ số lần yêu cầu: tắt repeat để chuyển bài khi kết thúc
            customLoopRemainingRef.current = null;
            setCustomLoopTarget(null);
            setCustomLoopRemaining(null);
            setRepeatMode('off');
            playerService.setRepeatMode('off').catch(() => { });
          }
        }
      }
      lastLoopPosRef.current = pos;
      lastLoopTrackIdRef.current = state.activeTrackId;

      if (state.activeTrackId !== currentTrackingTrackIdRef.current) {
        const prevTrackId = currentTrackingTrackIdRef.current;
        const prevListened = maxListenedSecRef.current;

        if (prevTrackId && prevListened >= 15) {
          statsStorage.updateLastTrackListenedSec(prevTrackId, prevListened).catch((err) => {
            console.warn('Lỗi cập nhật thời lượng nghe thực tế cho bài trước:', err);
          });
        }

        currentTrackingTrackIdRef.current = state.activeTrackId;
        maxListenedSecRef.current = Math.max(0, pos);
      } else {
        if (pos > maxListenedSecRef.current) {
          maxListenedSecRef.current = pos;
        }
      }

      // Ghi nhận vào danh sách Nghe gần đây khi nghe trên 5 giây
      if (
        state.isPlaying &&
        state.activeTrackId &&
        pos >= 5 &&
        lastRecordedRecentTrackRef.current !== state.activeTrackId
      ) {
        lastRecordedRecentTrackRef.current = state.activeTrackId;
        const currentId = state.activeTrackId;
        setRecentTracksData((prev) => {
          const updated = addTrackToRecentList(currentId, prev);
          saveRecentTracks(updated).catch(() => { });
          return updated;
        });
      }

      if (
        state.isPlaying &&
        state.activeTrackId &&
        pos >= 15 &&
        lastRecordedTrackRef.current !== state.activeTrackId
      ) {
        lastRecordedTrackRef.current = state.activeTrackId;
        const t = tracks.find((x) => x.id === state.activeTrackId);
        if (t) {
          setWriteQueueStatus('Đang ghi (1 tác vụ)...');
          statsStorage.recordTrackListen({
            trackId: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album,
            durationSec: t.duration || Math.round(state.durationSec),
            listenedSec: Math.round(pos),
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
    });

    return () => {
      unsubscribe();
    };
  }, [tracks]);

  // 3. Handlers điều khiển phát nhạc
  const playQueue = useCallback(
    async (trackList = tracks, startIndex = currentTrackIndex) => {
      if (trackList.length === 0) return;
      const offlineAwareTracks = trackList.map((t) => {
        const localAudio = getOfflineAudioUri(t.id);
        if (localAudio) {
          return {
            ...t,
            file: localAudio,
          };
        }
        return resolveTrackUrls(t, serverUrl, serverToken);
      });
      await playerService.playQueue(offlineAwareTracks, startIndex);
    },
    [tracks, currentTrackIndex, getOfflineAudioUri, serverUrl, serverToken]
  );

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
    if (customLoopTarget !== null) {
      setCustomLoopTarget(null);
      setCustomLoopRemaining(null);
      customLoopRemainingRef.current = null;
    }
    if (tracks.length > 0) {
      await playerService.next();
    }
  }, [tracks.length, customLoopTarget]);

  const previous = useCallback(async () => {
    Vibration.vibrate(10);
    if (customLoopTarget !== null) {
      setCustomLoopTarget(null);
      setCustomLoopRemaining(null);
      customLoopRemainingRef.current = null;
    }
    if (tracks.length > 0) {
      await playerService.previous();
    }
  }, [tracks.length, customLoopTarget]);

  const skipToTrack = useCallback(async (index: number) => {
    Vibration.vibrate(10);
    if (customLoopTarget !== null) {
      setCustomLoopTarget(null);
      setCustomLoopRemaining(null);
      customLoopRemainingRef.current = null;
    }
    if (!playerState.activeTrackId) {
      await playQueue(tracks, index);
    } else {
      await playerService.skipToIndex(index);
    }
  }, [playerState.activeTrackId, tracks, playQueue, customLoopTarget]);

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
    if (customLoopTarget !== null) {
      setCustomLoopTarget(null);
      setCustomLoopRemaining(null);
      customLoopRemainingRef.current = null;
      setRepeatMode('off');
      await playerService.setRepeatMode('off');
      return;
    }
    const nextMode: RepeatMode =
      repeatMode === 'off' ? 'track' : repeatMode === 'track' ? 'queue' : 'off';
    setRepeatMode(nextMode);
    await playerService.setRepeatMode(nextMode);
  }, [repeatMode, customLoopTarget]);

  const setCustomLoopCount = useCallback(async (count: number | null) => {
    Vibration.vibrate(10);
    if (count === null || count <= 0) {
      setCustomLoopTarget(null);
      setCustomLoopRemaining(null);
      customLoopRemainingRef.current = null;
      setRepeatMode('off');
      await playerService.setRepeatMode('off');
    } else {
      setCustomLoopTarget(count);
      setCustomLoopRemaining(count);
      customLoopRemainingRef.current = count;
      setRepeatMode('track');
      await playerService.setRepeatMode('track');
    }
  }, []);

  const toggleVinylMode = useCallback(() => {
    Vibration.vibrate(12);
    setIsVinylMode((prev) => {
      const nextVal = !prev;
      saveVinylModePreference(nextVal).catch(() => { });
      return nextVal;
    });
  }, []);

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

  // Xóa bài hát khỏi hàng đợi phát hiện tại
  const removeFromQueue = useCallback(async (index: number) => {
    Vibration.vibrate(10);
    if (index < 0 || index >= tracks.length) return;
    const remaining = tracks.filter((_, idx) => idx !== index);

    if (remaining.length === 0) {
      setTracks([]);
      setCurrentTrackIndex(0);
      await playerService.pause();
      return;
    }

    if (index === currentTrackIndex) {
      const nextIdx = Math.min(index, remaining.length - 1);
      setTracks(remaining);
      setCurrentTrackIndex(nextIdx);
      await playQueue(remaining, nextIdx);
    } else if (index < currentTrackIndex) {
      setTracks(remaining);
      setCurrentTrackIndex((prev) => Math.max(0, prev - 1));
    } else {
      setTracks(remaining);
    }
  }, [tracks, currentTrackIndex, playQueue, setTracks]);

  // Di chuyển bài hát trong hàng đợi (Reorder queue)
  const moveQueueItem = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (
        fromIndex < 0 ||
        fromIndex >= tracks.length ||
        toIndex < 0 ||
        toIndex >= tracks.length ||
        fromIndex === toIndex
      ) {
        return;
      }
      Vibration.vibrate(10);
      const updated = [...tracks];
      const [moved] = updated.splice(fromIndex, 1);
      if (!moved) return;
      updated.splice(toIndex, 0, moved);

      let nextCurrentIndex = currentTrackIndex;
      if (currentTrackIndex === fromIndex) {
        nextCurrentIndex = toIndex;
      } else if (fromIndex < currentTrackIndex && toIndex >= currentTrackIndex) {
        nextCurrentIndex = currentTrackIndex - 1;
      } else if (fromIndex > currentTrackIndex && toIndex <= currentTrackIndex) {
        nextCurrentIndex = currentTrackIndex + 1;
      }

      setTracks(updated);
      setCurrentTrackIndex(nextCurrentIndex);
    },
    [tracks, currentTrackIndex, setTracks]
  );

  // Thiết lập Sleep Timer (Hẹn giờ tắt nhạc) dựa trên wall-clock timestamp an toàn khi khóa màn hình
  const sleepTimerTargetMsRef = useRef<number | null>(null);

  const setSleepTimer = useCallback((minutes: number | null) => {
    Vibration.vibrate(10);
    if (minutes === null || minutes <= 0) {
      sleepTimerTargetMsRef.current = null;
      setSleepTimerMinutes(null);
      setSleepTimerRemainingSec(null);
      return;
    }
    const targetMs = Date.now() + minutes * 60 * 1000;
    sleepTimerTargetMsRef.current = targetMs;
    setSleepTimerMinutes(minutes);
    setSleepTimerRemainingSec(minutes * 60);
  }, []);

  // Đếm ngược Sleep Timer tự động bám theo thời gian thực (kể cả khi app chạy nền hoặc khóa màn hình)
  useEffect(() => {
    if (sleepTimerMinutes === null || !sleepTimerTargetMsRef.current) return;

    const checkTimer = () => {
      if (!sleepTimerTargetMsRef.current) return;
      const now = Date.now();
      const diffMs = sleepTimerTargetMsRef.current - now;
      if (diffMs <= 0) {
        playerService.pause().catch(() => { });
        setSleepTimerMinutes(null);
        setSleepTimerRemainingSec(null);
        sleepTimerTargetMsRef.current = null;
        Vibration.vibrate([0, 100, 50, 100]);
      } else {
        setSleepTimerRemainingSec(Math.ceil(diffMs / 1000));
      }
    };

    checkTimer();
    const interval = setInterval(checkTimer, 1000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkTimer();
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [sleepTimerMinutes]);

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

  // Cập nhật giới hạn số lượng bài nghe gần đây
  const setRecentLimit = useCallback(async (limit: number) => {
    Vibration.vibrate(10);
    setRecentTracksData((prev) => {
      const updated = updateRecentLimit(limit, prev);
      saveRecentTracks(updated).catch(() => { });
      return updated;
    });
  }, []);

  // Xóa danh sách bài nghe gần đây
  const clearRecentTracks = useCallback(async () => {
    Vibration.vibrate(10);
    setRecentTracksData((prev) => {
      const updated = { ...prev, trackIds: [] };
      saveRecentTracks(updated).catch(() => { });
      return updated;
    });
  }, []);

  // Dẫn xuất danh sách Track[] hoàn chỉnh từ trackIds
  const recentTracks = useMemo(() => {
    const trackMap = new Map<string, Track>();
    for (const t of tracks) {
      trackMap.set(t.id, t);
    }
    return recentTracksData.trackIds
      .map((id) => trackMap.get(id))
      .filter((t): t is Track => t !== undefined);
  }, [tracks, recentTracksData.trackIds]);

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
        recentTracks,
        recentLimit: recentTracksData.limit,
        setRecentLimit,
        clearRecentTracks,
        playQueue,
        togglePlay,
        next,
        previous,
        skipToTrack,
        seekOffset,
        seekTo,
        cycleRepeat,
        customLoopTarget,
        customLoopRemaining,
        setCustomLoopCount,
        isVinylMode,
        toggleVinylMode,
        transitionSettings,
        updateTransitionSettings,
        toggleSmartShuffle,
        applySortMode,
        addCustomTrack,
        removeFromQueue,
        moveQueueItem,
        sleepTimerMinutes,
        sleepTimerRemainingSec,
        setSleepTimer,
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

