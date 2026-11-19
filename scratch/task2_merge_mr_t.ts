import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT_APP = path.resolve(__dirname, '..');
const ROOT_MUSIC = 'D:/music for app/(chill)';

console.log('=== COMPLETING TASK 2: UPDATES & LOGS ===');

// 1. Verify files on disk
const p1 = path.join(ROOT_MUSIC, 'Mr T/Singles/Thu Cuối (POPS MUSIC)/Mr T - Thu Cuối (POPS MUSIC).m4a');
const p2 = path.join(ROOT_MUSIC, 'Mr T/Singles/Thu Cuối (MR.T Official)/Mr T - Thu Cuối (MR.T Official).m4a');

function getSha1(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha1').update(buf).digest('hex').substring(0, 12);
}

const sha1_1 = getSha1(p1);
const sha1_2 = getSha1(p2);

console.log('p1:', p1, 'SHA1:', sha1_1, 'Matches 214bf32d20a7:', sha1_1 === '214bf32d20a7');
console.log('p2:', p2, 'SHA1:', sha1_2, 'Matches 6f79d746ed44:', sha1_2 === '6f79d746ed44');

if (sha1_1 !== '214bf32d20a7' || sha1_2 !== '6f79d746ed44') {
  throw new Error('SHA1 mismatch on disk!');
}

// 2. Update overrides.json
const ovPath = path.join(ROOT_APP, 'tools/indexer/overrides.json');
const ov = JSON.parse(fs.readFileSync(ovPath, 'utf8'));

if (!ov.tracks['214bf32d20a7']) ov.tracks['214bf32d20a7'] = {};
ov.tracks['214bf32d20a7'].artist = 'Mr T';
ov.tracks['214bf32d20a7'].title = 'Thu Cuối (POPS MUSIC)';

if (!ov.tracks['6f79d746ed44']) ov.tracks['6f79d746ed44'] = {};
ov.tracks['6f79d746ed44'].artist = 'Mr T';
ov.tracks['6f79d746ed44'].title = 'Thu Cuối (MR.T Official)';

fs.writeFileSync(ovPath, JSON.stringify(ov, null, 2), 'utf8');
console.log('Step 2.4: overrides.json updated.');

// 3. Update youtube_downloads.json
const ytdlPath = path.join(ROOT_APP, 'tools/indexer/.state/youtube_downloads.json');
const ytdl = JSON.parse(fs.readFileSync(ytdlPath, 'utf8'));

