import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  TextInput,
  Alert,
  Vibration,
  Linking,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  colors,
  spacing,
  radius,
  fontSizes,
  fontWeights,
  lineHeights,
  layout,
  useResponsive,
} from '../src/theme';
import {
  type Track,
  type UpdateTrack,
  type UserState,
  smartShuffle,
  mergeUserStates,
  sortTracksByMode,
  type TrackSortMode,
  interleaveTracksByArtist,
} from '@music-app/shared';
import { playerService } from '../src/services/player/rntpPlayerService';
import type { PlayerState, RepeatMode } from '../src/services/player/types';
import { parseMobileprovisionExpiration } from '../src/utils/mobileprovision';
import { EditTrackModal } from '../src/components/EditTrackModal';
import { ProfileModal } from '../src/components/ProfileModal';
import { LyricsModal } from '../src/components/LyricsModal';
import { PlaylistModal } from '../src/components/PlaylistModal';
import { statsStorage } from '../src/services/stats/statsStorage';
import { MusicApiClient } from '../src/services/api/musicApiClient';
import {
  PlayIcon,
  PauseIcon,
  NextIcon,
  PrevIcon,
  SeekBackwardIcon,
  SeekForwardIcon,
  ShuffleIcon,
  RepeatIcon,
  RepeatOneIcon,
  ProfileIcon,
  EditIcon,
  MysteryIcon,
  QuestionIcon,
  DiscIcon,
  LyricsIcon,
  PlaylistIcon,
  HeartIcon,
} from '../src/components/icons/SvgIcons';

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0 || !isFinite(seconds)) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function SpikePlayerScreen() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [originalTracks, setOriginalTracks] = useState<Track[]>([]);
  const [customUrl, setCustomUrl] = useState<string>('');
  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    isBuffering: false,
    activeTrackId: null,
    positionSec: 0,
    durationSec: 0,
    bufferedSec: null,
  });
  const [expirationDate, setExpirationDate] = useState<string | null>('Đang kiểm tra...');
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [isSmartShuffle, setIsSmartShuffle] = useState<boolean>(false);
  const [barWidth, setBarWidth] = useState<number>(0);

  // Hook đo lường safe area & responsive cho toàn bộ màn hình
  const insets = useSafeAreaInsets();
  const { width, height, isLandscape, gutter, maxContentWidth } = useResponsive();

  // Tính toán kích thước ảnh bìa thích ứng
  // Lưu ý: Nhánh landscape tạm thời không chạy vì app đang khóa orientation: 'portrait' trong app.config.ts (giữ nguyên code kiến trúc responsive dự phòng).
  const artworkSize = isLandscape
    ? Math.max(140, Math.min(Math.round(height * 0.48), 240))
    : Math.max(140, Math.min(width - gutter * 2 - spacing.xl * 2, Math.round(height * 0.38), 340));

  // State cho Profile & Thống kê
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [atomicWriteBranch, setAtomicWriteBranch] = useState<string>('Chưa ghi');
  const [lastMoveError, setLastMoveError] = useState<string | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<string>('Không có khôi phục');
  const [writeQueueStatus, setWriteQueueStatus] = useState<string>('Đã ghi xong (hàng đợi rỗng)');
  const lastRecordedTrackRef = useRef<string | null>(null);
  const currentTrackingTrackIdRef = useRef<string | null>(null);
  const maxListenedSecRef = useRef<number>(0);

  // State cho Edit / Delete Modal & Đồng bộ Cloudflare
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [lyricsModalVisible, setLyricsModalVisible] = useState(false);
  const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
  const [userState, setUserState] = useState<UserState>({
    version: 1,
    updatedAt: new Date().toISOString(),
    playlists: [],
    favoriteIds: [],
  });
  const [sortMode, setSortMode] = useState<TrackSortMode>('smart');

  const [serverUrl, setServerUrl] = useState<string>(

    process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8787'
  );
  const [serverToken, setServerToken] = useState<string>(
    process.env.EXPO_PUBLIC_API_TOKEN || ''
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const CONFIG_FILE = `${FileSystem.documentDirectory || ''}beatify_server_config.json`;
  const USER_STATE_FILE = `${FileSystem.documentDirectory || ''}beatify_user_state.json`;

  // Tự động nạp cấu hình máy chủ & token đã lưu từ các lần quét trước
  useEffect(() => {
    async function loadSavedConfig() {
      try {
        const info = await FileSystem.getInfoAsync(CONFIG_FILE);
        if (info.exists) {
          const raw = await FileSystem.readAsStringAsync(CONFIG_FILE);
          const data = JSON.parse(raw);
          if (data.serverUrl) setServerUrl(data.serverUrl);
          if (data.serverToken !== undefined) setServerToken(data.serverToken);
        }
      } catch (err) {
        console.warn('Lỗi đọc cấu hình server đã lưu:', err);
      }
    }
    loadSavedConfig();
  }, [CONFIG_FILE]);

  // Tự động nạp UserState (Playlists & Favorites) từ local cache và đồng bộ từ server
  useEffect(() => {
    async function loadUserState() {
      let localState: UserState = {
        version: 1,
        updatedAt: new Date(0).toISOString(),
        playlists: [],
        favoriteIds: [],
      };

      try {
        const info = await FileSystem.getInfoAsync(USER_STATE_FILE);
        if (info.exists) {
          const raw = await FileSystem.readAsStringAsync(USER_STATE_FILE);
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.playlists) && Array.isArray(parsed.favoriteIds)) {
            localState = parsed;
            setUserState(parsed);
          }
        }
      } catch (err) {
        console.warn('Lỗi đọc user state từ máy:', err);
      }

      const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
      const cleanToken = serverToken.trim();
      if (cleanUrl) {
        try {
          const client = new MusicApiClient({ baseUrl: cleanUrl, token: cleanToken });
          const remoteState = await client.fetchUserState();
          if (remoteState) {
            // HỢP NHẤT THÔNG MINH 2 CHIỀU: Bảo toàn playlist và favorites của cả iPhone và Web
            const merged = mergeUserStates(localState, remoteState);
            setUserState(merged);
            await FileSystem.writeAsStringAsync(USER_STATE_FILE, JSON.stringify(merged, null, 2));

            // Nếu máy có playlist hoặc favorites mới hơn chưa có trên remote -> tự động đồng bộ lên server
            if (JSON.stringify(merged) !== JSON.stringify(remoteState)) {
              await client.saveUserState(merged).catch((e) => {
                console.warn('Lỗi tự động đẩy merged state lên server:', e);
              });
            }
          }
        } catch (err) {
          console.warn('Không thể đồng bộ UserState từ server:', err);
        }
      }
    }
    loadUserState();
  }, [USER_STATE_FILE, serverUrl, serverToken]);


  // Hàm cập nhật UserState (lưu cache local + đồng bộ Cloudflare R2)
  const handleUpdateUserState = async (updater: (prev: UserState) => UserState) => {
    const nextState = updater(userState);
    nextState.updatedAt = new Date().toISOString();
    setUserState(nextState);

    try {
      await FileSystem.writeAsStringAsync(USER_STATE_FILE, JSON.stringify(nextState, null, 2));
    } catch (err) {
      console.warn('Lỗi ghi UserState local:', err);
    }

    const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
    const cleanToken = serverToken.trim();
    if (cleanUrl) {
      try {
        const client = new MusicApiClient({ baseUrl: cleanUrl, token: cleanToken });
        await client.saveUserState(nextState);
        setSyncStatus('Đã đồng bộ danh sách phát & yêu thích lên Cloudflare R2!');
      } catch (err) {
        console.warn('Lỗi đồng bộ UserState lên Cloudflare:', err);
      }
    }
  };

  // Toggle Favorite bài hát
  const handleToggleFavorite = async (trackId: string) => {
    Vibration.vibrate(10);
    const isFav = userState.favoriteIds.includes(trackId);
    await handleUpdateUserState((prev) => ({
      ...prev,
      favoriteIds: isFav
        ? prev.favoriteIds.filter((id) => id !== trackId)
        : [...prev.favoriteIds, trackId],
    }));
  };

  // Hàm tải lời bài hát từ Cloudflare R2
  const handleFetchLyrics = async (trackId: string): Promise<string | null> => {
    const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
    const cleanToken = serverToken.trim();
    if (!cleanUrl) return null;
    try {
      const client = new MusicApiClient({ baseUrl: cleanUrl, token: cleanToken });
      return await client.fetchLyrics(trackId);
    } catch (err) {
      console.warn('Lỗi tải lyrics từ máy chủ:', err);
      return null;
    }
  };


  useEffect(() => {
    // 1. Khởi tạo player và đăng ký theo dõi trạng thái
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

    // 2. Đọc ngày hết hạn từ file embedded.mobileprovision trong bundle ứng dụng
    async function loadProvisionExpiration() {
      try {
        const bundleDir = FileSystem.bundleDirectory;
        if (!bundleDir) {
          setExpirationDate('Không tìm thấy bundleDirectory (Dev/Sim)');
          return;
        }

        const profilePath = `${bundleDir}embedded.mobileprovision`;
        const fileInfo = await FileSystem.getInfoAsync(profilePath);
        if (!fileInfo.exists) {
          setExpirationDate('Chưa có embedded.mobileprovision (Simulator hoặc chưa build IPA)');
          return;
        }

        const base64Data = await FileSystem.readAsStringAsync(profilePath, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const date = parseMobileprovisionExpiration(base64Data);
        if (date) {
          setExpirationDate(date.toLocaleString('vi-VN'));
        } else {
          setExpirationDate('Không bóc tách được ExpirationDate từ file');
        }
      } catch (err) {
        setExpirationDate(`Lỗi đọc file: ${String(err)}`);
      }
    }

    loadProvisionExpiration();

    return () => {
      unsubscribe();
    };
  }, [tracks]);

  // Lắng nghe Deep Link khi người dùng quét mã QR từ camera iPhone: beatify://connect?api=...&token=...
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      try {
        if (!event.url) return;
        const rawUrl = event.url;
        if (rawUrl.includes('connect?') || rawUrl.includes('api=')) {
          const queryString = rawUrl.split('?')[1];
          if (!queryString) return;
          const params = new URLSearchParams(queryString);
          const newApiUrl = params.get('api');
          const newToken = params.get('token') || '';

          if (newApiUrl) {
            const cleanUrl = decodeURIComponent(newApiUrl).trim().replace(/\/+$/, '');
            const cleanToken = decodeURIComponent(newToken).trim();
            setServerUrl(cleanUrl);
            setServerToken(cleanToken);

            // Lưu vĩnh viễn cấu hình vào ổ đĩa điện thoại
            FileSystem.writeAsStringAsync(
              CONFIG_FILE,
              JSON.stringify({ serverUrl: cleanUrl, serverToken: cleanToken })
            ).catch((e) => console.warn('Lỗi ghi file cấu hình server:', e));

            Vibration.vibrate([0, 80, 50, 80]);
            Alert.alert(
              'Kết nối thành công! 🎉',
              `Đã nhận cấu hình máy chủ từ mã QR của Beatify Dashboard:\n\nServer: ${cleanUrl}\n\nĐang tự động đồng bộ thư viện nhạc...`
            );

            // Tự động tải thư viện ngay
            try {
              setIsSyncing(true);
              setSyncStatus('Đang tải danh sách bài hát...');
              const client = new MusicApiClient({ baseUrl: cleanUrl, token: cleanToken });
              const lib = await client.fetchLibrary();
              setTracks(lib.tracks);
              setOriginalTracks(lib.tracks);
              setSyncStatus(`Đã đồng bộ ${lib.tracks.length} bài hát từ Cloudflare!`);
            } catch (syncErr) {
              setSyncStatus(`Lỗi tải nhạc: ${String(syncErr)}`);
            } finally {
              setIsSyncing(false);
            }
          }
        }
      } catch (err) {
        console.warn('Lỗi xử lý Deep Link:', err);
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => {
      subscription.remove();
    };
  }, []);

  // Tự động ghi nhận lượt nghe và đo chính xác thời lượng nghe thực tế cho Profile & Replay
  useEffect(() => {
    // 1. Khi bài hát đổi sang bài khác: Chốt thời lượng thực tế của bài hát trước đó
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
      // 2. Bài hát đang tiếp tục phát: Cập nhật vị trí nghe cao nhất đạt được
      if (playerState.positionSec > maxListenedSecRef.current) {
        maxListenedSecRef.current = playerState.positionSec;
      }
    }

    // 3. Ghi nhận lượt nghe ban đầu khi bài hát vượt qua mốc 15 giây
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


  const handlePlayQueue = async (trackList = tracks, startIndex = currentTrackIndex) => {
    if (trackList.length === 0) return;
    await playerService.playQueue(trackList, startIndex);
  };

  const handleTogglePlay = async () => {
    Vibration.vibrate(10);
    if (playerState.isPlaying) {
      await playerService.pause();
    } else {
      if (!playerState.activeTrackId && tracks.length > 0) {
        await handlePlayQueue();
      } else if (playerState.activeTrackId) {
        await playerService.play();
      }
    }
  };

  const handleAddCustomTrack = async () => {
    const trimmed = customUrl.trim();
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
    setCustomUrl('');
    await handlePlayQueue(newTrackList, newTrackList.length - 1);
  };

  const handleNext = async () => {
    Vibration.vibrate(10);
    if (tracks.length > 0) {
      await playerService.next();
    }
  };

  const handlePrevious = async () => {
    Vibration.vibrate(10);
    if (tracks.length > 0) {
      await playerService.previous();
    }
  };

  const handleSkipToTrack = async (index: number) => {
    Vibration.vibrate(10);
    if (!playerState.activeTrackId) {
      await handlePlayQueue(tracks, index);
    } else {
      await playerService.skipToIndex(index);
    }
  };

  const handleSeekOffset = async (secondsOffset: number) => {
    Vibration.vibrate(10);
    const currTrack = tracks[currentTrackIndex];
    const totalSec = playerState.durationSec || (currTrack ? currTrack.duration : 0);
    const target = totalSec > 0
      ? Math.min(totalSec, Math.max(0, playerState.positionSec + secondsOffset))
      : Math.max(0, playerState.positionSec + secondsOffset);
    await playerService.seekTo(target);
  };

  const handleBarPress = async (locationX: number) => {
    if (barWidth <= 0 || tracks.length === 0) return;
    Vibration.vibrate(10);
    const currentTrack = tracks[currentTrackIndex];
    const totalDuration = playerState.durationSec || (currentTrack ? currentTrack.duration : 0);
    if (totalDuration <= 0) return;
    const ratio = Math.max(0, Math.min(1, locationX / barWidth));
    const target = ratio * totalDuration;
    await playerService.seekTo(target);
  };

  const handleCycleRepeat = async () => {
    Vibration.vibrate(10);
    const nextMode: RepeatMode =
      repeatMode === 'off' ? 'track' : repeatMode === 'track' ? 'queue' : 'off';
    setRepeatMode(nextMode);
    await playerService.setRepeatMode(nextMode);
  };

  const handleToggleSmartShuffle = async () => {
    Vibration.vibrate(10);
    if (tracks.length === 0) return;

    if (!isSmartShuffle) {
      // 1. Kích hoạt Smart Shuffle
      setOriginalTracks([...tracks]);
      const currentTrack = tracks[currentTrackIndex];
      const shuffled = smartShuffle(tracks, currentTrack?.id);
      setTracks(shuffled);
      setCurrentTrackIndex(0);
      setIsSmartShuffle(true);
      await playerService.playQueue(shuffled, 0);
    } else {
      // 2. Tắt Smart Shuffle, hoàn trả thứ tự bài ban đầu
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
  };

  const handleOpenEdit = (track: Track) => {
    setEditingTrack(track);
    setEditModalVisible(true);
  };

  const handleSaveTrack = async (trackId: string, updates: UpdateTrack) => {
    // 1. Optimistic Update ngay lập tức trên Mobile
    const updatedList = tracks.map((t) => {
      if (t.id === trackId) {
        return {
          ...t,
          ...(updates.title !== undefined ? { title: updates.title } : {}),
          ...(updates.artist !== undefined ? { artist: updates.artist } : {}),
          ...(updates.album !== undefined ? { album: updates.album } : {}),
          ...(updates.year !== undefined ? { year: updates.year } : {}),
        };
      }
      return t;
    });
    setTracks(updatedList);
    if (originalTracks.length > 0) {
      setOriginalTracks((prev) =>
        prev.map((t) => {
          if (t.id === trackId) {
            return {
              ...t,
              ...(updates.title !== undefined ? { title: updates.title } : {}),
              ...(updates.artist !== undefined ? { artist: updates.artist } : {}),
              ...(updates.album !== undefined ? { album: updates.album } : {}),
              ...(updates.year !== undefined ? { year: updates.year } : {}),
            };
          }
          return t;
        })
      );
    }

    // 2. Gửi request đồng bộ lên Cloudflare Worker (nếu đã cấu hình server)
    const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
    const cleanToken = serverToken.trim();
    if (cleanUrl && !trackId.startsWith('custom-')) {
      try {
        const client = new MusicApiClient({ baseUrl: cleanUrl, token: cleanToken });
        await client.updateTrack(trackId, updates);
        setSyncStatus(`Đã lưu và đồng bộ "${updates.title || 'bài hát'}" lên Cloudflare R2!`);
      } catch (err) {
        console.warn('Lỗi đồng bộ Cloudflare:', err);
        setSyncStatus(`Lưu cục bộ thành công (Đồng bộ Cloudflare thất bại: ${String(err)})`);
      }
    } else {
      setSyncStatus(`Đã cập nhật bài hát "${updates.title || ''}" trên app`);
    }
  };

  const handleDeleteTrack = async (trackId: string) => {
    // 1. Optimistic Update ngay lập tức trên Mobile
    const targetIdx = tracks.findIndex((t) => t.id === trackId);
    const updatedList = tracks.filter((t) => t.id !== trackId);
    setTracks(updatedList);
    if (originalTracks.length > 0) {
      setOriginalTracks((prev) => prev.filter((t) => t.id !== trackId));
    }

    // Nếu bài đang phát bị xóa, chuyển bài hoặc dừng
    if (tracks[currentTrackIndex]?.id === trackId) {
      if (updatedList.length > 0) {
        const nextIdx = Math.min(targetIdx, updatedList.length - 1);
        setCurrentTrackIndex(nextIdx);
        await handlePlayQueue(updatedList, nextIdx);
      } else {
        setCurrentTrackIndex(0);
        await playerService.pause();
      }
    } else if (targetIdx < currentTrackIndex) {
      // Bảo toàn vị trí bài đang phát khi xóa bài đứng trước
      setCurrentTrackIndex((prev) => Math.max(0, prev - 1));
    }

    // 2. Gửi request xóa lên Cloudflare Worker (nếu là bài từ Cloudflare)
    const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
    const cleanToken = serverToken.trim();
    if (cleanUrl && !trackId.startsWith('custom-')) {
      try {
        const client = new MusicApiClient({ baseUrl: cleanUrl, token: cleanToken });
        await client.deleteTrack(trackId);
        setSyncStatus(`Đã chuyển bài hát vào thùng rác trên Cloudflare R2!`);
      } catch (err) {
        console.warn('Lỗi xóa trên Cloudflare:', err);
        setSyncStatus(`Đã xóa khỏi app (Đồng bộ Cloudflare thất bại: ${String(err)})`);
      }
    } else {
      setSyncStatus('Đã xóa bài hát khỏi danh sách phát');
    }
  };

  const handleApplySortMode = (mode: TrackSortMode) => {
    Vibration.vibrate(10);
    setSortMode(mode);
    const sorted = sortTracksByMode(tracks, mode);
    setTracks(sorted);
    if (playerState.activeTrackId) {
      const newIdx = sorted.findIndex((t) => t.id === playerState.activeTrackId);
      if (newIdx >= 0) setCurrentTrackIndex(newIdx);
    }
  };

  const handleSyncLibrary = async () => {
    const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
    const cleanToken = serverToken.trim();
    if (!cleanUrl) {
      Alert.alert('Chưa nhập Server URL', 'Vui lòng nhập địa chỉ Worker để đồng bộ');
      return;
    }

    FileSystem.writeAsStringAsync(
      CONFIG_FILE,
      JSON.stringify({ serverUrl: cleanUrl, serverToken: cleanToken })
    ).catch(() => {});

    setIsSyncing(true);
    setSyncStatus('Đang tải danh sách bài hát từ Cloudflare R2...');
    try {
      const client = new MusicApiClient({ baseUrl: cleanUrl, token: cleanToken });
      const lib = await client.fetchLibrary();
      // Tự động đan xen các ca sĩ ngay khi tải về (Smart Interleaving)
      const balanced = interleaveTracksByArtist(lib.tracks);
      setTracks(balanced);
      setOriginalTracks(balanced);
      setSortMode('smart');
      setIsSmartShuffle(false);
      setSyncStatus(`Đã đồng bộ thành công ${lib.tracks.length} bài hát từ Cloudflare!`);
      if (balanced.length > 0 && !playerState.isPlaying) {
        setCurrentTrackIndex(0);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncStatus(`Lỗi đồng bộ: ${msg}`);
      Alert.alert('Lỗi kết nối Cloudflare', msg);
    } finally {
      setIsSyncing(false);
    }
  };



  const currentTrack: Track | null = tracks[currentTrackIndex] ?? null;
  const totalDuration = playerState.durationSec || (currentTrack ? currentTrack.duration : 0);
  const progressPercent = totalDuration > 0
    ? Math.min(100, (playerState.positionSec / totalDuration) * 100)
    : 0;

  const gaplessMs = playerService.getGaplessDeltaMs();
  const buildSha = process.env.EXPO_PUBLIC_BUILD_SHA || 'dev-local';

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        {
          paddingLeft: Math.max(gutter, insets.left),
          paddingRight: Math.max(gutter, insets.right),
          paddingBottom: insets.bottom + spacing.xxl,
        },
      ]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets={true}
    >
      <View style={[styles.contentWrapper, { maxWidth: maxContentWidth }]}>
        {/* Thẻ hiển thị bài hát chính */}
        <View style={styles.card}>
          <View style={styles.badgeRow}>
            <View style={styles.badgeLeftGroup}>
              <Text style={styles.badge}>BEATIFY PLAYER</Text>
              {isSmartShuffle && (
                <View style={styles.shuffleActivePill}>
                  <ShuffleIcon size={11} color={colors.primary} />
                  <Text style={styles.shuffleActivePillText}>TRỘN BÀI</Text>
                </View>
              )}
            </View>
            <View style={styles.badgeRightGroup}>
              <TouchableOpacity
                style={styles.profileHeaderBtn}
                onPress={() => {
                  Vibration.vibrate(10);
                  setProfileModalVisible(true);
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Mở hồ sơ cá nhân và thành tích nghe nhạc"
              >
                <ProfileIcon size={14} color={colors.primary} />
                <Text style={styles.profileHeaderBtnText}>Hồ sơ</Text>
              </TouchableOpacity>
              {currentTrack ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity
                    style={[styles.subtleEditBtn, { marginRight: spacing.sm }]}
                    onPress={() => handleToggleFavorite(currentTrack.id)}
                    activeOpacity={0.6}
                    hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel={userState.favoriteIds.includes(currentTrack.id) ? "Bỏ thích bài hát này" : "Yêu thích bài hát này"}
                  >
                    <HeartIcon
                      size={14}
                      color={userState.favoriteIds.includes(currentTrack.id) ? colors.favorite : colors.textSubtle}
                      fill={userState.favoriteIds.includes(currentTrack.id) ? colors.favorite : 'none'}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.subtleEditBtn}
                    onPress={() => handleOpenEdit(currentTrack)}
                    activeOpacity={0.6}
                    hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel="Chỉnh sửa thông tin bài hát"
                  >
                    <EditIcon size={13} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ width: 24 }} />
              )}
            </View>
          </View>

          {/* Nhánh landscape 2 cột dưới đây tạm thời không chạy vì app đang khóa orientation: 'portrait' trong app.config.ts. Giữ nguyên theo kiến trúc responsive dự phòng. */}
          {isLandscape ? (
            <View style={styles.landscapePlayerBody}>
              {/* Cột trái: Khung ảnh bìa thích ứng */}
              <View style={[styles.artworkContainer, { width: artworkSize, height: artworkSize, marginBottom: 0 }]}>
                {currentTrack?.cover ? (
                  <Image
                    source={{ uri: currentTrack.cover }}
                    style={styles.artworkImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.artworkPlaceholder}>
                    <DiscIcon size={Math.min(64, Math.round(artworkSize * 0.35))} color={colors.borderLight} />
                    <Text style={[styles.artworkEmptyText, { marginTop: spacing.sm }]}>
                      {tracks.length === 0 ? 'Thư viện trống' : 'Không có ảnh bìa'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Cột phải: Thông tin bài hát & Bảng điều khiển */}
              <View style={styles.landscapeControlsCol}>
                <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
                  {currentTrack ? currentTrack.title : 'Chưa có bài hát'}
                </Text>
                <Text style={styles.artist} numberOfLines={1} ellipsizeMode="tail">
                  {currentTrack
                    ? `${currentTrack.artist} • ${currentTrack.album ?? 'Single'}`
                    : 'Đồng bộ từ Web quản lý hoặc nhập link bên dưới'}
                </Text>

                {/* Thanh tiến trình tua nhạc (Vùng chạm 44pt chuẩn Apple HIG) */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.progressBarTouchable}
                  onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
                  onPress={(e) => handleBarPress(e.nativeEvent.locationX)}
                >
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
                  </View>
                </TouchableOpacity>

                <View style={styles.timeRow}>
                  <Text style={styles.timeText}>{formatTime(playerState.positionSec)}</Text>
                  {playerState.isBuffering && <ActivityIndicator size="small" color={colors.primary} />}
                  <Text style={styles.timeText}>{formatTime(totalDuration)}</Text>
                </View>

                {/* Cụm điều khiển phát nhạc chính */}
                <View style={styles.controlsRow}>
                  <TouchableOpacity
                    style={styles.seekBtn}
                    disabled={tracks.length === 0}
                    onPress={() => handleSeekOffset(-5)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
                    accessibilityRole="button"
                    accessibilityLabel="Tua lùi 5 giây"
                  >
                    <SeekBackwardIcon size={22} color={colors.textPrimary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.skipBtn}
                    disabled={tracks.length === 0}
                    onPress={handlePrevious}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Phát bài trước đó"
                  >
                    <PrevIcon size={22} color={colors.textPrimary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.playCircleBtn, tracks.length === 0 && styles.playCircleBtnDisabled]}
                    disabled={tracks.length === 0 && !playerState.isPlaying}
                    onPress={handleTogglePlay}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={playerState.isPlaying ? "Tạm dừng phát nhạc" : "Bắt đầu phát nhạc"}
                  >
                    {playerState.isPlaying ? (
                      <PauseIcon size={26} color={colors.textDark} />
                    ) : (
                      <PlayIcon size={26} color={colors.textDark} />
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.skipBtn}
                    disabled={tracks.length === 0}
                    onPress={handleNext}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Phát bài tiếp theo"
                  >
                    <NextIcon size={22} color={colors.textPrimary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.seekBtn}
                    disabled={tracks.length === 0}
                    onPress={() => handleSeekOffset(5)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
                    accessibilityRole="button"
                    accessibilityLabel="Tua tới 5 giây"
                  >
                    <SeekForwardIcon size={22} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>

                {/* Hàng nút chế độ: Lặp lại & Trộn bài thông minh */}
                <View style={styles.modeButtonsRow}>
                  <TouchableOpacity
                    style={[styles.modeBottomBtn, repeatMode !== 'off' && styles.modeBottomBtnActive]}
                    onPress={handleCycleRepeat}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel={repeatMode === 'off' ? 'Chế độ lặp lại: Tắt' : repeatMode === 'track' ? 'Chế độ lặp lại: 1 bài' : 'Chế độ lặp lại: Toàn bộ danh sách'}
                  >
                    {repeatMode === 'track' ? (
                      <RepeatOneIcon size={16} color={colors.primary} />
                    ) : (
                      <RepeatIcon size={16} color={repeatMode !== 'off' ? colors.primary : colors.textTertiary} />
                    )}
                    <Text style={[styles.repeatBottomText, repeatMode !== 'off' && styles.repeatActiveColor]}>
                      {repeatMode === 'off' ? 'Repeat: Tắt' : repeatMode === 'track' ? 'Repeat: 1 bài' : 'Repeat: Tất cả'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modeBottomBtn, isSmartShuffle && styles.modeBottomBtnActive]}
                    onPress={handleToggleSmartShuffle}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel={isSmartShuffle ? "Tắt trộn bài thông minh" : "Bật trộn bài thông minh"}
                  >
                    <ShuffleIcon size={16} color={isSmartShuffle ? colors.primary : colors.textTertiary} />
                    <Text style={[styles.repeatBottomText, isSmartShuffle && styles.repeatActiveColor]}>
                      {isSmartShuffle ? 'Shuffle: BẬT' : 'Shuffle: Tắt'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Hàng nút tính năng: Lyrics & Playlist */}
                <View style={[styles.modeButtonsRow, { marginTop: spacing.sm }]}>
                  <TouchableOpacity
                    style={[styles.modeBottomBtn, lyricsModalVisible && styles.modeBottomBtnActive]}
                    disabled={!currentTrack}
                    onPress={() => setLyricsModalVisible(true)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel="Mở màn hình lời bài hát"
                  >
                    <LyricsIcon size={16} color={currentTrack ? colors.primary : colors.textTertiary} />
                    <Text style={[styles.repeatBottomText, currentTrack && styles.repeatActiveColor]}>
                      Lyrics
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modeBottomBtn, playlistModalVisible && styles.modeBottomBtnActive]}
                    onPress={() => setPlaylistModalVisible(true)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel="Quản lý danh sách phát"
                  >
                    <PlaylistIcon size={16} color={colors.primary} />
                    <Text style={[styles.repeatBottomText, styles.repeatActiveColor]}>
                      Playlist ({userState.playlists.length})
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : (
            /* Bố cục Portrait 1 cột truyền thống */
            <>
              {/* Khung ảnh bìa thích ứng với màn hình */}
              <View style={[styles.artworkContainer, { width: artworkSize, height: artworkSize }]}>
                {currentTrack?.cover ? (
                  <Image
                    source={{ uri: currentTrack.cover }}
                    style={styles.artworkImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.artworkPlaceholder}>
                    <DiscIcon size={Math.min(64, Math.round(artworkSize * 0.35))} color={colors.borderLight} />
                    <Text style={[styles.artworkEmptyText, { marginTop: spacing.sm }]}>
                      {tracks.length === 0 ? 'Thư viện trống' : 'Không có ảnh bìa'}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
                {currentTrack ? currentTrack.title : 'Chưa có bài hát'}
              </Text>
              <Text style={styles.artist} numberOfLines={1} ellipsizeMode="tail">
                {currentTrack
                  ? `${currentTrack.artist} • ${currentTrack.album ?? 'Single'}`
                  : 'Đồng bộ từ Web quản lý hoặc nhập link bên dưới'}
              </Text>

              {/* Thanh tiến trình tua nhạc (Vùng chạm 44pt chuẩn Apple HIG) */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.progressBarTouchable}
                onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
                onPress={(e) => handleBarPress(e.nativeEvent.locationX)}
              >
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
                </View>
              </TouchableOpacity>

              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatTime(playerState.positionSec)}</Text>
                {playerState.isBuffering && <ActivityIndicator size="small" color={colors.primary} />}
                <Text style={styles.timeText}>{formatTime(totalDuration)}</Text>
              </View>

              {/* Cụm điều khiển phát nhạc chính */}
              <View style={styles.controlsRow}>
                <TouchableOpacity
                  style={styles.seekBtn}
                  disabled={tracks.length === 0}
                  onPress={() => handleSeekOffset(-5)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
                  accessibilityRole="button"
                  accessibilityLabel="Tua lùi 5 giây"
                >
                  <SeekBackwardIcon size={22} color={colors.textPrimary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.skipBtn}
                  disabled={tracks.length === 0}
                  onPress={handlePrevious}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Phát bài trước đó"
                >
                  <PrevIcon size={22} color={colors.textPrimary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.playCircleBtn, tracks.length === 0 && styles.playCircleBtnDisabled]}
                  disabled={tracks.length === 0 && !playerState.isPlaying}
                  onPress={handleTogglePlay}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={playerState.isPlaying ? "Tạm dừng phát nhạc" : "Bắt đầu phát nhạc"}
                >
                  {playerState.isPlaying ? (
                    <PauseIcon size={26} color={colors.textDark} />
                  ) : (
                    <PlayIcon size={26} color={colors.textDark} />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.skipBtn}
                  disabled={tracks.length === 0}
                  onPress={handleNext}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Phát bài tiếp theo"
                >
                  <NextIcon size={22} color={colors.textPrimary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.seekBtn}
                  disabled={tracks.length === 0}
                  onPress={() => handleSeekOffset(5)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
                  accessibilityRole="button"
                  accessibilityLabel="Tua tới 5 giây"
                >
                  <SeekForwardIcon size={22} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>

              {/* Hàng nút chế độ: Lặp lại & Trộn bài thông minh */}
              <View style={styles.modeButtonsRow}>
                <TouchableOpacity
                  style={[styles.modeBottomBtn, repeatMode !== 'off' && styles.modeBottomBtnActive]}
                  onPress={handleCycleRepeat}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={repeatMode === 'off' ? 'Chế độ lặp lại: Tắt' : repeatMode === 'track' ? 'Chế độ lặp lại: 1 bài' : 'Chế độ lặp lại: Toàn bộ danh sách'}
                >
                  {repeatMode === 'track' ? (
                    <RepeatOneIcon size={16} color={colors.primary} />
                  ) : (
                    <RepeatIcon size={16} color={repeatMode !== 'off' ? colors.primary : colors.textTertiary} />
                  )}
                  <Text style={[styles.repeatBottomText, repeatMode !== 'off' && styles.repeatActiveColor]}>
                    {repeatMode === 'off' ? 'Repeat: Tắt' : repeatMode === 'track' ? 'Repeat: 1 bài' : 'Repeat: Tất cả'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modeBottomBtn, isSmartShuffle && styles.modeBottomBtnActive]}
                  onPress={handleToggleSmartShuffle}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={isSmartShuffle ? "Tắt trộn bài thông minh" : "Bật trộn bài thông minh"}
                >
                  <ShuffleIcon size={16} color={isSmartShuffle ? colors.primary : colors.textTertiary} />
                  <Text style={[styles.repeatBottomText, isSmartShuffle && styles.repeatActiveColor]}>
                    {isSmartShuffle ? 'Shuffle: BẬT' : 'Shuffle: Tắt'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Hàng nút tính năng: Lyrics & Playlist */}
              <View style={[styles.modeButtonsRow, { marginTop: spacing.sm }]}>
                <TouchableOpacity
                  style={[styles.modeBottomBtn, lyricsModalVisible && styles.modeBottomBtnActive]}
                  disabled={!currentTrack}
                  onPress={() => setLyricsModalVisible(true)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel="Mở màn hình lời bài hát"
                >
                  <LyricsIcon size={16} color={currentTrack ? colors.primary : colors.textTertiary} />
                  <Text style={[styles.repeatBottomText, currentTrack && styles.repeatActiveColor]}>
                    Lyrics
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modeBottomBtn, playlistModalVisible && styles.modeBottomBtnActive]}
                  onPress={() => setPlaylistModalVisible(true)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel="Quản lý danh sách phát"
                >
                  <PlaylistIcon size={16} color={colors.primary} />
                  <Text style={[styles.repeatBottomText, styles.repeatActiveColor]}>
                    Playlist ({userState.playlists.length})
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>


      {/* Khung kết nối & Đồng bộ Cloudflare R2 */}
      <View style={styles.syncCard}>
        <Text style={styles.syncCardTitle}>ĐỒNG BỘ TỨC THÌ VỚI CLOUDFLARE R2</Text>
        <Text style={styles.syncCardSubtitle}>
          Khi sửa hoặc xóa bài trên điện thoại, dữ liệu sẽ được cập nhật trực tiếp lên Cloudflare R2 và đồng bộ ngược về PC.
        </Text>
        <View style={styles.syncInputGroup}>
          <Text style={styles.syncInputLabel}>Địa chỉ Cloudflare Worker:</Text>
          <TextInput
            style={styles.inputField}
            placeholder="http://192.168.1.x:8787 hoặc domain Worker"
            placeholderTextColor={colors.textPlaceholder}
            value={serverUrl}
            onChangeText={setServerUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={[styles.syncInputGroup, { marginTop: spacing.sm }]}>
          <Text style={styles.syncInputLabel}>API Token (Bearer):</Text>
          <TextInput
            style={styles.inputField}
            placeholder="Token bí mật để xác thực"
            placeholderTextColor={colors.textPlaceholder}
            value={serverToken}
            onChangeText={setServerToken}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <TouchableOpacity
          style={[styles.syncBtn, isSyncing && styles.syncBtnDisabled]}
          disabled={isSyncing}
          onPress={handleSyncLibrary}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Tải toàn bộ thư viện bài hát từ Cloudflare"
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color={colors.textDark} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <RepeatIcon size={15} color={colors.textDark} />
              <Text style={[styles.syncBtnText, { marginLeft: spacing.sm }]}>Tải toàn bộ thư viện từ Cloudflare</Text>
            </View>
          )}
        </TouchableOpacity>
        {syncStatus ? (
          <View style={styles.syncStatusBox}>
            <Text style={styles.syncStatusText} numberOfLines={3} ellipsizeMode="tail">
              {syncStatus}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Khung nhập link nhạc thật (Không dùng mock data) */}
      <View style={styles.inputCard}>
        <Text style={styles.inputCardTitle}>PHÁT TRỰC TIẾP FILE NHẠC CỦA BẠN</Text>
        <Text style={styles.inputCardSubtitle}>
          Dán link file nhạc trực tiếp (URL MP3/AAC) để phát ngay lập tức trên iPhone:
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.inputField}
            placeholder="https://example.com/song.mp3"
            placeholderTextColor={colors.textPlaceholder}
            value={customUrl}
            onChangeText={setCustomUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.addBtn}
            onPress={handleAddCustomTrack}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Phát trực tiếp bài hát từ liên kết"
          >
            <Text style={styles.addBtnText}>Phát</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Danh sách hàng đợi nếu đã có bài hát */}
      {tracks.length > 0 && (
        <View style={styles.queueCard}>
          <View style={styles.queueHeaderRow}>
            <Text style={styles.queueHeader}>DANH SÁCH BÀI HÁT ({tracks.length})</Text>
            {isSmartShuffle && (
              <View style={styles.mysteryQueueTag}>
                <MysteryIcon size={12} color={colors.warning} />
                <Text style={styles.mysteryQueueTagText}>BÍ MẬT HÀNG ĐỢI</Text>
              </View>
            )}
          </View>

          {/* Thanh lựa chọn chế độ sắp xếp danh sách thông minh */}
          <View style={styles.sortFilterRow}>
            <TouchableOpacity
              style={[styles.sortFilterBtn, sortMode === 'smart' && styles.sortFilterBtnActive]}
              onPress={() => handleApplySortMode('smart')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
            >
              <Text style={[styles.sortFilterText, sortMode === 'smart' && styles.sortFilterTextActive]}>
                ✨ Đan xen ca sĩ
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sortFilterBtn, sortMode === 'artist' && styles.sortFilterBtnActive]}
              onPress={() => handleApplySortMode('artist')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
            >
              <Text style={[styles.sortFilterText, sortMode === 'artist' && styles.sortFilterTextActive]}>
                🎤 Theo ca sĩ
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sortFilterBtn, sortMode === 'title' && styles.sortFilterBtnActive]}
              onPress={() => handleApplySortMode('title')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
            >
              <Text style={[styles.sortFilterText, sortMode === 'title' && styles.sortFilterTextActive]}>
                🔤 Tên A-Z
              </Text>
            </TouchableOpacity>
          </View>

          {/* Banner giải thích tính năng bất ngờ của Smart Shuffle */}
          {isSmartShuffle && (
            <View style={styles.mysteryBannerBox}>
              <MysteryIcon size={20} color={colors.warning} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.mysteryBannerTitle}>Trộn bài thông minh đang bật</Text>
                <Text style={styles.mysteryBannerDesc}>
                  Thứ tự các bài tiếp theo được giữ bí mật để mang lại cảm giác tò mò và bất ngờ!
                </Text>
              </View>
            </View>
          )}

          {tracks.map((track, idx) => {
            const isActive = idx === currentTrackIndex;
            const isMysterious = isSmartShuffle && idx > currentTrackIndex;

            return (
              <View
                key={track.id}
                style={[
                  styles.queueItem,
                  isActive && styles.queueItemActive,
                  isMysterious && styles.queueItemMysterious,
                ]}
              >
                <View style={styles.queueIndexBox}>
                  {isMysterious ? (
                    <QuestionIcon size={13} color={colors.textTertiary} />
                  ) : (
                    <Text
                      style={[
                        styles.queueIndexText,
                        isActive && styles.queueIndexTextActive,
                      ]}
                    >
                      {idx + 1}
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.queueItemInfo}
                  onPress={() => handleSkipToTrack(idx)}
                  accessibilityRole="button"
                  accessibilityLabel={isMysterious ? `Bài hát bí ẩn số ${idx + 1}` : `Chuyển sang bài ${track.title} của ${track.artist}`}
                >
                  <Text
                    style={[
                      styles.queueItemTitle,
                      isActive && styles.queueItemTitleActive,
                      isMysterious && styles.queueItemTitleMysterious,
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {isMysterious ? 'Bài hát bí ẩn' : track.title}
                  </Text>
                  <Text
                    style={[
                      styles.queueItemArtist,
                      isMysterious && styles.queueItemArtistMysterious,
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {isMysterious
                      ? 'Sẽ được tiết lộ khi bài này phát'
                      : `${track.artist} ${track.album ? `• ${track.album}` : ''}`}
                  </Text>
                </TouchableOpacity>

                <View style={styles.queueActionsRow}>
                  {isActive && (
                    <View style={{ marginRight: spacing.xs }}>
                      {playerState.isPlaying ? (
                        <PlayIcon size={13} color={colors.primary} />
                      ) : (
                        <PauseIcon size={13} color={colors.primary} />
                      )}
                    </View>
                  )}
                  {isMysterious ? (
                    <View style={styles.mysteryBadgePill}>
                      <Text style={styles.mysteryBadgePillText}>Sắp đến</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TouchableOpacity
                        style={[styles.queueEditBtn, { marginRight: spacing.xs }]}
                        onPress={() => handleToggleFavorite(track.id)}
                        activeOpacity={0.6}
                        hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
                        accessibilityRole="button"
                        accessibilityLabel={userState.favoriteIds.includes(track.id) ? `Bỏ thích ${track.title}` : `Thích ${track.title}`}
                      >
                        <HeartIcon
                          size={13}
                          color={userState.favoriteIds.includes(track.id) ? colors.favorite : colors.textTertiary}
                          fill={userState.favoriteIds.includes(track.id) ? colors.favorite : 'none'}
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.queueEditBtn}
                        onPress={() => handleOpenEdit(track)}
                        activeOpacity={0.6}
                        hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Sửa thông tin ${track.title}`}
                      >
                        <EditIcon size={13} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Bảng thông tin Debug */}
      <View style={styles.debugCard}>
        <Text style={styles.debugHeader}>THÔNG TIN HỆ THỐNG & CHỨNG CHỈ</Text>

        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Build SHA:</Text>
          <Text style={styles.debugVal} numberOfLines={1} ellipsizeMode="middle">
            {buildSha}
          </Text>
        </View>

        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Hạn chứng chỉ:</Text>
          <Text style={styles.debugVal} numberOfLines={1} ellipsizeMode="tail">
            {expirationDate}
          </Text>
        </View>

        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Gapless In-App Δt:</Text>
          <Text style={styles.debugVal}>
            {gaplessMs !== null ? `${gaplessMs} ms` : 'Chưa đo'}
          </Text>
        </View>

        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Atomic Write Branch:</Text>
          <Text style={styles.debugVal}>{atomicWriteBranch}</Text>
        </View>

        {lastMoveError && (
          <View style={styles.debugRow}>
            <Text style={styles.debugLabel}>Lỗi move trực tiếp:</Text>
            <Text style={[styles.debugVal, styles.debugValError]}>{lastMoveError}</Text>
          </View>
        )}

        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Khôi phục .tmp:</Text>
          <Text style={styles.debugVal}>{recoveryStatus}</Text>
        </View>

        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Hàng đợi ghi đĩa:</Text>
          <Text style={styles.debugVal}>{writeQueueStatus}</Text>
        </View>
      </View>

      {/* Modal Chỉnh sửa bài hát trên Mobile */}
      <EditTrackModal
        visible={editModalVisible}
        track={editingTrack}
        onClose={() => setEditModalVisible(false)}
        onSave={handleSaveTrack}
        onDelete={handleDeleteTrack}
        onFetchLyrics={handleFetchLyrics}
      />

      {/* Modal Lời bài hát đồng bộ LRC */}
      <LyricsModal
        visible={lyricsModalVisible}
        track={currentTrack}
        currentTimeSec={playerState.positionSec}
        onClose={() => setLyricsModalVisible(false)}
        onSeek={(seconds) => {
          playerService.seekTo(seconds);
        }}
        onOpenEditLyrics={(track) => {
          setLyricsModalVisible(false);
          handleOpenEdit(track);
        }}
        onFetchLyrics={handleFetchLyrics}
      />

      {/* Modal Danh sách phát & Yêu thích */}
      <PlaylistModal
        visible={playlistModalVisible}
        onClose={() => setPlaylistModalVisible(false)}
        userState={userState}
        onUpdateUserState={handleUpdateUserState}
        libraryTracks={tracks}
        onPlayTrack={(track) => {
          const idx = tracks.findIndex((t) => t.id === track.id);
          if (idx >= 0) {
            handleSkipToTrack(idx);
          }
        }}
        currentTrackId={currentTrack?.id}
        isPlaying={playerState.isPlaying}
      />

      {/* Modal Hồ sơ cá nhân & Thống kê Beatify Replay */}
      <ProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        totalLibraryTracksCount={tracks.length}
      />
        </View>
      </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flexGrow: 1,
    paddingTop: spacing.lg,
  },
  contentWrapper: {
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  landscapePlayerBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: spacing.xl,
    marginTop: spacing.sm,
  },
  landscapeArtworkCol: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  landscapeControlsCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  badge: {
    color: colors.primary,
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.bold,
    letterSpacing: 1.5,
  },
  repeatBadge: {
    backgroundColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.xs,
  },
  repeatBadgeText: {
    color: colors.textMedium,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
  },
  artworkContainer: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.xl,
    shadowColor: colors.textDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  artworkImage: {
    width: '100%',
    height: '100%',
  },
  artworkPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceDarker,
  },
  artworkEmptyText: {
    color: colors.textDisabled,
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.medium,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.titleLarge,
    fontWeight: fontWeights.bold,
    lineHeight: lineHeights.titleLarge,
    textAlign: 'center',
    marginBottom: spacing.xs,
    width: '100%',
  },
  artist: {
    color: colors.textMutedAlt,
    fontSize: fontSizes.subhead,
    lineHeight: lineHeights.subhead,
    textAlign: 'center',
    marginBottom: spacing.lg,
    width: '100%',
  },
  progressBarTouchable: {
    width: '100%',
    height: layout.minTouchTarget,
    marginVertical: -12,
    justifyContent: 'center',
  },
  progressBarBg: {
    height: 4,
    backgroundColor: colors.borderLight,
    borderRadius: radius.xs,
    overflow: 'hidden',
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  timeText: {
    color: colors.textSubtle,
    fontSize: fontSizes.captionLarge,
    fontVariant: ['tabular-nums'],
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  seekBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceControl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderNeutral,
  },
  seekArrow: {
    color: colors.primary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
  },
  seekNumber: {
    color: colors.textSecondary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
    marginHorizontal: 1,
  },
  skipBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  skipIcon: {
    fontSize: fontSizes.subheading,
    color: colors.textPrimary,
  },
  playCircleBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  playCircleBtnDisabled: {
    backgroundColor: colors.border,
    opacity: 0.5,
    shadowOpacity: 0,
  },
  playCircleIcon: {
    fontSize: fontSizes.titleLarge,
    color: colors.textDark,
    fontWeight: fontWeights.bold,
  },
  repeatBottomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceControl,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderNeutral,
  },
  repeatBottomIcon: {
    fontSize: fontSizes.subhead,
    color: colors.textTertiary,
  },
  repeatBottomText: {
    fontSize: fontSizes.caption,
    color: colors.textTertiary,
    fontWeight: fontWeights.semibold,
  },
  repeatActiveColor: {
    color: colors.primary,
  },
  inputCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  inputCardTitle: {
    color: colors.primary,
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.bold,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  inputCardSubtitle: {
    color: colors.textSubtle,
    fontSize: fontSizes.captionLarge,
    lineHeight: lineHeights.captionLarge,
    marginBottom: spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  inputField: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: fontSizes.subhead,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  addBtn: {
    minHeight: layout.minTouchTarget,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  addBtnText: {
    color: colors.textDark,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.subhead,
  },
  queueCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  queueHeader: {
    color: colors.textSubtle,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  sortFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    padding: spacing.xxs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortFilterBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortFilterBtnActive: {
    backgroundColor: colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  sortFilterText: {
    color: colors.textSubtle,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
  },
  sortFilterTextActive: {
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },

  queueItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
    backgroundColor: colors.surfaceSubtle,
  },
  queueItemActive: {
    backgroundColor: colors.surfaceActive,
    borderColor: colors.primary,
    borderWidth: 1,
  },
  queueItemInfo: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: spacing.sm,
  },
  queueItemTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.body,
  },
  queueItemTitleActive: {
    color: colors.primary,
  },
  queueItemArtist: {
    color: colors.textSubtle,
    fontSize: fontSizes.captionLarge,
    marginTop: spacing.xxs,
    lineHeight: lineHeights.captionLarge,
  },
  queueActiveBadge: {
    color: colors.primary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
    marginLeft: spacing.sm,
  },
  debugCard: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.xxxl,
  },
  debugHeader: {
    color: colors.textPrimary,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.bold,
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  debugRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  debugLabel: {
    flexShrink: 0,
    color: colors.textSubtle,
    fontSize: fontSizes.subhead,
    lineHeight: lineHeights.subhead,
  },
  debugVal: {
    flex: 1,
    textAlign: 'right',
    color: colors.textPrimary,
    fontSize: fontSizes.subhead,
    lineHeight: lineHeights.subhead,
    fontWeight: fontWeights.medium,
  },
  debugValError: {
    color: colors.dangerSoft,
  },
  subtleEditBtn: {
    padding: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceControl,
    opacity: 0.45,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subtleEditIcon: {
    color: colors.textMuted,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.bold,
  },
  syncCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  syncCardTitle: {
    color: colors.primary,
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.bold,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  syncCardSubtitle: {
    color: colors.textSubtle,
    fontSize: fontSizes.captionLarge,
    lineHeight: lineHeights.captionLarge,
    marginBottom: spacing.md,
  },
  syncInputGroup: {
    marginBottom: spacing.xs,
  },
  syncInputLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
    marginBottom: spacing.xs,
  },
  syncBtn: {
    minHeight: layout.minTouchTarget,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  syncBtnDisabled: {
    opacity: 0.6,
  },
  syncBtnText: {
    color: colors.textDark,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.subhead,
  },
  syncStatusBox: {
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.sm,
    borderRadius: radius.xs,
    marginTop: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  syncStatusText: {
    color: colors.textMuted,
    fontSize: fontSizes.captionLarge,
    lineHeight: lineHeights.captionLarge,
  },
  queueActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  queueEditBtn: {
    minHeight: 28,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueEditBtnText: {
    color: colors.textSecondary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
  },
  queueIndexBox: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  queueIndexText: {
    color: colors.textTertiary,
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.semibold,
  },
  queueIndexTextActive: {
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
  badgeLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  badgeRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  profileHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  profileHeaderBtnText: {
    color: colors.textPrimary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
  },
  shuffleActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
  },
  shuffleActivePillText: {
    color: colors.primary,
    fontSize: fontSizes.micro,
    fontWeight: fontWeights.extrabold,
    letterSpacing: 0.5,
  },
  modeButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    width: '100%',
    justifyContent: 'center',
  },
  modeBottomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfacePressed,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderDivider,
  },
  modeBottomBtnActive: {
    backgroundColor: colors.surfaceHighlight,
    borderColor: colors.primary,
  },
  queueHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  mysteryQueueTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warningMuted,
    borderWidth: 1,
    borderColor: colors.warning,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
  },
  mysteryQueueTagText: {
    color: colors.warning,
    fontSize: fontSizes.micro,
    fontWeight: fontWeights.bold,
  },
  mysteryBannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.mysteryBanner,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  mysteryBannerTitle: {
    color: colors.warning,
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.bold,
  },
  mysteryBannerDesc: {
    color: colors.textSubtle,
    fontSize: fontSizes.caption,
    marginTop: spacing.xxs,
    lineHeight: lineHeights.caption,
  },
  queueItemMysterious: {
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.mysteryBackground,
  },
  queueIndexTextMysterious: {
    color: colors.warning,
    fontSize: fontSizes.subhead,
  },
  queueItemTitleMysterious: {
    color: colors.textSecondaryAlt,
    fontStyle: 'italic',
    letterSpacing: 0.2,
  },
  queueItemArtistMysterious: {
    color: colors.textDisabled,
    fontSize: fontSizes.caption,
    fontStyle: 'italic',
  },
  mysteryBadgePill: {
    backgroundColor: colors.mysteryBadgeBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  mysteryBadgePillText: {
    color: colors.textSubtle,
    fontSize: fontSizes.micro,
    fontWeight: fontWeights.semibold,
  },
});

