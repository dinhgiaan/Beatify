import fs from 'fs/promises';
import { existsSync, statSync, readFileSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as mm from 'music-metadata';

const ROOTS = [
  { category: '(rap)', dir: 'D:\\music for app\\(rap)' },
  { category: '(chill)', dir: 'D:\\music for app\\(chill)' }
];

const ROOT_DIR = path.resolve('../..');
const YOUTUBE_DOWNLOADS_PATH = path.resolve('.state/youtube_downloads.json');
const AUDIO_EXTS = new Set(['.m4a', '.mp3', '.flac', '.wav', '.ogg', '.aac']);

// Đọc youtube_downloads.json
let youtubeDownloads = [];
try {
  youtubeDownloads = JSON.parse(readFileSync(YOUTUBE_DOWNLOADS_PATH, 'utf-8'));
} catch (e) {
  console.warn('Không đọc được youtube_downloads.json:', e.message);
}

// Map tìm kiếm nhanh từ youtube_downloads
const ytByRelativePath = new Map();
const ytByVideoId = new Map();
for (const item of youtubeDownloads) {
  if (item.relativeFilePath) {
    const key = path.normalize(item.relativeFilePath).toLowerCase();
    ytByRelativePath.set(key, item);
  }
  if (item.videoId) {
    ytByVideoId.set(item.videoId, item);
  }
}

async function getAudioFiles(dir) {
  const files = [];
  async function walk(current) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDIO_EXTS.has(ext)) {
          files.push(full);
        }
      }
    }
  }
  await walk(dir);
  return files;
}

async function computeHash(filePath) {
  const buf = await fs.readFile(filePath);
  return crypto.createHash('sha1').update(buf).digest('hex');
}

async function parseInfoTxt(audioFilePath) {
  const dir = path.dirname(audioFilePath);
  const possiblePaths = [
    path.join(dir, 'info.txt'),
    path.join(path.dirname(dir), 'info.txt')
  ];
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      try {
        const content = await fs.readFile(p, 'utf-8');
        try {
          return { data: JSON.parse(content), path: p };
        } catch {
          const lines = content.split('\n');
          const kv = {};
          for (const l of lines) {
            const idx = l.indexOf(':');
            if (idx > 0) {
              const k = l.slice(0, idx).trim();
              const v = l.slice(idx + 1).trim();
              kv[k] = v;
            }
          }
          return { data: kv, path: p, raw: content };
        }
      } catch {}
    }
  }
  return null;
}

async function run() {
  console.log('--- BẮT ĐẦU QUÉT THỰC TẾ ---');
  const allScanned = [];

  for (const { category, dir } of ROOTS) {
    if (!existsSync(dir)) {
      console.error(`Không tồn tại thư mục: ${dir}`);
      continue;
    }

    const topEntries = (await fs.readdir(dir, { withFileTypes: true }));
    const topDirs = topEntries.filter(d => d.isDirectory()).map(d => d.name);

    console.log(`[${category}] Có ${topDirs.length} thư mục cấp 1.`);

    const audioFiles = await getAudioFiles(dir);
    console.log(`[${category}] Tìm thấy ${audioFiles.length} file âm thanh.`);

    for (const f of audioFiles) {
      const relToCategory = path.relative(dir, f);
      const parts = relToCategory.split(path.sep);
      const topDir = parts[0];
      const stats = statSync(f);

      let tags = {};
      try {
        const mmData = await mm.parseFile(f, { duration: true });
        tags = {
          artist: mmData.common.artist?.trim() || null,
          title: mmData.common.title?.trim() || null,
          album: mmData.common.album?.trim() || null,
          albumartist: mmData.common.albumartist?.trim() || null,
          duration: Math.round(mmData.format.duration || 0)
        };
      } catch (err) {
        tags = { error: err.message };
      }

      const infoTxt = await parseInfoTxt(f);
      const sha1 = await computeHash(f);
      const trackId = sha1.slice(0, 12);

      const relNorm = path.normalize(relToCategory).toLowerCase();
      let yt = ytByRelativePath.get(relNorm);
      if (!yt) {
        for (const [k, v] of ytByRelativePath.entries()) {
          if (k.endsWith(path.basename(f).toLowerCase())) {
            yt = v;
            break;
          }
        }
      }

      allScanned.push({
        category,
        fullPath: f,
        relToCategory,
        topDir,
        parts,
        fileName: path.basename(f),
        ext: path.extname(f),
        sizeBytes: stats.size,
        tags,
        infoTxt,
        sha1,
        trackId,
        ytRecord: yt || null
      });
    }
  }

  console.log(`Tổng cộng đã quét ${allScanned.length} bài hát trong cả 2 thư mục.`);

  await fs.writeFile(
    path.join(ROOT_DIR, 'scratch/all_scanned_raw.json'),
    JSON.stringify(allScanned, null, 2),
    'utf-8'
  );

  console.log('Đã ghi scratch/all_scanned_raw.json thành công!');
}

run().catch(console.error);

