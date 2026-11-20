import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { R2Uploader } from '../services/r2Uploader.js';
import { scanAudioFile } from '../services/scanner.js';
import { getOverrides, saveOverrides, applyOverridesToScanned } from '../services/overridesManager.js';
import { buildLibrary } from '../services/libraryBuilder.js';
import type { Overrides } from '@music-app/shared';
import type { IndexerConfig } from '../config.js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Nạp .env từ tools/indexer
dotenv.config({ path: path.join(__dirname, '../../.env') });

const config: IndexerConfig = {
  MUSIC_SOURCE_DIR: process.env.MUSIC_SOURCE_DIR || 'D:/music for app',
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID || '',
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || '',
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || '',
  R2_BUCKET: process.env.R2_BUCKET || '',
};

// 1. Danh sách overrides theo track ID
const trackUpdates: Record<string, { artist?: string; title?: string; album?: string; year?: number }> = {
  // Kênh uploader / Phân mảnh -> Tên nghệ sĩ chuẩn
  '0e8f9437a06d': { artist: 'Sol7', title: 'Anh Không Hiểu' },
  '807cd4466b97': { artist: 'Thằng Lằng House', title: 'Tam Thập Lục Kế' },
  'bf0ff74236d9': { artist: 'Bình Gold', title: 'Ông Bà Già Tao Lo Hết' },
  'ba871e942843': { artist: 'Ricky Star', title: 'Level Up (feat. Lil Wuyn, Robe & Terry)' },
  '24c783f6a538': { artist: 'Rum', title: 'Liên Khúc Duyên (Kém Duyên, Lỡ Duyên, Tùy Duyên) (feat. NIT)' },
  'b702a154e09e': { artist: 'HURRYKNG', title: 'Hột Xoàn (feat. Negav)' },
  '12ad75a6805d': { artist: '2Pac', title: 'Biggie vs 2Pac (Michael Jackson Sample Mix)' },
  'df7474321619': { artist: 'twenty one pilots', title: 'Stressed Out' },
  'e90669d58d71': { artist: 'Minh Lý', title: 'Không Thuộc Về' },
  'd1648d1bcc5a': { artist: 'Cofm', title: 'Ai Đưa Em Về Nếu Một Ngày Chúng Ta Không Còn Gặp (Mashup)' },
  '6fef042a7643': { artist: '1nG', title: 'Ai Đưa Em Về Nếu Một Ngày Chúng Ta Không Còn Gặp (feat. 2Can & Dick)' },
  'f77dc08ffaef': { artist: 'Calvin Harris', title: 'Outside (David Laid Gym Edit)' },
  '94dab9660ae1': { artist: 'BABY $MOKE', title: 'Mưa Đang Rơi' },
  '71fc8f46b2b7': { artist: 'AMEE', title: "Ex's Hate Me (Part 2) (feat. B Ray)", album: 'dreAMEE', year: 2020 },
  '56069b4f29b7': { title: 'Haru Haru (하루하루)' },
  '6f79d746ed44': { title: 'Thu Cuối (feat. Yanbi & Hằng BingBoong)' },
  'c4bc4fe7a267': { title: 'Lối Nhỏ x Nghe Bài Này Đi Em (Live Ngẫu Hứng)' },
  '7056d9ee506a': { title: 'Ngoài Cửa Sổ Là Cơn Mưa Đang Đổ Chéo (Mashup Tình Ca)' },
  '9b993aa96829': { title: 'Hai Thế Giới (feat. Karik)' },

  // Gộp biến thể nghệ sĩ / Crew
  'fd35815b0b4c': { artist: 'Sol7', title: 'Iceman' },
  '0a66475893b4': { artist: 'Phát Hồ', title: 'Yêu Là Cưới' },
  '4dd39ac9d7f1': { artist: 'TonDee', title: 'Động' },
  '6d6da9e5404d': { artist: 'TonDee', title: 'Bạn Thân Bản Thân' },
  '16ab2bb6b433': { artist: 'TonDee', title: 'Khởi' },
  'e95d656c15df': { artist: 'YoungTazle', title: 'Dawgs F' },

  // Chuẩn hóa viết hoa / viết thường
  'a1bd676f37bb': { artist: 'Karik', title: 'Bạn Đời (feat. Gducky)' },
  '98d647e92c9c': { artist: 'Donald Gold', title: 'Đổi Tư Thế (feat. Andree Right Hand)' },
  '4bb2f0a89d70': { artist: 'Lee Ken', title: 'Cô Đơn Dành Cho Ai (feat. Nal)' },
  'f14232bfce67': { artist: 'Tăng Phúc', title: 'Chỉ Là Không Cùng Nhau (feat. Trương Thảo Nhi)' },
  '91d95f1fd098': { artist: 'Đình Dũng' },
  'ff78e6d8f098': { artist: 'Vũ Phụng Tiên' },
  '2fcea8f4410c': { artist: 'Minh Vương M4U' },
  '4e09d10b0b07': { artist: 'Khoa' },
  '72be6c37bc41': { artist: 'DatKaa' },
  'b24f581c7604': { artist: 'DatKaa' },
  '0dfd350915a1': { artist: 'Freaky', title: 'Muốn Được Cùng Em' },
  '54595088f01a': { artist: 'LyLy' },
  '3aeeb4f50040': { artist: 'Manbo' },
  'f3bc9505ead6': { artist: 'HURRYKNG' },
  '10ce14cba2c5': { artist: 'Lemese' },
  'ff257092633d': { artist: 'Umie' },
  '0e3fde27b3b5': { artist: 'Ryan Oakes' },
  '6ae06e16e6f8': { artist: 'FIFTY FIFTY' },
  '85860f363fae': { artist: 'Morray', title: 'Quicksand' },
  '6dc5d488f975': { artist: 'Willistic' },
  '96eaa03caef8': { artist: 'Híu', title: 'Matchanah' },
  '3e65d44f703a': { artist: 'Puppy' },
  '9e06deb93708': { artist: 'buitruonglinh', title: 'Dù Cho Mai Về Sau' },
  '010826b504a6': { artist: 'vaultboy' }
};

