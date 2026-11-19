import { S3Client, GetObjectCommand } from '../tools/indexer/node_modules/@aws-sdk/client-s3/dist-es/index.js';
import fs from 'fs';

const env = fs.readFileSync('tools/indexer/.env', 'utf-8');
const lines = env.split('\n');
const getVal = (k) => {
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

try {
  const res = await s3.send(new GetObjectCommand({ Bucket: getVal('R2_BUCKET'), Key: '_meta/library.json' }));
  const str = await res.Body.transformToString();
  const r2Lib = JSON.parse(str);
  console.log('R2 library tracks count:', r2Lib.tracks.length);
  console.log('R2 library albums count:', r2Lib.albums.length);

  const localLib = JSON.parse(fs.readFileSync('tools/indexer/library.json', 'utf-8'));
  console.log('Local library tracks count:', localLib.tracks.length);
  console.log('Local library albums count:', localLib.albums.length);

  const r2Ids = new Set(r2Lib.tracks.map((t) => t.id));
  const localIds = new Set(localLib.tracks.map((t) => t.id));

  const matched = [...localIds].filter((id) => r2Ids.has(id)).length;
  console.log('Local IDs in R2:', matched);

  const missingFromR2 = [...localIds].filter((id) => !r2Ids.has(id));
  console.log('Local IDs missing from R2:', missingFromR2);

  const missingFromLocal = [...r2Ids].filter((id) => !localIds.has(id));
  console.log('R2 IDs missing from Local:', missingFromLocal);

  // Check the 62 reorganized tracks
  const manifest = fs.readFileSync('scratch/manifest.csv', 'utf-8');
  const manifestLines = manifest.split('\n').filter(Boolean).slice(1);
  const reorganizedIds = manifestLines.map(l => l.split(',')[0].trim().replace(/^"|"$/g, '')).filter(Boolean);
  console.log('Total reorganized IDs in manifest:', reorganizedIds.length);

  const reorganizedInR2 = reorganizedIds.filter(id => r2Ids.has(id));
  console.log('Reorganized IDs found in R2 library:', reorganizedInR2.length);

  const reorganizedMissingFromR2 = reorganizedIds.filter(id => !r2Ids.has(id));
  console.log('Reorganized IDs missing from R2 library:', reorganizedMissingFromR2);

  // Detail for the missing ones if any
  for (const mid of reorganizedMissingFromR2) {
    console.log('Missing reorganized ID:', mid);
  }
} catch (err) {
  console.error('Error fetching R2 library:', err);
}

