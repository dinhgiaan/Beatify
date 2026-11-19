import fs from 'fs';

const items = JSON.parse(fs.readFileSync('tools/indexer/backups/reorg_logs_20261118/table_62_results.json', 'utf-8'));

const featList: any[] = [];
for (const it of items) {
  const title = it.title;
  if (/(\bfeat\.|\bft\.|\bfeaturing\b)/i.test(title)) {
    // Propose replacement to (ft. X)
    let proposed = title;
    // Replace [feat. X], [ft. X], (feat. X), ft. X, feat. X -> (ft. X)
    featList.push({
      id: it.id,
      artist: it.artist,
      currentTitle: title,
    });
  }
}

console.log(JSON.stringify(featList, null, 2));

