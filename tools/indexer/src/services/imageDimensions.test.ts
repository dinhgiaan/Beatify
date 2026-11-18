import { describe, it, expect } from 'vitest';
import { getImageDimensions } from './imageDimensions';
import fs from 'fs';
import path from 'path';

describe('getImageDimensions', () => {
  it('trả về null nếu buffer không hợp lệ hoặc quá ngắn', () => {
    expect(getImageDimensions(Buffer.alloc(0))).toBeNull();
    expect(getImageDimensions(Buffer.alloc(10))).toBeNull();
  });

  it('đọc đúng kích thước JPEG 1280x720 từ backup 16:9 hoặc 1280x1280 sau khi convert', () => {
    const backupFile = path.resolve(__dirname, '../../custom_covers_backup_16_9/d6db86a91378.jpg');
    if (fs.existsSync(backupFile)) {
      const buf = fs.readFileSync(backupFile);
      const dim = getImageDimensions(buf);
      expect(dim).not.toBeNull();
      expect(dim?.width).toBe(1280);
      expect(dim?.height).toBe(720);
    }

    const testFile = path.resolve(__dirname, '../../custom_covers/d6db86a91378.jpg');
    if (fs.existsSync(testFile)) {
      const buf = fs.readFileSync(testFile);
      const dim = getImageDimensions(buf);
      expect(dim).not.toBeNull();
      expect(dim?.width).toBe(1280);
      expect(dim?.height).toBe(1280);
    }
  });

  it('đọc đúng kích thước JPEG 1400x1400 thực tế trong custom_covers', () => {
    const testFile = path.resolve(__dirname, '../../custom_covers/007e770a1879.jpg');
    if (fs.existsSync(testFile)) {
      const buf = fs.readFileSync(testFile);
      const dim = getImageDimensions(buf);
      expect(dim).not.toBeNull();
      expect(dim?.width).toBe(1400);
      expect(dim?.height).toBe(1400);
    }
  });

  it('đọc đúng kích thước PNG tối thiểu', () => {
    // Header PNG 100x50
    const pngBuf = Buffer.alloc(32);
    pngBuf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    pngBuf.writeUInt32BE(100, 16);
    pngBuf.writeUInt32BE(50, 20);
    const dim = getImageDimensions(pngBuf);
    expect(dim).toEqual({ width: 100, height: 50 });
  });
});

