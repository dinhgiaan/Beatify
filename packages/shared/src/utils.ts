import type { Library, Track, UpdateTrack } from './schemas';

/**
 * Chuẩn hóa văn bản: bỏ dấu tiếng Việt, chuyển chữ thường, loại bỏ khoảng trắng thừa
 * Dùng tính albumId, tìm kiếm bài hát bỏ dấu, gộp nghệ sĩ
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, () => 'd')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Kiểm tra id bài hát hợp lệ (chuẩn hex 12 ký tự sha1)
 */
export function isValidTrackId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{12}$/i.test(id) || id.startsWith('custom-');
}

/**
 * Kiểm tra id album hợp lệ (chuẩn hex 12 ký tự sha1)
 */
export function isValidAlbumId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{12}$/i.test(id);
}

/**
 * Tính số byte UTF-8 của chuỗi (thuần toán học, không phụ thuộc DOM hay Node)
 */
export function utf8ByteLength(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // surrogate pair
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * Cập nhật thông tin bài hát trong đối tượng Library (bất biến - immutable)
 */
export function applyTrackUpdate(
  library: Library,
  id: string,
  updates: UpdateTrack
): { library: Library; updatedTrack: Track | null } {
  let updatedTrack: Track | null = null;
  const newTracks = library.tracks.map((t) => {
    if (t.id === id) {
      updatedTrack = {
        ...t,
        ...(updates.title !== undefined ? { title: updates.title } : {}),
        ...(updates.artist !== undefined ? { artist: updates.artist } : {}),
        ...(updates.album !== undefined ? { album: updates.album } : {}),
        ...(updates.year !== undefined ? { year: updates.year } : {}),
      };
      return updatedTrack;
    }
    return t;
  });

  if (!updatedTrack) {
    return { library, updatedTrack: null };
  }

  return {
    library: {
      ...library,
      tracks: newTracks,
      generatedAt: new Date().toISOString(),
    },
    updatedTrack,
  };
}

/**
 * Xóa bài hát khỏi Library và các album tương ứng (bất biến - immutable)
 */
export function applyTrackDeletion(
  library: Library,
  id: string
): { library: Library; deletedTrack: Track | null } {
  const existing = library.tracks.find((t) => t.id === id);
  if (!existing) {
    return { library, deletedTrack: null };
  }

  const newTracks = library.tracks.filter((t) => t.id !== id);
  const newAlbums = library.albums
    .map((alb) => ({
      ...alb,
      trackIds: alb.trackIds.filter((tid) => tid !== id),
    }))
    .filter((alb) => alb.trackIds.length > 0);

  return {
    library: {
      ...library,
      tracks: newTracks,
      albums: newAlbums,
      generatedAt: new Date().toISOString(),
    },
    deletedTrack: existing,
  };
}

/**
 * Danh sách các giá trị đại diện cho bài hát không có album thực thụ (Single / Đĩa đơn / Chưa rõ)
 */
export const NON_ALBUM_NAMES = [
  'single',
  'singles',
  'đĩa đơn',
  'dia don',
  'unknown album',
  'unknown',
  'chưa rõ album',
  'chua ro album',
] as const;

/**
 * Kiểm tra xem một chuỗi tên album có phải là album thực thụ hay không
 * Trả về true nếu là album thực thụ (không rỗng, không phải Single/Unknown)
 */
export function isRealAlbum(albumName?: string | null): boolean {
  if (!albumName || typeof albumName !== 'string') return false;
  const trimmed = albumName.trim().toLowerCase();
  if (!trimmed) return false;
  return !NON_ALBUM_NAMES.includes(trimmed as (typeof NON_ALBUM_NAMES)[number]);
}

/**
 * Định dạng dòng phụ đề hiển thị nghệ sĩ và album:
 * Nếu có album thực thụ: "Nghệ sĩ · Tên album"
 * Nếu không có album: "Nghệ sĩ"
 */
export function formatArtistAndAlbum(artist: string, albumName?: string | null): string {
  const safeArtist = (artist || '').trim();
  if (isRealAlbum(albumName)) {
    return `${safeArtist} · ${albumName!.trim()}`;
  }
  return safeArtist;
}


