import { normalizeText } from '@music-app/shared';

export interface TextMatchPart {
  text: string;
  isMatch: boolean;
}

/**
 * Tách một chuỗi văn bản thành các phân đoạn khớp (isMatch) và không khớp với từ khóa tìm kiếm.
 * Hỗ trợ tiếng Việt có dấu và không dấu: khớp ký tự gốc trong text tương ứng với chuỗi đã chuẩn hóa.
 */
export function splitMatches(text: string, query: string): TextMatchPart[] {
  if (!text) return [];
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return [{ text, isMatch: false }];
  }

  const normText = normalizeText(text);
  const normQuery = normalizeText(cleanQuery);

  if (!normQuery || !normText.includes(normQuery)) {
    return [{ text, isMatch: false }];
  }

  const parts: TextMatchPart[] = [];
  let currentNormIdx = 0;
  let currentRawIdx = 0;

  // Lặp tìm các vị trí xuất hiện của normQuery trong normText
  while (currentNormIdx < normText.length) {
    const matchIdx = normText.indexOf(normQuery, currentNormIdx);
    if (matchIdx === -1) {
      // Phần còn lại không khớp
      if (currentRawIdx < text.length) {
        parts.push({ text: text.slice(currentRawIdx), isMatch: false });
      }
      break;
    }

    // Phần trước khớp
    if (matchIdx > currentNormIdx) {
      const nonMatchLength = matchIdx - currentNormIdx;
      const nonMatchSlice = text.slice(currentRawIdx, currentRawIdx + nonMatchLength);
      parts.push({ text: nonMatchSlice, isMatch: false });
      currentRawIdx += nonMatchLength;
      currentNormIdx = matchIdx;
    }

    // Phần khớp
    const matchLength = normQuery.length;
    const matchSlice = text.slice(currentRawIdx, currentRawIdx + matchLength);
    parts.push({ text: matchSlice, isMatch: true });
    currentRawIdx += matchLength;
    currentNormIdx += matchLength;
  }

  return parts;
}

