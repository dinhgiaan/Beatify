export class ApiError extends Error {
  code: string;
  detail?: string;

  constructor(message: string, code = 'API_ERROR', detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.detail = detail;
  }
}

export async function requestApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});

  headers.set('X-Requested-With', 'XMLHttpRequest');

  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/csv')) {
    return (await response.text()) as unknown as T;
  }

  let json: Record<string, unknown>;
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError('Không thể giải mã phản hồi từ server', 'INVALID_RESPONSE');
  }

  // Hỗ trợ cả 2 chuẩn response:
  // 1) { status: 'success' | 'error', message, data, error }
  // 2) { status: 200 | 400 | 500, message, data, error }
  const isOk =
    response.ok &&
    (json.status === 'success' ||
      (typeof json.status === 'number' && json.status >= 200 && json.status < 300) ||
      json.status === undefined);

  if (!isOk) {
    const errorObj = json.error as { message?: string; detail?: string; code?: string } | undefined;
    const errorMsg =
      (typeof json.error === 'string' ? json.error : errorObj?.message || errorObj?.detail) ||
      (typeof json.message === 'string' ? json.message : 'Yêu cầu không thành công');
    const errorCode = errorObj?.code || 'UNKNOWN_ERROR';
    throw new ApiError(errorMsg, errorCode);
  }

  return (json.data !== undefined ? json.data : json) as T;
}
