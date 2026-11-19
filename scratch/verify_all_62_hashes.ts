import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const pilotIds = [
  { id: 'fc3d4df74119', artist: 'B Ray', title: 'B.S.N.L 2', newRel: '(rap)\\B Ray\\Singles\\B.S.N.L 2\\B Ray - B.S.N.L 2.m4a' },
  { id: 'a4b0be8e52ee', artist: 'RYCO', title: 'Việt Nên Làm (ft. MEGASHOCK)', newRel: '(rap)\\RYCO\\Singles\\Việt Nên Làm (ft. MEGASHOCK)\\RYCO - Việt Nên Làm (ft. MEGASHOCK).m4a' },
  { id: '69991caf41d1', artist: '2T', title: 'Liệu Giờ (What If?)', newRel: '(chill)\\2T\\Singles\\Liệu Giờ (What If)\\2T - Liệu Giờ (What If).m4a' },
];

const batchLogs = JSON.parse(fs.readFileSync('scratch/migration_operations_log.json', 'utf-8'));
const all = [...pilotIds];
for (const b of batchLogs) {
  all.push({
    id: b.trackId,
    artist: b.artist,
    title: b.title,
    newRel: b.newPath
  });
}

console.log('Total gathered:', all.length);
let matched = 0;
const results: any[] = [];

for (const item of all) {
  let fullPath = path.join('D:/music for app', item.newRel);
  if (!fs.existsSync(fullPath)) {
    const rapPath = path.join('D:/music for app/(rap)', item.newRel);
    const chillPath = path.join('D:/music for app/(chill)', item.newRel);
    if (fs.existsSync(rapPath)) fullPath = rapPath;
    else if (fs.existsSync(chillPath)) fullPath = chillPath;
  }
  if (fs.existsSync(fullPath)) {
    const buf = fs.readFileSync(fullPath);
    const sha1 = crypto.createHash('sha1').update(buf).digest('hex').substring(0, 12);
    const isMatch = sha1 === item.id;
    if (isMatch) matched++;
    results.push({
      id: item.id,
      artist: item.artist,
      title: item.title,
      newPath: fullPath.replace('D:\\music for app\\', ''),
      sha1Before: item.id,
      sha1After: sha1,
      isMatch
    });
  } else {
    console.log('NOT FOUND:', fullPath);
  }
}

console.log(`Matched: ${matched}/${all.length}`);
fs.writeFileSync('scratch/table_62_results.json', JSON.stringify(results, null, 2), 'utf-8');

