import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { smartShuffle, type Track } from '@music-app/shared';
import { usePlayer, useLibrary } from '../../src/context';
import { useTabBarMetrics } from '../../src/hooks/useTabBarMetrics';
import { useCoverColor } from '../../src/hooks/useCoverColor';
import {
  colors,
  spacing,
  fontWeights,
} from '../../src/theme';
import {
  PlayIcon,
  PauseIcon,
  ShuffleIcon,
} from '../../src/components/icons/SvgIcons';
import { formatTime } from '../../src/utils/formatTime';
import { cleanTrackTitle, formatRelativeTime } from '../../src/utils/recentFormatters';
import { TrackActionSheet } from '../../src/components/sheet/TrackActionSheet';
import { AddToPlaylistModal } from '../../src/components/AddToPlaylistModal';
import { ScrollToTopButton } from '../../src/components/common/ScrollToTopButton';

export default function RecentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { contentPaddingBottom } = useTabBarMetrics();
  const {
    recentTracks,
    clearRecentTracks,
    removeRecentTrack,
    currentTrack,
    playerState,
    playQueue,
    playNext,
    togglePlay,
    setIsSmartShuffle,
    handleTrackDeleted,
  } = usePlayer();
  const { userState, toggleFavorite, deleteTrack, updateUserState } = useLibrary();

  // Menu Bottom Sheet cho bài hát
  const [selectedTrackForMenu, setSelectedTrackForMenu] = useState<Track | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [addToPlaylistVisible, setAddToPlaylistVisible] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Hero card là bài hát nghe gần đây nhất (#0)
  const heroTrack = recentTracks.length > 0 ? recentTracks[0] : null;
  const isHeroPlaying = heroTrack && currentTrack?.id === heroTrack.id && playerState.isPlaying;
  const isHeroCurrent = heroTrack && currentTrack?.id === heroTrack.id;

  // Lấy màu chủ đạo từ ảnh bìa hero track để tạo gradient nền
  const coverColor = useCoverColor(heroTrack?.cover);

  const handleClearHistory = () => {
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
    if (currentTrack?.id === track.id) {
      router.push('/now-playing');
      return;
    }
    playQueue(recentTracks, index >= 0 ? index : 0);
  };

  const handlePlayAll = () => {
    if (recentTracks.length === 0) return;
    setIsSmartShuffle?.(false);
    playQueue(recentTracks, 0);
  };

  const handleShufflePlayAll = () => {
    if (recentTracks.length === 0) return;
    const shuffled = smartShuffle(recentTracks);
    setIsSmartShuffle?.(true);
    playQueue(shuffled, 0);
    router.push('/now-playing');
  };

  const openTrackMenu = (track: Track) => {
    setSelectedTrackForMenu(track);
    setMenuVisible(true);
  };

  // Render các hành động khi vuốt trái một bài hát trong danh sách
  const renderRightActions = (item: Track) => {
    const isFav = userState?.favoriteIds?.includes(item.id);
    return (
      <View style={styles.swipeActionsContainer}>
        <TouchableOpacity
          style={[styles.swipeActionBtn, styles.swipeFavBtn]}
          onPress={() => {
            toggleFavorite(item.id);
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.swipeFavText}>{isFav ? 'Bỏ thích' : 'Yêu thích'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.swipeActionBtn, styles.swipeDeleteBtn]}
          onPress={() => {
            removeRecentTrack?.(item.id);
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.swipeDeleteText}>Xóa</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Header và Hero card
  const renderHeader = () => {
    if (!heroTrack) return null;

    const cleanedHeroTitle = cleanTrackTitle(heroTrack.title);

    return (
      <View style={styles.headerSection}>
        {/* Tiêu đề trang kiểu Apple Typography lớn */}
        <View style={styles.titleRow}>
          <Text style={styles.largePageTitle}>Vừa nghe</Text>
          {recentTracks.length > 0 && (
            <TouchableOpacity
              onPress={handleClearHistory}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Text style={styles.clearHistoryLink}>Xóa lịch sử</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Hero Card tối giản, poster-like */}
        <TouchableOpacity
          style={[
            styles.heroCard,
            { shadowColor: coverColor },
            isHeroCurrent && styles.heroCardActive,
          ]}
          onPress={() => handleTrackPress(heroTrack, 0)}
          onLongPress={() => openTrackMenu(heroTrack)}
          activeOpacity={0.88}
        >
          <Image
            source={{ uri: heroTrack.cover }}
            style={styles.heroCover}
            contentFit="cover"
            transition={200}
          />

          <View style={styles.heroInfo}>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {cleanedHeroTitle}
            </Text>
            <Text style={styles.heroArtist} numberOfLines={1}>
              {heroTrack.artist} · {formatRelativeTime(undefined, 0)}
            </Text>
          </View>

          {/* 1 Nút Play tròn to màu xanh */}
          <TouchableOpacity
            style={styles.heroPlayCircle}
            onPress={() => {
              if (isHeroCurrent) {
                togglePlay();
              } else {
                playQueue(recentTracks, 0);
              }
            }}
            activeOpacity={0.8}
          >
            {isHeroPlaying ? (
              <PauseIcon size={20} color="#000000" />
            ) : (
              <PlayIcon size={20} color="#000000" />
            )}
          </TouchableOpacity>
        </TouchableOpacity>

        {/* Cụm 2 nút hành động: Phát tất cả + Icon Shuffle */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.pillBtn, styles.playAllBtn]}
            onPress={handlePlayAll}
            activeOpacity={0.8}
          >
            <Text style={styles.playAllBtnText}>Phát tất cả</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pillBtn, styles.shuffleIconBtn]}
            onPress={handleShufflePlayAll}
            activeOpacity={0.8}
            accessibilityLabel="Phát ngẫu nhiên"
          >
            <ShuffleIcon size={18} color="#000000" />
          </TouchableOpacity>
        </View>

        {/* Tiêu đề mục trước đó */}
        {recentTracks.length > 1 && (
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeaderText}>Trước đó</Text>
            <Text style={styles.sectionCountText}>{recentTracks.length - 1} bài</Text>
          </View>
        )}
      </View>
    );
  };

  // Render từng bài trong danh sách Trước đó
  const renderTrackItem = ({ item, index }: { item: Track; index: number }) => {
    const realIndex = index + 1; // #0 là hero card
    const isPlayingCurrent = currentTrack?.id === item.id;
    const cleanedTitle = cleanTrackTitle(item.title);

    return (
      <Swipeable
        renderRightActions={() => renderRightActions(item)}
        overshootRight={false}
      >
        <TouchableOpacity
          style={[styles.trackRow, isPlayingCurrent && styles.trackRowActive]}
          onPress={() => handleTrackPress(item, realIndex)}
          onLongPress={() => openTrackMenu(item)}
          activeOpacity={0.75}
        >
          <Text style={styles.trackIndex}>{realIndex + 1}</Text>

          <Image
            source={{ uri: item.cover }}
            style={styles.trackCover}
            contentFit="cover"
            transition={150}
          />

          <View style={styles.trackInfo}>
            <Text
              style={[styles.trackTitle, isPlayingCurrent && styles.trackTitleActive]}
              numberOfLines={1}
            >
              {cleanedTitle}
            </Text>
            <Text style={styles.trackArtist} numberOfLines={1}>
              {item.artist}
            </Text>
          </View>

          <Text style={styles.trackDuration}>{formatTime(item.duration)}</Text>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Lớp gradient màu cover ở 35% trên cùng tan dần về nền đen */}
      <LinearGradient
        colors={[`${coverColor}55`, 'rgba(18, 18, 20, 0)']}
        style={styles.topGradient}
        pointerEvents="none"
      />

      {recentTracks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.largePageTitle}>Vừa nghe</Text>
          <View style={styles.emptyPrompt}>
            <Text style={styles.emptyTitle}>Chưa có bài hát nào</Text>
            <Text style={styles.emptySubtitle}>
              Những bài hát bạn nghe sẽ tự động được ghi lại ở đây.
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={recentTracks.slice(1)}
          keyExtractor={(item, idx) => `recent-${item.id}-${idx + 1}`}
          renderItem={renderTrackItem}
          ListHeaderComponent={renderHeader}
          onScroll={(e) => {
            setShowScrollTop(e.nativeEvent.contentOffset.y > 350);
          }}
          scrollEventThrottle={16}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: contentPaddingBottom + 20 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Menu bài hát Bottom Sheet kiểu Apple */}
      {selectedTrackForMenu && (
        <TrackActionSheet
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          track={selectedTrackForMenu}
          isFavorite={userState?.favoriteIds?.includes(selectedTrackForMenu.id)}
          playlistNames={
            selectedTrackForMenu
              ? userState.playlists
                .filter((pl) => pl.trackIds.includes(selectedTrackForMenu.id))
                .map((pl) => pl.name)
              : undefined
          }
          onPlayNext={() => {
            if (selectedTrackForMenu) playNext(selectedTrackForMenu);
          }}
          onToggleFavorite={() => {
            toggleFavorite(selectedTrackForMenu.id);
          }}
          onAddToPlaylist={() => {
            setAddToPlaylistVisible(true);
          }}
          onEditInfo={() => {
            // Mở màn hình thư viện hoặc thông báo
          }}
          onDeleteFromLibrary={() => {
            deleteTrack(selectedTrackForMenu.id, handleTrackDeleted);
          }}
        />
      )}

      {/* Modal thêm bài hát vào playlist */}
      <AddToPlaylistModal
        visible={addToPlaylistVisible}
        track={selectedTrackForMenu}
        userState={userState}
        onClose={() => setAddToPlaylistVisible(false)}
        onUpdateUserState={updateUserState}
      />
      {/* Nút Cuộn lên đầu trang với animation mũi tên nhảy lên nhảy xuống mượt mà */}
      <ScrollToTopButton
        visible={showScrollTop}
        onPress={() => {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '42%',
  },
  headerSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  largePageTitle: {
    fontSize: 38,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  clearHistoryLink: {
    fontSize: 15,
    fontWeight: fontWeights.medium,
    color: colors.textTertiary,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(28, 28, 30, 0.75)',
    borderRadius: 16,
    padding: spacing.md,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  heroCardActive: {
    borderColor: 'rgba(29, 185, 84, 0.35)',
  },
  heroCover: {
    width: 90,
    height: 90,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  heroInfo: {
    flex: 1,
    marginLeft: spacing.md,
    marginRight: spacing.sm,
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  heroArtist: {
    fontSize: 14,
    fontWeight: fontWeights.regular,
    color: colors.textSecondary,
    marginTop: 4,
  },
  heroPlayCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: spacing.lg,
  },
  pillBtn: {
    flex: 1,
    height: 48,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playAllBtn: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  playAllBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
  },
  shuffleIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionCountText: {
    fontSize: 13,
    color: colors.textTertiary,
  },
  listContent: {
    paddingTop: spacing.xs,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
  },
  trackRowActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  trackIndex: {
    width: 26,
    fontSize: 14,
    fontWeight: fontWeights.medium,
    color: colors.textTertiary,
    textAlign: 'center',
    marginRight: 6,
  },
  trackCover: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: colors.surface,
    marginRight: spacing.md,
  },
  trackInfo: {
    flex: 1,
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  trackTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  trackTitleActive: {
    color: colors.primary,
  },
  trackArtist: {
    fontSize: 13,
    fontWeight: fontWeights.regular,
    color: colors.textSecondary,
    marginTop: 3,
  },
  trackDuration: {
    fontSize: 13,
    color: colors.textTertiary,
  },
  swipeActionsContainer: {
    flexDirection: 'row',
    width: 150,
    height: '100%',
  },
  swipeActionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeFavBtn: {
    backgroundColor: '#1A3B2B',
  },
  swipeFavText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  swipeDeleteBtn: {
    backgroundColor: '#3B1A1A',
  },
  swipeDeleteText: {
    color: '#FF6B6B',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  emptyPrompt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 260,
    lineHeight: 20,
  },
});
