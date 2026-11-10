import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  Modal,
  Alert,
  Vibration,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Track, UpdateTrack } from '@music-app/shared';
import { useLibrary, usePlayer } from '../../src/context';
import { useTabBarMetrics } from '../../src/hooks/useTabBarMetrics';
import {
  colors,
  fontSizes,
  fontWeights,
  spacing,
  radius,
} from '../../src/theme';
import {
  DiscIcon,
  PlayIcon,
  PauseIcon,
  HeartIcon,
  EditIcon,
  TrashIcon,
  CloseIcon,
  PlaylistIcon,
} from '../../src/components/icons/SvgIcons';
import { formatTime } from '../../src/utils/formatTime';
import { EditTrackModal } from '../../src/components/EditTrackModal';
import { HiddenSettingsModal } from '../../src/components/HiddenSettingsModal';
import { CollectionDetailModal } from '../../src/components/CollectionDetailModal';

type LibrarySegment = 'songs' | 'albums' | 'artists';

/**
 * Màn hình Thư viện âm nhạc chính thức (Thiết kế lại Pha 3)
 * - Header lớn chuẩn iOS kèm nhấn giữ để mở Cài đặt ẩn
 * - Phân đoạn: Bài hát | Album | Nghệ sĩ
 * - Menu '...' cho từng bài: Thả tim, Sửa metadata (EditTrackModal), Xóa bài
 * - Kéo xuống làm mới (Pull-to-Refresh) đồng bộ Cloudflare R2
 */
