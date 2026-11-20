import fs from 'fs';
import path from 'path';
import { loadConfig } from '../config';
import { R2Uploader } from '../services/r2Uploader';
import { findAudioFiles, scanAudioFile } from '../services/scanner';
import { buildLibrary } from '../services/libraryBuilder';
import { getOverrides, applyOverridesToScanned } from '../services/overridesManager';

const roots = ['D:/music for app/(chill)', 'D:/music for app/(rap)'];
const audioExts = ['.mp3', '.m4a', '.flac', '.wav', '.aac', '.ogg', '.opus', '.wma'];

function scanAllFiles(d: string): string[] {
  let files: string[] = [];
  try {
    const list = fs.readdirSync(d, { withFileTypes: true });
    for (const item of list) {
      const p = path.join(d, item.name);
      if (item.isDirectory()) {
        files = files.concat(scanAllFiles(p));
      } else {
        files.push(p);
      }
    }
  } catch {
    // Bỏ qua lỗi đọc thư mục không truy cập được
  }
  return files;
}

// Bảng ánh xạ chuyển avatar từ thư mục thừa sang thư mục chính
const avatarMigrations: Record<string, { fromRoot: string; toRoot: string; toFolder: string }> = {
  // (chill)
  '2T - CƯỚI ĐI': { fromRoot: 'D:/music for app/(chill)', toRoot: 'D:/music for app/(chill)', toFolder: '2T' },
  'Dương Domic - Mất Kết Nối': { fromRoot: 'D:/music for app/(chill)', toRoot: 'D:/music for app/(chill)', toFolder: 'Dương Domic' },
  'Già Cùng Nhau Là Được Lyrics  -Tea ft.PC': { fromRoot: 'D:/music for app/(chill)', toRoot: 'D:/music for app/(chill)', toFolder: 'Tea' },
  'Lyrics - YÊU 5': { fromRoot: 'D:/music for app/(chill)', toRoot: 'D:/music for app/(chill)', toFolder: 'Rhymastic' },

  // (rap)
  'Côn Đồ Trên Con Đò': { fromRoot: 'D:/music for app/(rap)', toRoot: 'D:/music for app/(rap)', toFolder: 'Datmaniac' },
  'Going Bad (feat. Drake)': { fromRoot: 'D:/music for app/(rap)', toRoot: 'D:/music for app/(rap)', toFolder: 'Meek Mill' },
  'Polo G - Go Stupid': { fromRoot: 'D:/music for app/(rap)', toRoot: 'D:/music for app/(rap)', toFolder: 'Polo G' },
  'Wowy Karik (OFFICIAL VIDEO HD)': { fromRoot: 'D:/music for app/(rap)', toRoot: 'D:/music for app/(rap)', toFolder: 'Wowy & Karik' },
};

// Cross-root avatar syncing (sao chép avatar có sẵn từ chill sang rap nếu rap chưa có)
const crossRootAvatars: { from: string; to: string }[] = [
  { from: 'D:/music for app/(chill)/HIEUTHUHAI/artist.png', to: 'D:/music for app/(rap)/HIEUTHUHAI/artist.png' },
  { from: 'D:/music for app/(chill)/JOMBIE/artist.png', to: 'D:/music for app/(rap)/Jombie/artist.png' },
  { from: 'D:/music for app/(chill)/Datmaniac/artist.png', to: 'D:/music for app/(rap)/Datmaniac/artist.png' },
];

