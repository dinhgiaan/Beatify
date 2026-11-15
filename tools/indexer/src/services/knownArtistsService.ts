import fs from 'fs';
import path from 'path';
import { normalizeSearchToken, findIndexerConfigDir } from './channelClassifier';

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ArtistMatchResult {
  matched: boolean;
  canonicalName: string | null;
  matchedToken: string | null;
  confidence: number;
}

export class KnownArtistsService {
  private aliases: Map<string, string>; // normalized search token -> canonical name
  private canonicalArtists: Set<string>; // canonical display names
  private excludedArtists: Set<string>; // for leave-one-out evaluation

  constructor(configDir?: string, customArtists?: string[]) {
    this.aliases = new Map();
    this.canonicalArtists = new Set();
    this.excludedArtists = new Set();

    const dir = findIndexerConfigDir(configDir);
    const aliasPath = path.join(dir, 'artistAliases.json');

    try {
      const aliasData: Record<string, string> = JSON.parse(fs.readFileSync(aliasPath, 'utf-8'));
      for (const [alias, canonical] of Object.entries(aliasData)) {
        const normKey = normalizeSearchToken(alias);
        this.aliases.set(normKey, canonical);
        this.canonicalArtists.add(canonical);
      }
    } catch {
      // Fallback aliases
      this.aliases.set('b ray', 'B Ray');
      this.aliases.set('son tung m-tp', 'Sơn Tùng M-TP');
      this.aliases.set('dat g', 'Đạt G');
    }

    if (customArtists) {
      for (const a of customArtists) {
        this.registerArtist(a);
      }
    }
  }

  /**
   * Đăng ký một nghệ sĩ mới vào danh bạ (canonical format)
   */
  registerArtist(name: string): void {
    if (!name || name.trim().length === 0) return;
    const trimmed = name.normalize('NFC').trim();
    const token = normalizeSearchToken(trimmed);
    if (!token) return;

    if (!this.aliases.has(token)) {
      this.aliases.set(token, trimmed);
    }
    this.canonicalArtists.add(trimmed);
  }

  /**
   * Thiết lập danh sách loại trừ phục vụ đánh giá Leave-One-Out (chống rò rỉ dữ liệu)
   * Khi loại trừ một nghệ sĩ, loại bỏ LUÔN toàn bộ các alias trỏ về nghệ sĩ canonical đó.
   */
  setExcludedArtists(artists: string[]): void {
    this.excludedArtists.clear();
    const targetCanonicals = new Set<string>();

    for (const a of artists) {
      const norm = normalizeSearchToken(a);
      if (!norm) continue;
      this.excludedArtists.add(norm);

      // Tìm canonical name tương ứng nếu có trong danh bạ
      const canonical = this.aliases.get(norm) || a;
      targetCanonicals.add(normalizeSearchToken(canonical));
    }

    // Quét toàn bộ bảng alias: loại bỏ mọi biến thể/alias thuộc cùng nghệ sĩ
    for (const [aliasKey, canonical] of this.aliases.entries()) {
      const canonNorm = normalizeSearchToken(canonical);
      if (targetCanonicals.has(canonNorm)) {
        this.excludedArtists.add(aliasKey);
      }
    }
  }

  /**
   * Xóa danh sách loại trừ
   */
  clearExcludedArtists(): void {
    this.excludedArtists.clear();
  }

  /**
   * Tầng 2: So khớp chuỗi với Danh bạ Nghệ sĩ & Bảng bí danh.
   * Áp dụng Word-Boundary \b, ràng buộc độ dài và exact-match cho tên ngắn (< 4 ký tự).
   */
  matchArtist(text: string): ArtistMatchResult {
    if (!text || text.trim().length === 0) {
      return { matched: false, canonicalName: null, matchedToken: null, confidence: 0 };
    }

    const trimmed = text.normalize('NFC').trim();
    const token = normalizeSearchToken(trimmed);

    // 1. Kiểm tra khớp toàn phần (Exact Whole-Phrase Match)
    if (this.aliases.has(token)) {
      if (this.excludedArtists.has(token)) {
        return { matched: false, canonicalName: null, matchedToken: null, confidence: 0 };
      }
      return {
        matched: true,
        canonicalName: this.aliases.get(token) || trimmed,
        matchedToken: token,
        confidence: 1.0,
      };
    }

    // 2. Với chuỗi ngắn (< 4 ký tự như "Vũ.", "Binz", "x"): CHỈ cho phép exact-match, không cho phép substring
    if (token.length < 4) {
      return { matched: false, canonicalName: null, matchedToken: null, confidence: 0 };
    }

    // 3. Nếu chuỗi có chứa từ nối feat/ft, ưu tiên bóc tách và so khớp nghệ sĩ chính trước feat
    const featMatch = trimmed.match(/^(.*?)(?:\s+(?:feat\.?|ft\.?|featuring)\s+(.*))$/i);
    if (featMatch && featMatch[1] && featMatch[1].trim().length > 0) {
      const mainPart = featMatch[1].trim();
      const mainMatch = this.matchArtist(mainPart);
      if (mainMatch.matched) {
        return mainMatch;
      }
    }

    // 4. Quét tìm nghệ sĩ đã biết bên trong chuỗi theo word-boundary (\b)
    // Sắp xếp các alias theo độ dài giảm dần để ưu tiên cụm dài nhất (ví dụ "Sơn Tùng M-TP" trước "M-TP")
    const sortedAliases = Array.from(this.aliases.entries())
      .filter(([aliasKey]) => aliasKey.length >= 4 && !this.excludedArtists.has(aliasKey))
      .sort((a, b) => b[0].length - a[0].length);

    for (const [aliasKey, canonical] of sortedAliases) {
      const escaped = escapeRegExp(aliasKey);
      const regex = new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`, 'i');
      if (regex.test(token)) {
        return {
          matched: true,
          canonicalName: canonical,
          matchedToken: aliasKey,
          confidence: 0.9,
        };
      }
    }

    return { matched: false, canonicalName: null, matchedToken: null, confidence: 0 };
  }

  /**
   * Kiểm tra tính hợp lệ của dấu nối "x" làm từ nối hợp tác đa nghệ sĩ
   * Phải có khoảng trắng hai bên và ít nhất một bên khớp danh bạ nghệ sĩ
   */
  isValidCollabSeparator(sep: string, leftText: string, rightText: string): boolean {
    if (!sep) return false;
    const cleanSep = sep.trim().toLowerCase();

    if (['feat', 'feat.', 'ft', 'ft.', 'featuring', '&', ','].includes(cleanSep)) {
      return true;
    }

    if (cleanSep === 'x') {
      // Dấu x phải có khoảng trắng hai bên
      const hasLeft = leftText && leftText.trim().length > 0;
      const hasRight = rightText && rightText.trim().length > 0;
      if (!hasLeft || !hasRight) return false;

      const leftMatch = this.matchArtist(leftText);
      const rightMatch = this.matchArtist(rightText);

      // Ít nhất một bên phải là nghệ sĩ đã biết
      return leftMatch.matched || rightMatch.matched;
    }

    return false;
  }
}

export const defaultKnownArtistsService = new KnownArtistsService();
