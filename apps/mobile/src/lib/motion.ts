import { Easing, ReduceMotion } from 'react-native-reanimated';

/**
 * Hằng số animation duration, easing và spring dùng chung cho toàn bộ app
 * Tôn trọng thiết lập Reduce Motion của người dùng trên iOS.
 */
export const MOTION = {
  duration: {
    instant: 100,
    fast: 150,
    normal: 200,
    smooth: 300,
    transition: 400,
  },
  easing: {
    // Ease-out mượt khi phần tử xuất hiện
    out: Easing.out(Easing.cubic),
    // Ease-in khi phần tử biến mất
    in: Easing.in(Easing.cubic),
    // Ease in-out cho chuyển trạng thái
    inOut: Easing.inOut(Easing.cubic),
  },
  spring: {
    // Spring nhẹ nhàng, tự nhiên kiểu iOS, không nảy quá đà
    default: {
      damping: 24,
      stiffness: 280,
      mass: 0.8,
      reduceMotion: ReduceMotion.System,
    },
    sheet: {
      damping: 28,
      stiffness: 320,
      mass: 0.9,
      reduceMotion: ReduceMotion.System,
    },
    press: {
      damping: 18,
      stiffness: 350,
      mass: 0.6,
      reduceMotion: ReduceMotion.System,
    },
  },
} as const;

