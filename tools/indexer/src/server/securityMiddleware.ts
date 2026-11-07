import type { MiddlewareHandler } from 'hono';
import path from 'path';

/**
 * Danh sách Host hợp lệ cho server local
 */
export const ALLOWED_HOST_PATTERNS = [
  /^localhost(:[0-9]+)?$/i,
  /^127\.0\.0\.1(:[0-9]+)?$/i,
];

/**
 * Middleware chống DNS Rebinding: Kiểm tra header 'Host'
 */
export const hostHeaderGuard: MiddlewareHandler = async (c, next) => {
  const host = c.req.header('host')?.trim();
  // Nếu có header host, phải khớp với localhost hoặc 127.0.0.1
  if (host) {
    const isAllowed = ALLOWED_HOST_PATTERNS.some((pattern) => pattern.test(host));
    if (!isAllowed) {
      return c.text('Forbidden: Invalid Host header (DNS Rebinding protection)', 403);
    }
  }
  await next();
};

/**
 * Kiểm tra xem một Origin có phải là nguồn tin cậy trên máy cục bộ không
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // Request nội bộ, curl, app mobile không có Origin
  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/**
 * Middleware chống CSRF cho các phương thức ghi (POST, PUT, PATCH, DELETE)
 */
export const csrfGuard: MiddlewareHandler = async (c, next) => {
  const method = c.req.method.toUpperCase();
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  if (isMutation) {
    const origin = c.req.header('origin');
    // Nếu trình duyệt gửi Origin header và Origin không phải localhost/127.0.0.1 -> Chặn đứng CSRF
    if (origin && !isAllowedOrigin(origin)) {
      return c.json(
        {
          status: 403,
          error: 'Forbidden: CSRF protection blocked cross-origin mutation request',
        },
        403
      );
    }
  }

  await next();
};

/**
 * Danh sách các thư mục hệ thống Windows nhạy cảm cấm duyệt
 */
const FORBIDDEN_EXPLORE_PATTERNS = [
  /^[a-z]:\\windows/i,
  /^[a-z]:\\program files/i,
  /^[a-z]:\\program files \(x86\)/i,
  /^[a-z]:\\system volume information/i,
  /^[a-z]:\\\$recycle\.bin/i,
  /^[a-z]:\\recovery/i,
  /\\appdata\\(local|roaming)\\system/i,
];

/**
 * Kiểm tra xem đường dẫn có trỏ vào thư mục hệ điều hành cấm duyệt không
 */
export function isSystemDirectory(dirPath: string): boolean {
  const resolved = path.resolve(dirPath).toLowerCase();
  return FORBIDDEN_EXPLORE_PATTERNS.some((pattern) => pattern.test(resolved));
}

/**
 * Kiểm tra tính an toàn của thao tác xóa thư mục.
 * Đảm bảo thư mục cần xóa:
 * 1. Phải là đường dẫn con hợp lệ nằm bên trong một trong các allowedRoots.
 * 2. Không được trùng hoặc là thư mục cha của allowedRoots.
 * 3. Tuyệt đối không được nằm trong bất kỳ protectedRoots nào (ví dụ MUSIC_SOURCE_DIR).
 */
export function isSafeDeletePath(
  targetPath: string,
  allowedRoots: string[],
  protectedRoots: string[] = []
): { safe: boolean; reason?: string } {
  if (!targetPath || typeof targetPath !== 'string') {
    return { safe: false, reason: 'Đường dẫn thư mục không hợp lệ' };
  }

  const resolvedTarget = path.resolve(targetPath);
  const targetLower = resolvedTarget.toLowerCase();

  // 1. Không xóa ổ đĩa gốc (C:\, D:\...)
  const root = path.parse(resolvedTarget).root.toLowerCase();
  if (targetLower === root || targetLower === root.replace(/\\$/, '')) {
    return { safe: false, reason: 'Tuyệt đối không được xóa ổ đĩa gốc của hệ thống' };
  }

  // 2. Chặn các thư mục hệ thống
  if (isSystemDirectory(resolvedTarget)) {
    return { safe: false, reason: 'Không được phép xóa thư mục hệ thống' };
  }

  // 3. Chặn các thư mục được bảo vệ (ví dụ: MUSIC_SOURCE_DIR, thư mục dự án)
  for (const prot of protectedRoots) {
    if (!prot) continue;
    const resolvedProt = path.resolve(prot).toLowerCase();
    if (targetLower === resolvedProt) {
      return { safe: false, reason: `Không thể xóa thư mục gốc được bảo vệ: ${prot}` };
    }
    // Nếu target nằm bên trong protectedRoot
    const rel = path.relative(resolvedProt, targetLower);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      return {
        safe: false,
        reason: 'Quy tắc an toàn: Không được xóa file/thư mục trong thư mục nguồn (chỉ đọc)',
      };
    }
  }

  // 4. Phải nằm bên trong ít nhất một thư mục allowedRoots
  const validAllowedRoots = allowedRoots.filter(Boolean).map((r) => path.resolve(r).toLowerCase());
  if (validAllowedRoots.length === 0) {
    return { safe: false, reason: 'Không có thư mục cho phép nào được cấu hình để xóa' };
  }

  const isInsideAllowed = validAllowedRoots.some((allowed) => {
    if (targetLower === allowed) return false; // Không được xóa chính thư mục gốc
    const rel = path.relative(allowed, targetLower);
    return !rel.startsWith('..') && !path.isAbsolute(rel);
  });

  if (!isInsideAllowed) {
    return {
      safe: false,
      reason: 'Đường dẫn nằm ngoài phạm vi thư mục tải về / nhập nhạc được cho phép',
    };
  }

  return { safe: true };
}

