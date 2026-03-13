import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';

import { useLastPerformance } from './use-last-performance';

const mockFetch = vi.fn();

const createJsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  });

describe('use-last-performance hook', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('loads and maps exact history data for an exercise', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        history: {
          sessionId: 'session-2',
          date: '2026-03-08',
          sets: [
            {
              setNumber: 1,
              weight: 105,
              reps: 9,
            },
            {
              setNumber: 2,
              weight: 100,
              reps: 8,
            },
          ],
        },
        related: [],
      }),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useLastPerformance('global-bench-press'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({
      history: {
        sessionId: 'session-2',
        date: '2026-03-08',
        sets: [
          {
            completed: true,
            setNumber: 1,
            weight: 105,
            reps: 9,
          },
          {
            completed: true,
            setNumber: 2,
            weight: 100,
            reps: 8,
          },
        ],
      },
      related: [],
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/exercises/global-bench-press/last-performance?includeRelated=true'),
      expect.any(Object),
    );
  });

  it('maps related history entries', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        history: null,
        related: [
          {
            exerciseId: 'incline-bench',
            exerciseName: 'Incline Bench Press',
            history: {
              sessionId: 'session-3',
              date: '2026-03-10',
              sets: [
                {
                  setNumber: 1,
                  weight: 95,
                  reps: 10,
                },
              ],
            },
          },
        ],
      }),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useLastPerformance('global-bench-press'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({
      history: null,
      related: [
        {
          exerciseId: 'incline-bench',
          exerciseName: 'Incline Bench Press',
          history: {
            sessionId: 'session-3',
            date: '2026-03-10',
            sets: [
              {
                completed: true,
                reps: 10,
                setNumber: 1,
                weight: 95,
              },
            ],
          },
        },
      ],
    });
  });

  it('returns null for not-found exercises', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 'EXERCISE_NOT_FOUND',
            message: 'Exercise not found',
          },
        }),
        {
          headers: {
            'Content-Type': 'application/json',
          },
          status: 404,
        },
      ),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useLastPerformance('global-bench-press'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });

  it('does not fetch when disabled', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(
      () =>
        useLastPerformance('global-bench-press', {
          enabled: false,
        }),
      { wrapper },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
