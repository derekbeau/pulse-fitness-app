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

  it('loads and maps last performance data for an exercise', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
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
      }),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useLastPerformance('global-bench-press'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({
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
    });
  });

  it('returns null when no prior performance exists', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 'EXERCISE_LAST_PERFORMANCE_NOT_FOUND',
            message: 'No completed performance found for this exercise',
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

