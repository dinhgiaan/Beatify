import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Text,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { colors, spacing, radius, typography, fontWeights } from '../../src/theme';
import {
  HomeGreeting,
  TrackCard,
  TRACK_CARD_WIDTH,
  AlbumCard,
  ALBUM_CARD_WIDTH,
  ArtistChip,
  ARTIST_CHIP_WIDTH,
  QuickPickGrid,
  SectionRow,
  HomeSkeleton,
} from '../../src/components/home';
import { DiscIcon, CloudSyncIcon } from '../../src/components/icons/SvgIcons';
import { TrackActionSheet } from '../../src/components/sheet/TrackActionSheet';
import { CollectionDetailModal } from '../../src/components/CollectionDetailModal';
import { AddToPlaylistModal } from '../../src/components/AddToPlaylistModal';
import { haptics } from '../../src/lib/haptics';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { contentPaddingBottom } = useTabBarMetrics();
  const { tracks, syncLibrary, isSyncing, userState, toggleFavorite, updateUserState } = useLibrary();
  const { currentTrack, playerState, playQueue, playNext, togglePlay } = usePlayer();
  const { isTrackOffline, isDownloading, downloadTrack, deleteOfflineTrack } = useOffline();

  const { sections, greeting, isLoading, hasLoadedOnce, recordCount, reload } = useHomeSections();

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

  // B3: Điều hướng Xem tất cả
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

  // Kéo xuống để đồng bộ thư viện và nạp lại trang chủ
  const handleRefresh = useCallback(async () => {
    await Promise.all([syncLibrary(), reload()]);
  }, [syncLibrary, reload]);

  // Render từng section tùy biến theo kind và layout (Switch Exhaustive)
  const renderSectionItem = useCallback(
    ({ item: section }: { item: HomeSection }) => {
      switch (section.kind) {
        case 'tracks':
          if (section.layout === 'grid') {
            return (
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
          }

          return (
            <SectionRow<Track>
              title={section.title}
              subtitle={section.subtitle}
              data={section.tracks}
              itemWidth={TRACK_CARD_WIDTH}
              keyExtractor={(t) => t.id}
              onSeeAll={() => handleSeeAll(section.id)}
              renderItem={({ item }) => (
                <TrackCard
                  track={item}
                  isCurrent={currentTrack?.id === item.id}
                  isPlaying={playerState.isPlaying}
                  onPress={(t) => handleTrackPress(t, section.tracks)}
                  onLongPress={handleTrackLongPress}
                />
              )}
            />
          );

        case 'artists':
          return (
            <SectionRow<HomeArtistItem>
              title={section.title}
              subtitle={section.subtitle}
              data={section.artists}
              itemWidth={ARTIST_CHIP_WIDTH}
              keyExtractor={(a, index) => `${a.artist}-${index}`}
              onSeeAll={() => handleSeeAll(section.id)}
              renderItem={({ item }) => (
                <ArtistChip artist={item} onPress={handleArtistPress} />
              )}
            />
          );

        case 'albums':
          return (
            <SectionRow<Album>
              title={section.title}
              subtitle={section.subtitle}
              data={section.albums}
              itemWidth={ALBUM_CARD_WIDTH}
              keyExtractor={(alb) => alb.id}
              onSeeAll={() => handleSeeAll(section.id)}
              renderItem={({ item }) => {
                // A4: Xác nhận bìa Album tương thích với library.tsx (fallback bài đầu tiên)
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
                    onPress={handleAlbumPress}
                  />
                );
              }}
            />
          );

        default: {
          const exhaustiveCheck: never = section;
          return exhaustiveCheck;
        }
      }
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
    ]
  );

  // B2: Hiển thị Skeleton khi tải lần đầu
  if (isLoading && !hasLoadedOnce) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.xs }]}>
        <StatusBar barStyle="light-content" />
        <HomeSkeleton />
      </View>
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
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <FlatList
        data={sections}
        renderItem={renderSectionItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <HomeGreeting title={greeting.title} subtitle={greeting.subtitle} />

            {/* B1: Thông điệp Cold-start thân thiện khi chưa có lịch sử nghe */}
            {recordCount === 0 && tracks.length > 0 && (
              <View style={styles.coldStartBanner}>
                <Text style={styles.coldStartTitle}>Nghe nhạc để Beatify hiểu gu của bạn ✨</Text>
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
    </View>
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
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  coldStartTitle: {
    ...typography.subheadline,
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  coldStartSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: 80,
  },
  emptyTitle: {
    ...typography.headline,
    color: colors.textPrimary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.subheadline,
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
    ...typography.subheadline,
    color: '#000000',
    fontWeight: fontWeights.semibold,
  },
});
