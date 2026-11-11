import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { colors, radius } from '../../theme';

interface BassWaveformVisualizerProps {
  isPlaying: boolean;
  barCount?: number;
  height?: number;
}

/**
 * BassWaveformVisualizer: Cụm Stereo LED VU Meter / Bass Spectrum Visualizer dày dặn
 * Mô phỏng dải đèn nhảy nhịp điệu của các dòng đài cassette Boombox cổ điển và bàn mixer phòng thu Hip-hop.
 * Gồm các dải tần Sub-bass, 808 Kick, Mid-range và Treble nảy sống động ở 60fps.
 */
export function BassWaveformVisualizer({
  isPlaying,
  barCount = 9,
  height = 36,
}: BassWaveformVisualizerProps) {
  // Tạo mảng animation cho từng cột sóng
  const anims = useRef(
    Array.from({ length: barCount }, () => new Animated.Value(0.2))
  ).current;

  useEffect(() => {
    if (!isPlaying) {
      anims.forEach((anim) => {
        Animated.timing(anim, {
          toValue: 0.15,
          duration: 350,
          useNativeDriver: true,
        }).start();
      });
      return;
    }

    // Các chu kỳ nhịp điệu khác nhau cho từng dải tần số bass -> treble
    const durations = [320, 240, 410, 280, 190, 360, 220, 440, 260, 310, 200];
    const maxScales = [0.95, 0.75, 1.0, 0.85, 0.9, 0.7, 0.95, 0.8, 1.0, 0.75, 0.85];

    const loops = anims.map((anim, idx) => {
      const dur = durations[idx % durations.length] || 300;
      const maxVal = maxScales[idx % maxScales.length] || 0.9;
      const minVal = 0.18 + (idx % 3) * 0.05;

      return Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: maxVal,
            duration: dur,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: minVal,
            duration: Math.round(dur * 0.9),
            useNativeDriver: true,
          }),
        ])
      );
    });

    loops.forEach((l) => l.start());

    return () => {
      loops.forEach((l) => l.stop());
    };
  }, [isPlaying, anims]);

  // Màu sắc phân tầng LED theo chiều cao:
  // Cột ở giữa và 2 bên có sắc thái riêng biệt
  const getBarColor = (index: number) => {
    const center = Math.floor(barCount / 2);
    const dist = Math.abs(index - center);
    if (dist === 0) return '#10B981'; // Xanh ngọc neon
    if (dist <= 2) return colors.primary; // Xanh Spotify
    if (dist <= 3) return '#F59E0B'; // Vàng cam ấm
    return '#EC4899'; // Hồng neon
  };

  return (
    <View style={[styles.container, { height }]}>
      <View style={styles.barsRow}>
        {anims.map((anim, idx) => (
          <View key={`bar-${idx}`} style={[styles.barSlot, { height }]}>
            <Animated.View
              style={[
                styles.barColumn,
                {
                  height,
                  backgroundColor: getBarColor(idx),
                  transform: [
                    {
                      scaleY: anim,
                    },
                  ],
                },
              ]}
            >
              {/* Vạch đèn LED đỉnh (Peak Peak Indicator) */}
              <View style={styles.peakLed} />
            </Animated.View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    width: '80%',
  },
  barSlot: {
    flex: 1,
    maxWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barColumn: {
    width: '100%',
    borderRadius: radius.pill,
    position: 'relative',
    overflow: 'hidden',
  },
  peakLed: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 2,
    height: 3,
    borderRadius: radius.xs,
    backgroundColor: '#ffffff',
    opacity: 0.85,
  },
});
