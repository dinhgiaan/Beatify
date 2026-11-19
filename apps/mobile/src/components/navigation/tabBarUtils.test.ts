import { describe, it, expect } from 'vitest';
import { calculateVisibleTabIndex, calculatePillLayout } from './tabBarUtils';

describe('tabBarUtils Behavior Tests', () => {
  const mockRoutes = [
    { key: 'route-home', name: 'home' },
    { key: 'route-search', name: 'search' },
    { key: 'route-library', name: 'library' },
    { key: 'route-collection', name: 'collection' },
    { key: 'route-recent', name: 'recent' }, // Route ẩn (href: null)
    { key: 'route-playlists', name: 'playlists' },
  ];

  const mockDescriptors = {
    'route-home': { key: 'route-home', name: 'home', options: { title: 'Trang chủ' } },
    'route-search': { key: 'route-search', name: 'search', options: { title: 'Tìm kiếm' } },
    'route-library': { key: 'route-library', name: 'library', options: { title: 'Thư viện' } },
    'route-collection': { key: 'route-collection', name: 'collection', options: { title: 'Yêu thích' } },
    'route-recent': { key: 'route-recent', name: 'recent', options: { href: null, title: 'Vừa nghe' } },
    'route-playlists': { key: 'route-playlists', name: 'playlists', options: { title: 'Playlist' } },
  };

  it('tính đúng index hiển thị cho các visible tab (0..4)', () => {
    expect(calculateVisibleTabIndex(mockRoutes, mockDescriptors, 'route-home', 0)).toBe(0);
    expect(calculateVisibleTabIndex(mockRoutes, mockDescriptors, 'route-search', 0)).toBe(1);
    expect(calculateVisibleTabIndex(mockRoutes, mockDescriptors, 'route-library', 0)).toBe(2);
    expect(calculateVisibleTabIndex(mockRoutes, mockDescriptors, 'route-collection', 0)).toBe(3);
    // playlists đứng sau recent (ẩn), nên visible index là 4
    expect(calculateVisibleTabIndex(mockRoutes, mockDescriptors, 'route-playlists', 0)).toBe(4);
  });

  it('khi active route là route ẩn (recent), giữ nguyên lastValidIndex, không trả -1 hay NaN', () => {
    // Đang ở library (index 2) rồi chuyển sang recent (ẩn)
    const resultFromLibrary = calculateVisibleTabIndex(mockRoutes, mockDescriptors, 'route-recent', 2);
    expect(resultFromLibrary).toBe(2);
    expect(Number.isFinite(resultFromLibrary)).toBe(true);

    // Đang ở playlists (index 4) rồi chuyển sang recent (ẩn)
    const resultFromPlaylists = calculateVisibleTabIndex(mockRoutes, mockDescriptors, 'route-recent', 4);
    expect(resultFromPlaylists).toBe(4);
    expect(Number.isFinite(resultFromPlaylists)).toBe(true);
  });

  it('xử lý an toàn khi routes rỗng hoặc descriptors không hợp lệ', () => {
    expect(calculateVisibleTabIndex([], {}, 'unknown', 0)).toBe(0);
    expect(calculateVisibleTabIndex(mockRoutes, {}, undefined, 1)).toBe(1);
  });

  it('calculatePillLayout tính toán tọa độ chính xác, không trả NaN hay số âm', () => {
    const layout = calculatePillLayout(2, 390, 5, 8);
    // availableWidth = 390 - 8 = 382. tabWidth = 382 / 5 = 76.4. translateX = 2 * 76.4 = 152.8
    expect(layout.tabWidth).toBeCloseTo(76.4);
    expect(layout.translateX).toBeCloseTo(152.8);
    expect(Number.isFinite(layout.translateX)).toBe(true);
  });
});

