import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { radius } from '../../theme';

export const DOCK_BORDER_WIDTH = 1;

export interface TabIndicatorProps {
  translateX: SharedValue<number>;
  width: SharedValue<number>;
  opacity: SharedValue<number>;
}

/**
 * TabIndicator: Nền active dạng viên thuốc (Liquid Glass / Capsule)
 * Chạy 100% trên UI thread bằng GPU transform mà không tiêu tốn tài nguyên JS thread
 */
export function TabIndicator({ translateX, width, opacity }: TabIndicatorProps) {
  const pillAnimStyle = useAnimatedStyle(() => {
    return {
      width: width.value > 0 ? width.value : 0,
      transform: [
        {
          translateX: translateX.value - DOCK_BORDER_WIDTH,
        },
      ],
      opacity: opacity.value,
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
    left: 0,
    top: 4,
    height: 42,
    backgroundColor: 'rgba(29, 185, 84, 0.28)',
    borderColor: 'rgba(29, 185, 84, 0.85)',
    borderWidth: 1.5,
    borderRadius: radius.pill,
    zIndex: 1,
  },
});
