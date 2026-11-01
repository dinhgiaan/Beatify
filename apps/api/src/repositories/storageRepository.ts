import type { Library, Health, Overrides, UserState } from '@music-app/shared';
import { LibrarySchema, OverridesSchema, UserStateSchema } from '@music-app/shared';
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
    if (!object) return { version: 1, tracks: {}, artistAliases: {} };

    try {
      const data = await object.json();
      const parsed = OverridesSchema.safeParse(data);
      return parsed.success ? parsed.data : { version: 1, tracks: {}, artistAliases: {} };
    } catch {
      return { version: 1, tracks: {}, artistAliases: {} };
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

  async getLyrics(
    id: string
  ): Promise<{ content: string; source: 'manual' | 'auto'; format: 'lrc' | 'txt' } | null> {
    // 1. Ưu tiên bản sửa thủ công: lyrics-manual/{id}.lrc hoặc .txt
    const manualLrc = await this.bucket.get(`lyrics-manual/${id}.lrc`);
    if (manualLrc) {
      const content = await manualLrc.text();
      return { content, source: 'manual', format: 'lrc' };
    }
    const manualTxt = await this.bucket.get(`lyrics-manual/${id}.txt`);
    if (manualTxt) {
      const content = await manualTxt.text();
      return { content, source: 'manual', format: 'txt' };
    }

    // 2. Dự phòng bản tự động: lyrics/{id}.lrc hoặc .txt
    const autoLrc = await this.bucket.get(`lyrics/${id}.lrc`);
    if (autoLrc) {
      const content = await autoLrc.text();
      return { content, source: 'auto', format: 'lrc' };
    }
    const autoTxt = await this.bucket.get(`lyrics/${id}.txt`);
    if (autoTxt) {
      const content = await autoTxt.text();
      return { content, source: 'auto', format: 'txt' };
    }

    return null;
  }

  async getUserState(): Promise<UserState | null> {
    const object = await this.bucket.get('_meta/state.json');
    if (!object) return null;
    try {
      const data = await object.json();
      const parsed = UserStateSchema.safeParse(data);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async saveUserState(state: UserState): Promise<void> {
    await this.bucket.put('_meta/state.json', JSON.stringify(state, null, 2), {
      httpMetadata: { contentType: 'application/json' },
    });
  }
}


