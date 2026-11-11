import * as FileSystem from 'expo-file-system/legacy';

const PREF_FILE = `${FileSystem.documentDirectory || ''}beatify_turntable_pref.json`;

interface TurntableConfig {
  isVinylMode: boolean;
}

/**
 * Đọc cài đặt Chế độ Đĩa Than Vinyl (Turntable Mode)
 */
export async function loadVinylModePreference(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(PREF_FILE);
    if (!info.exists) {
      return false;
    }
    const raw = await FileSystem.readAsStringAsync(PREF_FILE);
    const parsed = JSON.parse(raw) as TurntableConfig;
    return typeof parsed.isVinylMode === 'boolean' ? parsed.isVinylMode : false;
  } catch {
    return false;
  }
}

/**
 * Lưu cài đặt Chế độ Đĩa Than Vinyl (Turntable Mode)
 */
export async function saveVinylModePreference(enabled: boolean): Promise<void> {
  try {
    const data: TurntableConfig = { isVinylMode: enabled };
    await FileSystem.writeAsStringAsync(PREF_FILE, JSON.stringify(data));
  } catch (err) {
    console.warn('Lỗi lưu cài đặt turntable preference:', err);
  }
}
