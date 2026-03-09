import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';
import { jsonResponse } from '@/test/test-utils';

import { useSyncSets } from './use-sync-sets';

const mockFetch = vi.fn();

const groupedSetResponse = {
  data: [
    {
      exerciseId: 'incline-dumbbell-press',
      sets: [
        {
          id: 'set-1',
          exerciseId: 'incline-dumbbell-press',
          setNumber: 1,
          weight: 60,
          reps: 8,
          completed: false,
          skipped: false,
          section: 'main',
          notes: null,
          createdAt: 100,
        },
      ],
    },
  ],
};

describe('use-sync-sets hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('syncs dirty sets after the 2s change debounce', async () => {
    mockFetch.mockResolvedValue(jsonResponse(groupedSetResponse));

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useSyncSets({ sessionId: 'session-1' }), { wrapper });

    act(() => {
      result.current.queueSetSync({
        id: 'set-1',
        exerciseId: 'incline-dumbbell-press',
        reps: 8,
        section: 'main',
        setNumber: 1,
        weight: 60,
      });
    });

    expect(mockFetch).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/workout-sessions/session-1/sets',
      expect.objectContaining({
        method: 'PUT',
      }),
    );
  });

  it('syncs dirty sets on the 30s interval', async () => {
    mockFetch.mockResolvedValue(jsonResponse(groupedSetResponse));

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(
      () =>
        useSyncSets({
          sessionId: 'session-1',
          syncIntervalMs: 30_000,
          syncOnChangeDebounceMs: 60_000,
        }),
      { wrapper },
    );

    act(() => {
      result.current.queueSetSync({
        id: 'set-1',
        exerciseId: 'incline-dumbbell-press',
        reps: 8,
        section: 'main',
        setNumber: 1,
        weight: 60,
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/workout-sessions/session-1/sets',
      expect.objectContaining({
        method: 'PUT',
      }),
    );
  });

  it('attempts a keepalive sync on beforeunload when there are dirty sets', async () => {
    mockFetch.mockResolvedValue(jsonResponse(groupedSetResponse));

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(
      () =>
        useSyncSets({
          sessionId: 'session-1',
          syncOnChangeDebounceMs: 60_000,
        }),
      { wrapper },
    );

    act(() => {
      result.current.queueSetSync({
        id: 'set-1',
        exerciseId: 'incline-dumbbell-press',
        reps: 8,
        section: 'main',
        setNumber: 1,
        weight: 60,
      });
    });

    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/workout-sessions/session-1/sets',
      expect.objectContaining({
        keepalive: true,
        method: 'PUT',
      }),
    );
  });

  it('invokes onSessionInactive when the server reports the session is no longer active', async () => {
    const onSessionInactive = vi.fn();
    mockFetch.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'WORKOUT_SESSION_NOT_ACTIVE',
            message: 'Workout session is not active',
          },
        },
        { status: 409 },
      ),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(
      () =>
        useSyncSets({
          sessionId: 'session-1',
          onSessionInactive,
        }),
      { wrapper },
    );

    act(() => {
      result.current.queueSetSync({
        id: 'set-1',
        exerciseId: 'incline-dumbbell-press',
        reps: 8,
        section: 'main',
        setNumber: 1,
        weight: 60,
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(onSessionInactive).toHaveBeenCalledTimes(1);
  });
});
