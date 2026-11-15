import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cleanSearchQuery,
  upgradeItunesArtworkUrl,
  searchItunesCovers,
  searchDeezerCovers,
  searchCovers,
} from './coverFetchService';

describe('CoverFetchService - Tìm và tải ảnh bìa chất lượng cao HD', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. cleanSearchQuery dọn dẹp chính xác các tag rác video/MV/ft', () => {
    expect(cleanSearchQuery('Waiting For You (Official Music Video)', 'MONO')).toBe('Waiting For You MONO');
    expect(cleanSearchQuery('See Tình [MV]', 'Hoàng Thùy Linh')).toBe('See Tình Hoàng Thùy Linh');
    expect(cleanSearchQuery('Chạy Ngay Đi (Remix) - Official Visualizer', 'Sơn Tùng M-TP')).toBe('Chạy Ngay Đi Sơn Tùng M-TP');
    expect(cleanSearchQuery('Bài Hát Này (feat. Đen Vâu)', 'JustaTee, Đen Vâu')).toBe('Bài Hát Này JustaTee');
  });

  it('2. upgradeItunesArtworkUrl nâng cấp phân giải ảnh lên 1400x1400', () => {
    const raw100 = 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/xx/yy/zz/source/100x100bb.jpg';
    expect(upgradeItunesArtworkUrl(raw100, 1400)).toBe(
      'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/xx/yy/zz/source/1400x1400bb.jpg'
    );

    const raw60 = 'https://is1-ssl.mzstatic.com/image/thumb/Music/60x60bb.jpg';
    expect(upgradeItunesArtworkUrl(raw60, 3000)).toBe(
      'https://is1-ssl.mzstatic.com/image/thumb/Music/3000x3000bb.jpg'
    );
  });

  it('3. searchItunesCovers phân tích kết quả và trả về ảnh 1400x1400 kèm điểm tương đồng', async () => {
    const mockResponse = {
      resultCount: 1,
      results: [
        {
          trackName: 'Waiting For You',
          artistName: 'MONO',
          collectionName: '22',
          artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/100x100bb.jpg',
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as unknown as Response);

    const results = await searchItunesCovers('Waiting For You', 'MONO');
    expect(results.length).toBe(1);
    expect(results[0]?.source).toBe('itunes');
    expect(results[0]?.artworkUrl).toContain('1400x1400bb.jpg');
    expect(results[0]?.score).toBeGreaterThanOrEqual(80);
    expect(results[0]?.width).toBe(1400);
  });

  it('4. searchDeezerCovers fallback khi cần và trả về ảnh cover_xl', async () => {
    const mockResponse = {
      data: [
        {
          title: 'Nơi Này Có Anh',
          artist: { name: 'Sơn Tùng M-TP' },
          album: {
            title: 'Nơi Này Có Anh - Single',
            cover_xl: 'https://e-cdns-images.dzcdn.net/images/cover/1000x1000-000000-80-0-0.jpg',
            cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/250x250-000000-80-0-0.jpg',
          },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as unknown as Response);

    const results = await searchDeezerCovers('Nơi Này Có Anh', 'Sơn Tùng M-TP');
    expect(results.length).toBe(1);
    expect(results[0]?.source).toBe('deezer');
    expect(results[0]?.artworkUrl).toBe(mockResponse.data[0]?.album.cover_xl);
    expect(results[0]?.score).toBeGreaterThanOrEqual(80);
  });

  it('5. searchCovers ưu tiên iTunes khi điểm khớp cao', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('itunes.apple.com')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [
                {
                  trackName: 'Chạy Ngay Đi',
                  artistName: 'Sơn Tùng M-TP',
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/100x100bb.jpg',
                },
              ],
            }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const results = await searchCovers('Chạy Ngay Đi', 'Sơn Tùng M-TP');
    expect(results.length).toBe(1);
    expect(results[0]?.source).toBe('itunes');
    expect(results[0]?.artworkUrl).toContain('1400x1400bb.jpg');
  });
});
