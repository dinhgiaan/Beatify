import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { youtubeJobRunner } from './youtubeJobRunner';
import type { YoutubeMusicDownloadRecord } from '@music-app/shared';

type MockRunner = {
  getDownloads: (limit?: number) => Promise<YoutubeMusicDownloadRecord[]>;
  saveDownloads: (list: YoutubeMusicDownloadRecord[]) => Promise<void>;
};

describe('Kiểm thử youtubeJobRunner.verifyDownloads — Khắc phục lỗi đối chiếu R2 Key', () => {
  const dummyAudioName = 'test_track.m4a';
  const dummyTrackId = '3a8c7f9b012d';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Đánh dấu uploadedToR2 = true khi key music/<trackId>.m4a có trong R2 uploaded keys', async () => {
    const mockRecord: YoutubeMusicDownloadRecord = {
      id: 'job_test_1',
      jobId: 'job_test',
      videoId: 'v123',
      sourceUrl: 'https://youtube.com/watch?v=v123',
      title: 'Test Song',
      artist: 'Test Artist',
      album: 'Singles',
      format: 'm4a',
      libraryRootPath: 'D:\\dummy_music',
      relativeFilePath: `Test Artist\\Singles\\${dummyAudioName}`,
      trackId: dummyTrackId,
      status: 'completed',
      fileExists: true,
      uploadedToR2: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      durationMismatchWarning: false,
    };

    const runner = youtubeJobRunner as unknown as MockRunner;
    vi.spyOn(runner, 'getDownloads').mockResolvedValue([mockRecord]);
    const saveSpy = vi.spyOn(runner, 'saveDownloads').mockResolvedValue(undefined);

    // Mock R2 keys trả về từ Cloudflare
    const r2Keys = new Set<string>([
      `music/${dummyTrackId}.m4a`,
      'music/another_hash.m4a',
    ]);

    const results = await youtubeJobRunner.verifyDownloads(r2Keys);

    expect(results).toHaveLength(1);
    const item = results[0];
    expect(item).toBeDefined();
    expect(item?.uploadedToR2).toBe(true);
    expect(item?.trackId).toBe(dummyTrackId);
    expect(saveSpy).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ uploadedToR2: true })
    ]));
  });

  it('2. Đánh dấu uploadedToR2 = false khi key R2 không chứa trackId của bài hát', async () => {
    const mockRecord: YoutubeMusicDownloadRecord = {
      id: 'job_test_2',
      jobId: 'job_test',
      videoId: 'v456',
      sourceUrl: 'https://youtube.com/watch?v=v456',
      title: 'Unsynced Song',
      artist: 'Test Artist',
      album: 'Singles',
      format: 'm4a',
      libraryRootPath: 'D:\\dummy_music',
      relativeFilePath: `Test Artist\\Singles\\unsynced.m4a`,
      trackId: 'unmatched999',
      status: 'completed',
      fileExists: true,
      uploadedToR2: true, // Giả sử trước đó ghi true nhưng thực tế trên R2 không có
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      durationMismatchWarning: false,
    };

    const runner = youtubeJobRunner as unknown as MockRunner;
    vi.spyOn(runner, 'getDownloads').mockResolvedValue([mockRecord]);
    vi.spyOn(runner, 'saveDownloads').mockResolvedValue(undefined);

    const r2Keys = new Set<string>([
      'music/different_hash.m4a',
    ]);

    const results = await youtubeJobRunner.verifyDownloads(r2Keys);

    expect(results).toHaveLength(1);
    const item = results[0];
    expect(item).toBeDefined();
    expect(item?.uploadedToR2).toBe(false);
  });

  it('3. Giữ nguyên trạng thái uploadedToR2 khi không truyền r2UploadedKeys', async () => {
    const mockRecord: YoutubeMusicDownloadRecord = {
      id: 'job_test_3',
      jobId: 'job_test',
      videoId: 'v789',
      sourceUrl: 'https://youtube.com/watch?v=v789',
      title: 'Offline Check Song',
      artist: 'Test Artist',
      album: 'Singles',
      format: 'm4a',
      libraryRootPath: 'D:\\dummy_music',
      relativeFilePath: `Test Artist\\Singles\\offline.m4a`,
      status: 'completed',
      fileExists: false,
      uploadedToR2: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      durationMismatchWarning: false,
    };

    const runner = youtubeJobRunner as unknown as MockRunner;
    vi.spyOn(runner, 'getDownloads').mockResolvedValue([mockRecord]);
    vi.spyOn(runner, 'saveDownloads').mockResolvedValue(undefined);

    const results = await youtubeJobRunner.verifyDownloads(undefined);

    expect(results).toHaveLength(1);
    const item = results[0];
    expect(item).toBeDefined();
    expect(item?.uploadedToR2).toBe(true);
  });
});
