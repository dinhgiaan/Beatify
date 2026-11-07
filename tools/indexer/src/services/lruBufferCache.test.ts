import { describe, it, expect } from 'vitest';
import { LruBufferCache } from './lruBufferCache';

describe('LruBufferCache', () => {
  it('lưu trữ và truy xuất Buffer thành công', () => {
    const cache = new LruBufferCache({ maxEntries: 3 });
    const bufA = Buffer.from('hello');
    cache.set('a', bufA);

    expect(cache.has('a')).toBe(true);
    expect(cache.get('a')?.toString()).toBe('hello');
    expect(cache.size).toBe(1);
    expect(cache.totalBytes).toBe(5);
  });

  it('đào thải theo nguyên tắc LRU khi vượt quá maxEntries', () => {
    const cache = new LruBufferCache({ maxEntries: 2 });
    cache.set('a', Buffer.from('1'));
    cache.set('b', Buffer.from('2'));

    // Truy cập 'a' để 'a' thành mới nhất, 'b' thành cũ nhất
    cache.get('a');

    // Thêm 'c' -> 'b' phải bị đào thải
    cache.set('c', Buffer.from('3'));

    expect(cache.has('b')).toBe(false);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('c')).toBe(true);
    expect(cache.size).toBe(2);
  });

  it('đào thải khi vượt quá maxBytes', () => {
    const cache = new LruBufferCache({ maxBytes: 10 });
    cache.set('a', Buffer.alloc(6)); // 6 bytes
    cache.set('b', Buffer.alloc(6)); // 6 bytes -> tổng 12 > 10, 'a' phải bị đào thải

    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    expect(cache.totalBytes).toBe(6);
  });

  it('xóa và làm rỗng cache chính xác', () => {
    const cache = new LruBufferCache();
    cache.set('a', Buffer.from('test'));
    expect(cache.delete('a')).toBe(true);
    expect(cache.has('a')).toBe(false);
    expect(cache.totalBytes).toBe(0);

    cache.set('b', Buffer.from('123'));
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.totalBytes).toBe(0);
  });
});

