import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-client';

const { logoutMock, toastErrorMock } = vi.hoisted(() => ({
  logoutMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
  },
}));

vi.mock('@/store/auth-store', () => ({
  useAuthStore: {
    getState: () => ({
      logout: logoutMock,
    }),
  },
}));

import { createAppQueryClient, resetAppQueryClient } from './query-client';

describe('query-client', () => {
  beforeEach(() => {
    resetAppQueryClient();
    toastErrorMock.mockReset();
    logoutMock.mockReset();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows user-friendly messages for mapped API errors', () => {
    const queryOnError = createAppQueryClient().getQueryCache().config.onError;

    queryOnError?.(new ApiError(400, 'Bad Request', 'VALIDATION_ERROR'), {} as never);

    expect(toastErrorMock).toHaveBeenCalledWith('Please check your input');
  });

  it('shows network error messaging for request failures with no response', () => {
    const mutationOnError = createAppQueryClient().getMutationCache().config.onError;

    mutationOnError?.(
      new TypeError('Failed to fetch'),
      {} as never,
      undefined,
      {} as never,
      {} as never,
    );

    expect(toastErrorMock).toHaveBeenCalledWith('Network error. Check your connection.');
  });

  it('logs out and redirects to /login on unauthorized errors', () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
    const queryOnError = createAppQueryClient().getQueryCache().config.onError;

    window.history.pushState({}, '', '/dashboard');
    queryOnError?.(new ApiError(401, 'expired token', 'UNAUTHORIZED'), {} as never);

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(replaceStateSpy).toHaveBeenCalledWith({}, '', '/login');
    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.any(PopStateEvent));
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('recreates the singleton after reset', () => {
    const firstClient = createAppQueryClient();

    resetAppQueryClient();

    const secondClient = createAppQueryClient();

    expect(secondClient).not.toBe(firstClient);
  });
});
