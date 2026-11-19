import fs from 'fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

const PILOT_TRACKS = [
  {
    name: 'Track 1 (Merge Folder - B Ray)',
    trackId: 'fc3d4df74119',
    category: '(rap)',
    oldDir: 'D:\\music for app\\(rap)\\B.S.N.L 2\\Singles\\B-ray',
    oldAudioName: 'B.S.N.L 2 - B-ray.m4a',
    newDir: 'D:\\music for app\\(rap)\\B Ray\\Singles\\B.S.N.L 2',
    newAudioName: 'B Ray - B.S.N.L 2.m4a',
    canonicalArtist: 'B Ray',
    canonicalTitle: 'B.S.N.L 2',
    overrideTitle: 'B.S.N.L 2',
    overrideArtist: 'B Ray',
    overrideAlbum: 'Singles',
    sourceChannel: 'EvB Records / B Ray',
    sourceUrl: 'https://www.youtube.com/watch?v=kYJvO3gTq9U'
  },
  {
    name: 'Track 2 (Có "ft." - RYCO ft. MEGASHOCK)',
    trackId: 'a4b0be8e52ee',
    category: '(rap)',
    oldDir: 'D:\\music for app\\(rap)\\RYCO - -VIỆT- NÊN LÀM (Ft. MEGASHOCK)\\Singles\\Offical Video',
    oldAudioName: 'RYCO - -VIỆT- NÊN LÀM (Ft. MEGASHOCK) - Offical Video.m4a',
    newDir: 'D:\\music for app\\(rap)\\RYCO\\Singles\\Việt Nên Làm (ft. MEGASHOCK)',
    newAudioName: 'RYCO - Việt Nên Làm (ft. MEGASHOCK).m4a',
    canonicalArtist: 'RYCO',
    canonicalTitle: 'Việt Nên Làm (ft. MEGASHOCK)',
    overrideTitle: 'Việt Nên Làm (ft. MEGASHOCK)',
    overrideArtist: 'RYCO',
    overrideAlbum: 'Singles',
    sourceChannel: 'RYCO Official',
    sourceUrl: 'https://www.youtube.com/watch?v=gT8B25XoZ6k'
  },
  {
    name: 'Track 3 (Ký tự đặc biệt dấu ? - Liệu Giờ)',
    trackId: '69991caf41d1',
    category: '(chill)',
    oldDir: 'D:\\music for app\\(chill)\\2T - LIỆU GIỜ ( WHAT IF - )\\Singles\\M-V',
    oldAudioName: '2T - LIỆU GIỜ ( WHAT IF - ) - M-V.m4a',
    newDir: 'D:\\music for app\\(chill)\\2T\\Singles\\Liệu Giờ (What If)',
    newAudioName: '2T - Liệu Giờ (What If).m4a',
    canonicalArtist: '2T',
    canonicalTitle: 'Liệu Giờ (What If)',
    overrideTitle: 'Liệu Giờ (What If?)', // Giữ dấu ? trong metadata override!
    overrideArtist: '2T',
    overrideAlbum: 'Singles',
    sourceChannel: '2T Official',
    sourceUrl: 'https://www.youtube.com/watch?v=F_4B892gW90'
  }
];

const OPERATION_LOG = [];

async function computeSha1(filePath) {
  const buf = await fs.readFile(filePath);
  return crypto.createHash('sha1').update(buf).digest('hex');
}

