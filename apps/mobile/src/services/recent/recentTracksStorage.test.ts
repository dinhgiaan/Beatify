import { describe, it, expect, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Vibration: { vibrate: vi.fn() },
}));

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///data/user/0/beatify/',
  getInfoAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
  moveAsync: vi.fn(),
  deleteAsync: vi.fn(),
}));

import {
  addTrackToRecentList,
  updateRecentLimit,
  type RecentTracksData,
} from './recentTracksStorage';

describe('recentTracksStorage - Nghe gần đây', () => {
  it('đưa bài hát mới lên vị trí đầu tiên của danh sách', () => {
    const initial: RecentTracksData = {
      limit: 30,
      trackIds: ['track-1', 'track-2'],
    };

    const next = addTrackToRecentList('track-3', initial);
    expect(next.trackIds).toEqual(['track-3', 'track-1', 'track-2']);
  });

  it('chống trùng lặp: bài hát đã có khi nghe lại được đưa lên vị trí đầu tiên', () => {
    const initial: RecentTracksData = {
      limit: 30,
      trackIds: ['track-1', 'track-2', 'track-3'],
    };

    const next = addTrackToRecentList('track-2', initial);
    expect(next.trackIds).toEqual(['track-2', 'track-1', 'track-3']);
    expect(next.trackIds.length).toBe(3);
  });

  it('tự động cắt giảm khi vượt quá giới hạn limit đã định', () => {
    const initial: RecentTracksData = {
      limit: 3,
      trackIds: ['track-1', 'track-2', 'track-3'],
    };

    const next = addTrackToRecentList('track-4', initial);
    expect(next.trackIds).toEqual(['track-4', 'track-1', 'track-2']);
    expect(next.trackIds.length).toBe(3);
  });

  it('cập nhật giới hạn mới và tự động cắt bớt nếu danh sách dài hơn giới hạn', () => {
    const initial: RecentTracksData = {
      limit: 30,
      trackIds: Array.from({ length: 30 }, (_, i) => `track-${i}`),
    };

    const next = updateRecentLimit(10, initial);
    expect(next.limit).toBe(10);
    expect(next.trackIds.length).toBe(10);
    expect(next.trackIds[0]).toBe('track-0');
    expect(next.trackIds[9]).toBe('track-9');
  });

  it('giới hạn giá trị min là 10 và max là 50', () => {
    const initial: RecentTracksData = {
      limit: 30,
      trackIds: ['track-1'],
    };

    expect(updateRecentLimit(5, initial).limit).toBe(10);
    expect(updateRecentLimit(100, initial).limit).toBe(50);
  });
});
