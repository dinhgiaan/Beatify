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

  const displayTitle = title || getStandardGreeting();

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrapper}>
          <Text style={styles.title} numberOfLines={1}>
            {displayTitle}
          </Text>
          {Boolean(subtitle) && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>

        {/* Nút Cài đặt / Tùy chọn nhanh góc phải theo chuẩn Apple HIG (nền bo tròn surfaceElevated) */}
        <TouchableOpacity
          onPress={handleSettingsPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.settingsButton}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Cài đặt ứng dụng"
        >
          <SettingsGearIcon size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 28, // Khoảng cách thông thoáng giữa Lời chào và Chọn nhanh cho bạn
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
    fontSize: 28,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
});
