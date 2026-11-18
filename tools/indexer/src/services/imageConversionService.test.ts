import { describe, it, expect } from 'vitest';
import { convertToSquareAmbientCover } from './imageConversionService';
import { getImageDimensions } from './imageDimensions';
import fs from 'fs';
import path from 'path';

describe('imageConversionService', () => {
  it('giữ nguyên buffer nếu ảnh rỗng hoặc không hợp lệ', async () => {
    const emptyBuf = Buffer.alloc(0);
    const result = await convertToSquareAmbientCover(emptyBuf);
    expect(result).toBe(emptyBuf);
  });

  it('giữ nguyên nếu ảnh đã là vuông 1:1', async () => {
    const squareFile = path.resolve(__dirname, '../../custom_covers/007e770a1879.jpg');
    if (fs.existsSync(squareFile)) {
      const buf = fs.readFileSync(squareFile);
      const result = await convertToSquareAmbientCover(buf);
      expect(result).toBe(buf);
    }
  });

  it('chuyển đổi ảnh 16:9 từ thư mục backup sang ảnh vuông 1:1 có ambient blur', async () => {
    const backupFile = path.resolve(__dirname, '../../custom_covers_backup_16_9/d6db86a91378.jpg');
    if (fs.existsSync(backupFile)) {
      const buf = fs.readFileSync(backupFile);
      const originalDim = getImageDimensions(buf);
      expect(originalDim?.width).toBe(1280);
      expect(originalDim?.height).toBe(720);

      const converted = await convertToSquareAmbientCover(buf);
      expect(converted).not.toBe(buf);

      const newDim = getImageDimensions(converted);
      expect(newDim).not.toBeNull();
      expect(newDim?.width).toBe(1280);
      expect(newDim?.height).toBe(1280);
    }
  });
});

