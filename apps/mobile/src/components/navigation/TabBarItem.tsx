import React, { useEffect } from 'react';
import {
  Pressable,
  StyleSheet,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { Tabs } from 'expo-router';
import {
  HomeIcon,
  LibraryIcon,
  SearchIcon,
  HeartIcon,
  ClockRewindIcon,
  PlaylistIcon,
} from '../icons/SvgIcons';
import { colors, radius } from '../../theme';
import { MOTION } from '../../lib/motion';

type TabsTabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0];

export type TabRoute = TabsTabBarProps['state']['routes'][0];
export type TabDescriptorOptions = TabsTabBarProps['descriptors'][string]['options'];

export interface TabBarItemProps {
  route: TabRoute;
  index: number;
  isFocused: boolean;
  options: TabDescriptorOptions;
  onPress: () => void;
  onLongPress: () => void;
  onLayout?: (index: number, x: number, width: number) => void;
}

function getTabIcon(routeName: string, color: string) {
  const size = 20;
  switch (routeName) {
    case 'home':
      return <HomeIcon size={size} color={color} />;
    case 'library':
      return <LibraryIcon size={size} color={color} />;
    case 'search':
      return <SearchIcon size={size} color={color} />;
    case 'collection':
      return <HeartIcon size={size} color={color} fill={color} />;
    case 'recent':
      return <ClockRewindIcon size={size} color={color} />;
    case 'playlists':
      return <PlaylistIcon size={size} color={color} />;
    default:
      return null;
  }
}

function getTabLabel(routeName: string, customTitle?: string): string {
  if (customTitle) return customTitle;
  switch (routeName) {
    case 'home':
      return 'Trang chủ';
    case 'library':
      return 'Thư viện';
    case 'search':
      return 'Tìm kiếm';
    case 'collection':
      return 'Yêu thích';
    case 'recent':
      return 'Vừa nghe';
    case 'playlists':
      return 'Playlist';
    default:
      return routeName;
  }
}

  /**
   * TabBarItem: Từng nút tab trên Liquid Glass TabBar
   * - B2: Icon được chọn scale nhẹ 1.0 -> 1.12 và đổi màu mượt mà
   * - B3: Scale 0.92 khi press-in, về 1 khi press-out
   * - B4: Long-press tab Trang chủ có hiệu ứng nảy/xoay nhẹ và haptic mạnh hơn
   */
  export const TabBarItem = React.memo(function TabBarItem({
    route,
    index,
    isFocused,
    options,
    onPress,
    onLongPress,
    onLayout,
  }: TabBarItemProps) {
    const isReducedMotion = useReducedMotion();
    const label = getTabLabel(route.name, options?.title);

    // B2: Shared value điều khiển trạng thái active (0 -> 1)
    const activeProgress = useSharedValue(isFocused ? 1 : 0);

    // B3: Shared value điều khiển scale khi nhấn (1 -> 0.92 -> 1)
    const pressScale = useSharedValue(1);

    // B4: Shared value điều khiển xoay & nảy khi long-press Trang chủ
    const rotateDeg = useSharedValue(0);
    const bounceScale = useSharedValue(1);

    useEffect(() => {
      if (isReducedMotion) {
        activeProgress.value = isFocused ? 1 : 0;
      } else {
        activeProgress.value = withSpring(isFocused ? 1 : 0, MOTION.spring.default);
      }
    }, [isFocused, isReducedMotion, activeProgress]);

    const handlePressIn = () => {
      if (!isReducedMotion) {
        pressScale.value = withSpring(0.92, MOTION.spring.press);
      }
    };

    const handlePressOut = () => {
      if (!isReducedMotion) {
        pressScale.value = withSpring(1, MOTION.spring.press);
      }
    };

    const handleLongPress = () => {
      if (route.name === 'home') {
        // B4: Phản hồi haptic vừa phải và animation xoay nảy icon Trang chủ
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
        if (!isReducedMotion) {
          rotateDeg.value = withSequence(
            withTiming(-16, { duration: 90 }),
            withTiming(16, { duration: 110 }),
            withSpring(0, MOTION.spring.default)
          );
          bounceScale.value = withSequence(
            withTiming(1.22, { duration: 120 }),
            withSpring(1, MOTION.spring.default)
          );
        }
      }
      onLongPress();
    };

    const handleLayout = (e: LayoutChangeEvent) => {
      if (onLayout) {
        const { x, width } = e.nativeEvent.layout;
        onLayout(index, x, width);
      }
    };

    // Animated style tổng hợp cho container icon: pressScale * bounceScale * activeScale
    const iconContainerAnimStyle = useAnimatedStyle(() => {
      const activeScaleFactor = 1 + 0.12 * activeProgress.value;
      const finalScale = pressScale.value * bounceScale.value * activeScaleFactor;

      return {
        transform: [
          { scale: finalScale },
          { rotate: `${rotateDeg.value}deg` },
        ],
      };
    });

    // Layer icon inactive: mờ dần khi activeProgress -> 1
    const inactiveIconAnimStyle = useAnimatedStyle(() => ({
      opacity: 1 - activeProgress.value,
    }));

    // Layer icon active: hiện dần khi activeProgress -> 1
    const activeIconAnimStyle = useAnimatedStyle(() => ({
      opacity: activeProgress.value,
    }));

    return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={options?.tabBarAccessibilityLabel ?? label}
      testID={options?.tabBarButtonTestID}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onLongPress={handleLongPress}
      delayLongPress={500}
      onLayout={handleLayout}
      style={styles.tabButton}
    >
      <Animated.View style={[styles.iconWrapper, iconContainerAnimStyle]}>
        {/* Layer 1: Inactive Icon (xám mờ) */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.iconCenter, inactiveIconAnimStyle]}>
          {getTabIcon(route.name, 'rgba(255, 255, 255, 0.45)')}
        </Animated.View>

        {/* Layer 2: Active Icon (xanh Spotify) chuyển màu mượt mà qua opacity */}
        <Animated.View style={[styles.iconCenter, activeIconAnimStyle]}>
          {getTabIcon(route.name, colors.primary)}
        </Animated.View>
      </Animated.View>
    </Pressable >
  );
});

const styles = StyleSheet.create({
  tabButton: {
    flex: 1,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    zIndex: 2,
    backgroundColor: 'transparent',
  },
  iconWrapper: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
