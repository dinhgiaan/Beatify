import fs from 'fs';
import path from 'path';

const allScanned = JSON.parse(fs.readFileSync('scratch/all_scanned_raw.json', 'utf-8'));

const targets = [
  { name: 'Alaba Trap', pattern: /Alaba Trap/i },
  { name: 'Phía Bờ Tây', pattern: /Phía Bờ Tây/i },
  { name: 'Quan Tài Hư', pattern: /Quan tài hư/i },
  { name: 'Em Tao Hip Hop', pattern: /EM TAO HIP HOP/i },
  { name: 'Cưới Đi', pattern: /Cưới Đi/i },
  { name: 'Muốn Nói Với Em', pattern: /MUỐN NÓI VỚI EM/i },
  { name: 'Khu Tao Sống', pattern: /Khu Tao S/i },
  { name: 'HOTEL LOBBY', pattern: /HOTEL LOBBY/i },
  { name: 'Già Cùng Nhau Là Được', pattern: /Già Cùng Nhau/i },
];

for (const t of targets) {
  console.log(`\n========================================`);
  console.log(`TARGET: ${t.name}`);
  console.log(`========================================`);
  const matches = allScanned.filter(item => 
    t.pattern.test(item.relToCategory) ||
    t.pattern.test(item.fileName) ||
    t.pattern.test(item.tags?.title || '')
  );

  for (const m of matches) {
    console.log(`Category: ${m.category}`);
    console.log(`RelPath: ${m.relToCategory}`);
    console.log(`File: ${m.fileName} (${m.sizeBytes} bytes, ${m.tags?.duration}s)`);
    console.log(`SHA1: ${m.sha1}`);
    console.log(`Tags:`, m.tags);
    console.log(`InfoTxt:`, m.infoTxt?.data ? {
      title: m.infoTxt.data.title,
      uploader: m.infoTxt.data.uploader,
      channel: m.infoTxt.data.channel,
      webpage_url: m.infoTxt.data.webpage_url,
      artist: m.infoTxt.data.artist,
      track: m.infoTxt.data.track
    } : 'None');
    if (m.ytRecord) {
      console.log(`YT Record:`, {
        videoId: m.ytRecord.videoId,
        title: m.ytRecord.title,
        artist: m.ytRecord.artist,
        relativeFilePath: m.ytRecord.relativeFilePath
      });
    }
  }
}

