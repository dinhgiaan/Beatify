import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';

// Các thiết bị dành riêng của Windows (không phân biệt hoa thường)
const RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

export const PathSanitizer = {
  /**
   * Làm sạch một phần tử đường dẫn (tên thư mục hoặc tên tệp) theo chuẩn Windows:
   * 1. Chuẩn hóa Unicode NFC (tránh tách dấu tiếng Việt)
   * 2. Thay thế ký tự cấm: \ / : * ? " < > | bằng dấu gạch ngang '-'
   * 3. Thay thế các tên dành riêng của Windows (CON -> _CON_)
   * 4. Lọc bỏ khoảng trắng và dấu chấm ở cuối tên
   */
  sanitizeSegment(segment: string): string {
    if (!segment) return 'Unknown';

    let cleaned = segment.normalize('NFC').trim();

    // Thay thế các ký tự cấm trên Windows
    cleaned = cleaned.replace(/[\\/:*?"<>|]/g, '-');
    cleaned = cleaned.replace(/-{2,}/g, '-');

    // Lọc bỏ dấu chấm và khoảng trắng ở cuối chuỗi
    cleaned = cleaned.replace(/[. ]+$/, '');

    if (!cleaned) return 'Unknown';

    // Kiểm tra tên dành riêng của Windows
    const upper = cleaned.toUpperCase();
    if (RESERVED_NAMES.has(upper) || RESERVED_NAMES.has(upper.split('.')[0] || '')) {
      cleaned = `_${cleaned}_`;
    }

    return cleaned;
  },

  /**
   * Cắt ngắn chuỗi an toàn nếu vượt quá độ dài tối đa
   */
  truncateString(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    if (maxLength <= 1) return str.substring(0, maxLength);
    return str.substring(0, maxLength - 1).trimEnd() + '…';
  },

  /**
   * Làm sạch tên file và khống chế độ dài an toàn cho Windows MAX_PATH (260 ký tự)
   */
  enforceMaxPathBudget(
    targetDir: string,
    fileBase: string,
    ext: string,
    maxTotal = 240
  ): string {
    const cleanExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
    const cleanBase = this.sanitizeSegment(fileBase);
    const dirLength = path.resolve(targetDir).length + 1;
    const maxFileBaseLen = Math.max(10, maxTotal - dirLength - cleanExt.length);
    const safeBase = this.truncateString(cleanBase, maxFileBaseLen);
    return `${safeBase}${cleanExt}`;
  },

  /**
   * Di chuyển file an toàn có cơ chế thử lại chống lỗi khóa file trên Windows (EBUSY / EPERM)
   */
  async safeMoveFile(src: string, dest: string, maxRetries = 3): Promise<void> {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      await fsPromises.mkdir(destDir, { recursive: true });
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await fsPromises.rename(src, dest);
        return;
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        if ((error.code === 'EBUSY' || error.code === 'EPERM') && attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        } else {
          // Fallback: Copy rồi xóa nguồn nếu rename khác mount point hoặc vẫn bị kẹt
          await fsPromises.copyFile(src, dest);
          await fsPromises.unlink(src);
          return;
        }
      }
    }
  },
};
