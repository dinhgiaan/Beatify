import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import type { Track } from '@music-app/shared';
import { colors, spacing, radius, fontWeights } from '../../theme';
import { DiscIcon, CheckIcon } from '../icons/SvgIcons';
import { EqualizerIndicator } from '../player/EqualizerIndicator';
import { SectionHeader } from '../common/SectionHeader';
import { PressableScale } from '../common/PressableScale';
import { haptics } from '../../lib/haptics';

export interface QuickPickGridProps {
  title: string;
  subtitle?: string;
  tracks: Track[];
  currentTrackId?: string | null;
  isPlaying?: boolean;
  isTrackOffline?: (trackId: string) => boolean;
  onTrackPress: (track: Track, tracks: Track[]) => void;
  onTrackLongPress?: (track: Track) => void;
}

const HERO_MARGIN_H = spacing.lg;
const HERO_INNER_PADDING = spacing.sm;
const GRID_COLUMN_GAP = spacing.sm;

export const QuickPickGrid = React.memo(function QuickPickGrid({
  title,
  subtitle,
  tracks,
  currentTrackId,
  isPlaying = false,
  isTrackOffline,
  onTrackPress,
  onTrackLongPress,
}: QuickPickGridProps) {
  const { width: screenWidth } = useWindowDimensions();
  const itemWidth = Math.floor(
    (screenWidth - HERO_MARGIN_H * 2 - HERO_INNER_PADDING * 2 - GRID_COLUMN_GAP) / 2
  );

  const renderItem = useCallback(
    (track: Track) => {
      const isCurrent = currentTrackId === track.id;
      const isOffline = Boolean(isTrackOffline?.(track.id));

      return (
        <PressableScale
          key={track.id}
          style={[styles.itemContainer, { width: itemWidth }, isCurrent && styles.itemContainerActive]}
          onPress={() => {
            haptics.tap();
            onTrackPress(track, tracks);
          }}
          onLongPress={() => onTrackLongPress?.(track)}
          scaleTo={0.96}
          accessibilityRole="button"
          accessibilityLabel={`${track.title}, ${track.artist}`}
        >
          {/* Ảnh bìa vuông 48pt bên trái */}
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
                <DiscIcon size={24} color={colors.borderLight} />
              </View>
            )}

            {isCurrent && (
              <View style={styles.playingOverlay}>
                <EqualizerIndicator isPlaying={isPlaying} size={14} color={colors.primary} />
              </View>
            )}
          </View>

          {/* Cột bên phải flex: 1, minWidth: 0 hiển thị tiêu đề, nghệ sĩ và badge đã tải */}
          <View style={styles.infoWrapper}>
            <Text
              style={[styles.title, isCurrent && styles.titleActive]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {track.title}
            </Text>
            <View style={styles.artistRow}>
              {isOffline && (
                <View style={styles.offlineCheckBadge}>
                  <CheckIcon size={8} color="#000000" />
                </View>
              )}
              <Text style={styles.artist} numberOfLines={1} ellipsizeMode="tail">
                {track.artist}
              </Text>
            </View>
          </View>
        </PressableScale>
      );
    },
    [currentTrackId, isPlaying, isTrackOffline, itemWidth, onTrackPress, onTrackLongPress, tracks]
  );

  return (
    <View style={styles.container}>
      <SectionHeader title={title} subtitle={subtitle} />
      <View style={styles.heroContainer}>
        <View style={styles.grid}>
          {tracks.slice(0, 6).map(renderItem)}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 32, // E4: section Chọn nhanh cách section tiếp theo 32pt
  },
  heroContainer: {
    marginHorizontal: HERO_MARGIN_H,
    padding: HERO_INNER_PADDING,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.sm,
  },
  itemContainer: {
    height: 64, // D2: chiều cao ô cố định ~64pt
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  itemContainerActive: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surfaceActive,
  },
  coverWrapper: {
    width: 48, // D2: ảnh vuông 48pt
    height: 48,
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
    flex: 1, // D2: cột flex: 1, minWidth: 0
    minWidth: 0,
    marginLeft: 9,
    justifyContent: 'center',
    paddingRight: 4,
  },
  title: {
    fontSize: 13.5,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  titleActive: {
    color: colors.primary,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  offlineCheckBadge: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
    flexShrink: 0,
  },
  artist: {
    flex: 1,
    fontSize: 12,
    fontWeight: fontWeights.regular,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