async function runPilot() {
  console.log('=== BẮT ĐẦU CHẠY PILOT 3 BÀI HÁT (BƯỚC 1) ===\n');

  for (const t of PILOT_TRACKS) {
    console.log(`--- [PILOT] Đang xử lý: ${t.name} ---`);
    console.log(`Old Dir: ${t.oldDir}`);
    console.log(`New Dir: ${t.newDir}`);

    const oldAudioPath = path.join(t.oldDir, t.oldAudioName);
    if (!existsSync(oldAudioPath)) {
      throw new Error(`File âm thanh nguồn không tồn tại: ${oldAudioPath}`);
    }

    // 1. Kiểm tra hash trước khi di chuyển
    const sha1Before = await computeSha1(oldAudioPath);
    const idBefore = sha1Before.slice(0, 12);
    if (idBefore !== t.trackId) {
      throw new Error(`Mã track.id không khớp! Kỳ vọng ${t.trackId}, thực tế ${idBefore}`);
    }
    console.log(`✓ Track ID trước khi di chuyển: ${idBefore} (SHA1: ${sha1Before})`);

    // 2. Tạo thư mục đích
    await fs.mkdir(t.newDir, { recursive: true });
    OPERATION_LOG.push({ action: 'mkdir', target: t.newDir });

    // 3. Di chuyển & đổi tên các file đi kèm (.m4a, .jpg, .lrc, info.txt, folder.jpg)
    const baseOld = t.oldAudioName.replace(/\.m4a$/i, '');
    const baseNew = t.newAudioName.replace(/\.m4a$/i, '');

    const fileMappings = [
      { from: path.join(t.oldDir, `${baseOld}.m4a`), to: path.join(t.newDir, `${baseNew}.m4a`) },
      { from: path.join(t.oldDir, `${baseOld}.jpg`), to: path.join(t.newDir, `${baseNew}.jpg`) },
      { from: path.join(t.oldDir, `${baseOld}.lrc`), to: path.join(t.newDir, `${baseNew}.lrc`) },
      { from: path.join(t.oldDir, 'info.txt'), to: path.join(t.newDir, 'info.txt') },
      { from: path.join(t.oldDir, 'folder.jpg'), to: path.join(t.newDir, 'folder.jpg') }
    ];

    for (const m of fileMappings) {
      if (existsSync(m.from)) {
        // Cập nhật info.txt trước khi chuyển nếu là file info.txt
        if (m.from.endsWith('info.txt')) {
          try {
            let infoContent = await fs.readFile(m.from, 'utf-8');
            if (!infoContent.includes('source_channel')) {
              infoContent += `\nsource_channel : ${t.sourceChannel}\nsource_url     : ${t.sourceUrl}\n`;
              await fs.writeFile(m.from, infoContent, 'utf-8');
            }
          } catch {}
        }

        await fs.rename(m.from, m.to);
        console.log(`  ✓ Đã di chuyển: ${path.basename(m.from)} -> ${path.basename(m.to)}`);
        OPERATION_LOG.push({ action: 'move', from: m.from, to: m.to });
      }
    }

    // 4. Kiểm tra lại hash của file âm thanh tại vị trí mới
    const newAudioPath = path.join(t.newDir, t.newAudioName);
    const sha1After = await computeSha1(newAudioPath);
    const idAfter = sha1After.slice(0, 12);
    if (idAfter !== t.trackId) {
      throw new Error(`NGUY HIỂM: Mã track.id bị thay đổi sau khi di chuyển! Trước: ${t.trackId}, Sau: ${idAfter}`);
    }
    console.log(`✓ Track ID sau khi di chuyển: ${idAfter} (Trùng khớp 100%!)`);

    // 5. Cập nhật overrides.json
    const overridesPath = path.resolve('tools/indexer/overrides.json');
    const overridesData = JSON.parse(readFileSync(overridesPath, 'utf-8'));
    if (!overridesData.tracks) overridesData.tracks = {};

    overridesData.tracks[t.trackId] = {
      ...(overridesData.tracks[t.trackId] || {}),
      title: t.overrideTitle,
      artist: t.overrideArtist,
      album: t.overrideAlbum
    };
    writeFileSync(overridesPath, JSON.stringify(overridesData, null, 2), 'utf-8');
    console.log(`✓ Đã ghi overrides.json cho trackId ${t.trackId}: "${t.overrideArtist} - ${t.overrideTitle}"`);

    // 6. Cập nhật youtube_downloads.json
    const ytPath = path.resolve('tools/indexer/.state/youtube_downloads.json');
    const ytList = JSON.parse(readFileSync(ytPath, 'utf-8'));
    const ytEntry = ytList.find(y => y.trackId === t.trackId);
    if (ytEntry) {
      const catDir = t.category; // '(rap)' or '(chill)'
      const rootDir = path.join('D:\\music for app', catDir);
      ytEntry.relativeFilePath = path.relative(rootDir, newAudioPath);
      ytEntry.relativeCoverPath = path.relative(rootDir, path.join(t.newDir, `${baseNew}.jpg`));
      ytEntry.relativeLyricsPath = path.relative(rootDir, path.join(t.newDir, `${baseNew}.lrc`));
      ytEntry.artist = t.canonicalArtist;
      ytEntry.title = t.overrideTitle;
      writeFileSync(ytPath, JSON.stringify(ytList, null, 2), 'utf-8');
      console.log(`✓ Đã cập nhật youtube_downloads.json với đường dẫn mới: ${ytEntry.relativeFilePath}`);
    }

    // 7. Dọn thư mục cũ nếu chỉ còn các file rác như desktop.ini
    try {
      const remainingOldFiles = await fs.readdir(t.oldDir);
      const ignorable = new Set(['desktop.ini', 'thumbs.db']);
      const isClean = remainingOldFiles.every(f => ignorable.has(f.toLowerCase()));
      if (isClean) {
        for (const f of remainingOldFiles) {
          await fs.unlink(path.join(t.oldDir, f)).catch(() => {});
        }
        await fs.rmdir(t.oldDir);
        console.log(`✓ Đã dọn dẹp thư mục con cũ rỗng: ${t.oldDir}`);
        
        // Thử dọn thư mục cha nếu rỗng
        const parentOld = path.dirname(t.oldDir);
        const parentEntries = await fs.readdir(parentOld).catch(() => []);
        if (parentEntries.every(f => ignorable.has(f.toLowerCase()))) {
          for (const f of parentEntries) {
            await fs.unlink(path.join(parentOld, f)).catch(() => {});
          }
          await fs.rmdir(parentOld).catch(() => {});
          console.log(`✓ Đã dọn dẹp thư mục cha cũ rỗng: ${parentOld}`);
        }
      }
    } catch (e) {
      console.warn(`Lưu ý dọn thư mục: ${e.message}`);
    }

    console.log(`==> Hoàn tất xử lý bài ${t.name}\n`);
  }

  // Ghi nhật ký thao tác
  await fs.writeFile(
    'scratch/pilot_operation_log.json',
    JSON.stringify(OPERATION_LOG, null, 2),
    'utf-8'
  );
  console.log('--- ĐÃ HOÀN TẤT THỰC THI PILOT 3 BÀI HÁT ---');
}

runPilot().catch(console.error);

