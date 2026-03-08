export const API_TOKEN_STORAGE_KEY = 'pulse-auth-token';

const JSON_CONTENT_TYPE = 'application/json';
const AUTH_PATH_PREFIX = '/api/v1/auth/';

export interface ApiRequestInit extends Omit<RequestInit, 'body'> {
  body?: BodyInit | Record<string, unknown> | unknown[] | null;
}

interface ApiSuccessEnvelope<T> {
  data: T;
}

interface ApiSuccessEnvelopeWithMeta<T, M> {
  data: T;
  meta: M;
}

interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
  };
}

interface DevAuthPayload {
  username: string;
  password: string;
  name?: string;
}

interface DevAuthResponse {
  token: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

let devSessionPromise: Promise<string> | null = null;

function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? '';
}

function getEnvToken(): string | null {
  return import.meta.env.VITE_PULSE_JWT_TOKEN || null;
}

function isDevMode(): boolean {
  return Boolean(import.meta.env.DEV);
}

function getDevCredentials(): DevAuthPayload {
  return {
    username: import.meta.env.VITE_PULSE_DEV_USERNAME ?? 'pulse-dev',
    password: import.meta.env.VITE_PULSE_DEV_PASSWORD ?? 'pulse-dev-password',
    name: import.meta.env.VITE_PULSE_DEV_NAME ?? 'Pulse Dev',
  };
}

function normalizePath(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  return path.startsWith('/') ? path : `/${path}`;
}

function buildUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const normalizedPath = normalizePath(path);
  const baseUrl = getApiBaseUrl().replace(/\/$/, '');

  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}

function getStoredToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(API_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore storage failures so requests can still proceed with in-memory auth.
  }
}

function clearStoredToken(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage failures so error handling still completes.
  }
}

function isRawBody(body: ApiRequestInit['body']): body is BodyInit {
  if (body == null) {
    return false;
  }

  if (typeof body === 'string') {
    return true;
  }

  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return true;
  }

  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return true;
  }

  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return true;
  }

  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return true;
  }

  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    return true;
  }

  return false;
}

async function parseJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function createDevSession(): Promise<string> {
  const credentials = getDevCredentials();
  const registerResponse = await fetch(buildUrl('/api/v1/auth/register'), {
    method: 'POST',
    headers: {
      'Content-Type': JSON_CONTENT_TYPE,
    },
    body: JSON.stringify(credentials),
  });

  if (registerResponse.ok) {
    const payload = await parseJson<ApiSuccessEnvelope<DevAuthResponse>>(registerResponse);
    const token = payload?.data.token;

    if (!token) {
      throw new ApiError(registerResponse.status, 'Missing token in auth response');
    }

    setStoredToken(token);
    return token;
  }

  if (registerResponse.status !== 409) {
    throw await toApiError(registerResponse);
  }

  const loginResponse = await fetch(buildUrl('/api/v1/auth/login'), {
    method: 'POST',
    headers: {
      'Content-Type': JSON_CONTENT_TYPE,
    },
    body: JSON.stringify({
      username: credentials.username,
      password: credentials.password,
    }),
  });

  if (!loginResponse.ok) {
    throw await toApiError(loginResponse);
  }

  const payload = await parseJson<ApiSuccessEnvelope<DevAuthResponse>>(loginResponse);
  const token = payload?.data.token;

  if (!token) {
    throw new ApiError(loginResponse.status, 'Missing token in auth response');
  }

  setStoredToken(token);
  return token;
}

async function resolveSessionToken(options?: {
  allowDevAutoSession?: boolean;
}): Promise<string | null> {
  const envToken = getEnvToken();
  if (envToken) {
    return envToken;
  }

  const storedToken = getStoredToken();
  if (storedToken) {
    return storedToken;
  }

  if (!options?.allowDevAutoSession || !isDevMode()) {
    return null;
  }

  if (!devSessionPromise) {
    devSessionPromise = createDevSession().finally(() => {
      devSessionPromise = null;
    });
  }

  return devSessionPromise;
}

async function toApiError(response: Response): Promise<ApiError> {
  const payload = await parseJson<ApiErrorEnvelope>(response);
  const code = payload?.error?.code;
  const message = payload?.error?.message ?? `Request failed with status ${response.status}`;

  if (response.status === 401) {
    clearStoredToken();
  }

  return new ApiError(response.status, message, code);
}

function createRequestInit(init: ApiRequestInit | undefined, token: string | null): RequestInit {
  const headers = new Headers(init?.headers);
  let body = init?.body;

  if (body != null) {
    if (isRawBody(body)) {
      if (!headers.has('Content-Type') && typeof body === 'string') {
        headers.set('Content-Type', JSON_CONTENT_TYPE);
      }
    } else {
      headers.set('Content-Type', headers.get('Content-Type') ?? JSON_CONTENT_TYPE);
      body = JSON.stringify(body);
    }
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return {
    ...init,
    headers,
    body: body ?? undefined,
  };
}

async function performRequest<T>(path: string, init?: ApiRequestInit): Promise<T> {
  const token = await resolveSessionToken({
    allowDevAutoSession: !normalizePath(path).startsWith(AUTH_PATH_PREFIX),
  });
  const response = await fetch(buildUrl(path), createRequestInit(init, token));

  if (!response.ok) {
    throw await toApiError(response);
  }

  const payload = await parseJson<T>(response);

  if (payload == null) {
    throw new ApiError(response.status, 'Missing response payload');
  }

  return payload;
}

export async function getSessionToken(): Promise<string> {
  return (await resolveSessionToken({ allowDevAutoSession: true })) ?? '';
}

export async function apiRequest<T>(path: string, init?: ApiRequestInit): Promise<T> {
  const payload = await performRequest<ApiSuccessEnvelope<T>>(path, init);
  return payload.data;
}

export async function apiRequestWithMeta<T, M>(
  path: string,
  init?: ApiRequestInit,
): Promise<{ data: T; meta: M }> {
  const payload = await performRequest<ApiSuccessEnvelopeWithMeta<T, M>>(path, init);
  return {
    data: payload.data,
    meta: payload.meta,
  };
}
