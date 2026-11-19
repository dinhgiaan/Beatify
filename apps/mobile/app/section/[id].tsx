import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  normalizeArtistKey,
  smartShuffle,
  type Track,
  type Album,
  type HomeArtistItem,
} from '@music-app/shared';
import { useHomeSections } from '../../src/hooks/useHomeSections';
import { useLibrary } from '../../src/context/LibraryContext';
import { usePlayer } from '../../src/context/PlayerContext';
import { useOffline } from '../../src/context/OfflineContext';
import { colors, spacing, radius, typography, fontWeights } from '../../src/theme';
import {
  PrevIcon,
  PlayIcon,
  ShuffleIcon,
  DiscIcon,
  MoreHorizontalIcon,
} from '../../src/components/icons/SvgIcons';
import { EqualizerIndicator } from '../../src/components/player/EqualizerIndicator';
import { TrackActionSheet } from '../../src/components/sheet/TrackActionSheet';
import { AddToPlaylistModal } from '../../src/components/AddToPlaylistModal';
import { CollectionDetailModal } from '../../src/components/CollectionDetailModal';
import { AlbumCard } from '../../src/components/home/AlbumCard';
import { ArtistChip } from '../../src/components/home/ArtistChip';
import { MiniPlayer } from '../../src/components/player/MiniPlayer';
import { haptics } from '../../src/lib/haptics';
import { formatTime } from '../../src/utils/formatTime';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Màn hình "Xem tất cả" danh sách section (Route ẩn app/section/[id].tsx)
 */
