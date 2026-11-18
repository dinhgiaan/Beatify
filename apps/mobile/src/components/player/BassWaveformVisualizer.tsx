import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { colors, radius } from '../../theme';

export interface BassWaveformVisualizerProps {
  isPlaying: boolean;
  loudnessLufs?: number;
  bpm?: number;
  trackId?: string;
  barCount?: number;
  height?: number;
  activeColor?: string;
}

/**
 * BassWaveformVisualizer: Sóng âm thanh động học (Dynamic Audio-Reactive Visualizer)
 * - Tự động giật nảy lên xuống sinh động theo nhịp điệu và độ to (loudness LUFS / BPM) của bài hát
 * - Đặt ngay dưới ảnh bìa, tạo điểm nhấn thị giác đẳng cấp chuẩn studio hi-fi
 * - Thu về mức tối giản phẳng lặng khi tạm dừng phát nhạc
 */
export function BassWaveformVisualizer({
  isPlaying,
  loudnessLufs,
  bpm,
  trackId,
  barCount = 28,
  height = 26,
  activeColor = colors.primary,
}: BassWaveformVisualizerProps) {
  const anims = useRef(
    Array.from({ length: barCount }, () => new Animated.Value(0.12))
  ).current;

  const isMountedRef = useRef(true);

  // Tính hệ số năng lượng âm thanh dựa trên loudness thực tế của bài hát (LUFS)
  const baseLufs = loudnessLufs ?? -12;
  const loudnessIntensity = Math.min(1.4, Math.max(0.65, 1.0 + (baseLufs - (-14)) * 0.05));

  // Tốc độ nhịp tính theo BPM thực tế
  const tempoFactor = bpm ? Math.min(1.5, Math.max(0.7, bpm / 120)) : 1.0;

  useEffect(() => {
    isMountedRef.current = true;
    const runningAnimations: Animated.CompositeAnimation[] = [];

    if (!isPlaying) {
      // Khi tạm dừng: hạ toàn bộ cột sóng về mức nghỉ tối giản phẳng lặng
      anims.forEach((anim) => {
        const animExit = Animated.timing(anim, {
          toValue: 0.1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        });
        runningAnimations.push(animExit);
        animExit.start();
      });

      return () => {
        isMountedRef.current = false;
        runningAnimations.forEach((a) => a.stop());
      };
    }

    // Phân chia các dải tần số âm thanh:
    // - Sub-bass / Kick (0 -> 28% số cột): nảy mạnh, giật cao theo beat
    // - Mid / Vocal (28% -> 72%): rung dao động dồn dập
    // - Treble / Air (72% -> 100%): nhấp nháy nhanh, linh hoạt
    const subCount = Math.floor(barCount * 0.28);
    const midCount = Math.floor(barCount * 0.44);

    const animateBar = (index: number) => {
      if (!isMountedRef.current) return;

      const isBass = index < subCount;
      const isMid = index >= subCount && index < subCount + midCount;

      let minAmp: number;
      let maxAmp: number;
      let upDuration: number;
      let downDuration: number;

      if (isBass) {
        minAmp = 0.12 + Math.random() * 0.08;
        maxAmp = Math.min(1.0, (0.58 + Math.random() * 0.42) * loudnessIntensity);
        upDuration = Math.round((65 + Math.random() * 75) / tempoFactor);
        downDuration = Math.round((85 + Math.random() * 105) / tempoFactor);
      } else if (isMid) {
        minAmp = 0.14 + Math.random() * 0.1;
        maxAmp = Math.min(0.95, (0.48 + Math.random() * 0.4) * loudnessIntensity);
        upDuration = Math.round((55 + Math.random() * 65) / tempoFactor);
        downDuration = Math.round((75 + Math.random() * 85) / tempoFactor);
      } else {
        minAmp = 0.1 + Math.random() * 0.08;
        maxAmp = Math.min(0.85, (0.38 + Math.random() * 0.38) * loudnessIntensity);
        upDuration = Math.round((45 + Math.random() * 55) / tempoFactor);
        downDuration = Math.round((65 + Math.random() * 75) / tempoFactor);
      }

      const targetAnim = anims[index];
      if (!targetAnim) return;

      const seq = Animated.sequence([
        Animated.timing(targetAnim, {
          toValue: maxAmp,
          duration: upDuration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(targetAnim, {
          toValue: minAmp,
          duration: downDuration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]);

      runningAnimations[index] = seq;
      seq.start(({ finished }) => {
        if (finished && isMountedRef.current && isPlaying) {
          animateBar(index);
        }
      });
    };

    // Khởi chạy với độ lệch pha ngẫu nhiên nhỏ để tạo độ giật tự nhiên
    anims.forEach((_, idx) => {
      const delay = Math.round((idx % 5) * 24 + Math.random() * 26);
      const timer = setTimeout(() => {
        if (isMountedRef.current && isPlaying) {
          animateBar(idx);
        }
      }, delay);
      runningAnimations.push({ stop: () => clearTimeout(timer) } as unknown as Animated.CompositeAnimation);
    });

    return () => {
      isMountedRef.current = false;
      runningAnimations.forEach((a) => a.stop());
    };
  }, [isPlaying, loudnessIntensity, tempoFactor, trackId, anims, barCount]);

  // Phân bổ độ mờ nhẹ ở 2 biên để tạo chiều sâu thị giác sang trọng
  const getBarOpacity = (index: number) => {
    const center = (barCount - 1) / 2;
    const distance = Math.abs(index - center) / center;
    return Math.max(0.7, 1.0 - distance * 0.3);
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
                  backgroundColor: activeColor,
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
  },
  spectrumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  barSlot: {
    width: 4,
    marginHorizontal: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barColumn: {
    width: 3.2,
    borderRadius: radius.pill,
  },
});
