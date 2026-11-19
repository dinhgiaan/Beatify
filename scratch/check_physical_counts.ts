import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const audioExts = new Set(['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.opus']);
function walk(dir: string): string[] {
  let res: string[] = [];
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) res = res.concat(walk(full));
      else if (audioExts.has(path.extname(e.name).toLowerCase())) res.push(full);
    }
  } catch {}
  return res;
}

const all = walk('D:/music for app');
console.log('Total audio files on entire D:/music for app:', all.length);

const inDuplicates = all.filter(f => f.includes('_duplicates'));
console.log('Files in _duplicates:', inDuplicates.length);
inDuplicates.forEach(f => console.log('  -> ' + f));

const outsideDuplicates = all.filter(f => !f.includes('_duplicates'));
console.log('Files outside _duplicates (in rap & chill):', outsideDuplicates.length);

// Check specific hashes
const ids = new Map<string, string>();
for (const f of all) {
  const buf = fs.readFileSync(f);
  const hash = crypto.createHash('sha1').update(buf).digest('hex').substring(0, 12);
  ids.set(hash, f);
}

const checkList = ['581ff2893598', '88c676f27218', '62a7ccbe277b', 'b1d223b66897', '4e116ee95e65', '815b5e9f8224'];
for (const cid of checkList) {
  console.log('ID ' + cid + ' on disk:', ids.has(cid) ? ids.get(cid) : 'NOT ON DISK');
}

// Check which of the 364 files are marked hidden/purged in overrides.json
const ov = JSON.parse(fs.readFileSync('tools/indexer/overrides.json', 'utf-8'));
const hiddenOnDisk: string[] = [];
const activeOnDisk: string[] = [];

for (const [hash, f] of ids.entries()) {
  if (f.includes('_duplicates')) continue;
  const o = ov.tracks[hash];
  if (o?.hidden || o?.purged) {
    hiddenOnDisk.push(`${hash}: ${o.title} (${f})`);
  } else {
    activeOnDisk.push(hash);
  }
}

console.log('Hidden files physically on disk outside _duplicates count:', hiddenOnDisk.length);
hiddenOnDisk.forEach(h => console.log('  -> ' + h));
console.log('Active files physically on disk count:', activeOnDisk.length);

