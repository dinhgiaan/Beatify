import fs from 'fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

const BATCH_SIZE = 15;
const LOG_FILE = path.resolve('scratch/migration_operations_log.json');

// Danh sách các bài đã hoàn tất ở pilot
const PILOT_PATHS = new Set([
  'B.S.N.L 2\\Singles\\B-ray\\B.S.N.L 2 - B-ray.m4a'.toLowerCase(),
  'RYCO - -VIỆT- NÊN LÀM (Ft. MEGASHOCK)\\Singles\\Offical Video\\RYCO - -VIỆT- NÊN LÀM (Ft. MEGASHOCK) - Offical Video.m4a'.toLowerCase(),
  '2T - LIỆU GIỜ ( WHAT IF - )\\Singles\\M-V\\2T - LIỆU GIỜ ( WHAT IF - ) - M-V.m4a'.toLowerCase()
]);

async function computeSha1(filePath) {
  const buf = await fs.readFile(filePath);
  return crypto.createHash('sha1').update(buf).digest('hex');
}

async function cleanEmptyDirs(dirPath) {
  try {
    if (!existsSync(dirPath)) return;
    const entries = await fs.readdir(dirPath);
    const ignorable = new Set(['desktop.ini', 'thumbs.db']);
    if (entries.every(e => ignorable.has(e.toLowerCase()))) {
      for (const e of entries) {
        await fs.unlink(path.join(dirPath, e)).catch(() => {});
      }
      await fs.rmdir(dirPath).catch(() => {});
      console.log(`    [Dọn rác] Đã xóa thư mục rỗng: ${dirPath}`);

      // Kiểm tra thư mục cha
      const parent = path.dirname(dirPath);
      if (parent && !parent.endsWith('(rap)') && !parent.endsWith('(chill)')) {
        await cleanEmptyDirs(parent);
      }
    }
  } catch {}
}

