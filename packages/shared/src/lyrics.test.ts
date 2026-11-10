import { describe, it, expect } from 'vitest';
import { parseLrc, findActiveLrcIndex, formatLrcSpacing } from './lyrics';

describe('parseLrc', () => {
  it('phân tích cú pháp LRC chuẩn [mm:ss.xx]', () => {
    const lrc = `[00:02.32] Hmm, yeah
[00:06.42] Since a jit stood tall with a kickstand
[00:10.45] Thinking of a plan to get quick bands`;

    const result = parseLrc(lrc);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ time: 2.32, text: 'Hmm, yeah' });
    expect(result[1]).toEqual({ time: 6.42, text: 'Since a jit stood tall with a kickstand' });
    expect(result[2]).toEqual({ time: 10.45, text: 'Thinking of a plan to get quick bands' });
  });

  it('xử lý chuỗi rỗng hoặc không có mốc thời gian', () => {
    expect(parseLrc('')).toEqual([]);
    expect(parseLrc('Lời bài hát không có timestamp')).toEqual([]);
    expect(parseLrc(null)).toEqual([]);
  });

  it('xử lý dòng lặp lại nhiều timestamp [00:05.00][00:15.00] Chorus', () => {
    const lrc = `[00:05.00][00:15.00] Chorus line`;
    const result = parseLrc(lrc);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ time: 5, text: 'Chorus line' });
    expect(result[1]).toEqual({ time: 15, text: 'Chorus line' });
  });

  it('xử lý thẻ [offset: 500] và bỏ qua các thẻ metadata [ar:], [ti:]', () => {
    const lrc = `[ar: Sơn Tùng M-TP]
[ti: Cơn Mưa Ngang Qua]
[offset: 500]
[01:02.00] Cơn mưa ngang qua mang em đi xa`;

    const result = parseLrc(lrc);
    expect(result).toHaveLength(1);
    // 1 phút 2 giây + 500ms offset = 62.5 giây
    expect(result[0]).toEqual({ time: 62.5, text: 'Cơn mưa ngang qua mang em đi xa' });
  });

  it('xử lý dấu hai chấm phân cách millisecond [01:10:50] và phút 1 chữ số [1:05.20]', () => {
    const lrc = `[1:05.20] Câu hát ngắn
[02:10:50] Câu hát dấu hai chấm`;

    const result = parseLrc(lrc);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ time: 65.2, text: 'Câu hát ngắn' });
    expect(result[1]).toEqual({ time: 130.5, text: 'Câu hát dấu hai chấm' });
  });
});

describe('findActiveLrcIndex', () => {
  const lines = [
    { time: 2, text: 'Line 1' },
    { time: 5, text: 'Line 2' },
    { time: 10, text: 'Line 3' },
  ];

  it('trả về -1 khi nhạc chưa đến mốc thời gian đầu tiên', () => {
    expect(findActiveLrcIndex(lines, 0)).toBe(-1);
    expect(findActiveLrcIndex(lines, 1.5)).toBe(-1);
  });

  it('trả về đúng dòng tương ứng theo currentTime', () => {
    expect(findActiveLrcIndex(lines, 2)).toBe(0);
    expect(findActiveLrcIndex(lines, 3.5)).toBe(0);
    expect(findActiveLrcIndex(lines, 5)).toBe(1);
    expect(findActiveLrcIndex(lines, 7.8)).toBe(1);
    expect(findActiveLrcIndex(lines, 10)).toBe(2);
    expect(findActiveLrcIndex(lines, 999)).toBe(2);
  });
});

describe('formatLrcSpacing', () => {
  it('tự động thêm khoảng trắng chuẩn sau timestamp nếu bị dính liền', () => {
    const raw = `[00:01.00]Lời dính
[00:05.20]   Đã có khoảng trắng
[01:10:50]Dấu hai chấm`;
    const formatted = formatLrcSpacing(raw);
    expect(formatted).toBe(`[00:01.00] Lời dính
[00:05.20]   Đã có khoảng trắng
[01:10:50] Dấu hai chấm`);
  });

  it('xử lý chuỗi rỗng hoặc null', () => {
    expect(formatLrcSpacing('')).toBe('');
    expect(formatLrcSpacing(null)).toBe('');
  });
});
