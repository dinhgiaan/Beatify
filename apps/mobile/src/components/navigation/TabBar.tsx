import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSharedValue, withSpring } from 'react-native-reanimated';
import type { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { MiniPlayer } from '../player/MiniPlayer';
import { TabIndicator, DOCK_BORDER_WIDTH } from './TabIndicator';
import { TabBarItem, type TabRoute } from './TabBarItem';
import { radius } from '../../theme';
import { logTabDebug } from '../../utils/debugLogger';

export type BottomTabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0];

/**
 * TabBar: Thanh điều hướng nổi dạng Liquid Glass Capsule chuẩn iOS
 * Đo chính xác tọa độ từng tab qua onLayout và trượt mượt mà trên UI thread
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  // Shared value điều khiển vị trí, độ rộng và độ mờ của indicator trên UI thread
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  const indicatorOpacity = useSharedValue(0);

  // Lưu tọa độ x và width thực tế của từng tab item
  const tabLayoutsRef = useRef<{ [index: number]: { x: number; width: number } }>({});
  const hasInitializedRef = useRef(false);

  // Callback nhận tọa độ thực tế khi tab hoàn tất onLayout
  const handleTabLayout = (index: number, x: number, width: number) => {
    // Log debug tạm thời để kiểm tra tọa độ
    logTabDebug('[TabBar] layout', index, x, width, 'activeIndex=', state.index);
    tabLayoutsRef.current[index] = { x, width };

    // Nếu là tab đang active
    if (index === state.index) {
      if (!hasInitializedRef.current) {
        // Lần đầu tiên: đặt ngay vị trí không animate để tránh giật từ x = 0
        indicatorX.value = x;
        indicatorWidth.value = width;
        indicatorOpacity.value = 1;
        hasInitializedRef.current = true;
      } else {
        // Layout thay đổi (xoay màn hình, safe area): cập nhật ngay tọa độ mới
        indicatorX.value = x;
        indicatorWidth.value = width;
      }
    }
  };

  // Khi chuyển tab (state.index đổi) -> animate mượt mà sang tab mới
  useEffect(() => {
    logTabDebug('[TabBar] effect', state.index, JSON.stringify(tabLayoutsRef.current));
    const targetLayout = tabLayoutsRef.current[state.index];
    if (targetLayout) {
      if (!hasInitializedRef.current) {
        indicatorX.value = targetLayout.x;
        indicatorWidth.value = targetLayout.width;
        indicatorOpacity.value = 1;
        hasInitializedRef.current = true;
      } else {
        indicatorX.value = withSpring(targetLayout.x, {
          damping: 20,
          stiffness: 180,
          mass: 0.8,
        });
        indicatorWidth.value = withSpring(targetLayout.width, {
          damping: 20,
          stiffness: 180,
          mass: 0.8,
        });
      }
    }
  }, [state.index, indicatorX, indicatorWidth, indicatorOpacity]);

  return (
    <View style={styles.tabBarWrapper} pointerEvents="box-none">
      {/* MiniPlayer xuất hiện ngay phía trên thanh tab khi có bài đang phát */}
      <MiniPlayer />

      {/* View ngoài: Chịu trách nhiệm đổ bóng và bo góc (không bị clip shadow trên iOS) */}
      <View
        style={[
          styles.dockShadowContainer,
          {
            marginBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        {/* View trong: Chịu trách nhiệm overflow: 'hidden', border, background và chứa các tab item */}
        <View style={styles.dockInner}>
          {/* Một indicator duy nhất trượt mượt mà phía sau các icon */}
          <TabIndicator
            translateX={indicatorX}
            width={indicatorWidth}
            opacity={indicatorOpacity}
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
                onLayout={handleTabLayout}
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
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.65,
    shadowRadius: 20,
    elevation: 20,
  },
  dockInner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(18, 18, 20, 0.95)',
    borderRadius: radius.pill,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderWidth: DOCK_BORDER_WIDTH,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
});
