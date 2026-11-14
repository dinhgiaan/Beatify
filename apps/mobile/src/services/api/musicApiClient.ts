import type { Library, Track, UpdateTrack, ApiResponse, UserState } from '@music-app/shared';

export interface ApiClientConfig {
  baseUrl: string;
  token?: string;
  timeoutMs?: number;
}

export interface FetchLibraryResult {
  notModified: boolean;
  data?: Library;
  etag?: string | null;
}

export class MusicApiClient {
  private baseUrl: string;
  private token?: string;
  private timeoutMs: number;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.token = config.token;
    this.timeoutMs = config.timeoutMs ?? 15000;
  }

  setToken(token?: string) {
    this.token = token;
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  setTimeoutMs(timeoutMs: number) {
    this.timeoutMs = timeoutMs;
  }

  private async fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return res;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Yêu cầu mạng hết thời gian chờ sau ${Math.round(this.timeoutMs / 1000)}s`, { cause: err });
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
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

  async fetchLibraryWithETag(etag?: string | null): Promise<FetchLibraryResult> {
    const headers = this.getHeaders();
    if (etag) {
      headers['If-None-Match'] = etag;
    }

      const res = await this.fetchWithTimeout(`${this.baseUrl}/api/library`, {
        method: 'GET',
        headers,
      });

      if(res.status === 304) {
        return { notModified: true, etag };
  }

  if(!res.ok) {
    const errBody = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
    throw new Error(errBody?.message || `Lỗi tải thư viện (${res.status})`);
  }

  const responseEtag = res.headers?.get ? (res.headers.get('ETag') || res.headers.get('etag')) : null;
  const json = (await res.json()) as ApiResponse<Library>;
  if(!json.data) throw new Error('Dữ liệu thư viện trống');

return {
  notModified: false,
  data: json.data,
  etag: responseEtag,
};
  }

  async fetchLibrary(): Promise < Library > {
  const result = await this.fetchLibraryWithETag(null);
  if(!result.data) throw new Error('Dữ liệu thư viện trống');
  return result.data;
}

  async updateTrack(id: string, updates: UpdateTrack): Promise < Track > {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/tracks/${id}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
    });

    if(!res.ok) {
  const errBody = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
  throw new Error(errBody?.message || `Lỗi cập nhật bài hát (${res.status})`);
}

const json = (await res.json()) as ApiResponse<Track>;
if (!json.data) throw new Error('Không nhận được dữ liệu bài hát cập nhật');
return json.data;
  }

  async deleteTrack(id: string): Promise < string > {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/tracks/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if(!res.ok) {
  const errBody = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
  throw new Error(errBody?.message || `Lỗi xóa bài hát (${res.status})`);
}

const json = (await res.json()) as ApiResponse<{ id: string }>;
return json.data?.id || id;
  }

  async fetchLyrics(id: string): Promise < string | null > {
  const timestamp = Date.now();
  const url = this.token
      ? `${this.baseUrl}/lyrics/${id}?t=${encodeURIComponent(this.token)}&_t=${timestamp}`
      : `${this.baseUrl}/lyrics/${id}?_t=${timestamp}`;
    const res = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });

    if(res.status === 404) return null;
  if(!res.ok) {
  throw new Error(`Lỗi tải lời bài hát (${res.status})`);
}

return await res.text();
  }

  async fetchUserState(): Promise < UserState > {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/state`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if(!res.ok) {
  const errBody = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
  throw new Error(errBody?.message || `Lỗi tải trạng thái (${res.status})`);
}

const json = (await res.json()) as ApiResponse<UserState>;
if (!json.data) throw new Error('Không nhận được dữ liệu trạng thái');
return json.data;
  }

  async saveUserState(state: UserState): Promise < UserState > {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/state`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(state),
    });

    if(!res.ok) {
  const errBody = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
  throw new Error(errBody?.message || `Lỗi lưu trạng thái (${res.status})`);
}

const json = (await res.json()) as ApiResponse<UserState>;
if (!json.data) throw new Error('Không nhận được dữ liệu trạng thái sau khi lưu');
return json.data;
  }
}

