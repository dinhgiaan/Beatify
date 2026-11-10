import { useWindowDimensions } from 'react-native';
import { layout } from './layout';

export type Breakpoint = 'compact' | 'medium' | 'expanded';

export interface ResponsiveInfo {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  isLandscape: boolean;
  gutter: number;
  isCompact: boolean;
  isMedium: boolean;
  isExpanded: boolean;
  maxContentWidth: number;
}

/**
 * Hook đo đạc màn hình và phân loại thiết bị linh hoạt (Responsive)
 */
export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWindowDimensions();

  const isLandscape = width > height;

  let breakpoint: Breakpoint = 'compact';
  let gutterValue: number = layout.gutter.compact;

  if (width >= layout.breakpoints.medium) {
    breakpoint = 'expanded';
    gutterValue = layout.gutter.expanded;
  } else if (width >= layout.breakpoints.compact) {
    breakpoint = 'medium';
    gutterValue = layout.gutter.medium;
  }

  return {
    width,
    height,
    breakpoint,
    isLandscape,
    gutter: gutterValue,
    isCompact: breakpoint === 'compact',
    isMedium: breakpoint === 'medium',
    isExpanded: breakpoint === 'expanded',
    maxContentWidth: layout.maxContentWidth,
  };
}

