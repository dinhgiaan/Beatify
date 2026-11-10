import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayer } from '../context';
import { spacing } from '../theme';

export const TAB_BAR_BASE_HEIGHT = 49;
export const MINI_PLAYER_HEIGHT = 56;

export interface TabBarMetrics {
  tabBarHeight: number;
  miniPlayerHeight: number;
  bottomInset: number;
  contentPaddingBottom: number;
}

/**
 * Hook đo đạc các chỉ số hình học của thanh điều hướng dưới đáy (Tab Bar) và MiniPlayer
 * Dùng để tính toán khoảng đệm cuộn an toàn (contentPaddingBottom) cho mọi màn hình trong Tabs.
 */
export function useTabBarMetrics(): TabBarMetrics {
  const insets = useSafeAreaInsets();
  const { currentTrack } = usePlayer();

  const miniPlayerHeight = currentTrack ? MINI_PLAYER_HEIGHT : 0;
  const bottomInset = insets.bottom;
  const contentPaddingBottom =
    TAB_BAR_BASE_HEIGHT + miniPlayerHeight + bottomInset + spacing.sm;

  return {
    tabBarHeight: TAB_BAR_BASE_HEIGHT,
    miniPlayerHeight,
    bottomInset,
    contentPaddingBottom,
  };
}
