import { loadConfig } from './config';
import { findAudioFiles, scanAudioFile, calculateTrackId } from './services/scanner';
import { buildLibrary } from './services/libraryBuilder';
import { R2Uploader } from './services/r2Uploader';
import { analyzeAudioFile } from './services/audioAnalysisService';
import { youtubeJobRunner } from './services/youtubeJobRunner';

async function main() {
  const command = process.argv[2] || 'help';

  console.log(`\n🎵 Beatify Music Indexer - Lệnh: [${command}]`);

  if (command === 'help') {
    console.log(`
Cách dùng:
  pnpm indexer scan         Quét thư mục nhạc và in danh sách bài hát
  pnpm indexer analyze      Phân tích BPM, Camelot Key, Intro/Outro (chạy lại thư viện)
  pnpm indexer sync         Quét, tạo thư viện và đồng bộ lên Cloudflare R2
  pnpm indexer ui           Mở Web Dashboard quản lý trên trình duyệt
    `);
    return;
  }

  const config = loadConfig();
  if (!config) {
    console.error('❌ Chưa cấu hình đầy đủ file .env trong tools/indexer/.env');
    process.exit(1);
  }

  if (command === 'scan') {
    console.log(`🔍 Đang quét thư mục: ${config.MUSIC_SOURCE_DIR}...`);
    const files = await findAudioFiles(config.MUSIC_SOURCE_DIR);
    console.log(`📁 Tìm thấy ${files.length} file âm thanh.`);

    let count = 0;
    for (const f of files) {
      const scanned = await scanAudioFile(f);
      if (scanned) {
        count++;
        const keyInfo = scanned.track.key ? ` | Key: ${scanned.track.key}` : '';
        const bpmInfo = scanned.track.bpm ? ` | BPM: ${scanned.track.bpm}` : '';
        console.log(`  ${count}. [${scanned.track.artist}] ${scanned.track.title} (${scanned.track.duration}s${bpmInfo}${keyInfo})`);
      }
    }
    console.log(`\n✅ Quét thành công ${count} bài hát.`);
  } else if (command === 'analyze') {
    console.log(`🔬 Đang quét và phân tích âm thanh thư mục: ${config.MUSIC_SOURCE_DIR}...`);
    const files = await findAudioFiles(config.MUSIC_SOURCE_DIR);
    console.log(`📁 Tìm thấy ${files.length} file âm thanh.`);

    let successCount = 0;
    let failedCount = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f) continue;
      try {
        const id = await calculateTrackId(f);
        const res = await analyzeAudioFile(f, id, false);
        if (res) {
          successCount++;
          console.log(`  [${i + 1}/${files.length}] ✅ ${id} -> BPM: ${res.bpm ?? 'N/A'}, Key: ${res.key ?? 'N/A'}, Intro: ${res.introEnd}s, Outro: ${res.outroStart}s`);
        } else {
          failedCount++;
          console.log(`  [${i + 1}/${files.length}] ⚠️ ${id} -> Không trích xuất được thông tin, bỏ qua an toàn.`);
        }
      } catch (err) {
        failedCount++;
        console.warn(`  [${i + 1}/${files.length}] ❌ Lỗi phân tích "${f}":`, err);
      }
    }
    console.log(`\n🎉 Hoàn thành phân tích: ${successCount} thành công, ${failedCount} bỏ qua.`);
  } else if (command === 'sync') {
    console.log(`🚀 Bắt đầu đồng bộ thư viện lên Cloudflare R2 (${config.R2_BUCKET})...`);
    const files = await findAudioFiles(config.MUSIC_SOURCE_DIR);
    console.log(`📁 Quét được ${files.length} file.`);

    const scannedTracks = [];
    for (const f of files) {
      const item = await scanAudioFile(f);
      if (item) scannedTracks.push(item);
    }

    const { library, coversByAlbumId } = buildLibrary(scannedTracks);
    console.log(`📊 Tạo thành công thư viện: ${library.tracks.length} bài hát, ${library.albums.length} albums.`);

    const uploader = new R2Uploader(config);

    // 1. Upload audio files
    console.log(`📤 Đang tải ${scannedTracks.length} file nhạc lên R2...`);
    for (let i = 0; i < scannedTracks.length; i++) {
      const item = scannedTracks[i];
      if (!item) continue;
      process.stdout.write(`  [${i + 1}/${scannedTracks.length}] ${item.track.title}...\r`);
      await uploader.uploadAudio(item.track.file, item.filePath);
    }
    console.log(`\n✅ Đã tải xong toàn bộ file nhạc.`);

    // 2. Upload covers
    console.log(`🖼️ Đang tải ${coversByAlbumId.size} ảnh bìa album...`);
    for (const [albumId, buffer] of coversByAlbumId.entries()) {
      await uploader.uploadCover(albumId, buffer);
    }
    console.log(`✅ Đã tải xong ảnh bìa.`);

    // 3. Upload library.json cuối cùng
    console.log(`📋 Đang kiểm tra đối chiếu và tải library.json lên R2...`);
    await uploader.uploadLibrary(library);

    // Đồng bộ trạng thái đã upload sang lịch sử tải YouTube Music
    try {
      const uploadedTrackIds = new Set(library.tracks.map((t) => t.id));
      const syncedCount = await youtubeJobRunner.syncUploadedTrackIds(uploadedTrackIds);
      if (syncedCount > 0) {
        console.log(`✨ Đã đồng bộ trạng thái "Đã lên Cloud" cho ${syncedCount} bài hát trong lịch sử tải.`);
      }
    } catch {
      // bỏ qua nếu lỗi cập nhật lịch sử tải
    }

    console.log(`\n🎉 ĐỒNG BỘ THÀNH CÔNG! Thư viện đã sẵn sàng trên Cloudflare R2.`);
  } else {
    console.error(`❌ Lệnh không hợp lệ: ${command}. Chạy 'pnpm indexer help' để xem hướng dẫn.`);
  }
}

main().catch((err) => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
