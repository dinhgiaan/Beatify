import { describe, it, expect } from 'vitest';
import {
  setSleepTimerState,
  handleSleepTimerPlaybackChange,
  handleSleepTimerTick,
  isPlaybackTrulyPaused,
  type SleepTimerState,
} from './sleepTimer';

describe('Kiểm thử Sleep Timer Decision Engine & State Transitions', () => {
  const BASE_TIME = 1700000000000; // Mốc thời gian giả lập cố định (ms)

  it('1. Khởi tạo hẹn giờ 15 phút khi đang phát: đặt targetMs chuẩn và gửi chuỗi đếm ngược', () => {
    const result = setSleepTimerState(15, BASE_TIME, true);

    expect(result.nextState.targetMs).toBe(BASE_TIME + 15 * 60 * 1000);
    expect(result.nextState.minutes).toBe(15);
    expect(result.nextState.remainingSec).toBe(900);
    expect(result.nextState.lastLockScreenText).toBe('còn 15 phút');
    expect(result.updateLockScreen).toBe(true);
    expect(result.lockScreenText).toBe('còn 15 phút');
    expect(result.shouldPauseMusic).toBe(false);
  });

  it('2. Khởi tạo hẹn giờ khi nhạc đang Pause: không gửi chuỗi lên lock screen cho đến khi Play', () => {
    const result = setSleepTimerState(15, BASE_TIME, false);

    expect(result.nextState.targetMs).toBe(BASE_TIME + 15 * 60 * 1000);
    expect(result.nextState.lastLockScreenText).toBeNull();
    expect(result.updateLockScreen).toBe(false);
  });

  it('3. Pause khi đang đếm ngược: trả về tên ca sĩ gốc (lockScreenText: null), targetMs giữ nguyên', () => {
    const activeState: SleepTimerState = {
      targetMs: BASE_TIME + 15 * 60 * 1000,
      minutes: 15,
      remainingSec: 900,
      lastLockScreenText: 'còn 15 phút',
    };

    // Người dùng bấm Pause lúc 2 phút sau
    const now = BASE_TIME + 2 * 60 * 1000;
    const result = handleSleepTimerPlaybackChange(activeState, false, now);

    expect(result.nextState.targetMs).toBe(activeState.targetMs); // Mốc giờ thực giữ nguyên
    expect(result.nextState.lastLockScreenText).toBeNull();
    expect(result.updateLockScreen).toBe(true);
    expect(result.lockScreenText).toBeNull(); // Trả về tên ca sĩ gốc
    expect(result.shouldPauseMusic).toBe(false);
  });

  it('4. Play trước khi hết giờ: tính lại thời gian còn lại bằng Date.now() và hiện lại đếm ngược', () => {
    // Đang pause ở mốc còn 13 phút (targetMs = BASE_TIME + 15 phút, now = BASE_TIME + 2 phút)
    const pausedState: SleepTimerState = {
      targetMs: BASE_TIME + 15 * 60 * 1000,
      minutes: 15,
      remainingSec: 780,
      lastLockScreenText: null, // Đang ở tên gốc
    };

    // Người dùng bấm Play lúc 5 phút sau (còn 10 phút)
    const now = BASE_TIME + 5 * 60 * 1000;
    const result = handleSleepTimerPlaybackChange(pausedState, true, now);

    expect(result.nextState.remainingSec).toBe(10 * 60);
    expect(result.nextState.lastLockScreenText).toBe('còn 10 phút');
    expect(result.updateLockScreen).toBe(true);
    expect(result.lockScreenText).toBe('còn 10 phút');
    expect(result.shouldPauseMusic).toBe(false);
  });

  it('5. Play sau khi đã hết giờ trong lúc Pause: tự động xóa timer, không dừng nhạc ngay, phát bình thường', () => {
    // Hẹn giờ 15 phút (targetMs = BASE_TIME + 15 phút)
    const pausedState: SleepTimerState = {
      targetMs: BASE_TIME + 15 * 60 * 1000,
      minutes: 15,
      remainingSec: 300,
      lastLockScreenText: null,
    };

    // Người dùng bấm Play lúc 20 phút sau (đã quá hạn 5 phút)
    const now = BASE_TIME + 20 * 60 * 1000;
    const result = handleSleepTimerPlaybackChange(pausedState, true, now);

    // Phiên hẹn giờ bị xóa sạch
    expect(result.nextState.targetMs).toBeNull();
    expect(result.nextState.minutes).toBeNull();
    expect(result.nextState.remainingSec).toBeNull();
    expect(result.nextState.lastLockScreenText).toBeNull();
    expect(result.updateLockScreen).toBe(true);
    expect(result.lockScreenText).toBeNull();
    // Quan trọng: KHÔNG được dừng nhạc ngay, nhạc phải phát bình thường
    expect(result.shouldPauseMusic).toBe(false);
  });

  it('6. Tick khi đang phát và hết giờ: kích hoạt pause nhạc và xóa timer', () => {
    const runningState: SleepTimerState = {
      targetMs: BASE_TIME + 1000, // Chỉ còn 1 giây
      minutes: 1,
      remainingSec: 1,
      lastLockScreenText: 'còn 1 giây',
    };

    // Tick tại thời điểm hết giờ
    const now = BASE_TIME + 1500;
    const result = handleSleepTimerTick(runningState, true, now);

    expect(result.shouldPauseMusic).toBe(true); // Lệnh dừng nhạc được kích hoạt
    expect(result.nextState.targetMs).toBeNull();
    expect(result.updateLockScreen).toBe(true);
    expect(result.lockScreenText).toBeNull();
  });

  it('7. Hủy hẹn giờ (truyền minutes null hoặc <= 0): khôi phục toàn bộ về trạng thái ban đầu', () => {
    const cancel1 = setSleepTimerState(null, BASE_TIME, true);
    expect(cancel1.nextState.targetMs).toBeNull();
    expect(cancel1.updateLockScreen).toBe(true);
    expect(cancel1.lockScreenText).toBeNull();

    const cancel2 = setSleepTimerState(0, BASE_TIME, true);
    expect(cancel2.nextState.targetMs).toBeNull();
    expect(cancel2.updateLockScreen).toBe(true);
    expect(cancel2.lockScreenText).toBeNull();
  });

  it('8. isPlaybackTrulyPaused phân biệt chính xác Pause thật sự và trạng thái tạm thời (Buffering / Tua bài)', () => {
    // Đang phát bình thường: không phải pause
    expect(isPlaybackTrulyPaused(true, false)).toBe(false);

    // Đang tải / nạp đệm dữ liệu (Buffering) hoặc đang tua bài (Seeking): KHÔNG bị coi là Pause
    expect(isPlaybackTrulyPaused(false, true)).toBe(false);
    expect(isPlaybackTrulyPaused(true, true)).toBe(false);

    // Người dùng bấm Pause thật sự (không phát và không buffering): LÀ Pause thật sự
    expect(isPlaybackTrulyPaused(false, false)).toBe(true);
  });

  it('9. Kiểm thử từng trạng thái cụ thể của RNTP: Idle, Ready, Buffering, Ended, Error', () => {
    // Buffering khi đang phát hoặc đang tua: KHÔNG coi là pause (không nháy màn hình khóa)
    expect(isPlaybackTrulyPaused(false, true)).toBe(false); // PlaybackState.Buffering
    expect(isPlaybackTrulyPaused(true, true)).toBe(false);

    // Ready nhưng isPlaying = false: người dùng bấm Tạm dừng
    expect(isPlaybackTrulyPaused(false, false)).toBe(true); // PlaybackState.Ready (Paused)

    // Ready và isPlaying = true: đang nghe bình thường
    expect(isPlaybackTrulyPaused(true, false)).toBe(false); // PlaybackState.Ready (Playing)

    // Idle: player chưa nạp bài hoặc đã dừng hẳn
    expect(isPlaybackTrulyPaused(false, false)).toBe(true); // PlaybackState.Idle

    // Ended / Error: dừng phát
    expect(isPlaybackTrulyPaused(false, false)).toBe(true); // PlaybackState.Ended / Error
  });

  it('10. Tick khi nhạc đang Pause: remainingSec vẫn giảm theo giờ thực nhưng KHÔNG gửi update lock screen và KHÔNG can thiệp tắt nhạc', () => {
    const pausedState: SleepTimerState = {
      targetMs: BASE_TIME + 600 * 1000, // 10 phút
      minutes: 10,
      remainingSec: 600,
      lastLockScreenText: null, // Đang ở tên gốc
    };

    // Giả lập tick sau 30 giây trong lúc vẫn đang Pause
    const now = BASE_TIME + 30 * 1000;
    const result = handleSleepTimerTick(pausedState, false, now);

    expect(result.nextState.remainingSec).toBe(570);
    expect(result.updateLockScreen).toBe(false); // Không update lock screen khi pause
    expect(result.shouldPauseMusic).toBe(false); // Không can thiệp tắt nhạc
  });

  it('11. Pause, quá hạn, tick, UI về null, nhạc không bị can thiệp, Play sau đó phát bình thường', () => {
    // 1. Đang Pause và có hẹn giờ 15 phút
    const pausedState: SleepTimerState = {
      targetMs: BASE_TIME + 15 * 60 * 1000,
      minutes: 15,
      remainingSec: 900,
      lastLockScreenText: null, // Lock screen đang ở tên nghệ sĩ gốc do Pause
    };

    // 2. Quá hạn khi đang Pause (20 phút sau, quá hạn 5 phút): tick xảy ra (khi app mở hoặc foreground)
    const expiredTime = BASE_TIME + 20 * 60 * 1000;
    const tickResult = handleSleepTimerTick(pausedState, false, expiredTime);

    // Xác nhận: xóa phiên hẹn giờ (UI về null), không can thiệp dừng nhạc, lock screen không update
    expect(tickResult.nextState.targetMs).toBeNull();
    expect(tickResult.nextState.minutes).toBeNull();
    expect(tickResult.nextState.remainingSec).toBeNull();
    expect(tickResult.shouldPauseMusic).toBe(false);
    expect(tickResult.updateLockScreen).toBe(false);
    expect(tickResult.lockScreenText).toBeNull();

    // 3. Sau đó người dùng bấm Play: phát nhạc bình thường, không bị dừng hay can thiệp
    const playResult = handleSleepTimerPlaybackChange(tickResult.nextState, true, expiredTime + 1000);
    expect(playResult.nextState.targetMs).toBeNull();
    expect(playResult.nextState.minutes).toBeNull();
    expect(playResult.shouldPauseMusic).toBe(false); // Phát bình thường
    expect(playResult.updateLockScreen).toBe(false);
    expect(playResult.lockScreenText).toBeNull();
  });
});


