import fs from 'fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const BACKUP_DIR = path.resolve('tools/indexer/backups/pre_reorg_backup_20261118');

async function createBackup() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  console.log(`Đang sao lưu vào: ${BACKUP_DIR}`);

  // 1. Backup youtube_downloads.json
  const ytPath = path.resolve('tools/indexer/.state/youtube_downloads.json');
  if (existsSync(ytPath)) {
    await fs.copyFile(ytPath, path.join(BACKUP_DIR, 'youtube_downloads.json.bak'));
    console.log('✓ Đã backup youtube_downloads.json');
  }

  // 2. Backup overrides.json
  const ovPath = path.resolve('tools/indexer/overrides.json');
  if (existsSync(ovPath)) {
    await fs.copyFile(ovPath, path.join(BACKUP_DIR, 'overrides.json.bak'));
    console.log('✓ Đã backup overrides.json');
  }

  // 3. Backup UserState từ server local
  try {
    const res = await fetch('http://127.0.0.1:4000/local-api/state');
    const json = await res.json();
    if (json.data) {
      await fs.writeFile(
        path.join(BACKUP_DIR, 'user_state.json.bak'),
        JSON.stringify(json.data, null, 2),
        'utf-8'
      );
      console.log('✓ Đã backup UserState (playlists & favorites)');
    }
  } catch (err) {
    console.warn('Lỗi lấy UserState từ server:', err.message);
  }

  // 4. Backup danh sách track.id và metadata hiện tại của toàn bộ 62 bài
  const manifest = JSON.parse(readFileSync('scratch/audit_report.json', 'utf-8'));
  const trackMap = manifest.map(m => ({
    trackId: m.scanned.trackId,
    sha1: m.scanned.sha1,
    category: m.scanned.category,
    oldRelPath: m.oldRelPath,
    newRelPath: m.newRelPath,
    sizeBytes: m.scanned.sizeBytes,
    duration: m.scanned.tags?.duration,
    tags: m.scanned.tags,
    canonicalArtist: m.canonicalArtist,
    canonicalTitle: m.canonicalTitle
  }));

  await fs.writeFile(
    path.join(BACKUP_DIR, 'tracks_mapping_62.json.bak'),
    JSON.stringify(trackMap, null, 2),
    'utf-8'
  );
  console.log(`✓ Đã backup danh sách ánh xạ 62 track.id gốc.`);

  console.log('--- HOÀN TẤT SAO LƯU AN TOÀN ---');
}

createBackup().catch(console.error);

