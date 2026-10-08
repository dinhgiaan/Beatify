import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  isValidTrackId,
  isValidAlbumId,
  utf8ByteLength,
  applyTrackUpdate,
  applyTrackDeletion,
} from './utils';
import { HealthSchema, type Library } from './schemas';

describe('normalizeText', () => {
  it('loại bỏ dấu tiếng Việt và chuẩn hóa chữ thường', () => {
    expect(normalizeText('Sơn Tùng M-TP')).toBe('son tung m-tp');
    expect(normalizeText('Đen Vâu')).toBe('den vau');
    expect(normalizeText('  VŨ.   ')).toBe('vu.');
    expect(normalizeText('Áo Dài')).toBe('ao dai');
  });

  it('xử lý chuỗi rỗng an toàn', () => {
    expect(normalizeText('')).toBe('');
  });
});

describe('id validation', () => {
  it('xác thực trackId', () => {
    expect(isValidTrackId('a1b2c3d4e5f6')).toBe(true);
    expect(isValidTrackId('0123456789ab')).toBe(true);
    expect(isValidTrackId('custom-12345')).toBe(true);
    expect(isValidTrackId('invalid_id')).toBe(false);
    expect(isValidTrackId('123')).toBe(false);
  });

  it('xác thực albumId', () => {
    expect(isValidAlbumId('a1b2c3d4e5f6')).toBe(true);
    expect(isValidAlbumId('xyz123')).toBe(false);
  });
});

describe('utf8ByteLength', () => {
  it('tính đúng số byte utf8', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('Việt Nam')).toBe(10);
  });
});

describe('HealthSchema', () => {
  it('validate đúng định dạng health response', () => {
    const valid = {
      status: 'ok',
      trackCount: 42,
      albumCount: 5,
      generatedAt: '2026-10-08T00:00:00Z',
    };
    expect(() => HealthSchema.parse(valid)).not.toThrow();
  });
});

describe('applyTrackUpdate & applyTrackDeletion', () => {
  const sampleLibrary: Library = {
    version: 1,
    generatedAt: '2026-10-08T00:00:00.000Z',
    tracks: [
      {
        id: 'a1b2c3d4e5f6',
        title: 'Cơn Mưa Ngang Qua',
        artist: 'Sơn Tùng M-TP',
        album: 'M-TP',
        albumId: 'b1b2c3d4e5f6',
        duration: 210,
        file: 'music/a1b2c3d4e5f6.mp3',
        storage: 'r2',
      },
    ],
    albums: [
      {
        id: 'b1b2c3d4e5f6',
        title: 'M-TP',
        artist: 'Sơn Tùng M-TP',
        trackIds: ['a1b2c3d4e5f6'],
      },
    ],
  };

  it('cập nhật thành công thông tin bài hát', () => {
    const { library: updatedLib, updatedTrack } = applyTrackUpdate(
      sampleLibrary,
      'a1b2c3d4e5f6',
      { title: 'Cơn Mưa Ngang Qua (Remix)', year: 2024 }
    );

    expect(updatedTrack).not.toBeNull();
    expect(updatedTrack?.title).toBe('Cơn Mưa Ngang Qua (Remix)');
    expect(updatedTrack?.year).toBe(2024);
    expect(updatedTrack?.artist).toBe('Sơn Tùng M-TP');
    expect(updatedLib.tracks[0]?.title).toBe('Cơn Mưa Ngang Qua (Remix)');
  });

  it('trả về null nếu không tìm thấy bài hát khi cập nhật', () => {
    const { updatedTrack } = applyTrackUpdate(sampleLibrary, 'non-existent', {
      title: 'Mới',
    });
    expect(updatedTrack).toBeNull();
  });

  it('xóa thành công bài hát khỏi library và album', () => {
    const { library: updatedLib, deletedTrack } = applyTrackDeletion(
      sampleLibrary,
      'a1b2c3d4e5f6'
    );

    expect(deletedTrack).not.toBeNull();
    expect(deletedTrack?.id).toBe('a1b2c3d4e5f6');
    expect(updatedLib.tracks.length).toBe(0);
    // Album bị trống trackIds nên cũng được lọc bỏ
    expect(updatedLib.albums.length).toBe(0);
  });

  it('trả về null nếu không tìm thấy bài hát khi xóa', () => {
    const { deletedTrack } = applyTrackDeletion(sampleLibrary, 'non-existent');
    expect(deletedTrack).toBeNull();
  });
});

