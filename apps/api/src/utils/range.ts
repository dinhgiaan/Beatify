export interface ParsedRange {
  start: number;
  end: number;
  length: number;
}

/**
 * Phân tích cú pháp header Range: bytes=...
 * Trả về { start, end, length } hoặc null nếu không hợp lệ / không thỏa mãn
 */
export function parseRange(rangeHeader: string | null | undefined, totalSize: number): ParsedRange | null | 'NOT_SATISFIABLE' {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
    return null;
  }

  const parts = rangeHeader.slice(6).trim().split('-');
  if (parts.length !== 2) return null;

  const startStr = parts[0]?.trim();
  const endStr = parts[1]?.trim();

  // Dạng bytes=-suffix (lấy suffix bytes cuối cùng)
  if (startStr === '' && endStr !== undefined && endStr !== '') {
    const suffix = parseInt(endStr, 10);
    if (isNaN(suffix) || suffix <= 0) return null;
    const actualLength = Math.min(suffix, totalSize);
    const start = totalSize - actualLength;
    const end = totalSize - 1;
    return { start, end, length: actualLength };
  }

  // Dạng bytes=start- hoặc bytes=start-end
  if (startStr !== undefined && startStr !== '') {
    const start = parseInt(startStr, 10);
    if (isNaN(start) || start < 0) return null;
    if (start >= totalSize) return 'NOT_SATISFIABLE';

    let end = totalSize - 1;
    if (endStr !== undefined && endStr !== '') {
      const parsedEnd = parseInt(endStr, 10);
      if (isNaN(parsedEnd) || parsedEnd < start) return null;
      end = Math.min(parsedEnd, totalSize - 1);
    }

    const length = end - start + 1;
    return { start, end, length };
  }

  return null;
}
