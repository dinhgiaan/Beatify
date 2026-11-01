import { describe, it, expect } from 'vitest';
import { mergeUserStates } from './sync';
import type { UserState } from './schemas';

describe('mergeUserStates', () => {
  const sampleLocal: UserState = {
    version: 1,
    updatedAt: '2026-11-01T10:00:00.000Z',
    playlists: [
      {
        id: 'pl-local-offline',
        name: 'Playlist Tạo Lúc Không Có Mạng',
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-01T10:00:00.000Z',
        trackIds: ['track-1', 'track-2'],
      },
      {
        id: 'pl-shared-conflict',
        name: 'Playlist Trùng ID (Bản Cũ Ở Local)',
        createdAt: '2026-11-01T08:00:00.000Z',
        updatedAt: '2026-11-01T08:30:00.000Z',
        trackIds: ['track-1'],
      },
    ],
    favoriteIds: ['fav-local-1', 'fav-shared'],
  };

  const sampleRemote: UserState = {
    version: 1,
    updatedAt: '2026-11-01T10:30:00.000Z',
    playlists: [
      {
        id: 'pl-remote-web',
        name: 'Playlist Tạo Trên Web Dashboard',
        createdAt: '2026-11-01T09:00:00.000Z',
        updatedAt: '2026-11-01T09:00:00.000Z',
        trackIds: ['track-3'],
      },
      {
        id: 'pl-shared-conflict',
        name: 'Playlist Trùng ID (Bản Mới Ở Remote)',
        createdAt: '2026-11-01T08:00:00.000Z',
        updatedAt: '2026-11-01T09:45:00.000Z',
        trackIds: ['track-1', 'track-4', 'track-5'],
      },
    ],
    favoriteIds: ['fav-remote-1', 'fav-shared'],
  };

  it('bảo toàn tất cả playlist độc lập của cả hai phía (không làm mất playlist offline)', () => {
    const merged = mergeUserStates(sampleLocal, sampleRemote);

    expect(merged.playlists).toHaveLength(3);

    // Playlist chỉ có ở local vẫn tồn tại
    const localOnly = merged.playlists.find((p) => p.id === 'pl-local-offline');
    expect(localOnly).toBeDefined();
    expect(localOnly?.name).toBe('Playlist Tạo Lúc Không Có Mạng');

    // Playlist chỉ có ở remote vẫn tồn tại
    const remoteOnly = merged.playlists.find((p) => p.id === 'pl-remote-web');
    expect(remoteOnly).toBeDefined();
    expect(remoteOnly?.name).toBe('Playlist Tạo Trên Web Dashboard');
  });

  it('giải quyết xung đột ID trùng: lấy phiên bản có updatedAt mới hơn', () => {
    const merged = mergeUserStates(sampleLocal, sampleRemote);

    const conflicted = merged.playlists.find((p) => p.id === 'pl-shared-conflict');
    expect(conflicted).toBeDefined();
    // Do remote updatedAt (09:45) mới hơn local (08:30) nên lấy tên và trackIds của remote
    expect(conflicted?.name).toBe('Playlist Trùng ID (Bản Mới Ở Remote)');
    expect(conflicted?.trackIds).toEqual(['track-1', 'track-4', 'track-5']);
  });

  it('hợp nhất danh sách bài hát yêu thích (Union) không trùng lặp', () => {
    const merged = mergeUserStates(sampleLocal, sampleRemote);

    expect(merged.favoriteIds).toContain('fav-local-1');
    expect(merged.favoriteIds).toContain('fav-remote-1');
    expect(merged.favoriteIds).toContain('fav-shared');
    expect(merged.favoriteIds).toHaveLength(3);
  });

  it('xử lý khi một trong hai trạng thái là null hoặc undefined', () => {
    expect(mergeUserStates(sampleLocal, null).playlists).toHaveLength(2);
    expect(mergeUserStates(null, sampleRemote).playlists).toHaveLength(2);
    const emptyMerge = mergeUserStates(null, null);
    expect(emptyMerge.playlists).toEqual([]);
    expect(emptyMerge.favoriteIds).toEqual([]);
  });
});
