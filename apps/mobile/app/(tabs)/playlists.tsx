import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBarMetrics } from '../../src/hooks/useTabBarMetrics';
import { PlaylistIcon } from '../../src/components/icons/SvgIcons';
import {
  colors,
  fontSizes,
  fontWeights,
  spacing,
} from '../../src/theme';

/**
 * Màn hình Playlist (Placeholder cho Pha 2, hoàn thiện ở các pha sau)
 */
export default function PlaylistsScreen() {
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
        <Text style={styles.headerTitle}>Playlist</Text>
      </View>

      <View style={styles.placeholderCenter}>
        <PlaylistIcon size={56} color={colors.borderLight} />
        <Text style={styles.placeholderTitle}>Danh sách phát cá nhân</Text>
        <Text style={styles.placeholderSubtitle}>
          Giao diện quản lý danh sách phát và danh sách yêu thích sẽ được nâng cấp ở các pha tiếp theo.
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
