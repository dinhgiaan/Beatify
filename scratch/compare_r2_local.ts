import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';

const env = fs.readFileSync('tools/indexer/.env', 'utf-8');
const lines = env.split('\n');
const getVal = (k: string) => {
  const line = lines.find((l) => l.startsWith(k + '='));
  return line ? line.split('=')[1].trim().replace(/^['"]|['"]$/g, '') : '';
};

const s3 = new S3Client({
  region: 'auto',
  endpoint: 'https://' + getVal('R2_ACCOUNT_ID') + '.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: getVal('R2_ACCESS_KEY_ID'),
    secretAccessKey: getVal('R2_SECRET_ACCESS_KEY'),
  },
});

async function main() {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: getVal('R2_BUCKET'), Key: 'library.json' }));
    const str = await res.Body!.transformToString();
    const r2Lib = JSON.parse(str);
    console.log('R2 library tracks count:', r2Lib.tracks.length);
    console.log('R2 library albums count:', r2Lib.albums.length);

    const r2Ids = new Set(r2Lib.tracks.map((t: any) => t.id));

    // Pilot tracks (3)
    const pilotIds = ['fc3d4df74119', 'a4b0be8e52ee', '69991caf41d1'];

    // 59 batch tracks
    const batchLogs = JSON.parse(fs.readFileSync('scratch/migration_operations_log.json', 'utf-8'));
    const batchIds = batchLogs.map((l: any) => l.trackId);

    const all62Ids = [...pilotIds, ...batchIds];
    console.log('Total reorganized tracks to verify:', all62Ids.length);

    // Note: b1d223b66897 is in _duplicates, so it should NOT be in R2 library!
    // And 62a7ccbe277b is the retained active version of Muốn Nói Với Em
    const foundInR2 = all62Ids.filter((id) => r2Ids.has(id));
    console.log('Found in R2 library count:', foundInR2.length);

    const missingInR2 = all62Ids.filter((id) => !r2Ids.has(id));
    console.log('Missing in R2 library:', missingInR2);

    for (const mId of missingInR2) {
      console.log('Missing ID details:', mId);
    }
  } catch (err) {
    console.error('Error fetching R2 library:', err);
  }
}

main();
