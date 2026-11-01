import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import {
  batchRestoreFromTrash,
  batchPurgeFromTrash,
} from './overridesManager';

vi.mock('fs/promises');
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

describe('Kiểm thử Thùng rác hàng loạt (batchRestoreFromTrash & batchPurgeFromTrash)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. batchRestoreFromTrash khôi phục chính xác các ID được chỉ định', async () => {
    const mockData = {
      version: 1,
      tracks: {
        track_1: { hidden: true, deletedAt: '2026-11-01T00:00:00.000Z' },
        track_2: { hidden: true, deletedAt: '2026-11-01T00:00:00.000Z' },
        track_3: { hidden: false },
      },
      artistAliases: {},
    };

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockData));
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    // Khôi phục chỉ track_1
    const result = await batchRestoreFromTrash(['track_1']);

    expect(result.tracks['track_1']?.hidden).toBe(false);
    expect(result.tracks['track_1']?.deletedAt).toBeUndefined();
    // track_2 vẫn ẩn
    expect(result.tracks['track_2']?.hidden).toBe(true);
  });

  it('2. batchRestoreFromTrash khôi phục TOÀN BỘ bài trong thùng rác khi không truyền ID', async () => {
    const mockData = {
      version: 1,
      tracks: {
        track_1: { hidden: true, deletedAt: '2026-11-01T00:00:00.000Z' },
        track_2: { hidden: true, deletedAt: '2026-11-01T00:00:00.000Z' },
      },
      artistAliases: {},
    };

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockData));
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    const result = await batchRestoreFromTrash();

    expect(result.tracks['track_1']?.hidden).toBe(false);
    expect(result.tracks['track_1']?.deletedAt).toBeUndefined();
    expect(result.tracks['track_2']?.hidden).toBe(false);
    expect(result.tracks['track_2']?.deletedAt).toBeUndefined();
  });

  it('3. batchPurgeFromTrash đánh dấu purged vĩnh viễn danh sách được chỉ định hoặc toàn bộ', async () => {
    const mockData = {
      version: 1,
      tracks: {
        track_1: { hidden: true, deletedAt: '2026-11-01T00:00:00.000Z' },
        track_2: { hidden: true, deletedAt: '2026-11-01T00:00:00.000Z' },
      },
      artistAliases: {},
    };

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockData));
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    const result = await batchPurgeFromTrash(['track_2']);

    expect(result.tracks['track_2']?.purged).toBe(true);
    expect(result.tracks['track_2']?.purgedAt).toBeDefined();
    expect(result.tracks['track_1']?.purged).toBeUndefined();
  });
});
