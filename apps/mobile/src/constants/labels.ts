/**
 * Chuỗi hằng số và nhãn hiển thị thống nhất chuẩn phong cách Apple
 * Tuân thủ yêu cầu không trùng lặp, dùng thuật ngữ nhất quán trên toàn app.
 */

export const STATS_LABELS = {
  // Thống nhất 2 thuật ngữ chính theo yêu cầu
  PLAYS: 'Lượt nghe',
  MINUTES: 'Phút nghe',

  // Các nhãn bổ trợ
  TRACKS_IN_LIBRARY: 'Kho bài hát',
  MILESTONES_ACHIEVED: 'Cột mốc đạt',
  TOP_ARTIST: 'Nghệ sĩ nghe nhiều nhất',
  TOP_TRACK: 'Bài hát nghe nhiều nhất',
  ALL_TIME: 'Toàn bộ thời gian',
  THIS_WEEK: 'Tuần này',
  THIS_MONTH: 'Tháng này',
  THIS_YEAR: 'Năm nay',
  MEMORIES: 'Kỷ niệm',
} as const;

/**
 * Bộ từ điển ánh xạ toàn bộ enum kỹ thuật thô của Smart Transition sang tiếng Việt tự nhiên
 */
export const TRANSITION_MAP = {
  // Lý do hoàn thành / loại chuyển bài (reason)
  reasons: {
    equal_power_completed: 'Hòa âm hoàn tất',
    safe_mode_crossfade: 'Chuyển bài an toàn',
    natural_end: 'Hết bài tự nhiên',
    manual_skip: 'Chuyển thủ công',
    interrupted: 'Bị ngắt quãng',
    error_fallback: 'Dự phòng lỗi',
  } as Record<string, string>,

  // Trạng thái ứng dụng khi chuyển bài (appState)
  appStates: {
    active: 'Màn hình chính',
    background: 'Phát chạy nền',
    inactive: 'Đang chờ',
  } as Record<string, string>,

  // Mối quan hệ khóa điệu Camelot (camelotRelation)
  camelotRelations: {
    same: { label: 'Cùng tông', detail: 'Hài hòa tuyệt đối' },
    adjacent: { label: 'Tông liền kề', detail: 'Bậc 5 (±1H)' },
    relative: { label: 'Đổi hệ (A/B)', detail: 'Trưởng/Thứ tương đương' },
    energy_boost: { label: 'Tăng năng lượng', detail: '+2H kích thích nhịp' },
    incompatible: { label: 'Tự do', detail: 'Chuyển bài fade mượt' },
  } as Record<string, { label: string; detail: string }>,
} as const;

export function formatTransitionReason(rawReason?: string): string {
  if (!rawReason) return 'Chuyển bài mượt';
  return TRANSITION_MAP.reasons[rawReason] || rawReason.replace(/_/g, ' ');
}

export function formatAppState(rawState?: string): string {
  if (!rawState) return 'Chạy nền';
  const lower = rawState.toLowerCase();
  return TRANSITION_MAP.appStates[lower] || rawState;
}

export function formatCamelotRelation(relation?: string): { label: string; detail: string } {
  if (!relation || !(relation in TRANSITION_MAP.camelotRelations)) {
    return { label: 'Tự do', detail: 'Fade âm lượng' };
  }
  const found = TRANSITION_MAP.camelotRelations[relation as keyof typeof TRANSITION_MAP.camelotRelations];
  return found ?? { label: 'Tự do', detail: 'Fade âm lượng' };
}
