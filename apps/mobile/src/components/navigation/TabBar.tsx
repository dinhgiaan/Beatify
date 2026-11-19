import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useSharedValue, withSpring, ReduceMotion } from 'react-native-reanimated';
import type { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { MiniPlayer } from '../player/MiniPlayer';
import { TabIndicator } from './TabIndicator';
import { TabBarItem, type TabRoute } from './TabBarItem';
import { radius } from '../../theme';

export type BottomTabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0];

/**
 * Cấu hình spring chuẩn iOS Snappy:
 * - damping 24, stiffness 280, mass 0.5: nảy nhẹ êm ái, bứt tốc tự nhiên chuẩn Apple
 * - reduceMotion: ReduceMotion.System: tự động tôn trọng thiết lập Trợ năng (Giảm chuyển động) của iOS
 */
export const TAB_SPRING_CONFIG = {
  damping: 24,
  stiffness: 280,
  mass: 0.5,
  reduceMotion: ReduceMotion.System,
};

/**
 * TabBar: Thanh điều hướng nổi dạng Liquid Glass Capsule chuẩn iOS
 * Hoạt động 100% trên UI thread qua index và độ rộng container
 * Loại bỏ hoàn toàn độ trễ và hiện tượng giật frame khi đổi tab
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  const initialDockWidth = Math.min(screenWidth * 0.95, 410);

  // Lọc chỉ các route hiển thị trên TabBar (loại bỏ các route có options.href === null)
  const visibleRoutes = state.routes.filter((route: TabRoute) => {
    const descriptor = descriptors[route.key];
    const options = descriptor?.options as { href?: string | null } | undefined;
    return options?.href !== null;
  });

  const activeVisibleIndex = visibleRoutes.findIndex(
    (r: TabRoute) => r.key === state.routes[state.index]?.key
  );

  // Giữ nguyên vị trí tab hợp lệ trước đó khi chuyển sang route ẩn (tránh tụt về -1 hay NaN)
  const currentTabRef = useRef(activeVisibleIndex >= 0 ? activeVisibleIndex : 0);

  // Shared value điều khiển index đang active và độ rộng thanh dock (khởi tạo ngay lập tức > 0)
  const activeIndexShared = useSharedValue(currentTabRef.current);
  const containerWidthShared = useSharedValue(initialDockWidth);

  // Đồng bộ vị trí khi state.index đổi từ bên ngoài (chỉ trượt khi route đang chọn là route hiển thị)
  useEffect(() => {
      if (activeVisibleIndex >= 0 && currentTabRef.current !== activeVisibleIndex) {
        currentTabRef.current = activeVisibleIndex;
        activeIndexShared.value = withSpring(activeVisibleIndex, TAB_SPRING_CONFIG);
      }
}, [activeVisibleIndex, activeIndexShared]);

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

        {/* Danh sách các tab items */}
        {visibleRoutes.map((route: TabRoute, index: number) => {
          const descriptor = descriptors[route.key];
          const options = descriptor?.options ?? {};
          const isFocused = activeVisibleIndex === index;

          const onPress = () => {
            if (!isFocused) {
              // Rung phản hồi nhẹ chuẩn iOS
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });

              // Kích hoạt viên thuốc trượt tức thì trên UI thread
              currentTabRef.current = index;
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
    shadowOffset: { width: 0, height: 4 },
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
