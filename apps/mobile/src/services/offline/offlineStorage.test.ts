import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

const mockFiles: Record<string, string> = {};
const mockFileSizes: Record<string, number> = {};

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///var/mobile/Containers/Data/Application/1234/',
  getInfoAsync: vi.fn(async (uri: string) => ({
    exists: uri in mockFiles || uri in mockFileSizes,
    isDirectory: false,
    size: mockFileSizes[uri] || 1024,
  })),
  readAsStringAsync: vi.fn(async (uri: string) => {
    if (uri in mockFiles) return mockFiles[uri];
    throw new Error(`File not found: ${uri}`);
  }),
  writeAsStringAsync: vi.fn(async (uri: string, content: string) => {
    mockFiles[uri] = content;
  }),
  deleteAsync: vi.fn(async (uri: string) => {
    delete mockFiles[uri];
    delete mockFileSizes[uri];
  }),
  moveAsync: vi.fn(async ({ from, to }: { from: string; to: string }) => {
    mockFiles[to] = mockFiles[from] || '';
    delete mockFiles[from];
  }),
  makeDirectoryAsync: vi.fn(async () => {}),
  downloadAsync: vi.fn(async (_url: string, targetUri: string) => {
    mockFiles[targetUri] = 'mock-binary-data';
    mockFileSizes[targetUri] = 5 * 1024 * 1024; // 5 MB
    return { status: 200 };
  }),
}));

import {
  formatBytes,
  getOfflineTotalSizeBytes,
  getAbsoluteOfflineUri,
  loadOfflineIndex,
  saveOfflineIndex,
  deleteTrackOffline,
  deleteMultipleTracksOffline,
  clearAllOfflineTracks,
  type OfflineIndex,
} from './offlineStorage';

describe('offlineStorage', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockFiles)) {
      delete mockFiles[key];
    }
    for (const key of Object.keys(mockFileSizes)) {
      delete mockFileSizes[key];
    }
  });

  describe('formatBytes', () => {
    it('định dạng chính xác 0 và giá trị nhỏ', () => {
      expect(formatBytes(0)).toBe('0 MB');
      expect(formatBytes(-100)).toBe('0 MB');
      expect(formatBytes(500)).toBe('500 B');
    });

    it('định dạng chính xác KB, MB và GB', () => {
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
      expect(formatBytes(1.75 * 1024 * 1024 * 1024)).toBe('1.75 GB');
    });
  });

  describe('getOfflineTotalSizeBytes', () => {
    it('tính tổng dung lượng byte của các bài trong index', () => {
      const index: OfflineIndex = {
        t1: {
          trackId: 't1',
          title: 'Song 1',
          artist: 'Artist 1',
          audioRelPath: 'offline/t1/audio.mp3',
          sizeBytes: 10 * 1024 * 1024,
          downloadedAt: '2026-11-10T12:00:00Z',
        },
        t2: {
          trackId: 't2',
          title: 'Song 2',
          artist: 'Artist 2',
          audioRelPath: 'offline/t2/audio.mp3',
          sizeBytes: 5 * 1024 * 1024,
          downloadedAt: '2026-11-10T12:01:00Z',
        },
      };

      const total = getOfflineTotalSizeBytes(index);
      expect(total).toBe(15 * 1024 * 1024);
      expect(formatBytes(total)).toBe('15.0 MB');
    });
  });

  describe('getAbsoluteOfflineUri', () => {
    it('ghép relative path với documentDirectory an toàn', () => {
      const uri = getAbsoluteOfflineUri('offline/t1/audio.mp3');
      expect(uri).toBe('file:///var/mobile/Containers/Data/Application/1234/offline/t1/audio.mp3');
    });
  });

  describe('loadOfflineIndex & saveOfflineIndex', () => {
    it('lưu chỉ mục bằng atomic write và nạp lại chính xác', async () => {
      const index: OfflineIndex = {
        abc: {
          trackId: 'abc',
          title: 'Hit Song',
          artist: 'Star',
          audioRelPath: 'offline/abc/audio.mp3',
          sizeBytes: 8000000,
          downloadedAt: '2026-11-10T10:00:00Z',
        },
      };

      await saveOfflineIndex(index);
      const loaded = await loadOfflineIndex();
      expect(loaded).toEqual(index);
    });
  });

  describe('deleteTrackOffline & deleteMultipleTracksOffline', () => {
    it('xóa lẻ 1 bài và cập nhật chỉ mục', async () => {
      const index: OfflineIndex = {
        t1: {
          trackId: 't1',
          title: 'Song 1',
          artist: 'Artist 1',
          audioRelPath: 'offline/t1/audio.mp3',
          sizeBytes: 1000,
          downloadedAt: '2026-11-10',
        },
        t2: {
          trackId: 't2',
          title: 'Song 2',
          artist: 'Artist 2',
          audioRelPath: 'offline/t2/audio.mp3',
          sizeBytes: 2000,
          downloadedAt: '2026-11-10',
        },
      };
      await saveOfflineIndex(index);

      const after = await deleteTrackOffline('t1');
      expect(after['t1']).toBeUndefined();
      expect(after['t2']).toBeDefined();
    });

    it('xóa nhiều bài cùng lúc (batch delete) và xóa tất cả', async () => {
      const index: OfflineIndex = {
        a: {
          trackId: 'a',
          title: 'A',
          artist: 'A',
          audioRelPath: 'offline/a/audio.mp3',
          sizeBytes: 100,
          downloadedAt: '2026-11-10',
        },
        b: {
          trackId: 'b',
          title: 'B',
          artist: 'B',
          audioRelPath: 'offline/b/audio.mp3',
          sizeBytes: 200,
          downloadedAt: '2026-11-10',
        },
        c: {
          trackId: 'c',
          title: 'C',
          artist: 'C',
          audioRelPath: 'offline/c/audio.mp3',
          sizeBytes: 300,
          downloadedAt: '2026-11-10',
        },
      };
      await saveOfflineIndex(index);

      const afterBatch = await deleteMultipleTracksOffline(['a', 'c']);
      expect(afterBatch['a']).toBeUndefined();
      expect(afterBatch['b']).toBeDefined();
      expect(afterBatch['c']).toBeUndefined();

      await clearAllOfflineTracks();
      const empty = await loadOfflineIndex();
      expect(empty).toEqual({});
    });
  });
});
