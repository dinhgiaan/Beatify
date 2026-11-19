import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useMotionEnabled } from '../../lib/motion';
import { radius } from '../../theme';

export interface TabIndicatorProps {
  activeIndex: SharedValue<number>;
  containerWidth: SharedValue<number>;
  totalTabs: number;
}

/**
 * TabIndicator: Nền active dạng viên thuốc (Liquid Glass / Capsule)
 * Chạy 100% trên UI thread, tính toán trực tiếp từ index và độ rộng container
 * Co giãn chiều rộng (width) nhẹ nhàng khi trượt, giữ nguyên góc bo tròn hoàn hảo
 */
export function TabIndicator({
  activeIndex,
  containerWidth,
  totalTabs,
}: TabIndicatorProps) {
  const isMotionEnabled = useMotionEnabled();

  const pillAnimStyle = useAnimatedStyle(() => {
    // Trừ 8px padding (4px trái, 4px phải của dockInner)
    const availableWidth = Math.max(0, containerWidth.value - 8);
    const tabWidth = totalTabs > 0 ? availableWidth / totalTabs : 0;

    // Tính toán độ giãn chiều ngang (width) khi lướt giữa các tab (tắt nếu bật Giảm chuyển động)
    let stretch = 0;
    if (isMotionEnabled && tabWidth > 0) {
      const fraction = Math.abs(activeIndex.value - Math.round(activeIndex.value));
      // Tối đa giãn thêm ~12% chiều rộng tab tại điểm giữa
      stretch = Math.sin(fraction * Math.PI) * (tabWidth * 0.12);
    }

    const currentWidth = tabWidth + stretch;
    const translateX = activeIndex.value * tabWidth - stretch / 2;

    return {
      width: currentWidth > 0 ? currentWidth : 0,
      transform: [
        {
          translateX,
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
    backgroundColor: 'rgba(29, 185, 84, 0.22)',
    borderColor: 'rgba(29, 185, 84, 0.4)',
    borderWidth: 1.5,
    borderRadius: radius.pill,
    zIndex: 1,
  },
});
