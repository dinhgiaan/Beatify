import { describe, it, expect, vi } from 'vitest';

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///data/user/0/beatify/',
  getInfoAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
  moveAsync: vi.fn(),
  deleteAsync: vi.fn(),
}));

import {
  addTrackToSearchHistory,
  removeTrackFromSearchHistory,
  MAX_SEARCH_HISTORY,
  type SearchHistoryData,
} from './searchHistoryStorage';

describe('searchHistoryStorage', () => {
  it('thêm bài hát mới vào đầu danh sách', () => {
    const initial: SearchHistoryData = { trackIds: ['track-1', 'track-2'] };
    const result = addTrackToSearchHistory('track-3', initial);

    expect(result.trackIds).toEqual(['track-3', 'track-1', 'track-2']);
  });

  it('đưa bài hát đã có lên đầu và loại bỏ trùng lặp', () => {
    const initial: SearchHistoryData = { trackIds: ['track-1', 'track-2', 'track-3'] };
    const result = addTrackToSearchHistory('track-2', initial);

    expect(result.trackIds).toEqual(['track-2', 'track-1', 'track-3']);
  });

  it('giới hạn tối đa MAX_SEARCH_HISTORY phần tử', () => {
    const trackIds = Array.from({ length: MAX_SEARCH_HISTORY }, (_, i) => `track-${i}`);
    const initial: SearchHistoryData = { trackIds };
    const result = addTrackToSearchHistory('new-track', initial);

    expect(result.trackIds.length).toBe(MAX_SEARCH_HISTORY);
    expect(result.trackIds[0]).toBe('new-track');
    expect(result.trackIds).not.toContain(`track-${MAX_SEARCH_HISTORY - 1}`);
  });

  it('xóa một bài hát khỏi lịch sử tìm kiếm', () => {
    const initial: SearchHistoryData = { trackIds: ['track-1', 'track-2', 'track-3'] };
    const result = removeTrackFromSearchHistory('track-2', initial);

    expect(result.trackIds).toEqual(['track-1', 'track-3']);
  });
});
