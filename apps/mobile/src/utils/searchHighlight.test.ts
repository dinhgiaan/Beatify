import { describe, it, expect } from 'vitest';
import { splitMatches } from './searchHighlight';

describe('searchHighlight', () => {
  it('trả về toàn bộ text khi query rỗng', () => {
    const res = splitMatches('Buông Đôi Tay Nhau Ra', '');
    expect(res).toEqual([{ text: 'Buông Đôi Tay Nhau Ra', isMatch: false }]);
  });

  it('khớp chính xác có dấu', () => {
    const res = splitMatches('Buông Đôi Tay Nhau Ra', 'Buông');
    expect(res).toEqual([
      { text: 'Buông', isMatch: true },
      { text: ' Đôi Tay Nhau Ra', isMatch: false },
    ]);
  });

  it('khớp không dấu tiếng Việt (buong -> Buông)', () => {
    const res = splitMatches('Buông Đôi Tay Nhau Ra', 'buong');
    expect(res).toEqual([
      { text: 'Buông', isMatch: true },
      { text: ' Đôi Tay Nhau Ra', isMatch: false },
    ]);
  });

  it('khớp ở giữa chuỗi (tay -> Tay)', () => {
    const res = splitMatches('Buông Đôi Tay Nhau Ra', 'tay');
    expect(res).toEqual([
      { text: 'Buông Đôi ', isMatch: false },
      { text: 'Tay', isMatch: true },
      { text: ' Nhau Ra', isMatch: false },
    ]);
  });
});

