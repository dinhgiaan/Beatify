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
const ov = JSON.parse(fs.readFileSync('tools/indexer/overrides.json', 'utf-8'));

console.log('Total files found:', all.length);

const targetIds = ['9f20218e61f6', 'b9a414133672', '4db0ac503082'];

for (const f of all) {
  const buf = fs.readFileSync(f);
  const hash = crypto.createHash('sha1').update(buf).digest('hex').substring(0, 12);
  if (targetIds.includes(hash)) {
    console.log(`\n=== Found target ID: ${hash} ===`);
    console.log('File path:', f);
    console.log('In overrides.json:', ov.tracks[hash]);
  }
}

// Let's also search where "The One" and "crying over you" and "3107" are!
for (const f of all) {
  const lower = f.toLowerCase();
  if (lower.includes('the one') || lower.includes('crying over you') || lower.includes('simple love') || lower.includes('3107')) {
    const buf = fs.readFileSync(f);
    const hash = crypto.createHash('sha1').update(buf).digest('hex').substring(0, 12);
    console.log(`\n[Search file] ${f}`);
    console.log(`  -> SHA1: ${hash}`);
    console.log(`  -> Override:`, ov.tracks[hash]);
  }
}

