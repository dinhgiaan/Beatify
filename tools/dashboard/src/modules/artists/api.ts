import { requestApi } from '../../core/api-client';

export interface ArtistAlbum {
  id: string;
  title: string;
  year?: number;
  trackCount: number;
  hasCover: boolean;
  isSingle?: boolean;
}

export interface ArtistTrack {
  id: string;
  albumId?: string;
  title: string;
  album: string;
  duration: number;
  year?: number;
  format: string;
  hasCover: boolean;
  filePath: string;
  isSynced?: boolean;
}

export interface ArtistDetail {
  name: string;
  trackCount: number;
  albumCount: number;
  singleCount?: number;
  totalDuration: number;
  hasAvatar: boolean;
  avatarUrl: string;
  folderPath: string | null;
  albums: ArtistAlbum[];
  singles?: ArtistAlbum[];
  tracks: ArtistTrack[];
}

export interface ArtistsResponse {
  status: number;
  totalArtists: number;
  artists: ArtistDetail[];
}

export async function fetchArtistsApi(): Promise<ArtistsResponse> {
  return requestApi<ArtistsResponse>('/local-api/artists');
}

export async function updateArtistAvatarApi(artistName: string, url: string): Promise<{ status: number; message: string; avatarUrl: string }> {
  return requestApi<{ status: number; message: string; avatarUrl: string }>(
    `/local-api/artists/${encodeURIComponent(artistName)}/avatar`,
    {
      method: 'POST',
      body: JSON.stringify({ url }),
    }
  );
}

export async function mergeArtistsApi(targetArtist: string, sourceArtists: string[]): Promise<{ status: number; message: string }> {
  return requestApi<{ status: number; message: string }>('/local-api/artists/merge', {
    method: 'POST',
    body: JSON.stringify({ targetArtist, sourceArtists }),
  });
}

export async function openArtistFolderApi(artistName: string, folderPath?: string | null): Promise<{ status: number; message: string; folderPath?: string }> {
  return requestApi<{ status: number; message: string; folderPath?: string }>(
    `/local-api/artists/${encodeURIComponent(artistName)}/open-folder`,
    {
      method: 'POST',
      body: JSON.stringify({ folderPath }),
    }
  );
}
