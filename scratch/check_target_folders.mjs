import fs from 'fs';
import path from 'path';

const allScanned = JSON.parse(fs.readFileSync('scratch/all_scanned_raw.json', 'utf-8'));

// Tập hợp tất cả các artist folder hiện có trên đĩa
const existingFolders = new Map();
for (const item of allScanned) {
  if (!existingFolders.has(item.category)) {
    existingFolders.set(item.category, new Set());
  }
  existingFolders.get(item.category).add(item.topDir);
}

// Kiểm tra các nghệ sĩ đích dự kiến
const targetArtists = [
  { cat: '(rap)', name: 'B Ray' },
  { cat: '(rap)', name: 'TOMMY TÈO' },
  { cat: '(rap)', name: 'G-FAMILY' },
  { cat: '(rap)', name: 'Datmaniac' },
  { cat: '(rap)', name: 'Young-H' },
  { cat: '(rap)', name: 'G5R SQUAD Official' },
  { cat: '(rap)', name: 'Jombie' },
  { cat: '(rap)', name: 'Polo G' },
  { cat: '(rap)', name: 'Ryco' },
  { cat: '(rap)', name: 'Lăng LD' },
  { cat: '(rap)', name: 'Quavo & Takeoff' },
  { cat: '(rap)', name: 'Acy' },
  { cat: '(rap)', name: 'HIEUTHUHAI' },
  { cat: '(rap)', name: 'Meek Mill' },
  { cat: '(rap)', name: '5ber1' },
  { cat: '(rap)', name: 'Wowy & Karik' },
  { cat: '(rap)', name: 'Wowy' },
  { cat: '(rap)', name: 'Yxngtabi' },
  { cat: '(rap)', name: 'Pikey' },
  { cat: '(chill)', name: 'B Ray' },
  { cat: '(chill)', name: 'Huỳnh James' },
  { cat: '(chill)', name: 'Phát Hồ' },
  { cat: '(chill)', name: '1nG' },
  { cat: '(chill)', name: 'Pixel Neko' },
  { cat: '(chill)', name: 'Dương Domic' },
  { cat: '(chill)', name: '2T' },
  { cat: '(chill)', name: 'MCK' },
  { cat: '(chill)', name: 'Ronboogz' },
  { cat: '(chill)', name: 'Sơn Tùng M-TP' },
  { cat: '(chill)', name: 'Rhymastic' },
  { cat: '(chill)', name: 'Low G' },
  { cat: '(chill)', name: 'Datmaniac' },
  { cat: '(chill)', name: 'Đạt G' },
  { cat: '(chill)', name: 'H2K' },
  { cat: '(chill)', name: 'W-n' },
  { cat: '(chill)', name: 'Kay Trần' },
  { cat: '(chill)', name: 'Long Cao' },
  { cat: '(chill)', name: 'TTeam' },
  { cat: '(chill)', name: 'DT Tập Rap' },
  { cat: '(chill)', name: 'Aaron Smith' },
  { cat: '(chill)', name: 'Changg' },
  { cat: '(chill)', name: 'Tea & PC' },
  { cat: '(chill)', name: 'Tea' },
];

for (const t of targetArtists) {
  const set = existingFolders.get(t.cat);
  const exact = set.has(t.name);
  const caseInsensitive = Array.from(set).find(x => x.toLowerCase() === t.name.toLowerCase());
  console.log(`[${t.cat}] Target "${t.name}": exact=${exact}, caseMatch="${caseInsensitive || 'none'}"`);
}

