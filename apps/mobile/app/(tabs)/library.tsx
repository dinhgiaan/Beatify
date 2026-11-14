import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Vibration,
  StyleSheet,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRouter, useFocusEffect } from 'expo-router';
import { smartShuffle, type Track, type UpdateTrack, type UserProfile } from '@music-app/shared';
import { useLibrary, usePlayer, useOffline } from '../../src/context';
import { useTabBarMetrics } from '../../src/hooks/useTabBarMetrics';
import { TrackActionSheet } from '../../src/components/sheet/TrackActionSheet';
import { ScrollToTopButton } from '../../src/components/common/ScrollToTopButton';
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
  CloudSyncIcon,
} from '../../src/components/icons/SvgIcons';
import { formatTime } from '../../src/utils/formatTime';
import { EqualizerIndicator } from '../../src/components/player/EqualizerIndicator';
import { statsStorage } from '../../src/services/stats/statsStorage';
import { EditTrackModal } from '../../src/components/EditTrackModal';
import { CollectionDetailModal } from '../../src/components/CollectionDetailModal';
import { AddToPlaylistModal } from '../../src/components/AddToPlaylistModal';
import { triggerSelectionHaptic } from '../../src/utils/haptics';

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
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useFocusEffect(
    useCallback(() => {
      statsStorage.loadUserProfile().then(setUserProfile).catch(() => { });
    }, [])
  );

  useEffect(() => {
    // Lắng nghe sự kiện nhấn giữ tab Thư viện ở đáy màn hình
    const unsubscribe = navigation.addListener('tabLongPress' as never, () => {
      Vibration.vibrate([0, 50, 50, 50]);
      router.push('/settings');
    });
    return unsubscribe;
  }, [navigation, router]);
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
    playQueue,
    playNext,
    togglePlay,
    setIsSmartShuffle,
    clearRecentTracks,
    handleTrackDeleted,
  } = usePlayer();

  const { isTrackOffline, downloadTrack, deleteOfflineTrack, isDownloading } = useOffline();

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


  // State bộ lọc thể loại & tag thông minh (Filter Pills)
  const [activeFilter, setActiveFilter] = useState<string>('all');

  // Top bài hát nghe nhiều nhất
  const [topTrackIds, setTopTrackIds] = useState<string[]>([]);
  useEffect(() => {
    statsStorage.getReplayReport().then((rep) => {
      if (rep?.allTime?.topTracks) {
        setTopTrackIds(rep.allTime.topTracks.map((t: { trackId: string }) => t.trackId));
      }
    }).catch(() => { });
  }, [tracks]);


  // Indicator animated slide chuyển động mượt mà cho thanh filter pills
  const songsListRef = useRef<FlatList>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const pillIndicatorLeft = useRef(new Animated.Value(0)).current;
  const pillIndicatorWidth = useRef(new Animated.Value(0)).current;
  const pillLayouts = useRef<{ [id: string]: { x: number; width: number } }>({});
  const [hasIndicatorLayout, setHasIndicatorLayout] = useState(false);

  const updatePillIndicator = (targetId: string, animated = true) => {
    const layout = pillLayouts.current[targetId];
    if (layout && layout.width > 0) {
      if (!animated) {
        pillIndicatorLeft.setValue(layout.x);
        pillIndicatorWidth.setValue(layout.width);
        setHasIndicatorLayout(true);
      } else {
        setHasIndicatorLayout(true);
        Animated.parallel([
          Animated.spring(pillIndicatorLeft, {
            toValue: layout.x,
            useNativeDriver: false,
            friction: 9,
            tension: 70,
          }),
          Animated.spring(pillIndicatorWidth, {
            toValue: layout.width,
            useNativeDriver: false,
            friction: 9,
            tension: 70,
          }),
        ]).start();
      }
    }
  };

  useEffect(() => {
    updatePillIndicator(activeFilter, hasIndicatorLayout);
  }, [activeFilter, hasIndicatorLayout]);
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


  // Hiệu ứng xoay tròn khi đang đồng bộ R2
  const spinAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isSyncing) {
      const loop = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        })
      );
      loop.start();
      return () => loop.stop();
    } else {
      spinAnim.setValue(0);
    }
  }, [isSyncing, spinAnim]);

  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const handleHotReload = async () => {
    Vibration.vibrate(20);
    try {
      await syncLibrary({ force: true });
    } catch {
      // lỗi đã được xử lý trong context
    }
  };

  // Danh sách các tag thể loại & bộ lọc ngang hàng với nút Profile
  const filterOptions = useMemo(() => {
    const list: Array<{ id: string; label: string }> = [
      { id: 'all', label: 'Tất cả' },
      { id: 'favorites', label: 'Yêu thích' },
      { id: 'top_played', label: 'Nghe nhiều nhất' },
    ];

    const hasOffline = (tracks || []).some((t) => isTrackOffline(t.id));
    if (hasOffline) {
      list.push({ id: 'offline', label: 'Đã tải' });
    }

    const hasSingles = (tracks || []).some(
      (t) => t.album && ['singles', 'single', 'đĩa đơn'].includes(t.album.trim().toLowerCase())
    );
    if (hasSingles) {
      list.push({ id: 'singles', label: 'Singles' });
    }

    const genresSet = new Set<string>();
    for (const t of tracks || []) {
      if (t.genre && t.genre.trim()) {
        genresSet.add(t.genre.trim());
      }
    }
    for (const g of genresSet) {
      list.push({ id: `genre_${g.toLowerCase()}`, label: g });
    }

    return list;
  }, [tracks, isTrackOffline]);

  // Lọc danh sách bài hát theo Tag đã chọn
  const filteredTracks = useMemo(() => {
    if (activeFilter === 'all') return tracks;
    if (activeFilter === 'favorites') {
      return tracks.filter((t) => userState.favoriteIds.includes(t.id));
    }
    if (activeFilter === 'top_played') {
      if (topTrackIds.length === 0) return tracks;
      const rankMap = new Map<string, number>();
      topTrackIds.forEach((id, idx) => rankMap.set(id, idx));
      const listened = tracks.filter((t) => rankMap.has(t.id));
      listened.sort((a, b) => (rankMap.get(a.id) ?? 9999) - (rankMap.get(b.id) ?? 9999));
      const rest = tracks.filter((t) => !rankMap.has(t.id));
      return [...listened, ...rest];
    }
    if (activeFilter === 'offline') {
      return tracks.filter((t) => isTrackOffline(t.id));
    }
    if (activeFilter === 'singles') {
      return tracks.filter(
        (t) => t.album && ['singles', 'single', 'đĩa đơn'].includes(t.album.trim().toLowerCase())
      );
    }
    if (activeFilter.startsWith('genre_')) {
      const g = activeFilter.replace('genre_', '').toLowerCase();
      return tracks.filter((t) => (t.genre || '').toLowerCase() === g);
    }
    return tracks;
  }, [tracks, activeFilter, userState.favoriteIds, isTrackOffline, topTrackIds]);


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
      const idx = filteredTracks.findIndex((t) => t.id === item.id);
      playQueue(filteredTracks, idx >= 0 ? idx : 0);
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

  const handleSaveTrack = async (trackId: string, updates: UpdateTrack) => {
    await saveTrack(trackId, updates);
  };

  const handleDeleteFromModal = async (trackId: string) => {
    await deleteTrack(trackId, handleTrackDeleted);
  };

  const handleShufflePlayAll = () => {
    if (filteredTracks.length === 0) return;
    Vibration.vibrate(15);
    const shuffled = smartShuffle(filteredTracks);
    if (activeFilter === 'all') {
      setTracks(shuffled);
    }
    setIsSmartShuffle(true);
    playQueue(shuffled, 0);
  };

  const handlePlayAll = () => {
    if (filteredTracks.length === 0) return;
    Vibration.vibrate(15);
    setIsSmartShuffle(false);
    playQueue(filteredTracks, 0);
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
      {/* Header Trang chủ: Button Profile + Dải Filter Tags ngang hàng + Button Hot Reload R2 */}
      <View style={styles.header}>
        <View style={styles.topHeaderRow}>
          {/* 1. Button Profile tròn góc trái */}
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => {
              triggerSelectionHaptic();
              router.push('/settings');
            }}
            activeOpacity={0.75}
            accessibilityLabel="Mở Cài đặt và Hồ sơ người dùng"
          >
            <View style={styles.profileAvatarWrapper}>
              {renderUserAvatar(userProfile, 17)}
            </View>
          </TouchableOpacity>

          {/* 2. Dải Filter Tags ngang hàng (Tất cả, Yêu thích, Nghe nhiều nhất...) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterPillsScroll}
            style={styles.filterScrollView}
          >
            {/* Lớp nền viên thuốc động lướt mượt mà giữa các filter tags */}
            {hasIndicatorLayout && (
              <Animated.View
                style={[
                  styles.filterPillActiveIndicator,
                  {
                    left: pillIndicatorLeft,
                    width: pillIndicatorWidth,
                  },
                ]}
                pointerEvents="none"
              />
            )}

            {filterOptions.map((filter) => {
              const isSelected = activeFilter === filter.id;
              return (
                <TouchableOpacity
                  key={filter.id}
                  onLayout={(e) => {
                    const { x, width } = e.nativeEvent.layout;
                    pillLayouts.current[filter.id] = { x, width };
                    if (filter.id === activeFilter) {
                      updatePillIndicator(filter.id, hasIndicatorLayout);
                    }
                  }}
                  style={[
                    styles.filterPill,
                    isSelected ? styles.filterPillSelected : styles.filterPillUnselected,
                  ]}
                  onPress={() => {
                    Vibration.vibrate(8);
                    setActiveFilter(filter.id);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      isSelected && styles.filterPillTextActive,
                    ]}
                  >
                    {filter.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* 3. Nút Hot Reload R2 */}
          <View style={styles.headerToolButtonsRow}>
            <TouchableOpacity
              style={[styles.hotReloadButton, isSyncing && styles.hotReloadButtonSyncing]}
              onPress={handleHotReload}
              activeOpacity={0.7}
              disabled={isSyncing}
              accessibilityLabel="Đồng bộ lại từ Cloudflare R2"
            >
              <Animated.View style={{ transform: [{ rotate: spinInterpolate }] }}>
                <CloudSyncIcon size={17} color={isSyncing ? colors.primary : colors.textPrimary} />
              </Animated.View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Hàng nút tác vụ nhanh: Phát ngẫu nhiên & Phát tất cả */}
        {filteredTracks.length > 0 && (
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
            ref={songsListRef}
            key="flatlist-songs"
            data={filteredTracks}
            keyExtractor={(item, index) => (item?.id ? `song-${item.id}` : `song-${index}`)}
            renderItem={renderTrackItem}
            onScroll={(e) => {
              const y = e.nativeEvent.contentOffset.y;
              setShowScrollTop(y > 350);
            }}
            scrollEventThrottle={16}
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
              tracks.length > 0 ? (
                <View style={styles.emptyContainer}>
                  <DiscIcon size={44} color={colors.borderLight} />
                  <Text style={styles.emptyText}>Chưa có bài hát trong mục này</Text>
                  <Text style={styles.emptySubText}>
                    Không tìm thấy bài hát nào thuộc bộ lọc "{filterOptions.find((f) => f.id === activeFilter)?.label}".
                  </Text>
                  <TouchableOpacity
                    style={styles.resetFilterButton}
                    onPress={() => {
                      Vibration.vibrate(8);
                      setActiveFilter('all');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.resetFilterButtonText}>Xem tất cả bài hát</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <DiscIcon size={48} color={colors.borderLight} />
                  <Text style={styles.emptyText}>Thư viện chưa có bài hát nào</Text>
                  <Text style={styles.emptySubText}>
                    Kéo xuống hoặc bấm nút Cloud trên thanh tiêu đề để đồng bộ bài hát từ Cloudflare R2.
                  </Text>
                </View>
              )
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

      {/* Action Sheet Menu bài hát phong cách tối giản Apple / Hip-hop */}
      <TrackActionSheet
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        track={selectedTrackForMenu}
        coverUrl={selectedTrackForMenu?.cover || null}
        isFavorite={selectedTrackForMenu ? userState.favoriteIds.includes(selectedTrackForMenu.id) : false}
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
        onPlayNext={(t) => {
          if (t) playNext(t);
        }}
        onToggleFavorite={() => {
          handleMenuFavorite();
        }}
        onAddToPlaylist={() => {
          handleOpenAddToPlaylist();
        }}
        onDownloadPress={async (t, status) => {
          if (status === 'downloaded') {
            await deleteOfflineTrack(t.id);
          } else if (status === 'idle' || status === 'error') {
            await downloadTrack(t);
          }
        }}
        onEditInfo={() => {
          handleMenuEdit();
        }}
        onDeleteFromLibrary={async (t) => {
          await deleteTrack(t.id, handleTrackDeleted);
        }}
      />

      {/* Modal Chỉnh sửa bài hát (tái dùng EditTrackModal) */}
      <EditTrackModal
        visible={editModalVisible}
        track={editingTrack}
        onClose={() => setEditModalVisible(false)}
        onSave={handleSaveTrack}
        onDelete={handleDeleteFromModal}
        onFetchLyrics={fetchLyrics}
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
      <AddToPlaylistModal
        visible={addToPlaylistModalVisible}
        track={selectedTrackForMenu}
        userState={userState}
        onClose={() => setAddToPlaylistModalVisible(false)}
        onUpdateUserState={updateUserState}
      />
      {/* Nút Cuộn lên đầu trang với animation mũi tên nhảy lên nhảy xuống mượt mà */ }
  <ScrollToTopButton
    visible={showScrollTop}
    onPress={() => {
      songsListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }}
  />
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
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  profileButton: {
    padding: 2,
  },
  profileAvatarWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterScrollView: {
    flex: 1,
  },
  filterPillsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  filterPillActiveIndicator: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    zIndex: 1,
  },
  filterPill: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    zIndex: 2,
  },
  filterPillUnselected: {
    backgroundColor: colors.surfaceElevated,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  filterPillSelected: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
  },
  filterPillTextActive: {
    color: '#000000',
    fontWeight: fontWeights.bold,
  },
  headerToolButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  randomizeListButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hotReloadButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hotReloadButtonSyncing: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  headerStatsRow: {
    paddingVertical: 4,
    marginBottom: spacing.xs,
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
  brandTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    marginBottom: 4,
  },
  brandTagText: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
    color: colors.primary,
    letterSpacing: 1.5,
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
    marginTop: 4,
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
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  segmentPillIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    backgroundColor: colors.surfaceActive,
    borderRadius: radius.pill,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: radius.pill,
    zIndex: 1,
    backgroundColor: 'transparent',
  },
  segmentText: {
    fontSize: 13,
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
  resetFilterButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  resetFilterButtonText: {
    color: colors.primary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
  },
});
