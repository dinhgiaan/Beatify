import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AggregatorConfig {
  exactChannels: string[];
  keywordHeuristics: string[];
}

interface WhitelistConfig {
  whitelist: string[];
}

export function findIndexerConfigDir(explicitDir?: string): string {
  if (explicitDir && fs.existsSync(explicitDir)) return explicitDir;
  const candidates = [
    path.resolve(process.cwd(), 'config'),
    path.resolve(process.cwd(), 'tools/indexer/config'),
    path.resolve(__dirname, '../../config'),
    path.resolve(__dirname, '../config'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(process.cwd(), 'config');
}

export function normalizeSearchToken(text?: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

export function stripSpaces(text?: string): string {
  return normalizeSearchToken(text).replace(/\s+/g, '');
}

export class ChannelClassifier {
  private exactChannels: Set<string>;
  private keywordHeuristics: string[];
  private whitelist: Set<string>;

  constructor(configDir?: string) {
    const dir = findIndexerConfigDir(configDir);
    const aggPath = path.join(dir, 'aggregatorChannels.json');
    const whitePath = path.join(dir, 'channelWhitelist.json');

    try {
      const aggData: AggregatorConfig = JSON.parse(fs.readFileSync(aggPath, 'utf-8'));
      this.exactChannels = new Set(aggData.exactChannels.map((c) => normalizeSearchToken(c)));
      this.keywordHeuristics = aggData.keywordHeuristics.map((k) => normalizeSearchToken(k));
    } catch {
      this.exactChannels = new Set(['151', 'faptv', 'evb records', 'rv underground', '7clouds', 'fueled by ramen']);
      this.keywordHeuristics = ['records', 'entertainment', 'network', 'underground'];
    }

    try {
      const whiteData: WhitelistConfig = JSON.parse(fs.readFileSync(whitePath, 'utf-8'));
      this.whitelist = new Set(whiteData.whitelist.map((w) => normalizeSearchToken(w)));
    } catch {
      this.whitelist = new Set();
    }
  }

  /**
   * Chuẩn hóa tên kênh loại bỏ các hậu tố rác (Official Channel, VEVO, Topic)
   */
  normalizeChannelName(channelName?: string): string {
    if (!channelName) return '';
    let clean = channelName.normalize('NFC').trim();

    clean = clean.replace(/\s*-\s*Topic$/i, '').trim();

    if (/VEVO$/i.test(clean)) {
      clean = clean.replace(/VEVO$/i, '').trim();
      clean = clean.replace(/([a-z])([A-Z])/g, '$1 $2');
    }

    clean = clean.replace(/\s+(?:Official(?:\s+Channel)?|Channel)$/i, '').trim();
    return clean;
  }

  /**
   * Kiểm tra xem kênh có phải kênh hãng đĩa / kênh tổng hợp không đại diện cho 1 nghệ sĩ
   */
  isAggregatorChannel(channelName?: string): boolean {
    if (!channelName) return false;
    const token = normalizeSearchToken(channelName);
    if (!token) return false;

    // 1. Kiểm tra whitelist ngoại lệ trước
    if (this.whitelist.has(token)) {
      return false;
    }

    // 2. Khớp chính xác với danh sách exactChannels (bao gồm '151', 'faptv', 'evb records'...)
    if (this.exactChannels.has(token)) {
      return true;
    }

    // 3. Heuristic theo từ khóa / hậu tố kênh trung gian (dùng word boundary)
    for (const kw of this.keywordHeuristics) {
      const regex = new RegExp(`(?:^|\\s)${kw}(?:$|\\s)`, 'i');
      if (regex.test(token)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Tầng 1: Đối soát chéo giữa các ứng viên trong tiêu đề với tên kênh cá nhân
   */
  crossCheckWithTitle(
    channelName: string,
    candidates: { left: string; right: string }
  ): {
    matched: boolean;
    orientation: 'left_is_artist' | 'right_is_artist' | 'unknown';
    artistCandidate: string | null;
  } {
    const cleanChan = this.normalizeChannelName(channelName);
    if (!cleanChan || this.isAggregatorChannel(cleanChan)) {
      // Nếu kênh là aggregator, không được dùng tên kênh để so khớp
      return { matched: false, orientation: 'unknown', artistCandidate: null };
    }

    const chanToken = normalizeSearchToken(cleanChan);
    const chanCompact = stripSpaces(cleanChan);
    const leftToken = normalizeSearchToken(candidates.left);
    const leftCompact = stripSpaces(candidates.left);
    const rightToken = normalizeSearchToken(candidates.right);
    const rightCompact = stripSpaces(candidates.right);

    // Ưu tiên Tuyệt đối: Nếu một bên khớp chính xác 100% với tên kênh và bên kia không, bên khớp chính xác thắng
    const leftExact = Boolean(leftToken && chanToken && leftToken === chanToken);
    const rightExact = Boolean(rightToken && chanToken && rightToken === chanToken);

    if (leftExact && !rightExact) {
      return {
        matched: true,
        orientation: 'left_is_artist',
        artistCandidate: candidates.left.trim(),
      };
    }

    if (rightExact && !leftExact) {
      return {
        matched: true,
        orientation: 'right_is_artist',
        artistCandidate: candidates.right.trim(),
      };
    }

    const matchesChannel = (candToken: string, candCompact: string) => {
      if (!candToken || !chanToken) return false;
      if (candToken === chanToken) return true;
      if (candCompact.length >= 4 && chanCompact.length >= 4) {
        if (candCompact.includes(chanCompact) || chanCompact.includes(candCompact)) {
          return true;
        }
      }
      return false;
    };

    const leftMatches = matchesChannel(leftToken, leftCompact);
    const rightMatches = matchesChannel(rightToken, rightCompact);

    if (leftMatches && !rightMatches) {
      return {
        matched: true,
        orientation: 'left_is_artist',
        artistCandidate: candidates.left.trim(),
      };
    }

    if (rightMatches && !leftMatches) {
      return {
        matched: true,
        orientation: 'right_is_artist',
        artistCandidate: candidates.right.trim(),
      };
    }

    return { matched: false, orientation: 'unknown', artistCandidate: null };
  }
}

export const defaultChannelClassifier = new ChannelClassifier();
