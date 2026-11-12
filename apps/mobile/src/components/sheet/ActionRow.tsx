import React from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';
import { MOTION } from '../../lib/motion';

export type DownloadStatus = 'idle' | 'downloading' | 'downloaded' | 'error';

export interface ActionRowProps {
  label: string;
  secondaryText?: string;
  secondaryColor?: string;
  isDestructive?: boolean;
  progressPercent?: number; // 0 - 100 cho trạng thái downloading
  onPress?: () => void;
  disabled?: boolean;
}

export const ActionRow: React.FC<ActionRowProps> = ({
  label,
  secondaryText,
  secondaryColor,
  isDestructive,
  progressPercent,
  onPress,
  disabled,
}) => {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.content}>
        {/* Nhãn chính bên trái */}
        <Animated.Text
          key={label}
          entering={FadeIn.duration(MOTION.duration.fast)}
          exiting={FadeOut.duration(MOTION.duration.fast)}
          style={[
            styles.label,
            isDestructive && styles.destructiveLabel,
          ]}
          numberOfLines={1}
        >
          {label}
        </Animated.Text>

        {/* Chữ phụ căn phải */}
        {secondaryText ? (
          <Animated.Text
            key={secondaryText}
            entering={FadeIn.duration(MOTION.duration.fast)}
            exiting={FadeOut.duration(MOTION.duration.fast)}
            style={[
              styles.secondary,
              secondaryColor ? { color: secondaryColor } : null,
            ]}
          >
            {secondaryText}
          </Animated.Text>
        ) : null}
      </View>

      {/* Đường progress mỏng 2px màu xanh ở đáy hàng khi đang tải */}
      {progressPercent !== undefined && progressPercent >= 0 ? (
        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${Math.min(100, Math.max(0, progressPercent))}%` },
            ]}
          />
        </View>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 46,
    paddingHorizontal: tokens.spacing.sheetPadding,
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: 'transparent',
  },
  pressed: {
    backgroundColor: tokens.colors.bgHighlight,
  },
  disabled: {
    opacity: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: tokens.typography.actionLabel.fontSize,
    fontWeight: tokens.typography.actionLabel.fontWeight,
    color: tokens.colors.textPrimary,
    letterSpacing: -0.2,
  },
  destructiveLabel: {
    color: tokens.colors.danger,
    fontWeight: '500',
  },
  secondary: {
    fontSize: tokens.typography.actionSecondary.fontSize,
    fontWeight: tokens.typography.actionSecondary.fontWeight,
    color: tokens.colors.textMuted,
  },
  progressBarTrack: {
    position: 'absolute',
    left: tokens.spacing.sheetPadding,
    right: tokens.spacing.sheetPadding,
    bottom: 0,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: tokens.colors.accent,
    borderRadius: 1,
  },
});
