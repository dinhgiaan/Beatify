// Script B: Kiểm tra favorites, playlist counts, và baa55f484230
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const USER_STATE_BAK = path.join(ROOT, 'tools/indexer/backups/pre_reorg_backup_20261118/user_state.json.bak');

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
  // Đọc user_state.json.bak
  const bakState = JSON.parse(fs.readFileSync(USER_STATE_BAK, 'utf8'));
  
  console.log('\n=== B: PHÂN TÍCH USER STATE ===');
  
  // Favorites
  const favorites = bakState.favoriteIds || bakState.favorites || [];
  console.log(`\n1. Favorites trong user_state.json.bak:`);
  console.log(`   Key dùng: ${bakState.favoriteIds ? 'favoriteIds' : bakState.favorites ? 'favorites' : '(không có)'}`);
  console.log(`   Số lượng: ${favorites.length}`);
  if (Array.isArray(favorites)) {
    for (const id of favorites) {
      console.log(`   - ${id}`);
    }
  }
  
  // Playlists
  const playlists = bakState.playlists || [];
  console.log(`\n2. Playlists trong user_state.json.bak:`);
  console.log(`   Số playlist: ${playlists.length}`);
  for (const pl of playlists) {
    const count = (pl.trackIds || []).length;
    console.log(`   - "${pl.name}": ${count} trackIds`);
  }
  
  // Fetch current state from API
  console.log('\n3. Trạng thái hiện tại (từ API):');
  let currentState;
  try {
    currentState = await fetchJson('http://127.0.0.1:4000/local-api/state');
    
    const curFavorites = currentState.favoriteIds || currentState.favorites || [];
    const curFavKey = currentState.favoriteIds !== undefined ? 'favoriteIds' : 'favorites';
    console.log(`   Favorites hiện tại (key: ${curFavKey}): ${Array.isArray(curFavorites) ? curFavorites.length : 0} items`);
    if (Array.isArray(curFavorites)) {
      for (const id of curFavorites) console.log(`   - ${id}`);
    }
    
    const curPlaylists = currentState.playlists || [];
    console.log(`   Playlists hiện tại: ${curPlaylists.length}`);
    for (const pl of curPlaylists) {
      const count = (pl.trackIds || []).length;
      console.log(`   - "${pl.name}": ${count} trackIds`);
    }
  } catch(e) {
    console.log(`   ⚠️  Không lấy được state từ API: ${e.message}`);
  }
  
  // Fetch library để kiểm tra từng favoriteId
  console.log('\n4. Kiểm tra từng favoriteId trong library hiện tại:');
  const libResp = await fetchJson('http://127.0.0.1:4000/local-api/library');
  const tracks = libResp.tracks || libResp;
  const trackById = {};
  for (const t of tracks) trackById[t.id] = t;
  
  const favIds = [...new Set([...favorites, ...(currentState?.favoriteIds || currentState?.favorites || [])])];
  for (const id of favIds) {
    const track = trackById[id];
    if (track) {
      console.log(`   ✅ ${id} → "${track.artist} - ${track.title}" (active)`);
    } else {
      console.log(`   ❌ ${id} → KHÔNG TÌM THẤY trong library (orphan)`);
    }
  }
  
  // Kiểm tra baa55f484230 cụ thể
  console.log('\n5. Chi tiết baa55f484230:');
  const baa = trackById['baa55f484230'];
  if (baa) {
    console.log(`   ✅ Có trong library: "${baa.artist} - ${baa.title}"`);
  } else {
    console.log(`   ❌ KHÔNG có trong library hiện tại`);
  }
  
  // Tìm 0dde57433c84 (Dương Domic - Mất Kết Nối theo giả thuyết)
  const ddc = trackById['0dde57433c84'];
  if (ddc) {
    console.log(`   ID 0dde57433c84 trong library: "${ddc.artist} - ${ddc.title}"`);
  } else {
    console.log(`   ID 0dde57433c84: KHÔNG có trong library`);
  }
  
  // Kiểm tra file Dương Domic
  const duongDomic = tracks.filter(t => 
    t.artist && t.artist.toLowerCase().includes('dương domic') ||
    t.title && t.title.toLowerCase().includes('mất kết nối')
  );
  console.log(`\n6. Track "Dương Domic / Mất Kết Nối" trong library:`);
  if (duongDomic.length > 0) {
    for (const t of duongDomic) {
      console.log(`   ID: ${t.id} | "${t.artist} - ${t.title}"`);
    }
  } else {
    console.log('   Không tìm thấy');
  }
  
  // So sánh playlist track counts giữa bak và hiện tại
  if (currentState) {
    console.log('\n7. So sánh playlist counts (bak vs hiện tại):');
    const curPls = {};
    for (const pl of (currentState.playlists || [])) {
      curPls[pl.name] = (pl.trackIds || []).length;
    }
    for (const pl of playlists) {
      const bakCount = (pl.trackIds || []).length;
      const curCount = curPls[pl.name] ?? 'N/A';
      const diff = typeof curCount === 'number' ? curCount - bakCount : '?';
      console.log(`   "${pl.name}": bak=${bakCount}, hiện tại=${curCount}, diff=${diff}`);
    }
    
    // Playlists mới trong current không có trong bak
    const bakNames = new Set(playlists.map(p => p.name));
    for (const pl of (currentState.playlists || [])) {
      if (!bakNames.has(pl.name)) {
        console.log(`   "${pl.name}": KHÔNG có trong bak (playlist mới), hiện tại=${(pl.trackIds||[]).length}`);
      }
    }
  }
  
  console.log('\n✅ Xong script B.');
}

main().catch(err => { console.error('❌ Lỗi:', err.message); process.exit(1); });

