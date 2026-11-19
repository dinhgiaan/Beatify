import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, spacing, radius } from '../../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_PADDING = spacing.lg;
const GRID_GAP = spacing.sm;
const ITEM_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;

/**
 * Skeleton tải trang chủ (HomeSkeleton)
 * Hiệu ứng Opacity Pulse chạy mượt mà trên Reanimated UI thread
 */
export function HomeSkeleton() {
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.8, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View style={styles.container} pointerEvents="none">
      {/* 1. Lời chào Greeting Skeleton */}
      <View style={styles.greetingWrapper}>
        <Animated.View style={[styles.skeletonBlock, styles.greetingTitle, animatedStyle]} />
        <Animated.View style={[styles.skeletonBlock, styles.greetingSubtitle, animatedStyle]} />
      </View>

      {/* 2. Quick Picks Grid Skeleton (2 cột x 3 hàng) */}
      <View style={styles.sectionHeaderWrapper}>
        <Animated.View style={[styles.skeletonBlock, styles.sectionTitle, animatedStyle]} />
      </View>
      <View style={styles.grid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={`grid-skel-${i}`} style={styles.gridItem}>
            <Animated.View style={[styles.skeletonBlock, styles.gridCover, animatedStyle]} />
            <View style={styles.gridInfo}>
              <Animated.View style={[styles.skeletonBlock, styles.gridTextTitle, animatedStyle]} />
              <Animated.View style={[styles.skeletonBlock, styles.gridTextSub, animatedStyle]} />
            </View>
          </View>
        ))}
      </View>

      {/* 3. Section Row 1 (Track / Album Cards) */}
      <View style={styles.sectionHeaderWrapper}>
        <Animated.View style={[styles.skeletonBlock, styles.sectionTitle, animatedStyle]} />
        <Animated.View style={[styles.skeletonBlock, styles.sectionSubtitle, animatedStyle]} />
      </View>
      <View style={styles.horizontalRow}>
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={`row1-skel-${i}`} style={styles.cardItem}>
            <Animated.View style={[styles.skeletonBlock, styles.cardCover, animatedStyle]} />
            <Animated.View style={[styles.skeletonBlock, styles.cardTextTitle, animatedStyle]} />
            <Animated.View style={[styles.skeletonBlock, styles.cardTextSub, animatedStyle]} />
          </View>
        ))}
      </View>

      {/* 4. Section Row 2 (Artist Chips) */}
      <View style={styles.sectionHeaderWrapper}>
        <Animated.View style={[styles.skeletonBlock, styles.sectionTitle, animatedStyle]} />
      </View>
      <View style={styles.horizontalRow}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={`row2-skel-${i}`} style={styles.artistItem}>
            <Animated.View style={[styles.skeletonBlock, styles.artistAvatar, animatedStyle]} />
            <Animated.View style={[styles.skeletonBlock, styles.artistName, animatedStyle]} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.xs,
  },
  skeletonBlock: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
  },
  greetingWrapper: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  greetingTitle: {
    width: 200,
    height: 28,
    marginBottom: spacing.xs,
  },
  greetingSubtitle: {
    width: 140,
    height: 16,
  },
  sectionHeaderWrapper: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    width: 160,
    height: 20,
    marginBottom: 4,
  },
  sectionSubtitle: {
    width: 110,
    height: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_PADDING,
    gap: GRID_GAP,
  },
  gridItem: {
    width: ITEM_WIDTH,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  gridCover: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
  },
  gridInfo: {
    flex: 1,
    marginLeft: spacing.xs,
  },
  gridTextTitle: {
    width: '80%',
    height: 12,
    marginBottom: 4,
  },
  gridTextSub: {
    width: '50%',
    height: 10,
  },
  horizontalRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  cardItem: {
    width: 140,
  },
  cardCover: {
    width: 140,
    height: 140,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  cardTextTitle: {
    width: '90%',
    height: 14,
    marginBottom: 4,
  },
  cardTextSub: {
    width: '60%',
    height: 12,
  },
  artistItem: {
    width: 80,
    alignItems: 'center',
  },
  artistAvatar: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    marginBottom: spacing.xs,
  },
  artistName: {
    width: 50,
    height: 12,
  },
});

