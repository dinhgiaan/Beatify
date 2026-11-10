import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  Vibration,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Track } from '@music-app/shared';
import {
  colors,
  spacing,
  radius,
  fontSizes,
  fontWeights,
  lineHeights,
} from '../theme';
import { useOffline, usePlayer } from '../context';
import { formatBytes } from '../services/offline/offlineStorage';
import {
  CloseIcon,
  PlayIcon,
  ShuffleIcon,
  TrashIcon,
  DownloadIcon,
  CheckIcon,
  DiscIcon,
} from './icons/SvgIcons';

export interface OfflineDownloadsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function OfflineDownloadsModal({ visible, onClose }: OfflineDownloadsModalProps) {
  const insets = useSafeAreaInsets();
  const {
    offlineIndex,
    offlineTracks,
    totalSizeBytes,
    deleteOfflineTrack,
    deleteMultipleOfflineTracks,
    clearAllOffline,
  } = useOffline();

  const { playQueue, currentTrack } = usePlayer();

  // Chế độ Multi-select để chọn nhiều bài cùng lúc
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());

  // Tính tổng dung lượng của các bài đang được chọn
  const selectedTotalBytes = useMemo(() => {
    let bytes = 0;
    for (const id of selectedTrackIds) {
      if (offlineIndex[id]) {
        bytes += offlineIndex[id].sizeBytes || 0;
      }
    }
    return bytes;
  }, [selectedTrackIds, offlineIndex]);

  const handleToggleSelectTrack = (trackId: string) => {
    Vibration.vibrate(10);
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    Vibration.vibrate(10);
    if (selectedTrackIds.size === offlineTracks.length) {
      setSelectedTrackIds(new Set());
    } else {
      setSelectedTrackIds(new Set(offlineTracks.map((t) => t.id)));
    }
  };

  const handleCancelSelect = () => {
    setIsSelectMode(false);
    setSelectedTrackIds(new Set());
  };

  // Xóa đơn lẻ 1 bài
  const handleDeleteSingle = (track: Track) => {
    Vibration.vibrate(10);
    Alert.alert(
      'Xóa bài hát đã tải?',
      `Bạn có chắc chắn muốn xóa bài hát "${track.title}" khỏi bộ nhớ máy không?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            await deleteOfflineTrack(track.id);
          },
        },
      ]
    );
  };

  // Xóa hàng loạt các bài đã chọn
  const handleDeleteSelected = () => {
    if (selectedTrackIds.size === 0) return;
    Vibration.vibrate(15);
    const count = selectedTrackIds.size;
    const sizeStr = formatBytes(selectedTotalBytes);

    Alert.alert(
      'Xóa các bài hát đã chọn',
      `Bạn có chắc chắn muốn xóa ${count} bài hát (${sizeStr}) khỏi điện thoại không?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: `Xóa ${count} bài`,
          style: 'destructive',
          onPress: async () => {
            await deleteMultipleOfflineTracks(Array.from(selectedTrackIds));
            setSelectedTrackIds(new Set());
            setIsSelectMode(false);
          },
        },
      ]
    );
  };

  // Xóa toàn bộ nhạc offline
  const handleClearAll = () => {
    Vibration.vibrate(15);
    Alert.alert(
      'Xóa toàn bộ nhạc đã tải?',
      `Hành động này sẽ giải phóng toàn bộ ${formatBytes(totalSizeBytes)} bộ nhớ trên iPhone.`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa tất cả',
          style: 'destructive',
          onPress: async () => {
            await clearAllOffline();
            setSelectedTrackIds(new Set());
            setIsSelectMode(false);
          },
        },
      ]
    );
  };

  const handlePlayAll = () => {
    if (offlineTracks.length === 0) return;
    Vibration.vibrate(10);
    playQueue(offlineTracks, 0);
    onClose();
  };

  const handleShufflePlay = () => {
    if (offlineTracks.length === 0) return;
    Vibration.vibrate(10);
    const shuffled = [...offlineTracks].sort(() => Math.random() - 0.5);
    playQueue(shuffled, 0);
    onClose();
  };

  const renderTrackItem = ({ item }: { item: Track }) => {
    const isPlayingThis = currentTrack?.id === item.id;
    const meta = offlineIndex[item.id];
    const isSelected = selectedTrackIds.has(item.id);

    return (
      <TouchableOpacity
        style={[
          styles.trackCard,
          isPlayingThis && styles.trackCardPlaying,
          isSelected && styles.trackCardSelected,
        ]}
        activeOpacity={0.7}
        onPress={() => {
          if (isSelectMode) {
            handleToggleSelectTrack(item.id);
          } else {
            const idx = offlineTracks.findIndex((t) => t.id === item.id);
            playQueue(offlineTracks, idx >= 0 ? idx : 0);
          }
        }}
      >
        {/* Checkbox khi ở Select mode */}
        {isSelectMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
            {isSelected && <CheckIcon size={12} color={colors.textDark} />}
          </View>
        )}

        {/* Ảnh bìa bài hát */}
        <View style={styles.coverBox}>
          {item.cover ? (
            <Image source={{ uri: item.cover }} style={styles.coverImage} resizeMode="cover" />
          ) : (
            <DiscIcon size={24} color={colors.borderLight} />
          )}
        </View>

        {/* Thông tin bài hát */}
        <View style={styles.trackInfo}>
          <Text
            style={[styles.trackTitle, isPlayingThis && styles.trackTitlePlaying]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {item.artist}
          </Text>
        </View>

        {/* Dung lượng bài hát */}
        {meta && (
          <View style={styles.sizeBadge}>
            <Text style={styles.sizeBadgeText}>{formatBytes(meta.sizeBytes)}</Text>
          </View>
        )}

        {/* Nút xóa lẻ (khi không ở select mode) */}
        {!isSelectMode && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDeleteSingle(item)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <TrashIcon size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Đã tải về máy</Text>
            <Text style={styles.headerSubtitle}>
              {offlineTracks.length} bài hát • {formatBytes(totalSizeBytes)}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <CloseIcon size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Thẻ điều khiển & Hành động */}
        <View style={styles.actionBar}>
          <View style={styles.actionLeftRow}>
            {offlineTracks.length > 0 && (
              <>
                <TouchableOpacity
                  style={styles.playMiniBtn}
                  onPress={handlePlayAll}
                  activeOpacity={0.8}
                >
                  <PlayIcon size={16} color={colors.textDark} />
                  <Text style={styles.playMiniBtnText}>Phát</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.shuffleMiniBtn}
                  onPress={handleShufflePlay}
                  activeOpacity={0.8}
                >
                  <ShuffleIcon size={16} color={colors.textPrimary} />
                </TouchableOpacity>
              </>
            )}
          </View>

          <View style={styles.actionRightRow}>
            {offlineTracks.length > 0 && (
              <>
                {isSelectMode ? (
                  <>
                    <TouchableOpacity
                      style={styles.selectTextBtn}
                      onPress={handleSelectAll}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.selectTextBtnLabel}>
                        {selectedTrackIds.size === offlineTracks.length ? 'Bỏ chọn' : 'Chọn hết'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.selectTextBtn}
                      onPress={handleCancelSelect}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.selectTextBtnLabel, { color: colors.dangerLight }]}>
                        Hủy
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.selectToggleBtn}
                      onPress={() => setIsSelectMode(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.selectToggleBtnText}>Chọn bài</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.clearAllBtn}
                      onPress={handleClearAll}
                      activeOpacity={0.8}
                      accessibilityLabel="Xóa toàn bộ nhạc đã tải"
                    >
                      <TrashIcon size={16} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
          </View>
        </View>

        {/* Danh sách bài hát */}
        <FlatList
          data={offlineTracks}
          keyExtractor={(item) => item.id}
          renderItem={renderTrackItem}
          contentContainerStyle={[
            styles.listContent,
            isSelectMode && selectedTrackIds.size > 0 && { paddingBottom: 100 },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <DownloadIcon size={44} color={colors.borderLight} />
              </View>
              <Text style={styles.emptyTitle}>Chưa có bài hát nào</Text>
              <Text style={styles.emptySubtitle}>
                Bấm vào nút "•••" tại bất kỳ bài hát nào trong thư viện để tải về và thưởng thức âm nhạc ngoại tuyến không cần mạng.
              </Text>
            </View>
          }
        />

        {/* Floating Action Bar khi chọn nhiều bài để xóa */}
        {isSelectMode && selectedTrackIds.size > 0 && (
          <View style={[styles.floatingBar, { bottom: Math.max(insets.bottom, spacing.md) }]}>
            <TouchableOpacity
              style={styles.batchDeleteBtn}
              onPress={handleDeleteSelected}
              activeOpacity={0.8}
            >
              <TrashIcon size={18} color={colors.textPrimary} />
              <Text style={styles.batchDeleteText}>
                Xóa {selectedTrackIds.size} bài ({formatBytes(selectedTotalBytes)})
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
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
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDivider,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.headline,
    fontWeight: fontWeights.bold,
  },
  headerSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.caption,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.md,
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  actionLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  playMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    gap: 4,
    minHeight: 34,
  },
  playMiniBtnText: {
    color: colors.textDark,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
  },
  shuffleMiniBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  selectToggleBtn: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    minHeight: 34,
    justifyContent: 'center',
  },
  selectToggleBtnText: {
    color: colors.primary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
  },
  clearAllBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectTextBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  selectTextBtnLabel: {
    color: colors.primary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  trackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  trackCardPlaying: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceElevated,
  },
  trackCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  coverBox: {
    width: 44,
    height: 44,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderDivider,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  trackInfo: {
    flex: 1,
    marginLeft: spacing.sm,
    marginRight: spacing.xs,
  },
  trackTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.medium,
  },
  trackTitlePlaying: {
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
  trackArtist: {
    color: colors.textSecondary,
    fontSize: fontSizes.caption,
    marginTop: 2,
  },
  sizeBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.borderDivider,
    marginRight: spacing.sm,
  },
  sizeBadgeText: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: fontWeights.medium,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xs,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl * 2,
    paddingHorizontal: spacing.xl,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.subhead,
    textAlign: 'center',
    lineHeight: lineHeights.body,
  },
  floatingBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 99,
  },
  batchDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    gap: spacing.xs,
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  batchDeleteText: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
  },
});
