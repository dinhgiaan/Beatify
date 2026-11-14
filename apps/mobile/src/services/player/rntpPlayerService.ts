import TrackPlayer, {
  Event,
  PlaybackState,
  PlayerCommand,
  RepeatMode as RntpRepeatMode,
} from '@rntp/player';
import type { Track } from '@music-app/shared';
import type { IPlayerService, PlayerState, RepeatMode } from './types';
import { gainToVolume } from '../../utils/gainToVolume';
import { transitionManager } from './transitionManager';

/**
 * Hiện thực IPlayerService sử dụng @rntp/player v5
 * Tuân thủ Dependency Inversion, bảo toàn tính tương thích với iOS background audio
 */
export class RntpPlayerService implements IPlayerService {
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private currentTracks: Track[] = [];
  private currentLockScreenTimerText: string | null = null;
  private listeners: Set<(state: PlayerState) => void> = new Set();
  private lastTrackEndTime: number | null = null;
  private gaplessDeltaMs: number | null = null;
  private progressTimer: ReturnType<typeof setInterval> | null = null;

  async setup(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      // Khởi tạo player với cấu hình nghe nhạc, dừng khi rút tai nghe, và bật disk cache + preloading ngầm
      await TrackPlayer.setupPlayer({
        contentType: 'music',
        handleAudioBecomingNoisy: true,
        cache: {
          maxSizeBytes: 500 * 1024 * 1024, // 500 MB streaming disk cache
          preloading: {
            window: 2, // Tự động nạp trước 2 bài tiếp theo trong hàng đợi
          },
        },
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
          transitionManager.updateQueue(this.currentTracks, event.item.mediaId);
          if (this.currentLockScreenTimerText) {
            this.updateLockScreenTimer(this.currentLockScreenTimerText);
          }
        }
        this.notifyListeners();
      });

      TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, () => {
        this.notifyListeners();
      });

      TrackPlayer.addEventListener(Event.IsPlayingChanged, (event) => {
        if (event.playing) {
          this.startProgressTimer();
        } else {
          this.stopProgressTimer();
        }
        this.notifyListeners();
      });

      TrackPlayer.addEventListener(Event.PlaybackStateChanged, () => {
        if (TrackPlayer.isPlaying()) {
          this.startProgressTimer();
        } else {
          this.stopProgressTimer();
        }
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

    const safeIndex = Math.min(Math.max(0, startIndex), validTracks.length - 1);

    // Tối ưu hoá độ trễ: Nếu danh sách bài hát không đổi so với hàng đợi hiện tại và player không bị lỗi,
    // chỉ cần gọi skipToIndex thay vì nạp lại toàn bộ mediaItems qua bridge Native
    let isPlayerInError: boolean;
    try {
      const playbackState = TrackPlayer.getPlaybackState();
      isPlayerInError = playbackState === PlaybackState.Error || playbackState === PlaybackState.Idle;
    } catch {
      isPlayerInError = true;
    }

    const isSameQueue =
      !isPlayerInError &&
      this.currentTracks.length === validTracks.length &&
      this.currentTracks.every((t, idx) => t.id === validTracks[idx]?.id);

    this.currentTracks = validTracks;

    try {
      if (isSameQueue) {
        TrackPlayer.skipToIndex(safeIndex);
        TrackPlayer.play();
        this.startProgressTimer();
        transitionManager.updateQueue(validTracks, validTracks[safeIndex]?.id ?? null);
        this.notifyListeners();
        return;
      }

      const mediaItems = validTracks.map((track) => ({
        mediaId: track.id,
        url: track.file,
        title: track.title,
        artist: track.artist,
        albumTitle: track.album,
        duration: track.duration,
        artworkUrl:
          track.cover && track.cover.startsWith('file://')
          ? track.cover
            : track.file.startsWith('file://')
        ? undefined
        : track.cover &&
          (track.cover.startsWith('http://') || track.cover.startsWith('https://'))
          ? track.cover
          : undefined,
      }));

    TrackPlayer.setMediaItems(mediaItems, safeIndex);
    TrackPlayer.play();
    this.startProgressTimer();
    transitionManager.updateQueue(validTracks, validTracks[safeIndex]?.id ?? null);
  } catch(err) {
    console.warn('[RNTP] Lỗi khởi tạo phát nhạc:', err);
  }
    this.notifyListeners();
  }

  async play(): Promise < void> {
  await this.setup();
  try {
    TrackPlayer.play();
    this.startProgressTimer();
  } catch(err) {
    console.warn('[RNTP] Lỗi play():', err);
    // Nếu play thất bại do lỗi trạng thái native AVPlayer, nạp lại mediaItems hiện tại
    if (this.currentTracks.length > 0) {
      const activeItem = TrackPlayer.getActiveMediaItem();
      const activeIdx = activeItem
        ? Math.max(0, this.currentTracks.findIndex((t) => t.id === activeItem.mediaId))
        : 0;
      await this.playQueue(this.currentTracks, activeIdx);
    }
  }
    this.notifyListeners();
}

  async pause(): Promise < void> {
  await this.setup();
  try {
    TrackPlayer.pause();
    this.stopProgressTimer();
    transitionManager.restoreBaseVolume('manual_pause');
  } catch(err) {
    console.warn('[RNTP] Lỗi pause():', err);
  }
    this.notifyListeners();
}

  async next(): Promise < void> {
  await this.setup();
  this.lastTrackEndTime = Date.now();
  try {
    transitionManager.restoreBaseVolume('manual_next');
    TrackPlayer.skipToNext();
  } catch(err) {
    console.warn('Không thể chuyển bài tiếp:', err);
  }
    this.notifyListeners();
}

  async previous(): Promise < void> {
  await this.setup();
  try {
    transitionManager.restoreBaseVolume('manual_previous');
    TrackPlayer.skipToPrevious();
  } catch(err) {
    console.warn('Không thể quay lại bài trước:', err);
  }
    this.notifyListeners();
}

  async skipToIndex(index: number): Promise < void> {
  await this.setup();
  if(index < 0 || index >= this.currentTracks.length) {
  console.warn(`[RNTP] skipToIndex ngoài phạm vi hàng đợi: ${index} (tổng ${this.currentTracks.length})`);
  return;
}
this.lastTrackEndTime = Date.now();
try {
  TrackPlayer.skipToIndex(index);
} catch (err) {
  console.warn('Không thể nhảy tới vị trí:', err);
}
this.notifyListeners();
  }

  async seekTo(seconds: number): Promise < void> {
  await this.setup();
  try {
    transitionManager.restoreBaseVolume('manual_seek');
    TrackPlayer.seekTo(seconds);
  } catch(err) {
    console.warn('Không thể tua nhạc:', err);
  }
    this.notifyListeners();
}

  async setRepeatMode(mode: RepeatMode): Promise < void> {
  await this.setup();
  let rntpMode: RntpRepeatMode;
  switch(mode) {
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

/**
 * Cập nhật hiển thị thời gian đếm ngược hẹn giờ (Sleep Timer) kín đáo ở góc ngoài màn hình khóa (Lock Screen)
 */
updateLockScreenTimer(timerText: string | null): void {
  this.currentLockScreenTimerText = timerText;
  try {
    const activeItem = TrackPlayer.getActiveMediaItem();
    if(!activeItem) return;
    const currentTrack = this.currentTracks.find((t) => t.id === activeItem.mediaId);
    const originalAlbum = currentTrack?.album || 'Beatify';
    const newAlbumTitle = timerText ? `${originalAlbum} • ⏳ ${timerText}` : originalAlbum;
    const index = this.currentTracks.findIndex((t) => t.id === activeItem.mediaId);
    if(index >= 0) {
  TrackPlayer.updateMetadata(index, {
    albumTitle: newAlbumTitle,
  });
}
    } catch {
  // Bỏ qua lỗi cập nhật metadata an toàn
}
  }

  async getQueue(): Promise < Track[] > {
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
  return() => {
  this.listeners.delete(listener);
};
  }

  private startProgressTimer(): void {
  if(this.progressTimer) return;
  this.progressTimer = setInterval(() => {
    const state = this.getCurrentState();
    if (state.isPlaying) {
      transitionManager.onPlaybackProgress(state.positionSec, state.durationSec);
    }
    this.notifyListeners();
  }, 250);
}

  private stopProgressTimer(): void {
  if(this.progressTimer) {
  clearInterval(this.progressTimer);
  this.progressTimer = null;
}
  }

  private notifyListeners(): void {
  const state = this.getCurrentState();
  for(const listener of this.listeners) {
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
