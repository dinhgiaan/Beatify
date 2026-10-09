import { describe, expect, it } from 'vitest';

import { LyricsRefSchema } from './lyrics';
import {
  AlbumSchema,
  LibrarySchema,
  PlaylistSchema,
  TrackSchema,
  UserStateSchema,
  ListeningRecordSchema,
} from './schemas';

const NOW = '2026-09-20T04:00:00.000Z';

const baseTrack = {
  id: 'a1b2c3d4e5f6',
  title: 'Nắng ấm xa dần',
  artist: 'Sơn Tùng M-TP',
  duration: 215.4,
  file: 'music/a1b2c3d4e5f6.mp3',
};

describe('TrackSchema', () => {
  it('chấp nhận bài tối thiểu và tự gán storage = r2', () => {
    const parsed = TrackSchema.parse(baseTrack);
    expect(parsed.storage).toBe('r2');
  });

  it('bỏ qua trường lạ thay vì báo lỗi (tương thích ngược, mục 7.4)', () => {
    const parsed = TrackSchema.parse({ ...baseTrack, futureField: 123 });
    expect(parsed).not.toHaveProperty('futureField');
  });

  it('từ chối khi thiếu trường bắt buộc', () => {
    const missingTitle: Record<string, unknown> = { ...baseTrack };
    delete missingTitle.title;
    expect(TrackSchema.safeParse(missingTitle).success).toBe(false);
  });

  it('từ chối số thứ tự bài không phải số nguyên', () => {
    expect(TrackSchema.safeParse({ ...baseTrack, trackNumber: 1.5 }).success).toBe(false);
  });

  it('từ chối storage không hỗ trợ', () => {
    expect(TrackSchema.safeParse({ ...baseTrack, storage: 'b2' }).success).toBe(false);
  });

  it('chấp nhận tham chiếu lời và mặc định reviewed = false', () => {
    const parsed = TrackSchema.parse({
      ...baseTrack,
      lyrics: { file: 'lyrics/a1b2c3d4e5f6.lrc', format: 'lrc', source: 'lrclib' },
    });
    expect(parsed.lyrics?.reviewed).toBe(false);
  });
});

describe('LyricsRefSchema', () => {
  it('từ chối nguồn lời không có trong danh sách', () => {
    const result = LyricsRefSchema.safeParse({
      file: 'lyrics/x.lrc',
      format: 'lrc',
      source: 'web',
    });
    expect(result.success).toBe(false);
  });
});

describe('AlbumSchema', () => {
  it('chấp nhận album với danh sách trackIds', () => {
    const album = { id: 'alb1', title: 'Sky Tour', artist: 'Sơn Tùng M-TP', trackIds: ['a', 'b'] };
    expect(AlbumSchema.parse(album).trackIds).toEqual(['a', 'b']);
  });
});

describe('LibrarySchema', () => {
  const library = { version: 1, generatedAt: NOW, tracks: [baseTrack], albums: [] };

  it('chấp nhận thư viện hợp lệ', () => {
    expect(LibrarySchema.safeParse(library).success).toBe(true);
  });

  it('từ chối version khác 1 (app phải tự kiểm tra version trước khi parse)', () => {
    expect(LibrarySchema.safeParse({ ...library, version: 2 }).success).toBe(false);
  });

  it('từ chối generatedAt không phải ISO datetime', () => {
    expect(LibrarySchema.safeParse({ ...library, generatedAt: '20/09/2026' }).success).toBe(false);
  });
});

describe('PlaylistSchema', () => {
  const playlist = { id: 'p1', name: 'Đi làm', trackIds: [], createdAt: NOW, updatedAt: NOW };

  it('chấp nhận playlist hợp lệ', () => {
    expect(PlaylistSchema.safeParse(playlist).success).toBe(true);
  });

  it('từ chối tên rỗng', () => {
    expect(PlaylistSchema.safeParse({ ...playlist, name: '' }).success).toBe(false);
  });

  it('từ chối tên dài hơn 100 ký tự', () => {
    expect(PlaylistSchema.safeParse({ ...playlist, name: 'a'.repeat(101) }).success).toBe(false);
  });
});

describe('UserStateSchema', () => {
  it('chấp nhận trạng thái rỗng', () => {
    const state = { version: 1, updatedAt: NOW, playlists: [], favoriteIds: [] };
    expect(UserStateSchema.safeParse(state).success).toBe(true);
  });
});

describe('ListeningRecordSchema', () => {
  const validRecord = {
    trackId: 'track_1',
    title: 'Bài Hát',
    artist: 'Nghệ Sĩ',
    durationSec: 180,
    listenedSec: 120,
    timestamp: 1234567890,
  };

  it('chấp nhận bản ghi hợp lệ', () => {
    expect(ListeningRecordSchema.safeParse(validRecord).success).toBe(true);
  });

  it('giữ lại các trường mở rộng trong tương lai nhờ .passthrough()', () => {
    const withExtra = { ...validRecord, futureField: 'extra_value', deviceId: 'iphone_16' };
    const parsed = ListeningRecordSchema.parse(withExtra);
    expect(parsed).toHaveProperty('futureField', 'extra_value');
    expect(parsed).toHaveProperty('deviceId', 'iphone_16');
  });

  it('từ chối khi thiếu trường bắt buộc', () => {
    const withoutTitle: Record<string, unknown> = { ...validRecord };
    delete withoutTitle.title;
    expect(ListeningRecordSchema.safeParse(withoutTitle).success).toBe(false);
  });
});
