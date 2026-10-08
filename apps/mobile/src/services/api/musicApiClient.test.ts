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
});
