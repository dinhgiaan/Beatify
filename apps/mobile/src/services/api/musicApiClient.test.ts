import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MusicApiClient } from './musicApiClient';

describe('MusicApiClient', () => {
  let client: MusicApiClient;

  beforeEach(() => {
    client = new MusicApiClient({
      baseUrl: 'https://api.beatify.local',
      token: 'test-token',
    });
  });

  it('fetchLibrary gửi đúng header và nhận dữ liệu', async () => {
    const mockLib = {
      version: 1,
      generatedAt: '2026-10-08T00:00:00Z',
      tracks: [{ id: '1234567890ab', title: 'Bài 1', artist: 'Ca sĩ 1', duration: 180, file: 'music/1.mp3', storage: 'r2' }],
      albums: [],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 200, message: 'OK', data: mockLib, error: null }),
    });

    const lib = await client.fetchLibrary();
    expect(lib.tracks.length).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.beatify.local/api/library',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });

  it('fetchLibraryWithETag gửi If-None-Match và trả về notModified: true khi server phản hồi 304', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 304,
      ok: false, // 304 not ok in fetch
    });

    const result = await client.fetchLibraryWithETag('w/etag-123');
    expect(result.notModified).toBe(true);
    expect(result.etag).toBe('w/etag-123');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.beatify.local/api/library',
      expect.objectContaining({
        headers: expect.objectContaining({
          'If-None-Match': 'w/etag-123',
        }),
      })
    );
  });

  it('fetchLibraryWithETag trả về notModified: false kèm ETag mới khi server phản hồi 200', async () => {
    const mockLib = {
      version: 1,
      generatedAt: '2026-10-08T00:00:00Z',
      tracks: [{ id: 'track-1', title: 'Bài Mới Nhất', artist: 'Ca sĩ A', duration: 200, file: 'music/new.mp3', storage: 'r2' }],
      albums: [],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ ETag: 'new-etag-999' }),
      json: async () => ({ status: 200, message: 'OK', data: mockLib, error: null }),
    });

    const result = await client.fetchLibraryWithETag('old-etag');
    expect(result.notModified).toBe(false);
    expect(result.data?.tracks.length).toBe(1);
    expect(result.etag).toBe('new-etag-999');
  });

  it('updateTrack gửi PATCH và trả về track cập nhật', async () => {
    const updatedTrack = {
      id: '1234567890ab',
      title: 'Bài Mới',
      artist: 'Ca sĩ Mới',
      duration: 180,
      file: 'music/1.mp3',
      storage: 'r2',
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 200, message: 'OK', data: updatedTrack, error: null }),
    });

    const res = await client.updateTrack('1234567890ab', { title: 'Bài Mới', artist: 'Ca sĩ Mới' });
    expect(res.title).toBe('Bài Mới');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.beatify.local/api/tracks/1234567890ab',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ title: 'Bài Mới', artist: 'Ca sĩ Mới' }),
      })
    );
  });

  it('deleteTrack gửi DELETE và trả về id', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 200, message: 'OK', data: { id: '1234567890ab' }, error: null }),
    });

    const deletedId = await client.deleteTrack('1234567890ab');
    expect(deletedId).toBe('1234567890ab');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.beatify.local/api/tracks/1234567890ab',
      expect.objectContaining({
        method: 'DELETE',
      })
    );
  });

  it('báo lỗi khi API trả về mã lỗi 400 hoặc 500', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ status: 400, message: 'Invalid track id', data: null, error: 'INVALID_ID' }),
    });

    await expect(client.updateTrack('invalid-id', { title: 'Tên' })).rejects.toThrow('Invalid track id');
  });

  it('hủy request và ném thông báo timeout tiếng Việt thân thiện khi request quá hạn', async () => {
    client.setTimeoutMs(50);
    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    });

    await expect(client.fetchLibrary()).rejects.toThrow('Yêu cầu mạng hết thời gian chờ sau 0s');
  });
});
