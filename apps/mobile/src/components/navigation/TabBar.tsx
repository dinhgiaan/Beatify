import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useSharedValue, withSpring, ReduceMotion } from 'react-native-reanimated';
import type { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from '../player/MiniPlayer';
import { TabIndicator } from './TabIndicator';
import { TabBarItem, type TabRoute } from './TabBarItem';
import { calculateVisibleTabIndex } from './tabBarUtils';
import { MOTION } from '../../lib/motion';
import { haptics } from '../../lib/haptics';
import { radius } from '../../theme';

export type BottomTabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0];

/**
 * Cấu hình spring chuẩn iOS Liquid Glass:
 * - Dùng thông số MOTION.spring.default
 * - ReduceMotion.Never: Bảo đảm luôn lướt trọn vẹn 100% số khung hình trên thiết bị
 */
export const TAB_SPRING_CONFIG = {
  damping: MOTION.spring.default.damping,
  stiffness: MOTION.spring.default.stiffness,
  mass: MOTION.spring.default.mass,
  reduceMotion: ReduceMotion.Never,
};

// Lưu vết vị trí tab ở cấp module: Bảo toàn chuyển động trượt mượt mà dù component có remount
let lastKnownVisibleIndex = 0;

/**
 * TabBar: Thanh điều hướng nổi dạng Liquid Glass Capsule chuẩn iOS
 * Hoạt động 100% trên UI thread qua index và độ rộng container
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  const initialDockWidth = Math.min(screenWidth * 0.95, 410);

  // Lọc chỉ các route hiển thị trên TabBar (loại bỏ options.href === null)
  const visibleRoutes = state.routes.filter((route: TabRoute) => {
    const descriptor = descriptors[route.key];
    const options = descriptor?.options as { href?: string | null } | undefined;
    return options?.href !== null;
  });

  const activeRouteKey = state.routes[state.index]?.key;
  const isHiddenRoute = Boolean(
    descriptors[activeRouteKey ?? '']?.options &&
    (descriptors[activeRouteKey ?? '']?.options as { href?: string | null }).href === null
  );

  // A1 & A3: Tính chỉ số tab hiển thị an toàn bằng hàm thuần túy
  const targetVisibleIndex = calculateVisibleTabIndex(
    state.routes,
    descriptors as never,
    activeRouteKey,
    lastKnownVisibleIndex
  );

  // Shared value điều khiển index đang active và độ rộng thanh dock
  const activeIndexShared = useSharedValue(lastKnownVisibleIndex);
  const containerWidthShared = useSharedValue(initialDockWidth);

  // B1: Đồng bộ vị trí viên thuốc trượt khi state.index đổi từ bên ngoài hoặc router
  useEffect(() => {
  if (!isHiddenRoute && targetVisibleIndex !== lastKnownVisibleIndex) {
    lastKnownVisibleIndex = targetVisibleIndex;
    activeIndexShared.value = withSpring(targetVisibleIndex, TAB_SPRING_CONFIG);
  }
}, [targetVisibleIndex, isHiddenRoute, activeIndexShared]);

    return (
    <View style={styles.tabBarWrapper} pointerEvents="box-none">
      {/* MiniPlayer xuất hiện ngay phía trên thanh tab khi có bài đang phát */}
      <MiniPlayer />

        {/* View ngoài: Chịu trách nhiệm đổ bóng và bo góc (bóng đổ nhẹ nhàng tối ưu GPU) */}
        <View
          style={[
            styles.dockShadowContainer,
            {
              marginBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          {/* View trong: Chịu trách nhiệm overflow: 'hidden', border, background và chứa các tab item */}
          <View
            style={styles.dockInner}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w > 0 && Math.abs(w - containerWidthShared.value) > 1) {
                containerWidthShared.value = w;
              }
            }}
          >
            {/* Một indicator duy nhất trượt mượt mà phía sau các icon */}
            <TabIndicator
              activeIndex={activeIndexShared}
              containerWidth={containerWidthShared}
              totalTabs={visibleRoutes.length}
            />

              {/* Danh sách các tab items */ }
              {
                visibleRoutes.map((route: TabRoute, index: number) => {
                  const descriptor = descriptors[route.key];
                  const options = descriptor?.options ?? {};
                  const isFocused = !isHiddenRoute && targetVisibleIndex === index;

                      const onPress = () => {
                        if (!isFocused) {
                          // B3: Rung phản hồi nhẹ chuẩn iOS
                          haptics.tap();

                        // Kích hoạt viên thuốc trượt tức thì trên UI thread
                        lastKnownVisibleIndex = index;
                        activeIndexShared.value = withSpring(index, TAB_SPRING_CONFIG);
                      }

                      const event = navigation.emit({
                        type: 'tabPress',
                        target: route.key,
                        canPreventDefault: true,
                      });

                    if (!isFocused && !event.defaultPrevented) {
                      navigation.navigate(route.name);
                    }
                  };

                  const onLongPress = () => {
                    navigation.emit({
                      type: 'tabLongPress',
                      target: route.key,
                    });
                  };

              return (
                <TabBarItem
                  key={route.key}
                  route={route}
                  index={index}
                  isFocused={isFocused}
                  options={options}
                  onPress={onPress}
                  onLongPress={onLongPress}
                />
              );
            })}
          </View>
        </View>
      </View>
    );
}

    const styles = StyleSheet.create({
      tabBarWrapper: {
      position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
    dockShadowContainer: {
      width: '95%',
    maxWidth: 410,
    borderRadius: radius.pill,
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
    dockInner: {
      flexDirection: 'row',
    backgroundColor: 'rgba(18, 18, 20, 0.95)',
    borderRadius: radius.pill,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
});
