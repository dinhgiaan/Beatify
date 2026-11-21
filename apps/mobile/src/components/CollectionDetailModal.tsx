import React, { useMemo, useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Track, smartShuffle } from '@music-app/shared';
import {
  colors,
  spacing,
  radius,
  fontSizes,
  fontWeights,
} from '../theme';
import { usePlayer, useLibrary, useOffline } from '../context';
import { formatTime } from '../utils/formatTime';
import { EqualizerIndicator } from './player/EqualizerIndicator';
import { MiniPlayer } from './player/MiniPlayer';
import { NowPlayingView } from './player/NowPlayingView';
import { TrackActionSheet } from './sheet/TrackActionSheet';
import { AddToPlaylistModal } from './AddToPlaylistModal';
import { ScrollToTopButton } from './common/ScrollToTopButton';
import { SHUFFLE_LABELS } from '../constants/labels';
import {
  CloseIcon,
  PlayIcon,
  ShuffleIcon,
  DiscIcon,
  HeadphonesIcon,
  HeartIcon,
  TrashIcon,
  ClockIcon,
  CheckIcon,
  MoreHorizontalIcon,
} from './icons/SvgIcons';

export interface CollectionDetailModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  coverUrl?: string;
  artistCoverUrl?: string;
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
  artistCoverUrl,
  tracks,
  type,
  playlistId,
  onRemoveTrackFromPlaylist,
  onClearRecentTracks,
}: CollectionDetailModalProps) {
  const insets = useSafeAreaInsets();
  const { currentTrack, playQueue, playNext, togglePlay, playerState, handleTrackDeleted } = usePlayer();
  const { userState, toggleFavorite, updateUserState, deleteTrack } = useLibrary();
  const { isTrackOffline, downloadTrack, deleteOfflineTrack, isDownloading, downloadProgress } = useOffline();

  const [selectedTrackForMenu, setSelectedTrackForMenu] = useState<Track | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [addToPlaylistVisible, setAddToPlaylistVisible] = useState(false);
  const [nowPlayingVisible, setNowPlayingVisible] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const totalDurationSec = useMemo(() => {
    return tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  }, [tracks]);

  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    // Phát toàn bộ bài trong collection này (không ảnh hưởng danh sách thư viện toàn cục)
    playQueue(tracks, 0);
  };

  const handleShufflePlay = () => {
    if (tracks.length === 0) return;
    // Shuffle công bằng (Uniform Random Distribution) chỉ các bài trong collection này
    const shuffled = smartShuffle(tracks);
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
        onLongPress={() => {
          setSelectedTrackForMenu(item);
          setActionSheetVisible(true);
        }}
        delayLongPress={400}
        activeOpacity={0.7}
      >
        {isCurrent ? (
          <View style={{ width: 30, alignItems: 'center', justifyContent: 'center' }}>
            <EqualizerIndicator isPlaying={playerState.isPlaying} size={14} color={colors.primary} />
          </View>
        ) : (
          <Text style={styles.indexText} numberOfLines={1}>
            {index + 1}
          </Text>
        )}

        {/* Ảnh bìa bài hát */}
        <View style={styles.trackCoverWrapper}>
          {item.cover ? (
            <Image
              source={{ uri: item.cover }}
              style={styles.trackCoverImg}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={item.id}
            />
          ) : (
            <View style={styles.trackCoverPlaceholder}>
              <DiscIcon size={16} color={colors.textTertiary} />
            </View>
          )}
        </View>

        <View style={styles.trackInfo}>
          <Text
            style={[styles.trackTitle, isCurrent && styles.trackTitleActive]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            {isTrackOffline(item.id) && (
              <View style={styles.offlineCheckBadge}>
                <CheckIcon size={9} color="#000000" />
              </View>
            )}
            <Text style={styles.trackArtist} numberOfLines={1}>
              {item.artist} {item.album ? `• ${item.album}` : ''}
            </Text>
          </View>
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

          <TouchableOpacity
            style={styles.actionIconBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              setSelectedTrackForMenu(item);
              setActionSheetVisible(true);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={`Tùy chọn cho bài ${item.title}`}
          >
            <MoreHorizontalIcon size={18} color={colors.textTertiary} />
          </TouchableOpacity>

          <Text style={styles.durationText}>{formatTime(item.duration)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
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
          ref={flatListRef}
          data={tracks}
          keyExtractor={(item, idx) => `${item.id}-${idx}`}
          renderItem={renderTrackItem}
          onScroll={(e) => {
            setShowScrollTop(e.nativeEvent.contentOffset.y > 350);
          }}
          scrollEventThrottle={16}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 16) + (currentTrack ? 90 : 32) },
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
                    contentFit="cover"
                    cachePolicy="memory-disk"
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
              {type === 'album' && artistCoverUrl ? (
                <View style={styles.albumArtistHeroRow}>
                  <Image
                    source={{ uri: artistCoverUrl }}
                    style={styles.albumArtistHeroAvatar}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  <Text style={styles.subtitleText} numberOfLines={1}>
                    <Text style={styles.albumArtistItalic}>{subtitle?.split(' • ')[0]}</Text>
                    {subtitle?.includes(' • ') ? ` • ${subtitle.split(' • ').slice(1).join(' • ')}` : ''}
                  </Text>
                </View>
              ) : (
                subtitle && (
                  <Text style={styles.subtitleText}>
                    {type === 'album' ? (
                      <>
                        <Text style={styles.albumArtistItalic}>{subtitle.split(' • ')[0]}</Text>
                        {subtitle.includes(' • ') ? ` • ${subtitle.split(' • ').slice(1).join(' • ')}` : ''}
                      </>
                    ) : (
                      subtitle
                    )}
                  </Text>
                )
              )}

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
                  accessibilityLabel="Phát tất cả"
                >
                  <PlayIcon size={20} color="#000000" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.shuffleBtn, tracks.length === 0 && styles.btnDisabled]}
                  onPress={handleShufflePlay}
                  disabled={tracks.length === 0}
                  activeOpacity={0.8}
                  accessibilityLabel={SHUFFLE_LABELS.ACTION}
                >
                  <ShuffleIcon size={19} color="#000000" />
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

        {/* MiniPlayer hiển thị bên trong modal để không bị che khuất */}
        {currentTrack && (
          <View
            style={[styles.miniPlayerWrapper, { bottom: Math.max(insets.bottom, 12) }]}
            pointerEvents="box-none"
          >
            <MiniPlayer
              onPress={() => {
                setNowPlayingVisible(true);
              }}
            />
          </View>
        )}

        {/* Menu bài hát Bottom Sheet kiểu Apple */}
        {selectedTrackForMenu && (
          <TrackActionSheet
            visible={actionSheetVisible}
            onClose={() => setActionSheetVisible(false)}
            track={selectedTrackForMenu}
            coverUrl={selectedTrackForMenu?.cover || null}
            isFavorite={userState?.favoriteIds?.includes(selectedTrackForMenu.id)}
            playlistNames={
              selectedTrackForMenu
                ? userState.playlists
                  .filter((pl) => pl.trackIds.includes(selectedTrackForMenu.id))
                  .map((pl) => pl.name)
                : undefined
            }
            downloadStatus={
              selectedTrackForMenu
                ? isDownloading[selectedTrackForMenu.id]
                  ? 'downloading'
                  : isTrackOffline(selectedTrackForMenu.id)
                    ? 'downloaded'
                    : 'idle'
                : 'idle'
            }
            downloadProgress={
              selectedTrackForMenu ? downloadProgress[selectedTrackForMenu.id] : undefined
            }
            onPlayNext={() => {
              if (selectedTrackForMenu) playNext(selectedTrackForMenu);
            }}
            onToggleFavorite={() => {
              toggleFavorite(selectedTrackForMenu.id);
            }}
            onAddToPlaylist={() => {
              setAddToPlaylistVisible(true);
            }}
            onDownloadPress={async (t, status) => {
              if (status === 'downloaded') {
                await deleteOfflineTrack(t.id);
              } else if (status === 'idle' || status === 'error') {
                await downloadTrack(t);
              }
            }}
            onDeleteFromLibrary={() => {
              deleteTrack(selectedTrackForMenu.id, handleTrackDeleted);
            }}
          />
        )}

        {/* Modal Thêm vào playlist */}
        <AddToPlaylistModal
          visible={addToPlaylistVisible}
          track={selectedTrackForMenu}
          userState={userState}
          onClose={() => setAddToPlaylistVisible(false)}
          onUpdateUserState={updateUserState}
        />

        {/* Nút Cuộn lên đầu trang với animation mũi tên nhảy lên nhảy xuống mượt mà */}
        <ScrollToTopButton
          visible={showScrollTop}
          bottomOffset={currentTrack ? 85 : 25}
          onPress={() => {
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
          }}
        />
        {/* Modal Màn hình đang phát (NowPlayingView) hiển thị xếp lớp mà không đóng playlist bên dưới */}
        <Modal
          visible={nowPlayingVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setNowPlayingVisible(false)}
        >
          <NowPlayingView onClose={() => setNowPlayingVisible(false)} />
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  miniPlayerWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    alignItems: 'center',
    zIndex: 50,
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
  albumArtistHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xxs,
  },
  albumArtistHeroAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.surface,
  },
  albumArtistItalic: {
    fontStyle: 'italic',
    color: colors.textPrimary,
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
    backgroundColor: '#FFFFFF',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minHeight: 44,
  },
  playAllBtnText: {
    color: '#000000',
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.bold,
  },
  shuffleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minHeight: 44,
  },
  shuffleBtnText: {
    color: '#000000',
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
    minWidth: 30,
    color: colors.textTertiary,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  indexTextActive: {
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
  trackCoverWrapper: {
    width: 40,
    height: 40,
    borderRadius: radius.xs,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    marginLeft: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackCoverImg: {
    width: '100%',
    height: '100%',
  },
  trackCoverPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
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
  offlineCheckBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
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
