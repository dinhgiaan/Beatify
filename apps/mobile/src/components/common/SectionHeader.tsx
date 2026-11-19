import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../../theme/tokens';
import { colors, fontWeights } from '../../theme';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  rightElement?: React.ReactNode;
  variant?: 'list' | 'section';
}

  export function SectionHeader({
    title,
    subtitle,
    rightElement,
    variant = 'section',
  }: SectionHeaderProps) {
    const isList = variant === 'list';

    return (
        <View style={[styles.container, isList && styles.listContainer]}>
          <View style={styles.textContainer}>
            <Text style={isList ? styles.listTitle : styles.sectionTitle}>
              {title}
            </Text>
            {Boolean(subtitle) && (
              <Text style={styles.subtitle}>{subtitle}</Text>
            )}
          </View>
          {rightElement}
        </View>
        );
}

        const styles = StyleSheet.create({
          container: {
          flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        paddingHorizontal: tokens.spacing.lg,
        paddingTop: 0,
        paddingBottom: 12, // Spacing giữa title và cards là 12pt (C3)
  },
        listContainer: {
          paddingTop: tokens.spacing.xl,
        paddingBottom: tokens.spacing.xs + 2,
  },
        textContainer: {
          flex: 1,
  },
          sectionTitle: {
          fontSize: 22, // Typography phân cấp tiêu đề section ~22pt bold (C2)
        fontWeight: fontWeights.bold,
        color: colors.textPrimary,
        letterSpacing: -0.3,
  },
        listTitle: {
          ...tokens.typography.sectionHeader,
  },
        subtitle: {
        fontSize: 13, // Subtitle ~13pt textSecondary (C2)
        fontWeight: fontWeights.regular,
        color: colors.textSecondary,
        marginTop: 3,
  },
});
