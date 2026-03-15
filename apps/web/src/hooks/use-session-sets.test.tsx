import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { habitQueryKeys } from '@/features/habits/api/keys';
import { workoutQueryKeys } from '@/features/workouts/api/workouts';
import { dashboardSnapshotQueryKeys } from '@/hooks/use-dashboard-snapshot';
import { habitChainQueryKeys } from '@/hooks/use-habit-chains';
import { recentWorkoutQueryKeys } from '@/hooks/use-recent-workouts';
import { createQueryClientWrapper } from '@/test/query-client';

import { useLogSet, useUpdateSet } from './use-session-sets';
import { workoutSessionQueryKeys } from './use-workout-session';

const mockFetch = vi.fn();

const createJsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  });

const sessionSetResponse = {
  id: 'set-1',
  exerciseId: 'incline-dumbbell-press',
  setNumber: 1,
  weight: 60,
  reps: 8,
  completed: false,
  skipped: false,
  section: 'main' as const,
  notes: null,
  createdAt: 100,
};

const sessionResponse = {
  id: 'session-1',
  userId: 'user-1',
  templateId: 'template-1',
  name: 'Upper Push',
  date: '2026-03-08',
  status: 'in-progress' as const,
  startedAt: 100,
  completedAt: null,
  duration: null,
  timeSegments: [],
  feedback: null,
  notes: null,
  exercises: [
    {
      exerciseId: 'incline-dumbbell-press',
      exerciseName: 'Incline Dumbbell Press',
      trackingType: 'weight_reps' as const,
      orderIndex: 0,
      section: 'main' as const,
      sets: [],
    },
  ],
  sets: [],
  createdAt: 100,
  updatedAt: 100,
};

function createDeferredPromise<T>() {
  let resolveDeferred: ((value: T | PromiseLike<T>) => void) | undefined;
  let rejectDeferred: ((reason?: unknown) => void) | undefined;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolveDeferred = resolvePromise;
    rejectDeferred = rejectPromise;
  });

  return {
    promise,
    reject: (reason?: unknown) => {
      if (!rejectDeferred) {
        throw new Error('Deferred reject handler was not initialized');
      }

      rejectDeferred(reason);
    },
    resolve: (value: T | PromiseLike<T>) => {
      if (!resolveDeferred) {
        throw new Error('Deferred resolve handler was not initialized');
      }

      resolveDeferred(value);
    },
  };
}

describe('use-session-sets hooks', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('optimistically logs a set into the active session caches and invalidates dependents', async () => {
    const deferred = createDeferredPromise<typeof sessionSetResponse>();
    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

    queryClient.setQueryData(workoutSessionQueryKeys.detail('session-1'), sessionResponse);
    queryClient.setQueryData(workoutQueryKeys.session('session-1'), sessionResponse);

    mockFetch.mockImplementationOnce(() => deferred.promise.then((data) => createJsonResponse(data, 201)));

    const { result } = renderHook(() => useLogSet('session-1'), { wrapper });

    act(() => {
      result.current.mutate({
        exerciseId: 'incline-dumbbell-press',
        reps: 8,
        section: 'main',
        setNumber: 1,
        weight: 60,
      });
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData<typeof sessionResponse>(workoutSessionQueryKeys.detail('session-1'))
          ?.sets,
      ).toEqual([
        expect.objectContaining({
          exerciseId: 'incline-dumbbell-press',
          id: 'optimistic-session-1-incline-dumbbell-press-1',
          reps: 8,
          weight: 60,
        }),
      ]);
    });

    await act(async () => {
      deferred.resolve(sessionSetResponse);
      await deferred.promise;
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/workout-sessions/session-1/sets',
      expect.objectContaining({
        method: 'POST',
      }),
    );

    const request = mockFetch.mock.calls.find(
      ([input, init]) =>
        String(input) === '/api/v1/workout-sessions/session-1/sets' && init?.method === 'POST',
    );

    expect(request).toBeDefined();
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      distance: null,
      exerciseId: 'incline-dumbbell-press',
      reps: 8,
      seconds: null,
      section: 'main',
      setNumber: 1,
      weight: 60,
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData<typeof sessionResponse>(workoutSessionQueryKeys.detail('session-1'))
          ?.sets,
      ).toEqual([sessionSetResponse]);
    });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: workoutSessionQueryKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutSessionQueryKeys.detail('session-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: workoutQueryKeys.sessions() });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.session('session-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: dashboardSnapshotQueryKeys.all,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: recentWorkoutQueryKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: habitQueryKeys.list() });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: habitQueryKeys.entryList() });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: habitChainQueryKeys.all });
  });

  it('optimistically updates a set and reconciles the server result', async () => {
    const deferred = createDeferredPromise<typeof sessionSetResponse>();
    const { queryClient, wrapper } = createQueryClientWrapper();

    queryClient.setQueryData(workoutSessionQueryKeys.detail('session-1'), {
      ...sessionResponse,
      exercises: [
        {
          ...sessionResponse.exercises[0],
          sets: [sessionSetResponse],
        },
      ],
      sets: [sessionSetResponse],
    });

    mockFetch.mockImplementationOnce(() =>
      deferred.promise.then((data) => createJsonResponse(data)),
    );

    const { result } = renderHook(() => useUpdateSet('session-1'), { wrapper });

    act(() => {
      result.current.mutate({
        setId: 'set-1',
        update: {
          completed: true,
          reps: 9,
        },
      });
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData<typeof sessionResponse>(workoutSessionQueryKeys.detail('session-1'))
          ?.sets,
      ).toEqual([
        expect.objectContaining({
          completed: true,
          id: 'set-1',
          reps: 9,
        }),
      ]);
    });

    await act(async () => {
      deferred.resolve({
        ...sessionSetResponse,
        completed: true,
        reps: 10,
      });
      await deferred.promise;
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData<typeof sessionResponse>(workoutSessionQueryKeys.detail('session-1'))
          ?.sets,
      ).toEqual([
        expect.objectContaining({
          completed: true,
          id: 'set-1',
          reps: 10,
        }),
      ]);
    });
  });
});
