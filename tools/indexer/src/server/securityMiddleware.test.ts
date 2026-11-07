import { describe, it, expect } from 'vitest';
import {
  isAllowedOrigin,
  isSystemDirectory,
  isSafeDeletePath,
} from './securityMiddleware';

describe('securityMiddleware', () => {
  describe('isAllowedOrigin', () => {
    it('chấp nhận undefined/empty origin (curl, app native)', () => {
      expect(isAllowedOrigin(undefined)).toBe(true);
      expect(isAllowedOrigin('')).toBe(true);
    });

    it('chấp nhận localhost và 127.0.0.1 với mọi port', () => {
      expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
      expect(isAllowedOrigin('http://127.0.0.1:4000')).toBe(true);
      expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    });

    it('từ chối domain bên ngoài (CSRF / DNS rebinding)', () => {
      expect(isAllowedOrigin('http://attacker.com')).toBe(false);
      expect(isAllowedOrigin('https://malicious-site.net:4000')).toBe(false);
      expect(isAllowedOrigin('http://localhost.evil.com')).toBe(false);
    });
  });

  describe('isSystemDirectory', () => {
    it('phát hiện đúng các thư mục hệ thống Windows', () => {
      expect(isSystemDirectory('C:\\Windows')).toBe(true);
      expect(isSystemDirectory('C:\\Windows\\System32')).toBe(true);
      expect(isSystemDirectory('C:\\Program Files\\Nodejs')).toBe(true);
      expect(isSystemDirectory('D:\\$Recycle.Bin')).toBe(true);
      expect(isSystemDirectory('D:\\System Volume Information')).toBe(true);
    });

    it('cho phép các thư mục bình thường', () => {
      expect(isSystemDirectory('D:\\Music\\MyAlbums')).toBe(false);
      expect(isSystemDirectory('D:\\Beatify_Imports')).toBe(false);
    });
  });

  describe('isSafeDeletePath', () => {
    const allowed = ['D:\\MusicImport', 'D:\\Downloads'];
    const protectedDir = ['D:\\MasterMusicLibrary'];

    it('cho phép xóa thư mục con hợp lệ trong allowedRoots', () => {
      const res = isSafeDeletePath('D:\\MusicImport\\Album1', allowed, protectedDir);
      expect(res.safe).toBe(true);
    });

    it('từ chối xóa ổ đĩa gốc', () => {
      const res = isSafeDeletePath('C:\\', allowed, protectedDir);
      expect(res.safe).toBe(false);
      expect(res.reason).toContain('ổ đĩa gốc');
    });

    it('từ chối xóa chính thư mục gốc allowed', () => {
      const res = isSafeDeletePath('D:\\MusicImport', allowed, protectedDir);
      expect(res.safe).toBe(false);
    });

    it('từ chối xóa thư mục bên trong protectedRoots (MUSIC_SOURCE_DIR)', () => {
      const res = isSafeDeletePath('D:\\MasterMusicLibrary\\Artist\\Song', allowed, protectedDir);
      expect(res.safe).toBe(false);
      expect(res.reason).toContain('chỉ đọc');
    });

    it('từ chối xóa thư mục ngoài allowedRoots (Path Traversal / Arbitrary Delete)', () => {
      const res = isSafeDeletePath('C:\\Users\\User\\Documents', allowed, protectedDir);
      expect(res.safe).toBe(false);
      expect(res.reason).toContain('ngoài phạm vi');
    });
  });
});

