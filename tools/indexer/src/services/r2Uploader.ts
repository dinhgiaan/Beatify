import fs from 'fs/promises';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { Library, UserState, Overrides } from '@music-app/shared';
import { UserStateSchema } from '@music-app/shared';
import type { IndexerConfig } from '../config';

export class R2Uploader {
  private client: S3Client;
  private bucket: string;

  constructor(config: IndexerConfig) {
    this.bucket = config.R2_BUCKET;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.R2_ACCESS_KEY_ID,
        secretAccessKey: config.R2_SECRET_ACCESS_KEY,
      },
      maxAttempts: 3,
    });
  }

  async uploadAudio(key: string, filePath: string): Promise<void> {
    const fileBuffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType =
      ext === '.m4a'
        ? 'audio/mp4'
        : ext === '.flac'
          ? 'audio/flac'
          : 'audio/mpeg';

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
      })
    );
  }

  async uploadCover(albumId: string, buffer: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: `covers/${albumId}.jpg`,
        Body: buffer,
        ContentType: 'image/jpeg',
      })
    );
  }

  async uploadLyrics(key: string, content: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: Buffer.from(content, 'utf-8'),
        ContentType: 'text/plain; charset=utf-8',
      })
    );
  }

  async uploadLibrary(library: Library): Promise<void> {
    const jsonString = JSON.stringify(library, null, 2);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: 'library.json',
        Body: Buffer.from(jsonString, 'utf-8'),
        ContentType: 'application/json',
        Metadata: {
          trackCount: library.tracks.length.toString(),
          albumCount: library.albums.length.toString(),
          generatedAt: library.generatedAt,
          dataVersion: library.version.toString(),
        },
      })
    );
  }

  async uploadOverrides(overrides: Overrides): Promise<void> {
    const jsonString = JSON.stringify(overrides, null, 2);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: '_meta/overrides.json',
        Body: Buffer.from(jsonString, 'utf-8'),
        ContentType: 'application/json',
      })
    );
  }

  async getUserState(): Promise<UserState | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: '_meta/state.json',
        })
      );
      if (!res.Body) return null;
      const str = await res.Body.transformToString();
      const parsed = UserStateSchema.safeParse(JSON.parse(str));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async saveUserState(state: UserState): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: '_meta/state.json',
        Body: Buffer.from(JSON.stringify(state, null, 2), 'utf-8'),
        ContentType: 'application/json',
      })
    );
  }

  async getExistingTrackKeys(): Promise<Set<string>> {
    try {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: 'music/',
        })
      );
      return new Set((res.Contents || []).map((o) => o.Key || '').filter(Boolean));
    } catch {
      return new Set<string>();
    }
  }
}
