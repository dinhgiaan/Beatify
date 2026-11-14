import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  StyleSheet,
  Alert,
  Vibration,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { Track, UserState, Playlist } from '@music-app/shared';
import { colors, fontSizes, fontWeights, spacing, radius } from '../theme';
import { PlaylistIcon, CheckIcon, PlusIcon, CloseIcon } from './icons/SvgIcons';

export interface AddToPlaylistModalProps {
  visible: boolean;
  track: Track | null;
  userState: UserState;
  onClose: () => void;
  onUpdateUserState: (updater: (prev: UserState) => UserState) => Promise<void>;
  onNavigateToCreatePlaylist?: () => void;
}

export function AddToPlaylistModal({
  visible,
  track,
  userState,
  onClose,
  onUpdateUserState,
}: AddToPlaylistModalProps) {
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  if (!track) return null;

  const handleCreateAndAdd = async () => {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      Alert.alert('Chưa nhập tên', 'Vui lòng nhập tên cho danh sách phát.');
      return;
    }

    Vibration.vibrate(15);
    const nowIso = new Date().toISOString();
    const newPlaylist: Playlist = {
      id: `pl-${Date.now()}`,
      name: trimmed,
      trackIds: [track.id],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await onUpdateUserState((prev) => ({
      ...prev,
      playlists: [newPlaylist, ...prev.playlists],
    }));

    setNewTitle('');
    setIsCreatingNew(false);
    onClose();
    Alert.alert(
      'Thành công',
      `Đã tạo playlist "${trimmed}" và thêm "${track.title}".`
    );
  };

  const handleTogglePlaylist = async (playlistId: string) => {
    const targetPlaylist = userState.playlists.find((p) => p.id === playlistId);
    if (!targetPlaylist) return;

    const isAlreadyIn = targetPlaylist.trackIds.includes(track.id);

    Vibration.vibrate(15);
    const nowIso = new Date().toISOString();

    if (isAlreadyIn) {
      // Đã có trong playlist: Xác nhận xóa bài này khỏi playlist
      Alert.alert(
        'Đã có trong danh sách',
        `Bài hát "${track.title}" đã có trong playlist "${targetPlaylist.name}". Bạn có muốn xóa khỏi playlist này không?`,
        [
          { text: 'Giữ lại', style: 'cancel' },
          {
            text: 'Xóa khỏi playlist',
            style: 'destructive',
            onPress: async () => {
              await onUpdateUserState((prev) => ({
                ...prev,
                playlists: prev.playlists.map((pl) => {
                  if (pl.id === playlistId) {
                    return {
                      ...pl,
                      trackIds: pl.trackIds.filter((id) => id !== track.id),
                      updatedAt: nowIso,
                    };
                  }
                  return pl;
                }),
              }));
            },
          },
        ]
      );
    } else {
      // Thêm vào playlist
      await onUpdateUserState((prev) => ({
        ...prev,
        playlists: prev.playlists.map((pl) => {
          if (pl.id === playlistId) {
            return {
              ...pl,
              trackIds: [...pl.trackIds, track.id],
              updatedAt: nowIso,
            };
          }
          return pl;
        }),
      }));
      onClose();
      Alert.alert(
        'Đã thêm vào playlist',
        `Đã thêm "${track.title}" vào playlist "${targetPlaylist.name}".`
      );
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalBackdrop}
        activeOpacity={1}
        onPress={() => {
          setIsCreatingNew(false);
          setNewTitle('');
          onClose();
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.card}
          onStartShouldSetResponder={() => true}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Thêm vào playlist</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {track.title} • {track.artist}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setIsCreatingNew(false);
                setNewTitle('');
                onClose();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <CloseIcon size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Form tạo nhanh playlist mới */}
          {isCreatingNew ? (
            <View style={styles.createFormBox}>
              <Text style={styles.createFormLabel}>Tên playlist mới</Text>
              <TextInput
                style={styles.createInput}
                placeholder="Ví dụ: Chill rap, Nhạc đêm..."
                placeholderTextColor={colors.textTertiary}
                value={newTitle}
                onChangeText={setNewTitle}
                autoFocus
                maxLength={50}
              />
              <View style={styles.createFormActions}>
                <TouchableOpacity
                  style={styles.cancelCreateBtn}
                  onPress={() => {
                    setIsCreatingNew(false);
                    setNewTitle('');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelCreateBtnText}>Hủy</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.confirmCreateBtn}
                  onPress={handleCreateAndAdd}
                  activeOpacity={0.8}
                >
                  <Text style={styles.confirmCreateBtnText}>Tạo & Thêm vào</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {/* Nút tạo nhanh playlist */}
              <TouchableOpacity
                style={styles.newPlaylistTriggerBtn}
                onPress={() => setIsCreatingNew(true)}
                activeOpacity={0.7}
              >
                <View style={styles.newPlaylistIconBox}>
                  <PlusIcon size={18} color={colors.primary} />
                </View>
                <Text style={styles.newPlaylistTriggerText}>Tạo danh sách phát mới</Text>
              </TouchableOpacity>

              {/* Danh sách playlist hiện có */}
              {userState.playlists.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>
                    Bạn chưa có danh sách phát nào. Bấm nút trên để tạo danh sách đầu tiên.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={userState.playlists}
                  keyExtractor={(item) => item.id}
                  style={styles.list}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => {
                    const isInPlaylist = item.trackIds.includes(track.id);

                    return (
                      <TouchableOpacity
                        style={[
                          styles.playlistItem,
                          isInPlaylist && styles.playlistItemActive,
                        ]}
                        onPress={() => handleTogglePlaylist(item.id)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.iconBox}>
                          <PlaylistIcon
                            size={18}
                            color={isInPlaylist ? colors.primary : colors.textSecondary}
                          />
                        </View>

                        <View style={styles.playlistInfo}>
                          <Text style={styles.playlistName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={styles.playlistMeta}>
                            {item.trackIds.length} bài hát
                          </Text>
                        </View>

                        {isInPlaylist ? (
                          <View style={styles.badgeIncluded}>
                            <CheckIcon size={12} color={colors.primary} />
                            <Text style={styles.badgeText}>Đã có</Text>
                          </View>
                        ) : (
                          <View style={styles.addIconCircle}>
                            <PlusIcon size={13} color={colors.textSecondary} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
            </>
          )}

          {/* Nút Đóng */}
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => {
              setIsCreatingNew(false);
              setNewTitle('');
              onClose();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelBtnText}>Đóng</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    maxHeight: 520,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
    marginBottom: 4,
  },
  subtitle: {
    color: colors.textTertiary,
    fontSize: fontSizes.captionLarge,
  },
  newPlaylistTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(29, 185, 84, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.35)',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
  },
  newPlaylistIconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(29, 185, 84, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newPlaylistTriggerText: {
    color: colors.primary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
  },
  createFormBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginVertical: spacing.xs,
  },
  createFormLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.medium,
    marginBottom: 6,
  },
  createInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    marginBottom: spacing.md,
  },
  createFormActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  cancelCreateBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  cancelCreateBtnText: {
    color: colors.textSecondary,
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.medium,
  },
  confirmCreateBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  confirmCreateBtnText: {
    color: colors.textDark,
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.bold,
  },
  list: {
    maxHeight: 250,
    marginVertical: spacing.xs,
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    marginVertical: 3,
    backgroundColor: '#1b1b20',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  playlistItemActive: {
    backgroundColor: 'rgba(29, 185, 84, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.35)',
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  playlistInfo: {
    flex: 1,
  },
  playlistName: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.medium,
    marginBottom: 2,
  },
  playlistMeta: {
    color: colors.textTertiary,
    fontSize: fontSizes.caption,
  },
  badgeIncluded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: fontWeights.semibold,
  },
  addIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  emptyText: {
    color: colors.textTertiary,
    fontSize: fontSizes.subhead,
    textAlign: 'center',
    lineHeight: 18,
  },
  cancelBtn: {
    alignSelf: 'flex-end',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 22,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  cancelBtnText: {
    color: colors.textPrimary,
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.semibold,
  },
});
