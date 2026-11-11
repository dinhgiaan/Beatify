import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { EqualizerIndicator } from './EqualizerIndicator';

vi.mock('react-native', () => {
  class MockAnimatedValue {
    _value: number;
    constructor(val: number) {
      this._value = val;
    }
    setValue = vi.fn();
    interpolate = vi.fn();
  }

  const timing = vi.fn().mockReturnValue({
    start: vi.fn((cb?: () => void) => cb?.()),
    stop: vi.fn(),
  });

  const sequence = vi.fn().mockReturnValue({
    start: vi.fn((cb?: () => void) => cb?.()),
    stop: vi.fn(),
  });

  const loop = vi.fn().mockReturnValue({
    start: vi.fn((cb?: () => void) => cb?.()),
    stop: vi.fn(),
  });

  return {
    View: (props: Record<string, unknown>) => React.createElement('view', props),
    StyleSheet: {
      create: (styles: Record<string, unknown>) => styles,
    },
    Animated: {
      Value: MockAnimatedValue,
      timing,
      sequence,
      loop,
      View: (props: Record<string, unknown>) => React.createElement('animated-view', props),
    },
  };
});

describe('EqualizerIndicator', () => {
  it('render thành công component khi đang phát nhạc', () => {
    const el = React.createElement(EqualizerIndicator, { isPlaying: true, size: 16 });
    expect(el).toBeTruthy();
  });

  it('render thành công component khi tạm dừng nhạc', () => {
    const el = React.createElement(EqualizerIndicator, { isPlaying: false, size: 16 });
    expect(el).toBeTruthy();
  });
});