export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const {
    tracks,
    albums,
    userState,
    updateUserState,
    isSyncing,
    syncLibrary,
    toggleFavorite,
    saveTrack,
    deleteTrack,
    fetchLyrics,
  } = useLibrary();

  const {
    currentTrack,
    playerState,
    skipToTrack,
    playQueue,
    togglePlay,
    handleTrackDeleted,
    recentTracks,
    clearRecentTracks,
  } = usePlayer();

  const { contentPaddingBottom } = useTabBarMetrics();

  const [activeSegment, setActiveSegment] = useState<LibrarySegment>('songs');
  const [selectedTrackForMenu, setSelectedTrackForMenu] = useState<Track | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [addToPlaylistModalVisible, setAddToPlaylistModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [hiddenSettingsVisible, setHiddenSettingsVisible] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<{
    visible: boolean;
    title: string;
    subtitle?: string;
    coverUrl?: string;
    tracks: Track[];
    type: 'album' | 'artist' | 'recently_played';
  }>({
    visible: false,
    title: '',
    tracks: [],
    type: 'album',
  });

  // Tính tổng thời lượng toàn bộ thư viện
  const totalDurationSec = useMemo(() => {
    return tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  }, [tracks]);

  // Nhóm bài hát theo Nghệ sĩ cho phân đoạn 'artists'
  const artistGroups = useMemo(() => {
    const map = new Map<string, Track[]>();
    for (const track of tracks) {
      const artist = track.artist || 'Chưa rõ nghệ sĩ';
      const existing = map.get(artist);
      if (existing) {
        existing.push(track);
      } else {
        map.set(artist, [track]);
      }
    }
    return Array.from(map.entries()).map(([artist, artistTracks]) => ({
      artist,
      tracks: artistTracks,
      trackCount: artistTracks.length,
      cover: artistTracks.find((t) => t.cover)?.cover,
    }));
  }, [tracks]);

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

  const handleOpenMenu = (e: { stopPropagation?: () => void }, item: Track) => {
    e.stopPropagation?.();
    setSelectedTrackForMenu(item);
    setActionSheetVisible(true);
  };

  const handleMenuFavorite = () => {
    if (selectedTrackForMenu) {
      toggleFavorite(selectedTrackForMenu.id);
      setActionSheetVisible(false);
    }
  };

  const handleMenuEdit = () => {
    if (selectedTrackForMenu) {
      const trackToEdit = selectedTrackForMenu;
      setActionSheetVisible(false);
      setEditingTrack(trackToEdit);
      setEditModalVisible(true);
    }
  };

  const handleOpenAddToPlaylist = () => {
    setActionSheetVisible(false);
    setAddToPlaylistModalVisible(true);
  };

  const handleSelectPlaylistToAdd = async (playlistId: string) => {
    if (!selectedTrackForMenu) return;
    const trackId = selectedTrackForMenu.id;
    const targetPlaylist = userState.playlists.find((p) => p.id === playlistId);
    if (!targetPlaylist) return;

    if (targetPlaylist.trackIds.includes(trackId)) {
      Alert.alert('Đã có trong danh sách', `Bài hát đã có sẵn trong playlist "${targetPlaylist.name}".`);
      return;
    }

    Vibration.vibrate(15);
    await updateUserState((prev) => ({
      ...prev,
      playlists: prev.playlists.map((pl) => {
        if (pl.id === playlistId) {
          return {
            ...pl,
            trackIds: [...pl.trackIds, trackId],
            updatedAt: new Date().toISOString(),
          };
        }
        return pl;
      }),
    }));

    setAddToPlaylistModalVisible(false);
    Alert.alert('Thành công', `Đã thêm "${selectedTrackForMenu.title}" vào playlist "${targetPlaylist.name}"!`);
  };

  const handleMenuDelete = () => {
    if (!selectedTrackForMenu) return;
    const trackToDelete = selectedTrackForMenu;
    setActionSheetVisible(false);

    Alert.alert(
      'Xóa bài hát',
      `Bạn có chắc chắn muốn xóa bài "${trackToDelete.title}" khỏi thư viện và đưa vào thùng rác trên Cloudflare R2?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa vĩnh viễn',
          style: 'destructive',
          onPress: async () => {
            await deleteTrack(trackToDelete.id, handleTrackDeleted);
          },
        },
      ]
    );
  };

  const handleSaveTrack = async (trackId: string, updates: UpdateTrack) => {
    await saveTrack(trackId, updates);
  };

  const handleDeleteFromModal = async (trackId: string) => {
    await deleteTrack(trackId, handleTrackDeleted);
  };

  const handleTitleLongPress = () => {
    Vibration.vibrate(20);
    setHiddenSettingsVisible(true);
  };

  // Render mục Bài hát
  const renderTrackItem = ({ item }: { item: Track }) => {
    const isCurrent = currentTrack?.id === item.id;
    const isFav = userState.favoriteIds.includes(item.id);

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
          <View style={styles.titleRow}>
            <Text
              style={[styles.titleText, isCurrent && styles.titleActive]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item.title}
            </Text>
            {isFav && <HeartIcon size={12} color={colors.primary} fill={colors.primary} />}
          </View>
          <Text style={styles.artistText} numberOfLines={1} ellipsizeMode="tail">
            {item.artist} {item.album ? `• ${item.album}` : ''}
          </Text>
        </View>

        {/* Nút ba chấm (...) mở menu thao tác */}
        <TouchableOpacity
          style={styles.moreButton}
          onPress={(e) => handleOpenMenu(e, item)}
          activeOpacity={0.6}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={`Tùy chọn cho bài ${item.title}`}
        >
          <Text style={styles.moreButtonText}>•••</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // Render mục Album
  const renderAlbumItem = ({ item }: { item: (typeof albums)[0] }) => {
    const albumTracks = tracks.filter((t) => t.album === item.title);
    return (
      <TouchableOpacity
        style={styles.albumItem}
        activeOpacity={0.7}
        onPress={() => {
          Vibration.vibrate(10);
          setSelectedCollection({
            visible: true,
            title: item.title,
            subtitle: `${item.artist} • ${albumTracks.length} bài hát`,
            coverUrl: item.cover,
            tracks: albumTracks,
            type: 'album',
          });
        }}
      >
        <View style={styles.albumCoverWrapper}>
          {item.cover ? (
            <Image source={{ uri: item.cover }} style={styles.coverImage} resizeMode="cover" />
          ) : (
            <View style={styles.coverPlaceholder}>
              <DiscIcon size={32} color={colors.borderLight} />
            </View>
          )}
        </View>
        <Text style={styles.albumTitleText} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.albumSubtitleText} numberOfLines={1}>
          {item.artist} • {albumTracks.length} bài
        </Text>
      </TouchableOpacity>
    );
  };

  // Render mục Nghệ sĩ
  const renderArtistItem = ({ item }: { item: (typeof artistGroups)[0] }) => {
    return (
      <TouchableOpacity
        style={styles.artistItem}
        activeOpacity={0.7}
        onPress={() => {
          Vibration.vibrate(10);
          setSelectedCollection({
            visible: true,
            title: item.artist,
            subtitle: `${item.trackCount} bài hát trong thư viện`,
            coverUrl: item.cover,
            tracks: item.tracks,
            type: 'artist',
          });
        }}
      >
        <View style={styles.artistAvatarWrapper}>
          {item.cover ? (
            <Image source={{ uri: item.cover }} style={styles.coverImage} resizeMode="cover" />
          ) : (
            <View style={styles.coverPlaceholder}>
              <DiscIcon size={24} color={colors.borderLight} />
            </View>
          )}
        </View>
        <View style={styles.artistInfoWrapper}>
          <Text style={styles.artistNameText} numberOfLines={1}>
            {item.artist}
          </Text>
          <Text style={styles.artistSubText} numberOfLines={1}>
            {item.trackCount} bài hát
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header Thư viện: Nhấn giữ mở Cài đặt ẩn */}
      <View style={styles.header}>
        <TouchableOpacity
          onLongPress={handleTitleLongPress}
          delayLongPress={600}
          activeOpacity={0.9}
        >
          <Text style={styles.headerTitle}>Thư viện</Text>
        </TouchableOpacity>

        <Text style={styles.headerStatsText}>
          {tracks.length} bài hát • {formatTime(totalDurationSec)}
        </Text>

        {/* Thanh chọn phân đoạn Segmented Control */}
        <View style={styles.segmentContainer}>
          <TouchableOpacity
            style={[
              styles.segmentButton,
              activeSegment === 'songs' && styles.segmentButtonActive,
            ]}
            onPress={() => setActiveSegment('songs')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.segmentText,
                activeSegment === 'songs' && styles.segmentTextActive,
              ]}
            >
              Bài hát
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentButton,
              activeSegment === 'albums' && styles.segmentButtonActive,
            ]}
            onPress={() => setActiveSegment('albums')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.segmentText,
                activeSegment === 'albums' && styles.segmentTextActive,
              ]}
            >
              Album ({albums.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentButton,
              activeSegment === 'artists' && styles.segmentButtonActive,
            ]}
            onPress={() => setActiveSegment('artists')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.segmentText,
                activeSegment === 'artists' && styles.segmentTextActive,
              ]}
            >
              Nghệ sĩ ({artistGroups.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Nội dung danh sách theo phân đoạn đã chọn */}
      {activeSegment === 'songs' ? (
        <FlatList
          data={tracks}
          keyExtractor={(item) => item.id}
          renderItem={renderTrackItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: contentPaddingBottom },
          ]}
          ListHeaderComponent={
            recentTracks.length > 0 ? (
              <View style={styles.recentSection}>
                <View style={styles.recentHeaderRow}>
                  <Text style={styles.recentSectionTitle}>VỪA NGHE GẦN ĐÂY</Text>
                  <TouchableOpacity
                    onPress={() => {
                      Vibration.vibrate(10);
                      setSelectedCollection({
                        visible: true,
                        title: 'Nghe gần đây',
                        subtitle: `${recentTracks.length} bài hát`,
                        tracks: recentTracks,
                        type: 'recently_played',
                      });
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.recentSeeAllText}>
                      Xem tất cả ({recentTracks.length})
                    </Text>
                  </TouchableOpacity>
                </View>

                <FlatList
                  data={recentTracks}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(item) => `recent-${item.id}`}
                  contentContainerStyle={styles.recentHorizontalList}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.recentCard}
                      onPress={() => {
                        Vibration.vibrate(10);
                        const idx = recentTracks.findIndex((t) => t.id === item.id);
                        playQueue(recentTracks, idx >= 0 ? idx : 0);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.recentCoverBox}>
                        {item.cover ? (
                          <Image
                            source={{ uri: item.cover }}
                            style={styles.recentCoverImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <DiscIcon size={32} color={colors.borderLight} />
                        )}
                      </View>
                      <Text style={styles.recentTrackTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.recentTrackArtist} numberOfLines={1}>
                        {item.artist || 'Chưa rõ nghệ sĩ'}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
                <Text style={[styles.recentSectionTitle, { marginTop: spacing.md }]}>
                  TẤT CẢ BÀI HÁT ({tracks.length})
                </Text>
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={isSyncing}
              onRefresh={syncLibrary}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <DiscIcon size={48} color={colors.borderLight} />
              <Text style={styles.emptyText}>Thư viện chưa có bài hát nào</Text>
              <Text style={styles.emptySubText}>
                Kéo xuống để đồng bộ bài hát từ Cloudflare R2 hoặc dùng Web Dashboard để nhập nhạc.
              </Text>
            </View>
          }
        />
      ) : activeSegment === 'albums' ? (
        <FlatList
          data={albums}
          keyExtractor={(item) => item.id}
          renderItem={renderAlbumItem}
          numColumns={2}
          columnWrapperStyle={styles.albumColumnWrapper}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: contentPaddingBottom },
          ]}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <DiscIcon size={48} color={colors.borderLight} />
              <Text style={styles.emptyText}>Chưa có Album nào</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={artistGroups}
          keyExtractor={(item) => item.artist}
          renderItem={renderArtistItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: contentPaddingBottom },
          ]}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <DiscIcon size={48} color={colors.borderLight} />
              <Text style={styles.emptyText}>Chưa có Nghệ sĩ nào</Text>
            </View>
          }
        />
      )}

      {/* Action Sheet Menu '...' cho bài hát */}
      <Modal
        visible={actionSheetVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setActionSheetVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setActionSheetVisible(false)}
        >
          <View style={styles.sheetContainer}>
            {selectedTrackForMenu && (
              <>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle} numberOfLines={1}>
                    {selectedTrackForMenu.title}
                  </Text>
                  <Text style={styles.sheetSubtitle} numberOfLines={1}>
                    {selectedTrackForMenu.artist}
                  </Text>
                </View>

                {/* Nút Thả tim */}
                <TouchableOpacity
                  style={styles.sheetActionBtn}
                  onPress={handleMenuFavorite}
                  activeOpacity={0.7}
                >
                  <HeartIcon
                    size={20}
                    color={
                      userState.favoriteIds.includes(selectedTrackForMenu.id)
                        ? colors.primary
                        : colors.textSecondary
                    }
                    fill={
                      userState.favoriteIds.includes(selectedTrackForMenu.id)
                        ? colors.primary
                        : 'none'
                    }
                  />
                  <Text style={styles.sheetActionText}>
                    {userState.favoriteIds.includes(selectedTrackForMenu.id)
                      ? 'Xóa khỏi danh sách yêu thích'
                      : 'Thêm vào danh sách yêu thích'}
                  </Text>
                </TouchableOpacity>

                {/* Nút Thêm vào Playlist */}
                <TouchableOpacity
                  style={styles.sheetActionBtn}
                  onPress={handleOpenAddToPlaylist}
                  activeOpacity={0.7}
                >
                  <PlaylistIcon size={20} color={colors.textPrimary} />
                  <Text style={styles.sheetActionText}>Thêm vào danh sách phát...</Text>
                </TouchableOpacity>

                {/* Nút Chỉnh sửa */}
                <TouchableOpacity
                  style={styles.sheetActionBtn}
                  onPress={handleMenuEdit}
                  activeOpacity={0.7}
                >
                  <EditIcon size={20} color={colors.textPrimary} />
                  <Text style={styles.sheetActionText}>Chỉnh sửa thông tin bài hát</Text>
                </TouchableOpacity>

                {/* Nút Xóa bài */}
                <TouchableOpacity
                  style={styles.sheetActionBtn}
                  onPress={handleMenuDelete}
                  activeOpacity={0.7}
                >
                  <TrashIcon size={20} color={colors.dangerLight} />
                  <Text style={[styles.sheetActionText, styles.sheetActionDeleteText]}>
                    Xóa bài hát khỏi thư viện
                  </Text>
                </TouchableOpacity>

                {/* Nút Đóng */}
                <TouchableOpacity
                  style={styles.sheetCancelBtn}
                  onPress={() => setActionSheetVisible(false)}
                  activeOpacity={0.8}
                >
                  <CloseIcon size={18} color={colors.textSecondary} />
                  <Text style={styles.sheetCancelBtnText}>Đóng</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal Chỉnh sửa bài hát (tái dùng EditTrackModal) */}
      <EditTrackModal
        visible={editModalVisible}
        track={editingTrack}
        onClose={() => setEditModalVisible(false)}
        onSave={handleSaveTrack}
        onDelete={handleDeleteFromModal}
        onFetchLyrics={fetchLyrics}
      />

      {/* Modal Cài đặt ẩn & Kỹ thuật (Beatify Hidden Settings) */}
      <HiddenSettingsModal
        visible={hiddenSettingsVisible}
        onClose={() => setHiddenSettingsVisible(false)}
      />

      {/* Modal Chi tiết Album / Nghệ sĩ */}
      <CollectionDetailModal
        visible={selectedCollection.visible}
        onClose={() => setSelectedCollection((prev) => ({ ...prev, visible: false }))}
        title={selectedCollection.title}
        subtitle={selectedCollection.subtitle}
        coverUrl={selectedCollection.coverUrl}
        tracks={selectedCollection.tracks}
        type={selectedCollection.type}
        onClearRecentTracks={clearRecentTracks}
      />

      {/* Modal Chọn danh sách phát để thêm bài */}
      <Modal
        visible={addToPlaylistModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setAddToPlaylistModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setAddToPlaylistModalVisible(false)}
        >
          <View style={styles.playlistPickerCard} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Thêm vào playlist</Text>
              <Text style={styles.sheetSubtitle}>
                {selectedTrackForMenu ? selectedTrackForMenu.title : ''}
              </Text>
            </View>

            {userState.playlists.length === 0 ? (
              <View style={styles.emptyPlaylistPicker}>
                <Text style={styles.emptyPlaylistText}>
                  Bạn chưa có danh sách phát nào. Hãy chuyển qua Tab Playlist để tạo mới.
                </Text>
              </View>
            ) : (
              <FlatList
                data={userState.playlists}
                keyExtractor={(item) => item.id}
                style={styles.playlistPickerList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.playlistPickerItem}
                    onPress={() => handleSelectPlaylistToAdd(item.id)}
                    activeOpacity={0.7}
                  >
                    <PlaylistIcon size={20} color={colors.primary} />
                    <View style={styles.playlistPickerInfo}>
                      <Text style={styles.playlistPickerName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.playlistPickerCount}>
                        {item.trackIds.length} bài hát
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}

            <TouchableOpacity
              style={styles.sheetCancelBtn}
              onPress={() => setAddToPlaylistModalVisible(false)}
            >
              <Text style={styles.sheetCancelBtnText}>Hủy</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  headerStatsText: {
    fontSize: fontSizes.caption,
    color: colors.textTertiary,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  segmentButtonActive: {
    backgroundColor: colors.surface,
  },
  segmentText: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.medium,
    color: colors.textTertiary,
  },
  segmentTextActive: {
    color: colors.textPrimary,
    fontWeight: fontWeights.semibold,
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  titleText: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  titleActive: {
    color: colors.primary,
  },
  artistText: {
    fontSize: fontSizes.subhead,
    color: colors.textSecondary,
    marginTop: 2,
  },
  moreButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.xs,
  },
  moreButtonText: {
    fontSize: fontSizes.subheading,
    fontWeight: fontWeights.bold,
    color: colors.textTertiary,
    letterSpacing: 1.5,
  },
  albumColumnWrapper: {
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.md,
  },
  albumItem: {
    width: '48%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  albumCoverWrapper: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    marginBottom: spacing.xs,
  },
  albumTitleText: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  albumSubtitleText: {
    fontSize: fontSizes.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  artistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  artistAvatarWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    marginRight: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  artistInfoWrapper: {
    flex: 1,
  },
  artistNameText: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  artistSubText: {
    fontSize: fontSizes.caption,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.backgroundElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  sheetHeader: {
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  sheetSubtitle: {
    fontSize: fontSizes.subhead,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sheetActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  sheetActionText: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.medium,
    color: colors.textPrimary,
  },
  sheetActionDeleteText: {
    color: colors.dangerLight,
  },
  sheetCancelBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  sheetCancelBtnText: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  playlistPickerCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: 400,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  playlistPickerList: {
    maxHeight: 240,
  },
  playlistPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDivider,
    gap: spacing.md,
  },
  playlistPickerInfo: {
    flex: 1,
  },
  playlistPickerName: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.medium,
  },
  playlistPickerCount: {
    color: colors.textSecondary,
    fontSize: fontSizes.caption,
    marginTop: 2,
  },
  emptyPlaylistPicker: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  emptyPlaylistText: {
    color: colors.textSecondary,
    fontSize: fontSizes.subhead,
    textAlign: 'center',
    lineHeight: 18,
  },
  recentSection: {
    marginBottom: spacing.sm,
  },
  recentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  recentSectionTitle: {
    color: colors.textTertiary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.5,
  },
  recentSeeAllText: {
    color: colors.primary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
  },
  recentHorizontalList: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  recentCard: {
    width: 104,
    marginRight: spacing.xs,
  },
  recentCoverBox: {
    width: 104,
    height: 104,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  recentCoverImage: {
    width: '100%',
    height: '100%',
  },
  recentTrackTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
  },
  recentTrackArtist: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
});
