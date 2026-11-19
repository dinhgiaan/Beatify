// Script A1b: Phân tích chi tiết 503 orphan covers
// Phân loại: trùng custom_covers (cache) vs hoàn toàn không tham chiếu
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const LOGS_DIR = path.join(ROOT, 'tools/indexer/backups/reorg_logs_20261118');
const ORPHANS_LIST = path.join(LOGS_DIR, 'r2_orphans_list.json');
const OVERRIDES_JSON = path.join(ROOT, 'tools/indexer/overrides.json');
const CUSTOM_COVERS_DIR = path.join(ROOT, 'tools/indexer/custom_covers');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { reject(new Error(`Parse error: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

async function main() {
  // Load orphans list
  const allOrphans = JSON.parse(fs.readFileSync(ORPHANS_LIST, 'utf8'));
  const coverOrphans = allOrphans.filter(o => {
    const key = o.key || o;
    return typeof key === 'string' && key.startsWith('covers/') && key.endsWith('.jpg');
  });
  console.log(`\n📋 Tổng orphan covers trên R2: ${coverOrphans.length}`);

  // Fetch library từ API
  const libResp = await fetchJson('http://127.0.0.1:4000/local-api/library');
  const tracks = libResp.tracks || libResp;
  
  // Lấy albumIds đang active trong library
  const activeAlbumIds = new Set();
  for (const track of tracks) {
    if (track.albumId) activeAlbumIds.add(track.albumId);
  }
  console.log(`📚 Active albumIds trong library: ${activeAlbumIds.size}`);

  // Lấy albumIds có trong custom_covers
  const customCoverFiles = new Set(
    fs.readdirSync(CUSTOM_COVERS_DIR).map(f => f.replace(/\.(jpg|png|webp)$/i, ''))
  );
  console.log(`🎨 Files trong custom_covers/: ${customCoverFiles.size}`);

  // Overrides cover refs
  const overrides = JSON.parse(fs.readFileSync(OVERRIDES_JSON, 'utf8'));
  const overridesCoverIds = new Set();
  for (const [, ovr] of Object.entries(overrides)) {
    if (ovr && ovr.cover) {
      const m = String(ovr.cover).match(/([a-f0-9]{12,})/);
      if (m) overridesCoverIds.add(m[1]);
    }
  }

  // Phân loại từng orphan cover
  const groups = {
    // Active trong library (không nên có trong orphan list - kiểm tra xem sao)
    inLibrary: [],
    // Có trong custom_covers nhưng albumId không active → đây là cache cũ từ album đã đổi tên
    onlyInCustomCache: [],
    // Chỉ trong overrides
    onlyInOverrides: [],
    // Không ở đâu cả → xóa được hoàn toàn
    fullyOrphan: [],
  };

  for (const o of coverOrphans) {
    const key = o.key || o;
    const albumId = path.basename(key, '.jpg');
    
    if (activeAlbumIds.has(albumId)) {
      groups.inLibrary.push({ key, albumId });
    } else if (overridesCoverIds.has(albumId)) {
      groups.onlyInOverrides.push({ key, albumId });
    } else if (customCoverFiles.has(albumId)) {
      groups.onlyInCustomCache.push({ key, albumId });
    } else {
      groups.fullyOrphan.push({ key, albumId });
    }
  }

  console.log('\n=== KẾT QUẢ PHÂN LOẠI ===');
  console.log(`✅ Covers đang active trong library (KHÔNG xóa): ${groups.inLibrary.length}`);
  console.log(`📌 Trong overrides.json (KHÔNG xóa): ${groups.onlyInOverrides.length}`);
  console.log(`🗂️  Chỉ trong custom_covers cache (cũ, album đổi albumId): ${groups.onlyInCustomCache.length}`);
  console.log(`🗑️  Hoàn toàn orphan (không tham chiếu ở đâu): ${groups.fullyOrphan.length}`);
  console.log(`\n   Tổng an toàn để xóa (cache + hoàn toàn orphan): ${groups.onlyInCustomCache.length + groups.fullyOrphan.length}`);

  // Giải thích
  console.log('\n📝 Lưu ý:');
  console.log('  - "custom_covers cache" = ảnh đã được extract/synced lên R2 với albumId cũ trước khi tên nghệ sĩ được chuẩn hóa');
  console.log('  - File trong custom_covers/ VẪN CÒN tồn tại trên đĩa, chỉ key R2 cũ là orphan');
  console.log('  - Nếu xóa key R2 cũ → không ảnh hưởng vì library.json đang dùng albumId mới');
  
  if (groups.inLibrary.length > 0) {
    console.log(`\n⚠️  ${groups.inLibrary.length} covers vẫn active → KHÔNG xóa:`);
    for (const r of groups.inLibrary) console.log(`  ${r.key}`);
  }
  
  if (groups.onlyInOverrides.length > 0) {
    console.log(`\n📌 Covers trong overrides:`);
    for (const r of groups.onlyInOverrides) console.log(`  ${r.key}`);
  }

  // 10 "fully orphan" (safe to delete - not even in custom_covers)
  if (groups.fullyOrphan.length > 0) {
    console.log(`\n🗑️  ${groups.fullyOrphan.length} fully orphan covers (không có file custom_covers tương ứng):`);
    for (const r of groups.fullyOrphan) console.log(`  ${r.key}`);
  }

  // Save detailed report
  const report = {
    generatedAt: new Date().toISOString(),
    totalOrphanCovers: coverOrphans.length,
    activeInLibrary: groups.inLibrary.length,
    inOverrides: groups.onlyInOverrides.length,
    onlyInCustomCache: groups.onlyInCustomCache.length,
    fullyOrphan: groups.fullyOrphan.length,
    totalSafeToDelete: groups.onlyInCustomCache.length + groups.fullyOrphan.length,
    details: groups,
  };

  const reportPath = path.join(LOGS_DIR, 'orphan_covers_verification.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n💾 Báo cáo lưu tại: ${reportPath}`);
}

main().catch(err => { console.error('❌ Lỗi:', err.message); process.exit(1); });
