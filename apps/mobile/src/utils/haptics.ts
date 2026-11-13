import * as Haptics from 'expo-haptics';

/**
 * Kích hoạt rung phản hồi xúc giác nhẹ (Haptics) khi tương tác UI chuẩn iOS
 */
export function triggerSelectionHaptic(): void {
  try {
    void Haptics.selectionAsync();
  } catch {
    // Bỏ qua nếu thiết bị không hỗ trợ hoặc chạy trên môi trường test
  }
}

