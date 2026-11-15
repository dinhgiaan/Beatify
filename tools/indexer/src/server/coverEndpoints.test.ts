import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from './index';

describe('Cover Endpoints - Quản lý và tìm kiếm ảnh bìa HD', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. GET /local-api/covers/search trả về 400 nếu thiếu title', async () => {
    const res = await app.request('/local-api/covers/search', {
      headers: { Host: '127.0.0.1:4000' },
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toContain('Tiêu đề');
  });

  it('2. GET /local-api/covers/search tìm kiếm thành công và trả về danh sách', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            {
              trackName: 'Waiting For You',
              artistName: 'MONO',
              artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/100x100bb.jpg',
            },
          ],
        }),
    } as unknown as Response);

    const res = await app.request('/local-api/covers/search?title=Waiting%20For%20You&artist=MONO', {
      headers: { Host: '127.0.0.1:4000' },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { results?: Array<{ artworkUrl: string; width: number }> };
    expect(json.results?.length).toBe(1);
    expect(json.results?.[0]?.artworkUrl).toContain('1400x1400bb.jpg');
    expect(json.results?.[0]?.width).toBe(1400);
  });

  it('3. GET /local-api/covers/batch-status trả về trạng thái mặc định', async () => {
    const res = await app.request('/local-api/covers/batch-status', {
      headers: { Host: '127.0.0.1:4000' },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data?: { isRunning: boolean; total: number } };
    expect(json.data?.isRunning).toBe(false);
  });

  it('4. POST /local-api/covers/batch-cancel xử lý dừng tiến trình', async () => {
    const res = await app.request('/local-api/covers/batch-cancel', {
      method: 'POST',
      headers: {
        Host: '127.0.0.1:4000',
        Origin: 'http://localhost:5173',
      },
    });
    expect(res.status).toBe(200);
  });
});

