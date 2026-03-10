import { clearStoredAuthState, getStoredToken, setStoredToken } from './auth-storage';

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

export { API_TOKEN_STORAGE_KEY } from './auth-storage';

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
  const username = import.meta.env.VITE_PULSE_DEV_USERNAME;
  const password = import.meta.env.VITE_PULSE_DEV_PASSWORD;

  if (!username || !password) {
    throw new Error(
      'VITE_PULSE_DEV_USERNAME and VITE_PULSE_DEV_PASSWORD must be set for dev auto-session',
    );
  }

  return {
    username,
    password,
    name: import.meta.env.VITE_PULSE_DEV_NAME ?? username,
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
  return toApiErrorFromPayload(response.status, payload);
}

function toApiErrorFromPayload(status: number, payload: ApiErrorEnvelope | null): ApiError {
  const code = payload?.error?.code;
  const message = payload?.error?.message ?? `Request failed with status ${status}`;

  if (status === 401) {
    clearStoredAuthState();
  }

  return new ApiError(status, message, code);
}

function shouldRecoverStaleUserSession(
  path: string,
  status: number,
  payload: ApiErrorEnvelope | null,
): boolean {
  return normalizePath(path) === '/api/v1/users/me' && status === 404 && payload?.error?.code === 'NOT_FOUND';
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

async function performRequest<T>(path: string, init?: ApiRequestInit): Promise<T | null> {
  const token = await resolveSessionToken({
    allowDevAutoSession: !normalizePath(path).startsWith(AUTH_PATH_PREFIX),
  });
  const allowDevAutoSession = !normalizePath(path).startsWith(AUTH_PATH_PREFIX);
  let response = await fetch(buildUrl(path), createRequestInit(init, token));

  if (!response.ok && !getEnvToken()) {
    const payload = await parseJson<ApiErrorEnvelope>(response);

    if (shouldRecoverStaleUserSession(path, response.status, payload) && token) {
      clearStoredAuthState();
      const refreshedToken = await resolveSessionToken({ allowDevAutoSession });

      if (refreshedToken && refreshedToken !== token) {
        response = await fetch(buildUrl(path), createRequestInit(init, refreshedToken));
      } else {
        throw toApiErrorFromPayload(response.status, payload);
      }
    } else {
      throw toApiErrorFromPayload(response.status, payload);
    }
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  const payload = await parseJson<T>(response);

  if (payload == null) {
    if (response.status === 204 || response.status === 205) {
      return null;
    }

    throw new ApiError(response.status, 'Missing response payload');
  }

  return payload;
}

export async function getSessionToken(): Promise<string> {
  return (await resolveSessionToken({ allowDevAutoSession: true })) ?? '';
}

export async function apiRequest<T>(path: string, init?: ApiRequestInit): Promise<T> {
  const payload = await performRequest<ApiSuccessEnvelope<T>>(path, init);
  return payload?.data ?? (null as T);
}

export async function apiRequestWithMeta<T, M>(
  path: string,
  init?: ApiRequestInit,
): Promise<{ data: T; meta: M }> {
  const payload = await performRequest<ApiSuccessEnvelopeWithMeta<T, M>>(path, init);

  if (payload == null) {
    return {
      data: null as T,
      meta: null as M,
    };
  }

  return {
    data: payload.data,
    meta: payload.meta,
  };
}
