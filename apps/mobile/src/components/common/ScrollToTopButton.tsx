import React, { useEffect } from 'react';
import { TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { ChevronUpIcon } from '../icons/SvgIcons';
import { colors } from '../../theme';
import { triggerSelectionHaptic } from '../../utils/haptics';

export interface ScrollToTopButtonProps {
  visible: boolean;
  onPress: () => void;
  bottomOffset?: number;
  rightOffset?: number;
  style?: ViewStyle;
}

/**
 * Nút Cuộn lên đầu trang (Scroll to Top) phong cách Apple
 * - Tự động hiển thị khi cuộn xuống sâu
 * - Icon mũi tên có animation nhảy lên nhảy xuống nhẹ nhàng, mượt mà
 * - Nhấn vào kích hoạt haptic và cuộn êm ái lên đầu trang
 */
export function ScrollToTopButton({
  visible,
  onPress,
  bottomOffset = 115,
  rightOffset = 20,
  style,
}: ScrollToTopButtonProps) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.7);
  const translateY = useSharedValue(0);

  // Hiệu ứng hiện / ẩn mượt mà
  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 250 });
      scale.value = withSpring(1, { damping: 18, stiffness: 200 });

      // Bắt đầu animation nhịp nhàng mũi tên nhảy lên nhảy xuống
      translateY.value = withRepeat(
        withSequence(
          withTiming(-4, { duration: 600, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 600, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        true
      );
    } else {
      opacity.value = withTiming(0, { duration: 200 });
      scale.value = withTiming(0.7, { duration: 200 });
      translateY.value = 0;
    }
  }, [visible, opacity, scale, translateY]);

  const containerAnimStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
    display: opacity.value === 0 ? 'none' : 'flex',
  }));

  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handlePress = () => {
    triggerSelectionHaptic();
    // Hiệu ứng mũi tên nảy vọt lên khi bấm
    translateY.value = withSequence(
      withTiming(-8, { duration: 120 }),
      withTiming(0, { duration: 200 })
    );
    onPress();
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { bottom: bottomOffset, right: rightOffset },
        containerAnimStyle,
        style,
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <TouchableOpacity
        style={styles.button}
        onPress={handlePress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Cuộn lên đầu trang"
      >
        <Animated.View style={iconAnimStyle}>
          <ChevronUpIcon size={20} color={colors.primary} />
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 99,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(28, 28, 30, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 12,
  },
});
