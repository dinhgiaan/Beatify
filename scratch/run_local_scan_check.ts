import { findAudioFiles, scanAudioFile } from '../tools/indexer/src/services/scanner.js';
import { getOverrides, applyOverridesToScanned } from '../tools/indexer/src/services/overridesManager.js';
import { loadConfig } from '../tools/indexer/src/services/config.js';

async function main() {
  const config = loadConfig();
  console.log('Source dir:', config.MUSIC_SOURCE_DIR);

  const files = await findAudioFiles(config.MUSIC_SOURCE_DIR);
  console.log('Total audio files scanned by scanner:', files.length);

  const rawScanned: any[] = [];
  for (const f of files) {
    const item = await scanAudioFile(f);
    if (item) rawScanned.push(item);
  }

  const overrides = await getOverrides();
  const scannedTracks = applyOverridesToScanned(rawScanned, overrides);

  // Active tracks (exclude hidden/purged)
  const activeTracks = scannedTracks.filter(item => {
    const ov = overrides.tracks[item.track.id];
    return !ov?.hidden && !ov?.purged;
  });

  console.log('Total active tracks:', activeTracks.length);

  const trackB1 = activeTracks.find(t => t.track.id === 'b1d223b66897');
  console.log('Active b1d223b66897 found:', Boolean(trackB1));
  if (trackB1) {
    console.log('b1d223b66897 details:', {
      id: trackB1.track.id,
      artist: trackB1.track.artist,
      title: trackB1.track.title,
      album: trackB1.track.album,
      filePath: trackB1.filePath
    });
  }

  const track62 = activeTracks.find(t => t.track.id === '62a7ccbe277b');
  console.log('Active 62a7ccbe277b found:', Boolean(track62));
}

main();

