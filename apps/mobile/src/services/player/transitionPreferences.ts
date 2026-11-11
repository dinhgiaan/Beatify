import * as FileSystem from 'expo-file-system/legacy';
import type {
  SmartTransitionSettings,
  TransitionLogEntry,
} from '@music-app/shared';

const PREFS_FILE = `${FileSystem.documentDirectory}beatify_smart_transition_prefs.json`;
const LOGS_FILE = `${FileSystem.documentDirectory}beatify_smart_transition_logs.json`;
const MAX_LOG_ENTRIES = 50;

export const DEFAULT_TRANSITION_SETTINGS: SmartTransitionSettings = {
  enabled: true,
  durationSec: 4,
  safeMode: false,
};

let cachedSettings: SmartTransitionSettings = { ...DEFAULT_TRANSITION_SETTINGS };
let cachedLogs: TransitionLogEntry[] = [];
let isLoaded = false;

/**
 * Tải cài đặt chuyển bài thông minh từ bộ nhớ máy
 */
export async function loadTransitionSettings(): Promise<SmartTransitionSettings> {
  if (isLoaded) return cachedSettings;
  try {
    const info = await FileSystem.getInfoAsync(PREFS_FILE);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(PREFS_FILE);
      const parsed = JSON.parse(content);
      cachedSettings = {
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
        durationSec: typeof parsed.durationSec === 'number' ? Math.max(2, Math.min(8, parsed.durationSec)) : 4,
        safeMode: typeof parsed.safeMode === 'boolean' ? parsed.safeMode : false,
      };
    }
  } catch (err) {
    console.warn('[TransitionPrefs] Không thể đọc cài đặt:', err);
  }
  isLoaded = true;
  return cachedSettings;
}

/**
 * Lưu cài đặt chuyển bài thông minh xuống bộ nhớ máy
 */
export async function saveTransitionSettings(
  settings: Partial<SmartTransitionSettings>
): Promise<SmartTransitionSettings> {
  try {
    cachedSettings = {
      ...cachedSettings,
      ...settings,
    };
    await FileSystem.writeAsStringAsync(
      PREFS_FILE,
      JSON.stringify(cachedSettings, null, 2)
    );
  } catch (err) {
    console.warn('[TransitionPrefs] Không thể lưu cài đặt:', err);
  }
  return cachedSettings;
}

/**
 * Tải lịch sử chẩn đoán chuyển bài
 */
export async function loadTransitionLogs(): Promise<TransitionLogEntry[]> {
  try {
    const info = await FileSystem.getInfoAsync(LOGS_FILE);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(LOGS_FILE);
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        cachedLogs = parsed;
        return cachedLogs;
      }
    }
  } catch (err) {
    console.warn('[TransitionPrefs] Không thể đọc logs:', err);
  }
  return cachedLogs;
}

/**
 * Ghi thêm 1 mục log chẩn đoán chuyển bài (lưu tối đa 50 mục gần nhất)
 */
export async function appendTransitionLog(entry: TransitionLogEntry): Promise<void> {
  try {
    cachedLogs = [entry, ...cachedLogs].slice(0, MAX_LOG_ENTRIES);
    await FileSystem.writeAsStringAsync(
      LOGS_FILE,
      JSON.stringify(cachedLogs, null, 2)
    );
  } catch (err) {
    console.warn('[TransitionPrefs] Không thể ghi log chuyển bài:', err);
  }
}

/**
 * Xóa toàn bộ nhật ký chẩn đoán
 */
export async function clearTransitionLogs(): Promise<void> {
  cachedLogs = [];
  try {
    await FileSystem.writeAsStringAsync(LOGS_FILE, JSON.stringify([]));
  } catch (err) {
    console.warn('[TransitionPrefs] Không thể xóa logs:', err);
  }
}

