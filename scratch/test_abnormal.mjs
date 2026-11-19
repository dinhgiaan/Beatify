import fs from 'fs/promises';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const allScanned = JSON.parse(readFileSync('scratch/all_scanned_raw.json', 'utf-8'));

console.log('Tổng số file scanned:', allScanned.length);

// Nhóm theo topDir
const rapTopDirs = new Map();
const chillTopDirs = new Map();

for (const item of allScanned) {
  const map = item.category === '(rap)' ? rapTopDirs : chillTopDirs;
  if (!map.has(item.topDir)) {
    map.set(item.topDir, []);
  }
  map.get(item.topDir).push(item);
}

console.log('(rap) topDirs count:', rapTopDirs.size);
console.log('(chill) topDirs count:', chillTopDirs.size);

// Kiểm tra các topDir có dấu hiệu bất thường:
// 1. Chứa ngoặc vuông [
// 2. Chứa từ khóa: Official, Video, Lyrics, Ft, feat, Remix, rmx, MV, Prod, Audio, Topic, Channel, Records, Entertainment
// 3. Tên bài hát thay vì tên nghệ sĩ (đối chiếu với tags.title, hoặc tags.artist)
// 4. Cấu trúc thư mục con không phải Singles / Albums
// 5. Thư mục chứa tên bài hoặc dấu -

function analyzeFolders(topDirsMap, catName) {
  const abnormal = [];
  const normal = [];

  for (const [topDir, files] of topDirsMap.entries()) {
    let isAbnormal = false;
    const reasons = [];

    // Kiểm tra tên topDir
    if (/\[|\(feat|\(ft|official|lyrics|remix|video|\brmx\b|prod|records|entertainment|faptv|7clouds/i.test(topDir)) {
      isAbnormal = true;
      reasons.push('Tên thư mục chứa từ khóa kênh/phụ (video, lyrics, feat, channel...)');
    }

    // Kiểm tra xem topDir có trùng với tên bài hát trong tags không
    for (const f of files) {
      const tagTitle = f.tags?.title?.toLowerCase();
      const topLower = topDir.toLowerCase();
      if (tagTitle && (topLower === tagTitle || topLower.includes(tagTitle) || tagTitle.includes(topLower))) {
        // Nếu tags.artist lại khác với topDir
        const tagArtist = f.tags?.artist?.toLowerCase();
        if (tagArtist && tagArtist !== topLower && !tagArtist.includes('unknown')) {
          isAbnormal = true;
          reasons.push(`TopDir "${topDir}" trùng/gần trùng với Title "${f.tags.title}" (Artist thực là "${f.tags.artist}")`);
        }
      }

      // Kiểm tra subfolder
      if (f.parts.length < 3) {
        isAbnormal = true;
        reasons.push(`Cấu trúc thiếu cấp (parts=${f.parts.length}: ${f.relToCategory})`);
      } else if (f.parts[1] !== 'Singles' && f.parts[1] !== 'Albums') {
        isAbnormal = true;
        reasons.push(`Subfolder không phải Singles/Albums (là "${f.parts[1]}")`);
      }
    }

    if (isAbnormal) {
      abnormal.push({ topDir, fileCount: files.length, reasons: [...new Set(reasons)], files });
    } else {
      normal.push({ topDir, fileCount: files.length, files });
    }
  }

  return { abnormal, normal };
}

const rapRes = analyzeFolders(rapTopDirs, '(rap)');
const chillRes = analyzeFolders(chillTopDirs, '(chill)');

console.log(`\n=== KẾT QUẢ PHÂN TÍCH ===`);
console.log(`(rap): ${rapRes.abnormal.length} thư mục bất thường / ${rapTopDirs.size} tổng thư mục.`);
console.log(`(chill): ${chillRes.abnormal.length} thư mục bất thường / ${chillTopDirs.size} tổng thư mục.`);

let totalAbnormalFiles = 0;
for (const a of rapRes.abnormal) totalAbnormalFiles += a.fileCount;
for (const a of chillRes.abnormal) totalAbnormalFiles += a.fileCount;

console.log(`Tổng file trong thư mục bất thường: ${totalAbnormalFiles}`);

// Ghi chi tiết ra file
fs.writeFile('scratch/abnormal_detected.json', JSON.stringify({ rap: rapRes.abnormal, chill: chillRes.abnormal }, null, 2));

