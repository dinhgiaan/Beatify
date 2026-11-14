import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
 * Banner trạng thái mạng tối giản phong cách Dynamic Island / Apple iOS
 * - Thiết kế viên thuốc đen mờ (Dark Glass), đường viền hairline thanh mảnh
 * - Tự động thu lại và ẩn sau 3.2 giây để không bao giờ che khuất nội dung hay làm phiền người dùng
 */
export function NetworkStatusBanner({ status }: NetworkStatusBannerProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(-60);
  const opacity = useSharedValue(0);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (status === 'offline' || status === 'reconnected') {
      setShouldRender(true);
      translateY.value = withSpring(0, { damping: 22, stiffness: 240, mass: 0.7 });
      opacity.value = withTiming(1, { duration: 220 });

      // Tự động thu ẩn sau 3.2 giây
      const timer = setTimeout(() => {
        translateY.value = withTiming(-60, { duration: 240 });
        opacity.value = withTiming(0, { duration: 200 }, () => {
          // Callback sau khi ẩn xong
        });
      }, 3200);

      return () => {
        clearTimeout(timer);
      };
    } else {
      translateY.value = withTiming(-60, { duration: 200 });
      opacity.value = withTiming(0, { duration: 180 });
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [status, translateY, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

    if (status === 'idle' && !shouldRender) {
      return null;
    }

    const isReconnected = status === 'reconnected';

    return (
      <Animated.View
        style={[
          styles.container,
          { top: Math.max(insets.top, 14) + 4 },
          animStyle,
        ]}
        pointerEvents="none"
      >
        <View
          style={[
            styles.statusDot,
            isReconnected ? styles.statusDotGreen : styles.statusDotOrange,
          ]}
        />
        <Text style={styles.messageText}>
          {isReconnected
          ? 'Đã kết nối lại • Đang đồng bộ'
          : 'Chế độ ngoại tuyến • Phát nhạc đã tải'}
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
      paddingHorizontal: spacing.md,
      paddingVertical: 7,
      borderRadius: radius.pill,
      zIndex: 9999,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.45,
      shadowRadius: 14,
      elevation: 20,
      maxWidth: '88%',
      backgroundColor: 'rgba(22, 22, 26, 0.94)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.12)',
    },
      statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 8,
      },
        statusDotGreen: {
          backgroundColor: colors.primary,
          shadowColor: colors.primary,
          shadowOpacity: 0.8,
          shadowRadius: 4,
        },
          statusDotOrange: {
            backgroundColor: '#f59e0b',
            shadowColor: '#f59e0b',
            shadowOpacity: 0.8,
            shadowRadius: 4,
          },
          messageText: {
            color: colors.textPrimary,
            fontSize: fontSizes.caption,
            fontWeight: fontWeights.medium,
            letterSpacing: 0.2,
          },
        });

