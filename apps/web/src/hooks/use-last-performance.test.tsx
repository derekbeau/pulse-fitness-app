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

  it('loads and maps exact history data for an exercise by default', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse([
        {
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
      ]),
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
      historyEntries: [
        {
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
      ],
      related: [],
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/exercises/global-bench-press/last-performance?'),
      expect.any(Object),
    );
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('includeRelated=true'),
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('limit=3'), expect.any(Object));
  });

  it('maps related history entries', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        history: null,
        related: [
          {
            exerciseId: 'incline-bench',
            exerciseName: 'Incline Bench Press',
            trackingType: 'weight_reps',
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
    const { result } = renderHook(
      () =>
        useLastPerformance('global-bench-press', {
          includeRelated: true,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({
      history: null,
      historyEntries: [],
      related: [
        {
          exerciseId: 'incline-bench',
          exerciseName: 'Incline Bench Press',
          trackingType: 'weight_reps',
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
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('includeRelated=true'),
      expect.any(Object),
    );
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

  it('allows callers to disable related history payloads', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse([
        {
          sessionId: 'session-2',
          date: '2026-03-08',
          sets: [
            {
              setNumber: 1,
              weight: 105,
              reps: 9,
            },
          ],
        },
        {
          sessionId: 'session-1',
          date: '2026-03-01',
          sets: [
            {
              setNumber: 1,
              weight: 100,
              reps: 8,
            },
          ],
        },
      ]),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(
      () =>
        useLastPerformance('global-bench-press', {
          includeRelated: false,
        }),
      { wrapper },
    );

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
        ],
      },
      historyEntries: [
        {
          sessionId: 'session-2',
          date: '2026-03-08',
          sets: [
            {
              completed: true,
              reps: 9,
              setNumber: 1,
              weight: 105,
            },
          ],
        },
        {
          sessionId: 'session-1',
          date: '2026-03-01',
          sets: [
            {
              completed: true,
              reps: 8,
              setNumber: 1,
              weight: 100,
            },
          ],
        },
      ],
      related: [],
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/exercises/global-bench-press/last-performance?limit=3'),
      expect.any(Object),
    );
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('includeRelated=true'),
      expect.any(Object),
    );
  });

  it('supports overriding the history limit', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse([
        {
          sessionId: 'session-2',
          date: '2026-03-08',
          sets: [
            {
              setNumber: 1,
              weight: 105,
              reps: 9,
            },
          ],
        },
      ]),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(
      () =>
        useLastPerformance('global-bench-press', {
          includeRelated: false,
          limit: 5,
        }),
      { wrapper },
    );

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
            reps: 9,
            setNumber: 1,
            weight: 105,
          },
        ],
      },
      historyEntries: [
        {
          sessionId: 'session-2',
          date: '2026-03-08',
          sets: [
            {
              completed: true,
              reps: 9,
              setNumber: 1,
              weight: 105,
            },
          ],
        },
      ],
      related: [],
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/exercises/global-bench-press/last-performance?limit=5'),
      expect.any(Object),
    );
  });
});
