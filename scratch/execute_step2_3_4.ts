import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

const ROOT = 'D:/music for app';

function getSha1(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha1').update(buf).digest('hex').substring(0, 12);
}

function sendToRecycleBin(targetPath: string) {
  const escaped = targetPath.replace(/'/g, "''");
  const psCmd = `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('${escaped}', 'OnlyErrorDialogs', 'SendToRecycleBin')`;
  execSync(`powershell -NoProfile -Command "${psCmd}"`);
}

const operationsLog: any[] = [];

// ==========================================
// BƯỚC 2: Chuẩn hóa artist trong overrides.json & youtube_downloads.json
// ==========================================
const ovPath = 'tools/indexer/overrides.json';
const ov = JSON.parse(fs.readFileSync(ovPath, 'utf-8'));

const ytdlPath = 'tools/indexer/.state/youtube_downloads.json';
const ytdl = fs.existsSync(ytdlPath) ? JSON.parse(fs.readFileSync(ytdlPath, 'utf-8')) : [];

// Bảng cập nhật artist canonical
const artistUpdates: Record<string, string> = {
  // 1. B Ray
  '144a54348923': 'B Ray', // Xin Đừng Nhấc Máy (B RAY -> B Ray)

  // 2. Sơn Tùng M-TP
  'a2fb4e610d0f': 'Sơn Tùng M-TP', // Hãy Trao Cho Anh
  'b4d932a10181': 'Sơn Tùng M-TP', // Muộn Rồi Mà Sao Còn
  '070efa36e613': 'Sơn Tùng M-TP', // Đừng Làm Trái Tim Anh Đau

  // 3. TOMMY TÈO
  '6959fbe45113': 'TOMMY TÈO', // Nhắc tới freestyle... (Tommy Tèo -> TOMMY TÈO)

  // 4. Đạt G
  '6257f372bf5d': 'Đạt G', // Bánh Mì Không
  '782c7700a184': 'Đạt G', // EmmE
  'ba6e232771fe': 'Đạt G', // Khó Vẽ Nụ Cười

  // 5. Wowy
  '4f46f58e59c7': 'Wowy', // Thiên Đàng (WOWY -> Wowy)

  // 6. Jombie
  '4314eb0187a9': 'Jombie', // Sầu Hồng Gai (JOMBIE -> Jombie)

  // 7. JustaTee
  '9f20218e61f6': 'JustaTee', // crying over you (JUSTATEE -> JustaTee)

  // 8. Central Cee
  '7f6bceee98ac': 'Central Cee', // Band4band (CENTRAL CEE -> Central Cee)

  // 9. NLE Choppa
  'a427308f206c': 'NLE Choppa', // Shotta Flow Remix (NLE CHOPPA -> NLE Choppa)

  // 10. Jack
  'e3fecae89474': 'Jack', // Sao Em Vô Tình (JACK -> Jack)

  // 11. Rum
  '77e21c33e0ff': 'Rum', // Kém Duyên (RUM -> Rum)

  // 12. Mr T
  '6f79d746ed44': 'Mr T', // Thu Cuối (Mr.T -> Mr T)

  // 13. W/n (hiển thị)
  '4db0ac503082': 'W/n', // 3107 (W-n -> W/n)

  // 14. Young H
  'a0c4d8722a3e': 'Young H', // Bạn Của Tao (Young-H -> Young H)
};

for (const [id, newArtist] of Object.entries(artistUpdates)) {
  if (!ov.tracks[id]) ov.tracks[id] = {};
  const oldArtist = ov.tracks[id].artist;
  ov.tracks[id].artist = newArtist;
  operationsLog.push({
    action: 'CANONICALIZE_ARTIST',
    trackId: id,
    oldArtist,
    newArtist
  });

  // Cập nhật youtube_downloads
  const yEntry = ytdl.find((y: any) => y.trackId === id);
  if (yEntry) {
    yEntry.artist = newArtist;
  }
}

// ==========================================
// BƯỚC 3: Đổi tên 4 bài đã duyệt
// ==========================================
// 1. Chơi (ft. MANBO) (Remix) [f17a942faef0]
// 2. Going Bad (ft. Drake) [1ef982c6114a]
// 3. Làm Liều (ft. Kriss Ngo) [d28472f8832a]
// 4. Cưới Đi [457234a364d0]

const renameTasks = [
  {
    id: '4ac969d8b56e',
    artist: 'HIEUTHUHAI',
    oldTitle: 'Chơi (Remix) ft. MANBO',
    newTitle: 'Chơi (ft. MANBO) (Remix)',
    oldDir: path.join(ROOT, '(rap)/HIEUTHUHAI/Singles/Chơi (Remix) ft. MANBO'),
    newDir: path.join(ROOT, '(rap)/HIEUTHUHAI/Singles/Chơi (ft. MANBO) (Remix)'),
    prefix: 'HIEUTHUHAI - '
  },
  {
    id: '62e884555d9b',
    artist: 'Meek Mill',
    oldTitle: 'Going Bad (feat. Drake)',
    newTitle: 'Going Bad (ft. Drake)',
    oldDir: path.join(ROOT, '(rap)/Meek Mill/Singles/Going Bad (feat. Drake)'),
    newDir: path.join(ROOT, '(rap)/Meek Mill/Singles/Going Bad (ft. Drake)'),
    prefix: 'Meek Mill - '
  },
  {
    id: 'b686d4957ccb',
    artist: '5ber1',
    oldTitle: 'Làm Liều (feat. Kriss Ngo)',
    newTitle: 'Làm Liều (ft. Kriss Ngo)',
    oldDir: path.join(ROOT, '(rap)/5ber1/Singles/Làm Liều (feat. Kriss Ngo)'),
    newDir: path.join(ROOT, '(rap)/5ber1/Singles/Làm Liều (ft. Kriss Ngo)'),
    prefix: '5ber1 - '
  },
  {
    id: '457234a364d0',
    artist: '2T',
    oldTitle: 'Cưới Đi (Lyric Video)',
    newTitle: 'Cưới Đi',
    oldDir: path.join(ROOT, '(chill)/2T/Singles/Cưới Đi (Lyric Video)'),
    newDir: path.join(ROOT, '(chill)/2T/Singles/Cưới Đi'),
    prefix: '2T - '
  }
];

for (const t of renameTasks) {
  // Check old audio file and verify SHA1 before move
  const oldM4a = path.join(t.oldDir, `${t.prefix}${t.oldTitle}.m4a`);
  const sha1Before = getSha1(oldM4a);
  if (sha1Before !== t.id) {
    throw new Error(`SHA1 mismatch before rename for track ${t.id}: ${sha1Before}`);
  }

  // Create new dir
  fs.mkdirSync(t.newDir, { recursive: true });

  // Move files
  const files = fs.readdirSync(t.oldDir);
  for (const f of files) {
    const src = path.join(t.oldDir, f);
    let destName = f;
    if (f.startsWith(t.prefix)) {
      const ext = path.extname(f);
      destName = `${t.prefix}${t.newTitle}${ext}`;
    }
    const dest = path.join(t.newDir, destName);
    fs.renameSync(src, dest);
  }

  // Delete old empty dir via Recycle Bin
  sendToRecycleBin(t.oldDir);

  // Check new audio file and verify SHA1 after move
  const newM4a = path.join(t.newDir, `${t.prefix}${t.newTitle}.m4a`);
  const sha1After = getSha1(newM4a);
  if (sha1After !== t.id) {
    throw new Error(`SHA1 mismatch after rename for track ${t.id}: ${sha1After}`);
  }

  // Update overrides.json
  if (!ov.tracks[t.id]) ov.tracks[t.id] = {};
  ov.tracks[t.id].title = t.newTitle;

  // Update youtube_downloads
  const yEntry = ytdl.find((y: any) => y.trackId === t.id);
  if (yEntry) {
    yEntry.title = t.newTitle;
    yEntry.filePath = newM4a;
  }

  operationsLog.push({
    action: 'RENAME_TRACK',
    trackId: t.id,
    oldTitle: t.oldTitle,
    newTitle: t.newTitle,
    oldDir: t.oldDir,
    newDir: t.newDir,
    sha1Before,
    sha1After,
    match: sha1Before === sha1After
  });
}

// ==========================================
// BƯỚC 4: Gộp thư mục vật lý trùng tên nghệ sĩ
// ==========================================

// 4.1. Gộp Young-H vào Young H
const youngHDir = path.join(ROOT, '(rap)/Young H');
const youngHDashDir = path.join(ROOT, '(rap)/Young-H');

if (fs.existsSync(youngHDashDir)) {
  const singlesSource = path.join(youngHDashDir, 'Singles');
  const singlesDest = path.join(youngHDir, 'Singles');
  fs.mkdirSync(singlesDest, { recursive: true });

  const trackFolders = fs.readdirSync(singlesSource, { withFileTypes: true }).filter(d => d.isDirectory());
  for (const tf of trackFolders) {
    const srcFolder = path.join(singlesSource, tf.name);
    const destFolder = path.join(singlesDest, tf.name);
    if (fs.existsSync(destFolder)) {
      throw new Error(`Collision in Young H folder: ${destFolder} already exists!`);
    }

    // Move track folder
    fs.mkdirSync(destFolder, { recursive: true });
    const files = fs.readdirSync(srcFolder);
    for (const f of files) {
      let destName = f;
      if (f.startsWith('Young-H - ')) {
        destName = f.replace('Young-H - ', 'Young H - ');
      }
      fs.renameSync(path.join(srcFolder, f), path.join(destFolder, destName));
    }
    // Delete srcFolder
    sendToRecycleBin(srcFolder);

    // Verify audio file hash
    const audioFile = path.join(destFolder, 'Young H - Bạn Của Tao.m4a');
    const hashAfter = getSha1(audioFile);
    console.log('Young H Bạn Của Tao hash after move:', hashAfter);
    if (hashAfter !== 'a0c4d8722a3e') {
      throw new Error(`Hash mismatch after moving Bạn Của Tao: ${hashAfter}`);
    }

    // Update youtube_downloads
    const yEntry = ytdl.find((y: any) => y.trackId === 'a0c4d8722a3e');
    if (yEntry) {
      yEntry.filePath = audioFile;
      yEntry.artist = 'Young H';
    }

    operationsLog.push({
      action: 'MERGE_ARTIST_FOLDER',
      artist: 'Young H',
      sourceDir: srcFolder,
      destDir: destFolder,
      trackId: 'a0c4d8722a3e',
      sha1: hashAfter
    });
  }

  // Delete remaining files in youngHDashDir (artist.png, desktop.ini) then send dir to Recycle Bin
  sendToRecycleBin(youngHDashDir);
  console.log('Sent Young-H folder to Recycle Bin.');
}

// 4.2. Gộp ĐạtG vào Đạt G
const datGDir = path.join(ROOT, '(chill)/Đạt G');
const datGNoSpaceDir = path.join(ROOT, '(chill)/ĐạtG');

if (fs.existsSync(datGNoSpaceDir)) {
  const singlesSource = path.join(datGNoSpaceDir, 'Singles');
  const singlesDest = path.join(datGDir, 'Singles');
  fs.mkdirSync(singlesDest, { recursive: true });

  const trackFolders = fs.readdirSync(singlesSource, { withFileTypes: true }).filter(d => d.isDirectory());
  for (const tf of trackFolders) {
    const srcFolder = path.join(singlesSource, tf.name);
    const destFolder = path.join(singlesDest, tf.name);
    if (fs.existsSync(destFolder)) {
      throw new Error(`Collision in Đạt G folder: ${destFolder} already exists!`);
    }

    // Move track folder
    fs.mkdirSync(destFolder, { recursive: true });
    const files = fs.readdirSync(srcFolder);
    let movedAudioPath = '';
    for (const f of files) {
      let destName = f;
      if (f.startsWith('ĐạtG - ')) {
        destName = f.replace('ĐạtG - ', 'Đạt G - ');
      }
      const dest = path.join(destFolder, destName);
      fs.renameSync(path.join(srcFolder, f), dest);
      if (f.endsWith('.m4a')) movedAudioPath = dest;
    }
    sendToRecycleBin(srcFolder);

    const hashAfter = getSha1(movedAudioPath);
    console.log(`Đạt G [${tf.name}] hash after move:`, hashAfter);

    const yEntry = ytdl.find((y: any) => y.filePath && path.basename(y.filePath) === path.basename(movedAudioPath));
    if (yEntry) {
      yEntry.filePath = movedAudioPath;
      yEntry.artist = 'Đạt G';
    }

    operationsLog.push({
      action: 'MERGE_ARTIST_FOLDER',
      artist: 'Đạt G',
      sourceDir: srcFolder,
      destDir: destFolder,
      trackFolder: tf.name,
      sha1: hashAfter
    });
  }

  sendToRecycleBin(datGNoSpaceDir);
  console.log('Sent ĐạtG folder to Recycle Bin.');
}

// 4.3. Mr T vs Mr.T collision detection & logging
const mrTDir = path.join(ROOT, '(chill)/Mr T');
const mrTDotDir = path.join(ROOT, '(chill)/Mr.T');
if (fs.existsSync(mrTDir) && fs.existsSync(mrTDotDir)) {
  operationsLog.push({
    action: 'COLLISION_DETECTED',
    artist: 'Mr T vs Mr.T',
    reason: 'Both directories contain folder "Thu Cuối". Holding folder merge pending user decision at ĐD1.',
    mrTPath: mrTDir,
    mrTDotPath: mrTDotDir,
    tracks: [
      { id: '214bf32d20a7', dir: path.join(mrTDir, 'Singles/Thu Cuối') },
      { id: '6f79d746ed44', dir: path.join(mrTDotDir, 'Singles/Thu Cuối') }
    ]
  });
  console.log('Detected collision between Mr T and Mr.T: Both contain "Thu Cuối". Keeping as-is and reporting at ĐD1.');
}

// Save overrides.json & youtube_downloads.json
fs.writeFileSync(ovPath, JSON.stringify(ov, null, 2), 'utf-8');
fs.writeFileSync(ytdlPath, JSON.stringify(ytdl, null, 2), 'utf-8');

// Save operations log
const logFilePath = 'tools/indexer/backups/reorg_logs_20261118/step1_4_operations_log.json';
fs.writeFileSync(logFilePath, JSON.stringify(operationsLog, null, 2), 'utf-8');
console.log('Saved step 1-4 operations log to:', logFilePath);
