import type { Library, Track, UpdateTrack, ApiResponse } from '@music-app/shared';

export interface ApiClientConfig {
  baseUrl: string;
  token?: string;
}

export class MusicApiClient {
  private baseUrl: string;
  private token?: string;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.token = config.token;
  }

  setToken(token?: string) {
    this.token = token;
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async fetchLibrary(): Promise<Library> {
    const res = await fetch(`${this.baseUrl}/api/library`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      throw new Error(errBody?.message || `Lỗi tải thư viện (${res.status})`);
    }

    const json = (await res.json()) as ApiResponse<Library>;
    if (!json.data) throw new Error('Dữ liệu thư viện trống');
    return json.data;
  }

  async updateTrack(id: string, updates: UpdateTrack): Promise<Track> {
    const res = await fetch(`${this.baseUrl}/api/tracks/${id}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      throw new Error(errBody?.message || `Lỗi cập nhật bài hát (${res.status})`);
    }

    const json = (await res.json()) as ApiResponse<Track>;
    if (!json.data) throw new Error('Không nhận được dữ liệu bài hát cập nhật');
    return json.data;
  }

  async deleteTrack(id: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/tracks/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      throw new Error(errBody?.message || `Lỗi xóa bài hát (${res.status})`);
    }

    const json = (await res.json()) as ApiResponse<{ id: string }>;
    return json.data?.id || id;
  }
}
