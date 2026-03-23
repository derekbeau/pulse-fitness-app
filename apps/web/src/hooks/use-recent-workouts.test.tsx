import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';

import { useRecentWorkouts } from './use-recent-workouts';

const mockFetch = vi.fn();

const createJsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  });

describe('useRecentWorkouts', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads recent completed workouts from the list endpoint without detail fetches', async () => {
    mockFetch.mockImplementation((input: string | URL | Request) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url === '/api/v1/workout-sessions?status=completed&limit=2') {
        return Promise.resolve(
          createJsonResponse([
            {
              id: 'session-1',
              name: 'Upper Push A',
              date: '2026-03-08',
              status: 'completed',
              templateId: 'template-1',
              templateName: 'Upper Push',
              startedAt: 1,
              completedAt: 2,
              duration: 61,
              exerciseCount: 2,
              createdAt: 3,
            },
            {
              id: 'session-2',
              name: 'Lower Strength',
              date: '2026-03-05',
              status: 'completed',
              templateId: 'template-2',
              templateName: 'Lower Strength',
              startedAt: 4,
              completedAt: 5,
              duration: 70,
              exerciseCount: 1,
              createdAt: 6,
            },
          ]),
        );
      }

      return Promise.resolve(createJsonResponse({ error: { code: 'NOT_FOUND' } }, 404));
    });

    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setDefaultOptions({
      queries: { retry: false },
      mutations: { retry: false },
    });

    const { result } = renderHook(() => useRecentWorkouts(2), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/workout-sessions?status=completed&limit=2',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual([
      {
        id: 'session-1',
        name: 'Upper Push A',
        date: '2026-03-08',
        duration: 61,
        notes: null,
        exerciseCount: 2,
      },
      {
        id: 'session-2',
        name: 'Lower Strength',
        date: '2026-03-05',
        duration: 70,
        notes: null,
        exerciseCount: 1,
      },
    ]);
  });

  it('surfaces an error when list payload is invalid', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse([
        {
          name: 'Missing id',
        },
      ]),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setDefaultOptions({
      queries: { retry: false },
      mutations: { retry: false },
    });

    const { result } = renderHook(() => useRecentWorkouts(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
