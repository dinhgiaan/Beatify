import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = 'D:/music for app';

function getSha1(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha1').update(buf).digest('hex').substring(0, 12);
}

const tteamDir = path.join(ROOT, '(chill)/TTeam/Singles/Muốn Nói Với Em (ft. DT Tập Rap)');
const oldDupDir = path.join(ROOT, '_duplicates/MUỐN NÓI VỚI EM/Singles/DT Tập Rap');
const newDupDir = path.join(ROOT, '_duplicates/MUỐN NÓI VỚI EM (BlackBi)/Singles/TTeam');

// 1. Verify source hashes before move
const currentTteamM4a = path.join(tteamDir, 'TTeam - Muốn Nói Với Em (ft. DT Tập Rap).m4a');
const currentDupM4a = path.join(oldDupDir, 'MUỐN NÓI VỚI EM - DT Tập Rap.m4a');

const hash62Before = getSha1(currentTteamM4a);
const hashB1Before = getSha1(currentDupM4a);

console.log('hash 62a7ccbe277b before:', hash62Before);
console.log('hash b1d223b66897 before:', hashB1Before);

if (hash62Before !== '62a7ccbe277b' || hashB1Before !== 'b1d223b66897') {
  throw new Error('Initial hash mismatch! Aborting swap.');
}

// 2. Create new duplicate dir for BlackBi version
fs.mkdirSync(newDupDir, { recursive: true });

// Move 62a7ccbe277b and sidecars to newDupDir
const files62 = fs.readdirSync(tteamDir);
for (const f of files62) {
  const src = path.join(tteamDir, f);
  const dest = path.join(newDupDir, f);
  fs.renameSync(src, dest);
  console.log(`Moved 62 file: ${f} -> ${dest}`);
}

// 3. Move b1d223b66897 from oldDupDir into tteamDir with standardized filenames
const filesB1 = fs.readdirSync(oldDupDir);
for (const f of filesB1) {
  const src = path.join(oldDupDir, f);
  let destName = f;
  if (f.endsWith('.m4a')) destName = 'TTeam - Muốn Nói Với Em (ft. DT Tập Rap).m4a';
  else if (f.endsWith('.jpg')) destName = 'TTeam - Muốn Nói Với Em (ft. DT Tập Rap).jpg';
  else if (f.endsWith('.lrc')) destName = 'TTeam - Muốn Nói Với Em (ft. DT Tập Rap).lrc';
  else if (f === 'info.txt') destName = 'info.txt';

  const dest = path.join(tteamDir, destName);
  fs.renameSync(src, dest);
  console.log(`Moved b1 file: ${f} -> ${dest}`);
}

// Clean up oldDupDir
try {
  fs.rmdirSync(oldDupDir);
  const parent1 = path.dirname(oldDupDir);
  fs.rmdirSync(parent1);
  const parent2 = path.dirname(parent1);
  fs.rmdirSync(parent2);
} catch {}

// 4. Verify hashes after move
const finalActiveM4a = path.join(tteamDir, 'TTeam - Muốn Nói Với Em (ft. DT Tập Rap).m4a');
const finalDupM4a = path.join(newDupDir, 'TTeam - Muốn Nói Với Em (ft. DT Tập Rap).m4a');

const hashActiveAfter = getSha1(finalActiveM4a);
const hashDupAfter = getSha1(finalDupM4a);

console.log('hash Active (b1d223b66897) after:', hashActiveAfter);
console.log('hash Dup (62a7ccbe277b) after:', hashDupAfter);

if (hashActiveAfter !== 'b1d223b66897' || hashDupAfter !== '62a7ccbe277b') {
  throw new Error('Post-swap hash mismatch! Immediate rollback required.');
}

// 5. Update overrides.json
const ovPath = 'tools/indexer/overrides.json';
const ov = JSON.parse(fs.readFileSync(ovPath, 'utf-8'));

// Restore hidden/deletedAt on 62a7ccbe277b
ov.tracks['62a7ccbe277b'] = {
  ...ov.tracks['62a7ccbe277b'],
  title: 'Muốn Nói Với Em (feat. Mai Xuân Thứ)',
  artist: 'DT Tập Rap',
  cover: 'covers/62a7ccbe277b.jpg',
  hidden: true,
  deletedAt: '2026-11-16T03:24:47.995Z',
};

// Set standardized title & artist on active b1d223b66897
ov.tracks['b1d223b66897'] = {
  ...ov.tracks['b1d223b66897'],
  title: 'Muốn Nói Với Em (ft. DT Tập Rap)',
  artist: 'TTeam',
  album: 'Singles',
  cover: 'covers/b1d223b66897.jpg',
};
delete ov.tracks['b1d223b66897'].hidden;
delete ov.tracks['b1d223b66897'].deletedAt;

fs.writeFileSync(ovPath, JSON.stringify(ov, null, 2), 'utf-8');
console.log('Updated overrides.json successfully.');

// 6. Update youtube_downloads.json
const ytdlPath = 'tools/indexer/.state/youtube_downloads.json';
if (fs.existsSync(ytdlPath)) {
  const ytdl = JSON.parse(fs.readFileSync(ytdlPath, 'utf-8'));
  for (const item of ytdl) {
    if (item.trackId === 'b1d223b66897') {
      item.filePath = finalActiveM4a;
      item.artist = 'TTeam';
      item.title = 'Muốn Nói Với Em (ft. DT Tập Rap)';
    } else if (item.trackId === '62a7ccbe277b') {
      item.filePath = finalDupM4a;
    }
  }
  fs.writeFileSync(ytdlPath, JSON.stringify(ytdl, null, 2), 'utf-8');
  console.log('Updated youtube_downloads.json successfully.');
}

console.log('SWAP COMPLETED 100% SUCCESSFULLY.');

