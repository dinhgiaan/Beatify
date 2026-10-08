import { describe, it, expect } from 'vitest';
import { buildLibrary } from './libraryBuilder';
import type { ScannedTrack } from './scanner';

describe('buildLibrary', () => {
  it('tạo đúng Library và gom nhóm Album', () => {
    const scannedTracks: ScannedTrack[] = [
      {
        track: {
          id: 'track1111111',
          title: 'Bài 1',
          artist: 'Ca sĩ A',
          album: 'Album 1',
          albumId: 'album1111111',
          duration: 180,
          file: 'music/track1111111.mp3',
          storage: 'r2',
        },
        filePath: 'D:/Music/bai1.mp3',
      },
      {
        track: {
          id: 'track2222222',
          title: 'Bài 2',
          artist: 'Ca sĩ A',
          album: 'Album 1',
          albumId: 'album1111111',
          duration: 200,
          file: 'music/track2222222.mp3',
          storage: 'r2',
        },
        filePath: 'D:/Music/bai2.mp3',
      },
    ];

    const { library } = buildLibrary(scannedTracks);

    expect(library.version).toBe(1);
    expect(library.tracks.length).toBe(2);
    expect(library.albums.length).toBe(1);
    expect(library.albums[0]?.title).toBe('Album 1');
    expect(library.albums[0]?.trackIds).toEqual(['track1111111', 'track2222222']);
  });
});
