import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from 'expo-router';
import { smartShuffle, type Track, type UpdateTrack, type UserProfile } from '@music-app/shared';
import { useLibrary, usePlayer, useOffline } from '../../src/context';
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
  HeartIcon,
  EditIcon,
  TrashIcon,
  CloseIcon,
  PlaylistIcon,
  DownloadIcon,
  HeadphonesIcon,
  MusicNoteIcon,
  FlameIcon,
  StarIcon,
  TrophyIcon,
  MoonIcon,
  MoreHorizontalIcon,
  PlayIcon,
  ShuffleIcon,
} from '../../src/components/icons/SvgIcons';
import { formatTime } from '../../src/utils/formatTime';
import { EqualizerIndicator } from '../../src/components/player/EqualizerIndicator';
import { statsStorage } from '../../src/services/stats/statsStorage';
import { EditTrackModal } from '../../src/components/EditTrackModal';
import { HiddenSettingsModal } from '../../src/components/HiddenSettingsModal';
import { CollectionDetailModal } from '../../src/components/CollectionDetailModal';

type LibrarySegment = 'songs' | 'albums' | 'artists';

function renderUserAvatar(profile: UserProfile | null, size = 18) {
  if (profile?.avatarUri) {
    return <Image source={{ uri: profile.avatarUri }} style={styles.avatarImg} resizeMode="cover" />;
  }
  const key = profile?.avatarKey || profile?.avatarEmoji || 'headphones';
  switch (key) {
    case 'disc':
      return <DiscIcon size={size} color={colors.primary} />;
    case 'note':
      return <MusicNoteIcon size={size} color={colors.primary} />;
    case 'heart':
      return <HeartIcon size={size} color={colors.primary} />;
    case 'flame':
      return <FlameIcon size={size} color={colors.primary} />;
    case 'star':
      return <StarIcon size={size} color={colors.primary} />;
    case 'trophy':
      return <TrophyIcon size={size} color={colors.primary} />;
    case 'moon':
      return <MoonIcon size={size} color={colors.primary} />;
    case 'headphones':
    default:
      return <HeadphonesIcon size={size} color={colors.primary} />;
  }
}

/**
 * Màn hình Thư viện âm nhạc chính thức (Thiết kế lại Pha 3)
 * - Header lớn chuẩn iOS kèm nhấn giữ để mở Cài đặt ẩn
 * - Phân đoạn: Bài hát | Album | Nghệ sĩ
 * - Menu '...' cho từng bài: Thả tim, Sửa metadata (EditTrackModal), Xóa bài
 * - Kéo xuống làm mới (Pull-to-Refresh) đồng bộ Cloudflare R2
 */
