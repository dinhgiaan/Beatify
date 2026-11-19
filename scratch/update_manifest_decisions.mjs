import fs from 'fs';
import path from 'path';

const allScanned = JSON.parse(fs.readFileSync('scratch/all_scanned_raw.json', 'utf-8'));
const oldManifest = fs.readFileSync('scratch/manifest.csv', 'utf-8');

function sanitizeWinName(name) {
  return name.replace(/[<>:"/\\|?*]/g, '').trim().replace(/[. ]+$/, '');
}

function toNFC(str) {
  return (str || '').normalize('NFC');
}

// Bảng ánh xạ cụ thể theo các quyết định được duyệt
const OVERRIDES_CONFIG = {
  // 1, 2) Alaba Trap, Phía Bờ Tây -> TOMMY TÈO
  'Quang Tèo\\Singles\\(No Copyright)Alaba Trap\\Quang Tèo - (No Copyright)Alaba Trap.m4a': {
    artist: 'TOMMY TÈO',
    title: 'Alaba Trap'
  },
  'LợiCathay\\Singles\\Phía Bờ Tây- YoungMilo aka Tommy Tèo\\LợiCathay - Phía Bờ Tây- YoungMilo aka Tommy Tèo.m4a': {
    artist: 'TOMMY TÈO',
    title: 'Phía Bờ Tây'
  },
  // 3) Quan Tài Hư -> TOMMY TÈO, tên bài "Quan Tài Hư (XmaXa Remix)"
  'XmaXa Music\\Singles\\Quan tài hư Remix - Young Milo - XmaXa\\XmaXa Music - Quan tài hư Remix - Young Milo - XmaXa.m4a': {
    artist: 'TOMMY TÈO',
    title: 'Quan Tài Hư (XmaXa Remix)'
  },
  // 4) Em Tao Hip Hop -> thư mục "Jombie"
  'EM TAO HIP HOP\\Singles\\Jombie\\EM TAO HIP HOP - Jombie.m4a': {
    artist: 'Jombie',
    title: 'Em Tao Hip Hop'
  },
  // 5) Cưới Đi
  '2T - CƯỚI ĐI\\Singles\\Chưa Từng Mặc Váy Cưới\\2T - CƯỚI ĐI - Chưa Từng Mặc Váy Cưới.m4a': {
    artist: '2T',
    title: 'Cưới Đi (Lyric Video)'
  },
  // Fillinus - Changg là bài "Em Không Hiểu (ft. Minh Huy)"
  'Fillinus Entertainment\\Singles\\Changg\\Fillinus Entertainment - Changg.m4a': {
    artist: 'Changg',
    title: 'Em Không Hiểu (ft. Minh Huy)'
  },
  // 6) Muốn Nói Với Em
  'BlackBi Original\\Singles\\TTeam - MUỐN NÓI VỚI EM - DT Tập Rap\\BlackBi Original - TTeam - MUỐN NÓI VỚI EM - DT Tập Rap.m4a': {
    artist: 'TTeam',
    title: 'Muốn Nói Với Em (ft. DT Tập Rap)'
  },
  // Bản trùng Muốn Nói Với Em chuyển vào _duplicates
  'MUỐN NÓI VỚI EM\\Singles\\DT Tập Rap\\MUỐN NÓI VỚI EM - DT Tập Rap.m4a': {
    artist: '_duplicates\\MUỐN NÓI VỚI EM',
    title: 'DT Tập Rap (Bản trùng)',
    isDuplicate: true,
    targetRel: '_duplicates\\MUỐN NÓI VỚI EM\\Singles\\DT Tập Rap\\MUỐN NÓI VỚI EM - DT Tập Rap.m4a'
  },
  // 7) Khu Tao Sống -> Wowy & Karik
  'Wowy Karik (OFFICIAL VIDEO HD)\\Singles\\Khu Tao Song\\Wowy Karik (OFFICIAL VIDEO HD) - Khu Tao Song.m4a': {
    artist: 'Wowy & Karik',
    title: 'Khu Tao Sống'
  },
  // 8) HOTEL LOBBY -> Quavo & Takeoff
  'A COLORS SHOW\\Singles\\Quavo & Takeoff - HOTEL LOBBY\\A COLORS SHOW - Quavo & Takeoff - HOTEL LOBBY.m4a': {
    artist: 'Quavo & Takeoff',
    title: 'HOTEL LOBBY'
  },
  // 9) Già Cùng Nhau Là Được -> Tea, ft. PC
  'Già Cùng Nhau Là Được Lyrics  -Tea ft.PC\\Singles\\Chillsongs\\Già Cùng Nhau Là Được Lyrics  -Tea ft.PC - Chillsongs.m4a': {
    artist: 'Tea',
    title: 'Già Cùng Nhau Là Được (ft. PC)'
  },
  // 10) 3 bài phát hiện thêm
  'B Ray\\MV OFFICIAL\\B RAY - Cao Ốc 20.m4a': {
    artist: 'B Ray',
    title: 'Cao Ốc 20'
  },
  'KHOA\\HOMIE BOIZ OFFICIAL\\KHOA - Tết Đong Đầy.m4a': {
    artist: 'KHOA',
    title: 'Tết Đong Đầy'
  },
  'RPT Groovie\\RAPITALOVE\\RPT Groovie - Xích Thêm Chút - XTC Remix.m4a': {
    artist: 'RPT Groovie',
    title: 'Xích Thêm Chút (XTC Remix)'
  }
};

// Đọc plan json
const plan = JSON.parse(fs.readFileSync('C:/Users/dinhgiaan/.gemini/antigravity/brain/22d4b692-5a14-4848-bf91-d3efdd10738d/scratch/reorganization_plan.json', 'utf-8'));

// Canonical artist case dictionary
const CANONICAL_ARTISTS = {
  'b ray': 'B Ray',
  'tommy tèo': 'TOMMY TÈO',
  'g-family': 'G-FAMILY',
  'datmaniac': 'Datmaniac',
  'young-h': 'Young-H',
  'jombie': 'Jombie',
  'polo g': 'Polo G',
  'ryco': 'RYCO', // Giữ viết hoa
  'lăng ld': 'LĂNG LD', // Giữ viết hoa
  'quavo & takeoff': 'Quavo & Takeoff',
  'acy': 'Acy',
  'hieuthuhai': 'HIEUTHUHAI',
  'meek mill': 'Meek Mill',
  '5ber1': '5ber1',
  'wowy & karik': 'Wowy & Karik',
  'yxngtabi': 'Yxngtabi',
  'pikey': 'Pikey',
  'huỳnh james': 'Huỳnh James',
  'phát hồ': 'Phát Hồ',
  '1ng': '1nG',
  'pixel neko': 'Pixel Neko',
  'dương domic': 'Dương Domic',
  '2t': '2T',
  'mck': 'MCK',
  'ronboogz': 'Ronboogz',
  'sơn tùng m-tp': 'Sơn Tùng M-TP',
  'rhymastic': 'Rhymastic',
  'low g': 'Low G',
  'đạt g': 'Đạt G',
  'h2k': 'H2K',
  'w-n': 'W-n',
  'kay trần': 'Kay Trần',
  'long cao': 'Long Cao',
  'tteam': 'TTeam',
  'aaron smith': 'Aaron Smith',
  'changg': 'Changg',
  'tea': 'Tea',
  'khoa': 'KHOA',
  'rpt groovie': 'RPT Groovie'
};

const updatedRows = [];
const changedRowsReport = [];

// Duyệt qua 59 bài + 3 bài thêm
const allTargets = [...plan.map(p => ({
  fullPath: p.currentFileFull,
  relPath: p.currentFileRel,
  category: p.category,
  defaultArtist: p.targetArtist,
  defaultTitle: p.targetTitle
}))];

// Thêm 3 bài thêm
const extras = [
  { fullPath: 'D:\\music for app\\(chill)\\B Ray\\MV OFFICIAL\\B RAY - Cao Ốc 20.m4a', relPath: 'B Ray\\MV OFFICIAL\\B RAY - Cao Ốc 20.m4a', category: '(chill)', defaultArtist: 'B Ray', defaultTitle: 'Cao Ốc 20' },
  { fullPath: 'D:\\music for app\\(chill)\\KHOA\\HOMIE BOIZ OFFICIAL\\KHOA - Tết Đong Đầy.m4a', relPath: 'KHOA\\HOMIE BOIZ OFFICIAL\\KHOA - Tết Đong Đầy.m4a', category: '(chill)', defaultArtist: 'KHOA', defaultTitle: 'Tết Đong Đầy' },
  { fullPath: 'D:\\music for app\\(chill)\\RPT Groovie\\RAPITALOVE\\RPT Groovie - Xích Thêm Chút - XTC Remix.m4a', relPath: 'RPT Groovie\\RAPITALOVE\\RPT Groovie - Xích Thêm Chút - XTC Remix.m4a', category: '(chill)', defaultArtist: 'RPT Groovie', defaultTitle: 'Xích Thêm Chút (XTC Remix)' }
];

for (const extra of extras) {
  if (!allTargets.some(t => t.fullPath.toLowerCase() === extra.fullPath.toLowerCase())) {
    allTargets.push(extra);
  }
}

for (const target of allTargets) {
  const scanned = allScanned.find(s => s.fullPath.toLowerCase() === target.fullPath.toLowerCase());
  if (!scanned) continue;

  const ov = OVERRIDES_CONFIG[scanned.relToCategory];
  let artist = ov ? ov.artist : (CANONICAL_ARTISTS[target.defaultArtist.toLowerCase()] || target.defaultArtist);
  let title = ov ? ov.title : target.defaultTitle;

  title = toNFC(title).replace(/\[([^\]]+)\]/g, '($1)').replace(/\brmx\b/gi, 'Remix');
  if (title.includes('Remix') && !title.includes('Remix)')) {
    title = title.replace(/\s*Remix/g, ' (Remix)');
  }

  let newRelPath;
  let conflictNote = 'Đã duyệt chuẩn hóa';

  if (ov && ov.isDuplicate) {
    newRelPath = ov.targetRel;
    conflictNote = 'BẢN THỪA: Chuyển cách ly vào _duplicates theo chỉ đạo';
  } else {
    const safeArtist = sanitizeWinName(artist);
    const safeTrack = sanitizeWinName(title);
    const safeFile = sanitizeWinName(`${artist} - ${title}`) + scanned.ext;
    newRelPath = path.join(safeArtist, 'Singles', safeTrack, safeFile);
  }

  const row = {
    category: scanned.category,
    oldPath: scanned.relToCategory,
    newPath: newRelPath,
    canonicalArtist: artist,
    canonicalTitle: title,
    confidence: 'Cao',
    conflictNote
  };

  updatedRows.push(row);

  if (ov) {
    changedRowsReport.push({
      oldPath: scanned.relToCategory,
      artist,
      title,
      newPath: newRelPath
    });
  }
}

// Xuất CSV UTF-8 BOM
const csvHeaders = ['category', 'đường dẫn cũ', 'đường dẫn mới', 'nghệ sĩ chuẩn', 'tên bài chuẩn', 'mức tin cậy', 'ghi chú xung đột'];
function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const csvLines = [
  csvHeaders.join(','),
  ...updatedRows.map(r => [
    escapeCsv(r.category),
    escapeCsv(r.oldPath),
    escapeCsv(r.newPath),
    escapeCsv(r.canonicalArtist),
    escapeCsv(r.canonicalTitle),
    escapeCsv(r.confidence),
    escapeCsv(r.conflictNote)
  ].join(','))
];

fs.writeFileSync('scratch/manifest.csv', '\uFEFF' + csvLines.join('\n'), 'utf-8');
fs.writeFileSync('C:\\Users\\dinhgiaan\\.gemini\\antigravity\\brain\\22d4b692-5a14-4848-bf91-d3efdd10738d\\manifest.csv', '\uFEFF' + csvLines.join('\n'), 'utf-8');
fs.writeFileSync('scratch/updated_manifest_rows.json', JSON.stringify(updatedRows, null, 2), 'utf-8');

console.log(`Đã xuất lại manifest.csv với ${updatedRows.length} bài hát!`);
console.log(`Các dòng đã thay đổi theo quyết định của người dùng (${changedRowsReport.length} bài):`);
for (const c of changedRowsReport) {
  console.log(`- Cũ: ${c.oldPath}`);
  console.log(`  -> Nghệ sĩ: ${c.artist} | Tên bài: ${c.title}`);
  console.log(`  -> Đường dẫn mới: ${c.newPath}\n`);
}
