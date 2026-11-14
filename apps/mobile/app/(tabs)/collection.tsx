import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Vibration,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Track } from '@music-app/shared';
import { useLibrary, useOffline } from '../../src/context';
import { useTabBarMetrics } from '../../src/hooks/useTabBarMetrics';
import { formatBytes } from '../../src/services/offline/offlineStorage';
import {
  colors,
  fontSizes,
  fontWeights,
  spacing,
  radius,
} from '../../src/theme';
import {
  HeartIcon,
  DownloadIcon,
} from '../../src/components/icons/SvgIcons';
import { CollectionDetailModal } from '../../src/components/CollectionDetailModal';
import { OfflineDownloadsModal } from '../../src/components/OfflineDownloadsModal';

function SpringCard({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.965, { damping: 16, stiffness: 280 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 16, stiffness: 280 });
        }}
        onPress={onPress}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export default function CollectionScreen() {
  const insets = useSafeAreaInsets();
  const { contentPaddingBottom } = useTabBarMetrics();
  const { tracks, userState } = useLibrary();
  const { offlineTracks, totalSizeBytes } = useOffline();

  const [offlineModalVisible, setOfflineModalVisible] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<{
    visible: boolean;
    title: string;
    subtitle?: string;
    tracks: Track[];
    type: 'favorites';
  }>({
    visible: false,
    title: '',
    tracks: [],
    type: 'favorites',
  });

  const tracksMap = useMemo(() => {
    const map = new Map<string, Track>();
    for (const t of tracks) {
      map.set(t.id, t);
    }
    return map;
  }, [tracks]);

  const favoriteTracks = useMemo(() => {
    return userState.favoriteIds
      .map((id) => tracksMap.get(id))
      .filter((t): t is Track => t !== undefined);
  }, [userState.favoriteIds, tracksMap]);

  const handleOpenFavorites = () => {
    Vibration.vibrate(10);
    setSelectedCollection({
      visible: true,
      title: 'Bài hát yêu thích',
      subtitle: `${favoriteTracks.length} bài hát đã thích`,
      tracks: favoriteTracks,
      type: 'favorites',
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Brand Header */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandBadge}>
            <Text style={styles.brandBadgeText}>BEATIFY</Text>
          </View>
        </View>
        <Text style={styles.headerTitle}>Bộ sưu tập</Text>
        <Text style={styles.headerSubtitle}>
          Kho lưu trữ bài hát yêu thích và bản nhạc ngoại tuyến của bạn
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: contentPaddingBottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Card 1: Bài hát yêu thích với hiệu ứng nhún lò xo phản hồi chạm */}
        <SpringCard
          style={styles.collectionCard}
          onPress={handleOpenFavorites}
        >
          <View style={styles.cardGlowGreen} />
          <View style={styles.iconCircleHeart}>
            <HeartIcon size={30} color="#000000" fill="#000000" />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Bài hát yêu thích</Text>
            <Text style={styles.cardDesc}>
              {favoriteTracks.length} bài hát • Tự động lưu khi thả tim
            </Text>
          </View>
          <View style={styles.cardArrow}>
            <Text style={styles.arrowText}>→</Text>
          </View>
        </SpringCard>

        {/* Card 2: Đã tải về máy (Offline) với hiệu ứng nhún lò xo phản hồi chạm */}
        <SpringCard
          style={[styles.collectionCard, styles.offlineCard]}
          onPress={() => {
            Vibration.vibrate(10);
            setOfflineModalVisible(true);
          }}
        >
          <View style={styles.iconCircleDownload}>
            <DownloadIcon size={26} color={colors.primary} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Đã tải về máy</Text>
            <Text style={styles.cardDesc}>
              {offlineTracks.length} bài hát • {formatBytes(totalSizeBytes)} đã lưu
            </Text>
          </View>
          <View style={styles.cardArrow}>
            <Text style={styles.arrowText}>→</Text>
          </View>
        </SpringCard>

        {/* Gợi ý tính năng */}
        <View style={styles.hintBox}>
          <Text style={styles.hintTitle}>Nghe nhạc không cần mạng</Text>
          <Text style={styles.hintDesc}>
            Các bài hát đã tải về máy sẽ được lưu trữ an toàn trong bộ nhớ máy. Khi ra ngoài không có Wi-Fi hoặc 4G, bạn vẫn có thể mở phát nhạc mượt mà.
          </Text>
        </View>
      </ScrollView>

      {/* Modal chi tiết bài hát yêu thích */}
      <CollectionDetailModal
        visible={selectedCollection.visible}
        onClose={() => setSelectedCollection((prev) => ({ ...prev, visible: false }))}
        title={selectedCollection.title}
        subtitle={selectedCollection.subtitle}
        tracks={selectedCollection.tracks}
        type={selectedCollection.type}
      />

      {/* Modal quản lý tải offline */}
      <OfflineDownloadsModal
        visible={offlineModalVisible}
        onClose={() => setOfflineModalVisible(false)}
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
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  brandRow: {
    marginBottom: spacing.xs,
  },
  brandBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  brandBadgeText: {
    fontSize: 9.5,
    fontWeight: fontWeights.bold,
    color: colors.primary,
    letterSpacing: 1.5,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: fontWeights.extrabold,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: fontSizes.captionLarge,
    color: colors.textTertiary,
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
  collectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E22',
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  offlineCard: {
    backgroundColor: '#1A1A1D',
  },
  cardGlowGreen: {
    position: 'absolute',
    left: -20,
    top: -20,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.primaryMutedLight,
    opacity: 0.25,
  },
  iconCircleHeart: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  iconCircleDownload: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardInfo: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: 3,
  },
  cardDesc: {
    fontSize: fontSizes.captionLarge,
    color: colors.textSecondary,
  },
  cardArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  arrowText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: fontWeights.bold,
  },
  hintBox: {
    marginTop: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  hintTitle: {
    fontSize: fontSizes.subheading,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
    marginBottom: 4,
  },
  hintDesc: {
    fontSize: fontSizes.captionLarge,
    color: colors.textTertiary,
    lineHeight: 18,
  },
});
