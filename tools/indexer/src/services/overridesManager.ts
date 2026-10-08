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
    return { version: 1, tracks: {} };
  }
  try {
    const raw = await fs.readFile(OVERRIDES_FILE, 'utf-8');
    const data = JSON.parse(raw);
    const parsed = OverridesSchema.safeParse(data);
    if (parsed.success) {
      return parsed.data;
    }
    return { version: 1, tracks: {} };
  } catch {
    return { version: 1, tracks: {} };
  }
}

export async function saveOverrides(overrides: Overrides): Promise<void> {
  const tmpFile = `${OVERRIDES_FILE}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(overrides, null, 2), 'utf-8');
  await fs.rename(tmpFile, OVERRIDES_FILE);
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

    if (ov) {
      const updatedTrack = { ...item.track };
      if (ov.title) updatedTrack.title = ov.title;
      if (ov.artist) updatedTrack.artist = ov.artist;
      if (ov.album !== undefined) updatedTrack.album = ov.album;
      if (ov.year !== undefined) updatedTrack.year = ov.year;
      if (ov.trackNumber !== undefined) updatedTrack.trackNumber = ov.trackNumber;

      // Cập nhật lại albumId nếu có thay đổi ca sĩ hoặc album
      if (ov.artist || ov.album) {
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
    } else {
      result.push(item);
    }
  }

  return result;
}

export async function mergeRemoteOverrides(remote: Overrides): Promise<Overrides> {
  const local = await getOverrides();
  const merged: Overrides = {
    version: 1,
    tracks: {
      ...local.tracks,
      ...remote.tracks,
    },
  };
  await saveOverrides(merged);
  return merged;
}

