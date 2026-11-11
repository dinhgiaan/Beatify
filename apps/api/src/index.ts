import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  ERROR_CODES,
  isValidTrackId,
  isValidAlbumId,
  UpdateTrackSchema,
  OverridesSchema,
  UserStateSchema,
  type UserState,
  applyTrackUpdate,
  applyTrackDeletion,
  mergeUserStates,
} from '@music-app/shared';
import type { Env } from './types';
import { verifyToken } from './utils/auth';
import { parseRange } from './utils/range';
import { R2StorageRepository } from './repositories/storageRepository';

const app = new Hono<{ Bindings: Env }>();

// Middleware xác thực bảo mật
app.use('*', async (c, next) => {
  const expectedToken = c.env.API_TOKEN;

  // Lấy token từ header Authorization (chuẩn cho /api/*) hoặc query param ?t= / ?token= (cho stream/covers)
  const authHeader = c.req.header('Authorization');
  let token: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    token = c.req.query('t') || c.req.query('token');
  }

  const isValid = await verifyToken(token, expectedToken);
  if (!isValid) {
    return c.json(
      {
        status: 401,
        message: 'Unauthorized',
        data: null,
        error: ERROR_CODES.INVALID_TOKEN,
      },
      401
    );
  }

  await next();
});

// Endpoint: GET /api/library - Lấy toàn bộ danh sách thư viện nhạc
app.get('/api/library', async (c) => {
  const repo = new R2StorageRepository(c.env.MUSIC_BUCKET);
  const result = await repo.getLibrary();

  if (!result) {
    return c.json(
      {
        status: 404,
        message: 'Library not found',
        data: null,
        error: ERROR_CODES.NOT_FOUND,
      },
      404
    );
  }

  const ifNoneMatch = c.req.header('If-None-Match');
  if (ifNoneMatch && ifNoneMatch === result.etag) {
    return new Response(null, { status: 304 });
  }

  c.header('ETag', result.etag);
  c.header('Cache-Control', 'private, no-cache');
  return c.json({
    status: 200,
    message: 'OK',
    data: result.library,
    error: null,
  });
});

// Endpoint: GET /api/health - Kiểm tra tình trạng thư viện (head metadata nhẹ)
app.get('/api/health', async (c) => {
  const repo = new R2StorageRepository(c.env.MUSIC_BUCKET);
  const health = await repo.getHealth();

  if (!health) {
    return c.json(
      {
        status: 404,
        message: 'Library metadata not found',
        data: null,
        error: ERROR_CODES.NOT_FOUND,
      },
      404
    );
  }

  return c.json({
    status: 200,
    message: 'OK',
    data: health,
    error: null,
  });
});

// Endpoint: GET, HEAD /stream/:id - Phát âm thanh hỗ trợ tua (HTTP Range 206)
const handleStream = async (c: Context<{ Bindings: Env }>) => {
  const id = c.req.param('id');
  if (!id || !isValidTrackId(id)) {
    return c.json(
      {
        status: 400,
        message: 'Invalid track id',
        data: null,
        error: ERROR_CODES.INVALID_ID,
      },
      400
    );
  }

  const repo = new R2StorageRepository(c.env.MUSIC_BUCKET);
  const rangeHeader = c.req.header('Range');

  // Lấy thông tin kích thước bài hát trước
  const probe = await repo.getAudioStream(id);
  if (!probe) {
    return c.json(
      {
        status: 404,
        message: 'Track not found',
        data: null,
        error: ERROR_CODES.NOT_FOUND,
      },
      404
    );
  }

  const totalSize = probe.totalSize;

  // Xử lý Range Request
  if (rangeHeader) {
    const parsed = parseRange(rangeHeader, totalSize);

    if (parsed === 'NOT_SATISFIABLE') {
      return new Response(
        JSON.stringify({
          status: 416,
          message: 'Range Not Satisfiable',
          data: null,
          error: ERROR_CODES.RANGE_NOT_SATISFIABLE,
        }),
        {
          status: 416,
          headers: {
            'Content-Type': 'application/json',
            'Content-Range': `bytes */${totalSize}`,
          },
        }
      );
    }

    if (parsed) {
      console.log(`[stream:${id}] Nhận Range header: "${rangeHeader}" -> Phản hồi HTTP 206 (bytes ${parsed.start}-${parsed.end}/${totalSize})`);
      const rangedResult = await repo.getAudioStream(id, {
        offset: parsed.start,
        length: parsed.length,
      });

      if (!rangedResult) {
        return c.json(
          {
            status: 404,
            message: 'Track range not found',
            data: null,
            error: ERROR_CODES.NOT_FOUND,
          },
          404
        );
      }

      const headers = new Headers();
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Content-Range', `bytes ${parsed.start}-${parsed.end}/${totalSize}`);
      headers.set('Content-Length', parsed.length.toString());
      headers.set('Content-Type', rangedResult.object.contentType || 'audio/mpeg');
      headers.set('ETag', rangedResult.object.etag);

      return new Response(c.req.method === 'HEAD' ? null : rangedResult.object.body, {
        status: 206,
        headers,
      });
    }
  }

  // Yêu cầu bình thường (không Range) -> 200 OK
  console.log(`[stream:${id}] Yêu cầu stream toàn bộ (không có Range header) -> Phản hồi HTTP 200 (${totalSize} bytes)`);
  const headers = new Headers();
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Length', totalSize.toString());
  headers.set('Content-Type', probe.object.contentType || 'audio/mpeg');
  headers.set('ETag', probe.object.etag);

  return new Response(c.req.method === 'HEAD' ? null : probe.object.body, {
    status: 200,
    headers,
  });
};

