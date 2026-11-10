import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (obj: Record<string, unknown>) => obj.ios },
  useWindowDimensions: () => ({ width: 414, height: 896 }),
  StyleSheet: { create: <T>(styles: T): T => styles },
}));

const mockUseSafeAreaInsets = vi.fn();
const mockUsePlayer = vi.fn();

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockUseSafeAreaInsets(),
}));

vi.mock('../context', () => ({
  usePlayer: () => mockUsePlayer(),
}));

import { useTabBarMetrics, TAB_BAR_BASE_HEIGHT, MINI_PLAYER_HEIGHT } from './useTabBarMetrics';
import { spacing } from '../theme';

describe('useTabBarMetrics Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSafeAreaInsets.mockReturnValue({ bottom: 34, top: 47, left: 0, right: 0 });
  });

  it('tính toán đúng các chỉ số khi ĐANG CÓ bài hát phát (miniPlayerHeight = 56)', () => {
    mockUsePlayer.mockReturnValue({
      currentTrack: { id: 'track_1', title: 'Bài hát mẫu', artist: 'Ca sĩ mẫu' },
    });

    const result = useTabBarMetrics();

    expect(result.tabBarHeight).toBe(TAB_BAR_BASE_HEIGHT);
    expect(result.miniPlayerHeight).toBe(MINI_PLAYER_HEIGHT);
    expect(result.bottomInset).toBe(34);
    expect(result.contentPaddingBottom).toBe(
      TAB_BAR_BASE_HEIGHT + MINI_PLAYER_HEIGHT + 34 + spacing.sm
    );
  });

  it('tính toán đúng các chỉ số khi KHÔNG CÓ bài hát phát (miniPlayerHeight = 0)', () => {
    mockUsePlayer.mockReturnValue({
      currentTrack: null,
    });

    const result = useTabBarMetrics();

    expect(result.tabBarHeight).toBe(TAB_BAR_BASE_HEIGHT);
    expect(result.miniPlayerHeight).toBe(0);
    expect(result.bottomInset).toBe(34);
    expect(result.contentPaddingBottom).toBe(
      TAB_BAR_BASE_HEIGHT + 0 + 34 + spacing.sm
    );
  });

  it('tôn trọng insets.bottom thay đổi (ví dụ khi bottom = 0)', () => {
    mockUseSafeAreaInsets.mockReturnValue({ bottom: 0, top: 20, left: 0, right: 0 });
    mockUsePlayer.mockReturnValue({
      currentTrack: { id: 'track_2', title: 'Bài 2', artist: 'Ca sĩ 2' },
    });

    const result = useTabBarMetrics();

    expect(result.bottomInset).toBe(0);
    expect(result.contentPaddingBottom).toBe(
      TAB_BAR_BASE_HEIGHT + MINI_PLAYER_HEIGHT + 0 + spacing.sm
    );
  });
});