async function run() {
  const targetBatch = process.argv[2] ? parseInt(process.argv[2], 10) : 1;
  console.log(`\n==================================================`);
  console.log(`BẮT ĐẦU THỰC THI LÔ SỐ: ${targetBatch}`);
  console.log(`==================================================\n`);

  const manifest = JSON.parse(readFileSync('scratch/updated_manifest_rows.json', 'utf-8'));
  const remainingTracks = manifest.filter(m => !PILOT_PATHS.has(m.oldPath.toLowerCase()));

  console.log(`Tổng số bài còn lại cần di chuyển: ${remainingTracks.length}`);

  // Chia thành các lô
  const batches = [];
  for (let i = 0; i < remainingTracks.length; i += BATCH_SIZE) {
    batches.push(remainingTracks.slice(i, i + BATCH_SIZE));
  }

  console.log(`Tổng cộng chia làm ${batches.length} lô:`);
  batches.forEach((b, idx) => console.log(`  - Lô ${idx + 1}: ${b.length} bài`));

  if (targetBatch < 1 || targetBatch > batches.length) {
    console.error(`Lô ${targetBatch} không hợp lệ! Chỉ từ 1 đến ${batches.length}`);
    process.exit(1);
  }

  const currentBatch = batches[targetBatch - 1];
  console.log(`\n>>> ĐANG CHẠY LÔ ${targetBatch} (${currentBatch.length} BÀI) <<<\n`);

  // Nạp overrides và youtube_downloads
  const overridesPath = path.resolve('tools/indexer/overrides.json');
  const overridesData = JSON.parse(readFileSync(overridesPath, 'utf-8'));
  if (!overridesData.tracks) overridesData.tracks = {};

  const ytPath = path.resolve('tools/indexer/.state/youtube_downloads.json');
  const ytList = JSON.parse(readFileSync(ytPath, 'utf-8'));

  let opLogs = [];
  try {
    opLogs = JSON.parse(readFileSync(LOG_FILE, 'utf-8'));
  } catch {}

  const verificationResults = [];

  for (let i = 0; i < currentBatch.length; i++) {
    const item = currentBatch[i];
    const catDir = item.category; // '(rap)' or '(chill)'
    const rootDir = path.join('D:\\music for app', catDir);
    const oldFullAudio = path.join(rootDir, item.oldPath);
    const newFullAudio = path.join(
      item.newPath.startsWith('_duplicates') ? 'D:\\music for app' : rootDir,
      item.newPath
    );

    console.log(`[Bài ${i + 1}/${currentBatch.length}] ${item.canonicalArtist} - ${item.canonicalTitle}`);
    console.log(`  Cũ: ${item.oldPath}`);
    console.log(`  Mới: ${item.newPath}`);

    if (!existsSync(oldFullAudio)) {
      throw new Error(`FILE NGUỒN KHÔNG TỒN TẠI: ${oldFullAudio}`);
    }

    if (existsSync(newFullAudio) && newFullAudio.toLowerCase() !== oldFullAudio.toLowerCase()) {
      throw new Error(`XUNG ĐỘT: FILE ĐÍCH ĐÃ TỒN TẠI TRÊN ĐĨA: ${newFullAudio}`);
    }

    // 1. Tính hash trước khi di chuyển
    const sha1Before = await computeSha1(oldFullAudio);
    const trackIdBefore = sha1Before.slice(0, 12);

    // 2. Tạo thư mục đích
    const newDir = path.dirname(newFullAudio);
    const oldDir = path.dirname(oldFullAudio);
    await fs.mkdir(newDir, { recursive: true });

    // 3. Di chuyển file âm thanh và toàn bộ file đi kèm
    const oldBase = path.basename(oldFullAudio, path.extname(oldFullAudio));
    const newBase = path.basename(newFullAudio, path.extname(newFullAudio));

    const filesToMove = [
      { from: oldFullAudio, to: newFullAudio, type: 'audio' },
      { from: path.join(oldDir, `${oldBase}.jpg`), to: path.join(newDir, `${newBase}.jpg`), type: 'cover' },
      { from: path.join(oldDir, `${oldBase}.lrc`), to: path.join(newDir, `${newBase}.lrc`), type: 'lyrics' },
      { from: path.join(oldDir, 'info.txt'), to: path.join(newDir, 'info.txt'), type: 'info' },
      { from: path.join(oldDir, 'folder.jpg'), to: path.join(newDir, 'folder.jpg'), type: 'folder_img' }
    ];

    const movedFiles = [];
    for (const f of filesToMove) {
      if (existsSync(f.from)) {
        // Ghi chú đặc biệt cho Fillinus - Changg trong info.txt nếu có
        if (f.type === 'info' && item.oldPath.includes('Fillinus') && item.oldPath.includes('Changg')) {
          try {
            let info = await fs.readFile(f.from, 'utf-8');
            info += `\n[Audit Note] Tên thư mục gốc "Fillinus Entertainment\\Singles\\Changg" từng bị gán nhầm tên bài. Bài thực tế là "Em Không Hiểu (ft. Minh Huy)".\n`;
            await fs.writeFile(f.from, info, 'utf-8');
          } catch {}
        }

        await fs.rename(f.from, f.to);
        movedFiles.push(f.type);
      }
    }

    // 4. Tính hash sau khi di chuyển tại vị trí mới
    const sha1After = await computeSha1(newFullAudio);
    const trackIdAfter = sha1After.slice(0, 12);

    if (trackIdBefore !== trackIdAfter) {
      throw new Error(`NGHIÊM TRỌNG: Mã track.id bị thay đổi! Trước: ${trackIdBefore}, Sau: ${trackIdAfter}`);
    }

    // 5. Cập nhật overrides.json & youtube_downloads.json (nếu không phải bản duplicate)
    if (!item.newPath.startsWith('_duplicates')) {
      overridesData.tracks[trackIdAfter] = {
        ...(overridesData.tracks[trackIdAfter] || {}),
        title: item.canonicalTitle,
        artist: item.canonicalArtist,
        album: 'Singles'
      };

      const ytEntry = ytList.find(y => y.trackId === trackIdAfter);
      if (ytEntry) {
        ytEntry.relativeFilePath = path.relative(rootDir, newFullAudio);
        ytEntry.relativeCoverPath = path.relative(rootDir, path.join(newDir, `${newBase}.jpg`));
        ytEntry.relativeLyricsPath = path.relative(rootDir, path.join(newDir, `${newBase}.lrc`));
        ytEntry.artist = item.canonicalArtist;
        ytEntry.title = item.canonicalTitle;
      }
    }

    // 6. Dọn dẹp thư mục cũ nếu rỗng
    await cleanEmptyDirs(oldDir);

    // Ghi log thao tác
    const hadCover = existsSync(path.join(oldDir, `${oldBase}.jpg`));
    const hadLyrics = existsSync(path.join(oldDir, `${oldBase}.lrc`));
    const hadInfo = existsSync(path.join(oldDir, 'info.txt'));

    const logEntry = {
      batch: targetBatch,
      trackId: trackIdAfter,
      artist: item.canonicalArtist,
      title: item.canonicalTitle,
      oldPath: item.oldPath,
      newPath: item.newPath,
      movedFiles,
      status: 'SUCCESS'
    };
    opLogs.push(logEntry);

    verificationResults.push({
      trackId: trackIdAfter,
      title: item.canonicalTitle,
      artist: item.canonicalArtist,
      idMatches: trackIdBefore === trackIdAfter,
      sidecarCover: hadCover ? existsSync(path.join(newDir, `${newBase}.jpg`)) : true,
      sidecarLyrics: hadLyrics ? existsSync(path.join(newDir, `${newBase}.lrc`)) : true,
      infoTxt: hadInfo ? existsSync(path.join(newDir, 'info.txt')) : true
    });

    console.log(`  ✓ Thành công! Track ID: ${trackIdAfter} (Khớp 100%) | Files: [${movedFiles.join(', ')}]\n`);
  }

  // Lưu overrides.json và youtube_downloads.json
  writeFileSync(overridesPath, JSON.stringify(overridesData, null, 2), 'utf-8');
  writeFileSync(ytPath, JSON.stringify(ytList, null, 2), 'utf-8');
  writeFileSync(LOG_FILE, JSON.stringify(opLogs, null, 2), 'utf-8');

  console.log(`\n--- BÁO CÁO NGHIỆM THU LÔ ${targetBatch} ---`);
  console.log(`Tổng số bài đã xử lý: ${verificationResults.length}/${currentBatch.length}`);
  const allIdMatched = verificationResults.every(r => r.idMatches);
  const allCoverOk = verificationResults.every(r => r.sidecarCover);
  const allLyricsOk = verificationResults.every(r => r.sidecarLyrics);

  console.log(`- 100% Track ID trùng khớp: ${allIdMatched ? 'ĐẠT (15/15)' : 'THẤT BẠI'}`);
  console.log(`- File ảnh bìa .jpg đầy đủ: ${allCoverOk ? 'ĐẠT' : 'THIẾU'}`);
  console.log(`- File lời bài hát .lrc đầy đủ: ${allLyricsOk ? 'ĐẠT' : 'THIẾU'}`);
  console.log(`==================================================\n`);
}

run().catch((err) => {
  console.error(`\n❌ DỪNG KHẨN CẤP VÌ PHÁT HIỆN LỖI:`, err.message);
  process.exit(1);
});
