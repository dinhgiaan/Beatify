import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, type ListRenderItem } from 'react-native';
import { SectionHeader } from '../common/SectionHeader';
import { spacing, colors, typography, fontWeights } from '../../theme';
import { haptics } from '../../lib/haptics';

export interface SectionRowProps<T> {
  title: string;
  subtitle?: string;
  data: T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  itemWidth: number;
  itemSpacing?: number;
  rightElement?: React.ReactNode;
  onSeeAll?: () => void;
}

export const SectionRow = React.memo(function SectionRow<T>({
  title,
  subtitle,
  data,
  renderItem,
  keyExtractor,
  itemWidth,
  itemSpacing = spacing.md,
  rightElement,
  onSeeAll,
}: SectionRowProps<T>) {
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: itemWidth + itemSpacing,
      offset: (itemWidth + itemSpacing) * index,
      index,
    }),
    [itemWidth, itemSpacing]
  );

  const effectiveRightElement =
    rightElement ??
    (onSeeAll && data.length > 6 ? (
      <TouchableOpacity
        onPress={() => {
          haptics.tap();
          onSeeAll();
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Xem tất cả ${title}`}
      >
        <Text style={styles.seeAllText}>Xem tất cả</Text>
      </TouchableOpacity>
    ) : undefined);

  return (
    <View style={styles.container}>
      <SectionHeader title={title} subtitle={subtitle} rightElement={effectiveRightElement} />
      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        initialNumToRender={4}
        maxToRenderPerBatch={6}
        windowSize={5}
        getItemLayout={getItemLayout}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}) as <T>(props: SectionRowProps<T>) => React.ReactElement;

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
  },
  seeAllText: {
    ...typography.subheadline,
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
});
