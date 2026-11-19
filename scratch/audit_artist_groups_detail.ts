import fs from 'fs';
import path from 'path';

// Load active tracks from API
async function main() {
  const res = await fetch('http://127.0.0.1:4000/local-api/tracks');
  const data = await res.json();
  const tracks = data.tracks || [];

  const ytdlPath = 'tools/indexer/.state/youtube_downloads.json';
  const ytdl = fs.existsSync(ytdlPath) ? JSON.parse(fs.readFileSync(ytdlPath, 'utf-8')) : [];
  const ytdlMap = new Map(ytdl.map((x: any) => [x.trackId, x]));

  // Groups to investigate:
  // 1. B Ray / B RAY
  // 2. Sơn Tùng M-TP / SƠN TÙNG M-TP
  // 3. TOMMY TÈO / Tommy Tèo
  // 4. Đạt G / ĐạtG
  // 5. Wowy / WOWY
  // 6. Jombie / JOMBIE
  // 7. JustaTee / JUSTATEE
  // 8. Central Cee / CENTRAL CEE
  // 9. NLE Choppa / NLE CHOPPA
  // 10. Jack / JACK
  // 11. Rum / RUM
  // 12. Mr T / Mr.T
  // 13. W/n / W-n
  // 14. Young H / Young-H

  const targetGroups = [
    { key: 'B Ray', variants: ['B Ray', 'B RAY'] },
    { key: 'Sơn Tùng M-TP', variants: ['Sơn Tùng M-TP', 'SƠN TÙNG M-TP'] },
    { key: 'TOMMY TÈO', variants: ['TOMMY TÈO', 'Tommy Tèo'] },
    { key: 'Đạt G', variants: ['Đạt G', 'ĐạtG'] },
    { key: 'Wowy', variants: ['Wowy', 'WOWY'] },
    { key: 'Jombie', variants: ['Jombie', 'JOMBIE'] },
    { key: 'JustaTee', variants: ['JustaTee', 'JUSTATEE'] },
    { key: 'Central Cee', variants: ['Central Cee', 'CENTRAL CEE'] },
    { key: 'NLE Choppa', variants: ['NLE Choppa', 'NLE CHOPPA'] },
    { key: 'Jack', variants: ['Jack', 'JACK'] },
    { key: 'Rum', variants: ['Rum', 'RUM'] },
    { key: 'Mr T', variants: ['Mr T', 'Mr.T'] },
    { key: 'W/n', variants: ['W/n', 'W-n'] },
    { key: 'Young H', variants: ['Young H', 'Young-H'] },
  ];

  const results: any[] = [];

  for (const group of targetGroups) {
    const groupItems: any[] = [];
    for (const v of group.variants) {
      const matched = tracks.filter((t: any) => t.artist === v);
      for (const t of matched) {
        const y = ytdlMap.get(t.id);
        // Check info.txt
        let infoTitle = '';
        let infoChannel = '';
        const dir = path.dirname(t.filePath);
        const infoFile = path.join(dir, 'info.txt');
        if (fs.existsSync(infoFile)) {
          const txt = fs.readFileSync(infoFile, 'utf-8');
          const lines = txt.split('\n');
          for (const l of lines) {
            if (l.startsWith('title:')) infoTitle = l.replace('title:', '').trim();
            if (l.startsWith('uploader:')) infoChannel = l.replace('uploader:', '').trim();
          }
        }
        groupItems.push({
          id: t.id,
          variant: v,
          title: t.title,
          filePath: t.filePath,
          ytTitle: y ? y.title : infoTitle,
          ytChannel: y ? y.uploader : infoChannel
        });
      }
    }
    results.push({
      groupName: group.key,
      items: groupItems
    });
  }

  fs.writeFileSync('scratch/artist_groups_audit_detail.json', JSON.stringify(results, null, 2), 'utf-8');
  console.log('Audited detail written to scratch/artist_groups_audit_detail.json');
}

main();

