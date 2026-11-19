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
import AnimatedReanimated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { usePlayer } from '../../context';

const AnimatedTouchable = AnimatedReanimated.createAnimatedComponent(TouchableOpacity);
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
  PrevIcon,
  DiscIcon,
} from '../icons/SvgIcons';
import { EqualizerIndicator } from './EqualizerIndicator';
import { Waveform } from './Waveform';
import { MINI_PLAYER_HEIGHT } from '../../hooks/useTabBarMetrics';

export interface MiniPlayerProps {
  onPress?: () => void;
}

/**
 * MiniPlayer: Thanh phát nhạc thu nhỏ xuất hiện phía trên Tab Bar
 * Chiều cao chuẩn 56pt, vùng chạm nút >= 44pt qua hitSlop
 */
export function MiniPlayer({ onPress }: MiniPlayerProps = {}) {
  const router = useRouter();
  const {
    currentTrack,
    currentTrackIndex,
    playerState,
    togglePlay,
    next,
    previous,
  } = usePlayer();

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
    if (onPress) {
      onPress();
    } else {
      router.push('/now-playing');
    }
  };

  const handleTogglePlay = (e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.();
    togglePlay();
  };

  const handlePrevious = (e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.();
    if (currentTrackIndex > 0) {
      previous();
    }
  };

  const handleNext = (e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.();
    next();
  };

  return (
      <AnimatedTouchable
        entering={FadeInDown.duration(220)}
      exiting={FadeOutDown.duration(180)}
      activeOpacity={0.9}
      onPress={handleOpenNowPlaying}
      style={styles.container}
      accessibilityRole="button"
      accessibilityLabel={`Đang phát: ${currentTrack.title} của ${currentTrack.artist}. Chạm để mở toàn màn hình.`}
    >
      <View style={styles.waveformWrapper}>
        <Waveform trackId={currentTrack.id} height={10} barCount={45} />
      </View>

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

        {/* Cụm nút điều khiển: Prev, Play/Pause và Next */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={[styles.controlButton, currentTrackIndex <= 0 && { opacity: 0.3 }]}
            onPress={handlePrevious}
            disabled={currentTrackIndex <= 0}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Bài trước đó"
          >
            <PrevIcon size={18} color={currentTrackIndex <= 0 ? colors.textTertiary : colors.textPrimary} />
          </TouchableOpacity>

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
      </AnimatedTouchable >
    );
}

const styles = StyleSheet.create({
  container: {
    width: '94%',
    maxWidth: 380,
    height: MINI_PLAYER_HEIGHT,
    backgroundColor: 'rgba(24, 24, 27, 0.96)', // Nền đặc iOS Surface không để chữ phía sau lộ qua
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
  waveformWrapper: {
    position: 'absolute',
    top: 0,
    left: 8,
    right: 8,
    height: 8,
    overflow: 'hidden',
    zIndex: 2,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: 6,
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
