import { describe, it, expect } from 'vitest';
import { formatDownloadDate, formatBytes, formatSeconds } from './formatters';

describe('Kiểm thử formatters trong @music-app/shared', () => {
  it('1. formatSeconds chuẩn hóa chính xác giây sang mm:ss', () => {
    expect(formatSeconds(0)).toBe('0:00');
    expect(formatSeconds(45)).toBe('0:45');
    expect(formatSeconds(60)).toBe('1:00');
    expect(formatSeconds(125)).toBe('2:05');
    expect(formatSeconds(3600)).toBe('60:00');
    expect(formatSeconds(null)).toBe('0:00');
    expect(formatSeconds(undefined)).toBe('0:00');
  });

  it('2. formatBytes định dạng chính xác MB và GB', () => {
    expect(formatBytes(0)).toBe('');
    expect(formatBytes(1024 * 1024 * 5)).toBe('5.0 MB');
    expect(formatBytes(1024 * 1024 * 10.5)).toBe('10.5 MB');
    expect(formatBytes(1024 * 1024 * 1024 * 2.5)).toBe('2.50 GB');
  });

  it('3. formatDownloadDate xử lý an toàn date null / invalid và trả về ngày giờ tiếng Việt', () => {
    expect(formatDownloadDate(null).date).toBe('---');
    expect(formatDownloadDate(undefined).time).toBe('--:--');
    expect(formatDownloadDate('invalid-date').full).toBe('Chưa có thông tin');

    const testIso = '2026-10-15T08:30:00.000Z';
    const res = formatDownloadDate(testIso);
    expect(res.date).toBeTruthy();
    expect(res.time).toBeTruthy();
    expect(res.full).toContain(res.date);
    expect(res.full).toContain(res.time);
  });
});

