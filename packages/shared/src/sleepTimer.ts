import { formatLockScreenTimer } from './formatters';

/**
 * Trạng thái của Sleep Timer (Hẹn giờ tắt nhạc)
 * Hoạt động dựa trên mốc thời gian thực tế (Wall-Clock Timestamp) bằng Date.now().
 *
 * Lưu ý về thiết kế:
 * Mốc tắt được tính cố định targetMs = Date.now() + minutes * 60 * 1000.
 * Nếu nhạc bị Pause lâu hơn thời lượng còn lại (quá targetMs), khi bấm Play trở lại
 * hệ thống sẽ nhận diện đã hết giờ và tự động hủy phiên hẹn giờ để nhạc phát bình thường,
 * không dừng nhạc đột ngột.
 */
export interface SleepTimerState {
  targetMs: number | null;
  minutes: number | null;
  remainingSec: number | null;
  lastLockScreenText: string | null;
}

export interface SleepTimerStepResult {
  nextState: SleepTimerState;
  shouldPauseMusic: boolean;
  updateLockScreen: boolean;
  lockScreenText: string | null;
}

export const INITIAL_SLEEP_TIMER_STATE: SleepTimerState = {
  targetMs: null,
  minutes: null,
  remainingSec: null,
  lastLockScreenText: null,
};

/**
 * Xác định xem trình phát có đang ở trạng thái Tạm dừng (Paused) thực sự hay không.
 * Các trạng thái tạm thời như đang tải (buffering/loading) hoặc tua bài (seeking) KHÔNG được coi là Pause,
 * nhằm tránh làm nháy chuỗi đếm ngược trên màn hình khóa.
 */
export function isPlaybackTrulyPaused(isPlaying: boolean, isBuffering = false): boolean {
  return !isPlaying && !isBuffering;
}

/**
 * Khởi tạo hoặc đặt lại Sleep Timer
 */
export function setSleepTimerState(
  minutes: number | null,
  now: number,
  isPlaying: boolean
): SleepTimerStepResult {
  if (minutes === null || minutes <= 0 || isNaN(minutes)) {
    return {
      nextState: { ...INITIAL_SLEEP_TIMER_STATE },
      shouldPauseMusic: false,
      updateLockScreen: true,
      lockScreenText: null,
    };
  }

  const targetMs = now + minutes * 60 * 1000;
  const remainingSec = minutes * 60;
  const timerText = isPlaying ? formatLockScreenTimer(remainingSec) : null;

  return {
    nextState: {
      targetMs,
      minutes,
      remainingSec,
      lastLockScreenText: timerText,
    },
    shouldPauseMusic: false,
    updateLockScreen: isPlaying,
    lockScreenText: timerText,
  };
}

/**
 * Xử lý khi trạng thái phát nhạc thay đổi (Play / Pause)
 */
export function handleSleepTimerPlaybackChange(
  prevState: SleepTimerState,
  isPlaying: boolean,
  now: number
): SleepTimerStepResult {
  // Nếu không có timer nào đang chạy
  if (!prevState.targetMs) {
    return {
      nextState: prevState,
      shouldPauseMusic: false,
      updateLockScreen: false,
      lockScreenText: null,
    };
  }

  if (!isPlaying) {
    // 1. Khi Pause: Khôi phục ngay tên ca sĩ gốc ngoài Lock Screen
    // Tránh việc chuỗi "còn X phút" bị đóng băng khi iOS đình chỉ (suspend) tiến trình JavaScript
    return {
      nextState: {
        ...prevState,
        lastLockScreenText: null,
      },
      shouldPauseMusic: false,
      updateLockScreen: true,
      lockScreenText: null,
    };
  }

  // 2. Khi Play trở lại: Tính lại thời gian bằng Date.now()
  const diffMs = prevState.targetMs - now;

  if (diffMs <= 0) {
    // Tình huống: Hẹn giờ đã hết trong lúc Pause
    // Phát nhạc bình thường, xóa phiên hẹn giờ, không hiện đếm ngược cũ và không dừng nhạc ngay.
    return {
      nextState: { ...INITIAL_SLEEP_TIMER_STATE },
      shouldPauseMusic: false,
      updateLockScreen: true,
      lockScreenText: null,
    };
  }

  // Tình huống: Hẹn giờ vẫn còn hiệu lực
  const remainingSec = Math.ceil(diffMs / 1000);
  const timerText = formatLockScreenTimer(remainingSec);
  const textChanged = timerText !== prevState.lastLockScreenText;

  return {
    nextState: {
      ...prevState,
      remainingSec,
      lastLockScreenText: timerText,
    },
    shouldPauseMusic: false,
    updateLockScreen: textChanged,
    lockScreenText: timerText,
  };
}

/**
 * Xử lý tick mỗi giây của bộ đếm thời gian
 */
export function handleSleepTimerTick(
  prevState: SleepTimerState,
  isPlaying: boolean,
  now: number
): SleepTimerStepResult {
  if (!prevState.targetMs) {
    return {
      nextState: prevState,
      shouldPauseMusic: false,
      updateLockScreen: false,
      lockScreenText: null,
    };
  }

  const diffMs = prevState.targetMs - now;

  // Nếu nhạc đang Pause: không cập nhật lock screen và không can thiệp tắt nhạc
  if (!isPlaying) {
    if (diffMs <= 0) {
      // Quá hạn khi đang Pause: xóa phiên hẹn giờ (UI về null), không can thiệp tắt nhạc, lock screen giữ tên gốc
      return {
        nextState: { ...INITIAL_SLEEP_TIMER_STATE },
        shouldPauseMusic: false,
        updateLockScreen: false,
        lockScreenText: null,
      };
    }
    const remainingSec = Math.ceil(diffMs / 1000);
    return {
      nextState: {
        ...prevState,
        remainingSec,
      },
      shouldPauseMusic: false,
      updateLockScreen: false,
      lockScreenText: null,
    };
  }

  // Khi nhạc đang phát:
  if (diffMs <= 0) {
    // Hết giờ khi đang phát: Dừng nhạc và hủy phiên hẹn giờ
    return {
      nextState: { ...INITIAL_SLEEP_TIMER_STATE },
      shouldPauseMusic: true,
      updateLockScreen: true,
      lockScreenText: null,
    };
  }

  // Đang phát và còn thời gian
  const remainingSec = Math.ceil(diffMs / 1000);
  const timerText = formatLockScreenTimer(remainingSec);
  const textChanged = timerText !== prevState.lastLockScreenText;

  return {
    nextState: {
      ...prevState,
      remainingSec,
      lastLockScreenText: timerText,
    },
    shouldPauseMusic: false,
    updateLockScreen: textChanged,
    lockScreenText: timerText,
  };
}

