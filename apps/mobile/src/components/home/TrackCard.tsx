import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import type { Track } from '@music-app/shared';
import { colors, spacing, radius, typography } from '../../theme';
import { DiscIcon } from '../icons/SvgIcons';
import { EqualizerIndicator } from '../player/EqualizerIndicator';
import { haptics } from '../../lib/haptics';

export const TRACK_CARD_WIDTH = 140;

export interface TrackCardProps {
  track: Track;
  isCurrent?: boolean;
  isPlaying?: boolean;
  onPress: (track: Track) => void;
  onLongPress?: (track: Track) => void;
}

export const TrackCard = React.memo(function TrackCard({
  track,
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
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={450}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${track.title}, ${track.artist}`}
    >
      <View style={styles.coverWrapper}>
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
            <DiscIcon size={36} color={colors.borderLight} />
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
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    width: TRACK_CARD_WIDTH,
    marginRight: spacing.md,
  },
  coverWrapper: {
    width: TRACK_CARD_WIDTH,
    height: TRACK_CARD_WIDTH,
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
    ...typography.subheadline,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.xs + 2,
  },
  titleActive: {
    color: colors.primary,
  },
  artist: {
    ...typography.caption1,
    color: colors.textSecondary,
    marginTop: 2,
  },
});

