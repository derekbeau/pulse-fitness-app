import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';

import {
  useRenameExercise,
  useRenameTemplate,
  useRescheduleWorkout,
  useUnscheduleWorkout,
  workoutQueryKeys,
} from './workouts';

const mockFetch = vi.fn();

const createJsonResponse = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    headers: {
      'Content-Type': 'application/json',
    },
    status: 200,
  });

function createDeferredPromise<ResponseT>() {
  let resolveDeferred: ((value: ResponseT | PromiseLike<ResponseT>) => void) | undefined;

  const promise = new Promise<ResponseT>((resolvePromise) => {
    resolveDeferred = resolvePromise;
  });

  return {
    promise,
    resolve: (value: ResponseT | PromiseLike<ResponseT>) => {
      if (!resolveDeferred) {
        throw new Error('Deferred resolve handler was not initialized');
      }

      resolveDeferred(value);
    },
  };
}

const exercise = {
  id: 'exercise-1',
  userId: 'user-1',
  name: 'Bench Press',
  muscleGroups: ['chest'],
  equipment: 'barbell',
  category: 'compound' as const,
  trackingType: 'weight_reps' as const,
  tags: [],
  formCues: [],
  instructions: null,
  coachingNotes: null,
  relatedExerciseIds: [],
  createdAt: 1,
  updatedAt: 1,
};

const template = {
  id: 'template-1',
  userId: 'user-1',
  name: 'Push Day',
  description: null,
  tags: [],
  sections: [
    {
      type: 'warmup' as const,
      exercises: [],
    },
    {
      type: 'main' as const,
      exercises: [
        {
          id: 'template-exercise-1',
          exerciseId: 'exercise-1',
          exerciseName: 'Bench Press',
          trackingType: 'weight_reps' as const,
          exercise: {
            coachingNotes: null,
            formCues: [],
            instructions: null,
          },
          sets: 3,
          repsMin: 8,
          repsMax: 10,
          tempo: null,
          restSeconds: null,
          supersetGroup: null,
          notes: null,
          cues: [],
          setTargets: [],
          programmingNotes: null,
        },
      ],
    },
    {
      type: 'cooldown' as const,
      exercises: [],
    },
  ],
  createdAt: 1,
  updatedAt: 1,
};

const session = {
  id: 'session-1',
  userId: 'user-1',
  templateId: 'template-1',
  name: 'Push Day',
  date: '2026-03-07',
  status: 'in-progress' as const,
  startedAt: 1,
  completedAt: null,
  duration: null,
  timeSegments: [],
  feedback: null,
  notes: null,
  exercises: [
    {
      exerciseId: 'exercise-1',
      exerciseName: 'Bench Press',
      trackingType: 'weight_reps' as const,
      orderIndex: 0,
      section: 'main' as const,
      sets: [],
    },
  ],
  sets: [],
  createdAt: 1,
  updatedAt: 1,
};

const scheduledWorkouts = [
  {
    id: 'scheduled-1',
    date: '2026-03-07',
    templateId: 'template-1',
    templateName: 'Push Day',
    templateTrackingTypes: ['weight_reps'] as const,
    sessionId: null,
    createdAt: 1,
  },
];

