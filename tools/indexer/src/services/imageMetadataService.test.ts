import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { applyArtistImageMetadata } from './imageMetadataService';

describe('imageMetadataService - Tab Details & Curator Kato', () => {
  const testDir = path.resolve('fixtures/test_img_meta');
  const testJpg = path.join(testDir, 'artist_test.jpg');
  const testPng = path.join(testDir, 'artist_test.png');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    // Sinh file mẫu qua ffmpeg
    execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=red:s=100x100:d=1', '-vframes', '1', testJpg, '-loglevel', 'quiet']);
    execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=100x100:d=1', '-vframes', '1', testPng, '-loglevel', 'quiet']);
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
    expect(success).toBe(true);
    expect(fs.existsSync(testJpg)).toBe(true);
  });

  it('áp dụng thành công metadata Kato vào file PNG', () => {
    const success = applyArtistImageMetadata(testPng, {
      artistName: 'Đen Vâu',
      curator: 'Kato',
    });
    expect(success).toBe(true);
    expect(fs.existsSync(testPng)).toBe(true);
  });

  it('xử lý an toàn khi file không tồn tại', () => {
    const success = applyArtistImageMetadata(path.join(testDir, 'non_existent.png'), {
      artistName: 'Nobody',
      curator: 'Kato',
    });
    expect(success).toBe(false);
  });
});
