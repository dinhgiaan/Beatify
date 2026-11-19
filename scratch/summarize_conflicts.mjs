import fs from 'fs';

const report = JSON.parse(fs.readFileSync('scratch/audit_report.json', 'utf-8'));

console.log('--- TỔNG HỢP XUNG ĐỘT & CẦN XÁC NHẬN ---');

const mergeConflicts = [];
const fileCollisions = [];
const duplicateSongs = [];
const specialConfirmations = [];
const winPathIssues = [];

for (const item of report) {
  if (item.conflicts.some(c => c.includes('đã tồn tại trên đĩa (sẽ merge)'))) {
    mergeConflicts.push({ artist: item.safeArtistFolder, old: item.oldRelPath });
  }
  if (item.conflicts.some(c => c.includes('XUNG ĐỘT: File đích đã tồn tại'))) {
    fileCollisions.push(item);
  }
  if (item.conflicts.some(c => c.includes('TRÙNG LẶP HASH') || c.includes('TRÙNG TÊN & THỜI LƯỢNG'))) {
    duplicateSongs.push(item);
  }
  if (item.conflicts.some(c => c.includes('CẢNH BÁO') || c.includes('dấu "?"'))) {
    winPathIssues.push(item);
  }
  if (item.needsUserConfirmation) {
    specialConfirmations.push({
      old: item.oldRelPath,
      artist: item.canonicalArtist,
      title: item.canonicalTitle,
      reasons: item.confirmationReasons
    });
  }
}

console.log(`1. Thư mục nghệ sĩ đích đã tồn tại (Merge): ${mergeConflicts.length} bài`);
const mergeByArtist = {};
for (const m of mergeConflicts) {
  mergeByArtist[m.artist] = (mergeByArtist[m.artist] || 0) + 1;
}
console.log('   Các nghệ sĩ sẽ merge vào thư mục có sẵn:', mergeByArtist);

console.log(`\n2. Xung đột ghi đè file đích (File collision): ${fileCollisions.length} bài`);
for (const fc of fileCollisions) {
  console.log(`   - ${fc.oldRelPath} -> ${fc.newRelPath}`);
}

console.log(`\n3. Trùng lặp nội dung / bài hát (Duplicates): ${duplicateSongs.length} bài`);
for (const d of duplicateSongs) {
  console.log(`   - ${d.oldRelPath} -> ${d.conflicts.filter(c => c.includes('TRÙNG')).join('; ')}`);
}

console.log(`\n4. Vấn đề ký tự cấm Windows / độ dài path: ${winPathIssues.length} bài`);
for (const w of winPathIssues) {
  console.log(`   - ${w.oldRelPath} -> ${w.conflicts.filter(c => c.includes('?') || c.includes('CẢNH BÁO')).join('; ')}`);
}

console.log(`\n5. Danh sách các bài cần người dùng xác nhận: ${specialConfirmations.length} bài`);
for (const sc of specialConfirmations) {
  console.log(`   - [${sc.artist} - ${sc.title}]: ${sc.reasons.join('; ')}`);
}

