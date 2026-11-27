let csrfTokenCache = '';

export function setCsrfToken(token: string | undefined) {
  if (token) csrfTokenCache = token;
}

export function getCsrfToken(): string {
  return csrfTokenCache;
}

export class ApiError extends Error {
  status: number;
  authRequired?: boolean;

  constructor(message: string, status: number, authRequired?: boolean) {
    super(message);
    this.status = status;
    this.authRequired = authRequired;
  }
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (csrfTokenCache && options.method && options.method.toUpperCase() !== 'GET') {
    headers.set('x-csrf-token', csrfTokenCache);
  }

  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers,
  });

  if (response.status === 204) {
    return {} as T;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      data?.error || data?.message || `Erro HTTP ${response.status}`,
      response.status,
      data?.authRequired
    );
  }

  if (data?.csrfToken) {
    setCsrfToken(data.csrfToken);
  }

  return data as T;
}
