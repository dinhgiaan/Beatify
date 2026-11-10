import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBarMetrics } from '../../src/hooks/useTabBarMetrics';
import { SearchIcon } from '../../src/components/icons/SvgIcons';
import {
  colors,
  fontSizes,
  fontWeights,
  spacing,
} from '../../src/theme';

/**
 * Màn hình Tìm kiếm (Placeholder cho Pha 2, hoàn thiện ở Pha 3)
 */
export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { contentPaddingBottom } = useTabBarMetrics();

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          paddingBottom: contentPaddingBottom,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tìm kiếm</Text>
      </View>

      <View style={styles.placeholderCenter}>
        <SearchIcon size={56} color={colors.borderLight} />
        <Text style={styles.placeholderTitle}>Tìm bài hát, ca sĩ, album</Text>
        <Text style={styles.placeholderSubtitle}>
          Tính năng tìm kiếm tức thì sẽ được kích hoạt ở Pha 3 theo kế hoạch trải nghiệm.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: fontSizes.headline,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  placeholderCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  placeholderTitle: {
    fontSize: fontSizes.subheading,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  placeholderSubtitle: {
    fontSize: fontSizes.subhead,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