const updates = [
  {
    id: '214bf32d20a7',
    artist: 'Mr T',
    title: 'Thu Cuối (POPS MUSIC)',
    relFile: 'Mr T\\Singles\\Thu Cuối (POPS MUSIC)\\Mr T - Thu Cuối (POPS MUSIC).m4a',
    relCover: 'Mr T\\Singles\\Thu Cuối (POPS MUSIC)\\Mr T - Thu Cuối (POPS MUSIC).jpg',
    relLyrics: 'Mr T\\Singles\\Thu Cuối (POPS MUSIC)\\Mr T - Thu Cuối (POPS MUSIC).lrc'
  },
  {
    id: '6f79d746ed44',
    artist: 'Mr T',
    title: 'Thu Cuối (MR.T Official)',
    relFile: 'Mr T\\Singles\\Thu Cuối (MR.T Official)\\Mr T - Thu Cuối (MR.T Official).m4a',
    relCover: 'Mr T\\Singles\\Thu Cuối (MR.T Official)\\Mr T - Thu Cuối (MR.T Official).jpg',
    relLyrics: 'Mr T\\Singles\\Thu Cuối (MR.T Official)\\Mr T - Thu Cuối (MR.T Official).lrc'
  },
  {
    id: '62e884555d9b',
    relFile: 'Meek Mill\\Singles\\Going Bad (ft. Drake)\\Meek Mill - Going Bad (ft. Drake).m4a',
    relCover: 'Meek Mill\\Singles\\Going Bad (ft. Drake)\\Meek Mill - Going Bad (ft. Drake).jpg',
    relLyrics: 'Meek Mill\\Singles\\Going Bad (ft. Drake)\\Meek Mill - Going Bad (ft. Drake).lrc'
  },
  {
    id: '4ac969d8b56e',
    relFile: 'HIEUTHUHAI\\Singles\\Chơi (ft. MANBO) (Remix)\\HIEUTHUHAI - Chơi (ft. MANBO) (Remix).m4a',
    relCover: 'HIEUTHUHAI\\Singles\\Chơi (ft. MANBO) (Remix)\\HIEUTHUHAI - Chơi (ft. MANBO) (Remix).jpg',
    relLyrics: 'HIEUTHUHAI\\Singles\\Chơi (ft. MANBO) (Remix)\\HIEUTHUHAI - Chơi (ft. MANBO) (Remix).lrc'
  },
  {
    id: 'a0c4d8722a3e',
    relFile: 'Young H\\Singles\\Bạn Của Tao\\Young H - Bạn Của Tao.m4a',
    relCover: 'Young H\\Singles\\Bạn Của Tao\\Young H - Bạn Của Tao.jpg',
    relLyrics: 'Young H\\Singles\\Bạn Của Tao\\Young H - Bạn Của Tao.lrc'
  },
  {
    id: 'b686d4957ccb',
    relFile: '5ber1\\Singles\\Làm Liều (ft. Kriss Ngo)\\5ber1 - Làm Liều (ft. Kriss Ngo).m4a',
    relCover: '5ber1\\Singles\\Làm Liều (ft. Kriss Ngo)\\5ber1 - Làm Liều (ft. Kriss Ngo).jpg',
    relLyrics: '5ber1\\Singles\\Làm Liều (ft. Kriss Ngo)\\5ber1 - Làm Liều (ft. Kriss Ngo).lrc'
  },
  {
    id: '457234a364d0',
    relFile: '2T\\Singles\\Cưới Đi\\2T - Cưới Đi.m4a',
    relCover: '2T\\Singles\\Cưới Đi\\2T - Cưới Đi.jpg',
    relLyrics: '2T\\Singles\\Cưới Đi\\2T - Cưới Đi.lrc'
  },
  {
    id: 'b1d223b66897',
    relFile: 'TTeam\\Singles\\Muốn Nói Với Em (ft. DT Tập Rap)\\TTeam - Muốn Nói Với Em (ft. DT Tập Rap).m4a',
    relCover: 'TTeam\\Singles\\Muốn Nói Với Em (ft. DT Tập Rap)\\TTeam - Muốn Nói Với Em (ft. DT Tập Rap).jpg',
    relLyrics: 'TTeam\\Singles\\Muốn Nói Với Em (ft. DT Tập Rap)\\TTeam - Muốn Nói Với Em (ft. DT Tập Rap).lrc'
  },
  {
    id: 'ba6e232771fe',
    relFile: 'Đạt G\\Singles\\Khó Vẽ Nụ Cười\\Đạt G - Khó Vẽ Nụ Cười.m4a',
    relCover: 'Đạt G\\Singles\\Khó Vẽ Nụ Cười\\Đạt G - Khó Vẽ Nụ Cười.jpg',
    relLyrics: 'Đạt G\\Singles\\Khó Vẽ Nụ Cười\\Đạt G - Khó Vẽ Nụ Cười.lrc'
  },
  {
    id: '782c7700a184',
    relFile: 'Đạt G\\Singles\\EmmE (Em,Tôi)\\Đạt G - EmmE (Em,Tôi).m4a',
    relCover: 'Đạt G\\Singles\\EmmE (Em,Tôi)\\Đạt G - EmmE (Em,Tôi).jpg',
    relLyrics: 'Đạt G\\Singles\\EmmE (Em,Tôi)\\Đạt G - EmmE (Em,Tôi).lrc'
  },
  {
    id: '6257f372bf5d',
    relFile: 'Đạt G\\Singles\\Bánh Mì Không\\Đạt G - Bánh Mì Không.m4a',
    relCover: 'Đạt G\\Singles\\Bánh Mì Không\\Đạt G - Bánh Mì Không.jpg',
    relLyrics: 'Đạt G\\Singles\\Bánh Mì Không\\Đạt G - Bánh Mì Không.lrc'
  }
];

updates.forEach(u => {
  const e = ytdl.find((x: any) => x.trackId === u.id);
  if (e) {
    if (u.artist) e.artist = u.artist;
    if (u.title) e.title = u.title;
    if (u.relFile) e.relativeFilePath = u.relFile;
    if (u.relCover) e.relativeCoverPath = u.relCover;
    if (u.relLyrics) e.relativeLyricsPath = u.relLyrics;
  }
});
fs.writeFileSync(ytdlPath, JSON.stringify(ytdl, null, 2), 'utf8');
console.log('Step 2.5: youtube_downloads.json updated.');

// 4. Operations log
const logPath = path.join(ROOT_APP, 'tools/indexer/backups/reorg_logs_20261118/step1_4_operations_log.json');
const opLogs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
opLogs.push({
  action: 'RESOLVE_COLLISION_MERGE_MR_T',
  artist: 'Mr T',
  choice: 'Option 1 (Keep both distinct tracks)',
  track1: {
    id: '214bf32d20a7',
    oldPath: 'Mr T/Singles/Thu Cuối',
    newPath: 'Mr T/Singles/Thu Cuối (POPS MUSIC)',
    sha1: sha1_1
  },
  track2: {
    id: '6f79d746ed44',
    oldPath: 'Mr.T/Singles/Thu Cuối',
    newPath: 'Mr T/Singles/Thu Cuối (MR.T Official)',
    sha1: sha1_2
  },
  deletedFolder: 'D:/music for app/(chill)/Mr.T (sent to Recycle Bin)'
});
fs.writeFileSync(logPath, JSON.stringify(opLogs, null, 2), 'utf8');
console.log('Step 2.6: Log recorded in step1_4_operations_log.json.');
