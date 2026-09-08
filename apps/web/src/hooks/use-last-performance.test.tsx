import { act, renderHook, waitFor } from '@testing-library/react';
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
          notes: 'Moved well.',
          sets: [
            {
              setNumber: 1,
              weight: 105,
              reps: 9,
              seconds: 30,
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
        notes: 'Moved well.',
        sets: [
          {
            completed: true,
            setNumber: 1,
            weight: 105,
            reps: 9,
            seconds: 30,
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
          notes: 'Moved well.',
          sets: [
            {
              completed: true,
              setNumber: 1,
              weight: 105,
              reps: 9,
              seconds: 30,
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
      expect.stringContaining('/api/v1/exercises/global-bench-press/history?'),
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
            notes: null,
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
          notes: null,
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
          notes: 'Smoother setup.',
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
        notes: null,
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
          notes: null,
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
          notes: 'Smoother setup.',
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
      expect.stringContaining('/api/v1/exercises/global-bench-press/history?limit=3'),
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
          notes: null,
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
        notes: null,
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
          notes: null,
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
      expect.stringContaining('/api/v1/exercises/global-bench-press/history?limit=5'),
      expect.any(Object),
    );
  });
  it('keeps related loading, failed fetch, and successful retry distinct from emptiness', async () => {
    let release!: (response: Response) => void;
    mockFetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const { wrapper, queryClient } = createQueryClientWrapper();
    queryClient.setDefaultOptions({ queries: { retry: false } });
    const { result } = renderHook(() => useLastPerformance('primary', { includeRelated: true }), {
      wrapper,
    });
    expect(result.current.isPending).toBe(true);
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    await act(async () => release(createJsonResponse(null, 503)));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    mockFetch.mockResolvedValueOnce(createJsonResponse({ history: null, related: [] }));
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ history: null, historyEntries: [], related: [] });
  });

  it('uses the normal automatic retry for related-history transport failures', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    mockFetch.mockResolvedValueOnce(createJsonResponse({ history: null, related: [] }));
    const { wrapper, queryClient } = createQueryClientWrapper();
    queryClient.setDefaultOptions({ queries: { retry: 1, retryDelay: 0 } });
    const { result } = renderHook(() => useLastPerformance('primary', { includeRelated: true }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    null,
    undefined,
    {},
    { history: null },
    { related: [] },
    {
      history: null,
      related: [{ exerciseId: 'related', exerciseName: 'Related', trackingType: 'weight_reps' }],
    },
    {
      history: null,
      related: Array.from({ length: 21 }, () => ({
        exerciseId: 'related',
        exerciseName: 'Related',
        trackingType: 'weight_reps',
        history: null,
      })),
    },
  ])('leaves malformed/partial related payloads as errors: %j', async (payload) => {
    mockFetch.mockResolvedValueOnce(createJsonResponse(payload));
    const { wrapper, queryClient } = createQueryClientWrapper();
    queryClient.setDefaultOptions({ queries: { retry: false } });
    const { result } = renderHook(() => useLastPerformance('primary', { includeRelated: true }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it.each([401, 403, 404, 500])('preserves related-history HTTP %s as failure', async (status) => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: status === 404 ? 'EXERCISE_NOT_FOUND' : 'UNAVAILABLE',
            message: 'Unavailable',
          },
        }),
        { status, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const { wrapper, queryClient } = createQueryClientWrapper();
    queryClient.setDefaultOptions({ queries: { retry: false } });
    const { result } = renderHook(() => useLastPerformance('primary', { includeRelated: true }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('preserves related notes, zero load, native zero RIR, seconds, and distance', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        history: null,
        related: [
          {
            exerciseId: 'related',
            exerciseName: 'Related',
            trackingType: 'weight_reps',
            history: {
              date: '2026-09-01',
              sessionId: 'valid',
              notes: 'Saved note',
              sets: [
                { setNumber: 1, weight: 0, reps: 8, rir: 0, seconds: 0, distance: 0 },
                { setNumber: 2, weight: null, reps: null, rir: 0 },
              ],
            },
          },
        ],
      }),
    );
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useLastPerformance('primary', { includeRelated: true }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.related[0].history).toEqual({
      date: '2026-09-01',
      sessionId: 'valid',
      notes: 'Saved note',
      sets: [
        { completed: true, setNumber: 1, weight: 0, reps: 8, rir: 0, seconds: 0, distance: 0 },
      ],
    });
  });
  it('keeps truncated JSON as a transport/parse failure', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('{"data":{"history":null,"related":[', {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { wrapper, queryClient } = createQueryClientWrapper();
    queryClient.setDefaultOptions({ queries: { retry: false } });
    const { result } = renderHook(() => useLastPerformance('primary', { includeRelated: true }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
