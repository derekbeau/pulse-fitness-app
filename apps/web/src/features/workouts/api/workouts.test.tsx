import { act, renderHook, waitFor } from '@testing-library/react';
import type { WorkoutSession } from '@pulse/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { createQueryClientWrapper } from '@/test/query-client';

import { useCorrectSessionSets, workoutQueryKeys } from './workouts';

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

const mockFetch = vi.fn();

const createJsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  });

function createDeferredResponse() {
  let resolve: ((value: Response) => void) | undefined;

  const promise = new Promise<Response>((nextResolve) => {
    resolve = nextResolve;
  });

  if (!resolve) {
    throw new Error('Expected deferred resolver');
  }

  return {
    promise,
    resolve,
  };
}

describe('workouts api corrections', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('optimistically updates the session cache and invalidates receipt queries on success', async () => {
    const deferredResponse = createDeferredResponse();
    mockFetch.mockImplementationOnce(() => deferredResponse.promise);

    const initialSession = createSession();
    const initialExercise = initialSession.exercises?.[0];

    if (!initialExercise) {
      throw new Error('Expected seeded workout session exercise data');
    }

    const correctedSession = createSession({
      exercises: [
        {
          ...initialExercise,
          sets: [
            {
              ...initialExercise.sets[0],
              weight: 190,
            },
          ],
        },
      ],
      sets: [
        {
          ...initialSession.sets[0],
          weight: 190,
        },
      ],
    });
    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(workoutQueryKeys.session(initialSession.id), initialSession);

    const { result } = renderHook(() => useCorrectSessionSets(initialSession.id), { wrapper });

    act(() => {
      result.current.mutate([
        {
          setId: 'set-1',
          weight: 190,
        },
      ]);
    });

    await waitFor(() => {
      const optimisticSession = queryClient.getQueryData<WorkoutSession>(
        workoutQueryKeys.session(initialSession.id),
      );

      expect(optimisticSession?.sets[0]?.weight).toBe(190);
      expect(optimisticSession?.exercises?.[0]?.sets[0]?.weight).toBe(190);
    });

    deferredResponse.resolve(createJsonResponse(correctedSession));

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/v1/workout-sessions/${initialSession.id}/corrections`,
      expect.objectContaining({
        body: JSON.stringify({
          corrections: [
            {
              setId: 'set-1',
              weight: 190,
            },
          ],
        }),
        method: 'PATCH',
      }),
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.session(initialSession.id),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.completedSessions(),
    });
    expect(toast.success).toHaveBeenCalledWith('Workout corrections saved');
  });

  it('rolls back the optimistic session cache when the correction request fails', async () => {
    const deferredResponse = createDeferredResponse();
    mockFetch.mockImplementationOnce(() => deferredResponse.promise);

    const initialSession = createSession();
    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setQueryData(workoutQueryKeys.session(initialSession.id), initialSession);

    const { result } = renderHook(() => useCorrectSessionSets(initialSession.id), { wrapper });

    act(() => {
      result.current.mutate([
        {
          setId: 'set-1',
          weight: 190,
        },
      ]);
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData<WorkoutSession>(workoutQueryKeys.session(initialSession.id))
          ?.sets[0]?.weight,
      ).toBe(190);
    });

    deferredResponse.resolve(
      new Response(
        JSON.stringify({
          error: {
            code: 'WORKOUT_SESSION_NOT_FOUND',
            message: 'Workout session not found',
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

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(
      queryClient.getQueryData<WorkoutSession>(workoutQueryKeys.session(initialSession.id))?.sets[0]
        ?.weight,
    ).toBe(185);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('Failed to save corrections. Please try again.');
  });
});

function createSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 'session-1',
    userId: 'user-1',
    templateId: 'template-1',
    name: 'Upper Push',
    date: '2026-03-12',
    status: 'completed',
    startedAt: 100,
    completedAt: 200,
    duration: 60,
    timeSegments: [
      {
        end: '2026-03-12T11:00:00.000Z',
        section: 'main',
        start: '2026-03-12T10:00:00.000Z',
      },
    ],
    sectionDurations: {
      warmup: 0,
      main: 3_600_000,
      cooldown: 0,
      supplemental: 0,
    },
    feedback: null,
    notes: null,
    exercises: [
      {
        exerciseId: 'global-bench-press',
        exerciseName: 'Bench Press',
        supersetGroup: null,
        orderIndex: 0,
        section: 'main',
        programmingNotes: null,
        agentNotes: null,
        agentNotesMeta: null,
        sets: [
          {
            id: 'set-1',
            exerciseId: 'global-bench-press',
            orderIndex: 0,
            setNumber: 1,
            weight: 185,
            reps: 8,
            completed: true,
            skipped: false,
            section: 'main',
            notes: null,
            createdAt: 1,
          },
        ],
        trackingType: 'weight_reps',
      },
    ],
    sets: [
      {
        id: 'set-1',
        exerciseId: 'global-bench-press',
        orderIndex: 0,
        setNumber: 1,
        weight: 185,
        reps: 8,
        completed: true,
        skipped: false,
        section: 'main',
        notes: null,
        createdAt: 1,
      },
    ],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}
