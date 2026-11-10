import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

const mockSecureStoreData: Record<string, string> = {};
const mockFileSystemData: Record<string, string> = {};

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => mockSecureStoreData[key] || null),
  setItemAsync: vi.fn(async (key: string, val: string) => {
    mockSecureStoreData[key] = val;
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    Reflect.deleteProperty(mockSecureStoreData, key);
  }),
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
}));

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///app/documents/',
  getInfoAsync: vi.fn(async (uri: string) => ({
    exists: uri in mockFileSystemData,
  })),
  readAsStringAsync: vi.fn(async (uri: string) => {
    if (uri in mockFileSystemData) return mockFileSystemData[uri];
    throw new Error('Not found');
  }),
  writeAsStringAsync: vi.fn(async (uri: string, content: string) => {
    mockFileSystemData[uri] = content;
  }),
}));

import {
  getSecureServerToken,
  setSecureServerToken,
  deleteSecureServerToken,
  SECURE_SERVER_TOKEN_KEY,
} from './secureTokenStorage';

describe('secureTokenStorage', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockSecureStoreData)) {
      Reflect.deleteProperty(mockSecureStoreData, key);
    }
    for (const key of Object.keys(mockFileSystemData)) {
      Reflect.deleteProperty(mockFileSystemData, key);
    }
  });

  it('lưu token vào Keychain và đọc lại chính xác', async () => {
    await setSecureServerToken('my-secret-token-123');
    const token = await getSecureServerToken();
    expect(token).toBe('my-secret-token-123');
  });

  it('xóa token khi chuỗi truyền vào rỗng hoặc gọi delete', async () => {
    await setSecureServerToken('temp-token');
    expect(await getSecureServerToken()).toBe('temp-token');

    await setSecureServerToken('');
    expect(await getSecureServerToken()).toBe('');

    await setSecureServerToken('token-2');
    await deleteSecureServerToken();
    expect(await getSecureServerToken()).toBe('');
  });

  it('tự động di trú token từ file JSON cũ sang Keychain nếu Keychain đang trống', async () => {
    // Giả lập file JSON cũ có lưu serverToken
    mockFileSystemData['file:///app/documents/beatify_server_config.json'] = JSON.stringify({
      serverUrl: 'https://beatify-api.worker.dev',
      serverToken: 'legacy-token-from-file',
    });

    const token = await getSecureServerToken();
    expect(token).toBe('legacy-token-from-file');

    // Kiểm tra Keychain đã được cập nhật
    expect(mockSecureStoreData[SECURE_SERVER_TOKEN_KEY]).toBe('legacy-token-from-file');

    // Kiểm tra file JSON cũ đã được làm sạch serverToken để bảo mật
    const cleaned = JSON.parse(mockFileSystemData['file:///app/documents/beatify_server_config.json'] || '{}');
    expect(cleaned.serverToken).toBe('');
  });
});
