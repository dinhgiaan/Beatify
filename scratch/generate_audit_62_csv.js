const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_MUSIC = 'D:/music for app';

function getSha1(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha1').update(buf).digest('hex').substring(0, 12);
}

// 1. Load user_state.json.bak
const userState = JSON.parse(
  fs.readFileSync('tools/indexer/backups/pre_reorg_backup_20261118/user_state.json.bak', 'utf8')
);
const chillPlaylist =
  (userState.playlists.find((p) => p.name === 'chill chill ha') || {}).trackIds || [];
const gangPlaylist =
  (userState.playlists.find((p) => p.name === 'gang gang') || {}).trackIds || [];
const favIds = userState.favoriteIds || [];

function lookupPlaylists(trackId) {
  const matched = [];
  if (chillPlaylist.includes(trackId)) matched.push('chill chill ha');
  if (gangPlaylist.includes(trackId)) matched.push('gang gang');
  if (favIds.includes(trackId)) matched.push('Yêu thích');
  return matched.length > 0 ? matched.join('; ') : '-';
}

// 2. Load manifest.csv and mapping
const manifestLines = fs
  .readFileSync('tools/indexer/backups/reorg_logs_20261118/manifest.csv', 'utf8')
  .trim()
  .split('\n')
  .slice(1);
const mapping = JSON.parse(
  fs.readFileSync('tools/indexer/backups/pre_reorg_backup_20261118/tracks_mapping_62.json.bak', 'utf8')
);

// Map oldRelPath -> mapping entry
const mappingByOldRelPath = new Map();
for (const entry of Object.values(mapping)) {
  mappingByOldRelPath.set(entry.oldRelPath, entry);
}

// Special pre-calculated IDs for 3 extra tracks not in 59 mapping
const extraTrackIds = {
  'B Ray\\MV OFFICIAL\\B RAY - Cao Ốc 20.m4a': 'ae80cceecf09',
  'KHOA\\HOMIE BOIZ OFFICIAL\\KHOA - Tết Đong Đầy.m4a': '4e09d10b0b07',
  'RPT Groovie\\RAPITALOVE\\RPT Groovie - Xích Thêm Chút - XTC Remix.m4a': 'b3f8d0f174ce',
};

const rows = [];
const seenIdsBefore = new Set();
const seenIdsAfter = new Set();
let duplicatesBefore = 0;
let duplicatesAfter = 0;
let mismatchCount = 0;

