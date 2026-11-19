import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import type { UserMoodPrediction } from '@music-app/shared';
import { colors, spacing, fontWeights } from '../../theme';
import { SettingsGearIcon } from '../icons/SvgIcons';
import { triggerSelectionHaptic } from '../../utils/haptics';

export interface HomeGreetingProps {
  title?: string;
  subtitle?: string;
  userMood?: UserMoodPrediction;
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
  userMood,
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
          {Boolean(userMood?.badgeText) && (
            <View style={styles.moodBadgeRow}>
              <View style={styles.moodPill}>
                <Text style={styles.moodPillDot}>•</Text>
                <Text style={styles.moodPillText}>Cảm xúc: {userMood?.badgeText}</Text>
              </View>
            </View>
          )}
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
  moodBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  moodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 4,
  },
  moodPillDot: {
    color: colors.primary,
    fontSize: 10,
    lineHeight: 12,
  },
  moodPillText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
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
