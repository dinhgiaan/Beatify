import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
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
 * Cấu hình spring chuẩn iOS Liquid Glass:
 * - damping 20, stiffness 160, mass 0.7: trôi đầm, êm ái, bứt tốc tự nhiên
 * - overshootClamping: true: dừng dứt khoát tại tab đích, không bị nẩy lố hay giật ngược
 * - reduceMotion: ReduceMotion.Never: bảo đảm 100% luôn chạy đầy đủ frames trên iOS
 */
export const TAB_SPRING_CONFIG = {
  damping: 20,
  stiffness: 160,
  mass: 0.7,
  overshootClamping: true,
  reduceMotion: ReduceMotion.Never,
};

/**
 * TabBar: Thanh điều hướng nổi dạng Liquid Glass Capsule chuẩn iOS
 * Hoạt động 100% trên UI thread qua index và độ rộng container
 * Áp dụng kỹ thuật Deferred Navigation để loại bỏ hoàn toàn hiện tượng drop frame khi đổi tab
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  // Shared value điều khiển index đang active (0, 1, 2, 3, 4) và độ rộng thanh dock
  const activeIndexShared = useSharedValue(state.index);
  const containerWidthShared = useSharedValue(0);

  const currentTabRef = useRef(state.index);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dọn dẹp timer điều hướng khi component unmount
  useEffect(() => {
    return () => {
      if (navTimerRef.current) {
        clearTimeout(navTimerRef.current);
      }
    };
  }, []);

  // Đồng bộ vị trí khi state.index đổi từ bên ngoài (ví dụ deep link hoặc router.replace)
  useEffect(() => {
    if (currentTabRef.current !== state.index) {
      currentTabRef.current = state.index;
      activeIndexShared.value = withSpring(state.index, TAB_SPRING_CONFIG);
    }
  }, [state.index, activeIndexShared]);

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
            if (w > 0) {
              containerWidthShared.value = w;
            }
          }}
        >
          {/* Một indicator duy nhất trượt mượt mà phía sau các icon */}
          <TabIndicator
            activeIndex={activeIndexShared}
            containerWidth={containerWidthShared}
            totalTabs={state.routes.length}
          />

          {/* Danh sách các tab items */}
          {state.routes.map((route: TabRoute, index: number) => {
            const descriptor = descriptors[route.key];
            const options = descriptor?.options ?? {};
            const isFocused = state.index === index;

            const onPress = () => {
              if (!isFocused) {
                // Rung phản hồi nhẹ chuẩn iOS
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

                // Kích hoạt viên thuốc trượt ngay tức thì trên UI thread (0ms delay)
                currentTabRef.current = index;
                activeIndexShared.value = withSpring(index, TAB_SPRING_CONFIG);
              }

              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                // Kỹ thuật Deferred Navigation: Trì hoãn chuyển route nhẹ 80ms
                // để viên thuốc lướt trọn vẹn 120fps trước khi màn hình mới bắt đầu render,
                // loại bỏ hoàn toàn hiện tượng JS thread nghẽn gây giật khựng animation
                if (navTimerRef.current) {
                  clearTimeout(navTimerRef.current);
                }
                navTimerRef.current = setTimeout(() => {
                  navigation.navigate(route.name);
                }, 80);
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
