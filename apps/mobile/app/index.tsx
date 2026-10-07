import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  TextInput,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { Track } from '@music-app/shared';
import { playerService } from '../src/services/player/rntpPlayerService';
import type { PlayerState, RepeatMode } from '../src/services/player/types';
import { parseMobileprovisionExpiration } from '../src/utils/mobileprovision';

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function SpikePlayerScreen() {
  const [tracks, setTracks] = useState<Track[]>([]);
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
  const [barWidth, setBarWidth] = useState<number>(0);

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

  const handlePlayQueue = async (trackList = tracks, startIndex = currentTrackIndex) => {
    if (trackList.length === 0) return;
    await playerService.playQueue(trackList, startIndex);
  };

  const handleTogglePlay = async () => {
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
    setCustomUrl('');
    await handlePlayQueue(newTrackList, newTrackList.length - 1);
  };

  const handleNext = async () => {
    if (tracks.length > 0) {
      await playerService.next();
    }
  };

  const handlePrevious = async () => {
    if (tracks.length > 0) {
      await playerService.previous();
    }
  };

  const handleSkipToTrack = async (index: number) => {
    if (!playerState.activeTrackId) {
      await handlePlayQueue(tracks, index);
    } else {
      await playerService.skipToIndex(index);
    }
  };

  const handleSeekOffset = async (secondsOffset: number) => {
    const target = Math.max(0, playerState.positionSec + secondsOffset);
    await playerService.seekTo(target);
  };

  const handleBarPress = async (locationX: number) => {
    if (barWidth <= 0 || tracks.length === 0) return;
    const currentTrack = tracks[currentTrackIndex];
    const totalDuration = playerState.durationSec || (currentTrack ? currentTrack.duration : 0);
    if (totalDuration <= 0) return;
    const ratio = Math.max(0, Math.min(1, locationX / barWidth));
    const target = ratio * totalDuration;
    await playerService.seekTo(target);
  };

  const handleCycleRepeat = async () => {
    const nextMode: RepeatMode =
      repeatMode === 'off' ? 'track' : repeatMode === 'track' ? 'queue' : 'off';
    setRepeatMode(nextMode);
    await playerService.setRepeatMode(nextMode);
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
          <Text style={styles.badge}>BEATIFY PLAYER</Text>
          <TouchableOpacity style={styles.repeatBadge} onPress={handleCycleRepeat}>
            <Text style={styles.repeatBadgeText}>
              Repeat: {repeatMode.toUpperCase()}
            </Text>
          </TouchableOpacity>
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
              <Text style={styles.artworkPlaceholderText}>🎵</Text>
              <Text style={styles.artworkEmptyText}>
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

        {/* Cụm điều khiển phát nhạc */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            disabled={tracks.length === 0}
            onPress={() => handleSeekOffset(-5)}
          >
            <Text style={styles.btnText}>-5s</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            disabled={tracks.length === 0}
            onPress={handlePrevious}
          >
            <Text style={styles.btnText}>Prev</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.playBtn, tracks.length === 0 && styles.playBtnDisabled]}
            disabled={tracks.length === 0 && !playerState.isPlaying}
            onPress={handleTogglePlay}
          >
            <Text style={styles.playBtnText}>{playerState.isPlaying ? 'PAUSE' : 'PLAY'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            disabled={tracks.length === 0}
            onPress={handleNext}
          >
            <Text style={styles.btnText}>Next</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            disabled={tracks.length === 0}
            onPress={() => handleSeekOffset(5)}
          >
            <Text style={styles.btnText}>+5s</Text>
          </TouchableOpacity>
        </View>
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
          <Text style={styles.queueHeader}>DANH SÁCH BÀI HÁT ({tracks.length})</Text>
          {tracks.map((track, idx) => {
            const isActive = idx === currentTrackIndex;
            return (
              <TouchableOpacity
                key={track.id}
                style={[styles.queueItem, isActive && styles.queueItemActive]}
                onPress={() => handleSkipToTrack(idx)}
              >
                <View style={styles.queueItemInfo}>
                  <Text style={[styles.queueItemTitle, isActive && styles.queueItemTitleActive]}>
                    {idx + 1}. {track.title}
                  </Text>
                  <Text style={styles.queueItemArtist}>{track.artist}</Text>
                </View>
                {isActive && (
                  <Text style={styles.queueActiveBadge}>
                    {playerState.isPlaying ? '▶ ĐANG PHÁT' : '⏸ ĐÃ CHỌN'}
                  </Text>
                )}
              </TouchableOpacity>
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
      </View>
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
    gap: 10,
  },
  playBtn: {
    backgroundColor: '#1DB954',
    paddingVertical: 14,
    paddingHorizontal: 26,
    borderRadius: 30,
  },
  playBtnDisabled: {
    backgroundColor: '#282828',
    opacity: 0.5,
  },
  playBtnText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 14,
  },
  secondaryBtn: {
    backgroundColor: '#282828',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  btnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
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
});
