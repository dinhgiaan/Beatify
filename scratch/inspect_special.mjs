import fs from 'fs';
import path from 'path';

const allScanned = JSON.parse(fs.readFileSync('scratch/all_scanned_raw.json', 'utf-8'));

for (const item of allScanned) {
  if (
    item.relToCategory.includes('Cao Ốc 20') ||
    item.relToCategory.includes('Tết Đong Đầy') ||
    item.relToCategory.includes('XTC Remix') ||
    item.relToCategory.includes('Xích Thêm Chút')
  ) {
    console.log('--- FOUND ---');
    console.log('Category:', item.category);
    console.log('Rel:', item.relToCategory);
    console.log('Tags:', item.tags);
    console.log('InfoTxt:', item.infoTxt?.path);
  }
}

