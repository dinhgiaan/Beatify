import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

vi.mock('react', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useRef: vi.fn((val) => ({ current: val })),
  };
});

const mockPush = vi.fn();
vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const mockTogglePlay = vi.fn();
const mockNext = vi.fn();
const mockUsePlayer = vi.fn();

vi.mock('../../context', () => ({
  usePlayer: () => mockUsePlayer(),
  useProgress: () => ({
    positionSec: 10,
    durationSec: 100,
    bufferedSec: 20,
    progressPercent: 10,
  }),
}));

      vi.mock('react-native', () => {
        class MockAnimatedValue {
          _value: number;
          constructor(val: number) {
            this._value = val;
          }
          setValue = vi.fn();
          interpolate = vi.fn();
        }
        const spring = vi.fn().mockReturnValue({
          start: vi.fn((cb?: () => void) => cb?.()),
          stop: vi.fn(),
        });
        return {
          View: (props: Record<string, unknown>) => React.createElement('view', props),
          Text: (props: Record<string, unknown>) => React.createElement('text', props),
          Image: (props: Record<string, unknown>) => React.createElement('image', props),
          TouchableOpacity: (props: { onPress?: () => void; children?: React.ReactNode }) =>
            React.createElement('touchable-opacity', props),
          StyleSheet: {
            create: function <T>(styles: T): T {
              return styles;
            },
            hairlineWidth: 1,
          },
Animated: {
  Value: MockAnimatedValue,
    spring,
    View: (props: Record<string, unknown>) => React.createElement('animated-view', props),
    },
  };
});

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

vi.mock('../icons/SvgIcons', () => ({
  PlayIcon: () => null,
  PauseIcon: () => null,
  NextIcon: () => null,
  DiscIcon: () => null,
}));

import { MiniPlayer } from './MiniPlayer';

describe('MiniPlayer Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('trả về null (ẩn hoàn toàn) khi KHÔNG có bài hát nào đang phát', () => {
    mockUsePlayer.mockReturnValue({
      currentTrack: null,
      playerState: { isPlaying: false },
      togglePlay: mockTogglePlay,
      next: mockNext,
    });

    const element = MiniPlayer();
    expect(element).toBeNull();
  });

  it('render giao diện MiniPlayer khi ĐANG CÓ bài hát phát', () => {
    mockUsePlayer.mockReturnValue({
      currentTrack: {
        id: 'track_1',
        title: 'Lối Nhỏ',
        artist: 'Đen Vâu',
        cover: 'https://example.com/cover.jpg',
      },
      playerState: { isPlaying: true },
      togglePlay: mockTogglePlay,
      next: mockNext,
    });

    const element = MiniPlayer();
    expect(element).not.toBeNull();
    // Kiểm tra accessibilityLabel chứa thông tin bài hát
    expect(element?.props.accessibilityLabel).toContain('Lối Nhỏ');
    expect(element?.props.accessibilityLabel).toContain('Đen Vâu');
  });

  it('chạm vào vùng nền MiniPlayer kích hoạt mở màn hình /now-playing', () => {
    mockUsePlayer.mockReturnValue({
      currentTrack: {
        id: 'track_1',
        title: 'Lối Nhỏ',
        artist: 'Đen Vâu',
      },
      playerState: { isPlaying: false },
      togglePlay: mockTogglePlay,
      next: mockNext,
    });

    const element = MiniPlayer();
    expect(element).not.toBeNull();
    // Giả lập chạm vào container
    element?.props.onPress();
    expect(mockPush).toHaveBeenCalledWith('/now-playing');
  });

  it('nhấn nút Play/Pause kích hoạt togglePlay', () => {
    mockUsePlayer.mockReturnValue({
      currentTrack: {
        id: 'track_1',
        title: 'Lối Nhỏ',
        artist: 'Đen Vâu',
      },
      playerState: { isPlaying: false },
      togglePlay: mockTogglePlay,
      next: mockNext,
    });

    const element = MiniPlayer();
    const contentRow = element?.props.children[1];
    const controlsRow = contentRow?.props.children[2];
    const playButton = controlsRow?.props.children[0];

    const stopPropagation = vi.fn();
    playButton.props.onPress({ stopPropagation });

    expect(stopPropagation).toHaveBeenCalled();
    expect(mockTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('nhấn nút Next kích hoạt next', () => {
    mockUsePlayer.mockReturnValue({
      currentTrack: {
        id: 'track_1',
        title: 'Lối Nhỏ',
        artist: 'Đen Vâu',
      },
      playerState: { isPlaying: false },
      togglePlay: mockTogglePlay,
      next: mockNext,
    });

    const element = MiniPlayer();
    const contentRow = element?.props.children[1];
    const controlsRow = contentRow?.props.children[2];
    const nextButton = controlsRow?.props.children[1];

    const stopPropagation = vi.fn();
    nextButton.props.onPress({ stopPropagation });

    expect(stopPropagation).toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledTimes(1);
  });
});