describe('workout optimistic mutations', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('renames a template optimistically in list and detail caches', async () => {
    const deferred = createDeferredPromise<Response>();
    const { queryClient, wrapper } = createQueryClientWrapper();

    queryClient.setQueryData(workoutQueryKeys.templateList(), [template]);
    queryClient.setQueryData(workoutQueryKeys.template('template-1'), template);
    mockFetch.mockImplementationOnce(() => deferred.promise);

    const { result } = renderHook(() => useRenameTemplate(), { wrapper });

    act(() => {
      result.current.mutate({
        id: 'template-1',
        name: 'Upper Push',
      });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<typeof template[]>(workoutQueryKeys.templateList())).toEqual([
        expect.objectContaining({ name: 'Upper Push' }),
      ]);
      expect(queryClient.getQueryData<typeof template>(workoutQueryKeys.template('template-1'))).toEqual(
        expect.objectContaining({ name: 'Upper Push' }),
      );
    });

    await act(async () => {
      deferred.resolve(
        createJsonResponse({
          ...template,
          name: 'Upper Push',
        }),
      );
      await deferred.promise;
    });
  });

  it('renames an exercise optimistically across exercise, template, and session caches', async () => {
    const deferred = createDeferredPromise<Response>();
    const { queryClient, wrapper } = createQueryClientWrapper();

    queryClient.setQueryData(workoutQueryKeys.exercise('exercise-1'), exercise);
    queryClient.setQueryData(workoutQueryKeys.exerciseList(), {
      data: [exercise],
      meta: {
        limit: 20,
        page: 1,
        total: 1,
      },
    });
    queryClient.setQueryData(workoutQueryKeys.templateList(), [template]);
    queryClient.setQueryData(workoutQueryKeys.template('template-1'), template);
    queryClient.setQueryData(workoutQueryKeys.session('session-1'), session);
    mockFetch.mockImplementationOnce(() => deferred.promise);

    const { result } = renderHook(() => useRenameExercise(), { wrapper });

    act(() => {
      result.current.mutate({
        id: 'exercise-1',
        name: 'Paused Bench Press',
      });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<typeof exercise>(workoutQueryKeys.exercise('exercise-1'))).toEqual(
        expect.objectContaining({ name: 'Paused Bench Press' }),
      );
      expect(
        queryClient.getQueryData<{ data: typeof exercise[]; meta: { limit: number; page: number; total: number } }>(
          workoutQueryKeys.exerciseList(),
        ),
      ).toEqual(
        expect.objectContaining({
          data: [expect.objectContaining({ name: 'Paused Bench Press' })],
        }),
      );
      expect(queryClient.getQueryData<typeof template>(workoutQueryKeys.template('template-1'))).toEqual(
        expect.objectContaining({
          sections: expect.arrayContaining([
            expect.objectContaining({
              exercises: [expect.objectContaining({ exerciseName: 'Paused Bench Press' })],
            }),
          ]),
        }),
      );
      expect(queryClient.getQueryData<typeof session>(workoutQueryKeys.session('session-1'))).toEqual(
        expect.objectContaining({
          exercises: [expect.objectContaining({ exerciseName: 'Paused Bench Press' })],
        }),
      );
    });

    await act(async () => {
      deferred.resolve(
        createJsonResponse({
          ...exercise,
          name: 'Paused Bench Press',
        }),
      );
      await deferred.promise;
    });
  });

  it('reschedules and removes scheduled workouts optimistically', async () => {
    const rescheduleDeferred = createDeferredPromise<Response>();
    const unscheduleDeferred = createDeferredPromise<Response>();
    const { queryClient, wrapper } = createQueryClientWrapper();

    queryClient.setQueryData(
      workoutQueryKeys.scheduledWorkoutList({ from: '2026-03-01', to: '2026-03-31' }),
      scheduledWorkouts,
    );
    mockFetch.mockImplementationOnce(() => rescheduleDeferred.promise);
    mockFetch.mockImplementationOnce(() => unscheduleDeferred.promise);

    const { result: rescheduleResult } = renderHook(() => useRescheduleWorkout(), { wrapper });
    const { result: unscheduleResult } = renderHook(() => useUnscheduleWorkout(), { wrapper });

    act(() => {
      rescheduleResult.current.mutate({
        date: '2026-03-09',
        id: 'scheduled-1',
      });
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData<typeof scheduledWorkouts>(
          workoutQueryKeys.scheduledWorkoutList({ from: '2026-03-01', to: '2026-03-31' }),
        ),
      ).toEqual([expect.objectContaining({ date: '2026-03-09' })]);
    });

    await act(async () => {
      rescheduleDeferred.resolve(
        createJsonResponse({
          id: 'scheduled-1',
          userId: 'user-1',
          templateId: 'template-1',
          date: '2026-03-09',
          sessionId: null,
          createdAt: 1,
          updatedAt: 2,
        }),
      );
      await rescheduleDeferred.promise;
    });

    act(() => {
      unscheduleResult.current.mutate({
        id: 'scheduled-1',
      });
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData<typeof scheduledWorkouts>(
          workoutQueryKeys.scheduledWorkoutList({ from: '2026-03-01', to: '2026-03-31' }),
        ),
      ).toEqual([]);
    });

    await act(async () => {
      unscheduleDeferred.resolve(
        createJsonResponse({
          success: true,
        }),
      );
      await unscheduleDeferred.promise;
    });
  });
});
