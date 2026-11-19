import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, fontWeights } from '../../theme';
import { SettingsGearIcon } from '../icons/SvgIcons';
import { triggerSelectionHaptic } from '../../utils/haptics';

export interface HomeGreetingProps {
  title?: string;
  subtitle?: string;
  onSettingsPress?: () => void;
}

/**
 * Xác định lời chào ngắn gọn chuẩn mực theo khung giờ (E5):
 * "Chào buổi sáng", "Chào buổi chiều", "Chào buổi tối", "Chào đêm muộn"
 * Bỏ emoji để giao diện thanh lịch, tối giản.
 */
function getStandardGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'Chào buổi sáng';
  if (hour >= 11 && hour < 17) return 'Chào buổi chiều';
  if (hour >= 17 && hour < 22) return 'Chào buổi tối';
  return 'Chào đêm muộn';
}

/**
 * Lời chào Trang chủ theo khung giờ chuẩn Apple Music / Spotify
 * - Tiêu đề 30pt/700 (E2)
 * - Nút bánh răng cài đặt nhanh góc phải (B4)
 * - Dưới lời chào cách 20pt (E4)
 */
export const HomeGreeting = React.memo(function HomeGreeting({
  title,
  subtitle,
  onSettingsPress,
}: HomeGreetingProps) {
  const router = useRouter();

  const handleSettingsPress = () => {
    triggerSelectionHaptic();
    if (onSettingsPress) {
      onSettingsPress();
    } else {
      router.push('/settings');
    }
  };

  const displayTitle = title && title.startsWith('Chào ') ? title : getStandardGreeting();
  const displaySubtitle = subtitle || 'Hôm nay bạn muốn nghe gì?';

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrapper}>
          <Text style={styles.title} numberOfLines={1}>
            {displayTitle}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {displaySubtitle}
          </Text>
        </View>

        {/* B4: Nút Cài đặt nhanh góc phải */}
        <TouchableOpacity
          onPress={handleSettingsPress}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.settingsButton}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Cài đặt ứng dụng"
        >
          <SettingsGearIcon size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 20, // E4: dưới lời chào cách 20pt
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleWrapper: {
    flex: 1,
    marginRight: spacing.sm,
  },
  title: {
    fontSize: 30, // E2: lời chào 30pt/700
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: fontWeights.regular,
    color: colors.textSecondary,
    marginTop: 2,
    letterSpacing: -0.1,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
});
