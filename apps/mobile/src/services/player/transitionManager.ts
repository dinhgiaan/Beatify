import { AppState, type AppStateStatus } from 'react-native';
import TrackPlayer from '@rntp/player';
import type { Track, TransitionCuePoints, TransitionLogEntry } from '@music-app/shared';
import {
  evaluateTransitionCompatibility,
  getTransitionCuePoints,
  calculateRealtimeFadeVolume,
} from '@music-app/shared';
import { gainToVolume } from '../../utils/gainToVolume';
import {
  loadTransitionSettings,
  saveTransitionSettings,
  appendTransitionLog,
  DEFAULT_TRANSITION_SETTINGS,
} from './transitionPreferences';

export class TransitionManager {
  private isEnabled = true;
  private durationSec = 4;
  private isSafeMode = false;

  private currentTrack: Track | null = null;
  private nextTrack: Track | null = null;
  private currentQueue: Track[] = [];
  private currentIndex = -1;

  private isFading = false;
  private fadeStartMs = 0;
  private fadeDurationSec = 4;
  private baseVolume = 1.0;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private preloadedTrackId: string | null = null;
  private lastHandledTrackId: string | null = null;
  private currentCuePoints: TransitionCuePoints | null = null;

  private appStateSubscription: { remove: () => void } | null = null;
  private currentAppState: AppStateStatus = 'active';

  constructor() {
    this.initSettings();
    this.setupAppStateListener();
  }

  private async initSettings(): Promise<void> {
    try {
      const prefs = await loadTransitionSettings();
      this.isEnabled = prefs.enabled;
      this.durationSec = prefs.durationSec;
      this.isSafeMode = prefs.safeMode;
    } catch (err) {
      console.warn('[TransitionManager] Lỗi nạp settings:', err);
      this.isEnabled = DEFAULT_TRANSITION_SETTINGS.enabled;
      this.durationSec = DEFAULT_TRANSITION_SETTINGS.durationSec;
      this.isSafeMode = DEFAULT_TRANSITION_SETTINGS.safeMode;
    }
  }

  private setupAppStateListener(): void {
    try {
      this.currentAppState = AppState.currentState;
      this.appStateSubscription = AppState.addEventListener('change', (nextState) => {
        const prevState = this.currentAppState;
        this.currentAppState = nextState;

        // Nếu app quay lại Foreground từ Background: khôi phục ngay âm lượng ReplayGain phòng trường hợp JS timer bị iOS freeze
        if (prevState !== 'active' && nextState === 'active') {
          if (this.isFading) {
            // Kiểm tra xem thời gian fade đã quá hạn chưa
            const now = Date.now();
            if (now - this.fadeStartMs >= this.fadeDurationSec * 1000) {
              this.completeTransition('app_foreground_wakeup');
            } else {
              // Cập nhật lại volume chính xác theo thời gian thực đã trôi qua
              const realTimeVol = calculateRealtimeFadeVolume(
                this.baseVolume,
                this.fadeStartMs,
                this.fadeDurationSec,
                now,
                true
              );
              TrackPlayer.setVolume(realTimeVol);
            }
          } else {
            this.restoreBaseVolume('app_foreground');
          }
        }
      });
    } catch (err) {
      console.warn('[TransitionManager] Không thể gắn AppState listener:', err);
    }
  }

  public updateSettings(settings: { enabled?: boolean; durationSec?: number; safeMode?: boolean }): void {
    if (settings.enabled !== undefined) this.isEnabled = settings.enabled;
    if (settings.durationSec !== undefined) this.durationSec = settings.durationSec;
    if (settings.safeMode !== undefined) this.isSafeMode = settings.safeMode;

    saveTransitionSettings({
      enabled: this.isEnabled,
      durationSec: this.durationSec,
      safeMode: this.isSafeMode,
    }).catch((err) => console.warn('[TransitionManager] Lỗi lưu settings:', err));

    if (!this.isEnabled) {
      this.restoreBaseVolume('disabled');
    }
  }

  public getSettings() {
    return {
      enabled: this.isEnabled,
      durationSec: this.durationSec,
      safeMode: this.isSafeMode,
    };
  }

