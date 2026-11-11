import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  Vibration,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { Track } from '@music-app/shared';
import { usePlayer, useLibrary } from '../../src/context';
import { useTabBarMetrics } from '../../src/hooks/useTabBarMetrics';
import {
  colors,
  spacing,
  radius,
  fontSizes,
  fontWeights,
} from '../../src/theme';
import {
  ClockRewindIcon,
  DiscIcon,
  PlayIcon,
  PauseIcon,
  HeartIcon,
  MoreHorizontalIcon,
} from '../../src/components/icons/SvgIcons';
import { formatTime } from '../../src/utils/formatTime';

export default function RecentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { contentPaddingBottom } = useTabBarMetrics();
  const {
    recentTracks,
    clearRecentTracks,
    skipToTrack,
    currentTrack,
    playerState,
    playQueue,
  } = usePlayer();
  const { userState, toggleFavorite } = useLibrary();

  const handleClearHistory = () => {
    Vibration.vibrate(10);
    Alert.alert(
      'Xóa lịch sử nghe?',
      'Toàn bộ danh sách bài hát vừa nghe sẽ được làm trống.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa lịch sử',
          style: 'destructive',
          onPress: () => {
            clearRecentTracks();
          },
        },
      ]
    );
  };

  const handleTrackPress = (track: Track) => {
    Vibration.vibrate(10);
    if (currentTrack?.id === track.id) {
      router.push('/now-playing');
      return;
    }
    // Phát ngay từ danh sách vừa nghe gần đây
    const trackIndex = recentTracks.findIndex((t) => t.id === track.id);
    playQueue(recentTracks, trackIndex >= 0 ? trackIndex : 0);
  };

  const renderTrackItem = ({ item, index }: { item: Track; index: number }) => {
    const isPlayingCurrent = currentTrack?.id === item.id;
    const isFav = userState?.favoriteIds?.includes(item.id);

    return (
      <TouchableOpacity
        style={[styles.trackItem, isPlayingCurrent && styles.trackItemActive]}
        onPress={() => handleTrackPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.coverWrapper}>
          {item.cover ? (
            <Image source={{ uri: item.cover }} style={styles.coverImg} resizeMode="cover" />
          ) : (
            <View style={styles.coverPlaceholder}>
              <DiscIcon size={20} color={colors.textTertiary} />
            </View>
          )}
          {isPlayingCurrent && (
            <View style={styles.playingOverlay}>
              {playerState.isPlaying ? (
                <PauseIcon size={14} color={colors.primary} />
              ) : (
                <PlayIcon size={14} color={colors.primary} />
              )}
            </View>
          )}
        </View>

        <View style={styles.trackInfo}>
          <Text
            style={[styles.titleText, isPlayingCurrent && styles.titleTextActive]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={styles.artistText} numberOfLines={1}>
            {item.artist} {item.album ? `• ${item.album}` : ''}
          </Text>
        </View>

        <View style={styles.trackRight}>
          <TouchableOpacity
            style={styles.favBtn}
            onPress={() => toggleFavorite(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <HeartIcon
              size={18}
              color={isFav ? colors.primary : colors.textTertiary}
              fill={isFav ? colors.primary : 'none'}
            />
          </TouchableOpacity>

          <Text style={styles.durationText}>{formatTime(item.duration)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Vừa nghe</Text>
          <Text style={styles.headerSubtitle}>
            {recentTracks.length > 0
              ? `${recentTracks.length} bài hát được nghe gần đây`
              : 'Lịch sử phát nhạc của bạn'}
          </Text>
        </View>

        {recentTracks.length > 0 && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={handleClearHistory}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.clearBtnText}>Xóa lịch sử</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={recentTracks}
        keyExtractor={(item, idx) => `recent-${item.id}-${idx}`}
        renderItem={renderTrackItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: contentPaddingBottom },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <ClockRewindIcon size={36} color={colors.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>Chưa có bài hát nào gần đây</Text>
            <Text style={styles.emptySubtitle}>
              Những bài hát bạn nghe tối thiểu 5 giây sẽ tự động được ghi nhận tại đây để bạn nghe lại bất cứ lúc nào.
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    fontSize: fontSizes.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  clearBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  clearBtnText: {
    color: colors.textSecondary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    marginBottom: spacing.xxs,
  },
  trackItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  coverWrapper: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    position: 'relative',
    marginRight: spacing.md,
  },
  coverImg: {
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
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  titleText: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
  },
  titleTextActive: {
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
  artistText: {
    color: colors.textTertiary,
    fontSize: fontSizes.caption,
    marginTop: 2,
  },
  trackRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: spacing.xs,
  },
  favBtn: {
    padding: 4,
  },
  durationText: {
    color: colors.textTertiary,
    fontSize: fontSizes.caption,
    fontVariant: ['tabular-nums'],
    width: 36,
    textAlign: 'right',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: 80,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: colors.textTertiary,
    fontSize: fontSizes.subhead,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 20,
  },
});
