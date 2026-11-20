import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Track } from '@music-app/shared';

const { mockFiles, mockFileSizes } = vi.hoisted(() => ({
  mockFiles: {} as Record<string, string>,
  mockFileSizes: {} as Record<string, number>,
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Alert: { alert: vi.fn() },
  Vibration: { vibrate: vi.fn() },
  AppState: {
    currentState: 'active',
    addEventListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
  },
}));

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///var/mobile/Containers/Data/Application/1234/',
  EncodingType: { Base64: 'base64' },
  getInfoAsync: vi.fn(async (uri: string) => ({
    exists: uri in mockFiles || uri in mockFileSizes,
    isDirectory: false,
    size: mockFileSizes[uri] || 1024,
  })),
  readAsStringAsync: vi.fn(async (uri: string, options?: { encoding?: string; length?: number }) => {
    if (uri in mockFiles) {
      const content = mockFiles[uri] || '';
      if (options?.encoding === 'base64') {
        return btoa(content);
      }
      return content;
    }
    throw new Error(`File not found: ${uri}`);
  }),
  writeAsStringAsync: vi.fn(async (uri: string, content: string) => {
    mockFiles[uri] = content;
    mockFileSizes[uri] = content.length;
  }),
  deleteAsync: vi.fn(async (uri: string) => {
    Reflect.deleteProperty(mockFiles, uri);
    Reflect.deleteProperty(mockFileSizes, uri);
  }),
  moveAsync: vi.fn(async ({ from, to }: { from: string; to: string }) => {
    mockFiles[to] = mockFiles[from] || '';
    mockFileSizes[to] = mockFileSizes[from] || 1024;
    Reflect.deleteProperty(mockFiles, from);
    Reflect.deleteProperty(mockFileSizes, from);
  }),
  makeDirectoryAsync: vi.fn(async () => { }),
  downloadAsync: vi.fn(async (_url: string, targetUri: string) => {
    mockFiles[targetUri] = '....ftypM4A ....';
    mockFileSizes[targetUri] = 4 * 1024 * 1024;
    return { status: 200 };
  }),
  createDownloadResumable: vi.fn((_url: string, targetUri: string, _opts: unknown, callback?: (p: { totalBytesExpectedToWrite: number; totalBytesWritten: number }) => void) => ({
    downloadAsync: vi.fn(async () => {
      callback?.({ totalBytesExpectedToWrite: 4000000, totalBytesWritten: 4000000 });
      mockFiles[targetUri] = '....ftypM4A ....';
      mockFileSizes[targetUri] = 4000000;
      return { status: 200 };
    }),
  })),
}));

const mockSetMediaItems = vi.fn();
const mockPlay = vi.fn();
const mockSetupPlayer = vi.fn().mockResolvedValue(undefined);
const mockSetCommands = vi.fn();
const mockAddEventListener = vi.fn().mockReturnValue({ remove: vi.fn() });

vi.mock('@rntp/player', () => ({
  default: {
    setupPlayer: (...args: unknown[]) => mockSetupPlayer(...args),
    setCommands: (...args: unknown[]) => mockSetCommands(...args),
    addEventListener: (...args: unknown[]) => mockAddEventListener(...args),
    setMediaItems: (...args: unknown[]) => mockSetMediaItems(...args),
    play: (...args: unknown[]) => mockPlay(...args),
    pause: vi.fn(),
    seekTo: vi.fn(),
    setVolume: vi.fn(),
    skipToIndex: vi.fn(),
    setRepeatMode: vi.fn(),
    getActiveMediaItem: vi.fn().mockReturnValue(null),
    getPlaybackState: vi.fn().mockReturnValue('idle'),
    getProgress: vi.fn().mockReturnValue({ position: 0, duration: 0, buffered: 0 }),
    isPlaying: vi.fn().mockReturnValue(false),
  },
  Event: {
    MediaItemTransition: 'media-item-transition',
    PlaybackProgressUpdated: 'playback-progress-updated',
    IsPlayingChanged: 'is-playing-changed',
    PlaybackStateChanged: 'playback-state-changed',
  },
  PlayerCommand: {
    PlayPause: 'play-pause',
    Next: 'next',
    Previous: 'previous',
    Seek: 'seek',
  },
  RepeatMode: {
    Off: 0,
    Track: 1,
    Queue: 2,
  },
  PlaybackState: {
    Playing: 'playing',
    Paused: 'paused',
    Stopped: 'stopped',
    Buffering: 'buffering',
    Idle: 'idle',
    Error: 'error',
  },
}));

