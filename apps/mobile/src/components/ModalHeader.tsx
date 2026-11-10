import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { colors, spacing, radius, fontSizes, fontWeights } from '../theme';
import { CloseIcon } from './icons/SvgIcons';

export interface ModalHeaderProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  rightElement?: React.ReactNode;
}

/**
 * Component Header dùng chung cho các Modal (EditTrackModal, LyricsModal, PlaylistModal, ProfileModal)
 * Nút đóng đạt vùng chạm chuẩn Apple HIG >= 44x44pt.
 */
export function ModalHeader({
  title,
  subtitle,
  onClose,
  closeDisabled = false,
  rightElement,
}: ModalHeaderProps) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.titleCol}>
        <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.headerSubtitle} numberOfLines={1} ellipsizeMode="middle">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.rightGroup}>
        {rightElement}
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          disabled={closeDisabled}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel="Đóng cửa sổ"
        >
          <CloseIcon size={18} color={colors.textMedium} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  titleCol: {
    flex: 1,
    paddingRight: spacing.md,
  },
  headerTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: fontSizes.caption,
    color: colors.textTertiary,
    marginTop: spacing.xxs,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