app.get('/stream/:id', handleStream);
app.on('HEAD', '/stream/:id', handleStream);
app.get('/api/stream/:id', handleStream);
app.on('HEAD', '/api/stream/:id', handleStream);

// Endpoint: GET /covers/:albumId & /api/covers/:albumId - Phục vụ ảnh bìa album
const handleCover = async (c: Context<{ Bindings: Env }>) => {
  const albumId = c.req.param('albumId');
  if (!albumId || !isValidAlbumId(albumId)) {
    return c.json(
      {
        status: 400,
        message: 'Invalid album id',
        data: null,
        error: ERROR_CODES.INVALID_ID,
      },
      400
    );
  }

  const repo = new R2StorageRepository(c.env.MUSIC_BUCKET);
  const cover = await repo.getCover(albumId);

  if (!cover) {
    return c.json(
      {
        status: 404,
        message: 'Cover not found',
        data: null,
        error: ERROR_CODES.NOT_FOUND,
      },
      404
    );
  }

  const hasVersion = Boolean(c.req.query('v'));
  const cacheControl = hasVersion
    ? 'private, max-age=31536000, immutable'
    : 'private, max-age=3600';

  return new Response(cover.body, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': cacheControl,
      ETag: cover.etag,
    },
  });
};

app.get('/covers/:albumId', handleCover);
app.get('/api/covers/:albumId', handleCover);

// Endpoint: PATCH /api/tracks/:id - Sửa metadata và lời bài hát từ mobile hoặc web
app.patch('/api/tracks/:id', async (c) => {
  const id = c.req.param('id');
  if (!id || !isValidTrackId(id)) {
    return c.json(
      {
        status: 400,
        message: 'Invalid track id',
        data: null,
        error: ERROR_CODES.INVALID_ID,
      },
      400
    );
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        status: 400,
        message: 'Invalid JSON body',
        data: null,
        error: ERROR_CODES.VALIDATION_ERROR,
      },
      400
    );
  }

  const parsed = UpdateTrackSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        status: 400,
        message: 'Validation error: ' + parsed.error.issues.map((i) => i.message).join(', '),
        data: null,
        error: ERROR_CODES.VALIDATION_ERROR,
      },
      400
    );
  }

  const repo = new R2StorageRepository(c.env.MUSIC_BUCKET);
  const current = await repo.getLibrary();
  if (!current) {
    return c.json(
      {
        status: 404,
        message: 'Library not found',
        data: null,
        error: ERROR_CODES.NOT_FOUND,
      },
      404
    );
  }

  const { library: updatedLib, updatedTrack } = applyTrackUpdate(current.library, id, parsed.data);
  if (!updatedTrack) {
    return c.json(
      {
        status: 404,
        message: 'Track not found in library',
        data: null,
        error: ERROR_CODES.NOT_FOUND,
      },
      404
    );
  }

  // 1. Lưu library.json mới lên R2
  await repo.saveLibrary(updatedLib);

  // 2. Ghi đè vào _meta/overrides.json để đồng bộ 2 chiều với PC
  const currentOverrides = await repo.getOverrides();
  currentOverrides.tracks[id] = {
    ...currentOverrides.tracks[id],
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.artist !== undefined ? { artist: parsed.data.artist } : {}),
    ...(parsed.data.album !== undefined ? { album: parsed.data.album } : {}),
    ...(parsed.data.year !== undefined ? { year: parsed.data.year } : {}),
  };
  await repo.saveOverrides(currentOverrides);

  // 3. Nếu có cập nhật lời bài hát, lưu vào lyrics-manual
  if (parsed.data.lyrics !== undefined) {
    await repo.saveLyrics(id, parsed.data.lyrics);
  }

  return c.json({
    status: 200,
    message: 'Track updated successfully',
    data: updatedTrack,
    error: null,
  });
});

