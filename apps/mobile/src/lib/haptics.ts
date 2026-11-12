import * as Haptics from 'expo-haptics';

/**
 * Haptic feedback wrapper an toàn, nhẹ nhàng kiểu Apple
 */
export const haptics = {
  /** Chạm nhẹ (selection/tap) */
  tap: async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // bỏ qua nếu thiết bị không hỗ trợ
    }
  },

  /** Thành công (yêu thích, lưu) */
  success: async () => {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // bỏ qua
    }
  },

  /** Cảnh báo / Xóa */
  warning: async () => {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {
      // bỏ qua
    }
  },
};

