import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  Alert,
  StyleSheet,
  Vibration,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Track, Playlist } from '@music-app/shared';
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
  PlaylistIcon,
  HeartIcon,
  PlusIcon,
  TrashIcon,
  CloseIcon,
  CheckIcon,
  ClockIcon,
} from '../../src/components/icons/SvgIcons';
import { CollectionDetailModal } from '../../src/components/CollectionDetailModal';

export default function PlaylistsScreen() {
  const insets = useSafeAreaInsets();
  const { contentPaddingBottom } = useTabBarMetrics();
  const { tracks, userState, updateUserState } = useLibrary();
  const { recentTracks, clearRecentTracks } = usePlayer();

  // State xem chi tiết bộ sưu tập (Favorites, Playlist hoặc Recently Played)
  const [selectedCollection, setSelectedCollection] = useState<{
    visible: boolean;
    title: string;
    subtitle?: string;
    tracks: Track[];
    type: 'playlist' | 'favorites' | 'recently_played';
    playlistId?: string;
  }>({
    visible: false,
    title: '',
    tracks: [],
    type: 'playlist',
  });

  // State tạo playlist mới
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');

  // Map nhanh trackId -> Track
  const tracksMap = useMemo(() => {
    const map = new Map<string, Track>();
    for (const t of tracks) {
      map.set(t.id, t);
    }
    return map;
  }, [tracks]);

  // Danh sách các bài hát yêu thích
  const favoriteTracks = useMemo(() => {
    return userState.favoriteIds
      .map((id) => tracksMap.get(id))
      .filter((t): t is Track => t !== undefined);
  }, [userState.favoriteIds, tracksMap]);

  // Mở chi tiết danh sách yêu thích
  const handleOpenFavorites = () => {
    Vibration.vibrate(10);
    setSelectedCollection({
      visible: true,
      title: 'Bài hát yêu thích',
      subtitle: `${favoriteTracks.length} bài hát đã thích`,
      tracks: favoriteTracks,
      type: 'favorites',
    });
  };

  // Mở chi tiết danh sách nghe gần đây
  const handleOpenRecentlyPlayed = () => {
    Vibration.vibrate(10);
    setSelectedCollection({
      visible: true,
      title: 'Nghe gần đây',
      subtitle: `${recentTracks.length} bài hát đã nghe`,
      tracks: recentTracks,
      type: 'recently_played',
    });
  };

  // Mở chi tiết một playlist cá nhân
  const handleOpenPlaylist = (playlist: Playlist) => {
    Vibration.vibrate(10);
    const playlistTracks = playlist.trackIds
      .map((id) => tracksMap.get(id))
      .filter((t): t is Track => t !== undefined);

    setSelectedCollection({
      visible: true,
      title: playlist.name,
      subtitle: playlist.description || `${playlistTracks.length} bài hát`,
      tracks: playlistTracks,
      type: 'playlist',
      playlistId: playlist.id,
    });
  };

  // Xóa một bài hát khỏi playlist cá nhân
  const handleRemoveTrackFromPlaylist = async (trackId: string) => {
    const playlistId = selectedCollection.playlistId;
    if (!playlistId) return;

    await updateUserState((prev) => {
      const updatedPlaylists = prev.playlists.map((pl) => {
        if (pl.id === playlistId) {
          return {
            ...pl,
            trackIds: pl.trackIds.filter((id) => id !== trackId),
          };
        }
        return pl;
      });
      return { ...prev, playlists: updatedPlaylists };
    });

    // Cập nhật lại state của modal đang mở
    setSelectedCollection((prev) => ({
      ...prev,
      tracks: prev.tracks.filter((t) => t.id !== trackId),
    }));
  };

  // Tạo playlist mới
  const handleCreatePlaylist = async () => {
    const trimmedTitle = newPlaylistTitle.trim();
    if (!trimmedTitle) {
      Alert.alert('Chưa nhập tên', 'Vui lòng nhập tên cho danh sách phát');
      return;
    }

    const nowIso = new Date().toISOString();
    const newPl: Playlist = {
      id: `pl-${Date.now()}`,
      name: trimmedTitle,
      description: newPlaylistDesc.trim() || undefined,
      trackIds: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await updateUserState((prev) => ({
      ...prev,
      playlists: [newPl, ...prev.playlists],
    }));

    setNewPlaylistTitle('');
    setNewPlaylistDesc('');
    setCreateModalVisible(false);
    Vibration.vibrate(15);
  };

  // Xóa một playlist
  const handleDeletePlaylist = (playlist: Playlist) => {
    Alert.alert(
      'Xóa danh sách phát',
      `Bạn có chắc chắn muốn xóa playlist "${playlist.name}" không?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            await updateUserState((prev) => ({
              ...prev,
              playlists: prev.playlists.filter((p) => p.id !== playlist.id),
            }));
          },
        },
      ]
    );
  };

  const renderPlaylistItem = ({ item }: { item: Playlist }) => {
    const trackCount = item.trackIds.length;

    return (
      <TouchableOpacity
        style={styles.playlistCard}
        onPress={() => handleOpenPlaylist(item)}
        activeOpacity={0.7}
      >
        <View style={styles.playlistIconBox}>
          <PlaylistIcon size={24} color={colors.primary} />
        </View>

        <View style={styles.playlistInfo}>
          <Text style={styles.playlistTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.playlistSubtitle} numberOfLines={1}>
            {trackCount} bài hát {item.description ? `• ${item.description}` : ''}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={(e) => {
            e.stopPropagation?.();
            handleDeletePlaylist(item);
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <TrashIcon size={16} color={colors.textTertiary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
        },
      ]}
    >
      {/* Header Tab Playlist */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Playlist</Text>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => setCreateModalVisible(true)}
          activeOpacity={0.8}
        >
          <PlusIcon size={18} color={colors.textDark} />
          <Text style={styles.createBtnText}>Tạo mới</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={userState.playlists}
        keyExtractor={(item) => item.id}
        renderItem={renderPlaylistItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: contentPaddingBottom },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerSection}>
            {/* Card Bài hát yêu thích cố định ở đầu */}
            <TouchableOpacity
              style={styles.favoriteCard}
              onPress={handleOpenFavorites}
              activeOpacity={0.8}
            >
              <View style={styles.favoriteIconBox}>
                <HeartIcon size={28} color={colors.textDark} fill={colors.textDark} />
              </View>
              <View style={styles.favoriteInfo}>
                <Text style={styles.favoriteTitle}>Bài hát yêu thích</Text>
                <Text style={styles.favoriteSubtitle}>
                  {favoriteTracks.length} bài hát • Danh sách tự động
                </Text>
              </View>
              <Text style={styles.chevronText}>→</Text>
            </TouchableOpacity>

            {/* Card Nghe gần đây cố định ở đầu */}
            <TouchableOpacity
              style={[
                styles.favoriteCard,
                {
                  backgroundColor: colors.surface,
                  marginTop: spacing.sm,
                  borderWidth: 1,
                  borderColor: colors.borderLight,
                },
              ]}
              onPress={handleOpenRecentlyPlayed}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.favoriteIconBox,
                  { backgroundColor: colors.surfaceElevated },
                ]}
              >
                <ClockIcon size={26} color={colors.primary} />
              </View>
              <View style={styles.favoriteInfo}>
                <Text style={[styles.favoriteTitle, { color: colors.textPrimary }]}>
                  Nghe gần đây
                </Text>
                <Text style={styles.favoriteSubtitle}>
                  {recentTracks.length} bài hát • Tự động ghi nhận
                </Text>
              </View>
              <Text style={styles.chevronText}>→</Text>
            </TouchableOpacity>

            <Text style={styles.sectionHeading}>DANH SÁCH PHÁT CỦA BẠN</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Chưa có danh sách phát nào</Text>
            <Text style={styles.emptySubtitle}>
              Bấm nút "Tạo mới" ở trên để tạo danh sách phát yêu thích của riêng bạn.
            </Text>
          </View>
        }
      />

      {/* Modal Xem chi tiết Collection (Favorites hoặc Playlist) */}
      <CollectionDetailModal
        visible={selectedCollection.visible}
        onClose={() => setSelectedCollection((prev) => ({ ...prev, visible: false }))}
        title={selectedCollection.title}
        subtitle={selectedCollection.subtitle}
        tracks={selectedCollection.tracks}
        type={selectedCollection.type}
        playlistId={selectedCollection.playlistId}
        onRemoveTrackFromPlaylist={handleRemoveTrackFromPlaylist}
        onClearRecentTracks={clearRecentTracks}
      />

      {/* Modal Tạo Playlist Mới */}
      <Modal
        visible={createModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCreateModalVisible(false)}
        >
          <View
            style={styles.dialogCard}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Tạo danh sách phát mới</Text>
              <TouchableOpacity
                onPress={() => setCreateModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <CloseIcon size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Tên danh sách phát *</Text>
            <TextInput
              style={styles.dialogInput}
              value={newPlaylistTitle}
              onChangeText={setNewPlaylistTitle}
              placeholder="Ví dụ: Nhạc chill đêm khuya..."
              placeholderTextColor={colors.textTertiary}
              autoFocus={true}
            />

            <Text style={styles.inputLabel}>Mô tả (tùy chọn)</Text>
            <TextInput
              style={styles.dialogInput}
              value={newPlaylistDesc}
              onChangeText={setNewPlaylistDesc}
              placeholder="Ghi chú thêm về playlist này..."
              placeholderTextColor={colors.textTertiary}
            />

            <View style={styles.dialogButtonsRow}>
              <TouchableOpacity
                style={styles.dialogCancelBtn}
                onPress={() => setCreateModalVisible(false)}
              >
                <Text style={styles.dialogCancelBtnText}>Hủy</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dialogSubmitBtn}
                onPress={handleCreatePlaylist}
              >
                <CheckIcon size={18} color={colors.textDark} />
                <Text style={styles.dialogSubmitBtnText}>Tạo ngay</Text>
              </TouchableOpacity>
            </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: fontSizes.headline,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  createBtnText: {
    color: colors.textDark,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.bold,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
  },
  headerSection: {
    paddingVertical: spacing.md,
  },
  favoriteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.lg,
  },
  favoriteIconBox: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  favoriteTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
  },
  favoriteSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.caption,
    marginTop: spacing.xxs,
  },
  chevronText: {
    color: colors.textTertiary,
    fontSize: fontSizes.titleLarge,
  },
  sectionHeading: {
    color: colors.textSecondary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  playlistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  playlistIconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistInfo: {
    flex: 1,
    marginLeft: spacing.md,
    marginRight: spacing.sm,
  },
  playlistTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
  },
  playlistSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.caption,
    marginTop: 2,
  },
  deleteBtn: {
    padding: spacing.xs,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.semibold,
  },
  emptySubtitle: {
    color: colors.textTertiary,
    fontSize: fontSizes.caption,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  dialogCard: {
    width: '100%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  dialogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  dialogTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
  },
  inputLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
    marginBottom: spacing.xs,
  },
  dialogInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  dialogButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  dialogCancelBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    minHeight: 40,
  },
  dialogCancelBtnText: {
    color: colors.textSecondary,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.medium,
  },
  dialogSubmitBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 40,
  },
  dialogSubmitBtnText: {
    color: colors.textDark,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.bold,
  },
});
