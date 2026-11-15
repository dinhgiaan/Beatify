import { describe, it, expect, vi, beforeEach } from 'vitest';
import { R2StorageRepository, audioKeyCache } from './storageRepository';

describe('R2StorageRepository - audioKeyCache & Stream Optimization', () => {
  beforeEach(() => {
    audioKeyCache.clear();
  });

  it('gọi bucket.list trong lần đầu tiên, và tái sử dụng cache cho các lần sau mà không gọi bucket.list', async () => {
    const listMock = vi.fn().mockResolvedValue({
      objects: [{ key: 'music/123.m4a', size: 1048576 }],
    });
    const getMock = vi.fn().mockResolvedValue({
      body: 'stream-data',
      size: 1048576,
      httpEtag: '"etag123"',
      httpMetadata: { contentType: 'audio/mp4' },
      range: undefined,
    });

    const mockBucket = {
      list: listMock,
      get: getMock,
    } as unknown as R2Bucket;

    const repo = new R2StorageRepository(mockBucket);

    // Request lần 1: Chưa có trong cache -> phải gọi list()
    const res1 = await repo.getAudioStream('123');
    expect(res1).not.toBeNull();
    expect(listMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith('music/123.m4a', undefined);
    expect(audioKeyCache.get('123')).toEqual({
      key: 'music/123.m4a',
      totalSize: 1048576,
      contentType: 'audio/mpeg',
      etag: undefined,
    });

    // Request lần 2 (tua bài/seek): Đã có trong cache -> KHÔNG được gọi list() nữa
    const res2 = await repo.getAudioStream('123', { offset: 500, length: 1000 });
    expect(res2).not.toBeNull();
    expect(listMock).toHaveBeenCalledTimes(1); // Vẫn chỉ là 1 lần, không tăng!
    expect(getMock).toHaveBeenCalledWith('music/123.m4a', { range: { offset: 500, length: 1000 } });
  });

  it('fallback list lại nếu cache cũ bị lệch và get trả về null', async () => {
    // Giả sử cache cũ lưu key nhưng file đã bị đổi trên R2
    audioKeyCache.set('456', { key: 'music/456.mp3', totalSize: 2000000 });

    const listMock = vi.fn().mockResolvedValue({
      objects: [{ key: 'music/456.m4a', size: 2100000 }],
    });

    // Lần 1 get bằng key cũ thất bại (null), lần 2 get bằng key mới thành công
    const getMock = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        body: 'stream-data',
        size: 2100000,
        httpEtag: '"etag456"',
        httpMetadata: { contentType: 'audio/mp4' },
      });

    const mockBucket = {
      list: listMock,
      get: getMock,
    } as unknown as R2Bucket;

    const repo = new R2StorageRepository(mockBucket);

    const res = await repo.getAudioStream('456');
    expect(res).not.toBeNull();
    // listMock được gọi lại để tự sửa cache
    expect(listMock).toHaveBeenCalledTimes(1);
    expect(audioKeyCache.get('456')?.key).toBe('music/456.m4a');
  });

  it('ưu tiên dùng direct bucket.head khi có sẵn, không gọi bucket.list', async () => {
    const headMock = vi.fn().mockImplementation((key: string) => {
      if (key === 'music/fast123.mp3') {
        return Promise.resolve({
          key: 'music/fast123.mp3',
          size: 5000000,
          httpEtag: '"etagfast"',
          httpMetadata: { contentType: 'audio/mpeg' },
        });
      }
      return Promise.resolve(null);
    });
    const listMock = vi.fn();
    const getMock = vi.fn().mockResolvedValue({
      body: 'fast-stream',
      size: 5000000,
      httpEtag: '"etagfast"',
      httpMetadata: { contentType: 'audio/mpeg' },
    });

    const mockBucket = {
      head: headMock,
      list: listMock,
      get: getMock,
    } as unknown as R2Bucket;

    const repo = new R2StorageRepository(mockBucket);
    const res = await repo.getAudioStream('fast123');

    expect(res).not.toBeNull();
    expect(headMock).toHaveBeenCalledWith('music/fast123.mp3');
    // Hoàn toàn không gọi listMock!
    expect(listMock).not.toHaveBeenCalled();
    expect(audioKeyCache.get('fast123')?.key).toBe('music/fast123.mp3');
  });
});
