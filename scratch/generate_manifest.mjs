import fs from 'fs';
import path from 'path';

const allScanned = JSON.parse(fs.readFileSync('scratch/all_scanned_raw.json', 'utf-8'));
const plan = JSON.parse(fs.readFileSync('C:/Users/dinhgiaan/.gemini/antigravity/brain/22d4b692-5a14-4848-bf91-d3efdd10738d/scratch/reorganization_plan.json', 'utf-8'));

// Sanitize filename/folder for Windows: loại bỏ < > : " / \ | ? *
function sanitizeWinName(name) {
  return name.replace(/[<>:"/\\|?*]/g, '').trim().replace(/[. ]+$/, '');
}

// Chuẩn hóa Unicode NFC
function toNFC(str) {
  return (str || '').normalize('NFC');
}

// Title Case helper chuẩn tiếng Việt và tiếng Anh
function toTitleCase(str) {
  if (!str) return '';
  const exceptions = new Set(['ft.', 'feat.', 'aka', 'prod.', 'vs', 'và', 'và', 'của', 'trong', 'với']);
  const preserveUpper = new Set([
    'B.S.N.L', 'B.S.N.L 2', 'HOTEL', 'LOBBY', 'HOTEL LOBBY',
    'YN1', '2G17', '2G2G', '3107', 'MCK', 'HIEUTHUHAI', 'G-FAMILY',
    'G5R', 'SQUAD', 'KRONO', 'M-TP', 'MV', 'HD', 'EP', 'REMIX', 'Remix',
    '1nG', '2T', 'H2K', 'W-n', 'DT', 'V#', 'GMC'
  ]);

  return str.split(' ').map((word, idx) => {
    const cleanWord = word.replace(/[()[\],]/g, '');
    if (preserveUpper.has(cleanWord) || preserveUpper.has(word)) {
      return word;
    }
    const lower = cleanWord.toLowerCase();
    if (idx > 0 && exceptions.has(lower)) {
      return word.toLowerCase();
    }
    // Viết hoa chữ cái đầu
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
}

// Tập hợp danh sách bài và thư mục hiện có
const existingFilesMap = new Map(); // normalized relative path -> item
const existingRoots = new Map(); // category -> Set of root dirs
for (const item of allScanned) {
  const normRel = path.normalize(path.join(item.category, item.relToCategory)).toLowerCase();
  existingFilesMap.set(normRel, item);

  if (!existingRoots.has(item.category)) {
    existingRoots.set(item.category, new Set());
  }
  existingRoots.get(item.category).add(item.topDir);
}

// Map các nghệ sĩ chuẩn theo yêu cầu và theo hiện trạng thư viện
// Nhất quán với các thư mục đã tồn tại trong thư viện
const CANONICAL_ARTISTS = {
  'b ray': 'B Ray',
  'tommy tèo': 'TOMMY TÈO',
  'young milo': 'TOMMY TÈO',
  'g-family': 'G-FAMILY',
  'datmaniac': 'Datmaniac',
  'young-h': 'Young-H',
  'youngh': 'Young-H',
  'g5r squad official': 'G5R SQUAD Official',
  'jombie': 'Jombie',
  'polo g': 'Polo G',
  'ryco': 'RYCO', // Đã tồn tại thư mục RYCO trong (rap)
  'lăng ld': 'LĂNG LD', // Đã tồn tại thư mục LĂNG LD trong (rap)
  'quavo & takeoff': 'Quavo & Takeoff',
  'acy': 'Acy',
  'hieuthuhai': 'HIEUTHUHAI',
  'meek mill': 'Meek Mill',
  '5ber1': '5ber1',
  'wowy & karik': 'Wowy & Karik',
  'wowy': 'Wowy',
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
  'dt tập rap': 'DT Tập Rap',
  'aaron smith': 'Aaron Smith',
  'changg': 'Changg',
  'tea & pc': 'Tea & PC',
  'tea': 'Tea',
  'khoa': 'KHOA',
  'rpt groovie': 'RPT Groovie'
};

const manifestRows = [];
const detailedAudit = [];

for (const planItem of plan) {
  const scanned = allScanned.find(s => 
    path.normalize(s.fullPath).toLowerCase() === path.normalize(planItem.currentFileFull).toLowerCase()
  );

  if (!scanned) {
    console.warn('Không tìm thấy scanned cho:', planItem.currentFileRel);
    continue;
  }

  // Xác định nghệ sĩ chuẩn & tên bài chuẩn
  let canonicalArtist = CANONICAL_ARTISTS[planItem.targetArtist.toLowerCase()] || planItem.targetArtist;
  let canonicalTitle = toNFC(planItem.targetTitle);

  // Chuẩn hóa ngoặc vuông thành ngoặc tròn: [2G17] -> (2G17)
  canonicalTitle = canonicalTitle.replace(/\[([^\]]+)\]/g, '($1)');
  // Chuẩn hóa rmx -> (Remix)
  canonicalTitle = canonicalTitle.replace(/\brmx\b/gi, 'Remix');
  if (canonicalTitle.includes('Remix') && !canonicalTitle.includes('(Remix)')) {
    canonicalTitle = canonicalTitle.replace(/\s*Remix/g, ' (Remix)');
  }

  // Tên an toàn cho Windows
  const safeArtistFolder = sanitizeWinName(canonicalArtist);
  const safeTrackFolder = sanitizeWinName(canonicalTitle);
  const safeFileName = sanitizeWinName(`${canonicalArtist} - ${canonicalTitle}`) + scanned.ext;

  const oldRelPath = scanned.relToCategory;
  const newRelPath = path.join(safeArtistFolder, 'Singles', safeTrackFolder, safeFileName);
  const newFullPath = path.join('D:\\music for app', scanned.category, newRelPath);

  // Đánh giá mức độ tin cậy
  let confidence = 'Cao';
  const confidenceReasons = [];

  // Kiểm tra tag và info.txt
  const tagArtist = scanned.tags?.artist;
  const tagTitle = scanned.tags?.title;
  const infoData = scanned.infoTxt?.data;

  // Xử lý các case đặc biệt cần xác nhận
  let needsUserConfirmation = false;
  const confirmationReasons = [];

  if (oldRelPath.includes('Quang Tèo') && oldRelPath.includes('Alaba Trap')) {
    needsUserConfirmation = true;
    confidence = 'Trung bình';
    confirmationReasons.push('Alaba Trap: Kênh YouTube là "Quang Tèo" re-up, nghệ sĩ thật là TOMMY TÈO (Young Milo)');
  }
  if (oldRelPath.includes('LợiCathay') && oldRelPath.includes('Phía Bờ Tây')) {
    needsUserConfirmation = true;
    confidence = 'Trung bình';
    confirmationReasons.push('Phía Bờ Tây: Kênh "LợiCathay", tên video "Phía Bờ Tây- YoungMilo aka Tommy Tèo" -> Chuẩn hóa TOMMY TÈO');
  }
  if (oldRelPath.includes('XmaXa') && oldRelPath.includes('Quan tài hư')) {
    needsUserConfirmation = true;
    confidence = 'Trung bình';
    confirmationReasons.push('Quan Tài Hư (Remix): Kênh "XmaXa Music", bài của Young Milo -> Chuẩn hóa TOMMY TÈO hay XmaXa?');
  }
  if (oldRelPath.includes('EM TAO HIP HOP')) {
    needsUserConfirmation = true;
    confidence = 'Trung bình';
    confirmationReasons.push('Em Tao Hip Hop: Kênh G5R SQUAD, rapper thể hiện chính là Jombie');
  }
  if (oldRelPath.includes('CƯỚI ĐI') || oldRelPath.includes('Fillinus') && scanned.fileName.includes('Changg')) {
    needsUserConfirmation = true;
    confidence = 'Trung bình';
    confirmationReasons.push('Cưới Đi: Tồn tại 2 bản (2T Lyric Video 3:53 vs Changg MV 4:14). Cần phân biệt tên file để không trùng');
  }
  if (oldRelPath.includes('MUỐN NÓI VỚI EM') || oldRelPath.includes('BlackBi Original')) {
    needsUserConfirmation = true;
    confidence = 'Trung bình';
    confirmationReasons.push('Muốn Nói Với Em: Tồn tại 2 file từ BlackBi vs DT Tập Rap (cùng 245s). Có thể trùng lặp bài');
  }
  if (oldRelPath.includes('Wowy Karik')) {
    needsUserConfirmation = true;
    confidence = 'Trung bình';
    confirmationReasons.push('Khu Tao Sống: Collab Wowy & Karik. Đặt thư mục nghệ sĩ là "Wowy & Karik" hay "Wowy" (ft. Karik)?');
  }
  if (oldRelPath.includes('A COLORS SHOW') && oldRelPath.includes('HOTEL LOBBY')) {
    needsUserConfirmation = true;
    confidence = 'Cao';
    confirmationReasons.push('HOTEL LOBBY: Kênh A COLORS SHOW, nghệ sĩ bộ đôi Quavo & Takeoff');
  }
  if (oldRelPath.includes('Già Cùng Nhau')) {
    needsUserConfirmation = true;
    confidence = 'Trung bình';
    confirmationReasons.push('Già Cùng Nhau Là Được: Kênh Chillsongs, nghệ sĩ Tea & PC. Đặt thư mục "Tea & PC" hay "Tea" (ft. PC)?');
  }

  // Phát hiện xung đột
  const conflicts = [];

  // 1. Kiểm tra thư mục nghệ sĩ đích đã tồn tại chưa
  const existingSet = existingRoots.get(scanned.category);
  const artistFolderExists = existingSet.has(safeArtistFolder);
  if (artistFolderExists) {
    conflicts.push(`Thư mục nghệ sĩ đích "${safeArtistFolder}" đã tồn tại trên đĩa (sẽ merge)`);
  }

  // 2. Kiểm tra file đích đã tồn tại chưa
  const targetNormRel = path.normalize(path.join(scanned.category, newRelPath)).toLowerCase();
  if (existingFilesMap.has(targetNormRel)) {
    const existingTargetFile = existingFilesMap.get(targetNormRel);
    if (existingTargetFile.fullPath.toLowerCase() !== scanned.fullPath.toLowerCase()) {
      conflicts.push(`XUNG ĐỘT: File đích đã tồn tại trên đĩa (${existingTargetFile.relToCategory})`);
    }
  }

  // 3. Kiểm tra bài trùng lặp (trùng hash, hoặc trùng duration + title)
  const duplicates = allScanned.filter(other => 
    other.fullPath.toLowerCase() !== scanned.fullPath.toLowerCase() &&
    (other.sha1 === scanned.sha1 || 
     (Math.abs((other.tags?.duration || 0) - (scanned.tags?.duration || 0)) <= 1 && 
      other.tags?.title && scanned.tags?.title && 
      other.tags.title.toLowerCase() === scanned.tags.title.toLowerCase()))
  );
  if (duplicates.length > 0) {
    for (const d of duplicates) {
      if (d.sha1 === scanned.sha1) {
        conflicts.push(`TRÙNG LẶP HASH với [${d.category}] ${d.relToCategory}`);
      } else {
        conflicts.push(`TRÙNG TÊN & THỜI LƯỢNG (~${scanned.tags?.duration}s) với [${d.category}] ${d.relToCategory}`);
      }
    }
  }

  // 4. Kiểm tra ký tự Windows cấm và độ dài path
  const pathLength = newFullPath.length;
  if (pathLength > 260) {
    conflicts.push(`CẢNH BÁO: Đường dẫn dài ${pathLength} ký tự (> 260 ký tự)`);
  }
  if (canonicalTitle.includes('?')) {
    conflicts.push(`Tiêu đề gốc chứa dấu "?" -> đã lược bỏ khỏi tên file/folder ("${safeTrackFolder}"), giữ "?" trong ID3 tag`);
  }

  const conflictNote = conflicts.join(' | ') || 'Không có';

  manifestRows.push({
    category: scanned.category,
    oldPath: oldRelPath,
    newPath: newRelPath,
    canonicalArtist,
    canonicalTitle,
    confidence,
    conflictNote,
    needsUserConfirmation,
    confirmationReasons: confirmationReasons.join('; ')
  });

  detailedAudit.push({
    scanned,
    canonicalArtist,
    canonicalTitle,
    safeArtistFolder,
    safeTrackFolder,
    safeFileName,
    oldRelPath,
    newRelPath,
    newFullPath,
    confidence,
    conflicts,
    needsUserConfirmation,
    confirmationReasons
  });
}

// Thêm 3 bài bất thường bổ sung được quét ra
const extras = allScanned.filter(s => 
  s.relToCategory === 'B Ray\\MV OFFICIAL\\B RAY - Cao Ốc 20.m4a' ||
  s.relToCategory === 'KHOA\\HOMIE BOIZ OFFICIAL\\KHOA - Tết Đong Đầy.m4a' ||
  s.relToCategory === 'RPT Groovie\\RAPITALOVE\\RPT Groovie - Xích Thêm Chút - XTC Remix.m4a'
);

for (const extra of extras) {
  let canonicalArtist = extra.tags?.artist || extra.parts[0];
  let canonicalTitle = extra.tags?.title || '';
  if (extra.relToCategory.includes('Cao Ốc 20')) {
    canonicalArtist = 'B Ray';
    canonicalTitle = 'Cao Ốc 20';
  } else if (extra.relToCategory.includes('Tết Đong Đầy')) {
    canonicalArtist = 'KHOA';
    canonicalTitle = 'Tết Đong Đầy';
  } else if (extra.relToCategory.includes('XTC Remix')) {
    canonicalArtist = 'RPT Groovie';
    canonicalTitle = 'Xích Thêm Chút (XTC Remix)';
  }

  const safeArtistFolder = sanitizeWinName(canonicalArtist);
  const safeTrackFolder = sanitizeWinName(canonicalTitle);
  const safeFileName = sanitizeWinName(`${canonicalArtist} - ${canonicalTitle}`) + extra.ext;
  const newRelPath = path.join(safeArtistFolder, 'Singles', safeTrackFolder, safeFileName);

  manifestRows.push({
    category: extra.category,
    oldPath: extra.relToCategory,
    newPath: newRelPath,
    canonicalArtist,
    canonicalTitle,
    confidence: 'Cao',
    conflictNote: `Thư mục phát hiện thêm ngoài plan (subfolder không phải Singles): ${extra.parts[1]}`,
    needsUserConfirmation: true,
    confirmationReasons: `Phát hiện thêm: Thư mục trung gian "${extra.parts[1]}" là rác từ kênh YouTube tải về`
  });
}

// Xuất file CSV
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
  ...manifestRows.map(r => [
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
fs.writeFileSync('scratch/audit_report.json', JSON.stringify(detailedAudit, null, 2), 'utf-8');

console.log(`Đã xuất manifest.csv thành công với ${manifestRows.length} bài hát (59 bài plan + 3 bài phát hiện thêm)!`);

