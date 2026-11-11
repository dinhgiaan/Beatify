import React, { useState, useMemo } from 'react';
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
} from '../../src/components/icons/SvgIcons';
import { formatTime } from '../../src/utils/formatTime';
import { EqualizerIndicator } from '../../src/components/player/EqualizerIndicator';

/**
 * Màn hình Tìm kiếm tức thì (Thiết kế lại Pha 3)
 * Hỗ trợ tìm kiếm không dấu tiếng Việt theo Tên bài hát, Ca sĩ, Album.
 */
export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { tracks } = useLibrary();
  const { currentTrack, playerState, playQueue, togglePlay } = usePlayer();
  const { contentPaddingBottom } = useTabBarMetrics();

  const [query, setQuery] = useState('');

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

  const handleTrackPress = (item: Track) => {
    Vibration.vibrate(10);
    if (currentTrack?.id === item.id) {
      togglePlay();
    } else {
      const idx = filteredTracks.findIndex((t) => t.id === item.id);
      playQueue(filteredTracks, idx >= 0 ? idx : 0);
    }
  };

  const handleClear = () => {
    setQuery('');
  };

  const renderTrackItem = ({ item }: { item: Track }) => {
    const isCurrent = currentTrack?.id === item.id;

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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header & Thanh tìm kiếm */}
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <SearchIcon size={18} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Bài hát, ca sĩ, album..."
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
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.emptyPromptContainer}>
            <SearchIcon size={56} color={colors.borderLight} />
            <Text style={styles.emptyPromptTitle}>Khám phá kho âm nhạc</Text>
            <Text style={styles.emptyPromptSubtitle}>
              Gõ tên bài hát hoặc ca sĩ có dấu hoặc không dấu tiếng Việt.
            </Text>
          </View>
        </TouchableWithoutFeedback>
      ) : filteredTracks.length === 0 ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.emptyPromptContainer}>
            <DiscIcon size={56} color={colors.borderLight} />
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
  headerTitle: {
    fontSize: fontSizes.headline,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
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
  },
  emptyPromptTitle: {
    fontSize: fontSizes.subheading,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  emptyPromptSubtitle: {
    fontSize: fontSizes.subhead,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
