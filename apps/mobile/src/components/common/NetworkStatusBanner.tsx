import React, { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, fontSizes, fontWeights, spacing } from '../../theme';

export interface NetworkStatusBannerProps {
  status: 'offline' | 'reconnected' | 'idle';
}

/**
 * Banner trạng thái mạng nổi chuyển động mượt mà phong cách Dynamic Island / iOS Notification
 * - Khi ngoại tuyến: hiển thị dạng viên thuốc cam mờ nhẹ nhàng, không gây gián đoạn
 * - Khi kết nối lại: chuyển sang xanh lá thành công và tự động thu lại sau 2.5 giây
 */
export function NetworkStatusBanner({ status }: NetworkStatusBannerProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(-80);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (status === 'offline' || status === 'reconnected') {
      translateY.value = withSpring(0, { damping: 20, stiffness: 220 });
      opacity.value = withTiming(1, { duration: 250 });
    } else {
      translateY.value = withTiming(-80, { duration: 250 });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [status, translateY, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
    display: opacity.value === 0 ? 'none' : 'flex',
  }));

  if (status === 'idle') {
    return null;
  }

  const isReconnected = status === 'reconnected';

  return (
    <Animated.View
      style={[
        styles.container,
        { top: Math.max(insets.top, 12) + 6 },
        isReconnected ? styles.containerReconnected : styles.containerOffline,
        animStyle,
      ]}
      pointerEvents="none"
    >
      <Text style={styles.iconText}>{isReconnected ? '✓' : '⚡'}</Text>
      <Text style={styles.messageText}>
        {isReconnected
          ? 'Đã kết nối lại mạng • Đang đồng bộ'
          : 'Ngoại tuyến • Đang phát nhạc đã lưu trên máy'}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md + 4,
    paddingVertical: 8,
    borderRadius: radius.pill,
    zIndex: 9999,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 25,
    maxWidth: '90%',
    borderWidth: 1,
  },
  containerOffline: {
    backgroundColor: 'rgba(28, 25, 23, 0.96)',
    borderColor: 'rgba(249, 115, 22, 0.45)',
  },
  containerReconnected: {
    backgroundColor: 'rgba(20, 30, 22, 0.96)',
    borderColor: 'rgba(29, 185, 84, 0.5)',
  },
  iconText: {
    fontSize: 14,
    marginRight: 8,
    color: colors.primary,
  },
  messageText: {
    color: colors.textPrimary,
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.medium,
  },
});

