import React, { useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { usePlayer, useProgress } from '../../context';
import {
  colors,
  fontSizes,
  fontWeights,
  spacing,
  radius,
} from '../../theme';
import {
  PlayIcon,
  PauseIcon,
  NextIcon,
  DiscIcon,
} from '../icons/SvgIcons';
import { EqualizerIndicator } from './EqualizerIndicator';
import { MINI_PLAYER_HEIGHT } from '../../hooks/useTabBarMetrics';

/**
 * Thanh tiến trình 2pt nằm trên đỉnh MiniPlayer
 * Subscribe riêng useProgress() để cô lập re-render mỗi 250ms
 */
export function MiniProgressBar() {
  const { progressPercent } = useProgress();
  return (
    <View style={styles.progressBarTrack}>
      <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
    </View>
  );
}

/**
 * MiniPlayer: Thanh phát nhạc thu nhỏ xuất hiện phía trên Tab Bar
 * Chiều cao chuẩn 56pt, vùng chạm nút >= 44pt qua hitSlop
 */
export function MiniPlayer() {
  const router = useRouter();
  const { currentTrack, playerState, togglePlay, next } = usePlayer();

  const playScale = useRef(new Animated.Value(1)).current;
  const onPlayPressIn = () => {
    Animated.spring(playScale, { toValue: 0.85, friction: 6, tension: 160, useNativeDriver: true }).start();
  };
  const onPlayPressOut = () => {
    Animated.spring(playScale, { toValue: 1.0, friction: 4, tension: 120, useNativeDriver: true }).start();
  };

  if (!currentTrack) {
    return null;
  }

  const handleOpenNowPlaying = () => {
    router.push('/now-playing');
  };

  const handleTogglePlay = (e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.();
    togglePlay();
  };

  const handleNext = (e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.();
    next();
  };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={handleOpenNowPlaying}
      style={styles.container}
      accessibilityRole="button"
      accessibilityLabel={`Đang phát: ${currentTrack.title} của ${currentTrack.artist}. Chạm để mở toàn màn hình.`}
    >
      <MiniProgressBar />

      <View style={styles.contentRow}>
        {/* Ảnh bìa thu nhỏ 40x40 */}
        <View style={styles.artworkWrapper}>
          {currentTrack.cover ? (
            <Image
              source={{ uri: currentTrack.cover }}
              style={styles.artworkImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.artworkPlaceholder}>
              <DiscIcon size={20} color={colors.borderLight} />
            </View>
          )}
        </View>

        {/* Thông tin bài hát (tối đa 1 dòng mỗi nhãn) */}
        <View style={styles.infoWrapper}>
          <Text
            style={styles.titleText}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {currentTrack.title}
          </Text>
          <View style={styles.artistRow}>
            {playerState.isPlaying && (
              <View style={styles.miniEqualizerBadge}>
                <EqualizerIndicator isPlaying={true} size={11} color={colors.primary} />
              </View>
            )}
            <Text
              style={styles.artistText}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {currentTrack.artist}
            </Text>
          </View>
        </View>

        {/* Cụm nút điều khiển: Play/Pause và Next */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={handleTogglePlay}
            onPressIn={onPlayPressIn}
            onPressOut={onPlayPressOut}
            activeOpacity={0.9}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={playerState.isPlaying ? 'Tạm dừng' : 'Tiếp tục phát'}
          >
            <Animated.View style={{ transform: [{ scale: playScale }] }}>
              {playerState.isPlaying ? (
                <PauseIcon size={22} color={colors.textPrimary} />
              ) : (
                <PlayIcon size={22} color={colors.textPrimary} />
              )}
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlButton}
            onPress={handleNext}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Bài tiếp theo"
          >
            <NextIcon size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '94%',
    maxWidth: 380,
    height: MINI_PLAYER_HEIGHT,
    backgroundColor: 'rgba(28, 28, 30, 0.88)', // iOS 18 Glassmorphism đồng bộ với Floating Dock
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    marginBottom: 8,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  progressBarTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.surface,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  artworkWrapper: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    marginRight: spacing.md,
  },
  artworkImage: {
    width: '100%',
    height: '100%',
  },
  artworkPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoWrapper: {
    flex: 1,
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  titleText: {
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  miniEqualizerBadge: {
    marginRight: 4,
    height: 12,
    justifyContent: 'center',
  },
  artistText: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.regular,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  controlButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
