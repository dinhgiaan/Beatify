import fs from 'fs';
import path from 'path';

const ROOT = 'D:/music for app';
const audit = JSON.parse(fs.readFileSync('scratch/definitive_library_audit.json', 'utf-8'));
const activeTracks = audit.filter((t: any) => !t.isDuplicate && !t.isHidden && !t.isPurged);

function getInfoData(filePath: string) {
  const dir = path.dirname(filePath);
  const infoFile = path.join(dir, 'info.txt');
  let title = '';
  let uploader = '';
  if (fs.existsSync(infoFile)) {
    const lines = fs.readFileSync(infoFile, 'utf-8').split('\n');
    for (const l of lines) {
      if (l.startsWith('title:')) title = l.replace('title:', '').trim();
      if (l.startsWith('uploader:')) uploader = l.replace('uploader:', '').trim();
    }
  }
  return { title, uploader };
}

// 1. Group by caseOnlyKey
const groups = new Map<string, any[]>();
for (const t of activeTracks) {
  const key = t.artist.toLowerCase().trim().replace(/[\s\-_.]/g, '');
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key)!.push(t);
}

const detailedAudit: any[] = [];
for (const [key, tracksInGroup] of groups.entries()) {
  const distinctArtistStrings = Array.from(new Set(tracksInGroup.map(t => t.artist)));
  if (distinctArtistStrings.length > 1) {
    const items = tracksInGroup.map(t => {
      const info = getInfoData(t.filePath);
      return {
        id: t.sha1,
        artist: t.artist,
        title: t.title,
        relPath: t.relPath,
        infoTitle: info.title,
        infoUploader: info.uploader
      };
    });
    detailedAudit.push({
      key,
      distinctArtistStrings,
      tracks: items
    });
  }
}

fs.writeFileSync('scratch/definitive_artist_groups.json', JSON.stringify(detailedAudit, null, 2), 'utf-8');
console.log('Saved definitive_artist_groups.json. Groups count:', detailedAudit.length);

