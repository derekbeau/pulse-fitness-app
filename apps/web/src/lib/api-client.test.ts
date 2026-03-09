import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_TOKEN_STORAGE_KEY, ApiError, apiRequest } from './api-client';
import { AUTH_STORAGE_KEY } from './auth-storage';

describe('api-client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('DEV', false);
    window.localStorage.clear();
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends GET requests to the resolved URL with the auth header when a token exists', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.pulse.test');
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'jwt-123');
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 'habit-1' } }), {
        status: 200,
      }),
    );

    const response = await apiRequest<{ id: string }>('/api/v1/habits/habit-1');

    expect(response).toEqual({ id: 'habit-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);

    expect(url).toBe('https://api.pulse.test/api/v1/habits/habit-1');
    expect(headers.get('Authorization')).toBe('Bearer jwt-123');
  });

  it('sends POST requests with a JSON body and content-type header', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { token: 'jwt-123' } }), {
        status: 200,
      }),
    );

    await apiRequest<{ token: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: {
        username: 'derek',
        password: 'super-secret-password',
      },
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);

    expect(init?.method).toBe('POST');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(init?.body).toBe(
      JSON.stringify({
        username: 'derek',
        password: 'super-secret-password',
      }),
    );
  });

  it('omits the auth header when there is no stored token', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
      }),
    );

    await apiRequest<{ ok: boolean }>('/api/v1/profile');

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);

    expect(headers.has('Authorization')).toBe(false);
  });

  it('throws ApiError with the backend code and message for non-2xx responses', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid username or password',
          },
        }),
        { status: 401 },
      ),
    );

    await expect(apiRequest('/api/v1/auth/login')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid username or password',
    } satisfies Partial<ApiError>);
  });

  it('throws a status-based ApiError when a non-2xx response is not JSON', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html><body>Server error</body></html>', {
        headers: { 'Content-Type': 'text/html' },
        status: 500,
      }),
    );

    await expect(apiRequest('/api/v1/profile')).rejects.toMatchObject({
      status: 500,
      message: 'Request failed with status 500',
    } satisfies Partial<ApiError>);
  });

  it('clears the stored token on 401 responses', async () => {
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'expired-token');
    window.localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        state: {
          token: 'expired-token',
          user: {
            id: 'user-1',
            username: 'derek',
            name: 'Derek',
          },
        },
        version: 0,
      }),
    );
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid username or password',
          },
        }),
        { status: 401 },
      ),
    );

    await expect(apiRequest('/api/v1/profile')).rejects.toBeInstanceOf(ApiError);

    expect(window.localStorage.getItem(API_TOKEN_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('unwraps the data envelope', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { userId: 'user-1' } }), {
        status: 200,
      }),
    );

    const payload = await apiRequest<{ userId: string }>('/api/v1/profile');

    expect(payload).toEqual({ userId: 'user-1' });
  });

  it('auto-registers a dev user when no token exists in DEV mode', async () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_PULSE_DEV_USERNAME', 'pulse-dev');
    vi.stubEnv('VITE_PULSE_DEV_PASSWORD', 'pulse-dev-password');
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { token: 'dev-token' } }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 'habit-1' }] }), {
          status: 200,
        }),
      );

    const payload = await apiRequest<Array<{ id: string }>>('/api/v1/habits');

    expect(payload).toEqual([{ id: 'habit-1' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/auth/register');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        username: 'pulse-dev',
        password: 'pulse-dev-password',
        name: 'pulse-dev',
      }),
    );
    expect(window.localStorage.getItem(API_TOKEN_STORAGE_KEY)).toBe('dev-token');

    const requestHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(requestHeaders.get('Authorization')).toBe('Bearer dev-token');
  });

  it('falls back to login when dev auto-register receives a 409', async () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_PULSE_DEV_USERNAME', 'pulse-dev');
    vi.stubEnv('VITE_PULSE_DEV_PASSWORD', 'pulse-dev-password');
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 'USERNAME_TAKEN',
              message: 'Username is already taken',
            },
          }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { token: 'login-token' } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: 'profile-1' } }), {
          status: 200,
        }),
      );

    const payload = await apiRequest<{ id: string }>('/api/v1/profile');

    expect(payload).toEqual({ id: 'profile-1' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/auth/register');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/auth/login');
    expect(window.localStorage.getItem(API_TOKEN_STORAGE_KEY)).toBe('login-token');

    const requestHeaders = new Headers(fetchMock.mock.calls[2]?.[1]?.headers);
    expect(requestHeaders.get('Authorization')).toBe('Bearer login-token');
  });

  it('allows empty success bodies for 204 responses', async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    );

    await expect(apiRequest<null>('/api/v1/auth/logout', { method: 'POST' })).resolves.toBeNull();
  });

  it('requires explicit dev auto-session credentials when running in DEV mode', async () => {
    vi.stubEnv('DEV', true);

    await expect(apiRequest('/api/v1/profile')).rejects.toThrow(
      'VITE_PULSE_DEV_USERNAME and VITE_PULSE_DEV_PASSWORD must be set for dev auto-session',
    );
  });
});
