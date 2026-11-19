import { useWindowDimensions } from 'react-native';

export const CARD_VISIBLE = 3.5;
export const CARD_GAP = 12;
export const SECTION_PADDING = 16;
export const MIN_CARD_WIDTH = 92;
export const MAX_CARD_WIDTH = 128;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export interface CardMetrics {
  cardWidth: number;
  artistChipWidth: number;
  cardGap: number;
  sectionPadding: number;
  snapInterval: number;
}

/**
 * Hook tính toán kích thước thẻ hiển thị đồng đều trên mọi kích cỡ màn hình iOS (C1)
 * Đảm bảo luôn thấy 3.5 card (vừa vặn 3 card và 1 nửa card tiếp theo để gợi ý cuộn)
 */
export function useCardWidth(): CardMetrics {
  const { width: windowWidth } = useWindowDimensions();

  const rawWidth = (windowWidth - SECTION_PADDING - CARD_GAP * 3) / CARD_VISIBLE;
  const cardWidth = Math.round(clamp(rawWidth, MIN_CARD_WIDTH, MAX_CARD_WIDTH));
  const artistChipWidth = Math.round(cardWidth * 0.8);
  const snapInterval = cardWidth + CARD_GAP;

  return {
    cardWidth,
    artistChipWidth,
    cardGap: CARD_GAP,
    sectionPadding: SECTION_PADDING,
    snapInterval,
  };
}