export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    statsStorage.loadUserProfile().then(setUserProfile).catch(() => { });
  }, []);

  useEffect(() => {
    // Lắng nghe sự kiện nhấn giữ tab Thư viện ở đáy màn hình
    const unsubscribe = navigation.addListener('tabLongPress' as never, () => {
      Vibration.vibrate([0, 50, 50, 50]);
      statsStorage.loadUserProfile().then(setUserProfile).catch(() => { });
      setHiddenSettingsVisible(true);
    });
    return unsubscribe;
  }, [navigation]);
  const {
    tracks,
    setTracks,
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
    setIsSmartShuffle,
    clearRecentTracks,
    handleTrackDeleted,
  } = usePlayer();

  const { isTrackOffline, downloadTrack, isDownloading } = useOffline();

  const { contentPaddingBottom } = useTabBarMetrics();

  const [activeSegment, setActiveSegment] = useState<LibrarySegment>('songs');
  const segmentSlideAnim = useRef(new Animated.Value(0)).current;
  const [segmentWidth, setSegmentWidth] = useState(0);

  const segmentIndex =
    activeSegment === 'songs' ? 0 : activeSegment === 'albums' ? 1 : 2;

  useEffect(() => {
    if (segmentWidth > 0) {
      Animated.spring(segmentSlideAnim, {
        toValue: segmentIndex * segmentWidth,
        useNativeDriver: true,
        friction: 9,
        tension: 70,
      }).start();
    }
  }, [segmentIndex, segmentWidth, segmentSlideAnim]);

  // Hiệu ứng mờ dần / hiện dần (Fade Transition) khi đổi phân đoạn thư viện
  const contentFadeAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    contentFadeAnim.setValue(0.5);
    Animated.timing(contentFadeAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [activeSegment, contentFadeAnim]);
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

  // Lọc chỉ những Album thực sự (loại bỏ Singles / Single / Đĩa đơn hoặc album chỉ có 1 bài đơn lẻ)
  const realAlbums = useMemo(() => {
    return (albums || []).filter((album) => {
      if (!album || !album.title) return false;
      const t = album.title.trim().toLowerCase();
      if (
        t === 'singles' ||
        t === 'single' ||
        t === 'đĩa đơn' ||
        t === 'unknown album' ||
        t === 'chưa rõ album'
      ) {
        return false;
      }
      const albumTracks = (tracks || []).filter((track) =>
        track.albumId && album.id ? track.albumId === album.id : track.album === album.title
      );
      // Album thực thụ phải có từ 2 bài trở lên (1 bài là Single / đĩa đơn)
      if (albumTracks.length <= 1) {
        return false;
      }
      return true;
    });
  }, [albums, tracks]);

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

  const handleShufflePlayAll = () => {
    if (tracks.length === 0) return;
    Vibration.vibrate(15);
    const shuffled = smartShuffle(tracks);
    setTracks(shuffled);
    setIsSmartShuffle(true);
    playQueue(shuffled, 0);
  };

  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    Vibration.vibrate(15);
    setIsSmartShuffle(false);
    playQueue(tracks, 0);
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
              <EqualizerIndicator isPlaying={playerState.isPlaying} size={15} color={colors.primary} />
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
            {isTrackOffline(item.id) && (
              <DownloadIcon size={11} color={colors.primary} />
            )}
          </View>
          <View style={styles.artistSubRow}>
            <Text style={styles.artistText} numberOfLines={1} ellipsizeMode="tail">
              {item.artist}
              {item.album && !['singles', 'single', 'đĩa đơn'].includes(item.album.trim().toLowerCase())
                ? ` • ${item.album}`
                : ''}
            </Text>
            {Boolean(item.album && ['singles', 'single', 'đĩa đơn'].includes(item.album.trim().toLowerCase())) && (
              <View style={styles.miniSingleBadge}>
                <Text style={styles.miniSingleBadgeText}>Single</Text>
              </View>
            )}
          </View>
        </View>

        {/* Thời lượng bài hát + Nút ba chấm (...) mở menu */}
        <View style={styles.rightActionCol}>
          {item.duration > 0 && (
            <Text style={styles.trackDurationText}>{formatTime(item.duration)}</Text>
          )}
          <TouchableOpacity
            style={styles.moreButton}
            onPress={(e) => handleOpenMenu(e, item)}
            activeOpacity={0.6}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={`Tùy chọn cho bài ${item.title}`}
          >
            <MoreHorizontalIcon size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // Render mục Album
  const renderAlbumItem = ({ item }: { item: (typeof albums)[0] }) => {
    if (!item) return null;
    const albumTitle = item.title || 'Chưa rõ Album';
    const albumArtist = item.artist || 'Chưa rõ nghệ sĩ';
    const albumTracks = (tracks || []).filter((t) =>
      t.albumId && item.id ? t.albumId === item.id : t.album === albumTitle
    );
    return (
      <TouchableOpacity
        style={styles.albumItem}
        activeOpacity={0.7}
        onPress={() => {
          Vibration.vibrate(10);
          setSelectedCollection({
            visible: true,
            title: albumTitle,
            subtitle: `${albumArtist} • ${albumTracks.length} bài hát`,
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
          {albumTitle}
        </Text>
        <Text style={styles.albumSubtitleText} numberOfLines={1}>
          {albumArtist} • {albumTracks.length} bài
        </Text>
      </TouchableOpacity>
    );
  };

  // Render mục Nghệ sĩ dạng thẻ nghệ thuật Grid 2 cột (Modern Artist Card)
  const renderArtistItem = ({ item }: { item: (typeof artistGroups)[0] }) => {
    return (
      <TouchableOpacity
        style={styles.artistCard}
        activeOpacity={0.75}
        onPress={() => {
          Vibration.vibrate(10);
          setSelectedCollection({
            visible: true,
            title: item.artist,
            subtitle: `${item.trackCount} tác phẩm trong thư viện`,
            coverUrl: item.cover,
            tracks: item.tracks,
            type: 'artist',
          });
        }}
      >
        <View style={styles.artistAvatarGlowRing}>
          {item.cover ? (
            <Image source={{ uri: item.cover }} style={styles.artistCardAvatar} resizeMode="cover" />
          ) : (
            <View style={styles.artistCardPlaceholder}>
              <DiscIcon size={36} color={colors.borderLight} />
            </View>
          )}
        </View>

        <Text style={styles.artistCardName} numberOfLines={1}>
          {item.artist}
        </Text>

        <View style={styles.artistTrackBadge}>
          <Text style={styles.artistTrackBadgeText}>
            {item.trackCount} BÀI HÁT
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header Thư viện: Tiêu đề + Nút Avatar/Cài đặt góc trên phải */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <TouchableOpacity
            onLongPress={handleTitleLongPress}
            delayLongPress={600}
            activeOpacity={0.9}
          >
            <Text style={styles.headerTitle}>Thư viện</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.avatarButton}
            onPress={() => {
              Vibration.vibrate(10);
              statsStorage.loadUserProfile().then(setUserProfile).catch(() => { });
              setHiddenSettingsVisible(true);
            }}
            activeOpacity={0.7}
            accessibilityLabel="Mở Cài đặt và Hồ sơ người dùng"
          >
            <View style={styles.avatarWrapper}>
              {renderUserAvatar(userProfile, 18)}
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.headerStatsText}>
          {tracks.length} bài hát • {formatTime(totalDurationSec)}
        </Text>

        {/* Hàng nút tác vụ nhanh: Phát ngẫu nhiên & Phát tất cả */}
        {tracks.length > 0 && (
          <View style={styles.quickActionsRow}>
            <TouchableOpacity
              style={styles.shufflePlayButton}
              onPress={handleShufflePlayAll}
              activeOpacity={0.8}
            >
              <ShuffleIcon size={17} color="#000000" />
              <Text style={styles.shufflePlayButtonText}>Phát ngẫu nhiên</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.playAllButton}
              onPress={handlePlayAll}
              activeOpacity={0.7}
            >
              <PlayIcon size={15} color={colors.textPrimary} />
              <Text style={styles.playAllButtonText}>Phát tất cả</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Thanh chọn phân đoạn Segmented Control với hiệu ứng trượt mượt mà (Smooth Sliding Active Pill) */}
        <View
          style={styles.segmentContainer}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0) {
              setSegmentWidth((w - 6) / 3);
            }
          }}
        >
          {segmentWidth > 0 && (
            <Animated.View
              style={[
                styles.segmentPillIndicator,
                {
                  width: segmentWidth,
                  transform: [{ translateX: segmentSlideAnim }],
                },
              ]}
            />
          )}

          <TouchableOpacity
            style={styles.segmentButton}
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
            style={styles.segmentButton}
            onPress={() => setActiveSegment('albums')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.segmentText,
                activeSegment === 'albums' && styles.segmentTextActive,
              ]}
            >
              Album ({realAlbums.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.segmentButton}
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

      {/* Nội dung danh sách theo phân đoạn đã chọn (chuyển cảnh fade mượt mà) */}
      < Animated.View style={{ flex: 1, opacity: contentFadeAnim }}>
        {activeSegment === 'songs' ? (
          <FlatList
            key="flatlist-songs"
            data={tracks}
            keyExtractor={(item, index) => (item?.id ? `song-${item.id}` : `song-${index}`)}
            renderItem={renderTrackItem}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: contentPaddingBottom },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={isSyncing}
                onRefresh={() => syncLibrary({ silent: false, force: true })}
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
            key="flatlist-albums"
            data={realAlbums}
            keyExtractor={(item, index) => (item?.id ? `album-${item.id}` : `album-${index}`)}
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
            key="flatlist-artists"
            data={artistGroups}
            keyExtractor={(item, index) => (item?.artist ? `artist-${item.artist}` : `artist-${index}`)}
            renderItem={renderArtistItem}
            numColumns={2}
            columnWrapperStyle={styles.artistColumnWrapper}
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
      </Animated.View>

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

                {/* Nút Tải bài hát về máy (Offline) */}
                <TouchableOpacity
                  style={styles.sheetActionBtn}
                  onPress={async () => {
                    if (selectedTrackForMenu) {
                      setActionSheetVisible(false);
                      if (isTrackOffline(selectedTrackForMenu.id)) {
                        Alert.alert('Đã tải', 'Bài hát này đã có sẵn trên máy của bạn.');
                      } else {
                        await downloadTrack(selectedTrackForMenu);
                      }
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <DownloadIcon
                    size={20}
                    color={
                      isTrackOffline(selectedTrackForMenu.id)
                        ? colors.primary
                        : colors.textPrimary
                    }
                  />
                  <Text
                    style={[
                      styles.sheetActionText,
                      isTrackOffline(selectedTrackForMenu.id) && { color: colors.primary },
                    ]}
                  >
                    {isDownloading[selectedTrackForMenu.id]
                      ? 'Đang tải về máy...'
                      : isTrackOffline(selectedTrackForMenu.id)
                        ? 'Đã tải về máy (Offline)'
                        : 'Tải bài hát về máy (Offline)'}
                  </Text>
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
        onProfileUpdated={(updated) => setUserProfile(updated)}
        onClose={() => {
          setHiddenSettingsVisible(false);
          statsStorage.loadUserProfile().then(setUserProfile).catch(() => { });
        }}
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
    </View >
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
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarButton: {
    padding: spacing.xxs,
  },
  avatarWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
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
    marginBottom: spacing.xs,
  },
  quickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  shufflePlayButton: {
    flex: 1.15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  shufflePlayButtonText: {
    color: '#000000',
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.bold,
  },
  playAllButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  playAllButtonText: {
    color: colors.textPrimary,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.semibold,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  segmentPillIndicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    backgroundColor: colors.surfaceActive,
    borderRadius: radius.pill,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    borderRadius: radius.pill,
    zIndex: 1,
    backgroundColor: 'transparent',
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
    flexShrink: 1,
  },
  artistSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  miniSingleBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  miniSingleBadgeText: {
    fontSize: 9.5,
    fontWeight: fontWeights.medium,
    color: 'rgba(255, 255, 255, 0.45)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rightActionCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trackDurationText: {
    fontSize: fontSizes.caption,
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
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
  artistColumnWrapper: {
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  artistCard: {
    flex: 1,
    maxWidth: '48%',
    backgroundColor: 'rgba(28, 28, 30, 0.72)',
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  artistAvatarGlowRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 2,
    borderColor: 'rgba(29, 185, 84, 0.45)',
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  artistCardAvatar: {
    width: '100%',
    height: '100%',
  },
  artistCardPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceActive,
  },
  artistCardName: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  artistTrackBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  artistTrackBadgeText: {
    color: colors.primary,
    fontSize: 9.5,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.5,
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
