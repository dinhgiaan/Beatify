import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../../theme/tokens';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  rightElement?: React.ReactNode;
}

export function SectionHeader({ title, subtitle, rightElement }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        {Boolean(subtitle) && <Text style={styles.subtitle}>{subtitle}</Text>}
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
    paddingTop: tokens.spacing.xl,
    paddingBottom: tokens.spacing.xs + 2,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    ...tokens.typography.sectionHeader,
  },
  subtitle: {
    ...tokens.typography.footnote,
    color: tokens.colors.textMuted,
    marginTop: 2,
    textTransform: 'none',
  },
});

