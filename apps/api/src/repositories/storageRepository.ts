import type { Library, Health, Overrides, UserState } from '@music-app/shared';
import { LibrarySchema, OverridesSchema, UserStateSchema } from '@music-app/shared';
import type { IStorageRepository, RangeOption, StorageObject, AudioInfo } from '../types';

// In-memory key cache để giảm thiểu tối đa các yêu cầu Class A bucket.list khi tua (seek) và phát nhạc
export const audioKeyCache = new Map<string, AudioInfo>();

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

  async getAudioInfo(id: string): Promise<AudioInfo | null> {
    const cached = audioKeyCache.get(id);
    if (cached) return cached;

    // 1. Tối ưu cực đại: Thử trực tiếp các định dạng phổ biến (.mp3, .m4a, .flac) bằng bucket.head
    // Direct head nhanh gấp 10-15 lần bucket.list (chỉ ~30ms so với 400-600ms của bucket.list scan)
    if (typeof this.bucket.head === 'function') {
      const directExtensions = ['.mp3', '.m4a', '.flac'];
      for (const ext of directExtensions) {
        try {
          const head = await this.bucket.head(`music/${id}${ext}`);
          if (head) {
            const info: AudioInfo = {
              key: head.key,
              totalSize: head.size,
              contentType:
                head.httpMetadata?.contentType ||
                (ext === '.m4a' ? 'audio/mp4' : ext === '.flac' ? 'audio/flac' : 'audio/mpeg'),
              etag: head.httpEtag,
            };
            audioKeyCache.set(id, info);
            return info;
          }
        } catch {
          // Bỏ qua lỗi head và thử tiếp định dạng khác
        }
      }
    }

    // 2. Fallback: Nếu không khớp các đuôi phổ biến hoặc môi trường mock không có head, mới gọi bucket.list
    const listResult = await this.bucket.list({ prefix: `music/${id}`, limit: 1 });
    const target = listResult.objects[0];
    if (!target) return null;

    const info: AudioInfo = {
      key: target.key,
      totalSize: target.size,
      contentType: target.httpMetadata?.contentType || 'audio/mpeg',
      etag: target.httpEtag,
    };
    audioKeyCache.set(id, info);
    return info;
  }

  async getAudioStream(
    id: string,
    range?: RangeOption
  ): Promise<{ object: StorageObject; totalSize: number } | null> {
    const info = await this.getAudioInfo(id);
    if (!info) return null;

    // Lấy object từ R2 với range (nếu có)
    const r2Range = range
      ? range.offset !== undefined && range.length !== undefined
        ? { offset: range.offset, length: range.length }
        : range.suffix !== undefined
          ? { suffix: range.suffix }
          : undefined
      : undefined;

    let object = await this.bucket.get(info.key, r2Range ? { range: r2Range } : undefined);

    // Fallback nếu cache cũ không còn khớp trên R2
    if (!object) {
      audioKeyCache.delete(id);
      const freshInfo = await this.getAudioInfo(id);
      if (!freshInfo) return null;
      object = await this.bucket.get(freshInfo.key, r2Range ? { range: r2Range } : undefined);
    }

    if (!object) return null;

    return {
      totalSize: info.totalSize,
      object: {
        body: object.body,
        size: object.size,
        etag: object.httpEtag,
        contentType: object.httpMetadata?.contentType || info.contentType || 'audio/mpeg',
        range: object.range,
      },
    };
  }

  async getCover(id: string): Promise<StorageObject | null> {
    const key = `covers/${id}.jpg`;
    let object = await this.bucket.get(key);
    if (!object) {
      // Fallback: nếu không có covers/<id>.jpg, tra cứu library.json để lấy albumId hoặc track.cover
      try {
        const libData = await this.getLibrary();
        if (libData?.library) {
          const track = libData.library.tracks.find((t) => t.id === id);
          if (track) {
            const match = track.cover?.match(/[0-9a-fA-F]{12}/);
            const altId = match && match[0] !== id ? match[0] : (track.albumId !== id ? track.albumId : undefined);
            if (altId) {
              object = await this.bucket.get(`covers/${altId}.jpg`);
            }
          } else {
            const album = libData.library.albums.find((a) => a.id === id);
            if (album) {
              const match = album.cover?.match(/[0-9a-fA-F]{12}/);
              const altId = match && match[0] !== id ? match[0] : (album.trackIds?.[0] !== id ? album.trackIds?.[0] : undefined);
              if (altId) {
                object = await this.bucket.get(`covers/${altId}.jpg`);
              }
            }
          }
        }
      } catch {
        // bỏ qua lỗi fallback
      }
    }

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


