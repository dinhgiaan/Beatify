import React from 'react';
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
import { smartShuffle, type Track } from '@music-app/shared';
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
  HeartIcon,
  PlayIcon,
  PauseIcon,
  ShuffleIcon,
  TrashIcon,
} from '../../src/components/icons/SvgIcons';
import { formatTime } from '../../src/utils/formatTime';
import { EqualizerIndicator } from '../../src/components/player/EqualizerIndicator';

export default function RecentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { contentPaddingBottom } = useTabBarMetrics();
  const {
    recentTracks,
    clearRecentTracks,
    currentTrack,
    playerState,
    playQueue,
    togglePlay,
    setIsSmartShuffle,
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

  const handleTrackPress = (track: Track, index: number) => {
    Vibration.vibrate(10);
    if (currentTrack?.id === track.id) {
      router.push('/now-playing');
      return;
    }
    playQueue(recentTracks, index >= 0 ? index : 0);
  };

  const handlePlayAll = () => {
    if (recentTracks.length === 0) return;
    Vibration.vibrate(15);
    setIsSmartShuffle?.(false);
    playQueue(recentTracks, 0);
  };

  const handleShufflePlayAll = () => {
    if (recentTracks.length === 0) return;
    Vibration.vibrate(15);
    const shuffled = smartShuffle(recentTracks);
    setIsSmartShuffle?.(true);
    playQueue(shuffled, 0);
  };

  const heroTrack = recentTracks.length > 0 ? recentTracks[0] : null;
  const isHeroPlaying = heroTrack && currentTrack?.id === heroTrack.id && playerState.isPlaying;
  const isHeroCurrent = heroTrack && currentTrack?.id === heroTrack.id;
  const isHeroFav = heroTrack ? userState?.favoriteIds?.includes(heroTrack.id) : false;

  const renderHeroCard = () => {
    if (!heroTrack) return null;

    return (
      <View style={styles.heroSection}>
        <View style={styles.heroBadgeRow}>
          <View style={styles.heroBadge}>
            <View style={styles.heroBadgeDot} />
            <Text style={styles.heroBadgeText}>VỪA NGHE GẦN ĐÂY NHẤT</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.heroCard, isHeroCurrent && styles.heroCardActive]}
          onPress={() => handleTrackPress(heroTrack, 0)}
          activeOpacity={0.85}
        >
          <View style={styles.heroCoverWrapper}>
            {heroTrack.cover ? (
              <Image source={{ uri: heroTrack.cover }} style={styles.heroCoverImg} resizeMode="cover" />
            ) : (
              <View style={styles.heroCoverPlaceholder}>
                <DiscIcon size={28} color={colors.textTertiary} />
              </View>
            )}
            {isHeroCurrent && (
              <View style={styles.heroPlayingOverlay}>
                <EqualizerIndicator isPlaying={playerState.isPlaying} size={18} color={colors.primary} />
              </View>
            )}
          </View>

          <View style={styles.heroInfo}>
            <Text
              style={[styles.heroTitleText, isHeroCurrent && styles.heroTitleTextActive]}
              numberOfLines={1}
            >
              {heroTrack.title}
            </Text>
            <Text style={styles.heroArtistText} numberOfLines={1}>
              {heroTrack.artist} {heroTrack.album ? `• ${heroTrack.album}` : ''}
            </Text>
            <Text style={styles.heroDurationText}>{formatTime(heroTrack.duration)}</Text>
          </View>

          <View style={styles.heroActions}>
            <TouchableOpacity
              style={styles.heroFavBtn}
              onPress={() => toggleFavorite(heroTrack.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <HeartIcon
                size={20}
                color={isHeroFav ? colors.primary : colors.textTertiary}
                fill={isHeroFav ? colors.primary : 'none'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.heroPlayCircle}
              onPress={() => {
                Vibration.vibrate(10);
                if (isHeroCurrent) {
                  togglePlay();
                } else {
                  playQueue(recentTracks, 0);
                }
              }}
              activeOpacity={0.8}
            >
              {isHeroPlaying ? (
                <PauseIcon size={18} color="#000000" />
              ) : (
                <PlayIcon size={18} color="#000000" />
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {/* Action buttons: Phát tất cả & Phát ngẫu nhiên */}
        <View style={styles.quickActionsRow}>
          <TouchableOpacity
            style={styles.actionPlayBtn}
            onPress={handlePlayAll}
            activeOpacity={0.8}
          >
            <PlayIcon size={16} color="#000000" />
            <Text style={styles.actionPlayBtnText}>Phát tất cả</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionShuffleBtn}
            onPress={handleShufflePlayAll}
            activeOpacity={0.8}
          >
            <ShuffleIcon size={16} color={colors.textPrimary} />
            <Text style={styles.actionShuffleBtnText}>Phát ngẫu nhiên</Text>
          </TouchableOpacity>
        </View>

        {recentTracks.length > 1 && (
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitleText}>Lịch sử trước đó</Text>
            <Text style={styles.sectionCountText}>{recentTracks.length - 1} bài</Text>
          </View>
        )}
      </View>
    );
  };

  const renderTrackItem = ({ item, index }: { item: Track; index: number }) => {
    // Offset index by 1 because item #0 is the hero card
    const realIndex = index + 1;
    const isPlayingCurrent = currentTrack?.id === item.id;
    const isFav = userState?.favoriteIds?.includes(item.id);

    return (
      <TouchableOpacity
        style={[styles.trackItem, isPlayingCurrent && styles.trackItemActive]}
        onPress={() => handleTrackPress(item, realIndex)}
        activeOpacity={0.7}
      >
        <Text style={styles.trackIndexText}>{realIndex + 1}</Text>

        <View style={styles.coverWrapper}>
          {item.cover ? (
            <Image source={{ uri: item.cover }} style={styles.coverImg} resizeMode="cover" />
          ) : (
            <View style={styles.coverPlaceholder}>
              <DiscIcon size={18} color={colors.textTertiary} />
            </View>
          )}
          {isPlayingCurrent && (
            <View style={styles.playingOverlay}>
              <EqualizerIndicator isPlaying={playerState.isPlaying} size={14} color={colors.primary} />
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
              size={17}
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
        <View style={{ flex: 1 }}>
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
            <TrashIcon size={14} color={colors.textSecondary} />
            <Text style={styles.clearBtnText}>Xóa</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={recentTracks.length > 1 ? recentTracks.slice(1) : []}
        keyExtractor={(item, idx) => `recent-${item.id}-${idx + 1}`}
        renderItem={renderTrackItem}
        ListHeaderComponent={renderHeroCard}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: contentPaddingBottom },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          recentTracks.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <ClockRewindIcon size={38} color={colors.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>Chưa có bài hát nào gần đây</Text>
              <Text style={styles.emptySubtitle}>
                Những bài hát bạn nghe sẽ tự động được ghi nhận tại đây để bạn có thể nghe lại bất cứ lúc nào.
              </Text>
              <TouchableOpacity
                style={styles.exploreBtn}
                onPress={() => router.push('/(tabs)/library')}
                activeOpacity={0.8}
              >
                <Text style={styles.exploreBtnText}>Khám phá thư viện</Text>
              </TouchableOpacity>
            </View>
          ) : null
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
    fontSize: 26,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: fontSizes.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
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
  heroSection: {
    marginBottom: spacing.md,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.25)',
    gap: 5,
  },
  heroBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  heroBadgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.8,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: spacing.sm,
  },
  heroCardActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(34, 197, 94, 0.06)',
  },
  heroCoverWrapper: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    position: 'relative',
    marginRight: spacing.md,
  },
  heroCoverImg: {
    width: '100%',
    height: '100%',
  },
  heroCoverPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroPlayingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroInfo: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: spacing.sm,
  },
  heroTitleText: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
    marginBottom: 2,
  },
  heroTitleTextActive: {
    color: colors.primary,
  },
  heroArtistText: {
    color: colors.textSecondary,
    fontSize: fontSizes.caption,
    marginBottom: 4,
  },
  heroDurationText: {
    color: colors.textTertiary,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroFavBtn: {
    padding: 6,
  },
  heroPlayCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  quickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  actionPlayBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  actionPlayBtnText: {
    color: '#000000',
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.bold,
  },
  actionShuffleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  actionShuffleBtnText: {
    color: colors.textPrimary,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.semibold,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  sectionTitleText: {
    color: colors.textSecondary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionCountText: {
    color: colors.textTertiary,
    fontSize: fontSizes.caption,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    marginBottom: 2,
  },
  trackItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  trackIndexText: {
    width: 22,
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
    marginRight: 6,
    fontVariant: ['tabular-nums'],
  },
  coverWrapper: {
    width: 44,
    height: 44,
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
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
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
    marginBottom: spacing.lg,
  },
  exploreBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  exploreBtnText: {
    color: colors.textPrimary,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.semibold,
  },
});
