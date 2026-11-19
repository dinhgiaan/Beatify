import fs from 'fs';
import path from 'path';

const allScanned = JSON.parse(fs.readFileSync('scratch/all_scanned_raw.json', 'utf-8'));

// Tập hợp tất cả các artist folder hiện có trên đĩa
const existingFolders = new Map(); // category -> Set of folder names
for (const item of allScanned) {
  if (!existingFolders.has(item.category)) {
    existingFolders.set(item.category, new Set());
  }
  existingFolders.get(item.category).add(item.topDir);
}

console.log('--- CÁC THƯ MỤC NGHỆ SĨ HIỆN CÓ ---');
for (const [cat, set] of existingFolders.entries()) {
  console.log(`[${cat}] có ${set.size} thư mục cấp 1.`);
}

// Kiểm tra case sensitivity của các thư mục hiện có
for (const [cat, set] of existingFolders.entries()) {
  const lowerMap = new Map();
  for (const name of set) {
    const l = name.toLowerCase();
    if (lowerMap.has(l)) {
      console.log(`[${cat}] Xung đột chữ hoa/thường: "${lowerMap.get(l)}" vs "${name}"`);
    } else {
      lowerMap.set(l, name);
    }
  }
}

