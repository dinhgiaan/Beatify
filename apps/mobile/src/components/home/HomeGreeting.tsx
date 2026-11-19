import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme';

export interface HomeGreetingProps {
  title: string;
  subtitle: string;
}

/**
 * Lời chào Trang chủ theo khung giờ (Sáng / Chiều / Tối / Đêm muộn)
 * Thiết kế tối giản, sạch sẽ, chuẩn Apple HIG (đã bỏ nút cài đặt nhanh theo yêu cầu)
 */
export const HomeGreeting = React.memo(function HomeGreeting({
  title,
  subtitle,
}: HomeGreetingProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title} numberOfLines={1}>
        {title} ✨
      </Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {subtitle}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.heroTitle,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.subheadline,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
