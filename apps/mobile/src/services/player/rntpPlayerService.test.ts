import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSetupPlayer = vi.fn().mockResolvedValue(undefined);
const mockSetCommands = vi.fn().mockReturnValue(undefined);
const mockAddEventListener = vi.fn().mockReturnValue({ remove: vi.fn() });
const mockSetMediaItems = vi.fn().mockReturnValue(undefined);
const mockPlay = vi.fn().mockReturnValue(undefined);
const mockPause = vi.fn().mockReturnValue(undefined);
const mockSeekTo = vi.fn().mockReturnValue(undefined);
const mockSetVolume = vi.fn().mockReturnValue(undefined);
const mockUpdateMetadata = vi.fn().mockReturnValue(undefined);

vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
  },
}));

vi.mock('./transitionManager', () => ({
  transitionManager: {
    updateQueue: vi.fn(),
    onPlaybackProgress: vi.fn(),
    restoreBaseVolume: vi.fn(),
    setRepeatMode: vi.fn(),
  },
}));

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
    updateMetadata: (...args: unknown[]) => mockUpdateMetadata(...args),
    skipToIndex: vi.fn(),
    skipToNext: vi.fn(),
    setRepeatMode: vi.fn(),
    isPlaying: vi.fn().mockReturnValue(false),
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
    Ended: 'ended',
    None: 'none',
  },
}));

