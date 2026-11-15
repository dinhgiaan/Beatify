import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { radius } from '../../theme';

export interface TabIndicatorProps {
  activeIndex: SharedValue<number>;
  containerWidth: SharedValue<number>;
  totalTabs: number;
}

/**
 * TabIndicator: Nền active dạng viên thuốc (Liquid Glass / Capsule)
 * Chạy 100% trên UI thread, tính toán trực tiếp từ index và độ rộng container
 * Loại bỏ hoàn toàn hiện tượng Yoga relayout và giật khung hình
 */
export function TabIndicator({
  activeIndex,
  containerWidth,
  totalTabs,
}: TabIndicatorProps) {
  const pillAnimStyle = useAnimatedStyle(() => {
    // Trừ 8px padding (4px trái, 4px phải của dockInner)
    const availableWidth = Math.max(0, containerWidth.value - 8);
    const tabWidth = totalTabs > 0 ? availableWidth / totalTabs : 0;

    return {
      width: tabWidth > 0 ? tabWidth : 0,
      transform: [
        {
          translateX: activeIndex.value * tabWidth,
        },
      ],
      opacity: containerWidth.value > 0 ? 1 : 0,
    };
  });

  return (
    <Animated.View
      style={[styles.slidingActivePill, pillAnimStyle]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  slidingActivePill: {
    position: 'absolute',
    left: 4,
    top: 4,
    height: 42,
    backgroundColor: 'rgba(29, 185, 84, 0.28)',
    borderColor: 'rgba(29, 185, 84, 0.85)',
    borderWidth: 1.5,
    borderRadius: radius.pill,
    zIndex: 1,
  },
});
