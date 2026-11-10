/**
 * Hằng số bố cục và Breakpoints cho Beatify Mobile
 */
export const layout = {
  // Vùng chạm tối thiểu theo chuẩn Human Interface Guidelines của Apple
  minTouchTarget: 44,

  // Giới hạn độ rộng tối đa trên màn hình rộng / iPad
  maxContentWidth: 720,

  // Giới hạn chiều cao thân cuộn của Modal Bottom Sheet
  modalBodyMinHeight: 220,
  modalBodyMaxHeight: 420,

  // Khoảng đệm lề hai bên theo từng kích thước màn hình
  gutter: {
    compact: 16,
    medium: 24,
    expanded: 32,
  },

  // Ngưỡng phân loại màn hình
  breakpoints: {
    compact: 600,
    medium: 840,
  },
} as const;

export type LayoutConstants = typeof layout;

