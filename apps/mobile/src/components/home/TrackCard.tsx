import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import type { Track } from '@music-app/shared';
import { colors, spacing, radius, typography } from '../../theme';
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
});

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
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
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
    ...typography.subheadline,
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  titleActive: {
    color: colors.primary,
  },
  artist: {
    ...typography.caption1,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
