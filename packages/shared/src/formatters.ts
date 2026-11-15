/**
 * Các hàm định dạng dùng chung (pure functions) cho Beatify
 * Chạy được trên cả Hermes (mobile), Worker, Node và trình duyệt
 */

export interface FormattedDate {
  date: string;
  time: string;
  full: string;
  relative: string;
}

/**
 * Định dạng thời gian tải (ngày, giờ, relative time theo chuẩn tiếng Việt)
 */
export function formatDownloadDate(dateStr?: string | null): FormattedDate {
  if (!dateStr) {
    return { date: '---', time: '--:--', full: 'Chưa có thông tin', relative: '---' };
  }
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      return { date: '---', time: '--:--', full: 'Chưa có thông tin', relative: '---' };
    }
    const date = d.toLocaleDateString('vi-VN');
    const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const full = `${time} ngày ${date}`;

    // Tính thời gian tương đối
    const now = Date.now();
    const diffSec = Math.floor((now - d.getTime()) / 1000);
    let relative = full;
    if (diffSec < 60) {
      relative = 'Vừa xong';
    } else if (diffSec < 3600) {
      relative = `${Math.floor(diffSec / 60)} phút trước`;
    } else if (diffSec < 86400) {
      relative = `${Math.floor(diffSec / 3600)} giờ trước`;
    } else if (diffSec < 86400 * 2) {
      relative = `Hôm qua ${time}`;
    } else if (diffSec < 86400 * 7) {
      relative = `${Math.floor(diffSec / 86400)} ngày trước`;
    } else {
      relative = date;
    }

    return { date, time, full, relative };
  } catch {
    return { date: '---', time: '--:--', full: 'Chưa có thông tin', relative: '---' };
  }
}

/**
 * Định dạng dung lượng byte ra MB hoặc GB
 */
export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

/**
 * Định dạng số giây sang dạng phút:giây (mm:ss)
 */
export function formatSeconds(sec?: number | null): string {
  if (!sec || isNaN(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Định dạng chuỗi đếm ngược Sleep Timer hiển thị trên dòng Nghệ sĩ ngoài màn hình khóa (Lock Screen).
 * Quy tắc:
 * - Nếu remainingSec <= 0 hoặc null/undefined: trả về null (hết giờ hoặc không có timer).
 * - Nếu remainingSec <= 60: trả về "còn {sec} giây" (chuyển sang từng giây trong 60s cuối).
 * - Nếu remainingSec > 60: trả về "còn {phút} phút" (làm tròn lên Math.ceil để không hiện "còn 0 phút").
 */
export function formatLockScreenTimer(remainingSec?: number | null): string | null {
  if (remainingSec == null || remainingSec <= 0 || isNaN(remainingSec)) {
    return null;
  }
  if (remainingSec <= 60) {
    return `còn ${remainingSec} giây`;
  }
  const mins = Math.ceil(remainingSec / 60);
  return `còn ${mins} phút`;
}


