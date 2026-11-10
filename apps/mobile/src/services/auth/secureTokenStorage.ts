import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';

export const SECURE_SERVER_TOKEN_KEY = 'beatify_server_token';

/**
 * Lấy token bảo mật từ iOS Keychain (SecureStore)
 * Tự động di chuyển (migration) token cũ từ file cấu hình không mã hóa sang Keychain nếu có
 */
export async function getSecureServerToken(): Promise<string> {
  try {
    const token = await SecureStore.getItemAsync(SECURE_SERVER_TOKEN_KEY);
    if (token) {
      return token;
    }
  } catch (err) {
    console.warn('[secureTokenStorage] Không thể đọc token từ SecureStore:', err);
  }

  // Fallback / Di trú: Đọc từ file JSON cũ nếu người dùng chưa chuyển
  try {
    const configPath = `${FileSystem.documentDirectory || ''}beatify_server_config.json`;
    const info = await FileSystem.getInfoAsync(configPath);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(configPath);
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed.serverToken === 'string' && parsed.serverToken.trim()) {
        const migratedToken = parsed.serverToken.trim();
        // Lưu sang Keychain
        await setSecureServerToken(migratedToken).catch(() => {});
        // Xóa token khỏi file JSON cấu hình để tránh lộ lọt
        const cleanConfig = { ...parsed, serverToken: '' };
        await FileSystem.writeAsStringAsync(configPath, JSON.stringify(cleanConfig, null, 2)).catch(() => {});
        return migratedToken;
      }
    }
  } catch (migrationErr) {
    console.warn('[secureTokenStorage] Lỗi di trú token từ file JSON:', migrationErr);
  }

  return '';
}

/**
 * Lưu token bảo mật vào iOS Keychain (SecureStore)
 */
export async function setSecureServerToken(token: string): Promise<void> {
  const clean = token ? token.trim() : '';
  try {
    if (!clean) {
      await SecureStore.deleteItemAsync(SECURE_SERVER_TOKEN_KEY);
    } else {
      await SecureStore.setItemAsync(SECURE_SERVER_TOKEN_KEY, clean, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    }
  } catch (err) {
    console.error('[secureTokenStorage] Lỗi lưu token vào SecureStore:', err);
    throw err;
  }
}

/**
 * Xóa token bảo mật khỏi iOS Keychain
 */
export async function deleteSecureServerToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SECURE_SERVER_TOKEN_KEY);
  } catch (err) {
    console.warn('[secureTokenStorage] Lỗi xóa token khỏi SecureStore:', err);
  }
}
