import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { AppState, Alert } from 'react-native';
import {
  type Track,
  smartShuffle,
  sortTracksByMode,
  type TrackSortMode,
  type SmartTransitionSettings,
  setSleepTimerState,
  handleSleepTimerPlaybackChange,
  handleSleepTimerTick,
  isPlaybackTrulyPaused,
  INITIAL_SLEEP_TIMER_STATE,
  type SleepTimerState,
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
  removeTrackFromRecentList,
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
  recentTrackIds: string[];
  recentLimit: number;
  setRecentLimit: (limit: number) => Promise<void>;
  clearRecentTracks: () => Promise<void>;
  removeRecentTrack: (trackId: string) => Promise<void>;
  playQueue: (trackList?: Track[], startIndex?: number) => Promise<void>;
  playNext: (track: Track) => Promise<void>;
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
  handleTrackDeleted: (deletedTrackId: string, remaining?: Track[]) => Promise<void>;
  gaplessDeltaMs: number | null;
  atomicWriteBranch: string;
  lastMoveError: string | null;
  recoveryStatus: string;
  writeQueueStatus: string;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { tracks, originalTracks, setOriginalTracks, serverUrl, serverToken, isOffline } = useLibrary();
  const { getOfflineAudioUri, getOfflineCoverUri } = useOffline();

  // Hàng đợi phát độc lập (Active Queue), không làm thay đổi hay mất bài trong Thư viện
  const [activeQueue, setActiveQueue] = useState<Track[]>([]);
  const queueTracks = activeQueue.length > 0 ? activeQueue : tracks;
  const queueTracksRef = useRef<Track[]>(queueTracks);
  queueTracksRef.current = queueTracks;

  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    isBuffering: false,
    activeTrackId: null,
    positionSec: 0,
    durationSec: 0,
    bufferedSec: null,
  });

  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const currentTrack: Track | null = queueTracks[currentTrackIndex] ?? null;
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
  const isPlayingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(true);
  const sleepTimerStateRef = useRef<SleepTimerState>(INITIAL_SLEEP_TIMER_STATE);

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

      // Xử lý chuyển đổi trạng thái Play / Pause cho Sleep Timer (Phương án A)
      // Chỉ coi là Pause thực sự khi !state.isPlaying && !state.isBuffering (loại trừ Buffering / Seeking tua bài)
      const isTrulyPaused = isPlaybackTrulyPaused(state.isPlaying, state.isBuffering);
      const wasPaused = isPausedRef.current;
      isPausedRef.current = isTrulyPaused;
      isPlayingRef.current = state.isPlaying;

      if (wasPaused !== isTrulyPaused) {
        // Lưu ý: Sleep Timer hoạt động dựa trên mốc giờ thực tế (Wall-Clock Timestamp) bằng Date.now().
        // Mốc tắt cố định là Date.now() + minutes * 60 * 1000.
        // Khi Pause: khôi phục tên nghệ sĩ gốc ngoài Lock Screen để tránh bị treo số phút khi iOS đình chỉ tiến trình.
        // Khi Play: tính lại thời gian thực tế bằng Date.now(). Nếu đã quá hạn lúc Pause thì phiên hẹn giờ tự động hủy để phát nhạc tiếp.
        const isPlayingOrBuffering = !isTrulyPaused;
        const res = handleSleepTimerPlaybackChange(sleepTimerStateRef.current, isPlayingOrBuffering, Date.now());
        sleepTimerStateRef.current = res.nextState;
        setSleepTimerMinutes(res.nextState.minutes);
        setSleepTimerRemainingSec(res.nextState.remainingSec);
        if (res.updateLockScreen) {
          playerService.updateLockScreenTimer?.(res.lockScreenText);
        }
      }

      if (state.activeTrackId) {
        const idx = queueTracksRef.current.findIndex((t) => t.id === state.activeTrackId);
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

      // Ghi nhận ngay vào danh sách Nghe gần đây tức thì khi bài hát mới bắt đầu phát (không chờ 5s)
      if (
        state.activeTrackId &&
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
        const t =
          queueTracksRef.current.find((x) => x.id === state.activeTrackId) ||
          tracks.find((x) => x.id === state.activeTrackId);
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
    async (trackList = queueTracks, startIndex = currentTrackIndex) => {
      if (trackList.length === 0) return;

      const offlineAwareTracks = trackList.map((t) => {
        const localAudio = getOfflineAudioUri(t.id);
        if (localAudio) {
          const localCover = getOfflineCoverUri(t.id);
          return {
            ...t,
            file: localAudio,
            cover: localCover || undefined,
          };
        }
        return resolveTrackUrls(t, serverUrl, serverToken);
      });

      // Nếu đang mất mạng (isOffline = true), cách ly 100% chỉ cho phép phát nhạc offline cục bộ
      if (isOffline) {
        const selectedTrack = trackList[startIndex];
        const isSelectedDownloaded = Boolean(selectedTrack && getOfflineAudioUri(selectedTrack.id));
        if (!isSelectedDownloaded) {
          Alert.alert(
            'Chưa tải bài hát',
            `Bài hát "${selectedTrack?.title || 'này'}" chưa được tải về máy. Vui lòng kết nối mạng để nghe hoặc tải về trước khi nghe ngoại tuyến.`
          );
          return;
        }

        const offlinePlayable = offlineAwareTracks.filter((t) => t.file.startsWith('file://'));
        if (offlinePlayable.length === 0) {
          Alert.alert(
            'Chưa tải bài hát',
            'Hiện tại chưa có bài hát nào được tải về máy để nghe ngoại tuyến.'
          );
          return;
        }

        const newStartIndex = Math.max(
          0,
          offlinePlayable.findIndex((t) => t.id === selectedTrack?.id)
        );

        setActiveQueue(offlinePlayable);
        setCurrentTrackIndex(newStartIndex);
        await playerService.playQueue(offlinePlayable, newStartIndex);
        return;
      }

      // Cập nhật hàng đợi đang phát riêng biệt, giữ nguyên thư viện ở trang chủ
      setActiveQueue(trackList);
      setCurrentTrackIndex(startIndex);
      await playerService.playQueue(offlineAwareTracks, startIndex);
    },
    [queueTracks, currentTrackIndex, getOfflineAudioUri, getOfflineCoverUri, serverUrl, serverToken, isOffline]
  );

  const playNext = useCallback(
    async (track: Track) => {
      if (isOffline && !getOfflineAudioUri(track.id)) {
        Alert.alert(
          'Chưa tải bài hát',
          `Bài hát "${track.title}" chưa được tải về máy. Không thể thêm vào danh sách phát khi đang ngoại tuyến.`
        );
        return;
      }

      if (!currentTrack) {
        await playQueue([track], 0);
        return;
      }
      const insertIdx = currentTrackIndex + 1;
      const updated = [...queueTracks];
      // Loại bỏ bài hát nếu nó đã xuất hiện sau vị trí hiện tại
      const existingIdx = updated.findIndex((t, idx) => t.id === track.id && idx > currentTrackIndex);
      if (existingIdx !== -1) {
        updated.splice(existingIdx, 1);
      }
      updated.splice(insertIdx, 0, track);
      setActiveQueue(updated);

      const offlineAwareTracks = updated.map((t) => {
        const localAudio = getOfflineAudioUri(t.id);
        if (localAudio) {
          const localCover = getOfflineCoverUri(t.id);
          return {
            ...t,
            file: localAudio,
            cover: localCover || undefined,
          };
        }
        return resolveTrackUrls(t, serverUrl, serverToken);
      });
      await playerService.playQueue(offlineAwareTracks, currentTrackIndex);
    },
    [currentTrack, currentTrackIndex, queueTracks, getOfflineAudioUri, getOfflineCoverUri, serverUrl, serverToken, playQueue, isOffline]
  );

  const togglePlay = useCallback(async () => {
    if (playerState.isPlaying) {
      await playerService.pause();
    } else {
      if (!playerState.activeTrackId && queueTracks.length > 0) {
        await playQueue();
      } else if (playerState.activeTrackId) {
        if (isOffline) {
          const activeTrack = queueTracks[currentTrackIndex];
          const localUri = activeTrack ? getOfflineAudioUri(activeTrack.id) : null;
          if (!localUri) {
            Alert.alert(
              'Mất kết nối mạng',
              'Bài hát này chưa được tải về máy nên không thể tiếp tục phát khi ngoại tuyến. Vui lòng chọn bài hát đã tải.'
            );
            return;
          }
        }
        await playerService.play();
      }
    }
  }, [playerState.isPlaying, playerState.activeTrackId, queueTracks, currentTrackIndex, playQueue, isOffline, getOfflineAudioUri]);

  const next = useCallback(async () => {
    if (customLoopTarget !== null) {
      setCustomLoopTarget(null);
      setCustomLoopRemaining(null);
      customLoopRemainingRef.current = null;
    }
    if (queueTracks.length > 0) {
      await playerService.next();
    }
  }, [queueTracks.length, customLoopTarget]);

  const previous = useCallback(async () => {
    if (customLoopTarget !== null) {
      setCustomLoopTarget(null);
      setCustomLoopRemaining(null);
      customLoopRemainingRef.current = null;
    }
    if (queueTracks.length > 0) {
      await playerService.previous();
    }
  }, [queueTracks.length, customLoopTarget]);

  const skipToTrack = useCallback(async (index: number) => {
    if (customLoopTarget !== null) {
      setCustomLoopTarget(null);
      setCustomLoopRemaining(null);
      customLoopRemainingRef.current = null;
    }
    if (!playerState.activeTrackId) {
      await playQueue(queueTracks, index);
    } else {
      await playerService.skipToIndex(index);
    }
  }, [playerState.activeTrackId, queueTracks, playQueue, customLoopTarget]);

  const seekOffset = useCallback(async (secondsOffset: number) => {
    const currTrack = queueTracks[currentTrackIndex];
    const totalSec = Math.max(0, isFinite(playerState.durationSec) && playerState.durationSec > 0 ? playerState.durationSec : (currTrack?.duration ?? 0));
    const pos = isFinite(playerState.positionSec) ? playerState.positionSec : 0;
    const offset = isFinite(secondsOffset) ? secondsOffset : 0;
    const rawTarget = Math.max(0, pos + offset);
    const target = totalSec > 0 ? Math.min(totalSec, rawTarget) : rawTarget;
    await playerService.seekTo(target);
  }, [queueTracks, currentTrackIndex, playerState.durationSec, playerState.positionSec]);

  const seekTo = useCallback(async (seconds: number) => {
    const safeSec = !isFinite(seconds) || isNaN(seconds) || seconds < 0 ? 0 : seconds;
    await playerService.seekTo(safeSec);
  }, []);

  const cycleRepeat = useCallback(async () => {
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
    setIsVinylMode((prev) => {
      const nextVal = !prev;
      saveVinylModePreference(nextVal).catch(() => { });
      return nextVal;
    });
  }, []);

  const toggleSmartShuffle = useCallback(async () => {
    if (queueTracks.length === 0) return;

    if (!isSmartShuffle) {
      setOriginalTracks([...queueTracks]);
      const currTrack = queueTracks[currentTrackIndex];
      const shuffled = smartShuffle(queueTracks, currTrack?.id);
      setActiveQueue(shuffled);
      setCurrentTrackIndex(0);
      setIsSmartShuffle(true);
      await playerService.playQueue(shuffled, 0);
    } else {
      const currTrack = queueTracks[currentTrackIndex];
      const restored = originalTracks.length > 0 ? originalTracks : queueTracks;
      const restoredIdx = currTrack
        ? Math.max(0, restored.findIndex((t) => t.id === currTrack.id))
        : 0;
      setActiveQueue(restored);
      setCurrentTrackIndex(restoredIdx);
      setIsSmartShuffle(false);
      await playerService.playQueue(restored, restoredIdx);
    }
  }, [queueTracks, currentTrackIndex, isSmartShuffle, originalTracks, setOriginalTracks]);

  const applySortMode = useCallback((mode: TrackSortMode) => {
    setSortMode(mode);
    const sorted = sortTracksByMode(queueTracks, mode);
    setActiveQueue(sorted);
    if (playerState.activeTrackId) {
      const newIdx = sorted.findIndex((t) => t.id === playerState.activeTrackId);
      if (newIdx >= 0) setCurrentTrackIndex(newIdx);
    }
  }, [queueTracks, playerState.activeTrackId]);

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

    const newTrackList = [...queueTracks, newTrack];
    setActiveQueue(newTrackList);
    if (isSmartShuffle) {
      setOriginalTracks((prev) => [...prev, newTrack]);
    }
    await playQueue(newTrackList, newTrackList.length - 1);
  }, [queueTracks, isSmartShuffle, setOriginalTracks, playQueue]);

  // Xóa bài hát khỏi hàng đợi phát hiện tại
  const removeFromQueue = useCallback(async (index: number) => {
    if (index < 0 || index >= queueTracks.length) return;
    const remaining = queueTracks.filter((_, idx) => idx !== index);

    if (remaining.length === 0) {
      setActiveQueue([]);
      setCurrentTrackIndex(0);
      await playerService.pause();
      return;
    }

    if (index === currentTrackIndex) {
      const nextIdx = Math.min(index, remaining.length - 1);
      setActiveQueue(remaining);
      setCurrentTrackIndex(nextIdx);
      await playQueue(remaining, nextIdx);
    } else if (index < currentTrackIndex) {
      setActiveQueue(remaining);
      setCurrentTrackIndex((prev) => Math.max(0, prev - 1));
    } else {
      setActiveQueue(remaining);
    }
  }, [queueTracks, currentTrackIndex, playQueue]);

  // Di chuyển bài hát trong hàng đợi (Reorder queue)
  const moveQueueItem = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (
        fromIndex < 0 ||
        fromIndex >= queueTracks.length ||
        toIndex < 0 ||
        toIndex >= queueTracks.length ||
        fromIndex === toIndex
      ) {
        return;
      }
      const updated = [...queueTracks];
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

      setActiveQueue(updated);
      setCurrentTrackIndex(nextCurrentIndex);
    },
    [queueTracks, currentTrackIndex]
  );

  // Thiết lập Sleep Timer (Hẹn giờ tắt nhạc) dựa trên wall-clock timestamp an toàn khi khóa màn hình
  const setSleepTimer = useCallback((minutes: number | null) => {
    // Dùng !isPausedRef.current để nếu hẹn giờ lúc đang buffering vẫn tính là đang phát và hiện dòng đếm ngược
    const isPlayingOrBuffering = !isPausedRef.current;
    const res = setSleepTimerState(minutes, Date.now(), isPlayingOrBuffering);
    sleepTimerStateRef.current = res.nextState;
    setSleepTimerMinutes(res.nextState.minutes);
    setSleepTimerRemainingSec(res.nextState.remainingSec);
    if (res.updateLockScreen) {
      playerService.updateLockScreenTimer?.(res.lockScreenText);
    }
  }, []);

  // Đếm ngược Sleep Timer tự động bám theo thời gian thực (kể cả khi app chạy nền hoặc khóa màn hình)
  useEffect(() => {
    if (sleepTimerMinutes === null || !sleepTimerStateRef.current.targetMs) {
      return;
    }

    const checkTimer = () => {
      if (!sleepTimerStateRef.current.targetMs) return;
      // Dùng !isPausedRef.current thay vì isPlayingRef.current để khi buffering đếm ngược vẫn chạy và nếu hết giờ sẽ dừng ngay.
      // Giới hạn đã biết: Pause đúng lúc buffering có thể giữ dòng đếm ngược cho tới khi buffer xong.
      const isPlayingOrBuffering = !isPausedRef.current;
      const res = handleSleepTimerTick(sleepTimerStateRef.current, isPlayingOrBuffering, Date.now());
      sleepTimerStateRef.current = res.nextState;
      setSleepTimerMinutes(res.nextState.minutes);
      setSleepTimerRemainingSec(res.nextState.remainingSec);
      if (res.updateLockScreen) {
        playerService.updateLockScreenTimer?.(res.lockScreenText);
      }
      if (res.shouldPauseMusic) {
        playerService.pause().catch(() => { });
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
  const handleTrackDeleted = useCallback(async (trackId: string, remaining?: Track[]) => {
    const targetIdx = queueTracks.findIndex((t) => t.id === trackId);
    const updatedQueue = remaining ?? queueTracks.filter((t) => t.id !== trackId);
    setActiveQueue(updatedQueue);

    if (queueTracks[currentTrackIndex]?.id === trackId) {
      if (updatedQueue.length > 0) {
        const nextIdx = Math.min(targetIdx >= 0 ? targetIdx : 0, updatedQueue.length - 1);
        setCurrentTrackIndex(nextIdx);
        await playQueue(updatedQueue, nextIdx);
      } else {
        setCurrentTrackIndex(0);
        await playerService.pause();
      }
    } else if (targetIdx >= 0 && targetIdx < currentTrackIndex) {
      setCurrentTrackIndex((prev) => Math.max(0, prev - 1));
    }
  }, [queueTracks, currentTrackIndex, playQueue]);

  // Cập nhật giới hạn số lượng bài nghe gần đây
  const setRecentLimit = useCallback(async (limit: number) => {
    setRecentTracksData((prev) => {
      const updated = updateRecentLimit(limit, prev);
      saveRecentTracks(updated).catch(() => { });
      return updated;
    });
  }, []);

  // Xóa danh sách bài nghe gần đây
  const clearRecentTracks = useCallback(async () => {
    setRecentTracksData((prev) => {
      const updated = { ...prev, trackIds: [] };
      saveRecentTracks(updated).catch(() => { });
      return updated;
    });
  }, []);

  // Xóa một bài khỏi danh sách nghe gần đây
  const removeRecentTrack = useCallback(async (trackId: string) => {
    setRecentTracksData((prev) => {
      const updated = removeTrackFromRecentList(trackId, prev);
      saveRecentTracks(updated).catch(() => { });
      return updated;
    });
  }, []);

  // Dẫn xuất danh sách Track[] hoàn chỉnh từ trackIds (tra cứu qua tracks, originalTracks và activeQueue)
  const recentTracks = useMemo(() => {
    const trackMap = new Map<string, Track>();
    for (const t of tracks) {
      trackMap.set(t.id, t);
    }
    for (const t of originalTracks) {
      trackMap.set(t.id, t);
    }
    for (const t of activeQueue) {
      trackMap.set(t.id, t);
    }
    return recentTracksData.trackIds
      .map((id) => trackMap.get(id))
      .filter((t): t is Track => t !== undefined);
  }, [tracks, originalTracks, activeQueue, recentTracksData.trackIds]);

  const gaplessDeltaMs = playerService.getGaplessDeltaMs();

  const contextValue = useMemo<PlayerContextValue>(
    () => ({
      tracks: queueTracks,
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
      recentTrackIds: recentTracksData.trackIds,
      recentLimit: recentTracksData.limit,
      setRecentLimit,
      clearRecentTracks,
      removeRecentTrack,
      playQueue,
      playNext,
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
    }),
    [
      queueTracks,
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
      recentTracksData.trackIds,
      recentTracksData.limit,
      setRecentLimit,
      clearRecentTracks,
      removeRecentTrack,
      playQueue,
      playNext,
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
    ]
  );

  return (
    <PlayerContext.Provider value={contextValue}>
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

