import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = 'D:/music for app';
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

const all = walk(ROOT);
console.log('Total files found on entire D:/music for app:', all.length);

const ov = JSON.parse(fs.readFileSync('tools/indexer/overrides.json', 'utf-8'));

const activeItems: any[] = [];
let hashMatches = 0;

for (const f of all) {
  if (f.includes('_duplicates')) continue;
  const buf = fs.readFileSync(f);
  const sha1 = crypto.createHash('sha1').update(buf).digest('hex').substring(0, 12);
  const o = ov.tracks[sha1] || {};
  if (o.hidden || o.purged) continue;

  const artist = o.artist || (path.basename(f, path.extname(f)).includes(' - ') ? path.basename(f, path.extname(f)).split(' - ')[0].trim() : 'Không rõ');
  const title = o.title || (path.basename(f, path.extname(f)).includes(' - ') ? path.basename(f, path.extname(f)).split(' - ').slice(1).join(' - ').trim() : path.basename(f));

  activeItems.push({
    sha1,
    artist,
    title,
    filePath: f
  });
  hashMatches++;
}

console.log('Active tracks verified count:', activeItems.length);
console.log('All hash reads succeeded:', hashMatches);

// Group artists by case-insensitive, punctuation-stripped key
const groups = new Map<string, Set<string>>();
for (const it of activeItems) {
  const key = it.artist.toLowerCase().trim().replace(/[\s\-_./]/g, '');
  if (!groups.has(key)) groups.set(key, new Set());
  groups.get(key)!.add(it.artist);
}

const remainingVariants: any[] = [];
for (const [key, set] of groups.entries()) {
  if (set.size > 1) {
    remainingVariants.push({
      key,
      variants: Array.from(set)
    });
  }
}

console.log('Remaining artist variants count:', remainingVariants.length);
console.log('Remaining artist variants:', remainingVariants);

fs.writeFileSync('scratch/post_step4_verified_library.json', JSON.stringify(activeItems, null, 2), 'utf-8');

