import type { Library, Health, Overrides } from '@music-app/shared';
import { LibrarySchema, OverridesSchema } from '@music-app/shared';
import type { IStorageRepository, RangeOption, StorageObject } from '../types';

export class R2StorageRepository implements IStorageRepository {
  constructor(private readonly bucket: R2Bucket) {}

  async getLibrary(): Promise<{ library: Library; etag: string } | null> {
    const object = await this.bucket.get('library.json');
    if (!object) return null;

    const data = await object.json();
    const library = LibrarySchema.parse(data);
    return {
      library,
      etag: object.httpEtag,
    };
  }

  async saveLibrary(library: Library): Promise<void> {
    const jsonString = JSON.stringify(library);
    await this.bucket.put('library.json', jsonString, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        trackCount: library.tracks.length.toString(),
        albumCount: library.albums.length.toString(),
        generatedAt: library.generatedAt,
        dataVersion: '1',
      },
    });
  }

  async getHealth(): Promise<Health | null> {
    const meta = await this.bucket.head('library.json');
    if (!meta) return null;

    return {
      status: 'ok',
      trackCount: parseInt(meta.customMetadata?.trackCount ?? '0', 10) || 0,
      albumCount: parseInt(meta.customMetadata?.albumCount ?? '0', 10) || 0,
      generatedAt: meta.customMetadata?.generatedAt,
      dataVersion: parseInt(meta.customMetadata?.dataVersion ?? '1', 10) || 1,
    };
  }

  async getAudioStream(
    id: string,
    range?: RangeOption
  ): Promise<{ object: StorageObject; totalSize: number } | null> {
    // Tìm key âm thanh tương ứng trong thư mục music/
    const listResult = await this.bucket.list({ prefix: `music/${id}`, limit: 1 });
    const target = listResult.objects[0];
    if (!target) return null;

    const key = target.key;
    const totalSize = target.size;

    // Lấy object từ R2 với range (nếu có)
    const r2Range = range
      ? range.offset !== undefined && range.length !== undefined
        ? { offset: range.offset, length: range.length }
        : range.suffix !== undefined
          ? { suffix: range.suffix }
          : undefined
      : undefined;

    const object = await this.bucket.get(key, r2Range ? { range: r2Range } : undefined);
    if (!object) return null;

    return {
      totalSize,
      object: {
        body: object.body,
        size: object.size,
        etag: object.httpEtag,
        contentType: object.httpMetadata?.contentType || 'audio/mpeg',
        range: object.range,
      },
    };
  }

  async getCover(albumId: string): Promise<StorageObject | null> {
    const key = `covers/${albumId}.jpg`;
    const object = await this.bucket.get(key);
    if (!object) return null;

    return {
      body: object.body,
      size: object.size,
      etag: object.httpEtag,
      contentType: 'image/jpeg',
    };
  }

  async getOverrides(): Promise<Overrides> {
    const object = await this.bucket.get('_meta/overrides.json');
    if (!object) return { version: 1, tracks: {} };

    try {
      const data = await object.json();
      const parsed = OverridesSchema.safeParse(data);
      return parsed.success ? parsed.data : { version: 1, tracks: {} };
    } catch {
      return { version: 1, tracks: {} };
    }
  }

  async saveOverrides(overrides: Overrides): Promise<void> {
    await this.bucket.put('_meta/overrides.json', JSON.stringify(overrides, null, 2), {
      httpMetadata: { contentType: 'application/json' },
    });
  }

  async saveLyrics(id: string, content: string): Promise<void> {
    await this.bucket.put(`lyrics-manual/${id}.lrc`, content, {
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    });
  }
}