  /**
   * Cập nhật hàng đợi và vị trí bài hát hiện tại
   */
  public updateQueue(queue: Track[], activeTrackId: string | null): void {
    this.currentQueue = queue;
    if (!activeTrackId) {
      this.currentTrack = null;
      this.nextTrack = null;
      this.currentIndex = -1;
      return;
    }

    const idx = queue.findIndex((t) => t.id === activeTrackId);
    if (idx !== -1) {
      if (this.currentIndex !== idx || this.currentTrack?.id !== activeTrackId) {
        // Đổi bài mới: khôi phục volume và reset trạng thái fade
        this.currentIndex = idx;
        this.currentTrack = queue[idx] || null;
        this.nextTrack = idx + 1 < queue.length ? queue[idx + 1] || null : null;
        this.lastHandledTrackId = null;
        this.preloadedTrackId = null;
        this.currentCuePoints = null;
        this.restoreBaseVolume('track_changed');
      }
    }
  }

  /**
   * Lắng nghe tiến độ phát nhạc theo thời gian thực để kích hoạt preload và transition
   */
  public onPlaybackProgress(positionSec: number, durationSec: number): void {
    if (!this.isEnabled || !this.currentTrack || durationSec <= 5) {
      return;
    }

    // Không chuyển bài nếu đang là bài cuối hàng đợi
    if (!this.nextTrack) {
      return;
    }

    // Đảm bảo không xử lý lặp lại trên cùng một bài hát khi đã bắt đầu transition
    if (this.lastHandledTrackId === this.currentTrack.id) {
      return;
    }

    try {
      // 1. Tính toán điểm cue point nếu chưa có
      if (!this.currentCuePoints) {
        const compat = evaluateTransitionCompatibility(this.currentTrack, this.nextTrack, this.durationSec);
        this.currentCuePoints = getTransitionCuePoints(
          this.currentTrack,
          this.nextTrack,
          compat.recommendedFadeDurationSec
        );
      }

      const cue = this.currentCuePoints;

      // 2. Preload bài kế tiếp sớm khoảng 10 giây trước khi fade
      const preloadThreshold = Math.max(0, cue.fadeStartSec - 10);
      if (positionSec >= preloadThreshold && this.preloadedTrackId !== this.nextTrack.id) {
        this.preloadedTrackId = this.nextTrack.id;
        try {
          TrackPlayer.preload(
            {
              url: this.nextTrack.file,
              mediaId: this.nextTrack.id,
              title: this.nextTrack.title,
              artist: this.nextTrack.artist,
              albumTitle: this.nextTrack.album,
            },
            { duration: 15 }
          );
        } catch (preloadErr) {
          console.warn('[TransitionManager] Preload lỗi (bỏ qua an toàn):', preloadErr);
        }
      }

      // 3. Kích hoạt chuyển bài khi chạm mốc fadeStartSec
      if (positionSec >= cue.fadeStartSec) {
        this.lastHandledTrackId = this.currentTrack.id;
        this.triggerTransition(this.currentTrack, this.nextTrack, cue);
      }
    } catch (err) {
      console.warn('[TransitionManager] Lỗi xử lý progress (fallback):', err);
    }
  }

  /**
   * Bắt đầu quy trình chuyển bài thông minh (Smart Transition)
   */
  private triggerTransition(trackA: Track, trackB: Track, cue: TransitionCuePoints): void {
    try {
      this.baseVolume = gainToVolume(trackA.replayGain);
      this.fadeDurationSec = cue.actualFadeDurationSec;
      this.fadeStartMs = Date.now();
      this.isFading = true;

      const compat = evaluateTransitionCompatibility(trackA, trackB, this.durationSec);

      // Chế độ an toàn: Không hạ volume bằng JS timer, chỉ chuyển bài ở cue point
      if (this.isSafeMode) {
        this.executeTrackSwitch(trackB, cue, compat, 'safe_mode');
        return;
      }

      // Bắt đầu hạ âm lượng theo thời gian thực (50ms mỗi tick)
      if (this.fadeTimer) clearInterval(this.fadeTimer);

      this.fadeTimer = setInterval(() => {
        const now = Date.now();
        const currentVol = calculateRealtimeFadeVolume(
          this.baseVolume,
          this.fadeStartMs,
          this.fadeDurationSec,
          now,
          true
        );

        TrackPlayer.setVolume(currentVol);

        if (now - this.fadeStartMs >= this.fadeDurationSec * 1000) {
          if (this.fadeTimer) {
            clearInterval(this.fadeTimer);
            this.fadeTimer = null;
          }
          this.executeTrackSwitch(trackB, cue, compat, 'equal_power_completed');
        }
      }, 50);
    } catch (err) {
      console.warn('[TransitionManager] Lỗi triggerTransition:', err);
      this.restoreBaseVolume('error_fallback');
    }
  }

