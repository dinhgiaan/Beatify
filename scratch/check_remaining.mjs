import fs from 'fs';
import path from 'path';

const allScanned = JSON.parse(fs.readFileSync('scratch/all_scanned_raw.json', 'utf-8'));
const plan = JSON.parse(fs.readFileSync('C:/Users/dinhgiaan/.gemini/antigravity/brain/22d4b692-5a14-4848-bf91-d3efdd10738d/scratch/reorganization_plan.json', 'utf-8'));

const plannedFullPaths = new Set(plan.map(p => path.normalize(p.currentFileFull).toLowerCase()));

const remaining = allScanned.filter(item => !plannedFullPaths.has(path.normalize(item.fullPath).toLowerCase()));

console.log(`Số bài trong plan: ${plan.length}`);
console.log(`Số bài còn lại cần kiểm tra: ${remaining.length}`);

// Kiểm tra 306 bài còn lại xem có cấu trúc bất thường nào không
const suspicious = [];
for (const item of remaining) {
  // Chuẩn: <Artist>\Singles\<TrackName>\<Artist> - <TrackName>.ext
  const parts = item.parts;
  const issues = [];

  if (parts.length < 3) {
    issues.push(`Thiếu cấp thư mục: parts=${parts.length}`);
  } else {
    const artistDir = parts[0];
    const typeDir = parts[1]; // Singles hoặc Albums
    const trackDir = parts[2];

    if (typeDir !== 'Singles' && typeDir !== 'Albums') {
      issues.push(`Thư mục loại không phải Singles/Albums: "${typeDir}"`);
    }

    // Kiểm tra tên artistDir có chứa dấu ngoặc vuông hoặc từ khóa lạ
    if (/\[|\]/i.test(artistDir)) {
      issues.push(`ArtistDir chứa ngoặc vuông: "${artistDir}"`);
    }
  }

  if (issues.length > 0) {
    suspicious.push({
      item,
      issues
    });
  }
}

console.log(`Số bài còn lại có dấu hiệu bất thường: ${suspicious.length}`);
for (const s of suspicious) {
  console.log(`- [${s.item.category}] ${s.item.relToCategory}: ${s.issues.join('; ')}`);
}

