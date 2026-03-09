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

  it('loads recent completed workouts and computes exercise counts from session details', async () => {
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
              createdAt: 6,
            },
          ]),
        );
      }

      if (url === '/api/v1/workout-sessions/session-1') {
        return Promise.resolve(
          createJsonResponse({
            id: 'session-1',
            userId: 'user-1',
            templateId: 'template-1',
            name: 'Upper Push A',
            date: '2026-03-08',
            status: 'completed',
            startedAt: 1,
            completedAt: 2,
            duration: 61,
            feedback: null,
            notes: null,
            sets: [
              {
                id: 'set-1',
                exerciseId: 'bench-press',
                setNumber: 1,
                weight: 185,
                reps: 8,
                completed: true,
                skipped: false,
                section: 'main',
                notes: null,
                createdAt: 1,
              },
              {
                id: 'set-2',
                exerciseId: 'bench-press',
                setNumber: 2,
                weight: 185,
                reps: 7,
                completed: true,
                skipped: false,
                section: 'main',
                notes: null,
                createdAt: 2,
              },
              {
                id: 'set-3',
                exerciseId: 'incline-dumbbell-press',
                setNumber: 1,
                weight: 75,
                reps: 10,
                completed: true,
                skipped: false,
                section: 'main',
                notes: null,
                createdAt: 3,
              },
            ],
            createdAt: 7,
            updatedAt: 8,
          }),
        );
      }

      if (url === '/api/v1/workout-sessions/session-2') {
        return Promise.resolve(
          createJsonResponse({
            id: 'session-2',
            userId: 'user-1',
            templateId: 'template-2',
            name: 'Lower Strength',
            date: '2026-03-05',
            status: 'completed',
            startedAt: 4,
            completedAt: 5,
            duration: 70,
            feedback: null,
            notes: null,
            sets: [
              {
                id: 'set-4',
                exerciseId: 'squat',
                setNumber: 1,
                weight: 275,
                reps: 5,
                completed: true,
                skipped: false,
                section: 'main',
                notes: null,
                createdAt: 4,
              },
            ],
            createdAt: 9,
            updatedAt: 10,
          }),
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
    expect(result.current.data).toEqual([
      {
        id: 'session-1',
        name: 'Upper Push A',
        date: '2026-03-08',
        duration: 61,
        exerciseCount: 2,
      },
      {
        id: 'session-2',
        name: 'Lower Strength',
        date: '2026-03-05',
        duration: 70,
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
