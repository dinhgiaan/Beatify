import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { applyArtistImageMetadata } from './imageMetadataService';

const DUMMY_JPG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64'
);
const DUMMY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

describe('imageMetadataService - Tab Details & Curator Kato', () => {
  const testDir = path.resolve('fixtures/test_img_meta');
  const testJpg = path.join(testDir, 'artist_test.jpg');
  const testPng = path.join(testDir, 'artist_test.png');

  const hasTool = (() => {
    if (process.platform === 'win32') return true;
    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    fs.writeFileSync(testJpg, DUMMY_JPG);
    fs.writeFileSync(testPng, DUMMY_PNG);
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('áp dụng thành công metadata Kato vào file JPG', () => {
    const success = applyArtistImageMetadata(testJpg, {
      artistName: 'Sơn Tùng M-TP',
      curator: 'Kato',
    });
    if (hasTool) {
      expect(success).toBe(true);
    }
    expect(fs.existsSync(testJpg)).toBe(true);
  }, 15000);

  it('áp dụng thành công metadata Kato vào file PNG', () => {
    const success = applyArtistImageMetadata(testPng, {
      artistName: 'Đen Vâu',
      curator: 'Kato',
    });
    if (hasTool) {
      expect(success).toBe(true);
    }
    expect(fs.existsSync(testPng)).toBe(true);
  }, 15000);

  it('xử lý an toàn khi file không tồn tại', () => {
    const success = applyArtistImageMetadata(path.join(testDir, 'non_existent.png'), {
      artistName: 'Nobody',
      curator: 'Kato',
    });
    expect(success).toBe(false);
  });
});
