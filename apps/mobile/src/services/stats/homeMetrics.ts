import type { ListeningRecord } from '@music-app/shared';

export interface HomeBuildMetrics {
  lastElapsedMs: number | null;
  sectionCount: number;
  recordCount: number;
  timestamp: number;
}

export interface ListeningHistoryDiagnostics {
  totalRecords: number;
  skippedCount: number;
  skippedPercent: number;
  unfinalizedCount: number;
  unfinalizedClusterPercent: number;
}

let lastMetrics: HomeBuildMetrics = {
  lastElapsedMs: null,
  sectionCount: 0,
  recordCount: 0,
  timestamp: 0,
};

let homeDebugEnabled = false;

/**
 * Ghi nhận số liệu đo thời gian và kích thước dữ liệu khi dựng Trang chủ
 */
export function recordHomeMetrics(metrics: HomeBuildMetrics): void {
  lastMetrics = metrics;
}

/**
 * Lấy số liệu hiệu năng dựng Trang chủ gần nhất
 */
export function getHomeMetrics(): HomeBuildMetrics {
  return lastMetrics;
}

/**
 * Bật/tắt cờ ghi log chi tiết hiệu năng Trang chủ
 */
export function setHomeDebug(enabled: boolean): void {
  homeDebugEnabled = enabled;
}

/**
 * Kiểm tra trạng thái cờ debug Trang chủ
 */
export function isHomeDebug(): boolean {
  return homeDebugEnabled;
}

/**
 * Phân tích và chẩn đoán chất lượng dữ liệu lịch sử nghe (ListeningRecord[])
 * - Skipped: bài nghe lướt (listenedSec / durationSec < 0.25)
 * - Unfinalized: bài dừng trong khoảng 15-16 giây (cụm bản ghi chưa được chốt)
 */
export function analyzeListeningHistory(records: ListeningRecord[]): ListeningHistoryDiagnostics {
  const totalRecords = records.length;
  if (totalRecords === 0) {
    return {
      totalRecords: 0,
      skippedCount: 0,
      skippedPercent: 0,
      unfinalizedCount: 0,
      unfinalizedClusterPercent: 0,
    };
  }

  let skippedCount = 0;
  let unfinalizedCount = 0;

  for (const r of records) {
    // Skipped: nghe dưới 25% thời lượng (chỉ xét bài có thời lượng hợp lệ)
    if (r.durationSec > 0 && r.listenedSec / r.durationSec < 0.25) {
      skippedCount++;
    }

    // Unfinalized cluster: bản ghi ghi nhận trong khoảng 15s - 16s
    if (r.listenedSec >= 15 && r.listenedSec <= 16) {
      unfinalizedCount++;
    }
  }

  return {
    totalRecords,
    skippedCount,
    skippedPercent: (skippedCount / totalRecords) * 100,
    unfinalizedCount,
    unfinalizedClusterPercent: (unfinalizedCount / totalRecords) * 100,
  };
}

