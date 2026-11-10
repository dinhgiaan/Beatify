import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Track } from '@music-app/shared';
import {
  colors,
  spacing,
  radius,
  fontSizes,
  fontWeights,
} from '../theme';
import { usePlayer, useLibrary } from '../context';
import { formatTime } from '../utils/formatTime';
import {
  CloseIcon,
  PlayIcon,
  ShuffleIcon,
  DiscIcon,
  HeadphonesIcon,
  HeartIcon,
  TrashIcon,
  ClockIcon,
} from './icons/SvgIcons';

export interface CollectionDetailModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  coverUrl?: string;
  tracks: Track[];
  type: 'album' | 'artist' | 'playlist' | 'favorites' | 'recently_played';
  playlistId?: string;
  onRemoveTrackFromPlaylist?: (trackId: string) => Promise<void> | void;
  onClearRecentTracks?: () => Promise<void> | void;
}

export function CollectionDetailModal({
  visible,
  onClose,
  title,
  subtitle,
  coverUrl,
  tracks,
  type,
  playlistId,
  onRemoveTrackFromPlaylist,
  onClearRecentTracks,
}: CollectionDetailModalProps) {
  const insets = useSafeAreaInsets();
  const { currentTrack, playQueue, togglePlay } = usePlayer();
  const { userState, toggleFavorite } = useLibrary();

  const totalDurationSec = useMemo(() => {
    return tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  }, [tracks]);

  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    playQueue(tracks, 0);
  };

  const handleShufflePlay = () => {
    if (tracks.length === 0) return;
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    playQueue(shuffled, 0);
  };

  const handleTrackPress = (track: Track, index: number) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      // Phát toàn bộ danh sách bắt đầu từ bài này
      playQueue(tracks, index);
    }
  };

  const renderTrackItem = ({ item, index }: { item: Track; index: number }) => {
    const isCurrent = currentTrack?.id === item.id;
    const isFav = userState.favoriteIds.includes(item.id);

    return (
      <TouchableOpacity
        style={[styles.trackItem, isCurrent && styles.trackItemActive]}
        onPress={() => handleTrackPress(item, index)}
        activeOpacity={0.7}
      >
        <Text style={[styles.indexText, isCurrent && styles.indexTextActive]}>
          {index + 1}
        </Text>

        <View style={styles.trackInfo}>
          <Text
            style={[styles.trackTitle, isCurrent && styles.trackTitleActive]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {item.artist} {item.album ? `• ${item.album}` : ''}
          </Text>
        </View>

        <View style={styles.trackActions}>
          <TouchableOpacity
            style={styles.actionIconBtn}
            onPress={() => toggleFavorite(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <HeartIcon
              size={18}
              color={isFav ? colors.primary : colors.textTertiary}
              fill={isFav ? colors.primary : 'none'}
            />
          </TouchableOpacity>

          {type === 'playlist' && playlistId && onRemoveTrackFromPlaylist && (
            <TouchableOpacity
              style={styles.actionIconBtn}
              onPress={() => onRemoveTrackFromPlaylist(item.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <TrashIcon size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}

          <Text style={styles.durationText}>{formatTime(item.duration)}</Text>
        </View>
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
      <View style={[styles.container, { paddingTop: Math.max(insets.top, spacing.md) }]}>
        {/* Nút đóng ở góc trên */}
        <View style={styles.navBar}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Đóng chi tiết"
          >
            <CloseIcon size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Danh sách bài hát có Header là thông tin Album/Nghệ sĩ */}
        <FlatList
          data={tracks}
          keyExtractor={(item, idx) => `${item.id}-${idx}`}
          renderItem={renderTrackItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, spacing.xl) + spacing.xl },
          ]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.headerHero}>
              {/* Ảnh bìa hoặc Avatar */}
              <View
                style={[
                  styles.coverContainer,
                  type === 'artist' && styles.coverArtistCircle,
                  type === 'favorites' && styles.coverFavoritesBg,
                ]}
              >
                {coverUrl ? (
                  <Image
                    source={{ uri: coverUrl }}
                    style={[
                      styles.coverImage,
                      type === 'artist' && styles.coverArtistCircle,
                    ]}
                    resizeMode="cover"
                  />
                ) : type === 'artist' ? (
                  <HeadphonesIcon size={64} color={colors.primary} />
                ) : type === 'favorites' ? (
                  <HeartIcon size={64} color={colors.primary} fill={colors.primary} />
                ) : type === 'recently_played' ? (
                  <ClockIcon size={64} color={colors.primary} />
                ) : (
                  <DiscIcon size={64} color={colors.borderLight} />
                )}
              </View>

              {/* Thông tin tiêu đề & thống kê */}
              <Text style={styles.titleText} numberOfLines={2}>
                {title}
              </Text>
              {subtitle && <Text style={styles.subtitleText}>{subtitle}</Text>}

              <Text style={styles.statsText}>
                {tracks.length} bài hát • {formatTime(totalDurationSec)}
              </Text>

              {/* Cụm nút hành động Phát tất cả & Xáo trộn */}
              <View style={styles.actionButtonsRow}>
                <TouchableOpacity
                  style={[styles.playAllBtn, tracks.length === 0 && styles.btnDisabled]}
                  onPress={handlePlayAll}
                  disabled={tracks.length === 0}
                  activeOpacity={0.8}
                >
                  <PlayIcon size={18} color={colors.textDark} />
                  <Text style={styles.playAllBtnText}>Phát tất cả</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.shuffleBtn, tracks.length === 0 && styles.btnDisabled]}
                  onPress={handleShufflePlay}
                  disabled={tracks.length === 0}
                  activeOpacity={0.8}
                >
                  <ShuffleIcon size={18} color={colors.textPrimary} />
                  <Text style={styles.shuffleBtnText}>Xáo trộn</Text>
                </TouchableOpacity>

                {type === 'recently_played' && onClearRecentTracks && tracks.length > 0 && (
                  <TouchableOpacity
                    style={styles.clearHistoryBtn}
                    onPress={() => {
                      Alert.alert(
                        'Xóa lịch sử nghe',
                        'Bạn có chắc chắn muốn xóa toàn bộ danh sách bài hát vừa nghe không?',
                        [
                          { text: 'Hủy', style: 'cancel' },
                          {
                            text: 'Xóa',
                            style: 'destructive',
                            onPress: () => {
                              onClearRecentTracks();
                              onClose();
                            },
                          },
                        ]
                      );
                    }}
                    activeOpacity={0.8}
                  >
                    <TrashIcon size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <DiscIcon size={48} color={colors.borderLight} />
              <Text style={styles.emptyText}>Chưa có bài hát nào trong danh sách</Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
  },
  headerHero: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDivider,
    marginBottom: spacing.md,
  },
  coverContainer: {
    width: 160,
    height: 160,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  coverArtistCircle: {
    borderRadius: radius.pill,
  },
  coverFavoritesBg: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  titleText: {
    color: colors.textPrimary,
    fontSize: fontSizes.headline,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  subtitleText: {
    color: colors.textSecondary,
    fontSize: fontSizes.subhead,
    textAlign: 'center',
    marginTop: spacing.xxs,
  },
  statsText: {
    color: colors.textTertiary,
    fontSize: fontSizes.caption,
    marginTop: spacing.xs,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
    width: '100%',
    paddingHorizontal: spacing.md,
  },
  playAllBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minHeight: 44,
  },
  playAllBtnText: {
    color: colors.textDark,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.bold,
  },
  shuffleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minHeight: 44,
  },
  shuffleBtnText: {
    color: colors.textPrimary,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.semibold,
  },
  clearHistoryBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  trackItemActive: {
    backgroundColor: colors.surfaceElevated,
  },
  indexText: {
    width: 28,
    color: colors.textTertiary,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
  },
  indexTextActive: {
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
  trackInfo: {
    flex: 1,
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
  },
  trackTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.medium,
  },
  trackTitleActive: {
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
  trackArtist: {
    color: colors.textSecondary,
    fontSize: fontSizes.caption,
    marginTop: 2,
  },
  trackActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionIconBtn: {
    padding: spacing.xxs,
  },
  durationText: {
    color: colors.textTertiary,
    fontSize: fontSizes.caption,
    width: 40,
    textAlign: 'right',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSizes.subhead,
  },
});
