import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Track } from '@music-app/shared';
import { useLibrary, usePlayer } from '../../src/context';
import { useTabBarMetrics } from '../../src/hooks/useTabBarMetrics';
import {
  colors,
  fontSizes,
  fontWeights,
  spacing,
  radius,
} from '../../src/theme';
import { DiscIcon, PlayIcon, PauseIcon } from '../../src/components/icons/SvgIcons';

/**
 * Màn hình Thư viện (bản tối thiểu của Pha 2)
 * FlatList các bài hát, chạm để phát nhạc, paddingBottom thích ứng với Tab Bar + MiniPlayer
 */
export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { tracks } = useLibrary();
  const { currentTrack, playerState, skipToTrack, playQueue, togglePlay } = usePlayer();
  const { contentPaddingBottom } = useTabBarMetrics();

  const handleTrackPress = (item: Track) => {
    if (currentTrack?.id === item.id) {
      togglePlay();
    } else {
      const idx = tracks.findIndex((t) => t.id === item.id);
      if (idx >= 0) {
        skipToTrack(idx);
      } else {
        playQueue([item], 0);
      }
    }
  };

  const renderTrackItem = ({ item }: { item: Track }) => {
    const isCurrent = currentTrack?.id === item.id;

    return (
      <TouchableOpacity
        style={[styles.trackItem, isCurrent && styles.trackItemActive]}
        onPress={() => handleTrackPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.coverWrapper}>
          {item.cover ? (
            <Image source={{ uri: item.cover }} style={styles.coverImage} resizeMode="cover" />
          ) : (
            <View style={styles.coverPlaceholder}>
              <DiscIcon size={20} color={colors.borderLight} />
            </View>
          )}
          {isCurrent && (
            <View style={styles.playingOverlay}>
              {playerState.isPlaying ? (
                <PauseIcon size={16} color={colors.primary} />
              ) : (
                <PlayIcon size={16} color={colors.primary} />
              )}
            </View>
          )}
        </View>

        <View style={styles.infoWrapper}>
          <Text
            style={[styles.titleText, isCurrent && styles.titleActive]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.title}
          </Text>
          <Text style={styles.artistText} numberOfLines={1} ellipsizeMode="tail">
            {item.artist} • {item.album ?? 'Single'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Thư viện</Text>
        <Text style={styles.headerSubtitle}>{tracks.length} bài hát</Text>
      </View>

      <FlatList
        data={tracks}
        keyExtractor={(item) => item.id}
        renderItem={renderTrackItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: contentPaddingBottom },
        ]}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <DiscIcon size={48} color={colors.borderLight} />
            <Text style={styles.emptyText}>Thư viện chưa có bài hát nào</Text>
            <Text style={styles.emptySubText}>
              Đồng bộ bài hát từ trang web quản lý hoặc quay lại Spike để nhập link.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: fontSizes.headline,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: fontSizes.subhead,
    color: colors.textSecondary,
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  trackItemActive: {
    backgroundColor: colors.surfaceElevated,
  },
  coverWrapper: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    marginRight: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlayLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  titleText: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  titleActive: {
    color: colors.primary,
  },
  artistText: {
    fontSize: fontSizes.subhead,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyContainer: {
    paddingVertical: spacing.huge,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: fontSizes.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
