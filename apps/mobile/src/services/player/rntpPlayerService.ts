import TrackPlayer, {
  Event,
  PlaybackState,
  PlayerCommand,
  RepeatMode as RntpRepeatMode,
} from '@rntp/player';
import type { Track } from '@music-app/shared';
import type { IPlayerService, PlayerState, RepeatMode } from './types';
import { gainToVolume } from '../../utils/gainToVolume';

/**
 * Hiện thực IPlayerService sử dụng @rntp/player v5
 * Tuân thủ Dependency Inversion, bảo toàn tính tương thích với iOS background audio
 */
export class RntpPlayerService implements IPlayerService {
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private currentTracks: Track[] = [];
  private listeners: Set<(state: PlayerState) => void> = new Set();
  private lastTrackEndTime: number | null = null;
  private gaplessDeltaMs: number | null = null;

  async setup(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      // Khởi tạo player với cấu hình nghe nhạc và dừng khi rút tai nghe
      await TrackPlayer.setupPlayer({
        contentType: 'music',
        handleAudioBecomingNoisy: true,
      });

      // Cấu hình các nút điều khiển trên lock screen và Control Center
      await TrackPlayer.setCommands({
        capabilities: [
          PlayerCommand.PlayPause,
          PlayerCommand.Next,
          PlayerCommand.Previous,
          PlayerCommand.Seek,
        ],
        handling: 'native',
      });

      // Đăng ký lắng nghe sự kiện từ RNTP v5 ĐÚNG MỘT LẦN DUY NHẤT
      TrackPlayer.addEventListener(Event.MediaItemTransition, (event) => {
        const now = Date.now();
        if (this.lastTrackEndTime !== null) {
          this.gaplessDeltaMs = now - this.lastTrackEndTime;
        }
        this.lastTrackEndTime = now;

        // Áp dụng ReplayGain cho bài hát mới
        if (event.item && event.item.mediaId) {
          const currentTrack = this.currentTracks.find((t) => t.id === event.item?.mediaId);
          if (currentTrack) {
            const volume = gainToVolume(currentTrack.replayGain);
            TrackPlayer.setVolume(volume);
          }
        }
        this.notifyListeners();
      });

      TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, () => {
        this.notifyListeners();
      });

      TrackPlayer.addEventListener(Event.IsPlayingChanged, () => {
        this.notifyListeners();
      });

      TrackPlayer.addEventListener(Event.PlaybackStateChanged, () => {
        this.notifyListeners();
      });

      this.isInitialized = true;
    })();

    return this.initPromise;
  }

  async playQueue(tracks: Track[], startIndex = 0): Promise<void> {
    await this.setup();

    // Lọc các bài hát có URI phát hợp lệ (http://, https://, hoặc file://) để bảo vệ 100% không bị crash native AVPlayer
    const validTracks = tracks.filter((t) => {
      const hasValidUri = Boolean(
        t.file &&
          (t.file.startsWith('http://') || t.file.startsWith('https://') || t.file.startsWith('file://'))
      );
      if (!hasValidUri) {
        console.warn(`[RNTP] Bỏ qua bài "${t.title}" (${t.id}) do URL không hợp lệ: "${t.file}"`);
      }
      return hasValidUri;
    });

    if (validTracks.length === 0) {
      console.warn('[RNTP] Không có bài hát nào có URL phát hợp lệ trong hàng đợi');
      return;
    }

    this.currentTracks = validTracks;

    const mediaItems = validTracks.map((track) => ({
      mediaId: track.id,
      url: track.file,
      title: track.title,
      artist: track.artist,
      albumTitle: track.album,
      duration: track.duration,
      artworkUrl:
        track.cover &&
        (track.cover.startsWith('http://') ||
          track.cover.startsWith('https://') ||
          track.cover.startsWith('file://'))
          ? track.cover
          : undefined,
    }));

    const safeIndex = Math.min(Math.max(0, startIndex), validTracks.length - 1);
    TrackPlayer.setMediaItems(mediaItems, safeIndex);
    TrackPlayer.play();
    this.notifyListeners();
  }

  async play(): Promise<void> {
    await this.setup();
    TrackPlayer.play();
    this.notifyListeners();
  }

  async pause(): Promise<void> {
    await this.setup();
    TrackPlayer.pause();
    this.notifyListeners();
  }

  async next(): Promise<void> {
    await this.setup();
    this.lastTrackEndTime = Date.now();
    try {
      TrackPlayer.skipToNext();
    } catch (err) {
      console.warn('Không thể chuyển bài tiếp:', err);
    }
    this.notifyListeners();
  }

  async previous(): Promise<void> {
    await this.setup();
    try {
      TrackPlayer.skipToPrevious();
    } catch (err) {
      console.warn('Không thể quay lại bài trước:', err);
    }
    this.notifyListeners();
  }

  async skipToIndex(index: number): Promise<void> {
    await this.setup();
    this.lastTrackEndTime = Date.now();
    try {
      TrackPlayer.skipToIndex(index);
    } catch (err) {
      console.warn('Không thể nhảy tới vị trí:', err);
    }
    this.notifyListeners();
  }

  async seekTo(seconds: number): Promise<void> {
    await this.setup();
    try {
      TrackPlayer.seekTo(seconds);
    } catch (err) {
      console.warn('Không thể tua nhạc:', err);
    }
    this.notifyListeners();
  }

  async setRepeatMode(mode: RepeatMode): Promise<void> {
    await this.setup();
    let rntpMode: RntpRepeatMode;
    switch (mode) {
      case 'track':
        rntpMode = RntpRepeatMode.One;
        break;
      case 'queue':
        rntpMode = RntpRepeatMode.All;
        break;
      case 'off':
      default:
        rntpMode = RntpRepeatMode.Off;
        break;
    }
    TrackPlayer.setRepeatMode(rntpMode);
  }

  async getQueue(): Promise<Track[]> {
    return this.currentTracks;
  }

  /**
   * Lấy khoảng chênh lệch gapless đo được (ms)
   */
  getGaplessDeltaMs(): number | null {
    return this.gaplessDeltaMs;
  }

  getCurrentState(): PlayerState {
    if (!this.isInitialized) {
      return {
        isPlaying: false,
        isBuffering: false,
        activeTrackId: null,
        positionSec: 0,
        durationSec: 0,
        bufferedSec: null,
      };
    }

    const isPlaying = TrackPlayer.isPlaying();
    const playbackState = TrackPlayer.getPlaybackState();
    const progress = TrackPlayer.getProgress();
    const activeItem = TrackPlayer.getActiveMediaItem();

    return {
      isPlaying,
      isBuffering: playbackState === PlaybackState.Buffering,
      activeTrackId: activeItem?.mediaId ?? null,
      positionSec: progress.position,
      durationSec: progress.duration,
      bufferedSec: progress.buffered,
    };
  }

  subscribe(listener: (state: PlayerState) => void): () => void {
    this.listeners.add(listener);
    // Báo trạng thái hiện tại ngay lập tức khi đăng ký
    listener(this.getCurrentState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const state = this.getCurrentState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        // Tránh ngoại lệ từ listener làm gián đoạn các subscriber khác
      }
    }
  }
}

// Singleton player service cho toàn bộ ứng dụng
export const playerService = new RntpPlayerService();
