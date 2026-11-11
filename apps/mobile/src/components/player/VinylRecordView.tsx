import React, { useEffect, useRef } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Animated,
  Easing,
  type ImageSourcePropType,
} from 'react-native';
import { colors, radius } from '../../theme';
import { DiscIcon } from '../icons/SvgIcons';

interface VinylRecordViewProps {
  coverUri?: string | null;
  isPlaying: boolean;
  size?: number;
}

/**
 * VinylRecordView: Giao diện Đĩa Than Vinyl 12-inch xoay 360 độ phong cách Hip-hop Turntablism
 * - Các rãnh đĩa (Grooves) mô phỏng vân đĩa than thật
 * - Tem nhãn tròn trung tâm (Center Record Label) với lỗ trục tâm đĩa (Spindle Hole)
 * - Cần kim đĩa than (Tonearm) tự động hạ xuống rãnh khi phát nhạc và nhấc lên khi tạm dừng
 */
export function VinylRecordView({
  coverUri,
  isPlaying,
  size = 280,
}: VinylRecordViewProps) {
  // Animation xoay đĩa than 360 độ (33⅓ RPM ~ 7.5s/vòng)
  const spinAnim = useRef(new Animated.Value(0)).current;
  const currentRotationRef = useRef<number>(0);
  const spinLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Animation cần kim đĩa than (Tonearm): 0 độ (nghỉ) -> 24 độ (hạ kim vào đĩa)
  const tonearmAnim = useRef(new Animated.Value(isPlaying ? 1 : 0)).current;

  // Lắng nghe giá trị góc xoay để dừng mượt mà khi pause
  useEffect(() => {
    const id = spinAnim.addListener(({ value }) => {
      currentRotationRef.current = value;
    });
    return () => {
      spinAnim.removeListener(id);
    };
  }, [spinAnim]);

  useEffect(() => {
    if (isPlaying) {
      // Bắt đầu hoặc tiếp tục xoay từ góc hiện tại
      spinAnim.setValue(currentRotationRef.current % 1);
      spinLoopRef.current = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: (currentRotationRef.current % 1) + 1,
          duration: 7500,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spinLoopRef.current.start();

      // Hạ cần kim đĩa than xuống mặt đĩa
      Animated.spring(tonearmAnim, {
        toValue: 1,
        friction: 7,
        tension: 40,
        useNativeDriver: true,
      }).start();
    } else {
      // Dừng xoay
      if (spinLoopRef.current) {
        spinLoopRef.current.stop();
      }

      // Nhấc cần kim đĩa than lên vị trí nghỉ
      Animated.spring(tonearmAnim, {
        toValue: 0,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }).start();
    }

    return () => {
      if (spinLoopRef.current) {
        spinLoopRef.current.stop();
      }
    };
  }, [isPlaying, spinAnim, tonearmAnim]);

  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const tonearmRotate = tonearmAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '24deg'],
  });

  const centerLabelSize = Math.round(size * 0.42);
  const spindleHoleSize = Math.round(size * 0.06);

  return (
    <View style={[styles.container, { width: size + 20, height: size + 20 }]}>
      {/* Vỏ đệm bóng mờ bên dưới đĩa than */}
      <View style={[styles.discShadow, { width: size, height: size, borderRadius: size / 2 }]} />

      {/* ĐĨA THAN VINYL XOAY */}
      <Animated.View
        style={[
          styles.vinylBody,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            transform: [{ rotate: spinInterpolate }],
          },
        ]}
      >
        {/* Rãnh đĩa than đồng tâm (Concentric Vinyl Grooves) */}
        <View style={[styles.grooveRing, { width: size * 0.94, height: size * 0.94, borderRadius: (size * 0.94) / 2 }]} />
        <View style={[styles.grooveRing, { width: size * 0.86, height: size * 0.86, borderRadius: (size * 0.86) / 2 }]} />
        <View style={[styles.grooveRing, { width: size * 0.76, height: size * 0.76, borderRadius: (size * 0.76) / 2 }]} />
        <View style={[styles.grooveRing, { width: size * 0.66, height: size * 0.66, borderRadius: (size * 0.66) / 2 }]} />
        <View style={[styles.grooveRing, { width: size * 0.56, height: size * 0.56, borderRadius: (size * 0.56) / 2 }]} />
        <View style={[styles.grooveRing, { width: size * 0.48, height: size * 0.48, borderRadius: (size * 0.48) / 2 }]} />

        {/* Vệt sáng phản quang ánh kim của chất liệu nhựa đĩa than */}
        <View style={[styles.vinylSheen, { width: size, height: size, borderRadius: size / 2 }]} />

        {/* TEM NHÃN TRÒN TRUNG TÂM (CENTER RECORD LABEL) */}
        <View
          style={[
            styles.centerLabel,
            {
              width: centerLabelSize,
              height: centerLabelSize,
              borderRadius: centerLabelSize / 2,
            },
          ]}
        >
          {coverUri ? (
            <Image
              source={{ uri: coverUri } as ImageSourcePropType}
              style={[
                styles.labelArtwork,
                {
                  width: centerLabelSize,
                  height: centerLabelSize,
                  borderRadius: centerLabelSize / 2,
                },
              ]}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.labelPlaceholder, { width: centerLabelSize, height: centerLabelSize }]}>
              <DiscIcon size={centerLabelSize * 0.5} color={colors.primary} />
            </View>
          )}

          {/* Vòng kim loại bảo vệ tem nhãn */}
          <View
            style={[
              styles.labelRing,
              {
                width: centerLabelSize,
                height: centerLabelSize,
                borderRadius: centerLabelSize / 2,
              },
            ]}
          />

          {/* Lỗ trục tâm đĩa than (Spindle Center Hole) */}
          <View
            style={[
              styles.spindleHole,
              {
                width: spindleHoleSize,
                height: spindleHoleSize,
                borderRadius: spindleHoleSize / 2,
              },
            ]}
          />
        </View>
      </Animated.View>

      {/* CẦN KIM ĐĨA THAN (TONEARM) */}
      <Animated.View
        style={[
          styles.tonearmContainer,
          {
            right: 2,
            top: -6,
            transform: [{ rotate: tonearmRotate }],
          },
        ]}
        pointerEvents="none"
      >
        {/* Khớp xoay kim đĩa than (Pivot Base) */}
        <View style={styles.tonearmPivotOuter}>
          <View style={styles.tonearmPivotInner} />
        </View>

        {/* Cần kim kim loại uốn cong chữ S phong cách Technics SL-1200 */}
        <View style={styles.tonearmRod} />
        <View style={styles.tonearmRodBend} />

        {/* Đầu gắn kim đọc (Cartridge & Stylus Head) */}
        <View style={styles.tonearmCartridge}>
          <View style={styles.tonearmStylusNeedle} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    alignSelf: 'center',
    marginVertical: 10,
  },
  discShadow: {
    position: 'absolute',
    backgroundColor: '#000000',
    opacity: 0.6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 16,
  },
  vinylBody: {
    backgroundColor: '#0c0c0e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
  },
  grooveRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  vinylSheen: {
    position: 'absolute',
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    transform: [{ rotate: '45deg' }],
  },
  centerLabel: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#18181b',
    borderWidth: 2,
    borderColor: '#27272a',
    position: 'relative',
  },
  labelArtwork: {
    width: '100%',
    height: '100%',
  },
  labelPlaceholder: {
    backgroundColor: '#1f1f23',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  spindleHole: {
    position: 'absolute',
    backgroundColor: '#09090b',
    borderWidth: 2,
    borderColor: '#71717a',
  },
  // Tonearm styles
  tonearmContainer: {
    position: 'absolute',
    width: 60,
    height: 180,
    transformOrigin: 'top right',
    alignItems: 'center',
  },
  tonearmPivotOuter: {
    position: 'absolute',
    top: 0,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3f3f46',
    borderWidth: 2,
    borderColor: '#71717a',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  tonearmPivotInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#a1a1aa',
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  tonearmRod: {
    position: 'absolute',
    top: 24,
    right: 24,
    width: 4.5,
    height: 100,
    backgroundColor: '#d4d4d8',
    borderRadius: 2,
    borderWidth: 0.5,
    borderColor: '#52525b',
  },
  tonearmRodBend: {
    position: 'absolute',
    top: 120,
    right: 28,
    width: 4.5,
    height: 35,
    backgroundColor: '#d4d4d8',
    borderRadius: 2,
    transform: [{ rotate: '-18deg' }],
  },
  tonearmCartridge: {
    position: 'absolute',
    top: 148,
    right: 32,
    width: 14,
    height: 22,
    backgroundColor: colors.primary,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
  tonearmStylusNeedle: {
    width: 2,
    height: 4,
    backgroundColor: '#ffffff',
    borderRadius: 1,
  },
});