import { RntpPlayerService } from './rntpPlayerService';
import TrackPlayer, { PlaybackState, type MediaItem } from '@rntp/player';
import type { Track } from '@music-app/shared';

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

  describe('updateLockScreenTimer - Hiển thị đếm ngược & Bảo vệ chống giật lag/nháy metadata', () => {
    it('cập nhật artist có gắn chuỗi đếm ngược và không gọi thừa khi chuỗi không đổi', async () => {
      const service = new RntpPlayerService();
      const mockTrack: Track = {
        id: 'track-1',
        title: 'Bài Hát Test',
        artist: 'Nghệ Sĩ A',
        file: 'https://example.com/audio.m4a',
        duration: 200,
        storage: 'r2',
      };

      vi.spyOn(TrackPlayer, 'getActiveMediaItem').mockReturnValue({ mediaId: 'track-1', url: 'track-1' } as MediaItem);
      (service as unknown as { currentTracks: Track[] }).currentTracks = [mockTrack];

      // 1. Cập nhật lần đầu với text "còn 14 phút"
      service.updateLockScreenTimer('còn 14 phút');
      expect(mockUpdateMetadata).toHaveBeenCalledTimes(1);
      expect(mockUpdateMetadata).toHaveBeenCalledWith(0, {
        artist: 'Nghệ Sĩ A · còn 14 phút',
      });

      // 2. Gọi lại với cùng chuỗi "còn 14 phút" -> Phải bị chặn (deduplicated), không gọi native lần 2
      service.updateLockScreenTimer('còn 14 phút');
      expect(mockUpdateMetadata).toHaveBeenCalledTimes(1);

      // 3. Đổi sang chuỗi mới "còn 13 phút" -> Cho phép gọi update
      service.updateLockScreenTimer('còn 13 phút');
      expect(mockUpdateMetadata).toHaveBeenCalledTimes(2);
      expect(mockUpdateMetadata).toHaveBeenLastCalledWith(0, {
        artist: 'Nghệ Sĩ A · còn 13 phút',
      });

      // 4. Khi Pause hoặc hủy timer (truyền null) -> Khôi phục tên nghệ sĩ gốc
      service.updateLockScreenTimer(null);
      expect(mockUpdateMetadata).toHaveBeenCalledTimes(3);
      expect(mockUpdateMetadata).toHaveBeenLastCalledWith(0, {
        artist: 'Nghệ Sĩ A',
      });

      // 5. Gọi lại null lần nữa khi đã ở tên gốc -> Không gọi native dư thừa
      service.updateLockScreenTimer(null);
      expect(mockUpdateMetadata).toHaveBeenCalledTimes(3);
    });

    it('đổi sang bài mới cùng nghệ sĩ trong lúc đang đếm ngược: bài mới vẫn nhận được đếm ngược, không bị bộ đệm bỏ qua', async () => {
      const service = new RntpPlayerService();
      const track1: Track = {
        id: 'track-1',
        title: 'Bài 1',
        artist: 'Sơn Tùng M-TP',
        file: 'https://example.com/audio1.m4a',
        duration: 200,
        storage: 'r2',
      };
      const track2: Track = {
        id: 'track-2',
        title: 'Bài 2',
        artist: 'Sơn Tùng M-TP', // Cùng nghệ sĩ với bài 1
        file: 'https://example.com/audio2.m4a',
        duration: 220,
        storage: 'r2',
      };

      (service as unknown as { currentTracks: Track[] }).currentTracks = [track1, track2];

      // Đang phát track 1 với timer "còn 10 phút"
      const getActiveSpy = vi.spyOn(TrackPlayer, 'getActiveMediaItem').mockReturnValue({ mediaId: 'track-1', url: 'track-1' } as MediaItem);
      service.updateLockScreenTimer('còn 10 phút');
      expect(mockUpdateMetadata).toHaveBeenCalledTimes(1);
      expect(mockUpdateMetadata).toHaveBeenLastCalledWith(0, {
        artist: 'Sơn Tùng M-TP · còn 10 phút',
      });

      // Chuyển sang phát track 2 (cùng nghệ sĩ, cùng thời gian timer "còn 10 phút")
      getActiveSpy.mockReturnValue({ mediaId: 'track-2', url: 'track-2' } as MediaItem);
      service.updateLockScreenTimer('còn 10 phút');

      // Do khóa theo (ID bài + chuỗi nghệ sĩ), Track 2 PHẢI được cập nhật metadata chứ KHÔNG bị bỏ qua
      expect(mockUpdateMetadata).toHaveBeenCalledTimes(2);
      expect(mockUpdateMetadata).toHaveBeenLastCalledWith(1, {
        artist: 'Sơn Tùng M-TP · còn 10 phút',
      });
    });
  });

  describe('handlePlaybackEnded & play() phục hồi sau khi hết bài / kết thúc loop', () => {
    it('play() khi bài hát đã Ended tự động tua về 0 trước khi phát lại', async () => {
      const service = new RntpPlayerService();
      await service.setup();

      vi.spyOn(TrackPlayer, 'getPlaybackState').mockReturnValue(PlaybackState.Ended);
      vi.spyOn(TrackPlayer, 'getProgress').mockReturnValue({ position: 200, duration: 200, buffered: 200, cached: 200 });

      await service.play();

      expect(mockSeekTo).toHaveBeenCalledWith(0);
      expect(mockPlay).toHaveBeenCalled();
    });

    it('handlePlaybackEnded tự động chuyển sang bài tiếp theo khi còn bài trong hàng đợi', async () => {
      const service = new RntpPlayerService();
      await service.setup();

      const track1: Track = { id: 't1', title: 'T1', artist: 'A1', file: 'http://a/1.m4a', duration: 180, storage: 'r2' };
      const track2: Track = { id: 't2', title: 'T2', artist: 'A2', file: 'http://a/2.m4a', duration: 200, storage: 'r2' };
      (service as unknown as { currentTracks: Track[] }).currentTracks = [track1, track2];

      vi.spyOn(TrackPlayer, 'getActiveMediaItem').mockReturnValue({ mediaId: 't1', url: '1' } as MediaItem);
      const skipSpy = vi.spyOn(service, 'skipToIndex').mockResolvedValue(undefined);
      const playSpy = vi.spyOn(service, 'play').mockResolvedValue(undefined);

      // Gọi handlePlaybackEnded (private)
      await (service as unknown as { handlePlaybackEnded: () => Promise<void> }).handlePlaybackEnded();

      expect(skipSpy).toHaveBeenCalledWith(1);
      expect(playSpy).toHaveBeenCalled();
    });

    it('handlePlaybackEnded ở cuối hàng đợi với repeatMode = "queue" sẽ wrap về bài đầu tiên', async () => {
      const service = new RntpPlayerService();
      await service.setup();
      await service.setRepeatMode('queue');

      const track1: Track = { id: 't1', title: 'T1', artist: 'A1', file: 'http://a/1.m4a', duration: 180, storage: 'r2' };
      const track2: Track = { id: 't2', title: 'T2', artist: 'A2', file: 'http://a/2.m4a', duration: 200, storage: 'r2' };
      (service as unknown as { currentTracks: Track[] }).currentTracks = [track1, track2];

      vi.spyOn(TrackPlayer, 'getActiveMediaItem').mockReturnValue({ mediaId: 't2', url: '2' } as MediaItem);
      const skipSpy = vi.spyOn(service, 'skipToIndex').mockResolvedValue(undefined);
      const playSpy = vi.spyOn(service, 'play').mockResolvedValue(undefined);

      await (service as unknown as { handlePlaybackEnded: () => Promise<void> }).handlePlaybackEnded();

      expect(skipSpy).toHaveBeenCalledWith(0);
      expect(playSpy).toHaveBeenCalled();
    });

    it('next() ở cuối hàng đợi tự động wrap về bài 0 và phát thay vì kẹt lại', async () => {
      const service = new RntpPlayerService();
      await service.setup();

      const track1: Track = { id: 't1', title: 'T1', artist: 'A1', file: 'http://a/1.m4a', duration: 180, storage: 'r2' };
      const track2: Track = { id: 't2', title: 'T2', artist: 'A2', file: 'http://a/2.m4a', duration: 200, storage: 'r2' };
      (service as unknown as { currentTracks: Track[] }).currentTracks = [track1, track2];

      vi.spyOn(TrackPlayer, 'getActiveMediaItem').mockReturnValue({ mediaId: 't2', url: '2' } as MediaItem);
      const skipSpy = vi.spyOn(service, 'skipToIndex').mockResolvedValue(undefined);
      const playSpy = vi.spyOn(service, 'play').mockResolvedValue(undefined);

      await service.next();

      expect(skipSpy).toHaveBeenCalledWith(0);
      expect(playSpy).toHaveBeenCalled();
    });
  });
});