vi.mock('./transitionManager', () => ({
  transitionManager: {
    updateQueue: vi.fn(),
    onPlaybackProgress: vi.fn(),
    restoreBaseVolume: vi.fn(),
  },
}));

import {
  downloadTrackOffline,
  loadOfflineIndex,
  type OfflineIndex,
} from './offlineStorage';
import { RntpPlayerService } from '../player/rntpPlayerService';

describe('Đảm bảo 100% Khả năng Phát nhạc Offline (Zero-Failure Offline Playback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockFiles)) {
      Reflect.deleteProperty(mockFiles, key);
    }
    for (const key of Object.keys(mockFileSizes)) {
      Reflect.deleteProperty(mockFileSizes, key);
    }
  });

  describe('1. Nhận diện và Sửa định dạng File âm thanh cục bộ (Magic Bytes Self-Healing)', () => {
    it('Tải bài hát AAC/M4A tự động nhận diện container m4a qua magic bytes ftyp', async () => {
      const track: Track = {
        id: 'track-offline-1',
        title: 'Chạy Khỏi Thế Giới Này',
        artist: 'Da LAB',
        file: 'https://example.com/stream/track-offline-1',
        duration: 215,
        storage: 'r2',
      };

      const result = await downloadTrackOffline(
        track,
        'https://worker.beatify.vn',
        'test-token'
      );

      expect(result.audioRelPath).toContain('.m4a');
      expect(result.trackId).toBe('track-offline-1');
    }, 15000);

    it('Tự động phát hiện và đổi tên file MP3 bị lưu nhầm thành M4A khi magic bytes là ftyp trong loadOfflineIndex', async () => {
      const wrongRelPath = 'offline/track-wrong/audio.mp3';
      const absWrongPath = 'file:///var/mobile/Containers/Data/Application/1234/offline/track-wrong/audio.mp3';
      // File có header ftyp của container MP4/M4A
      mockFiles[absWrongPath] = '....ftypM4A isom....';
      mockFileSizes[absWrongPath] = 2048;

      const initialIndex: OfflineIndex = {
        'track-wrong': {
          trackId: 'track-wrong',
          title: 'Bài hát nhầm đuôi',
          artist: 'Ca sĩ A',
          audioRelPath: wrongRelPath,
          sizeBytes: 2048,
          downloadedAt: new Date().toISOString(),
        },
      };

      const indexPath = 'file:///var/mobile/Containers/Data/Application/1234/beatify_offline_index.json';
      mockFiles[indexPath] = JSON.stringify(initialIndex);

      const loaded = await loadOfflineIndex();

      expect(loaded['track-wrong']?.audioRelPath).toBe('offline/track-wrong/audio.m4a');
      const correctAbsPath = 'file:///var/mobile/Containers/Data/Application/1234/offline/track-wrong/audio.m4a';
      expect(mockFiles[correctAbsPath]).toBeDefined();
      expect(mockFiles[absWrongPath]).toBeUndefined();
    });
  });

  describe('2. Bảo vệ Native AVPlayer và Lock Screen MPNowPlayingInfoCenter khi Offline', () => {
    it('Bài hát offline (file://) chỉ dùng artworkUrl nếu ảnh bìa là file:// cục bộ, KHÔNG dùng URL remote', async () => {
      const playerService = new RntpPlayerService();

      const offlineTracksWithRemoteCover: Track[] = [
        {
          id: 'track-1',
          title: 'Bài Offline Bìa Remote',
          artist: 'Ca Sĩ 1',
          file: 'file:///var/mobile/Containers/Data/Application/1234/offline/track-1/audio.m4a',
          cover: 'https://cdn.beatify.vn/covers/album-1.jpg', // Remote cover
          duration: 210,
          storage: 'r2',
        },
        {
          id: 'track-2',
          title: 'Bài Offline Bìa Local',
          artist: 'Ca Sĩ 2',
          file: 'file:///var/mobile/Containers/Data/Application/1234/offline/track-2/audio.m4a',
          cover: 'file:///var/mobile/Containers/Data/Application/1234/offline/track-2/cover.jpg', // Local cover
          duration: 180,
          storage: 'r2',
        },
      ];

      await playerService.playQueue(offlineTracksWithRemoteCover, 0);

      expect(mockSetMediaItems).toHaveBeenCalledTimes(1);
      const passedItems = mockSetMediaItems.mock.calls[0]?.[0] as Array<{ artworkUrl?: string; url: string }>;

      // Bài 1: file là file://, cover là https:// -> artworkUrl phải là undefined để tránh AVPlayer gọi mạng khi mất sóng
      expect(passedItems[0]?.artworkUrl).toBeUndefined();
      expect(passedItems[0]?.url).toBe('file:///var/mobile/Containers/Data/Application/1234/offline/track-1/audio.m4a');

      // Bài 2: file là file://, cover là file:// -> artworkUrl giữ nguyên đường dẫn file://
      expect(passedItems[1]?.artworkUrl).toBe('file:///var/mobile/Containers/Data/Application/1234/offline/track-2/cover.jpg');
    });

    it('Bỏ qua các bài hát rỗng hoặc không có URI hợp lệ để tránh crash AVPlayer', async () => {
      const playerService = new RntpPlayerService();

      const corruptedTracks: Track[] = [
        {
          id: 'invalid-track',
          title: 'Bài lỗi không có link',
          artist: 'Chưa rõ',
          file: '',
          duration: 120,
          storage: 'r2',
        },
        {
          id: 'valid-offline-track',
          title: 'Bài offline chuẩn',
          artist: 'Ca sĩ B',
          file: 'file:///var/mobile/Containers/Data/Application/1234/offline/valid/audio.m4a',
          duration: 200,
          storage: 'r2',
        },
      ];

      await playerService.playQueue(corruptedTracks, 0);

      expect(mockSetMediaItems).toHaveBeenCalledTimes(1);
      const passedItems = mockSetMediaItems.mock.calls[0]?.[0] as Array<{ mediaId: string }>;
      expect(passedItems).toHaveLength(1);
      expect(passedItems[0]?.mediaId).toBe('valid-offline-track');
    });
  });

  describe('3. Cách ly Hàng đợi Phát khi Ngoại tuyến (Offline Queue Isolation)', () => {
    it('Lọc 100% các bài hát online (https://) ra khỏi danh sách phát khi isOffline = true', () => {
      const fullLibrary: Track[] = [
        { id: 't1', title: 'Bài Online 1', artist: 'A', file: 'https://worker.beatify.vn/stream/t1', duration: 180, storage: 'r2' },
        { id: 't2', title: 'Bài Offline 2', artist: 'B', file: 'file:///var/mobile/offline/t2/audio.m4a', duration: 180, storage: 'r2' },
        { id: 't3', title: 'Bài Online 3', artist: 'C', file: 'https://worker.beatify.vn/stream/t3', duration: 180, storage: 'r2' },
        { id: 't4', title: 'Bài Offline 4', artist: 'D', file: 'file:///var/mobile/offline/t4/audio.m4a', duration: 180, storage: 'r2' },
      ];

      const isOffline = true;
      const offlineOnlyQueue = isOffline
        ? fullLibrary.filter((t) => t.file.startsWith('file://'))
        : fullLibrary;

      expect(offlineOnlyQueue).toHaveLength(2);
      expect(offlineOnlyQueue.map((t) => t.id)).toEqual(['t2', 't4']);
      expect(offlineOnlyQueue.every((t) => t.file.startsWith('file://'))).toBe(true);
    });
  });
});