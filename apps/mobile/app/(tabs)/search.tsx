import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  StyleSheet,
  Vibration,
  ActivityIndicator,
  Animated,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { normalizeText, type Track } from '@music-app/shared';
import { useLibrary, usePlayer } from '../../src/context';
import { useTabBarMetrics } from '../../src/hooks/useTabBarMetrics';
import {
  colors,
  fontWeights,
  spacing,
  radius,
} from '../../src/theme';
import { formatTime } from '../../src/utils/formatTime';
import { cleanTrackTitle } from '../../src/utils/recentFormatters';
import { splitMatches } from '../../src/utils/searchHighlight';
import { TrackActionSheet } from '../../src/components/sheet/TrackActionSheet';
import { AddToPlaylistModal } from '../../src/components/AddToPlaylistModal';
import {
  loadSearchHistory,
  saveSearchHistory,
  clearSearchHistory,
  addTrackToSearchHistory,
  removeTrackFromSearchHistory,
  type SearchHistoryData,
} from '../../src/services/search/searchHistoryStorage';

type SearchFilterTab = 'all' | 'tracks' | 'artists';

/**
 * Component hiển thị chữ có highlight từ khóa tìm kiếm
 */
function HighlightedText({
  text,
  query,
  baseStyle,
  highlightStyle,
  numberOfLines = 1,
}: {
  text: string;
  query: string;
  baseStyle: StyleProp<TextStyle>;
  highlightStyle: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const parts = useMemo(() => splitMatches(text, query), [text, query]);

  return (
    <Text style={baseStyle} numberOfLines={numberOfLines}>
      {parts.map((p, idx) => (
        <Text key={idx} style={p.isMatch ? highlightStyle : undefined}>
          {p.text}
        </Text>
      ))}
    </Text>
  );
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const { tracks, userState, toggleFavorite, deleteTrack, updateUserState } = useLibrary();
  const { currentTrack, playQueue, playNext, togglePlay, handleTrackDeleted } = usePlayer();
  const { contentPaddingBottom } = useTabBarMetrics();

  const [rawQuery, setRawQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<SearchFilterTab>('all');
  const [historyData, setHistoryData] = useState<SearchHistoryData>({ trackIds: [] });

  // Menu Bottom Sheet cho bài hát
  const [selectedTrackForMenu, setSelectedTrackForMenu] = useState<Track | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [addToPlaylistVisible, setAddToPlaylistVisible] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const resultsFadeAnim = useRef(new Animated.Value(0)).current;

  // Debounce query và hiệu ứng loading 0.6s khi tìm kiếm
  useEffect(() => {
    if (!rawQuery.trim()) {
      setDebouncedQuery('');
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    resultsFadeAnim.setValue(0);
    const timer = setTimeout(() => {
      setDebouncedQuery(rawQuery.trim());
      setIsSearching(false);
      Animated.timing(resultsFadeAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }).start();
    }, 600);
    return () => clearTimeout(timer);
  }, [rawQuery, resultsFadeAnim]);

  // Nạp lịch sử tìm kiếm từ ổ đĩa
  useEffect(() => {
    loadSearchHistory().then((data) => {
      setHistoryData(data);
    });
  }, []);

  // Danh sách track trong lịch sử tìm kiếm
  const historyTracks = useMemo(() => {
    if (!historyData.trackIds || historyData.trackIds.length === 0) return [];
    const trackMap = new Map<string, Track>();
    tracks.forEach((t) => trackMap.set(t.id, t));

    const result: Track[] = [];
    historyData.trackIds.forEach((id) => {
      const t = trackMap.get(id);
      if (t) result.push(t);
    });
    return result;
  }, [historyData.trackIds, tracks]);

  // Danh sách nghệ sĩ nghe nhiều / phổ biến trong thư viện (lấy top 8 nghệ sĩ)
  const popularArtists = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tracks) {
      if (t.artist && t.artist !== 'Unknown Artist') {
        counts.set(t.artist, (counts.get(t.artist) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([artist]) => artist);
  }, [tracks]);

  // Lọc bài hát theo từ khóa và filter tab
  const filteredTracks = useMemo(() => {
    if (!debouncedQuery) return [];
    const normQuery = normalizeText(debouncedQuery);

    return tracks.filter((track) => {
      const matchTitle = normalizeText(track.title).includes(normQuery);
      const matchArtist = normalizeText(track.artist).includes(normQuery);

      if (selectedFilter === 'tracks') {
        return matchTitle;
      }
      if (selectedFilter === 'artists') {
        return matchArtist;
      }
      return matchTitle || matchArtist;
    });
  }, [tracks, debouncedQuery, selectedFilter]);

  const recordToHistory = useCallback((trackId: string) => {
    setHistoryData((prev) => {
      const next = addTrackToSearchHistory(trackId, prev);
      saveSearchHistory(next);
      return next;
    });
  }, []);

  const handleTrackPress = (item: Track, queueContext: Track[]) => {
    Vibration.vibrate(10);
    recordToHistory(item.id);

    if (currentTrack?.id === item.id) {
      togglePlay();
    } else {
      const idx = queueContext.findIndex((t) => t.id === item.id);
      playQueue(queueContext, idx >= 0 ? idx : 0);
    }
  };

  const handleClear = () => {
    setRawQuery('');
    setDebouncedQuery('');
  };

  const handleCancel = () => {
    Keyboard.dismiss();
    setIsFocused(false);
    setRawQuery('');
    setDebouncedQuery('');
  };

  const handleClearAllHistory = () => {
    Vibration.vibrate(10);
    setHistoryData({ trackIds: [] });
    clearSearchHistory();
  };

  const handleRemoveHistoryItem = (trackId: string) => {
    Vibration.vibrate(5);
    setHistoryData((prev) => {
      const next = removeTrackFromSearchHistory(trackId, prev);
      saveSearchHistory(next);
      return next;
    });
  };

  const openTrackMenu = (track: Track) => {
    Vibration.vibrate(15);
    setSelectedTrackForMenu(track);
    setMenuVisible(true);
  };

  // Nút xoá khi vuốt trái bài trong lịch sử
  const renderHistorySwipeActions = (trackId: string) => {
    return (
      <TouchableOpacity
        style={styles.swipeDeleteHistoryBtn}
        onPress={() => handleRemoveHistoryItem(trackId)}
        activeOpacity={0.8}
      >
        <Text style={styles.swipeDeleteText}>Xóa</Text>
      </TouchableOpacity>
    );
  };

  // Render mục kết quả tìm kiếm
  const renderTrackItem = ({ item }: { item: Track }) => {
    const isCurrent = currentTrack?.id === item.id;
    const cleanedTitle = cleanTrackTitle(item.title);

    return (
      <TouchableOpacity
        style={[styles.trackRow, isCurrent && styles.trackRowActive]}
        onPress={() => handleTrackPress(item, filteredTracks)}
        onLongPress={() => openTrackMenu(item)}
        activeOpacity={0.75}
      >
        <Image
          source={{ uri: item.cover }}
          style={styles.trackCover}
          contentFit="cover"
          transition={150}
        />

        <View style={styles.trackInfo}>
          <HighlightedText
            text={cleanedTitle}
            query={debouncedQuery}
            baseStyle={[styles.trackTitle, isCurrent && styles.trackTitleActive]}
            highlightStyle={styles.textHighlight}
            numberOfLines={1}
          />
          <HighlightedText
            text={item.artist}
            query={debouncedQuery}
            baseStyle={styles.trackArtist}
            highlightStyle={styles.textHighlight}
            numberOfLines={1}
          />
        </View>

        {item.duration > 0 && (
          <Text style={styles.trackDuration}>{formatTime(item.duration)}</Text>
        )}
      </TouchableOpacity>
    );
  };

  // Render mục Lịch sử tìm kiếm (có hỗ trợ vuốt trái để xóa)
  const renderHistoryItem = ({ item }: { item: Track }) => {
    const isCurrent = currentTrack?.id === item.id;
    const cleanedTitle = cleanTrackTitle(item.title);

    return (
      <Swipeable
        renderRightActions={() => renderHistorySwipeActions(item.id)}
        overshootRight={false}
      >
        <TouchableOpacity
          style={[styles.trackRow, isCurrent && styles.trackRowActive]}
          onPress={() => handleTrackPress(item, historyTracks)}
          onLongPress={() => openTrackMenu(item)}
          activeOpacity={0.75}
        >
          <Image
            source={{ uri: item.cover }}
            style={styles.trackCover}
            contentFit="cover"
            transition={150}
          />

          <View style={styles.trackInfo}>
            <Text
              style={[styles.trackTitle, isCurrent && styles.trackTitleActive]}
              numberOfLines={1}
            >
              {cleanedTitle}
            </Text>
            <Text style={styles.trackArtist} numberOfLines={1}>
              {item.artist}
            </Text>
          </View>

          <Text style={styles.trackDuration}>{formatTime(item.duration)}</Text>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header & Search Bar tối giản không icon kính lúp */}
      <View style={styles.header}>
        <View style={styles.searchBarRow}>
          <View style={styles.searchBar}>
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Tìm bài hát, nghệ sĩ..."
              placeholderTextColor="rgba(255, 255, 255, 0.4)"
              value={rawQuery}
              onChangeText={setRawQuery}
              onFocus={() => setIsFocused(true)}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="never"
              returnKeyType="search"
            />
            {rawQuery.length > 0 && (
              <TouchableOpacity
                onPress={handleClear}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.clearTextLink}
              >
                <Text style={styles.clearLinkText}>Xóa</Text>
              </TouchableOpacity>
            )}
          </View>

          {isFocused && (
            <TouchableOpacity
              onPress={handleCancel}
              style={styles.cancelBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.cancelBtnText}>Hủy</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Tabs dạng text với gạch chân xanh 2px khi có kết quả */}
        {debouncedQuery.length > 0 && (
          <View style={styles.filterTabsRow}>
            {(['all', 'tracks', 'artists'] as SearchFilterTab[]).map((tab) => {
              const isSelected = selectedFilter === tab;
              const label =
                tab === 'all' ? 'Tất cả' : tab === 'tracks' ? 'Bài hát' : 'Nghệ sĩ';

              return (
                <TouchableOpacity
                  key={tab}
                  style={styles.filterTab}
                  onPress={() => setSelectedFilter(tab)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.filterTabText,
                      isSelected && styles.filterTabTextSelected,
                    ]}
                  >
                    {label}
                  </Text>
                  {isSelected && <View style={styles.filterTabUnderline} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Nội dung trang */}
      {isSearching ? (
        // Trạng thái đang tìm kiếm (0.6s) với icon và hiệu ứng loading
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Đang tìm kiếm bài hát...</Text>
        </View>
      ) : debouncedQuery.length === 0 ? (
        // Trạng thái trống: Gần đây & Nghệ sĩ nghe nhiều
        <FlatList
          data={[]}
          renderItem={() => null}
          ListHeaderComponent={
            <View>
              {/* Mục Nghệ sĩ nghe nhiều dạng Chip text bo tròn */}
              {popularArtists.length > 0 && (
                <View style={styles.artistSection}>
                  <Text style={styles.sectionHeaderTitle}>Nghệ sĩ nghe nhiều</Text>
                  <View style={styles.chipsWrapper}>
                    {
                      popularArtists.map((artist) => (
                        <Animated.View
                          key={artist}
                          style={{
                            opacity: 1,
                          }}
                        >
                          <TouchableOpacity
                            style={styles.artistChip}
                            onPress={() => {
                              Vibration.vibrate(5);
                              setRawQuery(artist);
                            }}
                            activeOpacity={0.75}
                          >
                            <Text style={styles.artistChipText}>{artist}</Text>
                          </TouchableOpacity>
                        </Animated.View>
                      ))
                    }
                  </View>
                </View>
              )}

              {/* Mục Lịch sử tìm kiếm Gần đây */}
              {historyTracks.length > 0 && (
                <View style={styles.historySection}>
                  <View style={styles.historyHeaderRow}>
                    <Text style={styles.sectionHeaderTitle}>Gần đây</Text>
                    <TouchableOpacity
                      onPress={handleClearAllHistory}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.historyClearAllLink}>Xóa tất cả</Text>
                    </TouchableOpacity>
                  </View>

                  {historyTracks.map((item) => (
                    <View key={`hist-${item.id}`}>
                      {renderHistoryItem({ item })}
                    </View>
                  ))}
                </View>
              )}
            </View>
          }
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: contentPaddingBottom + 20 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        />
      ) : filteredTracks.length === 0 ? (
        // Không tìm thấy kết quả
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Không tìm thấy bài hát</Text>
            <Text style={styles.emptySubtitle}>
              Không có kết quả nào khớp với &quot;{debouncedQuery}&quot;. Thử tìm với từ khóa khác.
            </Text>
          </View>
        </TouchableWithoutFeedback>
      ) : (
        // Danh sách kết quả tìm kiếm với animation xuất hiện mượt mà
        <Animated.View style={{ flex: 1, opacity: resultsFadeAnim }}>
          <FlatList
            data={filteredTracks}
            keyExtractor={(item) => item.id}
            renderItem={renderTrackItem}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: contentPaddingBottom + 20 },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          />
        </Animated.View>
      )}

      {/* Menu bài hát Bottom Sheet kiểu Apple */}
      {selectedTrackForMenu && (
        <TrackActionSheet
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          track={selectedTrackForMenu}
          isFavorite={userState?.favoriteIds?.includes(selectedTrackForMenu.id)}
          playlistNames={
            selectedTrackForMenu
              ? userState.playlists
                .filter((pl) => pl.trackIds.includes(selectedTrackForMenu.id))
                .map((pl) => pl.name)
              : undefined
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
          onEditInfo={() => {
            // Mở màn hình thư viện hoặc thông báo
          }}
          onDeleteFromLibrary={() => {
            deleteTrack(selectedTrackForMenu.id, handleTrackDeleted);
          }}
        />
      )}

      {/* Modal thêm bài hát vào playlist */}
      <AddToPlaylistModal
        visible={addToPlaylistVisible}
        track={selectedTrackForMenu}
        userState={userState}
        onClose={() => setAddToPlaylistVisible(false)}
        onUpdateUserState={updateUserState}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  clearTextLink: {
    paddingHorizontal: 4,
  },
  clearLinkText: {
    fontSize: 14,
    color: colors.textTertiary,
    fontWeight: fontWeights.medium,
  },
  cancelBtn: {
    paddingVertical: 6,
  },
  cancelBtnText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  filterTabsRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: spacing.md,
    paddingHorizontal: 4,
  },
  filterTab: {
    paddingBottom: 8,
    position: 'relative',
  },
  filterTabText: {
    fontSize: 15,
    fontWeight: fontWeights.medium,
    color: colors.textTertiary,
  },
  filterTabTextSelected: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  filterTabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
  scrollContent: {
    paddingTop: spacing.sm,
  },
  artistSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.md,
  },
  chipsWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  artistChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  artistChipText: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: fontWeights.medium,
  },
  historySection: {
    paddingTop: spacing.xs,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  historyClearAllLink: {
    fontSize: 13,
    color: colors.textTertiary,
    fontWeight: fontWeights.medium,
  },
  listContent: {
    paddingTop: spacing.xs,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 36,
  },
  loadingText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
  },
  trackRowActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  trackCover: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: colors.surface,
    marginRight: spacing.md,
  },
  trackInfo: {
    flex: 1,
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  trackTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  trackTitleActive: {
    color: colors.primary,
  },
  trackArtist: {
    fontSize: 13,
    fontWeight: fontWeights.regular,
    color: colors.textSecondary,
    marginTop: 3,
  },
  trackDuration: {
    fontSize: 13,
    color: colors.textTertiary,
  },
  textHighlight: {
    color: colors.primary,
    fontWeight: '700',
  },
  swipeDeleteHistoryBtn: {
    width: 80,
    height: '100%',
    backgroundColor: '#3B1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeDeleteText: {
    color: '#FF6B6B',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingBottom: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
