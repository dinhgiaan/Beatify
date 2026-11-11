import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { OverridesSchema, type Overrides, type TrackOverride, normalizeText } from '@music-app/shared';
import type { ScannedTrack } from './scanner';

const OVERRIDES_FILE = process.cwd().endsWith('indexer')
  ? path.resolve(process.cwd(), 'overrides.json')
  : path.resolve(process.cwd(), 'tools/indexer/overrides.json');

export async function getOverrides(): Promise<Overrides> {
  if (!existsSync(OVERRIDES_FILE)) {
    return { version: 1, tracks: {}, artistAliases: {} };
  }
  try {
    const raw = await fs.readFile(OVERRIDES_FILE, 'utf-8');
    const data = JSON.parse(raw);
    const parsed = OverridesSchema.safeParse(data);
    if (parsed.success) {
      return parsed.data;
    }
    return { version: 1, tracks: {}, artistAliases: {} };
  } catch {
    return { version: 1, tracks: {}, artistAliases: {} };
  }
}

let saveOverridesQueue: Promise<void> = Promise.resolve();

async function safeAtomicWrite(targetPath: string, content: string): Promise<void> {
  const dir = path.dirname(targetPath);
  const tmpPath = path.join(dir, `${path.basename(targetPath)}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  await fs.writeFile(tmpPath, content, 'utf-8');
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await fs.rename(tmpPath, targetPath);
      return;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if ((code === 'EPERM' || code === 'EBUSY') && attempt < 6) {
        await new Promise((r) => setTimeout(r, 60 * Math.pow(1.5, attempt)));
        continue;
      }
      try {
        await fs.copyFile(tmpPath, targetPath);
        await fs.unlink(tmpPath).catch(() => {});
        return;
      } catch {
        throw err;
      }
    }
  }
}

export async function saveOverrides(overrides: Overrides): Promise<void> {
  saveOverridesQueue = saveOverridesQueue.then(async () => {
    await safeAtomicWrite(OVERRIDES_FILE, JSON.stringify(overrides, null, 2));
  });
  return saveOverridesQueue;
}

export async function setTrackOverride(
  trackId: string,
  override: TrackOverride
): Promise<Overrides> {
  const current = await getOverrides();
  current.tracks[trackId] = {
    ...current.tracks[trackId],
    ...override,
  };
  await saveOverrides(current);
  return current;
}

export async function moveToTrash(trackId: string): Promise<Overrides> {
  const current = await getOverrides();
  current.tracks[trackId] = {
    ...current.tracks[trackId],
    hidden: true,
    deletedAt: new Date().toISOString(),
  };
  await saveOverrides(current);
  return current;
}

export async function restoreFromTrash(trackId: string): Promise<Overrides> {
  const current = await getOverrides();
  if (current.tracks[trackId]) {
    current.tracks[trackId].hidden = false;
    current.tracks[trackId].purged = false;
    delete current.tracks[trackId].deletedAt;
    delete current.tracks[trackId].purgedAt;
  }
  await saveOverrides(current);
  return current;
}

export async function batchRestoreFromTrash(trackIds?: string[]): Promise<Overrides> {
  const current = await getOverrides();
  const idsToRestore = trackIds && trackIds.length > 0
    ? trackIds
    : Object.keys(current.tracks).filter((id) => current.tracks[id]?.hidden && !current.tracks[id]?.purged);

  for (const id of idsToRestore) {
    if (current.tracks[id]) {
      current.tracks[id].hidden = false;
      current.tracks[id].purged = false;
      delete current.tracks[id].deletedAt;
      delete current.tracks[id].purgedAt;
    }
  }
  await saveOverrides(current);
  return current;
}

export async function purgeFromTrash(trackId: string): Promise<Overrides> {
  const current = await getOverrides();
  current.tracks[trackId] = {
    ...current.tracks[trackId],
    hidden: true,
    purged: true,
    purgedAt: new Date().toISOString(),
  };
  await saveOverrides(current);
  return current;
}

export async function batchPurgeFromTrash(trackIds?: string[]): Promise<Overrides> {
  const current = await getOverrides();
  const idsToPurge = trackIds && trackIds.length > 0
    ? trackIds
    : Object.keys(current.tracks).filter((id) => current.tracks[id]?.hidden && !current.tracks[id]?.purged);

  const now = new Date().toISOString();
  for (const id of idsToPurge) {
    current.tracks[id] = {
      ...current.tracks[id],
      hidden: true,
      purged: true,
      purgedAt: now,
    };
  }
  await saveOverrides(current);
  return current;
}

export function applyOverridesToScanned(
  scanned: ScannedTrack[],
  overrides: Overrides
): ScannedTrack[] {
  const result: ScannedTrack[] = [];

  for (const item of scanned) {
    const ov = overrides.tracks[item.track.id];
    if (ov?.hidden || ov?.purged) {
      // Bỏ qua nếu đánh dấu ẩn hoặc nằm trong thùng rác hoặc đã hủy vĩnh viễn
      continue;
    }

    const updatedTrack = { ...item.track };
    let metadataChanged = false;

    if (ov) {
      if (ov.title) updatedTrack.title = ov.title;
      if (ov.artist) {
        updatedTrack.artist = ov.artist;
        metadataChanged = true;
      }
      if (ov.album !== undefined) {
        updatedTrack.album = ov.album;
        metadataChanged = true;
      }
      if (ov.year !== undefined) updatedTrack.year = ov.year;
      if (ov.trackNumber !== undefined) updatedTrack.trackNumber = ov.trackNumber;
      if (ov.loudnessLufs !== undefined) updatedTrack.loudnessLufs = ov.loudnessLufs;
      if (ov.replayGain !== undefined) updatedTrack.replayGain = ov.replayGain;
    }

    // Áp dụng gộp nghệ sĩ từ artistAliases nếu có
    if (overrides.artistAliases) {
      const normalizedCurrent = normalizeText(updatedTrack.artist);
      const aliasTarget = overrides.artistAliases[normalizedCurrent];
      if (aliasTarget && aliasTarget !== updatedTrack.artist) {
        updatedTrack.artist = aliasTarget;
        metadataChanged = true;
      }
    }

    // Cập nhật lại albumId nếu có thay đổi ca sĩ hoặc album
    if (metadataChanged) {
      const albumArtist = updatedTrack.artist || 'Unknown Artist';
      const albumTitle = updatedTrack.album || 'Single';
      const albumKey = `${normalizeText(albumArtist)}|${normalizeText(albumTitle)}`;
      updatedTrack.albumId = crypto.createHash('sha1').update(albumKey).digest('hex').slice(0, 12);
      if (updatedTrack.cover) {
        updatedTrack.cover = `covers/${updatedTrack.albumId}.jpg`;
      }
    }

    result.push({
      ...item,
      track: updatedTrack,
    });
  }

  return result;
}

export async function setArtistAliases(
  targetArtist: string,
  sourceArtists: string[]
): Promise<Overrides> {
  const current = await getOverrides();
  current.artistAliases = current.artistAliases || {};

  for (const src of sourceArtists) {
    const norm = normalizeText(src);
    if (norm && src.trim() !== targetArtist.trim()) {
      current.artistAliases[norm] = targetArtist.trim();
    }
  }

  await saveOverrides(current);
  return current;
}

export async function mergeRemoteOverrides(remote: Overrides): Promise<Overrides> {
  const local = await getOverrides();
  const merged: Overrides = {
    version: 1,
    tracks: {
      ...local.tracks,
      ...remote.tracks,
    },
    artistAliases: {
      ...(local.artistAliases || {}),
      ...(remote.artistAliases || {}),
    },
  };
  await saveOverrides(merged);
  return merged;
}