export async function runCleanup(isApply = false) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseBackupDir = process.cwd().includes('indexer') ? path.resolve('backups') : path.resolve('tools/indexer/backups');
  const backupDir = path.join(baseBackupDir, `redundant_folders_backup_${timestamp}`);

  console.log(`\n======================================================`);
  console.log(`CHẾ ĐỘ: ${isApply ? '🚀 APPLY (THỰC THI THẬT)' : '🔍 DRY-RUN (XEM TRƯỚC AN TOÀN)'}`);
  console.log(`======================================================\n`);

  const foldersToDelete: { root: string; name: string; fullPath: string; files: string[] }[] = [];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const entries = fs.readdirSync(root, { withFileTypes: true });
    const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    for (const name of dirNames) {
      const dir = path.join(root, name);
      const allFiles = scanAllFiles(dir);
      const audioFiles = allFiles.filter((f) => audioExts.includes(path.extname(f).toLowerCase()));

      if (audioFiles.length === 0) {
        foldersToDelete.push({ root, name, fullPath: dir, files: allFiles });
      }
    }
  }

  console.log(`📊 Tổng cộng tìm thấy: ${foldersToDelete.length} thư mục dư thừa không chứa file nhạc nào.`);
  console.log(`   - (chill): ${foldersToDelete.filter((f) => f.root.includes('(chill)')).length} thư mục`);
  console.log(`   - (rap):   ${foldersToDelete.filter((f) => f.root.includes('(rap)')).length} thư mục\n`);

  // 1. Kiểm tra an toàn: nếu phát hiện bất kỳ file âm thanh nào lọt vào danh sách -> DỪNG NGAY
  for (const item of foldersToDelete) {
    for (const f of item.files) {
      const ext = path.extname(f).toLowerCase();
      if (audioExts.includes(ext)) {
        throw new Error(`[CRITICAL ABORT] Phát hiện file nhạc "${f}" trong thư mục "${item.name}". HỦY TOÀN BỘ QUÁ TRÌNH!`);
      }
    }
  }

  if (isApply) {
    fs.mkdirSync(backupDir, { recursive: true });
    console.log(`💾 Đã tạo thư mục sao lưu an toàn tại:\n   ${backupDir}\n`);

    // Bước 1: Sao lưu toàn bộ các file trong thư mục dư thừa trước khi làm bất cứ điều gì
    for (const item of foldersToDelete) {
      const relSub = item.root.includes('(chill)') ? '(chill)' : '(rap)';
      const targetBackupFolder = path.join(backupDir, relSub, item.name);
      fs.mkdirSync(targetBackupFolder, { recursive: true });

      for (const f of item.files) {
        const dest = path.join(targetBackupFolder, path.basename(f));
        fs.copyFileSync(f, dest);
      }
    }
    console.log(`✅ Đã sao lưu 100% tệp tin của ${foldersToDelete.length} thư mục vào thư mục backup.`);

    // Bước 2: Chuyển Avatar từ thư mục thừa sang thư mục chính nếu thư mục chính chưa có avatar
    console.log(`\n🖼️ Bắt đầu kiểm tra và chuyển giao Avatar nghệ sĩ...`);
    for (const [redundantName, target] of Object.entries(avatarMigrations)) {
      const srcAvatar = path.join(target.fromRoot, redundantName, 'artist.png');
      const destDir = path.join(target.toRoot, target.toFolder);
      const destAvatar = path.join(destDir, 'artist.png');

      if (fs.existsSync(srcAvatar) && fs.existsSync(destDir)) {
        const hasExisting =
          fs.existsSync(destAvatar) ||
          fs.existsSync(path.join(destDir, 'artist.jpg')) ||
          fs.existsSync(path.join(destDir, 'folder.png')) ||
          fs.existsSync(path.join(destDir, 'folder.jpg'));

        if (!hasExisting) {
          fs.copyFileSync(srcAvatar, destAvatar);
          console.log(`   ✨ Đã chuyển avatar từ "${redundantName}" sang "${target.toFolder}/artist.png"`);
        }
      }
    }

    // Bước 2b: Đồng bộ chéo avatar từ (chill) sang (rap)
    for (const cross of crossRootAvatars) {
      if (fs.existsSync(cross.from) && !fs.existsSync(cross.to)) {
        const destDir = path.dirname(cross.to);
        if (fs.existsSync(destDir)) {
          fs.copyFileSync(cross.from, cross.to);
          console.log(`   ✨ Đã đồng bộ chéo avatar từ "${path.basename(path.dirname(cross.from))}" sang "${path.basename(destDir)}"`);
        }
      }
    }

    // Bước 3: Xóa các thư mục dư thừa (chỉ xóa khi đã xác nhận 100% không có file nhạc)
    console.log(`\n🗑️ Bắt đầu dọn dẹp các thư mục dư thừa...`);
    for (const item of foldersToDelete) {
      fs.rmSync(item.fullPath, { recursive: true, force: true });
      console.log(`   - Đã xóa: "${item.name}"`);
    }
    console.log(`\n✅ ĐÃ DỌN DẸP SẠCH SẼ ${foldersToDelete.length} THƯ MỤC DƯ THỪA TRÊN Ổ ĐĨA!`);

    // Bước 4: Tự động đồng bộ và tái tạo library.json
    console.log(`\n🔄 Bắt đầu đồng bộ lại thư viện lên Cloudflare R2...`);
    const config = loadConfig();
    if (config) {
      const files = await findAudioFiles(config.MUSIC_SOURCE_DIR);
      const rawTracks = [];
      for (const f of files) {
        const item = await scanAudioFile(f);
        if (item) rawTracks.push(item);
      }
      const overrides = await getOverrides();
      const scannedTracks = applyOverridesToScanned(rawTracks, overrides);
      const { library } = buildLibrary(scannedTracks);

      const uploader = new R2Uploader(config);
      await uploader.uploadLibrary(library);
      console.log(`✅ Đã cập nhật thành công library.json (${library.tracks.length} bài hát) lên Cloudflare R2!`);
    }
  } else {
    console.log(`Danh sách các thư mục dự kiến xóa (không có file nhạc):`);
    foldersToDelete.forEach((f, idx) => {
      const tag = f.root.includes('(chill)') ? '[chill]' : '[rap]';
      console.log(`  ${idx + 1}. ${tag} "${f.name}" (${f.files.map((file) => path.basename(file)).join(', ')})`);
    });
    console.log(`\n💡 Chạy với cờ --apply để thực thi dọn dẹp an toàn.`);
  }
}

if (process.argv[1] && process.argv[1].includes('cleanupRedundantFolders')) {
  const isApply = process.argv.includes('--apply');
  runCleanup(isApply).catch(console.error);
}
