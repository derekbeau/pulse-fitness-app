import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionSet, WorkoutSession } from '@pulse/shared';

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

    mockFetch.mockImplementationOnce(() =>
      deferred.promise.then((data) => createJsonResponse(data, 201)),
    );

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
        queryClient.getQueryData<typeof sessionResponse>(
          workoutSessionQueryKeys.detail('session-1'),
        )?.sets,
      ).toEqual([
        expect.objectContaining({
          exerciseId: 'incline-dumbbell-press',
          id: 'optimistic-session-1-main-incline-dumbbell-press-1',
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
        queryClient.getQueryData<typeof sessionResponse>(
          workoutSessionQueryKeys.detail('session-1'),
        )?.sets,
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

  it('does not overwrite a same-number set for the same exercise in another section', async () => {
    const deferred = createDeferredPromise<SessionSet>();
    const { queryClient, wrapper } = createQueryClientWrapper();
    const warmupSet = {
      ...sessionSetResponse,
      id: 'warmup-set-1',
      exerciseId: 'peloton-bike',
      section: 'warmup' as const,
      setNumber: 1,
      reps: null,
      seconds: 300,
    };
    const repeatedSession: WorkoutSession = {
      ...sessionResponse,
      sectionDurations: { warmup: 0, main: 0, supplemental: 0, cooldown: 0 },
      exercises: [
        {
          ...sessionResponse.exercises[0],
          exerciseId: 'peloton-bike',
          exerciseName: 'Peloton Bike',
          section: 'warmup' as const,
          supersetGroup: null,
          programmingNotes: null,
          agentNotes: null,
          agentNotesMeta: null,
          sets: [warmupSet],
        },
        {
          ...sessionResponse.exercises[0],
          exerciseId: 'peloton-bike',
          exerciseName: 'Peloton Bike',
          section: 'supplemental' as const,
          supersetGroup: null,
          programmingNotes: null,
          agentNotes: null,
          agentNotesMeta: null,
          sets: [],
        },
      ],
      sets: [warmupSet],
    };
    queryClient.setQueryData(workoutSessionQueryKeys.detail('session-1'), repeatedSession);
    mockFetch.mockImplementationOnce(() =>
      deferred.promise.then((data) => createJsonResponse(data, 201)),
    );
    const { result } = renderHook(() => useLogSet('session-1'), { wrapper });

    act(() => {
      result.current.mutate({
        exerciseId: 'peloton-bike',
        seconds: 500,
        section: 'supplemental',
        setNumber: 1,
      });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<WorkoutSession>(
        workoutSessionQueryKeys.detail('session-1'),
      );
      expect(cached?.sets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'warmup-set-1', section: 'warmup', seconds: 300 }),
          expect.objectContaining({
            id: 'optimistic-session-1-supplemental-peloton-bike-1',
            section: 'supplemental',
          }),
        ]),
      );
      expect(cached?.exercises?.[0]?.sets).toEqual([warmupSet]);
      expect(cached?.exercises?.[1]?.sets).toHaveLength(1);
    });

    await act(async () => {
      deferred.resolve({
        ...sessionSetResponse,
        id: 'supplemental-set-1',
        exerciseId: 'peloton-bike',
        section: 'supplemental',
        reps: null,
        seconds: 500,
      });
      await deferred.promise;
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<WorkoutSession>(
        workoutSessionQueryKeys.detail('session-1'),
      );
      expect(cached?.sets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'warmup-set-1', section: 'warmup', seconds: 300 }),
          expect.objectContaining({
            id: 'supplemental-set-1',
            section: 'supplemental',
            seconds: 500,
          }),
        ]),
      );
    });
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
        queryClient.getQueryData<typeof sessionResponse>(
          workoutSessionQueryKeys.detail('session-1'),
        )?.sets,
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
        queryClient.getQueryData<typeof sessionResponse>(
          workoutSessionQueryKeys.detail('session-1'),
        )?.sets,
      ).toEqual([
        expect.objectContaining({
          completed: true,
          id: 'set-1',
          reps: 10,
        }),
      ]);
    });
  });

  it('optimistically replaces RPE with RIR and rolls back both fields on failure', async () => {
    const { queryClient, wrapper } = createQueryClientWrapper();
    const nativeRpeSet = { ...sessionSetResponse, rpe: 8 };
    queryClient.setQueryData(workoutSessionQueryKeys.detail('session-1'), {
      ...sessionResponse,
      exercises: [{ ...sessionResponse.exercises[0], sets: [nativeRpeSet] }],
      sets: [nativeRpeSet],
    });
    const deferred = createDeferredPromise<never>();
    mockFetch.mockImplementationOnce(() => deferred.promise);
    const { result } = renderHook(() => useUpdateSet('session-1'), { wrapper });

    act(() => {
      result.current.mutate({ setId: 'set-1', update: { rir: 2, rpe: null } });
    });
    await waitFor(() => {
      expect(
        queryClient.getQueryData<typeof sessionResponse>(
          workoutSessionQueryKeys.detail('session-1'),
        )?.sets[0],
      ).toMatchObject({ rir: 2, rpe: null });
    });
    await act(async () => {
      deferred.reject(new Error('offline'));
      await expect(deferred.promise).rejects.toThrow('offline');
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(
      queryClient.getQueryData<typeof sessionResponse>(workoutSessionQueryKeys.detail('session-1'))
        ?.sets[0],
    ).toMatchObject({ rpe: 8 });
    expect(
      queryClient.getQueryData<typeof sessionResponse>(workoutSessionQueryKeys.detail('session-1'))
        ?.sets[0],
    ).not.toHaveProperty('rir');
  });

  it('rolls back only the failed occurrence when repeated exercise sets share a set number', async () => {
    const { queryClient, wrapper } = createQueryClientWrapper();
    const warmupSet: SessionSet = {
      ...sessionSetResponse,
      id: 'bike-warmup-set',
      exerciseId: 'peloton-bike',
      section: 'warmup',
      reps: null,
      seconds: 300,
    };
    const supplementalSet: SessionSet = {
      ...sessionSetResponse,
      id: 'bike-supplemental-set',
      exerciseId: 'peloton-bike',
      section: 'supplemental',
      reps: null,
      seconds: null,
    };
    const session: WorkoutSession = {
      ...sessionResponse,
      sectionDurations: { warmup: 0, main: 0, supplemental: 0, cooldown: 0 },
      exercises: undefined,
      sets: [warmupSet, supplementalSet],
    };
    queryClient.setQueryData(workoutSessionQueryKeys.detail('session-1'), session);
    const deferred = createDeferredPromise<never>();
    mockFetch.mockImplementationOnce(() => deferred.promise);
    const { result } = renderHook(() => useUpdateSet('session-1'), { wrapper });

    act(() => {
      result.current.mutate({
        setId: 'bike-supplemental-set',
        update: { seconds: 500, completed: true },
      });
    });
    await waitFor(() => {
      const cached = queryClient.getQueryData<WorkoutSession>(
        workoutSessionQueryKeys.detail('session-1'),
      );
      expect(cached?.sets).toEqual([
        expect.objectContaining({ id: 'bike-warmup-set', seconds: 300, completed: false }),
        expect.objectContaining({ id: 'bike-supplemental-set', seconds: 500, completed: true }),
      ]);
    });

    await act(async () => {
      deferred.reject(new Error('offline'));
      await expect(deferred.promise).rejects.toThrow('offline');
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(
      queryClient.getQueryData<WorkoutSession>(workoutSessionQueryKeys.detail('session-1'))?.sets,
    ).toEqual([
      expect.objectContaining({ id: 'bike-warmup-set', seconds: 300, completed: false }),
      expect.objectContaining({ id: 'bike-supplemental-set', seconds: null, completed: false }),
    ]);
  });
});
