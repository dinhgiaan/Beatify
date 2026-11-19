import { useState, useEffect } from 'react';
import { Easing, ReduceMotion, useReducedMotion } from 'react-native-reanimated';
import {
  loadRespectSystemReduceMotion,
  getRespectSystemReduceMotionSync,
  subscribeRespectSystemReduceMotion,
} from '../services/player/motionPreferences';

// Kích hoạt nạp cài đặt từ đĩa ngay khi khởi động
loadRespectSystemReduceMotion().catch(() => {});

/**
 * Hook duy nhất quyết định ứng dụng có chạy chuyển động (animation) hay không:
 * - Mặc định trả về true (luôn chạy animation, không phụ thuộc vào cài đặt hệ thống).
 * - Nếu người dùng BẬT công tắc "Tôn trọng Giảm chuyển động của hệ thống", hook sẽ trả về !useReducedMotion().
 */
export function useMotionEnabled(): boolean {
  const systemReduced = useReducedMotion();
  const [respectSystem, setRespectSystem] = useState(getRespectSystemReduceMotionSync());

  useEffect(() => {
    // Đảm bảo đồng bộ với file cấu hình
    loadRespectSystemReduceMotion().then(setRespectSystem).catch(() => {});
    const unsubscribe = subscribeRespectSystemReduceMotion((enabled) => {
      setRespectSystem(enabled);
    });
    return unsubscribe;
  }, []);

  if (respectSystem) {
    return !systemReduced;
  }
  return true;
}

/**
 * Trả về chế độ ReduceMotion cho Reanimated config:
 * - ReduceMotion.Never khi tắt "Tôn trọng Giảm chuyển động" (mặc định)
 * - ReduceMotion.System khi bật công tắc
 */
export function getMotionReduceMode(): ReduceMotion {
  return getRespectSystemReduceMotionSync() ? ReduceMotion.System : ReduceMotion.Never;
}

/**
 * Hằng số animation duration, easing và spring dùng chung cho toàn bộ app
 * Mặc định dùng ReduceMotion.Never để bảo đảm trải nghiệm chuyển động trọn vẹn 60/120fps.
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
    out: Easing.out(Easing.cubic),
    in: Easing.in(Easing.cubic),
    inOut: Easing.inOut(Easing.cubic),
  },
  spring: {
    default: {
      damping: 24,
      stiffness: 280,
      mass: 0.8,
      reduceMotion: ReduceMotion.Never,
    },
    sheet: {
      damping: 28,
      stiffness: 320,
      mass: 0.9,
      reduceMotion: ReduceMotion.Never,
    },
    press: {
      damping: 18,
      stiffness: 350,
      mass: 0.6,
      reduceMotion: ReduceMotion.Never,
    },
  },
} as const;
