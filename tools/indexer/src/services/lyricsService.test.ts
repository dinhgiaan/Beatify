import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LyricsService } from './lyricsService';

describe('LyricsService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('trả về none nếu tên bài hát trống', async () => {
    const res = await LyricsService.fetchLyrics('', '');
    expect(res.source).toBe('none');
    expect(res.syncedLyrics).toBeUndefined();
  });

  it('lấy lời đồng bộ chính xác khi LRCLIB trả về kết quả khớp', async () => {
    const mockTrack = {
      id: 1234,
      name: 'Nơi Này Có Anh',
      artistName: 'Sơn Tùng M-TP',
      duration: 260,
      instrumental: false,
      syncedLyrics: '[00:10.00]Em là ai từ đâu bước đến nơi đây dịu dàng',
      plainLyrics: 'Em là ai từ đâu bước đến nơi đây dịu dàng',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      status: 200,
      json: async () => mockTrack,
    } as unknown as Response);

    const res = await LyricsService.fetchLyrics('Nơi Này Có Anh', 'Sơn Tùng M-TP', 260);

    expect(fetchSpy).toHaveBeenCalled();
    expect(res.source).toBe('lrclib-synced');
    expect(res.syncedLyrics).toContain('[00:10.00]');
    expect(res.durationMismatchWarning).toBe(false);
  });

  it('cảnh báo lệch thời lượng nếu chênh lệch trên 3 giây', async () => {
    // Giả lập /api/get trả về 404, /api/search trả về bài lệch duration
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        status: 404,
      } as unknown as Response)
      .mockResolvedValueOnce({
        status: 200,
        json: async () => [
          {
            id: 5678,
            name: 'Song A',
            artistName: 'Artist A',
            duration: 200,
            instrumental: false,
            syncedLyrics: '[00:05.00]Hello',
          },
        ],
      } as unknown as Response);

    const res = await LyricsService.fetchLyrics('Song A', 'Artist A', 210); // chênh 10s
    expect(res.source).toBe('lrclib-synced');
    expect(res.durationMismatchWarning).toBe(true);
    expect(res.durationDiffSeconds).toBe(10);
  });

  it('chuyển đổi phụ đề WebVTT sang file .lrc đồng bộ chuẩn xác', () => {
    const vtt = `WEBVTT
Kind: captions
Language: vi

00:00:14.080 --> 00:00:16.080
Young Money tao tự do và tự thưởng

00:00:16.080 --> 00:00:17.120
Tự làm giàu và tự bương
`;

    const res = LyricsService.convertVttToLrc(vtt);
    expect(res).not.toBeNull();
    expect(res?.syncedLyrics).toContain('[00:14.08] Young Money tao tự do và tự thưởng');
    expect(res?.syncedLyrics).toContain('[00:16.08] Tự làm giàu và tự bương');
    expect(res?.plainLyrics).toContain('Young Money tao tự do và tự thưởng');
  });
});
