import { loadConfig } from '../tools/indexer/src/services/config.js';
import { findAudioFiles } from '../tools/indexer/src/services/scanner.js';

const config = loadConfig();
const files = await findAudioFiles(config.MUSIC_SOURCE_DIR);
console.log('Total files found:', files.length);
const duplicates = files.filter(f => f.includes('_duplicates'));
console.log('Files in _duplicates:', duplicates.length);