// 2. Bảng alias mới
const newAliases: Record<string, string> = {
  'fueled by ramen and twenty one pilots': 'twenty one pilots',
  'sol7 dcod': 'Sol7',
  'phat ho x2x': 'Phát Hồ',
  'y.tazle': 'YoungTazle',
  'youngtazle': 'YoungTazle',
  'mrdd47': 'HURRYKNG',
  'vu binh': 'Sol7',
  'minh ly official ( hollim)': 'Minh Lý',
  'cofm ♪': 'Cofm',
  'cofm': 'Cofm',
  'karik': 'Karik',
  'dinh dung': 'Đình Dũng',
  'vu phung tien': 'Vũ Phụng Tiên',
  'tang phuc': 'Tăng Phúc',
  'minh vuong m4u': 'Minh Vương M4U',
  'khoa': 'Khoa',
  'datkaa': 'DatKaa',
  'freaky': 'Freaky',
  'lyly': 'LyLy',
  'hurrykng': 'HURRYKNG',
  'lemese': 'Lemese',
  'umie': 'Umie',
  'ryan oakes': 'Ryan Oakes',
  'fifty fifty (피프티피프티)': 'FIFTY FIFTY',
  'fifty fifty': 'FIFTY FIFTY',
  'morray': 'Morray',
  'willistic': 'Willistic',
  'hiu': 'Híu',
  'puppy': 'Puppy',
  'lee ken': 'Lee Ken',
  'donald gold': 'Donald Gold'
};

async function run() {
  console.log('=== BẮT ĐẦU CHUẨN HÓA VÀ GỘP NGHỆ SĨ ===');

  // Bước 1: Cập nhật overrides.json
  const overrides: Overrides = await getOverrides();
  overrides.artistAliases = overrides.artistAliases || {};

  for (const [id, update] of Object.entries(trackUpdates)) {
    if (!overrides.tracks[id]) {
      overrides.tracks[id] = {};
    }
    if (update.artist) overrides.tracks[id].artist = update.artist;
    if (update.title) overrides.tracks[id].title = update.title;
    if (update.album) overrides.tracks[id].album = update.album;
    if (update.year) overrides.tracks[id].year = update.year;
  }

  for (const [alias, target] of Object.entries(newAliases)) {
    overrides.artistAliases[alias] = target;
  }

  await saveOverrides(overrides);
  console.log('✅ Đã cập nhật tools/indexer/overrides.json!');

  // Bước 2: Cập nhật config/artistAliases.json
  const aliasConfigPath = path.join(__dirname, '../../config/artistAliases.json');
  if (fs.existsSync(aliasConfigPath)) {
    try {
      const aliasConfig = JSON.parse(fs.readFileSync(aliasConfigPath, 'utf-8'));
      for (const [alias, target] of Object.entries(newAliases)) {
        aliasConfig[alias] = target;
      }
      fs.writeFileSync(aliasConfigPath, JSON.stringify(aliasConfig, null, 2), 'utf-8');
      console.log('✅ Đã cập nhật tools/indexer/config/artistAliases.json!');
    } catch {
      // bỏ qua lỗi đọc file cấu hình
    }
  }

  // Bước 3: Quét lại toàn bộ và tái tạo library.json
  console.log('Đang quét lại đĩa và nạp overrides...');
  const files: string[] = [];
  function scan(d: string): void {
    try {
      for (const item of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, item.name);
        if (item.isDirectory()) scan(p);
        else if (/\.(mp3|m4a|flac)$/i.test(item.name)) files.push(p);
      }
    } catch {
      // bỏ qua thư mục không truy cập được
    }
  }
  scan(config.MUSIC_SOURCE_DIR);

  const scanned = [];
  for (const f of files) {
    const item = await scanAudioFile(f);
    if (item) scanned.push(item);
  }

  const updatedScanned = applyOverridesToScanned(scanned, overrides);
  const { library } = buildLibrary(updatedScanned);

  const libPath = path.join(__dirname, '../../library.json');
  fs.writeFileSync(libPath, JSON.stringify(library, null, 2), 'utf-8');

  const uniqueArtists = new Set(library.tracks.map(t => t.artist));
  console.log(`✅ Đã tái tạo library.json: ${library.tracks.length} bài hát, ${uniqueArtists.size} nghệ sĩ!`);

  // Bước 4: Đồng bộ lên Cloudflare R2
  console.log('Đang đồng bộ library.json và _meta/overrides.json lên Cloudflare R2...');
  const uploader = new R2Uploader(config);
  await uploader.uploadLibrary(library);
  await uploader.uploadOverrides(overrides);
  console.log('✅ Đồng bộ lên Cloudflare R2 thành công!');

  console.log('=== HOÀN TẤT CHUẨN HÓA VÀ GỘP NGHỆ SĨ ===');
}

run().catch((err) => {
  console.error('Lỗi thực thi:', err);
  process.exit(1);
});