export default function SectionDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { sections, isLoading } = useHomeSections();
  const { tracks: allTracks, userState, toggleFavorite, updateUserState } = useLibrary();
  const { currentTrack, playerState, playQueue, playNext, togglePlay } = usePlayer();
  const { isTrackOffline, isDownloading, downloadTrack, deleteOfflineTrack } = useOffline();

  // State menu bài hát & modal
  const [selectedTrackForMenu, setSelectedTrackForMenu] = useState<Track | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [addToPlaylistVisible, setAddToPlaylistVisible] = useState(false);
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

  // B3: Riêng continue_listening trỏ tới màn hình recent.tsx hiện có
  useEffect(() => {
    if (id === 'continue_listening') {
      router.replace('/(tabs)/recent');
    }
  }, [id, router]);

  // Tìm section tương ứng theo id
  const section = useMemo(() => {
    return sections.find((s) => s.id === id);
  }, [sections, id]);

  const handleBack = useCallback(() => {
    haptics.tap();
    router.back();
  }, [router]);

  // Xử lý phát bài hát trong section
  const handleTrackPress = useCallback(
    (track: Track, sectionTracks: Track[]) => {
      haptics.tap();
      if (currentTrack?.id === track.id) {
        togglePlay();
      } else {
        const idx = sectionTracks.findIndex((t) => t.id === track.id);
        playQueue(sectionTracks, idx >= 0 ? idx : 0);
      }
    },
    [currentTrack?.id, togglePlay, playQueue]
  );

  const handlePlayAll = useCallback(
    (trackList: Track[]) => {
      if (trackList.length === 0) return;
      haptics.tap();
      playQueue(trackList, 0);
    },
    [playQueue]
  );

  const handleShuffleAll = useCallback(
    (trackList: Track[]) => {
      if (trackList.length === 0) return;
      haptics.tap();
      const shuffled = smartShuffle(trackList);
      playQueue(shuffled, 0);
    },
    [playQueue]
  );

  // Xử lý khi nhấn album
  const handleAlbumPress = useCallback(
    (album: Album) => {
      const albumTracks = (allTracks || []).filter((t) =>
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
    [allTracks]
  );

  // Xử lý khi nhấn nghệ sĩ
  const handleArtistPress = useCallback(
    (artistItem: HomeArtistItem) => {
      const normArtist = normalizeArtistKey(artistItem.artist);
      const artistTracks = (allTracks || []).filter(
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
    [allTracks]
  );

  if (!section && !isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
            <PrevIcon size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Chi tiết mục</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.notFoundContainer}>
          <DiscIcon size={48} color={colors.borderLight} />
          <Text style={styles.notFoundTitle}>Không tìm thấy danh sách</Text>
          <Text style={styles.notFoundSubtitle}>
            Mục này có thể đã thay đổi hoặc không còn bài hát phù hợp.
          </Text>
          <TouchableOpacity style={styles.backActionBtn} onPress={handleBack} activeOpacity={0.8}>
            <Text style={styles.backActionBtnText}>Quay lại Trang chủ</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* Header điều hướng */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.7}
          accessibilityLabel="Quay lại"
          accessibilityRole="button"
        >
          <PrevIcon size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {section?.title || 'Đang tải...'}
          </Text>
          {Boolean(section?.subtitle) && (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {section?.subtitle}
            </Text>
          )}
        </View>

        <View style={styles.headerSpacer} />
      </View>

      {/* Nội dung danh sách theo kind */}
      {section?.kind === 'tracks' && (
        <FlatList
          data={section.tracks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
          ListHeaderComponent={
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.primaryPlayBtn, { flex: 1, marginRight: spacing.sm }]}
                onPress={() => handlePlayAll(section.tracks)}
                activeOpacity={0.8}
              >
                <PlayIcon size={18} color="#000000" />
                <Text style={styles.primaryPlayBtnText}>Phát tất cả</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryPlayBtn, { flex: 1 }]}
                onPress={() => handleShuffleAll(section.tracks)}
                activeOpacity={0.8}
              >
                <ShuffleIcon size={18} color={colors.textPrimary} />
                <Text style={styles.secondaryPlayBtnText}>Trộn bài</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item, index }) => {
            const isCurrent = currentTrack?.id === item.id;
            return (
              <TouchableOpacity
                style={[styles.trackRow, isCurrent && styles.trackRowActive]}
                onPress={() => handleTrackPress(item, section.tracks)}
                activeOpacity={0.75}
              >
                <View style={styles.trackIndexWrapper}>
                  {isCurrent ? (
                    <EqualizerIndicator isPlaying={playerState.isPlaying} size={14} color={colors.primary} />
                  ) : (
                    <Text style={styles.trackIndexText} numberOfLines={1}>
                      {index + 1}
                    </Text>
                  )}
                </View>

                <View style={styles.trackCoverWrapper}>
                  {item.cover ? (
                    <Image
                      source={{ uri: item.cover }}
                      style={styles.trackCover}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View style={styles.trackCoverPlaceholder}>
                      <DiscIcon size={20} color={colors.borderLight} />
                    </View>
                  )}
                </View>

                <View style={styles.trackInfo}>
                  <Text style={[styles.trackTitle, isCurrent && styles.trackTitleActive]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.trackArtist} numberOfLines={1}>
                    {item.artist}
                  </Text>
                </View>

                <Text style={styles.trackDuration}>{formatTime(item.duration || 0)}</Text>

                <TouchableOpacity
                  style={styles.trackMoreBtn}
                  onPress={() => {
                    setSelectedTrackForMenu(item);
                    setActionSheetVisible(true);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MoreHorizontalIcon size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {section?.kind === 'albums' && (
        <FlatList
          data={section.albums}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={[styles.gridListContent, { paddingBottom: insets.bottom + 100 }]}
          renderItem={({ item }) => (
            <View style={styles.gridAlbumWrapper}>
              <AlbumCard album={item} onPress={handleAlbumPress} />
            </View>
          )}
        />
      )}

      {section?.kind === 'artists' && (
        <FlatList
          data={section.artists}
          keyExtractor={(item, index) => `${item.artist}-${index}`}
          numColumns={3}
          columnWrapperStyle={styles.artistColumnWrapper}
          contentContainerStyle={[styles.gridListContent, { paddingBottom: insets.bottom + 100 }]}
          renderItem={({ item }) => (
            <View style={styles.gridArtistWrapper}>
              <ArtistChip artist={item} onPress={handleArtistPress} />
            </View>
          )}
        />
      )}

      {/* Mini Player */}
      <View style={[styles.miniPlayerAnchor, { bottom: Math.max(insets.bottom, 12) }]}>
        <MiniPlayer />
      </View>

      {/* Action Sheet Menu */}
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

      {/* Modal Album / Nghệ sĩ */}
      <CollectionDetailModal
        visible={collectionModal.visible}
        onClose={() => setCollectionModal((prev) => ({ ...prev, visible: false }))}
        title={collectionModal.title}
        subtitle={collectionModal.subtitle}
        coverUrl={collectionModal.coverUrl}
        tracks={collectionModal.tracks}
        type={collectionModal.type}
      />

      {/* Modal Add to Playlist */}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  headerTitle: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerSpacer: {
    width: 38,
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  primaryPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    gap: spacing.xs,
  },
  primaryPlayBtnText: {
    ...typography.subheadline,
    color: '#000000',
    fontWeight: fontWeights.semibold,
  },
  secondaryPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.xs,
  },
  secondaryPlayBtnText: {
    ...typography.subheadline,
    color: colors.textPrimary,
    fontWeight: fontWeights.semibold,
  },
  listContent: {
    paddingTop: spacing.xs,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  trackRowActive: {
    backgroundColor: colors.surface,
  },
  trackIndexWrapper: {
    minWidth: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
    paddingHorizontal: 2,
  },
  trackIndexText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  trackCoverWrapper: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    marginRight: spacing.sm,
  },
  trackCover: {
    width: '100%',
    height: '100%',
  },
  trackCoverPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  trackTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: fontWeights.medium,
  },
  trackTitleActive: {
    color: colors.primary,
  },
  trackArtist: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  trackDuration: {
    ...typography.caption,
    color: colors.textMuted,
    marginRight: spacing.sm,
  },
  trackMoreBtn: {
    padding: spacing.xs,
  },
  gridListContent: {
    padding: spacing.lg,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  gridAlbumWrapper: {
    width: (SCREEN_WIDTH - spacing.lg * 2 - spacing.md) / 2,
  },
  artistColumnWrapper: {
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  gridArtistWrapper: {
    width: (SCREEN_WIDTH - spacing.lg * 2 - spacing.md * 2) / 3,
    alignItems: 'center',
  },
  miniPlayerAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  notFoundContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  notFoundTitle: {
    ...typography.headline,
    color: colors.textPrimary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  notFoundSubtitle: {
    ...typography.subheadline,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  backActionBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  backActionBtnText: {
    ...typography.subheadline,
    color: '#000000',
    fontWeight: fontWeights.semibold,
  },
});

