import React, { useCallback, useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Text,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  normalizeArtistKey,
  type Track,
  type Album,
  type HomeSection,
  type HomeArtistItem,
} from '@music-app/shared';
import { useLibrary } from '../../src/context/LibraryContext';
import { usePlayer } from '../../src/context/PlayerContext';
import { useOffline } from '../../src/context/OfflineContext';
import { useHomeSections } from '../../src/hooks/useHomeSections';
import { useTabBarMetrics } from '../../src/hooks/useTabBarMetrics';
import { colors, spacing, radius, fontWeights } from '../../src/theme';
import {
  HomeGreeting,
  TrackCard,
  AlbumCard,
  ArtistChip,
  QuickPickGrid,
  SectionRow,
  HomeSkeleton,
  useCardWidth,
} from '../../src/components/home';
import { DiscIcon, CloudSyncIcon } from '../../src/components/icons/SvgIcons';
import { TrackActionSheet } from '../../src/components/sheet/TrackActionSheet';
import { CollectionDetailModal } from '../../src/components/CollectionDetailModal';
import { AddToPlaylistModal } from '../../src/components/AddToPlaylistModal';
import { haptics } from '../../src/lib/haptics';

export default function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { contentPaddingBottom } = useTabBarMetrics();
  const { cardWidth, artistChipWidth, cardGap } = useCardWidth();
  const { tracks, syncLibrary, isSyncing, userState, toggleFavorite, updateUserState } = useLibrary();
  const { currentTrack, playerState, playQueue, playNext, togglePlay } = usePlayer();
  const { isTrackOffline, isDownloading, downloadTrack, deleteOfflineTrack } = useOffline();

  const { sections, greeting, isLoading, hasLoadedOnce, recordCount, reload, reshuffle } =
    useHomeSections();

  const flatListRef = useRef<FlatList<HomeSection>>(null);
  const hasPlayedInitialAnimationRef = useRef(false);
  const listOpacity = useSharedValue(1);

  const listAnimStyle = useAnimatedStyle(() => ({
    opacity: listOpacity.value,
  }));

  // F3: Phản hồi thị giác fade nhẹ + rung xúc giác khi xáo trộn đề xuất
  const handleReshuffleWithFeedback = useCallback(() => {
    haptics.tap();
    listOpacity.value = withSequence(
      withTiming(0.4, { duration: 120 }),
      withTiming(1, { duration: 240 })
    );
    reshuffle();
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [reshuffle, listOpacity]);

  // D3 & F3: Lắng nghe sự kiện nhấn giữ tab Home ở TabBar để làm mới đề xuất & cuộn lên đầu
  useEffect(() => {
    const unsubscribe = navigation.addListener('tabLongPress' as never, () => {
      handleReshuffleWithFeedback();
    });
    return unsubscribe;
  }, [navigation, handleReshuffleWithFeedback]);

  // E2: Đánh dấu hoàn thành animation xuất hiện so le sau khi tải lần đầu
  useEffect(() => {
    if (sections.length > 0 && !hasPlayedInitialAnimationRef.current) {
      const timer = setTimeout(() => {
        hasPlayedInitialAnimationRef.current = true;
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [sections.length]);

  // State quản lý Menu tùy chọn bài hát
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [selectedTrackForMenu, setSelectedTrackForMenu] = useState<Track | null>(null);

  // State quản lý Modal thêm vào playlist
  const [addToPlaylistVisible, setAddToPlaylistVisible] = useState(false);

  // State quản lý Modal chi tiết Album / Nghệ sĩ
  const [collectionModal, setCollectionModal] = useState<{
    visible: boolean;
    title: string;
    subtitle?: string;
    coverUrl?: string;
    tracks: Track[];
    type: 'album' | 'artist';
  }>({
    visible: false,
    title: '',
    tracks: [],
    type: 'album',
  });

  // Xử lý khi nhấn bài hát (phát nhạc hoặc tạm dừng nếu là bài hiện tại)
  const handleTrackPress = useCallback(
    (track: Track, sectionTracks?: Track[]) => {
      if (currentTrack?.id === track.id) {
        togglePlay();
      } else {
        const queueToPlay = sectionTracks && sectionTracks.length > 0 ? sectionTracks : tracks;
        const idx = queueToPlay.findIndex((t) => t.id === track.id);
        playQueue(queueToPlay, idx >= 0 ? idx : 0);
      }
    },
    [currentTrack?.id, togglePlay, playQueue, tracks]
  );

  // Xử lý khi nhấn giữ bài hát để mở Action Sheet
  const handleTrackLongPress = useCallback((track: Track) => {
    setSelectedTrackForMenu(track);
    setActionSheetVisible(true);
  }, []);

  // Xử lý khi nhấn vào một Album
  const handleAlbumPress = useCallback(
    (album: Album) => {
      const albumTracks = (tracks || []).filter((t) =>
        t.albumId && album.id ? t.albumId === album.id : t.album === album.title
      );
      setCollectionModal({
        visible: true,
        title: album.title,
        subtitle: `${album.artist} • ${albumTracks.length} bài hát`,
        coverUrl: album.cover || albumTracks.find((t) => Boolean(t.cover))?.cover,
        tracks: albumTracks,
        type: 'album',
      });
    },
    [tracks]
  );

  // Xử lý khi nhấn vào một Nghệ sĩ
  const handleArtistPress = useCallback(
    (artistItem: HomeArtistItem) => {
      const normArtist = normalizeArtistKey(artistItem.artist);
      const artistTracks = (tracks || []).filter(
        (t) => normalizeArtistKey(t.artist) === normArtist
      );
      setCollectionModal({
        visible: true,
        title: artistItem.artist,
        subtitle: `${artistItem.trackCount} tác phẩm trong thư viện`,
        coverUrl: artistItem.coverUrl,
        tracks: artistTracks,
        type: 'artist',
      });
    },
    [tracks]
  );

  // Điều hướng Xem tất cả
  const handleSeeAll = useCallback(
    (sectionId: string) => {
      if (sectionId === 'continue_listening') {
        router.push('/(tabs)/recent');
      } else {
        router.push({
          pathname: '/section/[id]',
          params: { id: sectionId },
        });
      }
    },
    [router]
  );

  // D3: Kéo xuống để đồng bộ thư viện và nạp lại trang chủ
  const handleRefresh = useCallback(async () => {
    await Promise.all([syncLibrary(), reload()]);
  }, [syncLibrary, reload]);

  // Render từng section tùy biến theo kind và layout (Switch Exhaustive)
  const renderSectionItem = useCallback(
      ({ item: section, index }: { item: HomeSection; index: number }) => {
        let contentNode: React.ReactElement;

        switch (section.kind) {
          case 'tracks':
            if (section.layout === 'grid') {
                contentNode = (
                  <QuickPickGrid
                    title={section.title}
                    subtitle={section.subtitle}
                    tracks={section.tracks}
                    currentTrackId={currentTrack?.id}
                    isPlaying={playerState.isPlaying}
                    onTrackPress={handleTrackPress}
                    onTrackLongPress={handleTrackLongPress}
                  />
                );
            } else {
              contentNode = (
                <SectionRow<Track>
                  title={section.title}
                  subtitle={section.subtitle}
                  data={section.tracks}
                  itemWidth={cardWidth}
                  itemSpacing={cardGap}
                  keyExtractor={(t) => t.id}
                  onSeeAll={() => handleSeeAll(section.id)}
                  renderItem={({ item }) => (
                    <TrackCard
                      track={item}
                      cardWidth={cardWidth}
                      isCurrent={currentTrack?.id === item.id}
                      isPlaying={playerState.isPlaying}
                      onPress={(t) => handleTrackPress(t, section.tracks)}
                      onLongPress={handleTrackLongPress}
                    />
                  )}
                />
              );
            }
            break;

          case 'artists':
              contentNode = (
                <SectionRow<HomeArtistItem>
                  title={section.title}
                  subtitle={section.subtitle}
                  data={section.artists}
                  itemWidth={artistChipWidth}
                  itemSpacing={cardGap}
                  keyExtractor={(a, idx) => `${a.artist}-${idx}`}
                  onSeeAll={() => handleSeeAll(section.id)}
                  renderItem={({ item }) => (
                <ArtistChip
                  artist={item}
                  cardWidth={artistChipWidth}
                  onPress={handleArtistPress}
                />
                  )}
                />
              );
            break;

          case 'albums':
              contentNode = (
                <SectionRow<Album>
                  title={section.title}
                  subtitle={section.subtitle}
                  data={section.albums}
                  itemWidth={cardWidth}
                  itemSpacing={cardGap}
                  keyExtractor={(alb) => alb.id}
                  onSeeAll={() => handleSeeAll(section.id)}
                  renderItem={({ item }) => {
                    const albumCoverUri =
                      item.cover ||
                      tracks.find(
                        (t) =>
                          (item.id && t.albumId ? t.albumId === item.id : t.album === item.title) &&
                          Boolean(t.cover)
                      )?.cover;
                    return (
                      <AlbumCard
                        album={item}
                        coverUri={albumCoverUri}
                        cardWidth={cardWidth}
                        onPress={handleAlbumPress}
                      />
                    );
                  }}
                />
              );
            break;

          default: {
            const exhaustiveCheck: never = section;
            return exhaustiveCheck;
          }
        }

        // E2: Hiệu ứng FadeInDown so le chỉ áp dụng cho 4 section đầu tiên trong lần nạp đầu
        if (!hasPlayedInitialAnimationRef.current && index < 4) {
          return (
            <Animated.View entering={FadeInDown.duration(320).delay(index * 60)}>
              {contentNode}
            </Animated.View>
          );
        }

        return contentNode;
      },
        [
          currentTrack?.id,
          playerState.isPlaying,
          handleTrackPress,
          handleTrackLongPress,
          handleArtistPress,
          handleAlbumPress,
          handleSeeAll,
          tracks,
          cardWidth,
          artistChipWidth,
          cardGap,
        ]
  );

  // E3: Hiệu ứng chuyển cảnh mờ dần mượt mà khi Skeleton kết thúc tải
  if (isLoading && !hasLoadedOnce) {
    return (
        <Animated.View
          style={[styles.container, { paddingTop: insets.top + spacing.xs }]}
          exiting={FadeOut.duration(200)}
        >
          <StatusBar barStyle="light-content" />
          <HomeSkeleton />
      </Animated.View >
    );
  }

  // B1: Trường hợp thư viện rỗng (chưa đồng bộ nhạc từ R2)
  if (!isLoading && tracks.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.xs }]}>
        <StatusBar barStyle="light-content" />
        <HomeGreeting title={greeting.title} subtitle={greeting.subtitle} />
        <View style={styles.emptyContainer}>
          <DiscIcon size={56} color={colors.borderLight} />
          <Text style={styles.emptyTitle}>Thư viện chưa có bài hát</Text>
          <Text style={styles.emptySubtitle}>
            Đồng bộ ngay với Cloudflare R2 để tải danh mục bài hát và trải nghiệm Trang chủ Beatify.
          </Text>
          <TouchableOpacity
            style={styles.syncButton}
            onPress={() => {
              haptics.tap();
              handleRefresh();
            }}
            disabled={isSyncing}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Đồng bộ thư viện"
          >
            <CloudSyncIcon size={18} color="#000000" />
            <Text style={styles.syncButtonText}>
              {isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ thư viện'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(250)} style={styles.container}>
      <StatusBar barStyle="light-content" />

      <Animated.View style={[{ flex: 1 }, listAnimStyle]}>
        <FlatList
          ref={flatListRef}
          data={sections}
          renderItem={renderSectionItem}
          keyExtractor={(item) => item.id}
          initialNumToRender={3}
          windowSize={7}
          removeClippedSubviews={true}
          maxToRenderPerBatch={4}
          ListHeaderComponent={
            <View>
              {/* E5: Lời chào chuẩn khung giờ + phụ đề ngắn gọn, có nút bánh răng mở Settings */}
              <HomeGreeting
                title={greeting.title}
                subtitle="Hôm nay bạn muốn nghe gì?"
              />

              {/* C4: Thông điệp Cold-start thân thiện, nhỏ gọn, không phô trương */}
              {recordCount === 0 && tracks.length > 0 && (
                <View style={styles.coldStartBanner}>
                  <Text style={styles.coldStartTitle}>Nghe nhạc để Beatify hiểu gu của bạn</Text>
                  <Text style={styles.coldStartSubtitle}>
                    Các danh mục đề xuất sẽ tự động điều chỉnh theo thói quen và khung giờ nghe của bạn.
                  </Text>
                </View>
              )}
            </View>
          }
          contentContainerStyle={[
            styles.listContent,
            {
              paddingTop: insets.top + spacing.xs,
              paddingBottom: contentPaddingBottom,
            },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isSyncing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.emptyContainer}>
                <DiscIcon size={48} color={colors.borderLight} />
                <Text style={styles.emptyTitle}>Chưa có nội dung đề xuất</Text>
                <Text style={styles.emptySubtitle}>
                  Kéo xuống để đồng bộ các bài hát từ Cloudflare R2 hoặc nghe một vài bài để kích hoạt trang chủ.
                </Text>
              </View>
            ) : null
          }
        />
      </Animated.View>

      {/* Menu thao tác bài hát (Action Sheet) */}
        <TrackActionSheet
          visible={actionSheetVisible}
          onClose={() => setActionSheetVisible(false)}
          track={selectedTrackForMenu}
          coverUrl={selectedTrackForMenu?.cover}
          isFavorite={Boolean(
            selectedTrackForMenu && userState.favoriteIds?.includes(selectedTrackForMenu.id)
          )}
          downloadStatus={
            selectedTrackForMenu
              ? isDownloading[selectedTrackForMenu.id]
                ? 'downloading'
                : isTrackOffline(selectedTrackForMenu.id)
                  ? 'downloaded'
                  : 'idle'
              : 'idle'
          }
          onPlayNext={(track) => {
            playNext(track);
            setActionSheetVisible(false);
          }}
          onToggleFavorite={(track) => {
            toggleFavorite(track.id);
            setActionSheetVisible(false);
          }}
          onAddToPlaylist={(track) => {
            setSelectedTrackForMenu(track);
            setActionSheetVisible(false);
            setAddToPlaylistVisible(true);
          }}
          onDownloadPress={(track) => {
            if (isTrackOffline(track.id)) {
              deleteOfflineTrack(track.id);
            } else {
              downloadTrack(track);
            }
            setActionSheetVisible(false);
          }}
        />

        {/* Modal chi tiết Album / Nghệ sĩ */}
        <CollectionDetailModal
          visible={collectionModal.visible}
          onClose={() => setCollectionModal((prev) => ({ ...prev, visible: false }))}
          title={collectionModal.title}
          subtitle={collectionModal.subtitle}
          coverUrl={collectionModal.coverUrl}
          tracks={collectionModal.tracks}
          type={collectionModal.type}
        />

        {/* Modal thêm bài hát vào danh sách phát */}
        <AddToPlaylistModal
          visible={addToPlaylistVisible}
          track={selectedTrackForMenu}
          userState={userState}
          onClose={() => setAddToPlaylistVisible(false)}
          onUpdateUserState={updateUserState}
        />
    </Animated.View >
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    flexGrow: 1,
  },
  coldStartBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  coldStartTitle: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  coldStartSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
    lineHeight: 20,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  syncButtonText: {
    fontSize: 14,
    color: '#000000',
    fontWeight: fontWeights.semibold,
  },
});
