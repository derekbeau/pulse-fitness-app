import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';

import { useExerciseHistory } from './use-exercise-history';

const mockFetch = vi.fn();

const createJsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  });

describe('use-exercise-history hook', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('loads and maps recent completed sessions with all sets', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse([
        {
          sessionId: 'session-2',
          date: '2026-03-08',
          notes: 'Felt strong.',
          sets: [
            { setNumber: 1, weight: 105, reps: 9, seconds: 30 },
            { setNumber: 2, weight: 100, reps: 8 },
          ],
        },
      ]),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useExerciseHistory('global-bench-press'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([
      {
        sessionId: 'session-2',
        date: '2026-03-08',
        notes: 'Felt strong.',
        sets: [
          { setNumber: 1, weight: 105, reps: 9, seconds: 30 },
          { setNumber: 2, weight: 100, reps: 8 },
        ],
      },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/exercises/global-bench-press/history?limit=10'),
      expect.any(Object),
    );
  });

  it('retains native, legacy, and missing raw effort through the history adapter', async () => {
    const sets = [
      { setNumber: 1, weight: 135, reps: 10, rir: 0, rpe: null },
      { setNumber: 2, weight: 135, reps: 10, rir: 4, rpe: null },
      { setNumber: 3, weight: 135, reps: 10, rir: 5, rpe: null },
      { setNumber: 4, weight: 135, reps: 10, rir: null, rpe: 8 },
      { setNumber: 5, weight: 135, reps: 10, rir: null, rpe: 1 },
      { setNumber: 6, weight: 135, reps: 10, rir: null, rpe: null },
    ];
    mockFetch.mockResolvedValueOnce(
      createJsonResponse([{ sessionId: 'mixed-session', date: '2026-09-04', notes: null, sets }]),
    );
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useExerciseHistory('history-bench'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0].sets).toStrictEqual(sets);
  });

  it('returns an empty history list for not-found exercises', async () => {
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
    const { result } = renderHook(() => useExerciseHistory('missing-exercise'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });

  it('does not fetch when disabled', () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(
      () =>
        useExerciseHistory('global-bench-press', {
          enabled: false,
        }),
      { wrapper },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uses the caller-provided session limit', async () => {
    mockFetch.mockResolvedValueOnce(createJsonResponse([]));

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(
      () =>
        useExerciseHistory('global-bench-press', {
          limit: 5,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/exercises/global-bench-press/history?limit=5'),
      expect.any(Object),
    );
  });
});
