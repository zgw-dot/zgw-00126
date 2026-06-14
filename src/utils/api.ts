const BASE_URL = '/api'

function getToken(): string | null {
  return localStorage.getItem('token')
}

interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
  message?: string
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '请求失败' }))
    throw new Error(error.error || error.message || `请求失败: ${response.status}`)
  }

  if (response.headers.get('content-type')?.includes('text/csv')) {
    return response.text() as unknown as T
  }

  const result = await response.json() as ApiResponse<T>
  if (result.success === false) {
    throw new Error(result.error || '请求失败')
  }
  return result.data
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),

  post: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  put: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),

  delete: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: 'DELETE',
      body: data ? JSON.stringify(data) : undefined,
    }),

  download: async (endpoint: string, filename: string) => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${BASE_URL}${endpoint}`, { headers });
    if (!response.ok) throw new Error('下载失败');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },

  uploadCsv: async <T>(endpoint: string, csvText: string): Promise<T> => {
    const token = getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ csv: csvText }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '上传失败' }))
      throw new Error(error.error || error.message || '上传失败')
    }
    const result = await response.json() as ApiResponse<T>
    if (result.success === false) {
      throw new Error(result.error || '上传失败')
    }
    return result.data
  },
}
