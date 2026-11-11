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
  positionSec?: number;
  durationSec?: number;
  size?: number;
}

/**
 * VinylRecordView: Giao diện Đĩa Than Vinyl 12-inch siêu chân thực phong cách Audiophile Turntable
 * - Mâm đĩa nhôm phay xước (Brushed Platter) kèm viền chấm Strobe tốc độ 33⅓ RPM
 * - Đĩa than đen tuyền độ bóng cao (High-Gloss Vinyl) với rãnh siêu mịn (Microgrooves) và vệt phản quang đối xứng
 * - Tem nhãn tròn trung tâm (Center Record Label) với trục xoay kim loại Chrome (Spindle Pin)
 * - Cần kim đĩa than Technics SL-1200 S-Shape (Tonearm) chân thực:
 *   + Tự động hạ kim khi phát, nhấc kim về vị trí nghỉ khi tạm dừng
 *   + Tịnh tiến từ từ từ rãnh ngoài (Lead-in ~16°) vào rãnh trong (Run-out ~30°) theo tiến độ bài nhạc thực tế
 *   + Dao động vi mô (Micro-wobble analog) ±0.25° tự nhiên theo rãnh xoay khi đang phát nhạc
 */
export function VinylRecordView({
  coverUri,
  isPlaying,
  positionSec = 0,
  durationSec = 0,
  size = 280,
}: VinylRecordViewProps) {
  // 1. Animation xoay đĩa than 360 độ (33⅓ RPM ~ 7.5s/vòng)
  const spinAnim = useRef(new Animated.Value(0)).current;
  const currentRotationRef = useRef<number>(0);
  const spinLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // 2. Animation góc hạ cần kim (0 = Nghỉ, 1 = Đặt trên đĩa)
  const armEngagedAnim = useRef(new Animated.Value(isPlaying ? 1 : 0)).current;

  // 3. Animation tiến độ rãnh nhạc (0 = rãnh ngoài, 1 = rãnh trong)
  const grooveProgressAnim = useRef(new Animated.Value(0)).current;

  // 4. Animation rung lắc vi mô analog (Micro-wobble) khi kim tiếp xúc đĩa quay
  const microWobbleAnim = useRef(new Animated.Value(0)).current;
  const wobbleLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Lắng nghe giá trị góc xoay để dừng đĩa mượt mà khi pause
  useEffect(() => {
    const id = spinAnim.addListener(({ value }) => {
      currentRotationRef.current = value;
    });
    return () => {
      spinAnim.removeListener(id);
    };
  }, [spinAnim]);

  // Điều khiển xoay đĩa than & hạ/nhấc cần kim
  useEffect(() => {
    if (isPlaying) {
      // Tiếp tục xoay từ vị trí hiện tại
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

        // Hạ cần kim xuống mặt đĩa
        Animated.spring(armEngagedAnim, {
          toValue: 1,
          friction: 7,
          tension: 38,
          useNativeDriver: true,
        }).start();

        // Rung lắc vi mô analog siêu nhẹ (±0.25 độ) mô phỏng kim đọc rãnh đĩa thật
        microWobbleAnim.setValue(0);
        wobbleLoopRef.current = Animated.loop(
          Animated.sequence([
            Animated.timing(microWobbleAnim, {
              toValue: 1,
              duration: 1100,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(microWobbleAnim, {
              toValue: -1,
              duration: 1100,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ])
        );
        wobbleLoopRef.current.start();
      } else {
        if(spinLoopRef.current) {
        spinLoopRef.current.stop();
      }
      if (wobbleLoopRef.current) {
        wobbleLoopRef.current.stop();
      }
      microWobbleAnim.setValue(0);

        // Nhấc cần kim về vị trí nghỉ trên armrest
        Animated.spring(armEngagedAnim, {
          toValue: 0,
          friction: 8,
          tension: 45,
          useNativeDriver: true,
        }).start();
      }

    return () => {
        if (spinLoopRef.current) {
          spinLoopRef.current.stop();
        }
        if (wobbleLoopRef.current) {
          wobbleLoopRef.current.stop();
        }
      };
}, [isPlaying, spinAnim, armEngagedAnim, microWobbleAnim]);

// Cập nhật vị trí kim đọc di chuyển vào tâm theo tiến độ thời gian thực của bài hát
useEffect(() => {
  const ratio = durationSec > 0 ? Math.max(0, Math.min(1, positionSec / durationSec)) : 0;
  Animated.timing(grooveProgressAnim, {
    toValue: ratio,
    duration: 350,
    easing: Easing.linear,
    useNativeDriver: true,
  }).start();
}, [positionSec, durationSec, grooveProgressAnim]);

const spinInterpolate = spinAnim.interpolate({
  inputRange: [0, 1],
  outputRange: ['0deg', '360deg'],
});

  // Tính toán góc quay tổng hợp của cần kim:
  // - Vị trí nghỉ: 0°
  // - Khi hạ kim: bắt đầu ở 16° (rãnh ngoài), dần tiến tới 30° (rãnh trong) theo grooveProgressAnim
  // - Kèm vi mô wobble ±0.25°
  const tonearmEngagedAngle = grooveProgressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 30],
  });

  const tonearmFinalAngle = Animated.multiply(armEngagedAnim, tonearmEngagedAngle);

  const tonearmRotate = tonearmFinalAngle.interpolate({
    inputRange: [0, 32],
    outputRange: ['0deg', '32deg'],
  });

  const centerLabelSize = Math.round(size * 0.40);
  const platterSize = size + 16;
  const spindleHoleSize = Math.round(size * 0.055);

  return(
        <View style={[styles.container, { width: platterSize + 24, height: platterSize + 24 }]}>
          {/* 1. MÂM ĐĨA NHÔM PHAY XƯỚC (ALUMINUM TURNTABLE PLATTER) */}
          <View
            style={[
              styles.platterBase,
              {
                width: platterSize,
                height: platterSize,
                borderRadius: platterSize / 2,
              },
            ]}
          >
            {/* Vành chấm Strobe đồng bộ tốc độ 33⅓ RPM */}
            <View
              style={[
                styles.strobeRim,
                {
                  width: platterSize - 4,
                  height: platterSize - 4,
                  borderRadius: (platterSize - 4) / 2,
                },
              ]}
            />
          </View>

          {/* 2. ĐĨA THAN VINYL XOAY (360° HIGH-GLOSS VINYL DISC) */}
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
            {/* Các dải rãnh âm thanh đồng tâm (Concentric Sound Grooves) */}
            <View style={[styles.grooveRing, { width: size * 0.95, height: size * 0.95, borderRadius: (size * 0.95) / 2 }]} />
            <View style={[styles.grooveRing, { width: size * 0.89, height: size * 0.89, borderRadius: (size * 0.89) / 2 }]} />
            <View style={[styles.grooveRing, { width: size * 0.83, height: size * 0.83, borderRadius: (size * 0.83) / 2 }]} />
            <View style={[styles.grooveRing, { width: size * 0.77, height: size * 0.77, borderRadius: (size * 0.77) / 2 }]} />
            <View style={[styles.grooveRing, { width: size * 0.71, height: size * 0.71, borderRadius: (size * 0.71) / 2 }]} />
            <View style={[styles.grooveRing, { width: size * 0.65, height: size * 0.65, borderRadius: (size * 0.65) / 2 }]} />
            <View style={[styles.grooveRing, { width: size * 0.58, height: size * 0.58, borderRadius: (size * 0.58) / 2 }]} />
            <View style={[styles.grooveRing, { width: size * 0.50, height: size * 0.50, borderRadius: (size * 0.50) / 2 }]} />

            {/* Vệt sáng quang học Anisotropic tự nhiên cắt chéo bề mặt đĩa nhựa */}
            <View style={[styles.anisotropicSheenA, { width: size, height: size, borderRadius: size / 2 }]} />
            <View style={[styles.anisotropicSheenB, { width: size, height: size, borderRadius: size / 2 }]} />

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
                  <DiscIcon size={centerLabelSize * 0.45} color={colors.primary} />
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

              {/* Trục tâm xoay bằng kim loại mạ Chrome (Spindle Pin) */}
              <View
                style={[
                  styles.spindleHole,
                  {
                    width: spindleHoleSize,
                    height: spindleHoleSize,
                    borderRadius: spindleHoleSize / 2,
                  },
                ]}
          >
              <View style={styles.spindleChromeCap} />
            </View>
        </View>
      </Animated.View >

{/* 3. CẦN KIM ĐĨA THAN CHÂN THỰC (TECHNICS SL-1200 S-SHAPED TONEARM) */ }
<Animated.View
  style={[
    styles.tonearmContainer,
    {
      right: 0,
      top: -12,
      transform: [{ rotate: tonearmRotate }],
    },
  ]}
  pointerEvents="none"
>
    {/* Khớp trụ gimbal kim loại & Quả đối trọng (Counterweight Assembly) */}
    <View style={styles.tonearmPivotBase}>
      <View style={styles.counterweightRing} />
      <View style={styles.tonearmPivotCenter}>
        <View style={styles.tonearmBearingScrew} />
      </View>
    </View>

    {/* Cần kim uốn cong chữ S kim loại sáng bóng */}
    <View style={styles.tonearmUpperStem} />
    <View style={styles.tonearmSBend} />
    <View style={styles.tonearmLowerStem} />

    {/* Khớp nối đầu kim đọc (Headshell Collar) */}
    <View style={styles.headshellCollar} />

    {/* Đầu gắn kim đọc (Cartridge & Stylus Headshell) */}
    <View style={styles.tonearmCartridge}>
      <View style={styles.cartridgeBadge} />
      <View style={styles.tonearmStylusNeedle} />
    </View>
</Animated.View>
    </View >
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
    platterBase: {
      position: 'absolute',
      backgroundColor: '#1c1c20',
      borderWidth: 2,
      borderColor: '#3f3f46',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.8,
      shadowRadius: 28,
      elevation: 20,
    },
    strobeRim: {
      borderWidth: 1.5,
      borderColor: '#52525b',
      borderStyle: 'dashed',
      opacity: 0.6,
    },
    vinylBody: {
      backgroundColor: '#0a0a0c',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'rgba(255, 255, 255, 0.16)',
      overflow: 'hidden',
    },
    grooveRing: {
      position: 'absolute',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.045)',
    },
      anisotropicSheenA: {
        position: 'absolute',
        borderLeftWidth: 2,
        borderRightWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        transform: [{ rotate: '45deg' }],
      },
      anisotropicSheenB: {
        position: 'absolute',
        borderLeftWidth: 2,
        borderRightWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.06)',
        transform: [{ rotate: '-45deg' }],
      },
      centerLabel: {
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        backgroundColor: '#18181b',
        borderWidth: 2.5,
        borderColor: '#27272a',
        position: 'relative',
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
      },
      labelArtwork: {
        width: '100%',
        height: '100%',
      },
      labelPlaceholder: {
        backgroundColor: '#18181b',
        alignItems: 'center',
        justifyContent: 'center',
      },
      labelRing: {
        position: 'absolute',
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.2)',
      },
      spindleHole: {
        position: 'absolute',
        backgroundColor: '#09090b',
        borderWidth: 1.5,
        borderColor: '#a1a1aa',
        alignItems: 'center',
        justifyContent: 'center',
      },
      spindleChromeCap: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#f4f4f5',
      },
      // Tonearm Technics SL-1200 style
      tonearmContainer: {
        position: 'absolute',
        width: 70,
        height: 200,
        transformOrigin: 'top right',
        alignItems: 'center',
      },
        tonearmPivotBase: {
          position: 'absolute',
          top: 0,
          right: 10,
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: '#27272a',
          borderWidth: 2,
          borderColor: '#71717a',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.6,
          shadowRadius: 8,
        },
          counterweightRing: {
            position: 'absolute',
            top: -6,
            width: 22,
            height: 10,
            borderRadius: 3,
            backgroundColor: '#52525b',
            borderWidth: 1,
            borderColor: '#a1a1aa',
          },
          tonearmPivotCenter: {
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: '#a1a1aa',
            borderWidth: 1.5,
            borderColor: '#e4e4e7',
            alignItems: 'center',
            justifyContent: 'center',
          },
            tonearmBearingScrew: {
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: '#18181b',
            },
            tonearmUpperStem: {
              position: 'absolute',
              top: 32,
              right: 25,
              width: 5,
              height: 65,
              backgroundColor: '#e4e4e7',
              borderRadius: 2.5,
              borderWidth: 0.5,
              borderColor: '#71717a',
            },
              tonearmSBend: {
                position: 'absolute',
                top: 92,
                right: 28,
                width: 5,
                height: 36,
                backgroundColor: '#e4e4e7',
                borderRadius: 2.5,
                transform: [{ rotate: '-20deg' }],
              },
              tonearmLowerStem: {
                position: 'absolute',
                top: 124,
                right: 32,
                width: 5,
                height: 30,
                backgroundColor: '#e4e4e7',
                borderRadius: 2.5,
                transform: [{ rotate: '8deg' }],
              },
              headshellCollar: {
                position: 'absolute',
                top: 152,
                right: 34,
                width: 8,
                height: 6,
                borderRadius: 2,
                backgroundColor: '#f59e0b',
              },
              tonearmCartridge: {
                position: 'absolute',
                top: 157,
                right: 35,
                width: 15,
                height: 24,
                backgroundColor: '#18181b',
                borderWidth: 1,
                borderColor: '#3f3f46',
                borderRadius: radius.xs,
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingBottom: 2,
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.6,
                shadowRadius: 4,
              },
              cartridgeBadge: {
                position: 'absolute',
                top: 3,
                width: 8,
                height: 2,
                backgroundColor: colors.primary,
                borderRadius: 1,
              },
              tonearmStylusNeedle: {
                width: 2.5,
                height: 5,
                backgroundColor: '#ffffff',
                borderRadius: 1,
              },
            });
