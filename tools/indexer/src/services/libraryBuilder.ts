import crypto from 'crypto';
import type { Library, Album, Track } from '@music-app/shared';
import { LibrarySchema, interleaveTracksByArtist } from '@music-app/shared';
import type { ScannedTrack } from './scanner';

/**
 * Xây dựng đối tượng Library hoàn chỉnh từ danh sách các bài hát đã quét
 */
export function buildLibrary(scannedTracks: ScannedTrack[]): {
  library: Library;
  coversByAlbumId: Map<string, Buffer>;
  coversByTrackId: Map<string, Buffer>;
} {
  const tracks: Track[] = [];
  const coversByAlbumId = new Map<string, Buffer>();
  const coversByTrackId = new Map<string, Buffer>();
  const albumsMap = new Map<string, { title: string; artist: string; year?: number; trackIds: string[] }>();

  for (const item of scannedTracks) {
    const albumId = item.track.albumId || 'unknown-album';
    if (item.coverBuffer) {
      coversByTrackId.set(item.track.id, item.coverBuffer);
      if (!coversByAlbumId.has(albumId)) {
        coversByAlbumId.set(albumId, item.coverBuffer);
      }
      // Đảm bảo mỗi bài hát có ảnh bìa độc lập theo ID riêng
      item.track.cover = item.track.cover || `covers/${item.track.id}.jpg`;
      item.track.coverVersion = crypto.createHash('sha1').update(item.coverBuffer).digest('hex').slice(0, 8);
    }

    tracks.push(item.track);

    if (!albumsMap.has(albumId)) {
      albumsMap.set(albumId, {
        title: item.track.album || 'Single',
        artist: item.track.artist,
        year: item.track.year,
        trackIds: [],
      });
    }

    albumsMap.get(albumId)?.trackIds.push(item.track.id);
  }

  const albums: Album[] = [];
  for (const [id, data] of albumsMap.entries()) {
    const albumCoverBuf = coversByAlbumId.get(id);
    albums.push({
      id,
      title: data.title,
      artist: data.artist,
      year: data.year,
      cover: albumCoverBuf ? `covers/${id}.jpg` : undefined,
      coverVersion: albumCoverBuf ? crypto.createHash('sha1').update(albumCoverBuf).digest('hex').slice(0, 8) : undefined,
      trackIds: data.trackIds,
    });
  }

  // Tự động phân bổ đan xen các nghệ sĩ (Smart Interleaving) để thư viện không bị dồn cục 1 ca sĩ
  const balancedTracks = interleaveTracksByArtist(tracks);

  const rawLibrary = {
    version: 1 as const,
    generatedAt: new Date().toISOString(),
    tracks: balancedTracks,
    albums,
  };

  const library = LibrarySchema.parse(rawLibrary);

  return {
    library,
    coversByAlbumId,
    coversByTrackId,
  };
}
