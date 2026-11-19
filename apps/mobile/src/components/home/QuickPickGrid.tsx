import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import type { Track } from '@music-app/shared';
import { colors, spacing, radius, typography } from '../../theme';
import { DiscIcon } from '../icons/SvgIcons';
import { EqualizerIndicator } from '../player/EqualizerIndicator';
import { SectionHeader } from '../common/SectionHeader';
import { haptics } from '../../lib/haptics';

export interface QuickPickGridProps {
  title: string;
  subtitle?: string;
  tracks: Track[];
  currentTrackId?: string | null;
  isPlaying?: boolean;
  onTrackPress: (track: Track, tracks: Track[]) => void;
  onTrackLongPress?: (track: Track) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_PADDING = spacing.lg;
const GRID_GAP = spacing.sm;
const ITEM_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;

export const QuickPickGrid = React.memo(function QuickPickGrid({
  title,
  subtitle,
  tracks,
  currentTrackId,
  isPlaying = false,
  onTrackPress,
  onTrackLongPress,
}: QuickPickGridProps) {
  const renderItem = useCallback(
    (track: Track) => {
      const isCurrent = currentTrackId === track.id;

      return (
        <TouchableOpacity
          key={track.id}
          style={[styles.itemContainer, isCurrent && styles.itemContainerActive]}
          onPress={() => {
            haptics.tap();
            onTrackPress(track, tracks);
          }}
          onLongPress={() => onTrackLongPress?.(track)}
          delayLongPress={450}
          activeOpacity={0.7}
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
                <DiscIcon size={20} color={colors.borderLight} />
              </View>
            )}

            {isCurrent && (
              <View style={styles.playingOverlay}>
                <EqualizerIndicator isPlaying={isPlaying} size={14} color={colors.primary} />
              </View>
            )}
          </View>

          <View style={styles.infoWrapper}>
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
          </View>
        </TouchableOpacity>
      );
    },
    [currentTrackId, isPlaying, onTrackPress, onTrackLongPress, tracks]
  );

  return (
    <View style={styles.container}>
      <SectionHeader title={title} subtitle={subtitle} />
      <View style={styles.grid}>
        {tracks.slice(0, 6).map(renderItem)}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: GRID_PADDING,
    rowGap: GRID_GAP,
  },
  itemContainer: {
    width: ITEM_WIDTH,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  itemContainerActive: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surfaceActive,
  },
  coverWrapper: {
    width: 44,
    height: 44,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
    position: 'relative',
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
    backgroundColor: colors.surfaceElevated,
  },
  playingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoWrapper: {
    flex: 1,
    marginLeft: spacing.sm,
    justifyContent: 'center',
    paddingRight: 4,
  },
  title: {
    ...typography.caption1,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  titleActive: {
    color: colors.primary,
  },
  artist: {
    ...typography.caption2,
    color: colors.textSecondary,
    marginTop: 2,
  },
});

