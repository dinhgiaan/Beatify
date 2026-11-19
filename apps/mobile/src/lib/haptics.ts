/**
 * Vô hiệu hóa toàn bộ rung phản hồi xúc giác (Haptics) trên toàn app theo yêu cầu người dùng
 */
export const haptics = {
  /** Chạm nhẹ (selection/tap) - Đã tắt hoàn toàn */
  tap: async (): Promise<void> => {},

  /** Thành công (yêu thích, lưu) - Đã tắt hoàn toàn */
  success: async (): Promise<void> => {},

  /** Cảnh báo / Xóa - Đã tắt hoàn toàn */
  warning: async (): Promise<void> => {},
};
