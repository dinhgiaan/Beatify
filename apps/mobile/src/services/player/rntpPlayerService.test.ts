import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSetupPlayer = vi.fn().mockResolvedValue(undefined);
const mockSetCommands = vi.fn().mockReturnValue(undefined);
const mockAddEventListener = vi.fn().mockReturnValue({ remove: vi.fn() });
const mockSetMediaItems = vi.fn().mockReturnValue(undefined);
const mockPlay = vi.fn().mockReturnValue(undefined);
const mockPause = vi.fn().mockReturnValue(undefined);
const mockSeekTo = vi.fn().mockReturnValue(undefined);
const mockSetVolume = vi.fn().mockReturnValue(undefined);

vi.mock('@rntp/player', () => ({
  default: {
    setupPlayer: (...args: unknown[]) => mockSetupPlayer(...args),
    setCommands: (...args: unknown[]) => mockSetCommands(...args),
    addEventListener: (...args: unknown[]) => mockAddEventListener(...args),
    setMediaItems: (...args: unknown[]) => mockSetMediaItems(...args),
    play: (...args: unknown[]) => mockPlay(...args),
    pause: (...args: unknown[]) => mockPause(...args),
    seekTo: (...args: unknown[]) => mockSeekTo(...args),
    setVolume: (...args: unknown[]) => mockSetVolume(...args),
    getActiveMediaItem: vi.fn().mockReturnValue(null),
    getPlaybackState: vi.fn().mockReturnValue(undefined),
    getProgress: vi.fn().mockReturnValue({ position: 0, duration: 0, buffered: 0 }),
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
    None: 'none',
  },
}));

import { RntpPlayerService } from './rntpPlayerService';

describe('RntpPlayerService - Idempotent Setup Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gọi setup() lần đầu tiên khởi tạo player và đăng ký 4 listener', async () => {
    const service = new RntpPlayerService();
    await service.setup();

    expect(mockSetupPlayer).toHaveBeenCalledTimes(1);
    expect(mockSetCommands).toHaveBeenCalledTimes(1);
    expect(mockAddEventListener).toHaveBeenCalledTimes(4);
  });

  it('gọi setup() nhiều lần tuần tự hoặc song song KHÔNG bao giờ đăng ký thêm listener (Idempotent Guard)', async () => {
    const service = new RntpPlayerService();

    // Gọi 5 lần song song cùng lúc
    await Promise.all([
      service.setup(),
      service.setup(),
      service.setup(),
      service.setup(),
      service.setup(),
    ]);

    // Gọi tiếp thêm 2 lần tuần tự
    await service.setup();
    await service.setup();

    // setupPlayer và addEventListener CHỈ ĐƯỢC GỌI DUY NHẤT 1 LẦN
    expect(mockSetupPlayer).toHaveBeenCalledTimes(1);
    expect(mockSetCommands).toHaveBeenCalledTimes(1);
    expect(mockAddEventListener).toHaveBeenCalledTimes(4);
  });
});