for (let i = 0; i < manifestLines.length; i++) {
  const line = manifestLines[i].trim();
  if (!line) continue;
  const parts = line.split(',');
  const category = parts[0];
  const oldRelPath = parts[1];
  let newRelPath = parts[2];
  const canonicalArtist = parts[3];
  const canonicalTitle = parts[4];

  // Old full path
  const oldFullPath = path.join(ROOT_MUSIC, category, oldRelPath);

  // Get ID trước from backup
  let idBefore = '';
  const mapEntry = mappingByOldRelPath.get(oldRelPath);
  if (mapEntry) {
    idBefore = mapEntry.trackId;
  } else if (extraTrackIds[oldRelPath]) {
    idBefore = extraTrackIds[oldRelPath];
  } else {
    throw new Error(`Cannot find pre-reorg ID for: ${oldRelPath}`);
  }

  // Determine current path on disk (taking into account Steps 3 and 4 renames)
  let currentDiskPath = path.join(ROOT_MUSIC, category, newRelPath);

  // Overrides for paths modified in Steps 3 & 4:
  if (idBefore === '4ac969d8b56e') {
    // Chơi (Remix) -> Chơi (ft. MANBO) (Remix)
    currentDiskPath = path.join(
      ROOT_MUSIC,
      '(rap)',
      'HIEUTHUHAI/Singles/Chơi (ft. MANBO) (Remix)/HIEUTHUHAI - Chơi (ft. MANBO) (Remix).m4a'
    );
  } else if (idBefore === '62e884555d9b') {
    // Going Bad (feat. Drake) -> Going Bad (ft. Drake)
    currentDiskPath = path.join(
      ROOT_MUSIC,
      '(rap)',
      'Meek Mill/Singles/Going Bad (ft. Drake)/Meek Mill - Going Bad (ft. Drake).m4a'
    );
  } else if (idBefore === 'b686d4957ccb') {
    // Làm Liều (feat. Kriss Ngo) -> Làm Liều (ft. Kriss Ngo)
    currentDiskPath = path.join(
      ROOT_MUSIC,
      '(rap)',
      '5ber1/Singles/Làm Liều (ft. Kriss Ngo)/5ber1 - Làm Liều (ft. Kriss Ngo).m4a'
    );
  } else if (idBefore === '457234a364d0') {
    // Cưới Đi (Lyric Video) -> Cưới Đi
    currentDiskPath = path.join(ROOT_MUSIC, '(chill)', '2T/Singles/Cưới Đi/2T - Cưới Đi.m4a');
  } else if (idBefore === 'a0c4d8722a3e') {
    // Young-H -> Young H
    currentDiskPath = path.join(ROOT_MUSIC, '(rap)', 'Young H/Singles/Bạn Của Tao/Young H - Bạn Của Tao.m4a');
  } else if (idBefore === 'b1d223b66897') {
    // Muốn Nói Với Em restored to TTeam
    currentDiskPath = path.join(
      ROOT_MUSIC,
      '(chill)',
      'TTeam/Singles/Muốn Nói Với Em (ft. DT Tập Rap)/TTeam - Muốn Nói Với Em (ft. DT Tập Rap).m4a'
    );
  } else if (idBefore === '62a7ccbe277b') {
    // Muốn Nói Với Em duplicate moved to _duplicates
    currentDiskPath = path.join(
      ROOT_MUSIC,
      '_duplicates/MUỐN NÓI VỚI EM (BlackBi)/Singles/TTeam/TTeam - Muốn Nói Với Em (ft. DT Tập Rap).m4a'
    );
  }

  // Compute current SHA1 from disk
  const idAfter = getSha1(currentDiskPath);
  const isMatch = idBefore === idAfter;

  if (!isMatch) {
    mismatchCount++;
    console.error(`MISMATCH: row ${i+1}: ${canonicalTitle} -> before: ${idBefore}, after: ${idAfter}, path: ${currentDiskPath}`);
  }

  if (seenIdsBefore.has(idBefore)) {
    duplicatesBefore++;
    console.warn(`DUPLICATE ID BEFORE: ${idBefore} in track ${canonicalTitle}`);
  }
  seenIdsBefore.add(idBefore);

  if (idAfter) {
    if (seenIdsAfter.has(idAfter)) {
      duplicatesAfter++;
      console.warn(`DUPLICATE ID AFTER: ${idAfter} in track ${canonicalTitle}`);
    }
    seenIdsAfter.add(idAfter);
  }

  // Lookup playlists
  const playlistInfo = lookupPlaylists(idBefore);

  // Compute relative new path for display
  const displayNewRelPath = path.relative(ROOT_MUSIC, currentDiskPath);
  const displayOldRelPath = path.relative(ROOT_MUSIC, oldFullPath);

  rows.push({
    stt: i + 1,
    title: `${canonicalArtist} - ${canonicalTitle}`,
    oldPath: displayOldRelPath,
    newPath: displayNewRelPath,
    idBefore,
    idAfter: idAfter || 'FILE_NOT_FOUND',
    isMatch: isMatch ? 'true' : 'false',
    playlist: playlistInfo,
  });
}

console.log('--- REORG 62 TRACKS AUDIT ---');
console.log('Total tracks processed:', rows.length);
console.log('Duplicates before:', duplicatesBefore);
console.log('Duplicates after:', duplicatesAfter);
console.log('Mismatches (idBefore !== idAfter):', mismatchCount);

// Export CSV
const csvHeader = 'STT,Tên bài,Đường dẫn cũ,Đường dẫn mới,ID trước (Backup),ID sau (Tính mới),Khớp,Thuộc playlist nào\n';
const csvLines = rows.map((r) =>
  [
    r.stt,
    `"${r.title.replace(/"/g, '""')}"`,
    `"${r.oldPath.replace(/"/g, '""')}"`,
    `"${r.newPath.replace(/"/g, '""')}"`,
    r.idBefore,
    r.idAfter,
    r.isMatch,
    `"${r.playlist.replace(/"/g, '""')}"`,
  ].join(',')
);

const outCsvPath = 'tools/indexer/backups/reorg_logs_20261118/audit_62_tracks_verified.csv';
fs.writeFileSync(outCsvPath, '\uFEFF' + csvHeader + csvLines.join('\n'), 'utf8');
console.log('Successfully wrote verified CSV to:', outCsvPath);

// Also copy to artifact directory for clickable user access
const artifactCsvPath =
  'C:/Users/dinhgiaan/.gemini/antigravity/brain/22d4b692-5a14-4848-bf91-d3efdd10738d/audit_62_tracks_verified.csv';
try {
  fs.writeFileSync(artifactCsvPath, '\uFEFF' + csvHeader + csvLines.join('\n'), 'utf8');
  console.log('Copied to artifact directory:', artifactCsvPath);
} catch (e) {
  console.warn('Could not copy to artifact dir:', e.message);
}

