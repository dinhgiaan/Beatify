import React, { useState, useMemo, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { type Track, smartShuffle } from '@music-app/shared';
import { tokens } from '../theme/tokens';
import { useOffline, usePlayer } from '../context';
import { formatBytes } from '../services/offline/offlineStorage';
import { MiniPlayer } from './player/MiniPlayer';
import { ScrollToTopButton } from './common/ScrollToTopButton';
import {
  CloseIcon,
  PlayIcon,
  ShuffleIcon,
  TrashIcon,
  CheckIcon,
  DiscIcon,
} from './icons/SvgIcons';
import { cleanTrackTitle } from '../utils/recentFormatters';
import { triggerSelectionHaptic } from '../utils/haptics';

export interface OfflineDownloadsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function OfflineDownloadsModal({ visible, onClose }: OfflineDownloadsModalProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    offlineIndex,
    offlineTracks,
    totalSizeBytes,
    deleteOfflineTrack,
    deleteMultipleOfflineTracks,
    clearAllOffline,
  } = useOffline();

  const { playQueue, currentTrack } = usePlayer();
  const [showScrollTop, setShowScrollTop] = useState(false);
  const flatListRef = useRef<FlatList>(null);

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
    triggerSelectionHaptic();
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
    triggerSelectionHaptic();
    if (selectedTrackIds.size === offlineTracks.length) {
      setSelectedTrackIds(new Set());
    } else {
      setSelectedTrackIds(new Set(offlineTracks.map((t) => t.id)));
    }
  };

  const handleCancelSelect = () => {
    triggerSelectionHaptic();
    setIsSelectMode(false);
    setSelectedTrackIds(new Set());
  };

  // Xóa đơn lẻ 1 bài
  const handleDeleteSingle = (track: Track) => {
    triggerSelectionHaptic();
    Alert.alert(
      'Xóa bài hát đã tải?',
      `Bạn có chắc chắn muốn xóa bài hát "${track.title}" khỏi bộ nhớ máy không?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa bài',
          style: 'destructive',
          onPress: async () => {
            await deleteOfflineTrack(track.id);
          },
        },
      ]
    );
  };

  // Xóa nhiều bài đã chọn
  const handleDeleteSelected = () => {
    if (selectedTrackIds.size === 0) return;
    triggerSelectionHaptic();
    Alert.alert(
      'Xóa các bài đã chọn?',
      `Bạn có chắc chắn muốn xóa ${selectedTrackIds.size} bài hát (${formatBytes(selectedTotalBytes)}) khỏi bộ nhớ máy không?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa ngay',
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

  // Xóa sạch toàn bộ
  const handleClearAll = () => {
    triggerSelectionHaptic();
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
    triggerSelectionHaptic();
    playQueue(offlineTracks, 0);
  };

  const handleShufflePlay = () => {
    if (offlineTracks.length === 0) return;
    triggerSelectionHaptic();
    const shuffled = smartShuffle(offlineTracks);
    playQueue(shuffled, 0);
  };

  const renderTrackItem = ({ item }: { item: Track }) => {
    const isPlayingThis = currentTrack?.id === item.id;
    const meta = offlineIndex[item.id];
    const isSelected = selectedTrackIds.has(item.id);

    return (
      <TouchableOpacity
        style={[
          styles.trackRow,
          isPlayingThis && styles.trackRowPlaying,
          isSelected && styles.trackRowSelected,
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
            {isSelected && <CheckIcon size={11} color="#000000" />}
          </View>
        )}

        {/* Ảnh bìa bài hát */}
        <View style={styles.coverBox}>
          {item.cover ? (
            <Image source={{ uri: item.cover }} style={styles.coverImage} resizeMode="cover" />
          ) : (
            <DiscIcon size={20} color={tokens.colors.textDim} />
          )}
        </View>

        {/* Thông tin bài hát (Lỗi 5: Tiêu đề rác cleanTrackTitle + 2 dòng ellipsize) */}
        <View style={styles.trackInfo}>
          <Text
            style={[styles.trackTitle, isPlayingThis && styles.trackTitlePlaying]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {cleanTrackTitle(item.title)}
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
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <TrashIcon size={15} color={tokens.colors.textMuted} />
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
      <View style={styles.container}>
        {/* Drag indicator chuẩn Apple (Lỗi 2) */}
        <View style={styles.grabberBox}>
          <View style={styles.grabber} />
        </View>

        {/* Header Modal */}
        <View style={styles.header}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Lưu trữ ngoại tuyến</Text>
            <Text style={styles.headerSubtitle}>
              {offlineTracks.length} bài hát · {formatBytes(totalSizeBytes)}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Đóng lưu trữ ngoại tuyến"
          >
            <CloseIcon size={18} color={tokens.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Thanh công cụ hành động (Action Bar) */}
        <View style={styles.actionBar}>
          <View style={styles.actionLeftRow}>
            {
              offlineTracks.length > 0 && !isSelectMode && (
                <>
                  <TouchableOpacity
                    style={styles.playMiniBtn}
                    onPress={handlePlayAll}
                    activeOpacity={0.7}
                  >
                    <PlayIcon size={14} color="#000000" />
                    <Text style={styles.playMiniBtnText}>Phát</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.shuffleMiniBtn}
                    onPress={handleShufflePlay}
                    activeOpacity={0.7}
                  >
                    <ShuffleIcon size={15} color={tokens.colors.textPrimary} />
                  </TouchableOpacity>
                </>
              )
            }
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
                      <Text style={[styles.selectTextBtnLabel, { color: tokens.colors.danger }]}>
                        Hủy
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.selectToggleBtn}
                      onPress={() => {
                        triggerSelectionHaptic();
                        setIsSelectMode(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.selectToggleBtnText}>Chọn</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.clearAllBtn}
                      onPress={handleClearAll}
                      activeOpacity={0.7}
                      accessibilityLabel="Xóa toàn bộ nhạc đã tải"
                    >
                      <TrashIcon size={15} color={tokens.colors.danger} />
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
          </View>
        </View>

        {/* Danh sách bài hát */}
        {offlineTracks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconBox}>
              <DiscIcon size={32} color={tokens.colors.textDim} />
            </View>
            <Text style={styles.emptyTitle}>Chưa có bài hát ngoại tuyến</Text>
            <Text style={styles.emptyDesc}>
              Bấm biểu tượng Tải xuống ở menu từng bài hát để nghe ngay cả khi không có mạng Internet.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={offlineTracks}
            keyExtractor={(item) => item.id}
            renderItem={renderTrackItem}
            onScroll={(e) => {
              setShowScrollTop(e.nativeEvent.contentOffset.y > 350);
            }}
            scrollEventThrottle={16}
            contentContainerStyle={[
              styles.listContent,
              {
                paddingBottom:
                  Math.max(insets.bottom, tokens.spacing.xl) +
                  (isSelectMode ? 96 : currentTrack ? 90 : 30),
              },
            ]}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
          />
        )}

        {/* MiniPlayer nổi khi có bài đang phát (ẩn khi đang ở chế độ chọn để xóa để không che nút Xóa) */}
        {currentTrack && !isSelectMode && (
          <View
            style={[
              styles.miniPlayerWrapper,
              { bottom: Math.max(insets.bottom, 12) },
            ]}
            pointerEvents="box-none"
          >
            <MiniPlayer
              onPress={() => {
                onClose();
                router.push('/now-playing');
              }}
            />
          </View>
        )}

        {/* Nút Cuộn lên đầu trang với animation mũi tên nhảy lên nhảy xuống mượt mà */}
        <ScrollToTopButton
          visible={showScrollTop}
          bottomOffset={isSelectMode ? 85 : currentTrack ? 85 : 25}
          onPress={() => {
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
          }}
        />

        {/* Thanh công cụ cố định đáy khi ở Select Mode */}
        {isSelectMode && selectedTrackIds.size > 0 && (
          <View
            style={[
              styles.bottomDeleteBar,
              { paddingBottom: Math.max(insets.bottom, tokens.spacing.md) },
            ]}
          >
            <TouchableOpacity
              style={styles.bottomDeleteBtn}
              onPress={handleDeleteSelected}
              activeOpacity={0.8}
            >
              <TrashIcon size={16} color="#ffffff" />
              <Text style={styles.bottomDeleteBtnText}>
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
    backgroundColor: tokens.colors.bgBase,
  },
  grabberBox: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: tokens.colors.grabber,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    borderBottomWidth: tokens.hairlineWidth,
    borderBottomColor: tokens.colors.separator,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    ...tokens.typography.headline,
    fontSize: 18,
  },
  headerSubtitle: {
    ...tokens.typography.footnote,
    color: tokens.colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: tokens.colors.bgSurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
  },
  actionLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  playMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tokens.colors.accent,
    paddingVertical: 7,
    paddingHorizontal: tokens.spacing.md,
    borderRadius: tokens.radius.pill,
  },
  playMiniBtnText: {
    ...tokens.typography.footnote,
    color: '#000000',
    fontWeight: '700',
  },
  shuffleMiniBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: tokens.colors.bgSurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  selectToggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: tokens.spacing.md,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.bgSurface,
  },
  selectToggleBtnText: {
    ...tokens.typography.footnote,
    color: tokens.colors.textPrimary,
    fontWeight: '500',
  },
  clearAllBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: tokens.colors.bgSurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectTextBtn: {
    paddingVertical: 6,
    paddingHorizontal: tokens.spacing.sm,
  },
  selectTextBtnLabel: {
    ...tokens.typography.footnote,
    color: tokens.colors.accent,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.xs,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.colors.bgSurface,
    paddingVertical: tokens.spacing.sm + 2,
    paddingHorizontal: tokens.spacing.md,
    borderRadius: tokens.radius.card - 2,
  },
  trackRowPlaying: {
    backgroundColor: tokens.colors.bgElevated,
  },
  trackRowSelected: {
    borderColor: tokens.colors.accent,
    borderWidth: 1,
  },
  itemSeparator: {
    height: tokens.spacing.xs,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: tokens.colors.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: tokens.spacing.sm,
  },
  checkboxActive: {
    backgroundColor: tokens.colors.accent,
    borderColor: tokens.colors.accent,
  },
  coverBox: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.cover - 2,
    backgroundColor: tokens.colors.bgElevated,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: tokens.spacing.md,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  trackInfo: {
    flex: 1,
    paddingRight: tokens.spacing.sm,
  },
  trackTitle: {
    ...tokens.typography.body,
    fontSize: 15,
    fontWeight: '600',
    color: tokens.colors.textPrimary,
  },
  trackTitlePlaying: {
    color: tokens.colors.accent,
  },
  trackArtist: {
    ...tokens.typography.footnote,
    color: tokens.colors.textSecondary,
    marginTop: 2,
  },
  sizeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.bgElevated,
    marginRight: tokens.spacing.sm,
  },
  sizeBadgeText: {
    ...tokens.typography.caption,
    color: tokens.colors.textMuted,
    fontWeight: '500',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomDeleteBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: tokens.colors.bgSurface,
    borderTopWidth: tokens.hairlineWidth,
    borderTopColor: tokens.colors.separator,
    paddingTop: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    zIndex: 99,
    elevation: 20,
  },
  bottomDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    backgroundColor: tokens.colors.danger,
    minHeight: 46,
    borderRadius: tokens.radius.pill,
  },
  bottomDeleteBtnText: {
    ...tokens.typography.body,
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.xxl,
  },
  emptyIconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: tokens.colors.bgSurface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: tokens.spacing.md,
  },
  emptyTitle: {
    ...tokens.typography.headline,
    color: tokens.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  emptyDesc: {
    ...tokens.typography.footnote,
    color: tokens.colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  miniPlayerWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 90,
  },
});
