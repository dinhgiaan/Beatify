import { describe, it, expect } from 'vitest';
import { verifyToken, timingSafeEqual } from './utils/auth';
import { parseRange } from './utils/range';
import app from './index';

describe('verifyToken & timingSafeEqual', () => {
  it('xác thực đúng token', async () => {
    expect(await verifyToken('secret123', 'secret123')).toBe(true);
  });

  it('từ chối khi sai token hoặc thiếu token', async () => {
    expect(await verifyToken('wrong', 'secret123')).toBe(false);
    expect(await verifyToken('', 'secret123')).toBe(false);
    expect(await verifyToken(undefined, 'secret123')).toBe(false);
    expect(await verifyToken('secret123', undefined)).toBe(false);
  });

  it('so sánh mảng byte an toàn', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    const c = new Uint8Array([1, 2, 4]);
    expect(timingSafeEqual(a, b)).toBe(true);
    expect(timingSafeEqual(a, c)).toBe(false);
  });
});

describe('parseRange', () => {
  const TOTAL = 1000;

  it('phân tích Range bytes=0-99', () => {
    const range = parseRange('bytes=0-99', TOTAL);
    expect(range).toEqual({ start: 0, end: 99, length: 100 });
  });

  it('phân tích Range bytes=100- (tới hết file)', () => {
    const range = parseRange('bytes=100-', TOTAL);
    expect(range).toEqual({ start: 100, end: 999, length: 900 });
  });

  it('phân tích Range bytes=-200 (suffix cuối)', () => {
    const range = parseRange('bytes=-200', TOTAL);
    expect(range).toEqual({ start: 800, end: 999, length: 200 });
  });

  it('báo NOT_SATISFIABLE khi start vượt quá kích thước', () => {
    const range = parseRange('bytes=2000-', TOTAL);
    expect(range).toBe('NOT_SATISFIABLE');
  });

  it('trả null khi Range không đúng định dạng', () => {
    expect(parseRange('invalid', TOTAL)).toBe(null);
    expect(parseRange('chars=0-10', TOTAL)).toBe(null);
  });
});

