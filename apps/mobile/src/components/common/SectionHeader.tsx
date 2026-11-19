import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle, type TextStyle } from 'react-native';
import { tokens } from '../../theme/tokens';
import { colors, fontWeights } from '../../theme';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  rightElement?: React.ReactNode;
  variant?: 'list' | 'section';
  containerStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
}

export function SectionHeader({
  title,
  subtitle,
  rightElement,
  variant = 'section',
  containerStyle,
  titleStyle,
}: SectionHeaderProps) {
  const isList = variant === 'list';

  if (isList) {
    return (
      <View style={[styles.container, styles.listContainer, containerStyle]}>
        <View style={styles.textContainer}>
          <Text style={[styles.listTitle, titleStyle]}>{title}</Text>
          {Boolean(subtitle) && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        {rightElement}
      </View>
    );
  }

  return (
    <View style={[styles.container, !subtitle && styles.containerCompact, containerStyle]}>
      {/* E3: Hàng tiêu đề section: 'Xem tất cả' căn giữa trực tiếp theo dòng TIÊU ĐỀ */}
      <View style={styles.topRow}>
        <Text style={[styles.sectionTitle, titleStyle]} numberOfLines={1} ellipsizeMode="tail">
          {title}
        </Text>
        {rightElement}
      </View>

      {/* E2 & E4: Phụ đề 13pt/400 1 dòng ellipsis, cách tiêu đề 2pt, cách hàng card 14pt */}
      {Boolean(subtitle) && (
        <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
          {subtitle}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: 0,
    paddingBottom: 14, // E4: khoảng cách phụ đề -> hàng card là 14pt
  },
  containerCompact: {
    paddingBottom: 12, // Khi không có phụ đề: khoảng cách từ tiêu đề -> hàng card là 12pt
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 28,
  },
  listContainer: {
    paddingTop: tokens.spacing.md,
    paddingBottom: tokens.spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  textContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20, // E2: tiêu đề section 20pt/700
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    letterSpacing: -0.3,
    flex: 1,
    marginRight: tokens.spacing.sm,
  },
  listTitle: {
    ...tokens.typography.sectionHeader,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: tokens.colors.textSecondary,
  },
  subtitle: {
    fontSize: 13, // E2: phụ đề 13pt/400 (bắt buộc 1 dòng, ellipsis)
    fontWeight: fontWeights.regular,
    color: colors.textSecondary, // E1: màu xám vừa ~ #A1A1AA
    marginTop: 2, // E4: khoảng cách tiêu đề -> phụ đề 2pt
  },
});
