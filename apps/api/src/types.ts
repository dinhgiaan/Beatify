import type { Library, Health, Overrides, UserState } from '@music-app/shared';

export interface Env {
  MUSIC_BUCKET: R2Bucket;
  API_TOKEN?: string;
}

export interface RangeOption {
  offset?: number;
  length?: number;
  suffix?: number;
}

export interface StorageObjectMetadata {
  size: number;
  etag: string;
  contentType?: string;
  customMetadata?: Record<string, string>;
}

export interface StorageObject {
  body: ReadableStream;
  size: number;
  etag: string;
  contentType?: string;
  range?: R2Range;
}

export interface AudioInfo {
  key: string;
  totalSize: number;
  contentType?: string;
  etag?: string;
}

export interface IStorageRepository {
  getLibrary(): Promise<{ library: Library; etag: string } | null>;
  saveLibrary(library: Library): Promise<void>;
  getHealth(): Promise<Health | null>;
  getAudioInfo(id: string): Promise<AudioInfo | null>;
  getAudioStream(id: string, range?: RangeOption): Promise<{ object: StorageObject; totalSize: number } | null>;
  getCover(albumId: string): Promise<StorageObject | null>;
  getOverrides(): Promise<Overrides>;
  saveOverrides(overrides: Overrides): Promise<void>;
  saveLyrics(id: string, content: string): Promise<void>;
  getLyrics(id: string): Promise<{ content: string; source: 'manual' | 'auto'; format: 'lrc' | 'txt' } | null>;
  getUserState(): Promise<UserState | null>;
  saveUserState(state: UserState): Promise<void>;
}

