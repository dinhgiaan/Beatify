import { describe, it, expect } from 'vitest';
import { ScanCache } from './scanCache';
import type { ScannedTrack } from './scanner';

const mockTrack: ScannedTrack = {
  filePath: 'D:/Music/song.mp3',
  track: {
    id: 'abc123456789',
    title: 'Test Song',
    artist: 'Test Artist',
    album: 'Test Album',
    albumId: 'alb123456789',
    duration: 180,
    file: 'music/abc123456789.mp3',
    storage: 'r2',
    loudnessLufs: -18,
    replayGain: 0,
  },
};

describe('ScanCache', () => {
  it('tái sử dụng kết quả khi file không thay đổi mtime và size', () => {
    const cache = new ScanCache();
    const stat = { mtimeMs: 1700000000000, size: 5000000 };
    cache.set('D:/Music/song.mp3', stat, mockTrack);

    const hit = cache.get('D:/Music/song.mp3', stat);
    expect(hit).toBe(mockTrack);
  });

  it('vô hiệu hóa cache khi file bị thay đổi size', () => {
    const cache = new ScanCache();
    const statA = { mtimeMs: 1700000000000, size: 5000000 };
    const statB = { mtimeMs: 1700000000000, size: 5000001 };
    cache.set('D:/Music/song.mp3', statA, mockTrack);

    const miss = cache.get('D:/Music/song.mp3', statB);
    expect(miss).toBeNull();
    expect(cache.size).toBe(0);
  });

  it('vô hiệu hóa cache khi file bị thay đổi mtime', () => {
    const cache = new ScanCache();
    const statA = { mtimeMs: 1700000000000, size: 5000000 };
    const statB = { mtimeMs: 1700000005000, size: 5000000 };
    cache.set('D:/Music/song.mp3', statA, mockTrack);

    const miss = cache.get('D:/Music/song.mp3', statB);
    expect(miss).toBeNull();
  });

  it('prune xóa các file không còn tồn tại', () => {
    const cache = new ScanCache();
    cache.set('file1.mp3', { mtimeMs: 100, size: 10 }, mockTrack);
    cache.set('file2.mp3', { mtimeMs: 100, size: 10 }, mockTrack);

    cache.prune(new Set(['file1.mp3']));
    expect(cache.get('file1.mp3', { mtimeMs: 100, size: 10 })).not.toBeNull();
    expect(cache.get('file2.mp3', { mtimeMs: 100, size: 10 })).toBeNull();
  });
});