// Endpoint: DELETE /api/tracks/:id - Xóa bài hát (đưa vào thùng rác / loại khỏi library)
app.delete('/api/tracks/:id', async (c) => {
  const id = c.req.param('id');
  if (!id || !isValidTrackId(id)) {
    return c.json(
      {
        status: 400,
        message: 'Invalid track id',
        data: null,
        error: ERROR_CODES.INVALID_ID,
      },
      400
    );
  }

  const repo = new R2StorageRepository(c.env.MUSIC_BUCKET);
  const current = await repo.getLibrary();
  if (!current) {
    return c.json(
      {
        status: 404,
        message: 'Library not found',
        data: null,
        error: ERROR_CODES.NOT_FOUND,
      },
      404
    );
  }

  const { library: updatedLib, deletedTrack } = applyTrackDeletion(current.library, id);
  if (!deletedTrack) {
    return c.json(
      {
        status: 404,
        message: 'Track not found in library',
        data: null,
        error: ERROR_CODES.NOT_FOUND,
      },
      404
    );
  }

  // 1. Lưu library.json mới đã loại bỏ track
  await repo.saveLibrary(updatedLib);

  // 2. Ghi đè trạng thái ẩn (thùng rác) vào _meta/overrides.json để đồng bộ với PC
  const currentOverrides = await repo.getOverrides();
  currentOverrides.tracks[id] = {
    ...currentOverrides.tracks[id],
    hidden: true,
    deletedAt: new Date().toISOString(),
  };
  await repo.saveOverrides(currentOverrides);

  return c.json({
    status: 200,
    message: 'Track deleted successfully',
    data: { id },
    error: null,
  });
});

// Endpoint: GET /api/overrides - Lấy danh sách overrides để PC đồng bộ về
app.get('/api/overrides', async (c) => {
  const repo = new R2StorageRepository(c.env.MUSIC_BUCKET);
  const overrides = await repo.getOverrides();
  return c.json({
    status: 200,
    message: 'OK',
    data: overrides,
    error: null,
  });
});

// Endpoint: PUT /api/overrides - Cập nhật danh sách overrides từ PC lên Cloudflare R2
app.put('/api/overrides', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        status: 400,
        message: 'Invalid JSON body',
        data: null,
        error: ERROR_CODES.VALIDATION_ERROR,
      },
      400
    );
  }

  const parsed = OverridesSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        status: 400,
        message: 'Validation error',
        data: null,
        error: ERROR_CODES.VALIDATION_ERROR,
      },
      400
    );
  }

  const repo = new R2StorageRepository(c.env.MUSIC_BUCKET);
  await repo.saveOverrides(parsed.data);

  return c.json({
    status: 200,
    message: 'Overrides updated successfully',
    data: parsed.data,
    error: null,
  });
});

// Endpoint: GET, HEAD /lyrics/:id - Phục vụ lời bài hát (.lrc hoặc .txt)
const handleLyrics = async (c: Context<{ Bindings: Env }>) => {
  const id = c.req.param('id');
  if (!id || !isValidTrackId(id)) {
    return c.json(
      {
        status: 400,
        message: 'Invalid track id',
        data: null,
        error: ERROR_CODES.INVALID_ID,
      },
      400
    );
  }

  const repo = new R2StorageRepository(c.env.MUSIC_BUCKET);
  const lyrics = await repo.getLyrics(id);

  if (!lyrics) {
    return c.json(
      {
        status: 404,
        message: 'Lyrics not found',
        data: null,
        error: ERROR_CODES.NOT_FOUND,
      },
      404
    );
  }

  return new Response(c.req.method === 'HEAD' ? null : lyrics.content, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Lyrics-Source': lyrics.source,
      'X-Lyrics-Format': lyrics.format,
      'Cache-Control': 'private, max-age=86400',
    },
  });
};

app.get('/lyrics/:id', handleLyrics);
app.on('HEAD', '/lyrics/:id', handleLyrics);

// Endpoint: GET /api/state - Lấy trạng thái người dùng (Playlists, Favorites)
app.get('/api/state', async (c) => {
  const repo = new R2StorageRepository(c.env.MUSIC_BUCKET);
  const state = await repo.getUserState();

  if (!state) {
    const defaultState: UserState = {
      version: 1,
      updatedAt: new Date().toISOString(),
      playlists: [],
      favoriteIds: [],
    };
    return c.json({
      status: 200,
      message: 'OK (default state)',
      data: defaultState,
      error: null,
    });
  }

  return c.json({
    status: 200,
    message: 'OK',
    data: state,
    error: null,
  });
});

// Endpoint: PUT /api/state - Lưu trạng thái người dùng (Playlists, Favorites)
app.put('/api/state', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        status: 400,
        message: 'Invalid JSON body',
        data: null,
        error: ERROR_CODES.VALIDATION_ERROR,
      },
      400
    );
  }

  const parsed = UserStateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        status: 400,
        message: 'Validation error: ' + parsed.error.issues.map((i) => i.message).join(', '),
        data: null,
        error: ERROR_CODES.VALIDATION_ERROR,
      },
      400
    );
  }

  const repo = new R2StorageRepository(c.env.MUSIC_BUCKET);
  const current = await repo.getUserState();

  // Hợp nhất thông minh 2 chiều: Bảo toàn playlist & favorites của cả client và server
  const finalState = current ? mergeUserStates(parsed.data, current) : parsed.data;

  await repo.saveUserState(finalState);

  return c.json({
    status: 200,
    message: 'User state merged and saved successfully',
    data: finalState,
    error: null,
  });
});

export default app;



