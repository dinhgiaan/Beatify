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
    const res = await s3.send(new GetObjectCommand({ Bucket: getVal('R2_BUCKET'), Key: '_meta/state.json' }));
    const str = await res.Body!.transformToString();
    const state = JSON.parse(str);

    console.log('Playlists count:', state.playlists ? state.playlists.length : 0);
    console.log('Favorites count:', state.favorites ? state.favorites.length : 0);

    const chillPlaylist = state.playlists.find((p: any) => p.name === 'chill chill ha');
    if (chillPlaylist) {
      console.log('chill chill ha trackIds:', chillPlaylist.trackIds);
      const hasDuplicate = chillPlaylist.trackIds.includes('b1d223b66897');
      const hasRetained = chillPlaylist.trackIds.includes('62a7ccbe277b');
      console.log('Contains duplicate b1d223b66897:', hasDuplicate);
      console.log('Contains retained 62a7ccbe277b:', hasRetained);
    } else {
      console.log('chill chill ha playlist not found!');
    }

    // Check all playlists for b1d223b66897
    for (const pl of state.playlists || []) {
      if (pl.trackIds.includes('b1d223b66897')) {
        console.log(`Playlist "${pl.name}" contains duplicate b1d223b66897`);
      }
    }
    // Check favorites
    if (state.favorites && state.favorites.includes('b1d223b66897')) {
      console.log('Favorites contains duplicate b1d223b66897');
    }

    // Check if any other playlist has IDs not in R2 library
    const libRes = await s3.send(new GetObjectCommand({ Bucket: getVal('R2_BUCKET'), Key: 'library.json' }));
    const libStr = await libRes.Body!.transformToString();
    const lib = JSON.parse(libStr);
    const validIds = new Set(lib.tracks.map((t: any) => t.id));

    const orphanInPlaylists: Record<string, string[]> = {};
    for (const pl of state.playlists || []) {
      const orphans = pl.trackIds.filter((id: string) => !validIds.has(id));
      if (orphans.length > 0) {
        orphanInPlaylists[pl.name] = orphans;
      }
    }
    console.log('Orphans in playlists:', orphanInPlaylists);

    const orphanFavorites = (state.favorites || []).filter((id: string) => !validIds.has(id));
    console.log('Orphan favorites:', orphanFavorites);
  } catch (err) {
    console.error('Error:', err);
  }
}

main();

