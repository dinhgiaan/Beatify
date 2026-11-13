import React, { Children } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { tokens } from '../../theme/tokens';

export interface ListGroupProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function ListGroup({ children, style }: ListGroupProps) {
  const childArray = Children.toArray(children).filter(Boolean);

  return (
    <View style={[styles.container, style]}>
      {childArray.map((child, index) => {
        const isLast = index === childArray.length - 1;
        return (
          <React.Fragment key={index}>
            {child}
            {!isLast && <View style={styles.separator} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: tokens.colors.bgSurface,
    borderRadius: tokens.radius.card,
    marginHorizontal: tokens.spacing.lg,
    overflow: 'hidden',
  },
  separator: {
    height: tokens.hairlineWidth,
    backgroundColor: tokens.colors.separator,
    marginLeft: tokens.spacing.lg,
  },
});

