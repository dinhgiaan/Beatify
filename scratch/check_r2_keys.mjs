import { S3Client, HeadObjectCommand } from '../tools/indexer/node_modules/@aws-sdk/client-s3/dist-es/index.js';
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

for (const id of ['62a7ccbe277b', 'b1d223b66897', '88c676f27218']) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: getVal('R2_BUCKET'), Key: 'music/' + id + '.m4a' }));
    console.log(id, 'EXISTS on R2!');
  } catch (err) {
    console.log(id, 'NOT on R2:', err.name);
  }
}

