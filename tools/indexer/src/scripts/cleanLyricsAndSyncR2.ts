import fs from 'fs';
import path from 'path';
import { cleanLrcContent } from '@music-app/shared';
import { loadConfig } from '../config';
import { R2Uploader } from '../services/r2Uploader';

interface TrackInfo {
  id: string;
  title: string;
  artist: string;
}

// Hàm quét đệ quy tìm tất cả file .lrc trong một thư mục
function findLrcFilesRecursively(dir: string): string[] {
  let results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(findLrcFilesRecursively(fullPath));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.lrc')) {
        results.push(fullPath);
      }
    }
  } catch (err) {
    console.error(`Không thể quét thư mục ${dir}:`, err);
  }
  return results;
}

async function main(): Promise<void> {
  console.log('=== BẮT ĐẦU QUÁ TRÌNH LÀM SẠCH LYRICS VÀ ĐỒNG BỘ R2 ===\n');

  // 1. Tải cấu hình R2
  const config = loadConfig();
  if (!config) {
    throw new Error('Không thể tải cấu hình R2 từ .env');
  }
  const uploader = new R2Uploader(config);

  // Xác định thư mục gốc của package indexer (D:\apps on phone\Beatify\tools\indexer)
  const indexerRoot = process.cwd().endsWith('indexer')
    ? process.cwd()
    : path.resolve(process.cwd(), 'tools/indexer');

  // Đọc library.backup.json để tra cứu tên bài hát
  const trackMap = new Map<string, TrackInfo>();
  try {
    const libBackupPath = path.resolve(indexerRoot, 'library.backup.json');
    if (fs.existsSync(libBackupPath)) {
      const rawLib = fs.readFileSync(libBackupPath, 'utf8').replace(/^\uFEFF/, '');
      const libData = JSON.parse(rawLib) as { tracks?: TrackInfo[] };
      if (libData.tracks && Array.isArray(libData.tracks)) {
        for (const t of libData.tracks) {
          trackMap.set(t.id, t);
        }
      }
    }
  } catch (err) {
    console.warn('Không thể đọc library.backup.json để lấy thông tin track:', err);
  }

  // 2. Tạo thư mục backup an toàn
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve(indexerRoot, `backups/lyrics_cleanup_${timestamp}`);
  fs.mkdirSync(path.join(backupDir, 'indexer'), { recursive: true });
  fs.mkdirSync(path.join(backupDir, 'local_music'), { recursive: true });
  console.log(`[Backup] Thư mục lưu trữ dự phòng: ${backupDir}\n`);

  // Regex phát hiện các chuỗi rác HTML hoặc icon nốt nhạc
  const dirtyPattern = /&nbsp;|[♪♫♬♩🎵🎶]/u;

  // 3. Xử lý các file trong tools/indexer/lyrics
  const indexerLyricsDir = path.resolve(indexerRoot, 'lyrics');
  const indexerFiles = fs.readdirSync(indexerLyricsDir).filter((f) => f.endsWith('.lrc'));

  const cleanedIndexerTracks: Array<{ id: string; title: string; artist: string }> = [];

  console.log(`[1/3] Quét thư mục indexer cache: ${indexerLyricsDir} (${indexerFiles.length} files)...`);

  for (const filename of indexerFiles) {
    const filePath = path.join(indexerLyricsDir, filename);
    const content = fs.readFileSync(filePath, 'utf8');

    if (dirtyPattern.test(content)) {
      const trackId = filename.replace(/\.lrc$/, '');
      const track = trackMap.get(trackId);
      const title = track?.title || 'Unknown Title';
      const artist = track?.artist || 'Unknown Artist';

      // Backup file gốc
      fs.writeFileSync(path.join(backupDir, 'indexer', filename), content, 'utf8');

      // Làm sạch
      const cleaned = cleanLrcContent(content);
      fs.writeFileSync(filePath, cleaned, 'utf8');

      // Upload lên Cloudflare R2
      const r2Key = `lyrics/${trackId}.lrc`;
      console.log(`  -> Đang upload R2: ${r2Key} (${title} - ${artist})...`);
      await uploader.uploadLyrics(r2Key, cleaned);

      cleanedIndexerTracks.push({ id: trackId, title, artist });
    }
  }

  console.log(`\n=> Đã làm sạch và upload R2 thành công ${cleanedIndexerTracks.length} files indexer.\n`);

  // 4. Xử lý các file .lrc trong thư mục nhạc local (D:\music for app)
  const musicSourceDir = config.MUSIC_SOURCE_DIR || 'D:/music for app';
  console.log(`[2/3] Quét đệ quy thư mục nhạc local: ${musicSourceDir}...`);
  const localLrcFiles = findLrcFilesRecursively(musicSourceDir);
  console.log(`Tổng số file .lrc tìm thấy trong ${musicSourceDir}: ${localLrcFiles.length}`);

  const cleanedLocalFiles: string[] = [];
  let localBackupIndex = 0;

  for (const filePath of localLrcFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (dirtyPattern.test(content)) {
      localBackupIndex++;
      const backupFilename = `${localBackupIndex}_${path.basename(filePath)}`;
      fs.writeFileSync(path.join(backupDir, 'local_music', backupFilename), content, 'utf8');

      const cleaned = cleanLrcContent(content);
      fs.writeFileSync(filePath, cleaned, 'utf8');
      cleanedLocalFiles.push(filePath);
      console.log(`  -> Đã làm sạch local: ${path.basename(filePath)}`);
    }
  }

  console.log(`\n=> Đã làm sạch thành công ${cleanedLocalFiles.length} files .lrc trong thư mục local.\n`);

  // 5. Kiểm tra kiểm chứng lại bài "Thiên Hà Trước Hiên Nhà"
  console.log('[3/3] Kiểm tra kiểm chứng lại bài Thiên Hà Trước Hiên Nhà (59c1532549d2):');
  const datmaniacPath = path.join(indexerLyricsDir, '59c1532549d2.lrc');
  if (fs.existsSync(datmaniacPath)) {
    const verifyContent = fs.readFileSync(datmaniacPath, 'utf8');
    const isStillDirty = dirtyPattern.test(verifyContent);
    console.log(`  - Còn sót &nbsp; hoặc ký tự nốt nhạc không? -> ${isStillDirty ? 'CÓ (LỖI)' : 'HOÀN TOÀN SẠCH SẼ (PASS)'}`);
    console.log('  - Mẫu 5 dòng đầu:');
    verifyContent.split('\n').slice(0, 5).forEach((line) => console.log(`      ${line}`));
  }

  console.log('\n=== HOÀN TẤT TOÀN BỘ QUÁ TRÌNH LÀM SẠCH VÀ ĐỒNG BỘ R2 ===');
}

main().catch((err) => {
  console.error('Lỗi trong quá trình xử lý:', err);
  process.exit(1);
});
