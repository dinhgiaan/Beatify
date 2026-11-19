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

const allFiles = walk(ROOT);
const ov = JSON.parse(fs.readFileSync('tools/indexer/overrides.json', 'utf-8'));

export interface TrackAudit {
  sha1: string;
  filePath: string;
  relPath: string;
  isDuplicate: boolean;
  isHidden: boolean;
  isPurged: boolean;
  artist: string;
  title: string;
  album: string;
}

const libraryAudit: TrackAudit[] = [];

for (const filePath of allFiles) {
  const buf = fs.readFileSync(filePath);
  const sha1 = crypto.createHash('sha1').update(buf).digest('hex').substring(0, 12);
  const isDuplicate = filePath.includes('_duplicates');
  const o = ov.tracks[sha1] || {};
  const isHidden = Boolean(o.hidden);
  const isPurged = Boolean(o.purged);

  // Default artist/title if not in overrides
  const baseName = path.basename(filePath, path.extname(filePath));
  const artist = o.artist || (baseName.includes(' - ') ? baseName.split(' - ')[0].trim() : 'Không rõ nghệ sĩ');
  const title = o.title || (baseName.includes(' - ') ? baseName.split(' - ').slice(1).join(' - ').trim() : baseName);
  const album = o.album || 'Singles';

  libraryAudit.push({
    sha1,
    filePath,
    relPath: filePath.replace('D:\\music for app\\', ''),
    isDuplicate,
    isHidden,
    isPurged,
    artist,
    title,
    album
  });
}

console.log('Total files audited:', libraryAudit.length);
const activeTracks = libraryAudit.filter(t => !t.isDuplicate && !t.isHidden && !t.isPurged);
console.log('Total active tracks:', activeTracks.length);

fs.writeFileSync('scratch/definitive_library_audit.json', JSON.stringify(libraryAudit, null, 2), 'utf-8');
console.log('Saved scratch/definitive_library_audit.json');

