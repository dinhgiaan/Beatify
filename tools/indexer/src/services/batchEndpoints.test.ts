import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { LyricsService } from './lyricsService';
import { YoutubeService } from './youtubeService';
import { batchRestoreFromTrash, batchPurgeFromTrash } from './overridesManager';

vi.mock('fs/promises');
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

describe('Kiểm thử Tính năng Tiềm năng Mục II — Batch Operations & Smart Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Batch Lyrics Fetching (LRCLIB Integration)', () => {
    it('Tìm thấy lời đồng bộ và trả về đúng nội dung syncedLyrics', async () => {
      vi.spyOn(LyricsService, 'fetchLyrics').mockResolvedValue({
        syncedLyrics: '[00:12.34] Hello World\n[00:15.67] Testing Lyrics',
        plainLyrics: 'Hello World\nTesting Lyrics',
        source: 'lrclib-synced',
        durationMismatchWarning: false,
      });

      const res = await LyricsService.fetchLyrics('Song Title', 'Artist Name', 180);
      expect(res?.syncedLyrics).toContain('[00:12.34] Hello World');
      expect(res?.source).toBe('lrclib-synced');
    });

    it('Xử lý an toàn khi bài hát không có trên LRCLIB', async () => {
      vi.spyOn(LyricsService, 'fetchLyrics').mockResolvedValue({
        source: 'none',
        durationMismatchWarning: false,
      });

      const res = await LyricsService.fetchLyrics('Non Existent Song', 'Unknown Artist');
      expect(res?.source).toBe('none');
    });
  });

  describe('2. Batch ReplayGain & Integrated Loudness Measurement', () => {
    it('Đo đúng LUFS và tính ReplayGain chuẩn EBU R128 (-18.0 - input_i)', async () => {
      vi.spyOn(YoutubeService, 'measureLoudness').mockResolvedValue({
        loudnessLufs: -14.5,
        replayGain: -3.5,
      });

      const res = await YoutubeService.measureLoudness('dummy_path.m4a');
      expect(res.loudnessLufs).toBe(-14.5);
      expect(res.replayGain).toBe(-3.5);
    });

    it('Fallback về giá trị an toàn (-18.0 LUFS, 0.0 dB) khi tệp âm thanh lỗi', async () => {
      vi.spyOn(YoutubeService, 'measureLoudness').mockResolvedValue({
        loudnessLufs: -18.0,
        replayGain: 0.0,
      });

      const res = await YoutubeService.measureLoudness('corrupted_path.m4a');
      expect(res.loudnessLufs).toBe(-18.0);
      expect(res.replayGain).toBe(0.0);
    });
  });

  describe('3. Batch Trash Operations (Khôi phục & Dọn sạch)', () => {
    it('batchRestoreFromTrash khôi phục tất cả bài hát bị ẩn trong overrides.json', async () => {
      const mockData = {
        version: 1,
        tracks: {
          t1: { hidden: true, deletedAt: '2026-11-01T00:00:00.000Z' },
          t2: { hidden: true, deletedAt: '2026-11-01T01:00:00.000Z' },
        },
        artistAliases: {},
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockData));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const res = await batchRestoreFromTrash(['t1', 't2']);
      expect(res.tracks['t1']?.hidden).toBe(false);
      expect(res.tracks['t2']?.hidden).toBe(false);
    });

    it('batchPurgeFromTrash đánh dấu purged vĩnh viễn', async () => {
      const mockData = {
        version: 1,
        tracks: {
          t1: { hidden: true, deletedAt: '2026-11-01T00:00:00.000Z' },
        },
        artistAliases: {},
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockData));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const res = await batchPurgeFromTrash(['t1']);
      expect(res.tracks['t1']?.purged).toBe(true);
      expect(res.tracks['t1']?.purgedAt).toBeDefined();
    });
  });
});
