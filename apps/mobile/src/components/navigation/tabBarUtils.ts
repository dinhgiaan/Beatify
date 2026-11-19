export interface RouteDescriptor {
  key: string;
  name: string;
  options?: {
    href?: string | null;
    title?: string;
  };
}

/**
 * Tính toán chỉ số tab hiển thị đang active từ danh sách routes và route đang chọn.
 * - Loại bỏ các route ẩn (options.href === null)
 * - Nếu route đang active là route ẩn (e.g. recent), giữ nguyên lastValidIndex, không trả về -1 hay NaN
 */
export function calculateVisibleTabIndex(
  routes: readonly { key: string; name: string }[],
  descriptors: Record<string, RouteDescriptor | undefined>,
  activeRouteKey: string | undefined,
  lastValidIndex = 0
): number {
  if (!routes || routes.length === 0) return 0;

  // Lọc chỉ các route hiển thị trên TabBar
  const visibleRoutes = routes.filter((route) => {
    const desc = descriptors[route.key];
    return desc?.options?.href !== null;
  });

  if (visibleRoutes.length === 0) return 0;

  const foundIndex = visibleRoutes.findIndex((r) => r.key === activeRouteKey);

  // Nếu tìm thấy trong visibleRoutes: trả về index hợp lệ (0..N-1)
  if (foundIndex >= 0) {
    return foundIndex;
  }

  // Nếu là route ẩn hoặc không tìm thấy: giữ nguyên lastValidIndex hợp lệ
  const safeLast = Number.isFinite(lastValidIndex) ? lastValidIndex : 0;
  return Math.max(0, Math.min(safeLast, visibleRoutes.length - 1));
}

/**
 * Tính toán vị trí translateX và width cho viên thuốc trượt
 */
export function calculatePillLayout(
  activeIndex: number,
  containerWidth: number,
  totalTabs: number,
  padding = 8
): { translateX: number; tabWidth: number } {
  if (totalTabs <= 0 || containerWidth <= 0 || !Number.isFinite(activeIndex)) {
    return { translateX: 0, tabWidth: 0 };
  }

  const availableWidth = Math.max(0, containerWidth - padding);
  const tabWidth = availableWidth / totalTabs;
  const translateX = activeIndex * tabWidth;

  return {
    translateX,
    tabWidth,
  };
}

