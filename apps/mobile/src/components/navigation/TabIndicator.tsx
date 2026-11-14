import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';
import { radius } from '../../theme';
import { logTabDebug } from '../../utils/debugLogger';

export const DOCK_BORDER_WIDTH = 1;

export interface TabIndicatorProps {
  translateX: SharedValue<number>;
  width: SharedValue<number>;
  opacity: SharedValue<number>;
}

const logTranslateX = (val: number) => {
  logTabDebug('[TabIndicator] translateX =', Math.round(val * 10) / 10);
};

/**
 * TabIndicator: Nền active dạng viên thuốc (Liquid Glass / Capsule)
 * Chạy hoàn toàn trên UI-thread qua SharedValue và useAnimatedStyle
 */
export function TabIndicator({ translateX, width, opacity }: TabIndicatorProps) {
  useAnimatedReaction(
    () => Math.round(translateX.value * 10) / 10,
    (current, previous) => {
      if (current !== previous) {
        runOnJS(logTranslateX)(current);
      }
    }
  );

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
