import * as FileSystem from 'expo-file-system/legacy';

const PREF_FILE = `${FileSystem.documentDirectory || ''}beatify_motion_pref.json`;

interface MotionConfig {
  respectSystemReduceMotion: boolean;
}

let cachedRespectSystem = false;
let isLoaded = false;
const listeners = new Set<(enabled: boolean) => void>();

/**
 * Đọc cài đặt "Tôn trọng Giảm chuyển động của hệ thống"
 * Mặc định: false (TẮT) - nghĩa là Beatify luôn bật đầy đủ animation
 */
export async function loadRespectSystemReduceMotion(): Promise<boolean> {
  if (isLoaded) return cachedRespectSystem;
  try {
    const info = await FileSystem.getInfoAsync(PREF_FILE);
    if (!info.exists) {
      isLoaded = true;
      return false;
    }
    const raw = await FileSystem.readAsStringAsync(PREF_FILE);
    const parsed = JSON.parse(raw) as MotionConfig;
    cachedRespectSystem = typeof parsed.respectSystemReduceMotion === 'boolean'
      ? parsed.respectSystemReduceMotion
      : false;
  } catch {
    cachedRespectSystem = false;
  }
  isLoaded = true;
  return cachedRespectSystem;
}

export function getRespectSystemReduceMotionSync(): boolean {
  return cachedRespectSystem;
}

/**
 * Lưu cài đặt "Tôn trọng Giảm chuyển động của hệ thống"
 */
export async function saveRespectSystemReduceMotion(enabled: boolean): Promise<void> {
  cachedRespectSystem = enabled;
  isLoaded = true;
  listeners.forEach((listener) => {
    try {
      listener(enabled);
    } catch {
      // bỏ qua lỗi listener
    }
  });

  try {
    const data: MotionConfig = { respectSystemReduceMotion: enabled };
    await FileSystem.writeAsStringAsync(PREF_FILE, JSON.stringify(data));
  } catch (err) {
    console.warn('Lỗi lưu cài đặt motion preference:', err);
  }
}

/**
 * Đăng ký listener khi cài đặt thay đổi
 */
export function subscribeRespectSystemReduceMotion(listener: (enabled: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

