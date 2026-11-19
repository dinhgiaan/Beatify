import React from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
  type AccessibilityRole,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { MOTION, useMotionEnabled } from '../../lib/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps {
  children: React.ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  delayLongPress?: number;
  activeScale?: number;
  scaleTo?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  testID?: string;
}

/**
 * PressableScale: Hiệu ứng nhún lò xo êm ái khi nhấn (mặc định scale 0.96)
 * - Chạy 100% trên UI thread qua Reanimated withSpring
 * - Tôn trọng hook useMotionEnabled() (không phụ thuộc Reduce Motion hệ thống trừ khi người dùng bật)
 * - Dùng AnimatedPressable trực tiếp, bảo đảm flexDirection và layout flex không bị vỡ bởi View bọc ngoài
 */
export function PressableScale({
  children,
  onPress,
  onLongPress,
  delayLongPress = 450,
  activeScale = 0.96,
  scaleTo,
  disabled = false,
  style,
  contentStyle,
  hitSlop,
  accessibilityLabel,
  accessibilityRole = 'button',
  testID,
}: PressableScaleProps) {
  const isMotionEnabled = useMotionEnabled();
  const effectiveActiveScale = scaleTo ?? activeScale;
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    if (disabled || !isMotionEnabled) return;
    scale.value = withSpring(effectiveActiveScale, MOTION.spring.press);
  };

  const handlePressOut = () => {
    if (disabled || !isMotionEnabled) return;
    scale.value = withSpring(1, MOTION.spring.press);
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      testID={testID}
      style={[style, contentStyle, animStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
