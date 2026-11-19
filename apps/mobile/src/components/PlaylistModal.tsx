import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Image,
  Dimensions,
  LayoutAnimation,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
} from 'react-native-reanimated';
import type { Track, UserState, Playlist } from '@music-app/shared';
import {
  CloseIcon,
  PlusIcon,
  PlaylistIcon,
  HeartIcon,
  PlayIcon,
  PauseIcon,
  TrashIcon,
  CheckIcon,
  DiscIcon,
} from './icons/SvgIcons';

export interface PlaylistModalProps {
  visible: boolean;
  onClose: () => void;
  userState: UserState;
  onUpdateUserState: (updater: (prev: UserState) => UserState) => Promise<void>;
  libraryTracks: Track[];
  onPlayTrack: (track: Track) => void;
  currentTrackId?: string | null;
  isPlaying?: boolean;
}

export function PlaylistModal({
  visible,
  onClose,
  userState,
  onUpdateUserState,
  libraryTracks,
  onPlayTrack,
  currentTrackId,
  isPlaying,
}: PlaylistModalProps) {
  const [activeTab, setActiveTab] = useState<'playlists' | 'favorites'>('playlists');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);

  // Reanimated sliding active pill cho tab switcher Playlist / Favorites
  const activeTabIdx = activeTab === 'playlists' ? 0 : 1;
  const activeTabShared = useSharedValue(activeTabIdx);
  const screenWidth = Dimensions.get('window').width;
  const tabTrackWidthShared = useSharedValue(Math.max(screenWidth - 32, 280));

  useEffect(() => {
    activeTabShared.value = withSpring(activeTab === 'playlists' ? 0 : 1, {
      damping: 20,
      stiffness: 160,
      mass: 0.7,
    });
  }, [activeTab, activeTabShared]);

  const pillAnimStyle = useAnimatedStyle(() => {
    const availableWidth = Math.max(0, tabTrackWidthShared.value - 6);
    const itemWidth = availableWidth / 2;
    return {
      width: itemWidth > 0 ? itemWidth : 0,
      transform: [
        {
          translateX: activeTabShared.value * itemWidth,
        },
      ],
      opacity: tabTrackWidthShared.value > 0 ? 1 : 0,
    };
  });

  const handleSwitchTab = (tab: 'playlists' | 'favorites') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveTab(tab);
    setSelectedPlaylistId(null);
  };

  const handleSelectPlaylist = (id: string | null) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedPlaylistId(id);
  };

  // Trạng thái tạo playlist
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');

  const toggleCreating = (enable: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsCreating(enable);
  };

  // Trạng thái thêm bài hát vào playlist
  const [isAddingTracks, setIsAddingTracks] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);

  const tracksMap = useMemo(() => {
    const map = new Map<string, Track>();
    for (const t of libraryTracks) {
      map.set(t.id, t);
    }
    return map;
  }, [libraryTracks]);

  // Playlist hiện đang chọn
  const activePlaylist = useMemo(() => {
    if (!selectedPlaylistId) return null;
    return userState.playlists.find((p) => p.id === selectedPlaylistId) || null;
  }, [userState.playlists, selectedPlaylistId]);

  // Danh sách bài trong active playlist
  const activePlaylistTracks = useMemo(() => {
    if (!activePlaylist) return [];
    return activePlaylist.trackIds
      .map((id) => tracksMap.get(id))
      .filter((t): t is Track => Boolean(t));
  }, [activePlaylist, tracksMap]);

  // Danh sách bài yêu thích
  const favoriteTracks = useMemo(() => {
    return userState.favoriteIds
      .map((id) => tracksMap.get(id))
      .filter((t): t is Track => Boolean(t));
  }, [userState.favoriteIds, tracksMap]);

  // Tạo Playlist mới
  const handleCreate = async () => {
    const trimmed = newPlaylistName.trim();
    if (!trimmed) {
      Alert.alert('Lỗi', 'Vui lòng nhập tên danh sách phát');
      return;
    }

    const now = new Date().toISOString();
    const newPlaylist: Playlist = {
      id: 'pl_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      name: trimmed,
      description: newPlaylistDesc.trim() || undefined,
      trackIds: [],
      createdAt: now,
      updatedAt: now,
    };

    await onUpdateUserState((prev) => ({
      ...prev,
      playlists: [newPlaylist, ...prev.playlists],
    }));

    toggleCreating(false);
    setNewPlaylistName('');
    setNewPlaylistDesc('');
    handleSelectPlaylist(newPlaylist.id);
  };

  // Xóa Playlist
  const handleDeletePlaylist = (playlist: Playlist) => {
    Alert.alert(
      'Xóa danh sách phát',
      `Bạn có chắc chắn muốn xóa "${playlist.name}"? Dữ liệu sẽ đồng bộ xóa trên đám mây và PC.`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            await onUpdateUserState((prev) => ({
              ...prev,
              playlists: prev.playlists.filter((p) => p.id !== playlist.id),
            }));
            if (selectedPlaylistId === playlist.id) {
              setSelectedPlaylistId(null);
            }
          },
        },
      ]
    );
  };

  // Thêm bài hát vào playlist
  const handleConfirmAddTracks = async () => {
    if (!selectedPlaylistId || selectedTrackIds.length === 0) {
      setIsAddingTracks(false);
      return;
    }

    await onUpdateUserState((prev) => ({
      ...prev,
      playlists: prev.playlists.map((pl) => {
        if (pl.id !== selectedPlaylistId) return pl;
        const currentSet = new Set(pl.trackIds);
        for (const tid of selectedTrackIds) {
          currentSet.add(tid);
        }
        return {
          ...pl,
          trackIds: Array.from(currentSet),
          updatedAt: new Date().toISOString(),
        };
      }),
    }));

    setIsAddingTracks(false);
    setSelectedTrackIds([]);
  };

  // Xóa bài hát khỏi playlist
  const handleRemoveTrack = async (trackId: string) => {
    if (!selectedPlaylistId) return;
    await onUpdateUserState((prev) => ({
      ...prev,
      playlists: prev.playlists.map((pl) => {
        if (pl.id !== selectedPlaylistId) return pl;
        return {
          ...pl,
          trackIds: pl.trackIds.filter((id) => id !== trackId),
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  };

  // Toggle Favorite
  const handleToggleFavorite = async (trackId: string) => {
    const isFav = userState.favoriteIds.includes(trackId);
    await onUpdateUserState((prev) => ({
      ...prev,
      favoriteIds: isFav
        ? prev.favoriteIds.filter((id) => id !== trackId)
        : [...prev.favoriteIds, trackId],
    }));
  };

  // Bộ lọc bài hát khi thêm vào playlist
  const candidateTracks = useMemo(() => {
    if (!activePlaylist) return [];
    const currentSet = new Set(activePlaylist.trackIds);
    const q = searchQuery.toLowerCase().trim();
    return libraryTracks.filter((t) => {
      if (currentSet.has(t.id)) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        (t.album && t.album.toLowerCase().includes(q))
      );
    });
  }, [libraryTracks, activePlaylist, searchQuery]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose} activeOpacity={0.7}>
            <CloseIcon size={20} color="#ffffff" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Tuyển tập âm nhạc</Text>
            <Text style={styles.headerSubtitle}>Đồng bộ 2 chiều với Cloudflare R2</Text>
          </View>

          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => toggleCreating(true)}
            activeOpacity={0.7}
          >
            <PlusIcon size={16} color="#1DB954" />
            <Text style={styles.createText}>Tạo mới</Text>
          </TouchableOpacity>
        </View>

        {/* Tab switcher với sliding active pill mượt mà */}
        <View style={styles.tabTrackContainer}>
          <View
            style={styles.tabTrack}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w > 0) tabTrackWidthShared.value = w;
            }}
          >
            <Animated.View style={[styles.slidingActivePill, pillAnimStyle]} pointerEvents="none" />

            <TouchableOpacity
              style={styles.tabBtn}
              onPress={() => handleSwitchTab('playlists')}
              activeOpacity={0.7}
            >
              <PlaylistIcon size={16} color={activeTab === 'playlists' ? '#000000' : '#a1a1aa'} />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'playlists' ? styles.tabTextActive : styles.tabTextInactive,
                ]}
              >
                Playlist ({userState.playlists.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.tabBtn}
              onPress={() => handleSwitchTab('favorites')}
              activeOpacity={0.7}
            >
              <HeartIcon
                size={16}
                color={activeTab === 'favorites' ? '#000000' : '#a1a1aa'}
                fill={activeTab === 'favorites' ? '#000000' : 'none'}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'favorites' ? styles.tabTextActive : styles.tabTextInactive,
                ]}
              >
                Yêu thích ({userState.favoriteIds.length})
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Body content */}
        {activeTab === 'playlists' ? (
          !selectedPlaylistId ? (
            /* Danh sách các playlist */
            userState.playlists.length === 0 ? (
              <Animated.View key="pl-empty" entering={FadeIn.duration(200)} style={styles.centerBox}>
                <View style={styles.emptyIconCircle}>
                  <PlaylistIcon size={36} color="#71717a" />
                </View>
                <Text style={styles.emptyTitle}>Chưa có Playlist nào</Text>
                <Text style={styles.emptyDesc}>
                  Bấm "Tạo mới" ở góc phải trên để tạo Playlist đầu tiên. Dữ liệu sẽ đồng bộ tự động với máy tính.
                </Text>
                <TouchableOpacity
                  style={styles.actionBtnPrimary}
                  onPress={() => toggleCreating(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.actionBtnPrimaryText}>+ Tạo Playlist</Text>
                </TouchableOpacity>
              </Animated.View>
            ) : (
              <Animated.View key="pl-list" entering={FadeIn.duration(200)} style={{ flex: 1 }}>
                <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
                  {userState.playlists.map((pl) => (
                    <TouchableOpacity
                      key={pl.id}
                      style={styles.playlistCard}
                      onPress={() => handleSelectPlaylist(pl.id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.playlistCardIcon}>
                        <PlaylistIcon size={24} color="#1DB954" />
                      </View>
                      <View style={styles.playlistCardInfo}>
                        <Text style={styles.playlistCardTitle} numberOfLines={1}>
                          {pl.name}
                        </Text>
                        <Text style={styles.playlistCardMeta}>
                          {pl.trackIds.length} bài hát {pl.description ? `• ${pl.description}` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.deleteMiniBtn}
                        onPress={() => handleDeletePlaylist(pl)}
                        activeOpacity={0.6}
                      >
                        <TrashIcon size={16} color="#71717a" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </Animated.View>
            )
          ) : (
            /* Chi tiết Playlist */
            activePlaylist && (
              <Animated.View
                key={`pl-detail-${activePlaylist.id}`}
                entering={FadeIn.duration(200)}
                style={styles.detailContainer}
              >
                <View style={styles.detailHeader}>
                  <TouchableOpacity
                    style={styles.backBtn}
                    onPress={() => handleSelectPlaylist(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.backBtnText}>← Danh sách</Text>
                  </TouchableOpacity>

                  <View style={styles.detailActions}>
                    <TouchableOpacity
                      style={styles.addTrackBtn}
                      onPress={() => setIsAddingTracks(true)}
                      activeOpacity={0.7}
                    >
                      <PlusIcon size={15} color="#1DB954" />
                      <Text style={styles.addTrackBtnText}>Thêm bài</Text>
                    </TouchableOpacity>

                    {activePlaylistTracks.length > 0 && (
                      <TouchableOpacity
                        style={styles.playAllBtn}
                        onPress={() => {
                          const first = activePlaylistTracks[0];
                          if (first) onPlayTrack(first);
                        }}
                        activeOpacity={0.8}
                      >
                        <PlayIcon size={14} color="#000000" />
                        <Text style={styles.playAllBtnText}>Phát</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <View style={styles.playlistBanner}>
                  <Text style={styles.bannerTitle} numberOfLines={1}>
                    {activePlaylist.name}
                  </Text>
                  <Text style={styles.bannerMeta}>
                    {activePlaylistTracks.length} bài hát {activePlaylist.description ? `• ${activePlaylist.description}` : ''}
                  </Text>
                </View>

                {activePlaylistTracks.length === 0 ? (
                  <View style={styles.centerBox}>
                    <Text style={styles.emptyTitle}>Playlist này còn trống</Text>
                    <Text style={styles.emptyDesc}>Bấm "Thêm bài" bên trên để chọn bài hát từ thư viện vào đây.</Text>
                  </View>
                ) : (
                  <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
                    {activePlaylistTracks.map((track) => {
                      const isPlayingThis = currentTrackId === track.id && isPlaying;
                      return (
                        <View key={track.id} style={styles.trackRow}>
                          <TouchableOpacity
                            style={styles.trackPlayBtn}
                            onPress={() => onPlayTrack(track)}
                            activeOpacity={0.7}
                          >
                            {isPlayingThis ? (
                              <PauseIcon size={18} color="#1DB954" />
                            ) : (
                              <PlayIcon size={18} color="#ffffff" />
                            )}
                          </TouchableOpacity>

                          {/* Ảnh bìa bài hát trong Playlist */}
                          <View style={styles.trackCoverWrapper}>
                            {track.cover ? (
                              <Image source={{ uri: track.cover }} style={styles.trackCoverImg} resizeMode="cover" />
                            ) : (
                              <View style={styles.trackCoverPlaceholder}>
                                <DiscIcon size={16} color="#71717a" />
                              </View>
                            )}
                          </View>

                          <View style={styles.trackInfo}>
                            <Text
                              style={[styles.trackTitle, isPlayingThis && styles.trackTitleActive]}
                              numberOfLines={1}
                            >
                              {track.title}
                            </Text>
                            <Text style={styles.trackArtist} numberOfLines={1}>
                              {track.artist}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={styles.trackRemoveBtn}
                            onPress={() => handleRemoveTrack(track.id)}
                            activeOpacity={0.7}
                          >
                            <CloseIcon size={16} color="#71717a" />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </ScrollView>
                )}
              </Animated.View>
            )
          )
        ) : (
          /* TAB 2: YÊU THÍCH */
          favoriteTracks.length === 0 ? (
            <Animated.View key="fav-empty" entering={FadeIn.duration(200)} style={styles.centerBox}>
              <View style={[styles.emptyIconCircle, { backgroundColor: '#261217' }]}>
                <HeartIcon size={36} color="#f43f5e" fill="#f43f5e" />
              </View>
              <Text style={styles.emptyTitle}>Chưa có bài hát yêu thích</Text>
              <Text style={styles.emptyDesc}>
                Nhấn vào biểu tượng trái tim khi đang phát nhạc hoặc trên Web để lưu bài hát vào danh sách này.
              </Text>
            </Animated.View>
          ) : (
            <Animated.View key="fav-list" entering={FadeIn.duration(200)} style={{ flex: 1 }}>
              <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
                {favoriteTracks.map((track) => {
                  const isPlayingThis = currentTrackId === track.id && isPlaying;
                  return (
                    <View key={track.id} style={styles.trackRow}>
                      <TouchableOpacity
                        style={styles.trackPlayBtn}
                        onPress={() => onPlayTrack(track)}
                        activeOpacity={0.7}
                      >
                        {isPlayingThis ? (
                          <PauseIcon size={18} color="#1DB954" />
                        ) : (
                          <PlayIcon size={18} color="#ffffff" />
                        )}
                      </TouchableOpacity>

                      {/* Ảnh bìa bài hát yêu thích */}
                      <View style={styles.trackCoverWrapper}>
                        {track.cover ? (
                          <Image source={{ uri: track.cover }} style={styles.trackCoverImg} resizeMode="cover" />
                        ) : (
                          <View style={styles.trackCoverPlaceholder}>
                            <DiscIcon size={16} color="#71717a" />
                          </View>
                        )}
                      </View>

                      <View style={styles.trackInfo}>
                        <Text
                          style={[styles.trackTitle, isPlayingThis && styles.trackTitleActive]}
                          numberOfLines={1}
                        >
                          {track.title}
                        </Text>
                        <Text style={styles.trackArtist} numberOfLines={1}>
                          {track.artist}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={styles.favToggleBtn}
                        onPress={() => handleToggleFavorite(track.id)}
                        activeOpacity={0.7}
                      >
                        <HeartIcon size={18} color="#f43f5e" fill="#f43f5e" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            </Animated.View>
          )
        )}

        {/* MODAL CON: TẠO PLAYLIST */}
        <Modal visible={isCreating} transparent animationType="fade">
          <View style={styles.dialogOverlay}>
            <View style={styles.dialogCard}>
              <Text style={styles.dialogTitle}>Tạo Playlist mới</Text>

              <TextInput
                style={styles.dialogInput}
                placeholder="Tên Playlist (ví dụ: Acoustic, Chill...)"
                placeholderTextColor="#71717a"
                value={newPlaylistName}
                onChangeText={setNewPlaylistName}
                autoFocus
              />


              <TextInput
                style={[styles.dialogInput, { height: 64 }]}
                placeholder="Mô tả ngắn (tùy chọn)..."
                placeholderTextColor="#71717a"
                value={newPlaylistDesc}
                onChangeText={setNewPlaylistDesc}
                multiline
              />

              <View style={styles.dialogActions}>
                <TouchableOpacity
                  style={styles.dialogCancelBtn}
                  onPress={() => toggleCreating(false)}
                >
                  <Text style={styles.dialogCancelText}>Hủy</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.dialogSubmitBtn} onPress={handleCreate}>
                  <Text style={styles.dialogSubmitText}>Tạo Playlist</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL CON: THÊM BÀI HÁT VÀO PLAYLIST */}
        <Modal visible={isAddingTracks} presentationStyle="pageSheet" animationType="slide">
          <SafeAreaView style={styles.container}>
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => setIsAddingTracks(false)}
              >
                <CloseIcon size={20} color="#ffffff" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Thêm bài hát</Text>
              <TouchableOpacity
                style={styles.createBtn}
                onPress={handleConfirmAddTracks}
                disabled={selectedTrackIds.length === 0}
              >
                <Text
                  style={[
                    styles.createText,
                    selectedTrackIds.length === 0 && { color: '#71717a' },
                  ]}
                >
                  Xong ({selectedTrackIds.length})
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.searchBoxWrap}>
              <TextInput
                style={styles.searchInput}
                placeholder="Tìm tên bài hát, nghệ sĩ..."
                placeholderTextColor="#71717a"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
              {candidateTracks.map((t) => {
                const isSelected = selectedTrackIds.includes(t.id);
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.trackRow, isSelected && { backgroundColor: '#18241b' }]}
                    onPress={() => {
                      setSelectedTrackIds((prev) =>
                        isSelected ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                      );
                    }}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.checkCircle,
                        isSelected && { backgroundColor: '#1DB954', borderColor: '#1DB954' },
                      ]}
                    >
                      {isSelected && <CheckIcon size={14} color="#000000" />}
                    </View>

                    <View style={styles.trackInfo}>
                      <Text style={styles.trackTitle} numberOfLines={1}>
                        {t.title}
                      </Text>
                      <Text style={styles.trackArtist} numberOfLines={1}>
                        {t.artist}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0d0e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#22252a',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1b1d22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleWrap: {
    alignItems: 'center',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 2,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16221a',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e3825',
  },
  createText: {
    color: '#1DB954',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  tabTrackContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#22252a',
  },
  tabTrack: {
    position: 'relative',
    flexDirection: 'row',
    backgroundColor: '#16181d',
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  slidingActivePill: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    backgroundColor: '#1DB954',
    borderRadius: 9,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#22252a',
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 9,
    gap: 6,
    zIndex: 1,
  },
  tabBtnActive: {
    backgroundColor: '#16281c',
    borderWidth: 1,
    borderColor: '#1e4828',
  },
  tabBtnActiveFavorites: {
    backgroundColor: '#261217',
    borderWidth: 1,
    borderColor: '#4d1e28',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  tabTextActiveFavorites: {
    color: '#f43f5e',
  },
  tabTextInactive: {
    color: '#71717a',
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  playlistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#15171b',
    borderWidth: 1,
    borderColor: '#22252a',
  },
  playlistCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#16221a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  playlistCardInfo: {
    flex: 1,
  },
  playlistCardTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  playlistCardMeta: {
    color: '#71717a',
    fontSize: 12,
  },
  deleteMiniBtn: {
    padding: 8,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#181b20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyDesc: {
    color: '#71717a',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  actionBtnPrimary: {
    backgroundColor: '#1DB954',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  actionBtnPrimaryText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700',
  },
  detailContainer: {
    flex: 1,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  backBtnText: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600',
  },
  detailActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addTrackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#16221a',
    gap: 4,
  },
  addTrackBtnText: {
    color: '#1DB954',
    fontSize: 12,
    fontWeight: '600',
  },
  playAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#1DB954',
    gap: 4,
  },
  playAllBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },
  playlistBanner: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#22252a',
  },
  bannerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  bannerMeta: {
    color: '#71717a',
    fontSize: 12,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#15171b',
  },
  trackPlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#22262e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  trackCoverWrapper: {
    width: 40,
    height: 40,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#1f242d',
    marginRight: 10,
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
  },
  trackTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  trackTitleActive: {
    color: '#1DB954',
  },
  trackArtist: {
    color: '#71717a',
    fontSize: 12,
  },
  trackRemoveBtn: {
    padding: 8,
  },
  favToggleBtn: {
    padding: 8,
  },
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#16181d',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#262930',
  },
  dialogTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
  },
  dialogInput: {
    backgroundColor: '#0c0d0e',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#262930',
    marginBottom: 12,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  dialogCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  dialogCancelText: {
    color: '#71717a',
    fontSize: 14,
    fontWeight: '600',
  },
  dialogSubmitBtn: {
    backgroundColor: '#1DB954',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  dialogSubmitText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  searchBoxWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#22252a',
  },
  searchInput: {
    backgroundColor: '#16181d',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 14,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#444852',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
});
