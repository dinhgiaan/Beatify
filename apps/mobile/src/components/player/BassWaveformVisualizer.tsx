import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { radius } from '../../theme';

interface BassWaveformVisualizerProps {
  isPlaying: boolean;
  barCount?: number;
  height?: number;
}

/**
 * BassWaveformVisualizer: Cụm Audio Spectrum Visualizer phong cách Studio DAC & Mastering Equalizer
 * - 24 cột sóng thanh mảnh, bo góc mềm mại, hiển thị dải phổ âm thanh từ Sub-bass (30Hz) đến Air/Highs (16kHz)
 * - Tông màu xanh ngọc lục bảo Studio Emerald (#10B981) siêu sang trọng, thanh lịch
 * - Hiệu ứng nảy hữu cơ (Organic Fluid Dynamic) theo đường cong tự nhiên khi phát nhạc, thu về trạng thái nghỉ tối giản khi tạm dừng
 */
export function BassWaveformVisualizer({
  isPlaying,
  barCount = 24,
  height = 36,
}: BassWaveformVisualizerProps) {
  // Tạo mảng animation cho từng cột sóng
  const anims = useRef(
    Array.from({ length: barCount }, () => new Animated.Value(0.12))
  ).current;

  useEffect(() => {
    if (!isPlaying) {
      anims.forEach((anim) => {
        Animated.timing(anim, {
          toValue: 0.12,
          duration: 350,
          useNativeDriver: true,
        }).start();
      });
      return;
    }

    // Tần số dao động tự nhiên cho từng cột dựa theo phổ âm thanh thực tế:
    // Cột thấp (Bass) nảy sâu và nhịp nhàng, cột giữa (Mid) nảy linh hoạt, cột cao (Treble) nháy nhanh
    const baseDurations = [
      480, 420, 360, 310, 260, 220, 190, 240, 280, 320, 250, 210,
      180, 230, 290, 340, 270, 220, 190, 250, 310, 370, 430, 490,
    ];

    // Đường cong hình chuông (Bell Curve) cho biên độ tối đa:
    // Năng lượng tập trung ở Sub-bass / Kick / Vocals và vuốt nhẹ về 2 đầu biên
    const maxAmplitudes = [
      0.45, 0.65, 0.85, 0.95, 1.0, 0.92, 0.88, 0.95, 0.82, 0.9, 0.96, 0.84,
      0.89, 0.94, 0.85, 0.78, 0.92, 0.86, 0.75, 0.68, 0.6, 0.52, 0.45, 0.38,
    ];

    const loops = anims.map((anim, idx) => {
      const dur = baseDurations[idx % baseDurations.length] || 280;
      const maxVal = maxAmplitudes[idx % maxAmplitudes.length] || 0.85;
      const minVal = 0.14 + (idx % 4) * 0.04;

      return Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: maxVal,
            duration: dur,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: minVal,
            duration: Math.round(dur * 0.85),
            useNativeDriver: true,
          }),
        ])
      );
    });

    loops.forEach((l) => l.start());

    return () => {
      loops.forEach((l) => l.stop());
    };
  }, [isPlaying, anims, barCount]);

  // Độ mờ đục (Opacity) phân lớp theo vị trí phổ âm thanh để tạo chiều sâu thị giác sang trọng
  const getBarOpacity = (index: number) => {
    const center = barCount / 2;
    const distance = Math.abs(index - center) / center;
    return Math.max(0.65, 1.0 - distance * 0.35);
  };

  return (
    <View style={[styles.container, { height }]}>
      <View style={styles.spectrumRow}>
        {anims.map((anim, idx) => (
          <View key={`spec-bar-${idx}`} style={[styles.barSlot, { height }]}>
            <Animated.View
              style={[
                styles.barColumn,
                {
                  height,
                  opacity: getBarOpacity(idx),
                  transform: [{ scaleY: anim }],
                },
              ]}
            />
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
    marginVertical: 6,
  },
  spectrumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3.5,
    width: '92%',
    maxWidth: 320,
    height: '100%',
  },
  barSlot: {
    flex: 1,
    maxWidth: 4.5,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  barColumn: {
    width: '100%',
    borderRadius: radius.pill,
    backgroundColor: '#10B981', // Studio Emerald Green
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 4,
  },
});
