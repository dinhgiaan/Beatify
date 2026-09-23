import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { Track } from '@music-app/shared';
import { playerService } from '../src/services/player/rntpPlayerService';
import type { PlayerState } from '../src/services/player/types';
import { parseMobileprovisionExpiration } from '../src/utils/mobileprovision';

// Danh sách track mẫu chuẩn theo TrackSchema của @music-app/shared
const SAMPLE_TRACKS: Track[] = [
  {
    id: 'sample-track-1',
    file: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    storage: 'r2',
    title: 'SoundHelix Song 1',
    artist: 'T. Schürger',
    album: 'SoundHelix Demo Album',
    duration: 372,
    loudnessLufs: -14.0,
    replayGain: -1.2,
  },
  {
    id: 'sample-track-2',
    file: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    storage: 'r2',
    title: 'SoundHelix Song 2',
    artist: 'T. Schürger',
    album: 'SoundHelix Demo Album',
    duration: 423,
    loudnessLufs: -13.5,
    replayGain: -1.8,
  },
];

export default function SpikePlayerScreen() {
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

  useEffect(() => {
    // 1. Khởi tạo player và đăng ký theo dõi trạng thái
    playerService.setup().catch((err) => {
      console.warn('Lỗi setup player:', err);
    });

    const unsubscribe = playerService.subscribe((state) => {
      setPlayerState(state);
      if (state.activeTrackId) {
        const idx = SAMPLE_TRACKS.findIndex((t) => t.id === state.activeTrackId);
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
  }, []);

  const handlePlayQueue = async () => {
    await playerService.playQueue(SAMPLE_TRACKS, currentTrackIndex);
  };

  const handleTogglePlay = async () => {
    if (playerState.isPlaying) {
      await playerService.pause();
    } else {
      if (!playerState.activeTrackId) {
        await handlePlayQueue();
      } else {
        await playerService.play();
      }
    }
  };

  const handleNext = async () => {
    await playerService.next();
  };

  const handlePrevious = async () => {
    await playerService.previous();
  };

  const handleSeek = async (secondsOffset: number) => {
    const target = Math.max(0, playerState.positionSec + secondsOffset);
    await playerService.seekTo(target);
  };

  const currentTrack: Track = SAMPLE_TRACKS[currentTrackIndex] ?? (SAMPLE_TRACKS[0] as Track);
  const gaplessMs = playerService.getGaplessDeltaMs();
  const buildSha = process.env.EXPO_PUBLIC_BUILD_SHA || 'dev-local';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Thẻ hiển thị bài hát */}
      <View style={styles.card}>
        <Text style={styles.badge}>PHASE 0 SPIKE</Text>
        <Text style={styles.title}>{currentTrack.title}</Text>
        <Text style={styles.artist}>
          {currentTrack.artist} • {currentTrack.album ?? 'Single'}
        </Text>

        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{Math.floor(playerState.positionSec)}s</Text>
          {playerState.isBuffering && <ActivityIndicator size="small" color="#1DB954" />}
          <Text style={styles.timeText}>
            {Math.floor(playerState.durationSec || currentTrack.duration)}s
          </Text>
        </View>

        {/* Cụm điều khiển phát nhạc */}
        <View style={styles.controlsRow}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => handleSeek(-10)}>
            <Text style={styles.btnText}>-10s</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={handlePrevious}>
            <Text style={styles.btnText}>Prev</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.playBtn} onPress={handleTogglePlay}>
            <Text style={styles.playBtnText}>{playerState.isPlaying ? 'PAUSE' : 'PLAY'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={handleNext}>
            <Text style={styles.btnText}>Next</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => handleSeek(10)}>
            <Text style={styles.btnText}>+10s</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bảng thông tin Debug Phase 0 */}
      <View style={styles.debugCard}>
        <Text style={styles.debugHeader}>DEBUG & ACCEPTANCE CRITERIA</Text>

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
            {gaplessMs !== null ? `${gaplessMs} ms` : 'Chưa đo (hãy bấm Next)'}
          </Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Checklist trên iPhone (docs/ACCEPTANCE.md):</Text>
          <Text style={styles.infoItem}>• P0.1 & P0.6: App mở mượt mà, không crash/màn hình trắng.</Text>
          <Text style={styles.infoItem}>• P0.2: Âm thanh phát rõ ràng qua loa/tai nghe.</Text>
          <Text style={styles.infoItem}>• P0.3: Khóa màn hình 10 phút (Smoke) & 1 giờ (Long-run).</Text>
          <Text style={styles.infoItem}>• P0.4: Lock screen & Control Center hiện tên bài, scrubber tua được.</Text>
          <Text style={styles.infoItem}>• P0.7: Waveform thực tế khi chuyển track không gián đoạn (&lt; 100ms).</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#0a0a0a',
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#181818',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#282828',
  },
  badge: {
    color: '#1DB954',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  artist: {
    color: '#a0a0a0',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 8,
    marginBottom: 20,
    alignItems: 'center',
  },
  timeText: {
    color: '#888888',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  playBtn: {
    backgroundColor: '#1DB954',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 30,
  },
  playBtnText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 15,
  },
  secondaryBtn: {
    backgroundColor: '#282828',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  btnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
  debugCard: {
    backgroundColor: '#121212',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222222',
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
  infoBox: {
    marginTop: 14,
    backgroundColor: '#181818',
    padding: 12,
    borderRadius: 8,
  },
  infoTitle: {
    color: '#1DB954',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  infoItem: {
    color: '#b0b0b0',
    fontSize: 12,
    lineHeight: 18,
  },
});
