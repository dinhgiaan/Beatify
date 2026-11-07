import type { ScannedTrack } from './scanner';

export interface FileStatFingerprint {
  mtimeMs: number;
  size: number;
}

interface CacheEntry {
  mtimeMs: number;
  size: number;
  scanned: ScannedTrack;
}

/**
 * Quản lý bộ nhớ đệm cho kết quả scan file âm thanh.
 * Dựa vào (filePath, mtimeMs, size) để tái sử dụng kết quả,
 * tránh đọc lại file dung lượng lớn và băm SHA-1 trên mỗi request.
 */
export class ScanCache {
  private readonly cache = new Map<string, CacheEntry>();

  get(filePath: string, stat: FileStatFingerprint): ScannedTrack | null {
    const entry = this.cache.get(filePath);
    if (!entry) return null;
    // Nếu mtime hoặc kích thước file bị thay đổi trên đĩa, cache không còn hiệu lực
    if (Math.abs(entry.mtimeMs - stat.mtimeMs) > 1 || entry.size !== stat.size) {
      this.cache.delete(filePath);
      return null;
    }
    return entry.scanned;
  }

  set(filePath: string, stat: FileStatFingerprint, scanned: ScannedTrack): void {
    this.cache.set(filePath, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      scanned,
    });
  }

  delete(filePath: string): boolean {
    return this.cache.delete(filePath);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  /**
   * Dọn dẹp các file không còn tồn tại trong danh sách quét hiện tại
   */
  prune(validFilePaths: Set<string>): void {
    for (const key of this.cache.keys()) {
      if (!validFilePaths.has(key)) {
        this.cache.delete(key);
      }
    }
  }
}

export const globalScanCache = new ScanCache();