describe('API routes validation', () => {
  it('từ chối request không có token (401)', async () => {
    const res = await app.request('/api/library', {}, {
      API_TOKEN: 'secret123',
      MUSIC_BUCKET: {} as unknown as R2Bucket,
    });
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('INVALID_TOKEN');
  });

  it('từ chối stream với id không hợp lệ (400 INVALID_ID)', async () => {
    const res = await app.request('/stream/invalid-id?t=secret123', {}, {
      API_TOKEN: 'secret123',
      MUSIC_BUCKET: {} as unknown as R2Bucket,
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('INVALID_ID');
  });

  it('từ chối covers với albumId không hợp lệ (400 INVALID_ID)', async () => {
    const res = await app.request('/covers/invalid-id?t=secret123', {}, {
      API_TOKEN: 'secret123',
      MUSIC_BUCKET: {} as unknown as R2Bucket,
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('INVALID_ID');
  });
});

describe('Track Edit, Delete & Sync API', () => {
  const mockStorage = new Map<string, string>();

  const fakeBucket = {
    get: async (key: string) => {
      const content = mockStorage.get(key);
      if (!content) return null;
      return {
        httpEtag: '"mock-etag"',
        json: async () => JSON.parse(content),
        text: async () => content,
        body: content,
      } as unknown as R2ObjectBody;
    },
    put: async (key: string, value: string) => {
      mockStorage.set(key, typeof value === 'string' ? value : String(value));
      return {} as unknown as R2Object;
    },
    head: async (key: string) => {
      if (!mockStorage.has(key)) return null;
      return {
        customMetadata: {
          trackCount: '1',
          albumCount: '1',
          generatedAt: '2026-10-08T00:00:00Z',
          dataVersion: '1',
        },
      } as unknown as R2Object;
    },
  } as unknown as R2Bucket;

  const validLibrary = {
    version: 1,
    generatedAt: '2026-10-08T00:00:00.000Z',
    tracks: [
      {
        id: '1234567890ab',
        title: 'Nắng Ấm Xa Dần',
        artist: 'Sơn Tùng M-TP',
        album: 'M-TP',
        duration: 210,
        file: 'music/1234567890ab.mp3',
        storage: 'r2',
      },
    ],
    albums: [
      {
        id: '1234567890cd',
        title: 'M-TP',
        artist: 'Sơn Tùng M-TP',
        trackIds: ['1234567890ab'],
      },
    ],
  };

  const initData = () => {
    mockStorage.clear();
    mockStorage.set('library.json', JSON.stringify(validLibrary));
  };

  it('PATCH /api/tracks/:id - từ chối khi không có token (401)', async () => {
    initData();
    const res = await app.request('/api/tracks/1234567890ab', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Tên Mới' }),
    }, {
      API_TOKEN: 'secret123',
      MUSIC_BUCKET: fakeBucket,
    });
    expect(res.status).toBe(401);
  });

  it('PATCH /api/tracks/:id - từ chối id không hợp lệ (400)', async () => {
    initData();
    const res = await app.request('/api/tracks/bad-id-xyz', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer secret123', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Tên Mới' }),
    }, {
      API_TOKEN: 'secret123',
      MUSIC_BUCKET: fakeBucket,
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('INVALID_ID');
  });

  it('PATCH /api/tracks/:id - trả về 404 nếu không tìm thấy bài hát', async () => {
    initData();
    const res = await app.request('/api/tracks/ffffffffffff', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer secret123', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Tên Mới' }),
    }, {
      API_TOKEN: 'secret123',
      MUSIC_BUCKET: fakeBucket,
    });
    expect(res.status).toBe(404);
  });

  it('PATCH /api/tracks/:id - cập nhật thành công và lưu overrides/lyrics vào R2', async () => {
    initData();
    const res = await app.request('/api/tracks/1234567890ab', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer secret123', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Nắng Ấm Xa Dần (Remix 2026)',
        artist: 'Sơn Tùng',
        year: 2026,
        lyrics: '[00:01.00]Nắng ấm xa dần...',
      }),
    }, {
      API_TOKEN: 'secret123',
      MUSIC_BUCKET: fakeBucket,
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: number; data: { title: string; artist: string; year: number } };
    expect(json.status).toBe(200);
    expect(json.data.title).toBe('Nắng Ấm Xa Dần (Remix 2026)');
    expect(json.data.artist).toBe('Sơn Tùng');
    expect(json.data.year).toBe(2026);

    // Kiểm tra dữ liệu được lưu vào library.json
    const savedLib = JSON.parse(mockStorage.get('library.json') || '{}');
    expect(savedLib.tracks[0].title).toBe('Nắng Ấm Xa Dần (Remix 2026)');

    // Kiểm tra overrides được cập nhật
    const savedOverrides = JSON.parse(mockStorage.get('_meta/overrides.json') || '{}');
    expect(savedOverrides.tracks['1234567890ab'].title).toBe('Nắng Ấm Xa Dần (Remix 2026)');

    // Kiểm tra lyrics được lưu
    expect(mockStorage.get('lyrics-manual/1234567890ab.lrc')).toBe('[00:01.00]Nắng ấm xa dần...');
  });

  it('DELETE /api/tracks/:id - từ chối khi không có token (401)', async () => {
    initData();
    const res = await app.request('/api/tracks/1234567890ab', {
      method: 'DELETE',
    }, {
      API_TOKEN: 'secret123',
      MUSIC_BUCKET: fakeBucket,
    });
    expect(res.status).toBe(401);
  });

  it('DELETE /api/tracks/:id - xóa thành công và đánh dấu thùng rác vào overrides', async () => {
    initData();
    const res = await app.request('/api/tracks/1234567890ab', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer secret123' },
    }, {
      API_TOKEN: 'secret123',
      MUSIC_BUCKET: fakeBucket,
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: number; data: { id: string } };
    expect(json.data.id).toBe('1234567890ab');

    // Kiểm tra track đã bị xóa khỏi library.json
    const savedLib = JSON.parse(mockStorage.get('library.json') || '{}');
    expect(savedLib.tracks.length).toBe(0);

    // Kiểm tra track được đánh dấu hidden trong overrides
    const savedOverrides = JSON.parse(mockStorage.get('_meta/overrides.json') || '{}');
    expect(savedOverrides.tracks['1234567890ab'].hidden).toBe(true);
    expect(savedOverrides.tracks['1234567890ab'].deletedAt).toBeDefined();
  });

  it('GET /api/overrides & PUT /api/overrides - đồng bộ 2 chiều', async () => {
    initData();
    // PUT overrides mới
    const putRes = await app.request('/api/overrides', {
      method: 'PUT',
      headers: { Authorization: 'Bearer secret123', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: 1,
        tracks: {
          '1234567890ab': { title: 'Tên Từ PC' },
        },
      }),
    }, {
      API_TOKEN: 'secret123',
      MUSIC_BUCKET: fakeBucket,
    });
    expect(putRes.status).toBe(200);

    // GET overrides
    const getRes = await app.request('/api/overrides', {
      method: 'GET',
      headers: { Authorization: 'Bearer secret123' },
    }, {
      API_TOKEN: 'secret123',
      MUSIC_BUCKET: fakeBucket,
    });
    expect(getRes.status).toBe(200);
    const json = (await getRes.json()) as { data: { tracks: Record<string, { title: string }> } };
    expect(json.data.tracks['1234567890ab']?.title).toBe('Tên Từ PC');
  });

  it('GET /lyrics/:id - lấy lời từ lyrics-manual hoặc lyrics/', async () => {
    initData();
    // Chưa có lời -> 404
    const resNotFound = await app.request('/lyrics/1234567890ab?t=secret123', {}, {
      API_TOKEN: 'secret123',
      MUSIC_BUCKET: fakeBucket,
    });
    expect(resNotFound.status).toBe(404);

    // Có lời trong lyrics/
    mockStorage.set('lyrics/1234567890ab.lrc', '[00:01.00]Lời tự động');
    const resAuto = await app.request('/lyrics/1234567890ab?t=secret123', {}, {
      API_TOKEN: 'secret123',
      MUSIC_BUCKET: fakeBucket,
    });
    expect(resAuto.status).toBe(200);
    expect(await resAuto.text()).toBe('[00:01.00]Lời tự động');

    // Có lời trong lyrics-manual/ (ưu tiên cao hơn)
    mockStorage.set('lyrics-manual/1234567890ab.lrc', '[00:01.00]Lời thủ công chỉnh sửa');
    const resManual = await app.request('/lyrics/1234567890ab?t=secret123', {}, {
      API_TOKEN: 'secret123',
      MUSIC_BUCKET: fakeBucket,
    });
    expect(resManual.status).toBe(200);
    expect(await resManual.text()).toBe('[00:01.00]Lời thủ công chỉnh sửa');
  });

  it('GET /api/state & PUT /api/state - đồng bộ danh sách phát và yêu thích', async () => {
    initData();
    // Mặc định state rỗng nếu chưa có
    const getInit = await app.request('/api/state', {
      method: 'GET',
      headers: { Authorization: 'Bearer secret123' },
    }, {
      API_TOKEN: 'secret123',
      MUSIC_BUCKET: fakeBucket,
    });
    expect(getInit.status).toBe(200);
    const initJson = (await getInit.json()) as { data: { playlists: unknown[]; favoriteIds: string[] } };
    expect(initJson.data.playlists).toEqual([]);
    expect(initJson.data.favoriteIds).toEqual([]);

    // Lưu state mới
    const now = new Date().toISOString();
    const putRes = await app.request('/api/state', {
      method: 'PUT',
      headers: { Authorization: 'Bearer secret123', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: 1,
        updatedAt: now,
        playlists: [
          {
            id: 'playlist-1',
            name: 'Nhạc Chill Đêm',
            trackIds: ['1234567890ab'],
            createdAt: now,
            updatedAt: now,
          },
        ],
        favoriteIds: ['1234567890ab'],
      }),
    }, {
      API_TOKEN: 'secret123',
      MUSIC_BUCKET: fakeBucket,
    });
    expect(putRes.status).toBe(200);

    // Lấy lại state đã lưu
    const getSaved = await app.request('/api/state', {
      method: 'GET',
      headers: { Authorization: 'Bearer secret123' },
    }, {
      API_TOKEN: 'secret123',
      MUSIC_BUCKET: fakeBucket,
    });
    expect(getSaved.status).toBe(200);
    const savedJson = (await getSaved.json()) as { data: { playlists: { id: string; name: string; trackIds: string[] }[]; favoriteIds: string[] } };
    expect(savedJson.data.playlists.length).toBe(1);
    expect(savedJson.data.playlists[0]?.name).toBe('Nhạc Chill Đêm');
    expect(savedJson.data.favoriteIds).toEqual(['1234567890ab']);
  });
});

