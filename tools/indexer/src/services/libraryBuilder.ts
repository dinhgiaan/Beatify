import type { Library, Album, Track } from '@music-app/shared';
import { LibrarySchema } from '@music-app/shared';
import type { ScannedTrack } from './scanner';

/**
 * Xây dựng đối tượng Library hoàn chỉnh từ danh sách các bài hát đã quét
 */
export function buildLibrary(scannedTracks: ScannedTrack[]): {
  library: Library;
  coversByAlbumId: Map<string, Buffer>;
} {
  const tracks: Track[] = [];
  const coversByAlbumId = new Map<string, Buffer>();
  const albumsMap = new Map<string, { title: string; artist: string; year?: number; trackIds: string[] }>();

  for (const item of scannedTracks) {
    tracks.push(item.track);

    const albumId = item.track.albumId || 'unknown-album';
    if (item.coverBuffer && !coversByAlbumId.has(albumId)) {
      coversByAlbumId.set(albumId, item.coverBuffer);
    }

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
    albums.push({
      id,
      title: data.title,
      artist: data.artist,
      year: data.year,
      cover: coversByAlbumId.has(id) ? `covers/${id}.jpg` : undefined,
      trackIds: data.trackIds,
    });
  }

  const rawLibrary = {
    version: 1 as const,
    generatedAt: new Date().toISOString(),
    tracks,
    albums,
  };

  const library = LibrarySchema.parse(rawLibrary);

  return {
    library,
    coversByAlbumId,
  };
}
