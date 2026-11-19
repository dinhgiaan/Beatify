import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontWeights } from '../../theme';

export interface HomeGreetingProps {
  title: string;
  subtitle: string;
}

/**
 * Lời chào Trang chủ theo khung giờ (Sáng / Chiều / Tối / Đêm muộn)
 * Thiết kế phân cấp thị giác mạnh mẽ: Hero title ~28pt bold + compact subtitle (C4)
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
    fontSize: 28, // Large hero title ~28pt bold (C4)
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: fontWeights.regular,
    color: colors.textSecondary,
    marginTop: 4,
    letterSpacing: -0.1,
  },
});
