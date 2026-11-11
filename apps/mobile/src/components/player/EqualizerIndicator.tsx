import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { colors } from '../../theme';

interface EqualizerIndicatorProps {
  isPlaying?: boolean;
  color?: string;
  size?: number;
}

/**
 * Animated Equalizer Waveform: 3 cột sóng âm nhấp nhô sống động
 * Dùng useNativeDriver: true bảo đảm 60fps mượt mà trên iPhone
 */
export function EqualizerIndicator({
  isPlaying = true,
  color = colors.primary,
  size = 16,
}: EqualizerIndicatorProps) {
  const anim1 = useRef(new Animated.Value(0.4)).current;
  const anim2 = useRef(new Animated.Value(0.8)).current;
  const anim3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (!isPlaying) {
      anim1.setValue(0.3);
      anim2.setValue(0.3);
      anim3.setValue(0.3);
      return;
    }

    const createLoop = (anim: Animated.Value, min: number, max: number, duration: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: max,
            duration,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: min,
            duration,
            useNativeDriver: true,
          }),
        ])
      );
    };

    const loop1 = createLoop(anim1, 0.25, 1.0, 420);
    const loop2 = createLoop(anim2, 0.35, 1.0, 340);
    const loop3 = createLoop(anim3, 0.2, 0.9, 480);

    loop1.start();
    loop2.start();
    loop3.start();

    return () => {
      loop1.stop();
      loop2.stop();
      loop3.stop();
    };
  }, [isPlaying, anim1, anim2, anim3]);

  const barWidth = Math.max(2.5, Math.round(size / 6));
  const spacing = Math.max(1.5, Math.round(size / 8));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.bar,
          {
            width: barWidth,
            backgroundColor: color,
            marginRight: spacing,
            transform: [{ scaleY: anim1 }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.bar,
          {
            width: barWidth,
            backgroundColor: color,
            marginRight: spacing,
            transform: [{ scaleY: anim2 }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.bar,
          {
            width: barWidth,
            backgroundColor: color,
            transform: [{ scaleY: anim3 }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: 2,
    transformOrigin: 'bottom',
  },
});

