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
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import type { Track, Playlist } from '@music-app/shared';
import { useLibrary } from '../../src/context';
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
  PlusIcon,
  TrashIcon,
  CloseIcon,
  CheckIcon,
  EditIcon,
} from '../../src/components/icons/SvgIcons';
import { CollectionDetailModal } from '../../src/components/CollectionDetailModal';

export default function PlaylistsScreen() {
  const insets = useSafeAreaInsets();
  const { contentPaddingBottom } = useTabBarMetrics();
  const { tracks, userState, updateUserState } = useLibrary();

    // State xem chi tiết playlist
    const [selectedPlaylist, setSelectedPlaylist] = useState<{
      visible: boolean;
      title: string;
      subtitle?: string;
      tracks: Track[];
      type: 'playlist';
      playlistId?: string;
    }>({
      visible: false,
      title: '',
      tracks: [],
      type: 'playlist',
    });

    // State tạo / chỉnh sửa playlist
    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
    const [playlistTitle, setPlaylistTitle] = useState('');
    const [playlistDesc, setPlaylistDesc] = useState('');
    const [playlistCover, setPlaylistCover] = useState<string | undefined>(undefined);

    // Map nhanh trackId -> Track
    const tracksMap = useMemo(() => {
      const map = new Map<string, Track>();
      for (const t of tracks) {
        map.set(t.id, t);
      }
      return map;
    }, [tracks]);

    // Mở chi tiết playlist
    const handleOpenPlaylist = (playlist: Playlist) => {
      Vibration.vibrate(10);
      const playlistTracks = playlist.trackIds
        .map((id) => tracksMap.get(id))
        .filter((t): t is Track => t !== undefined);

        setSelectedPlaylist({
          visible: true,
          title: playlist.name,
        subtitle: playlist.description || `${playlistTracks.length} bài hát`,
        tracks: playlistTracks,
        type: 'playlist',
        playlistId: playlist.id,
      });
    };

    // Xóa một bài hát khỏi playlist
    const handleRemoveTrackFromPlaylist = async (trackId: string) => {
      const playlistId = selectedPlaylist.playlistId;
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

        setSelectedPlaylist((prev) => ({
          ...prev,
          tracks: prev.tracks.filter((t) => t.id !== trackId),
        }));
};

  // Chọn ảnh bìa playlist từ thư viện ảnh máy
  const handlePickCover = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        setPlaylistCover(result.assets[0].uri);
        Vibration.vibrate(10);
      }
    } catch (err) {
      Alert.alert('Không thể mở thư viện ảnh', String(err));
    }
  };

  // Xóa ảnh bìa playlist đang chọn
  const handleRemoveCover = () => {
    setPlaylistCover(undefined);
    Vibration.vibrate(10);
  };

  // Mở modal tạo mới
  const handleOpenCreate = () => {
    setEditingPlaylist(null);
    setPlaylistTitle('');
    setPlaylistDesc('');
    setPlaylistCover(undefined);
    setCreateModalVisible(true);
  };

  // Mở modal chỉnh sửa playlist đã có
  const handleOpenEdit = (playlist: Playlist) => {
    setEditingPlaylist(playlist);
    setPlaylistTitle(playlist.name);
    setPlaylistDesc(playlist.description || '');
    setPlaylistCover(playlist.coverUrl);
    setCreateModalVisible(true);
  };

  // Lưu playlist (Tạo mới hoặc Cập nhật)
  const handleSavePlaylist = async () => {
    const trimmedTitle = playlistTitle.trim();
    if (!trimmedTitle) {
      Alert.alert('Chưa nhập tên', 'Vui lòng nhập tên cho danh sách phát');
      return;
    }

    const nowIso = new Date().toISOString();

    if (editingPlaylist) {
      // Cập nhật playlist đã có
      await updateUserState((prev) => ({
        ...prev,
        playlists: prev.playlists.map((p) => {
          if (p.id === editingPlaylist.id) {
            return {
              ...p,
              name: trimmedTitle,
              description: playlistDesc.trim() || undefined,
              coverUrl: playlistCover,
              updatedAt: nowIso,
            };
          }
          return p;
        }),
      }));
    } else {
      // Tạo mới
      const newPl: Playlist = {
        id: `pl-${Date.now()}`,
        name: trimmedTitle,
        description: playlistDesc.trim() || undefined,
        coverUrl: playlistCover,
        trackIds: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await updateUserState((prev) => ({
        ...prev,
        playlists: [newPl, ...prev.playlists],
      }));
    }

    setPlaylistTitle('');
    setPlaylistDesc('');
    setPlaylistCover(undefined);
    setEditingPlaylist(null);
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
          {/* Ảnh bìa playlist (custom coverUrl hoặc icon mặc định) */}
          <View style={styles.playlistCoverBox}>
            {item.coverUrl ? (
              <Image
                source={{ uri: item.coverUrl }}
                style={styles.playlistCoverImage}
                resizeMode="cover"
              />
            ) : (
              <PlaylistIcon size={24} color={colors.primary} />
            )}
          </View>

          <View style={styles.playlistInfo}>
            <Text style={styles.playlistTitle} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.playlistSubtitle} numberOfLines={1}>
              {trackCount} bài hát {item.description ? `• ${item.description}` : ''}
            </Text>
          </View>

          {/* Nút sửa ảnh bìa & thông tin */}
          <TouchableOpacity
            style={styles.actionIconBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              handleOpenEdit(item);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Chỉnh sửa playlist"
          >
            <EditIcon size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Nút xóa playlist */}
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              handleDeletePlaylist(item);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Xóa playlist"
          >
            <TrashIcon size={16} color={colors.textTertiary} />
          </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header Tab Playlist */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandBadge}>
              <Text style={styles.brandBadgeText}>BEATIFY</Text>
            </View>
          </View>
          <View style={styles.headerTitleRow}>
            <View>
              <Text style={styles.headerTitle}>Playlist</Text>
              <Text style={styles.headerSubtitle}>
                {userState.playlists.length} danh sách phát cá nhân
              </Text>
            </View>
            <TouchableOpacity
              style={styles.createBtn}
              onPress={handleOpenCreate}
              activeOpacity={0.8}
            >
              <PlusIcon size={16} color={colors.textDark} />
              <Text style={styles.createBtnText}>Tạo mới</Text>
            </TouchableOpacity>
          </View>
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
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <PlaylistIcon size={34} color={colors.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>Chưa có danh sách phát nào</Text>
              <Text style={styles.emptySubtitle}>
                Bấm nút &quot;Tạo mới&quot; ở trên để tạo danh sách phát và thêm ảnh bìa riêng của bạn.
              </Text>
            </View>
          }
        />

        {/* Modal Xem chi tiết Playlist */}
        <CollectionDetailModal
          visible={selectedPlaylist.visible}
          onClose={() => setSelectedPlaylist((prev) => ({ ...prev, visible: false }))}
          title={selectedPlaylist.title}
          subtitle={selectedPlaylist.subtitle}
          tracks={selectedPlaylist.tracks}
          type={selectedPlaylist.type}
          playlistId={selectedPlaylist.playlistId}
          onRemoveTrackFromPlaylist={handleRemoveTrackFromPlaylist}
        />

        {/* Modal Tạo mới / Chỉnh sửa Playlist (kèm chọn ảnh bìa) */}
        <Modal
          visible={createModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setCreateModalVisible(false)}
        >
                <View style={styles.modalOverlay}>
                  <View style={styles.modalBox}>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>
                        {editingPlaylist ? 'Chỉnh sửa Playlist' : 'Tạo Playlist mới'}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setCreateModalVisible(false)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <CloseIcon size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>

                    {/* Chọn ảnh bìa cho Playlist */}
                    <View style={styles.coverPickerSection}>
                      <TouchableOpacity
                        style={styles.coverPreviewBox}
                        onPress={handlePickCover}
                        activeOpacity={0.8}
                      >
                        {playlistCover ? (
                          <Image source={{ uri: playlistCover }} style={styles.coverPreviewImage} />
                        ) : (
                          <View style={styles.coverPlaceholder}>
                            <PlusIcon size={24} color={colors.primary} />
                            <Text style={styles.coverPlaceholderText}>Thêm ảnh bìa</Text>
                          </View>
                        )}
                      </TouchableOpacity>

                      <View style={styles.coverActionButtons}>
                        <TouchableOpacity
                          style={styles.coverActionBtn}
                          onPress={handlePickCover}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.coverActionBtnText}>
                            {playlistCover ? 'Đổi ảnh khác' : 'Chọn ảnh từ máy'}
                          </Text>
                        </TouchableOpacity>

                        {playlistCover && (
                          <TouchableOpacity
                            style={[styles.coverActionBtn, styles.coverRemoveBtn]}
                            onPress={handleRemoveCover}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.coverRemoveBtnText}>Xóa ảnh bìa</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    <TextInput
                      style={styles.input}
                      placeholder="Tên danh sách phát (ví dụ: Acoustic Chill...)"
                      placeholderTextColor={colors.textTertiary}
                      value={playlistTitle}
                      onChangeText={setPlaylistTitle}
                      autoFocus={!editingPlaylist}
                      maxLength={60}
                    />

                    <TextInput
                      style={[styles.input, styles.descInput]}
                      placeholder="Mô tả danh sách phát (tùy chọn)"
                      placeholderTextColor={colors.textTertiary}
                      value={playlistDesc}
                      onChangeText={setPlaylistDesc}
                      multiline={true}
                      numberOfLines={3}
                      maxLength={150}
                    />

                      <View style={styles.modalActions}>
                        <TouchableOpacity
                          style={styles.modalCancelBtn}
                          onPress={() => setCreateModalVisible(false)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.modalCancelText}>Hủy</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.modalSaveBtn}
                          onPress={handleSavePlaylist}
                          activeOpacity={0.8}
                        >
                          <CheckIcon size={16} color={colors.textDark} />
                          <Text style={styles.modalSaveText}>
                            {editingPlaylist ? 'Lưu thay đổi' : 'Tạo ngay'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                </View>
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
              paddingHorizontal: spacing.xl,
            paddingTop: spacing.xs,
            paddingBottom: spacing.md,
  },
            brandRow: {
              marginBottom: spacing.xs,
  },
            brandBadge: {
              alignSelf: 'flex-start',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.12)',
            paddingHorizontal: spacing.sm,
            paddingVertical: 2,
            borderRadius: radius.pill,
  },
            brandBadgeText: {
              fontSize: 9.5,
            fontWeight: fontWeights.bold,
            color: colors.primary,
            letterSpacing: 1.5,
  },
            headerTitleRow: {
              flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
  },
            headerTitle: {
            fontSize: 26,
            fontWeight: fontWeights.extrabold,
            color: colors.textPrimary,
            letterSpacing: -0.5,
  },
            headerSubtitle: {
              fontSize: fontSizes.captionLarge,
            color: colors.textTertiary,
            marginTop: 2,
  },
            createBtn: {
              flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.primary,
            paddingHorizontal: spacing.md,
            paddingVertical: 8,
            borderRadius: radius.pill,
            gap: 4,
  },
            createBtnText: {
              color: colors.textDark,
            fontSize: fontSizes.captionLarge,
            fontWeight: fontWeights.bold,
  },
            listContent: {
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.sm,
            gap: spacing.md,
  },
              playlistCard: {
              flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            padding: spacing.md,
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.06)',
  },
              playlistCoverBox: {
              width: 52,
            height: 52,
            borderRadius: radius.lg,
            backgroundColor: colors.surfaceElevated,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: spacing.md,
            overflow: 'hidden',
  },
            playlistCoverImage: {
              width: '100%',
            height: '100%',
  },
            playlistInfo: {
              flex: 1,
            minWidth: 0,
  },
            playlistTitle: {
              color: colors.textPrimary,
            fontSize: fontSizes.titleSmall,
            fontWeight: fontWeights.bold,
            marginBottom: 3,
  },
            playlistSubtitle: {
            color: colors.textTertiary,
            fontSize: fontSizes.captionLarge,
  },
            actionIconBtn: {
              padding: spacing.sm,
            marginRight: 2,
  },
            deleteBtn: {
            padding: spacing.sm,
  },
            emptyContainer: {
              alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: spacing.xxxl * 2,
            paddingHorizontal: spacing.xl,
  },
            emptyIconCircle: {
              width: 68,
            height: 68,
            borderRadius: 34,
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: spacing.lg,
  },
            emptyTitle: {
            color: colors.textPrimary,
            fontSize: fontSizes.title,
            fontWeight: fontWeights.bold,
            marginBottom: spacing.xs,
  },
            emptySubtitle: {
              color: colors.textTertiary,
            fontSize: fontSizes.subhead,
            textAlign: 'center',
            lineHeight: 20,
  },
            modalOverlay: {
              flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: spacing.xl,
  },
              modalBox: {
              width: '100%',
            maxWidth: 380,
            backgroundColor: colors.surfaceElevated,
            borderRadius: radius.xxl,
            padding: spacing.xl,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.1)',
  },
              modalHeader: {
              flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: spacing.lg,
  },
              modalTitle: {
              color: colors.textPrimary,
            fontSize: fontSizes.title,
            fontWeight: fontWeights.bold,
  },
              coverPickerSection: {
              flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            marginBottom: spacing.lg,
  },
            coverPreviewBox: {
              width: 72,
            height: 72,
            borderRadius: radius.lg,
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.15)',
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
  },
            coverPreviewImage: {
              width: '100%',
            height: '100%',
  },
            coverPlaceholder: {
              alignItems: 'center',
            justifyContent: 'center',
  },
            coverPlaceholderText: {
              fontSize: 9,
            color: colors.textSecondary,
            marginTop: 3,
            fontWeight: fontWeights.medium,
  },
            coverActionButtons: {
              flex: 1,
            gap: spacing.xs,
  },
            coverActionBtn: {
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
            paddingVertical: 7,
            paddingHorizontal: spacing.md,
            borderRadius: radius.md,
            alignItems: 'center',
  },
            coverActionBtnText: {
              color: colors.textPrimary,
            fontSize: fontSizes.captionLarge,
            fontWeight: fontWeights.medium,
  },
            coverRemoveBtn: {
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
            coverRemoveBtnText: {
              color: colors.dangerLight,
            fontSize: fontSizes.caption,
            fontWeight: fontWeights.semibold,
  },
              input: {
              backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.08)',
            borderRadius: radius.lg,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            color: colors.textPrimary,
            fontSize: fontSizes.body,
            marginBottom: spacing.md,
  },
              descInput: {
              height: 70,
            textAlignVertical: 'top',
  },
            modalActions: {
              flexDirection: 'row',
            justifyContent: 'flex-end',
            gap: spacing.md,
            marginTop: spacing.sm,
  },
            modalCancelBtn: {
              paddingHorizontal: spacing.lg,
            paddingVertical: 9,
            borderRadius: radius.pill,
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
              modalCancelText: {
              color: colors.textSecondary,
            fontSize: fontSizes.captionLarge,
            fontWeight: fontWeights.semibold,
  },
            modalSaveBtn: {
              flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: spacing.xl,
            paddingVertical: 9,
            borderRadius: radius.pill,
            backgroundColor: colors.primary,
            gap: 4,
  },
              modalSaveText: {
              color: colors.textDark,
            fontSize: fontSizes.captionLarge,
            fontWeight: fontWeights.bold,
  },
});
