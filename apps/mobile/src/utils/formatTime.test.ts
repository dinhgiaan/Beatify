import { describe, it, expect } from 'vitest';
import { formatTime } from './formatTime';

describe('formatTime utility', () => {
  it('định dạng đúng số giây dưới 1 phút', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(45)).toBe('0:45');
    expect(formatTime(59)).toBe('0:59');
  });

  it('định dạng đúng phút và giây', () => {
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(75)).toBe('1:15');
    expect(formatTime(225)).toBe('3:45');
    expect(formatTime(599)).toBe('9:59');
    expect(formatTime(600)).toBe('10:00');
  });

  it('định dạng đúng khi vượt quá 1 giờ', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3665)).toBe('1:01:05');
    expect(formatTime(7322)).toBe('2:02:02');
  });

  it('xử lý an toàn các giá trị biên (NaN, số âm, vô cực)', () => {
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(-10)).toBe('0:00');
    expect(formatTime(Infinity)).toBe('0:00');
    expect(formatTime(-Infinity)).toBe('0:00');
  });
});
