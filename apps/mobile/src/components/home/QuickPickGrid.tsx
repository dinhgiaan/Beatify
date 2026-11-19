import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import type { Track } from '@music-app/shared';
import { colors, spacing, radius, fontWeights } from '../../theme';
import { DiscIcon } from '../icons/SvgIcons';
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
  onTrackPress: (track: Track, tracks: Track[]) => void;
  onTrackLongPress?: (track: Track) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Tính toán chiều rộng từng ô trong Hero Container
const HERO_MARGIN_H = spacing.lg;
const HERO_INNER_PADDING = spacing.sm;
const GRID_COLUMN_GAP = spacing.sm;
const ITEM_WIDTH = Math.floor(
  (SCREEN_WIDTH - HERO_MARGIN_H * 2 - HERO_INNER_PADDING * 2 - GRID_COLUMN_GAP) / 2
);

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
        <PressableScale
          key={track.id}
          style={[styles.itemContainer, isCurrent && styles.itemContainerActive]}
          onPress={() => {
            haptics.tap();
            onTrackPress(track, tracks);
          }}
          onLongPress={() => onTrackLongPress?.(track)}
          scaleTo={0.96}
          accessibilityRole="button"
          accessibilityLabel={`${track.title}, ${track.artist}`}
        >
          {/* D2: Ảnh bìa vuông 48pt bên trái */}
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

          {/* D2: Cột bên phải flex: 1, minWidth: 0 hiển thị tiêu đề và nghệ sĩ */}
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
        </PressableScale>
      );
    },
    [currentTrackId, isPlaying, onTrackPress, onTrackLongPress, tracks]
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
    width: ITEM_WIDTH,
    height: 64, // D2: chiều cao ô cố định ~64pt
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 10, // D2: padding ngang 10-12pt
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  itemContainerActive: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surfaceActive,
  },
  coverWrapper: {
    width: 48, // D2: ảnh vuông 48-56pt
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
    marginLeft: 10,
    justifyContent: 'center',
    paddingRight: 2,
  },
  title: {
    fontSize: 14, // D2: 14pt, weight 600, textPrimary, 1 dòng
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  titleActive: {
    color: colors.primary,
  },
  artist: {
    fontSize: 12, // D2: 12pt, màu phụ, 1 dòng, ellipsis
    fontWeight: fontWeights.regular,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
