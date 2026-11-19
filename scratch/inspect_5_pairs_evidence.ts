import fs from 'fs';
import path from 'path';

const audit = JSON.parse(fs.readFileSync('scratch/definitive_library_audit.json', 'utf-8'));
const ytdl = JSON.parse(fs.readFileSync('tools/indexer/.state/youtube_downloads.json', 'utf-8'));
const ytdlMap = new Map(ytdl.map((x: any) => [x.trackId, x]));

const checkIds = [
  '17c5bd65bea7', 'e3fecae89474', // Jack
  '30674e1a783d', '77e21c33e0ff', // Rum
  '214bf32d20a7', '6f79d746ed44', // Mr T
  '1f3864988a17', 'b9a414133672', '4db0ac503082', // W/n
  'ea1f90806686', 'a0c4d8722a3e', // Young H
];

for (const id of checkIds) {
  const t = audit.find((x: any) => x.sha1 === id);
  const y = ytdlMap.get(id);
  const dir = path.dirname(t.filePath);
  const infoFile = path.join(dir, 'info.txt');
  let infoContent = '';
  if (fs.existsSync(infoFile)) {
    infoContent = fs.readFileSync(infoFile, 'utf-8');
  }
  console.log(`\n========================================`);
  console.log(`Track ID: ${id}`);
  console.log(`Artist currently: "${t.artist}" | Title: "${t.title}"`);
  console.log(`Path: ${t.relPath}`);
  console.log(`youtube_downloads entry:`, y ? { title: y.title, artist: y.artist, channel: y.uploader, origTitle: y.originalVideoTitle } : 'NONE');
  console.log(`info.txt snippet:\n${infoContent.slice(0, 300)}`);
}

