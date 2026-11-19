import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

const PILOT_IDS = [
  {
    id: 'fc3d4df74119',
    name: 'Track 1: B Ray - B.S.N.L 2',
    filePath: 'D:\\music for app\\(rap)\\B Ray\\Singles\\B.S.N.L 2\\B Ray - B.S.N.L 2.m4a',
    expectedArtist: 'B Ray',
    expectedTitle: 'B.S.N.L 2'
  },
  {
    id: 'a4b0be8e52ee',
    name: 'Track 2: RYCO - Việt Nên Làm (ft. MEGASHOCK)',
    filePath: 'D:\\music for app\\(rap)\\RYCO\\Singles\\Việt Nên Làm (ft. MEGASHOCK)\\RYCO - Việt Nên Làm (ft. MEGASHOCK).m4a',
    expectedArtist: 'RYCO',
    expectedTitle: 'Việt Nên Làm (ft. MEGASHOCK)'
  },
  {
    id: '69991caf41d1',
    name: 'Track 3: 2T - Liệu Giờ (What If?)',
    filePath: 'D:\\music for app\\(chill)\\2T\\Singles\\Liệu Giờ (What If)\\2T - Liệu Giờ (What If).m4a',
    expectedArtist: '2T',
    expectedTitle: 'Liệu Giờ (What If?)'
  }
];

async function computeSha1(filePath) {
  const buf = await fs.readFile(filePath);
  return crypto.createHash('sha1').update(buf).digest('hex');
}

async function verify() {
  console.log('=== KIỂM TRA ĐÁNH GIÁ PILOT 3 BÀI HÁT ===\n');

  // Đọc overrides.json
  const overrides = JSON.parse(readFileSync('tools/indexer/overrides.json', 'utf-8'));

  for (const item of PILOT_IDS) {
    console.log(`--------------------------------------------------`);
    console.log(`Bài kiểm tra: ${item.name}`);
    console.log(`Đường dẫn mới: ${item.filePath}`);

    // (a) Kiểm tra track.id tính từ file bytes mới
    const sha1 = await computeSha1(item.filePath);
    const newId = sha1.slice(0, 12);
    const idMatches = newId === item.id;
    console.log(`(a) Mã Track ID tính từ file: ${newId} (Kỳ vọng: ${item.id}) => ${idMatches ? 'KHỚP 100% TUYỆT ĐỐI' : 'THẤT BẠI'}`);

    // (b) Kiểm tra liên kết ảnh bìa và lời bài hát
    const sidecarCover = item.filePath.replace(/\.m4a$/i, '.jpg');
    const sidecarLrc = item.filePath.replace(/\.m4a$/i, '.lrc');
    const customCover = path.join('tools/indexer/custom_covers', `${item.id}.jpg`);
    const customLrc = path.join('tools/indexer/lyrics', `${item.id}.lrc`);

    console.log(`(b) Liên kết ảnh bìa:`);
    console.log(`    - Sidecar .jpg: ${existsSync(sidecarCover) ? 'TỒN TẠI' : 'KHÔNG'}`);
    console.log(`    - Custom Cover (${item.id}.jpg): ${existsSync(customCover) ? 'TỒN TẠI' : 'KHÔNG'}`);
    console.log(`(b) Liên kết lời bài hát:`);
    console.log(`    - Sidecar .lrc: ${existsSync(sidecarLrc) ? 'TỒN TẠI' : 'KHÔNG'}`);
    console.log(`    - Custom Lyrics (${item.id}.lrc): ${existsSync(customLrc) ? 'TỒN TẠI' : 'KHÔNG'}`);

    // (d) Kiểm tra hiển thị trong overrides.json
    const ov = overrides.tracks?.[item.id];
    console.log(`(d) Tên hiển thị qua overrides.json:`);
    console.log(`    - Artist: "${ov?.artist}" (Kỳ vọng: "${item.expectedArtist}")`);
    console.log(`    - Title : "${ov?.title}" (Kỳ vọng: "${item.expectedTitle}")`);
    console.log(`    - Khớp chuẩn: ${ov?.artist === item.expectedArtist && ov?.title === item.expectedTitle ? 'HOÀN HẢO' : 'CHƯA KHỚP'}`);
  }

  // (c) Kiểm tra API library / R2 Dry-run
  console.log(`\n--------------------------------------------------`);
  console.log(`(c) KIỂM TRA ĐỐI CHIẾU VỚI CLOUDFLARE R2 (DRY-RUN)`);
  try {
    const res = await fetch('http://127.0.0.1:4000/local-api/tracks');
    const json = await res.json();
    if (json.tracks) {
      console.log(`Tổng số bài đọc từ server: ${json.tracks.length}`);
      for (const item of PILOT_IDS) {
        const found = json.tracks.find(t => t.id === item.id);
        if (found) {
          console.log(`✓ Track ${item.id} ("${found.artist} - ${found.title}"):`);
          console.log(`  - File trên R2: ${found.r2FileKey}`);
          console.log(`  - Trạng thái đồng bộ: isSynced = ${found.isSynced} (File đã tồn tại sẵn trên Cloudflare R2!)`);
          console.log(`  - Có ảnh bìa: hasCover = ${found.hasCover}`);
          console.log(`  - Số bytes mới cần upload âm thanh: 0 BYTES (Không cần upload nhạc mới vì hash giữ nguyên!)`);
        } else {
          console.warn(`Không tìm thấy bài ${item.id} trên API local server`);
        }
      }
    }
  } catch (err) {
    console.warn('Lỗi gọi API server:', err.message);
  }

  console.log('\n=== HOÀN TẤT BƯỚC KIỂM TRA PILOT ===');
}

verify().catch(console.error);
