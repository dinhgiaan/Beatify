import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useProgress } from '../../context';
import { colors } from '../../theme';

interface WaveformProps {
  trackId?: string;
  barCount?: number;
  height?: number;
  activeColor?: string;
  inactiveColor?: string;
}

/**
 * Sinh dãy chiều cao vạch sóng âm thanh giả lập dựa trên seed của trackId
 * Giúp mỗi bài hát có một dạng sóng đặc trưng riêng biệt mà không cần phân tích audio nặng
 */
function generateBarHeights(seedStr: string, count: number, maxHeight: number): number[] {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }

  const heights: number[] = [];
  const minHeight = 3;

  for (let i = 0; i < count; i++) {
    // Thuật toán pseudo-random LCG với seed hash
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    const norm = (hash % 1000) / 1000;
    // Tạo nhịp sóng có đỉnh nhô cao ở giữa và thon ở 2 đầu
    const envelope = Math.sin((i / (count - 1)) * Math.PI) * 0.4 + 0.6;
    const h = minHeight + norm * (maxHeight - minHeight) * envelope;
    heights.push(Math.round(h));
  }

  return heights;
}

/**
 * Waveform: Thanh sóng âm thanh mỏng nhẹ dạng SVG
 * Subscribe riêng useProgress() để không re-render màn hình cha
 */
export function Waveform({
  trackId = 'default-track',
  barCount = 42,
  height = 14,
  activeColor = colors.primary,
  inactiveColor = 'rgba(255, 255, 255, 0.2)',
}: WaveformProps) {
  const { progressPercent } = useProgress();

  const barHeights = useMemo(() => {
    return generateBarHeights(trackId, barCount, height);
  }, [trackId, barCount, height]);

  const activeIndex = Math.floor((progressPercent / 100) * barCount);

  return (
    <View style={[styles.container, { height }]}>
      <Svg width="100%" height={height} viewBox={`0 0 ${barCount * 4} ${height}`}>
        {barHeights.map((barHeight, idx) => {
          const isActive = idx <= activeIndex;
          const y = (height - barHeight) / 2;
          return (
            <Rect
              key={idx}
              x={idx * 4}
              y={y}
              width={2}
              height={barHeight}
              rx={1}
              fill={isActive ? activeColor : inactiveColor}
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
});

