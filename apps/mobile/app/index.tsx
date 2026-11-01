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
import { type Track, type UpdateTrack, smartShuffle } from '@music-app/shared';
import { playerService } from '../src/services/player/rntpPlayerService';
import type { PlayerState, RepeatMode } from '../src/services/player/types';
import { parseMobileprovisionExpiration } from '../src/utils/mobileprovision';
import { EditTrackModal } from '../src/components/EditTrackModal';
import { ProfileModal } from '../src/components/ProfileModal';
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

  // State cho Profile & Thống kê
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [atomicWriteBranch, setAtomicWriteBranch] = useState<string>('Chưa ghi');
  const [lastMoveError, setLastMoveError] = useState<string | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<string>('Không có khôi phục');
  const [writeQueueStatus, setWriteQueueStatus] = useState<string>('Đã ghi xong (hàng đợi rỗng)');
  const lastRecordedTrackRef = useRef<string | null>(null);

  // State cho Edit / Delete Modal & Đồng bộ Cloudflare
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [serverUrl, setServerUrl] = useState<string>(
    process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8787'
  );
  const [serverToken, setServerToken] = useState<string>(
    process.env.EXPO_PUBLIC_API_TOKEN || ''
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);


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

  // Tự động ghi nhận lượt nghe cho Profile & Replay khi nghe >= 15 giây
  useEffect(() => {
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

  const handleSyncLibrary = async () => {
    const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
    const cleanToken = serverToken.trim();
    if (!cleanUrl) {
      Alert.alert('Chưa nhập Server URL', 'Vui lòng nhập địa chỉ Worker để đồng bộ');
      return;
    }

    setIsSyncing(true);
    setSyncStatus('Đang tải danh sách bài hát từ Cloudflare R2...');
    try {
      const client = new MusicApiClient({ baseUrl: cleanUrl, token: cleanToken });
      const lib = await client.fetchLibrary();
      setTracks(lib.tracks);
      setOriginalTracks(lib.tracks);
      setIsSmartShuffle(false);
      setSyncStatus(`Đã đồng bộ thành công ${lib.tracks.length} bài hát từ Cloudflare!`);
      if (lib.tracks.length > 0 && !playerState.isPlaying) {
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
    <ScrollView contentContainerStyle={styles.container}>
      {/* Thẻ hiển thị bài hát chính */}
      <View style={styles.card}>
        <View style={styles.badgeRow}>
          <View style={styles.badgeLeftGroup}>
            <Text style={styles.badge}>BEATIFY PLAYER</Text>
            {isSmartShuffle && (
              <View style={styles.shuffleActivePill}>
                <ShuffleIcon size={11} color="#1DB954" />
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
            >
              <ProfileIcon size={14} color="#1DB954" />
              <Text style={styles.profileHeaderBtnText}>Hồ sơ</Text>
            </TouchableOpacity>
            {currentTrack ? (
              <TouchableOpacity
                style={styles.subtleEditBtn}
                onPress={() => handleOpenEdit(currentTrack)}
                activeOpacity={0.6}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <EditIcon size={13} color="#888888" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 24 }} />
            )}
          </View>
        </View>

        {/* Khung ảnh bìa hoặc Icon khi thư viện trống */}
        <View style={styles.artworkContainer}>
          {currentTrack?.cover ? (
            <Image
              source={{ uri: currentTrack.cover }}
              style={styles.artworkImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.artworkPlaceholder}>
              <DiscIcon size={64} color="#333333" />
              <Text style={[styles.artworkEmptyText, { marginTop: 10 }]}>
                {tracks.length === 0 ? 'Thư viện trống' : 'Không có ảnh bìa'}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.title} numberOfLines={1}>
          {currentTrack ? currentTrack.title : 'Chưa có bài hát'}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {currentTrack
            ? `${currentTrack.artist} • ${currentTrack.album ?? 'Single'}`
            : 'Đồng bộ từ Web quản lý hoặc nhập link bên dưới'}
        </Text>

        {/* Thanh tiến trình tua nhạc (Interactive Seek Bar) */}
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
          {playerState.isBuffering && <ActivityIndicator size="small" color="#1DB954" />}
          <Text style={styles.timeText}>{formatTime(totalDuration)}</Text>
        </View>

        {/* Cụm điều khiển phát nhạc chính (Dùng biểu tượng vector SVG) */}
        <View style={styles.controlsRow}>
          {/* Tua lùi 5s */}
          <TouchableOpacity
            style={styles.seekBtn}
            disabled={tracks.length === 0}
            onPress={() => handleSeekOffset(-5)}
            activeOpacity={0.7}
          >
            <SeekBackwardIcon size={22} color="#ffffff" />
          </TouchableOpacity>

          {/* Bài trước (Prev) */}
          <TouchableOpacity
            style={styles.skipBtn}
            disabled={tracks.length === 0}
            onPress={handlePrevious}
            activeOpacity={0.7}
          >
            <PrevIcon size={22} color="#ffffff" />
          </TouchableOpacity>

          {/* Phát / Dừng (Play / Pause tròn lớn) */}
          <TouchableOpacity
            style={[styles.playCircleBtn, tracks.length === 0 && styles.playCircleBtnDisabled]}
            disabled={tracks.length === 0 && !playerState.isPlaying}
            onPress={handleTogglePlay}
            activeOpacity={0.8}
          >
            {playerState.isPlaying ? (
              <PauseIcon size={26} color="#000000" />
            ) : (
              <PlayIcon size={26} color="#000000" />
            )}
          </TouchableOpacity>

          {/* Bài tiếp (Next) */}
          <TouchableOpacity
            style={styles.skipBtn}
            disabled={tracks.length === 0}
            onPress={handleNext}
            activeOpacity={0.7}
          >
            <NextIcon size={22} color="#ffffff" />
          </TouchableOpacity>

          {/* Tua tới 5s */}
          <TouchableOpacity
            style={styles.seekBtn}
            disabled={tracks.length === 0}
            onPress={() => handleSeekOffset(5)}
            activeOpacity={0.7}
          >
            <SeekForwardIcon size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Hàng nút chế độ: Lặp lại & Trộn bài thông minh */}
        <View style={styles.modeButtonsRow}>
          <TouchableOpacity
            style={[styles.modeBottomBtn, repeatMode !== 'off' && styles.modeBottomBtnActive]}
            onPress={handleCycleRepeat}
            activeOpacity={0.7}
          >
            {repeatMode === 'track' ? (
              <RepeatOneIcon size={16} color="#1DB954" />
            ) : (
              <RepeatIcon size={16} color={repeatMode !== 'off' ? '#1DB954' : '#71717a'} />
            )}
            <Text style={[styles.repeatBottomText, repeatMode !== 'off' && styles.repeatActiveColor]}>
              {repeatMode === 'off' ? 'Không lặp' : repeatMode === 'track' ? 'Lặp 1 bài' : 'Lặp danh sách'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeBottomBtn, isSmartShuffle && styles.modeBottomBtnActive]}
            onPress={handleToggleSmartShuffle}
            activeOpacity={0.7}
          >
            <ShuffleIcon size={16} color={isSmartShuffle ? '#1DB954' : '#71717a'} />
            <Text style={[styles.repeatBottomText, isSmartShuffle && styles.repeatActiveColor]}>
              {isSmartShuffle ? 'Trộn: BẬT' : 'Trộn: Tắt'}
            </Text>
          </TouchableOpacity>
        </View>
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
            placeholderTextColor="#666666"
            value={serverUrl}
            onChangeText={setServerUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={[styles.syncInputGroup, { marginTop: 8 }]}>
          <Text style={styles.syncInputLabel}>API Token (Bearer):</Text>
          <TextInput
            style={styles.inputField}
            placeholder="Token bí mật để xác thực"
            placeholderTextColor="#666666"
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
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <RepeatIcon size={15} color="#000000" />
              <Text style={[styles.syncBtnText, { marginLeft: 6 }]}>Tải toàn bộ thư viện từ Cloudflare</Text>
            </View>
          )}
        </TouchableOpacity>
        {syncStatus && (
          <View style={styles.syncStatusBox}>
            <Text style={styles.syncStatusText}>{syncStatus}</Text>
          </View>
        )}
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
            placeholderTextColor="#666666"
            value={customUrl}
            onChangeText={setCustomUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.addBtn} onPress={handleAddCustomTrack}>
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
                <MysteryIcon size={12} color="#1DB954" />
                <Text style={styles.mysteryQueueTagText}>BÍ MẬT HÀNG ĐỢI</Text>
              </View>
            )}
          </View>

          {/* Banner giải thích tính năng bất ngờ của Smart Shuffle */}
          {isSmartShuffle && (
            <View style={styles.mysteryBannerBox}>
              <MysteryIcon size={20} color="#1DB954" />
              <View style={{ flex: 1, marginLeft: 10 }}>
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
                    <QuestionIcon size={13} color="#71717a" />
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
                >
                  <Text
                    style={[
                      styles.queueItemTitle,
                      isActive && styles.queueItemTitleActive,
                      isMysterious && styles.queueItemTitleMysterious,
                    ]}
                  >
                    {isMysterious ? 'Bài hát bí ẩn' : track.title}
                  </Text>
                  <Text
                    style={[
                      styles.queueItemArtist,
                      isMysterious && styles.queueItemArtistMysterious,
                    ]}
                  >
                    {isMysterious
                      ? 'Sẽ được tiết lộ khi bài này phát'
                      : `${track.artist} ${track.album ? `• ${track.album}` : ''}`}
                  </Text>
                </TouchableOpacity>

                <View style={styles.queueActionsRow}>
                  {isActive && (
                    <View style={{ marginRight: 6 }}>
                      {playerState.isPlaying ? (
                        <PlayIcon size={13} color="#1DB954" />
                      ) : (
                        <PauseIcon size={13} color="#1DB954" />
                      )}
                    </View>
                  )}
                  {isMysterious ? (
                    <View style={styles.mysteryBadgePill}>
                      <Text style={styles.mysteryBadgePillText}>Sắp đến</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.queueEditBtn}
                      onPress={() => handleOpenEdit(track)}
                    >
                      <EditIcon size={13} color="#a1a1aa" />
                    </TouchableOpacity>
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
          <Text style={styles.debugVal}>{buildSha}</Text>
        </View>

        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Hạn chứng chỉ:</Text>
          <Text style={styles.debugVal}>{expirationDate}</Text>
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
            <Text style={[styles.debugVal, { color: '#ff6b6b' }]}>{lastMoveError}</Text>
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
      />

      {/* Modal Hồ sơ cá nhân & Thống kê Beatify Replay */}
      <ProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        totalLibraryTracksCount={tracks.length}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingTop: 48,
    backgroundColor: '#0a0a0a',
    flexGrow: 1,
  },
  card: {
    backgroundColor: '#181818',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#282828',
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  badge: {
    color: '#1DB954',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  repeatBadge: {
    backgroundColor: '#282828',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  repeatBadgeText: {
    color: '#b3b3b3',
    fontSize: 11,
    fontWeight: '600',
  },
  artworkContainer: {
    width: 220,
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1f1f1f',
    marginBottom: 20,
    shadowColor: '#000',
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
    backgroundColor: '#161616',
  },
  artworkPlaceholderText: {
    fontSize: 48,
    marginBottom: 8,
  },
  artworkEmptyText: {
    color: '#666666',
    fontSize: 12,
    fontWeight: '500',
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  artist: {
    color: '#a0a0a0',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  progressBarTouchable: {
    width: '100%',
    paddingVertical: 8,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#333333',
    borderRadius: 2,
    overflow: 'hidden',
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#1DB954',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
    alignItems: 'center',
  },
  timeText: {
    color: '#888888',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 4,
  },
  seekBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1c1c1c',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#262626',
  },
  seekArrow: {
    color: '#1DB954',
    fontSize: 14,
    fontWeight: 'bold',
  },
  seekNumber: {
    color: '#d4d4d8',
    fontSize: 10.5,
    fontWeight: '700',
    marginHorizontal: 1,
  },
  skipBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1f1f1f',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  skipIcon: {
    fontSize: 16,
    color: '#ffffff',
  },
  playCircleBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1DB954',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  playCircleBtnDisabled: {
    backgroundColor: '#282828',
    opacity: 0.5,
    shadowOpacity: 0,
  },
  playCircleIcon: {
    fontSize: 20,
    color: '#000000',
    fontWeight: 'bold',
  },
  repeatBottomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#1c1c1c',
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#262626',
  },
  repeatBottomIcon: {
    fontSize: 13,
    color: '#71717a',
  },
  repeatBottomText: {
    fontSize: 11,
    color: '#71717a',
    fontWeight: '600',
  },
  repeatActiveColor: {
    color: '#1DB954',
  },
  inputCard: {
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#222222',
  },
  inputCardTitle: {
    color: '#1DB954',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 4,
  },
  inputCardSubtitle: {
    color: '#888888',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inputField: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#ffffff',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#333333',
  },
  addBtn: {
    backgroundColor: '#1DB954',
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  addBtnText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 13,
  },
  queueCard: {
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#222222',
  },
  queueHeader: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
  },
  queueItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: '#1a1a1a',
  },
  queueItemActive: {
    backgroundColor: '#242424',
    borderColor: '#1DB954',
    borderWidth: 1,
  },
  queueItemInfo: {
    flex: 1,
  },
  queueItemTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  queueItemTitleActive: {
    color: '#1DB954',
  },
  queueItemArtist: {
    color: '#888888',
    fontSize: 12,
    marginTop: 2,
  },
  queueActiveBadge: {
    color: '#1DB954',
    fontSize: 11,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  debugCard: {
    backgroundColor: '#121212',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222222',
    marginBottom: 32,
  },
  debugHeader: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
  },
  debugRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c1c',
  },
  debugLabel: {
    color: '#888888',
    fontSize: 13,
  },
  debugVal: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
  subtleEditBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#1c1c1c',
    opacity: 0.45,
    borderWidth: 1,
    borderColor: '#282828',
  },
  subtleEditIcon: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: 'bold',
  },
  syncCard: {
    backgroundColor: '#121212',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#242424',
  },
  syncCardTitle: {
    color: '#1DB954',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 4,
  },
  syncCardSubtitle: {
    color: '#888888',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },
  syncInputGroup: {
    marginBottom: 4,
  },
  syncInputLabel: {
    color: '#a1a1aa',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  syncBtn: {
    backgroundColor: '#1DB954',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  syncBtnDisabled: {
    opacity: 0.6,
  },
  syncBtnText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 13,
  },
  syncStatusBox: {
    backgroundColor: '#181818',
    padding: 8,
    borderRadius: 6,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#1DB954',
  },
  syncStatusText: {
    color: '#a1a1aa',
    fontSize: 12,
  },
  queueActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  queueEditBtn: {
    backgroundColor: '#27272a',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3f3f46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueEditBtnText: {
    color: '#d4d4d8',
    fontSize: 11,
    fontWeight: '600',
  },
  queueIndexBox: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  queueIndexText: {
    color: '#71717a',
    fontSize: 12,
    fontWeight: '600',
  },
  queueIndexTextActive: {
    color: '#1DB954',
    fontWeight: 'bold',
  },
  badgeLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  profileHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#222222',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333333',
  },
  profileHeaderBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  shuffleActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    borderWidth: 1,
    borderColor: '#1DB954',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  shuffleActivePillText: {
    color: '#1DB954',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modeButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    width: '100%',
    justifyContent: 'center',
  },
  modeBottomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#202020',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2e2e2e',
  },
  modeBottomBtnActive: {
    backgroundColor: '#262626',
    borderColor: '#1DB954',
  },
  queueHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  mysteryQueueTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(234, 179, 8, 0.12)',
    borderWidth: 1,
    borderColor: '#eab308',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  mysteryQueueTagText: {
    color: '#eab308',
    fontSize: 9.5,
    fontWeight: 'bold',
  },
  mysteryBannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1b1b1f',
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.3)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    gap: 10,
  },
  mysteryBannerIcon: {
    fontSize: 22,
  },
  mysteryBannerTitle: {
    color: '#eab308',
    fontSize: 12,
    fontWeight: '700',
  },
  mysteryBannerDesc: {
    color: '#888888',
    fontSize: 10.5,
    marginTop: 2,
    lineHeight: 14,
  },
  queueItemMysterious: {
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#333333',
    backgroundColor: '#161618',
  },
  queueIndexTextMysterious: {
    color: '#eab308',
    fontSize: 13,
  },
  queueItemTitleMysterious: {
    color: '#cccccc',
    fontStyle: 'italic',
    letterSpacing: 0.2,
  },
  queueItemArtistMysterious: {
    color: '#666666',
    fontSize: 11,
    fontStyle: 'italic',
  },
  mysteryBadgePill: {
    backgroundColor: '#242426',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  mysteryBadgePillText: {
    color: '#888888',
    fontSize: 10,
    fontWeight: '600',
  },
});

