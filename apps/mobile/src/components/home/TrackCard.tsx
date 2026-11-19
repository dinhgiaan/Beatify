import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import type { Track } from '@music-app/shared';
import { colors, spacing, radius, fontWeights } from '../../theme';
import { DiscIcon } from '../icons/SvgIcons';
import { EqualizerIndicator } from '../player/EqualizerIndicator';
import { PressableScale } from '../common/PressableScale';
import { haptics } from '../../lib/haptics';

export const DEFAULT_TRACK_CARD_WIDTH = 104;

export interface TrackCardProps {
  track: Track;
  cardWidth?: number;
  isCurrent?: boolean;
  isPlaying?: boolean;
  onPress: (track: Track) => void;
  onLongPress?: (track: Track) => void;
}

function areTrackCardPropsEqual(prev: TrackCardProps, next: TrackCardProps): boolean {
  if (prev.track.id !== next.track.id) return false;
  if (prev.cardWidth !== next.cardWidth) return false;
  if (prev.isCurrent !== next.isCurrent) return false;
  // B2: Chỉ khi bài đang được chọn thì trạng thái isPlaying mới gây re-render
  if (prev.isCurrent && prev.isPlaying !== next.isPlaying) return false;
  if (
    prev.track.title !== next.track.title ||
    prev.track.artist !== next.track.artist ||
    prev.track.cover !== next.track.cover
  ) {
    return false;
  }
  return true;
}

export const TrackCard = React.memo(function TrackCard({
  track,
  cardWidth = DEFAULT_TRACK_CARD_WIDTH,
  isCurrent = false,
  isPlaying = false,
  onPress,
  onLongPress,
}: TrackCardProps) {
  const handlePress = useCallback(() => {
    haptics.tap();
    onPress(track);
  }, [onPress, track]);

  const handleLongPress = useCallback(() => {
    onLongPress?.(track);
  }, [onLongPress, track]);

  return (
    <PressableScale
      style={[styles.container, { width: cardWidth }]}
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={450}
      scaleTo={0.96}
      accessibilityRole="button"
      accessibilityLabel={`${track.title}, ${track.artist}`}
    >
      <View style={[styles.coverWrapper, { width: cardWidth, height: cardWidth }]}>
        {track.cover ? (
          <Image
            source={{ uri: track.cover }}
            style={styles.coverImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            recyclingKey={track.id}
          />
        ) : (
          <View style={styles.coverPlaceholder}>
            <DiscIcon size={Math.round(cardWidth * 0.35)} color={colors.borderLight} />
          </View>
        )}

        {isCurrent && (
          <View style={styles.playingOverlay}>
            <EqualizerIndicator isPlaying={isPlaying} size={16} color={colors.primary} />
          </View>
        )}
      </View>

      <Text
        style={[styles.title, isCurrent && styles.titleActive]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {track.title}
      </Text>
      <Text style={styles.artist} numberOfLines={1} ellipsizeMode="tail">
        {track.artist}
      </Text>
    </PressableScale>
  );
}, areTrackCardPropsEqual);

const styles = StyleSheet.create({
  container: {
    marginRight: spacing.md,
  },
  coverWrapper: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  playingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 13, // E2: tên bài 13pt/600
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  titleActive: {
    color: colors.primary,
  },
  artist: {
    fontSize: 12, // E2: nghệ sĩ 12pt/400
    fontWeight: fontWeights.regular,
    color: colors.textTertiary, // E1: màu xám dịu
    marginTop: 2,
  },
});
