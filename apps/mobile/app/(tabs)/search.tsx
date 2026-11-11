import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  Image,
  StyleSheet,
  Vibration,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { normalizeText, type Track } from '@music-app/shared';
import { useLibrary, usePlayer } from '../../src/context';
import { useTabBarMetrics } from '../../src/hooks/useTabBarMetrics';
import {
  colors,
  fontSizes,
  fontWeights,
  spacing,
  radius,
} from '../../src/theme';
import {
  SearchIcon,
  CloseIcon,
  DiscIcon,
  ClockRewindIcon,
} from '../../src/components/icons/SvgIcons';
import { formatTime } from '../../src/utils/formatTime';
import { EqualizerIndicator } from '../../src/components/player/EqualizerIndicator';
import {
  loadSearchHistory,
  saveSearchHistory,
  clearSearchHistory,
  addTrackToSearchHistory,
  removeTrackFromSearchHistory,
  type SearchHistoryData,
} from '../../src/services/search/searchHistoryStorage';

/**
 * Màn hình Tìm kiếm tức thì & Lịch sử tìm kiếm
 * Hỗ trợ tìm kiếm không dấu tiếng Việt theo Tên bài hát, Ca sĩ, Album.
 */
export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { tracks } = useLibrary();
  const { currentTrack, playerState, playQueue, togglePlay } = usePlayer();
  const { contentPaddingBottom } = useTabBarMetrics();

  const [query, setQuery] = useState('');
  const [historyData, setHistoryData] = useState<SearchHistoryData>({ trackIds: [] });

  // Nạp lịch sử tìm kiếm từ ổ đĩa khi mở màn hình
  useEffect(() => {
    loadSearchHistory().then((data) => {
      setHistoryData(data);
    });
  }, []);

  // Danh sách các Track tương ứng với các ID trong lịch sử
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

  // Lọc bài hát theo từ khóa tìm kiếm (bỏ dấu tiếng Việt qua normalizeText)
  const filteredTracks = useMemo(() => {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    const normQuery = normalizeText(cleanQuery);
    return tracks.filter((track) => {
      const matchTitle = normalizeText(track.title).includes(normQuery);
      const matchArtist = normalizeText(track.artist).includes(normQuery);
      const matchAlbum = track.album ? normalizeText(track.album).includes(normQuery) : false;
      return matchTitle || matchArtist || matchAlbum;
    });
  }, [tracks, query]);

  // Lưu bài hát vào lịch sử tìm kiếm
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
    setQuery('');
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

  // Render mục kết quả tìm kiếm
  const renderTrackItem = ({ item }: { item: Track }) => {
    const isCurrent = currentTrack?.id === item.id;

    return (
      <TouchableOpacity
        style={[styles.trackItem, isCurrent && styles.trackItemActive]}
        onPress={() => handleTrackPress(item, filteredTracks)}
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
          <Text
            style={[styles.titleText, isCurrent && styles.titleActive]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.title}
          </Text>
          <Text style={styles.artistText} numberOfLines={1} ellipsizeMode="tail">
            {item.artist} {item.album ? `• ${item.album}` : ''}
          </Text>
        </View>

        {item.duration > 0 && (
          <Text style={styles.durationText}>{formatTime(item.duration)}</Text>
        )}
      </TouchableOpacity>
    );
  };

  // Render mục trong danh sách Lịch sử tìm kiếm gần đây
  const renderHistoryItem = ({ item }: { item: Track }) => {
    const isCurrent = currentTrack?.id === item.id;

    return (
      <TouchableOpacity
        style={[styles.trackItem, isCurrent && styles.trackItemActive]}
        onPress={() => handleTrackPress(item, historyTracks)}
        activeOpacity={0.7}
      >
        <View style={styles.historyClockWrapper}>
          <ClockRewindIcon size={16} color={colors.textTertiary} />
        </View>

        <View style={styles.coverWrapper}>
          {item.cover ? (
            <Image source={{ uri: item.cover }} style={styles.coverImage} resizeMode="cover" />
          ) : (
            <View style={styles.coverPlaceholder}>
              <DiscIcon size={18} color={colors.borderLight} />
            </View>
          )}
          {isCurrent && (
            <View style={styles.playingOverlay}>
              <EqualizerIndicator isPlaying={playerState.isPlaying} size={14} color={colors.primary} />
            </View>
          )}
        </View>

        <View style={styles.infoWrapper}>
          <Text
            style={[styles.titleText, isCurrent && styles.titleActive]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.title}
          </Text>
          <Text style={styles.artistText} numberOfLines={1} ellipsizeMode="tail">
            {item.artist}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.historyRemoveBtn}
          onPress={() => handleRemoveHistoryItem(item.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <CloseIcon size={13} color={colors.textTertiary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header & Thanh tìm kiếm */}
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <SearchIcon size={18} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Bài hát, nghệ sĩ, album..."
            placeholderTextColor={colors.textPlaceholder}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={handleClear}
              style={styles.clearBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Xóa từ khóa tìm kiếm"
            >
              <CloseIcon size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Nội dung kết quả tìm kiếm */}
      {query.trim().length === 0 ? (
        historyTracks.length > 0 ? (
          <View style={styles.historyContainer}>
            <View style={styles.historyHeaderRow}>
              <Text style={styles.historyHeaderTitle}>Tìm kiếm gần đây</Text>
              <TouchableOpacity
                onPress={handleClearAllHistory}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.historyClearAllText}>Xóa tất cả</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={historyTracks}
              keyExtractor={(item) => `hist-${item.id}`}
              renderItem={renderHistoryItem}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: contentPaddingBottom },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            />
          </View>
        ) : (
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.emptyPromptContainer}>
              <View style={styles.emptyPromptIconCircle}>
                <SearchIcon size={34} color={colors.textTertiary} />
              </View>
              <Text style={styles.emptyPromptTitle}>Tìm kiếm bài hát</Text>
              <Text style={styles.emptyPromptSubtitle}>
                Tìm nhanh theo tên bài hát, nghệ sĩ hoặc album trong thư viện của bạn.
              </Text>
            </View>
          </TouchableWithoutFeedback>
        )
      ) : filteredTracks.length === 0 ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.emptyPromptContainer}>
            <View style={styles.emptyPromptIconCircle}>
              <DiscIcon size={34} color={colors.textTertiary} />
            </View>
            <Text style={styles.emptyPromptTitle}>Không tìm thấy bài hát</Text>
            <Text style={styles.emptyPromptSubtitle}>
              Không có kết quả nào khớp với &quot;{query}&quot;. Thử tìm với từ khóa khác.
            </Text>
          </View>
        </TouchableWithoutFeedback>
      ) : (
        <FlatList
          data={filteredTracks}
          keyExtractor={(item) => item.id}
          renderItem={renderTrackItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: contentPaddingBottom },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        />
      )}
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
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
    marginLeft: spacing.sm,
    paddingVertical: 0,
  },
  clearBtn: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyContainer: {
    flex: 1,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  historyHeaderTitle: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  historyClearAllText: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
    color: colors.textTertiary,
  },
  historyClockWrapper: {
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyRemoveBtn: {
    padding: 6,
    marginLeft: spacing.xs,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    marginBottom: spacing.xxs,
  },
  trackItemActive: {
    backgroundColor: colors.surfaceElevated,
  },
  coverWrapper: {
    width: 44,
    height: 44,
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
  titleText: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  titleActive: {
    color: colors.primary,
  },
  artistText: {
    fontSize: fontSizes.subhead,
    color: colors.textSecondary,
    marginTop: 2,
  },
  durationText: {
    fontSize: fontSizes.caption,
    color: colors.textTertiary,
    marginLeft: spacing.sm,
  },
  emptyPromptContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingBottom: 60,
  },
  emptyPromptIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyPromptTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyPromptSubtitle: {
    fontSize: fontSizes.subhead,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    textAlign: 'center',
    lineHeight: 20,
  },
});