  /**
   * Thực hiện hoán chuyển bài sang bài tiếp theo tại mốc introEnd
   */
  private executeTrackSwitch(
    trackB: Track,
    cue: TransitionCuePoints,
    compat: ReturnType<typeof evaluateTransitionCompatibility>,
    statusReason: string
  ): void {
    const nextIdx = this.currentIndex + 1;
    const targetVolume = gainToVolume(trackB.replayGain);

    try {
      TrackPlayer.skipToIndex(nextIdx);

      // Nhảy đến điểm introEnd của bài mới (nếu có)
      if (cue.nextStartSec > 0) {
        TrackPlayer.seekTo(cue.nextStartSec);
      }

      // Khôi phục volume chuẩn cho bài tiếp theo ngay lập tức
      TrackPlayer.setVolume(targetVolume);
      this.isFading = false;
      this.fadeTimer = null;

      // Ghi log chẩn đoán
      const logEntry: TransitionLogEntry = {
        id: `${Date.now()}_${trackB.id}`,
        timestamp: new Date().toISOString(),
        fromTrackId: this.currentTrack?.id || 'unknown',
        fromTrackTitle: this.currentTrack?.title || 'Unknown',
        toTrackId: trackB.id,
        toTrackTitle: trackB.title,
        fromBpm: this.currentTrack?.bpm,
        toBpm: trackB.bpm,
        bpmDeltaPercent: compat.bpmDeltaPercent ?? undefined,
        fromKey: this.currentTrack?.key,
        toKey: trackB.key,
        camelotRelation: compat.relation,
        configuredDurationSec: this.durationSec,
        actualFadeDurationSec: cue.actualFadeDurationSec,
        fadeStartTimeMs: this.fadeStartMs,
        fadeEndTimeMs: Date.now(),
        appState: (this.currentAppState === 'active' ? 'active' : 'background') as 'active' | 'background',
        finalVolume: targetVolume,
        isSafeMode: this.isSafeMode,
        status: 'completed',
        reason: statusReason,
      };

      appendTransitionLog(logEntry).catch((err) => console.warn('[TransitionManager] Log write error:', err));
    } catch (err) {
      console.warn('[TransitionManager] Lỗi executeTrackSwitch:', err);
      this.restoreBaseVolume('switch_error');
    }
  }

  /**
   * Hoàn thành transition ngay lập tức (dùng khi app thức dậy từ nền)
   */
  private completeTransition(reason: string): void {
    if (this.fadeTimer) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
    this.isFading = false;
    this.restoreBaseVolume(reason);
  }

  /**
   * Khôi phục âm lượng gốc của bài hiện tại dựa trên ReplayGain
   * Đảm bảo TUYỆT ĐỐI không để âm lượng bị kẹt ở mức thấp
   */
  public restoreBaseVolume(reason: string): void {
    if (this.fadeTimer) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
    this.isFading = false;

    try {
      const vol = gainToVolume(this.currentTrack?.replayGain);
      TrackPlayer.setVolume(vol);
    } catch (err) {
      console.warn(`[TransitionManager] Lỗi restoreBaseVolume (${reason}):`, err);
    }
  }

  public destroy(): void {
    if (this.fadeTimer) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
    if (this.appStateSubscription && typeof this.appStateSubscription.remove === 'function') {
      this.appStateSubscription.remove();
    }
  }
}

// Singleton TransitionManager cho toàn ứng dụng
export const transitionManager = new TransitionManager();
