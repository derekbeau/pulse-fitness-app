import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_TOKEN_STORAGE_KEY, ApiError, apiRequest } from '@/lib/api-client';
import { createAppQueryClient } from '@/lib/query-client';
import { AUTH_STORAGE_KEY, useAuthStore } from './auth-store';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');

  return {
    ...actual,
    apiRequest: vi.fn(),
  };
});

function resetAuthStore(): void {
  useAuthStore.setState({
    user: null,
    token: null,
    isAuthenticated: false,
    hasHydrated: false,
    isLoading: false,
    error: null,
  });
}

describe('auth-store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    createAppQueryClient().clear();
    useAuthStore.persist.clearStorage();
    resetAuthStore();
    vi.mocked(apiRequest).mockReset();
  });

  it('login calls the API, stores the token, and sets the user state', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      token: 'token-1',
      user: {
        id: 'user-1',
        username: 'derek',
        name: 'Derek',
      },
    });

    await useAuthStore.getState().login({
      username: ' Derek ',
      password: 'super-secret-password',
    });

    expect(apiRequest).toHaveBeenCalledWith('/api/v1/auth/login', {
      method: 'POST',
      body: {
        username: 'derek',
        password: 'super-secret-password',
      },
    });
    expect(useAuthStore.getState()).toMatchObject({
      token: 'token-1',
      user: {
        id: 'user-1',
        username: 'derek',
        name: 'Derek',
      },
      isAuthenticated: true,
      hasHydrated: true,
      isLoading: false,
      error: null,
    });
    expect(window.localStorage.getItem(API_TOKEN_STORAGE_KEY)).toBe('token-1');
  });

  it('login sets the error state when the API request fails', async () => {
    const error = new ApiError(401, 'Invalid username or password', 'INVALID_CREDENTIALS');
    vi.mocked(apiRequest).mockRejectedValue(error);

    await expect(
      useAuthStore.getState().login({
        username: 'derek',
        password: 'bad-password',
      }),
    ).rejects.toBe(error);

    expect(useAuthStore.getState()).toMatchObject({
      token: null,
      user: null,
      isAuthenticated: false,
      hasHydrated: false,
      isLoading: false,
      error: 'Invalid username or password',
    });
  });

  it('register calls the API, stores the token, and sets the user state', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      token: 'token-2',
      user: {
        id: 'user-2',
        username: 'pulse-user',
        name: 'Pulse User',
      },
    });

    await useAuthStore.getState().register({
      username: ' Pulse-User ',
      password: 'super-secret-password',
      name: ' Pulse User ',
    });

    expect(apiRequest).toHaveBeenCalledWith('/api/v1/auth/register', {
      method: 'POST',
      body: {
        username: 'pulse-user',
        password: 'super-secret-password',
        name: 'Pulse User',
      },
    });
    expect(useAuthStore.getState()).toMatchObject({
      token: 'token-2',
      user: {
        id: 'user-2',
        username: 'pulse-user',
        name: 'Pulse User',
      },
      isAuthenticated: true,
      hasHydrated: true,
      isLoading: false,
      error: null,
    });
    expect(window.localStorage.getItem(API_TOKEN_STORAGE_KEY)).toBe('token-2');
  });

  it('logout clears token, user state, localStorage, and query cache', () => {
    createAppQueryClient().setQueryData(['profile'], { id: 'user-1' });
    useAuthStore.setState({
      user: {
        id: 'user-1',
        username: 'derek',
        name: 'Derek',
      },
      token: 'token-1',
      isAuthenticated: true,
      hasHydrated: true,
      isLoading: false,
      error: null,
    });
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'token-1');

    useAuthStore.getState().logout();

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      token: null,
      isAuthenticated: false,
      hasHydrated: true,
      isLoading: false,
      error: null,
    });
    expect(window.localStorage.getItem(API_TOKEN_STORAGE_KEY)).toBeNull();
    expect(createAppQueryClient().getQueryData(['profile'])).toBeUndefined();
  });

  it('hydrate restores persisted auth state from localStorage', async () => {
    resetAuthStore();
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'persisted-token');
    window.localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        state: {
          token: 'persisted-token',
          user: {
            id: 'user-3',
            username: 'persisted-user',
            name: null,
          },
        },
        version: 0,
      }),
    );

    await useAuthStore.persist.rehydrate();

    expect(useAuthStore.getState()).toMatchObject({
      token: 'persisted-token',
      user: {
        id: 'user-3',
        username: 'persisted-user',
        name: null,
      },
      isAuthenticated: true,
      hasHydrated: true,
      isLoading: false,
    });
  });

  it('derives isAuthenticated from whether a token exists', () => {
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'token-3');
    resetAuthStore();

    useAuthStore.getState().hydrate();

    expect(useAuthStore.getState()).toMatchObject({
      token: 'token-3',
      isAuthenticated: true,
      hasHydrated: true,
    });

    useAuthStore.getState().logout();

    expect(useAuthStore.getState()).toMatchObject({
      token: null,
      isAuthenticated: false,
      hasHydrated: true,
    });
  });
});
