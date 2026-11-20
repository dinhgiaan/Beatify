import fs from 'fs';
import path from 'path';

const roots = ['D:/music for app/(chill)', 'D:/music for app/(rap)'];
const audioExts = ['.mp3', '.m4a', '.flac', '.wav', '.aac', '.ogg'];

function scan(d: string): string[] {
  let files: string[] = [];
  try {
    const list = fs.readdirSync(d, { withFileTypes: true });
    for (const item of list) {
      const p = path.join(d, item.name);
      if (item.isDirectory()) {
        files = files.concat(scan(p));
      } else {
        files.push(p);
      }
    }
  } catch {
    // Bỏ qua lỗi đọc thư mục không truy cập được
  }
  return files;
}

// Bảng ánh xạ thư mục dư thừa sang thư mục nghệ sĩ chính thức
const mappings: Record<string, string> = {
  // (chill)
  '2T - CƯỚI ĐI': '2T',
  '2T - LIỆU GIỜ ( WHAT IF - )': '2T',
  'Dương Domic - Mất Kết Nối': 'Dương Domic',
  'Già Cùng Nhau Là Được Lyrics  -Tea ft.PC': 'Tea',
  'Lyrics - YÊU 5': 'Rhymastic',
  'M-TP [ Video + Lyric Kara]': 'Sơn Tùng M-TP',
  'MCK remixx prod. By Kewtiie': 'MCK',
  'Cô Nàng Khác Người [feat. Nger (MCK)': 'MCK',
  'RPT MCK': 'MCK',
  'RPT MCK (feat. Trung Trần)': 'MCK',
  'Ronboogz (Lyrics Video)': 'Ronboogz',
  'RONBOOGZ (Official)': 'Ronboogz',
  'Tháng Năm Không Quên - H2K': 'H2K',
  'W-n - id 072019': 'W-n',

  // (rap)
  'B.S.N.L 2': 'B Ray',
  'Buông Hàng': 'Young H',
  'BẠN CỦA TAO - YoungH': 'Young H',
  'BỐC THUỐC': 'Mr T',
  'CHƠI (RMX) Ft.MANBO': 'MANBO',
  'Côn Đồ Trên Con Đò': 'Datmaniac',
  'Going Bad (feat. Drake)': 'Meek Mill',
  'Lăng LD. Lil Wuyn. KhoaWzzzy. Khánh Jayz. Rick. Ryco. BìnhGold. Joka3iz. Cá Nóc': 'LĂNG LD',
  'Polo G - Go Stupid': 'Polo G',
  'RYCO - -VIỆT- NÊN LÀM (Ft. MEGASHOCK)': 'RYCO',
  'Wowy Karik (OFFICIAL VIDEO HD)': 'Wowy & Karik',
};

for (const root of roots) {
  console.log(`\n================ ${root} ================`);
  if (!fs.existsSync(root)) continue;
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  for (const name of folders) {
    const dir = path.join(root, name);
    const files = scan(dir);
    const audios = files.filter((f) => audioExts.includes(path.extname(f).toLowerCase()));

    if (audios.length === 0) {
      const targetArtist = mappings[name];
      let avatarAction = 'Không ánh xạ avatar';
      const redundantAvatar = path.join(dir, 'artist.png');

      if (targetArtist && fs.existsSync(redundantAvatar)) {
        // Tìm targetDir trong cả (chill) và (rap)
        let targetDir = path.join(root, targetArtist);
        if (!fs.existsSync(targetDir)) {
          const otherRoot = root.includes('(chill)') ? 'D:/music for app/(rap)' : 'D:/music for app/(chill)';
          if (fs.existsSync(path.join(otherRoot, targetArtist))) {
            targetDir = path.join(otherRoot, targetArtist);
          }
        }

        if (fs.existsSync(targetDir)) {
          const targetHasAvatar =
            fs.existsSync(path.join(targetDir, 'artist.png')) ||
            fs.existsSync(path.join(targetDir, 'artist.jpg')) ||
            fs.existsSync(path.join(targetDir, 'folder.png')) ||
            fs.existsSync(path.join(targetDir, 'folder.jpg'));

          if (!targetHasAvatar) {
            avatarAction = `➡️ SẼ CHUYỂN AVATAR SANG: "${targetDir}"`;
          } else {
            avatarAction = `✅ Target "${targetArtist}" đã có avatar`;
          }
        } else {
          avatarAction = `⚠️ Không tìm thấy targetDir "${targetArtist}"`;
        }
      }
      console.log(`Xóa: "${name}" | ${avatarAction}`);
    }
  }
}
