import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  type ListRenderItem,
} from 'react-native';
import { SectionHeader } from '../common/SectionHeader';
import { ChevronRightIcon } from '../icons/SvgIcons';
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
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={styles.seeAllButton}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Xem tất cả ${title}`}
      >
        <Text style={styles.seeAllText}>Xem tất cả</Text>
        <ChevronRightIcon size={14} color={colors.primary} />
      </TouchableOpacity>
    ) : undefined);

  return (
    <View style={styles.container}>
      <SectionHeader
        title={title}
        subtitle={subtitle}
        rightElement={effectiveRightElement}
        variant="section"
      />
      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={itemWidth + itemSpacing}
        decelerationRate="fast"
        snapToAlignment="start"
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
    marginBottom: 32, // E4: Khoảng cách giữa các section 32pt
  },
  listContent: {
    paddingHorizontal: spacing.lg,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 44, // Touch target >= 44pt (C2)
    justifyContent: 'center',
  },
  seeAllText: {
    ...typography.subheadline,
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
});
