const MAX_LOGS = 200;
export const tabDebugLogs: string[] = [];

/**
 * Ghi nhận log chẩn đoán chuyển động TabBar cả ra console lẫn bộ nhớ RAM
 * để người dùng có thể 1-click xuất/chia sẻ log ngay trong app
 */
export function logTabDebug(...args: unknown[]): void {
  const line = `[${new Date().toLocaleTimeString()}] ${args
    .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
    .join(' ')}`;
  tabDebugLogs.push(line);
  if (tabDebugLogs.length > MAX_LOGS) {
    tabDebugLogs.shift();
  }
  console.log(...args);
}

export function getTabDebugLogs(): string {
  return tabDebugLogs.join('\n');
}

export function clearTabDebugLogs(): void {
  tabDebugLogs.length = 0;
}

