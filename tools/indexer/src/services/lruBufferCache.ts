/**
 * LRU Buffer Cache cho ảnh bìa và dữ liệu nhị phân.
 * Giới hạn số lượng bản ghi và dung lượng RAM tối đa để ngăn chặn Memory Heap Bloat (OOM).
 */
export interface LruBufferCacheOptions {
  maxEntries?: number;
  maxBytes?: number;
}

export class LruBufferCache {
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private currentBytes = 0;
  private readonly map = new Map<string, Buffer>();

  constructor(options: LruBufferCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 150;
    this.maxBytes = options.maxBytes ?? 64 * 1024 * 1024; // 64 MB
  }

  get(key: string): Buffer | undefined {
    const value = this.map.get(key);
    if (!value) return undefined;
    // Đưa key lên đầu bằng cách xóa và set lại
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: Buffer): this {
    const oldVal = this.map.get(key);
    if (oldVal) {
      this.currentBytes -= oldVal.byteLength;
      this.map.delete(key);
    }

    // Nếu giá trị đơn lẻ lớn hơn cả dung lượng tối đa của cache, không lưu
    if (value.byteLength > this.maxBytes) {
      return this;
    }

    // Đào thải các mục cũ nhất cho tới khi đủ chỗ
    while (
      this.map.size >= this.maxEntries ||
      (this.currentBytes + value.byteLength > this.maxBytes && this.map.size > 0)
    ) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey === undefined) break;
      const oldestVal = this.map.get(oldestKey);
      if (oldestVal) {
        this.currentBytes -= oldestVal.byteLength;
      }
      this.map.delete(oldestKey);
    }

    this.map.set(key, value);
    this.currentBytes += value.byteLength;
    return this;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  delete(key: string): boolean {
    const val = this.map.get(key);
    if (!val) return false;
    this.currentBytes -= val.byteLength;
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
    this.currentBytes = 0;
  }

  get size(): number {
    return this.map.size;
  }

  get totalBytes(): number {
    return this.currentBytes;
  }

  keys(): IterableIterator<string> {
    return this.map.keys();
  }
}
