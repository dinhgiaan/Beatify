import fs from 'fs';
import path from 'path';

const MUSIC_DIR = 'D:/music for app';
const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.opus']);

function findFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      results = results.concat(findFiles(full));
    } else {
      if (AUDIO_EXTS.has(path.extname(e.name).toLowerCase())) {
        results.push(full);
      }
    }
  }
  return results;
}

const all = findFiles(MUSIC_DIR);
console.log('Total audio files:', all.length);
const dups = all.filter(f => f.includes('_duplicates'));
console.log('In _duplicates:', dups.length);
const inRap = all.filter(f => f.includes('(rap)'));
console.log('In (rap):', inRap.length);
const inChill = all.filter(f => f.includes('(chill)'));
console.log('In (chill):', inChill.length);

