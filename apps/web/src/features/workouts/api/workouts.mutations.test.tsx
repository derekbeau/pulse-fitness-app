import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { dashboardSnapshotQueryKeys } from '@/hooks/use-dashboard-snapshot';
import { createQueryClientWrapper } from '@/test/query-client';

import {
  useDeleteTemplate,
  useReorderTemplateExercises,
  useSwapSessionExercise,
  useSwapTemplateExercise,
  useUpdateSessionSectionTimer,
  useUpdateExercise,
  useUpdateTemplate,
  workoutQueryKeys,
} from './workouts';

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

describe('workout mutation hooks', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('invalidates session detail caches when updating an exercise', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        id: 'exercise-1',
        userId: 'user-1',
        name: 'Incline Bench Press',
        muscleGroups: ['chest'],
        equipment: 'barbell',
        category: 'compound',
        trackingType: 'weight_reps',
        tags: [],
        formCues: [],
        instructions: null,
        coachingNotes: null,
        relatedExerciseIds: [],
        createdAt: 1,
        updatedAt: 2,
      }),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateExercise(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'exercise-1',
        input: {
          name: 'Incline Bench Press',
        },
      });
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.sessionDetailPrefix(),
    });
    expect(toast.success).toHaveBeenCalledWith('Exercise updated');
  });

  it('invalidates template-adjacent workout caches when updating a template', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        id: 'template-1',
        userId: 'user-1',
        name: 'Upper Push Plus',
        description: null,
        tags: [],
        sections: [
          { type: 'warmup', exercises: [] },
          { type: 'main', exercises: [] },
          { type: 'cooldown', exercises: [] },
        ],
        createdAt: 1,
        updatedAt: 2,
      }),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateTemplate(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'template-1',
        input: {
          name: 'Upper Push Plus',
        },
      });
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.scheduledWorkoutListRoot(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.sessions(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: dashboardSnapshotQueryKeys.all,
    });
    expect(toast.success).toHaveBeenCalledWith('Template updated');
  });

  it('invalidates dashboard and adjacent workout caches when deleting a template', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        success: true,
      }),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteTemplate(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'template-1',
      });
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.templateList(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.template('template-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.scheduledWorkoutListRoot(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.sessions(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: dashboardSnapshotQueryKeys.all,
    });
    expect(toast.success).toHaveBeenCalledWith('Template deleted');
  });

  it('invalidates dashboard and scheduled workout caches when swapping a template exercise', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        id: 'template-1',
        userId: 'user-1',
        name: 'Upper Push Plus',
        description: null,
        tags: [],
        sections: [
          { type: 'warmup', exercises: [] },
          { type: 'main', exercises: [] },
          { type: 'cooldown', exercises: [] },
        ],
        createdAt: 1,
        updatedAt: 2,
      }),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useSwapTemplateExercise(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        exerciseId: 'exercise-1',
        newExerciseId: 'exercise-2',
        templateId: 'template-1',
      });
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.templateList(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.template('template-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.scheduledWorkoutListRoot(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: dashboardSnapshotQueryKeys.all,
    });
    expect(toast.success).toHaveBeenCalledWith('Exercise swapped');
  });

  it('writes through and invalidates active-session caches when swapping a session exercise', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        id: 'session-1',
        userId: 'user-1',
        templateId: 'template-1',
        name: 'Upper Push Plus',
        date: '2026-03-08',
        status: 'in-progress',
        startedAt: 1,
        completedAt: null,
        duration: null,
        timeSegments: [],
        feedback: null,
        notes: null,
        exercises: [
          {
            id: 'session-exercise-1',
            exerciseId: 'exercise-2',
            exerciseName: 'Single-Arm Cable Press',
            orderIndex: 0,
            section: 'main',
            notes: null,
            supersetGroup: null,
            sets: [
              {
                id: 'set-1',
                exerciseId: 'exercise-2',
                setNumber: 1,
                orderIndex: 0,
                weight: null,
                reps: null,
                targetWeight: null,
                targetWeightMin: null,
                targetWeightMax: null,
                targetSeconds: null,
                targetDistance: null,
                completed: false,
                skipped: false,
                section: 'main',
                notes: null,
                createdAt: 1,
              },
            ],
          },
        ],
        sets: [
          {
            id: 'set-1',
            exerciseId: 'exercise-2',
            setNumber: 1,
            orderIndex: 0,
            weight: null,
            reps: null,
            targetWeight: null,
            targetWeightMin: null,
            targetWeightMax: null,
            targetSeconds: null,
            targetDistance: null,
            completed: false,
            skipped: false,
            section: 'main',
            notes: null,
            createdAt: 1,
          },
        ],
        createdAt: 1,
        updatedAt: 2,
      }),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useSwapSessionExercise(), { wrapper });

    const response = await act(async () => {
      return await result.current.mutateAsync({
        exerciseId: 'exercise-1',
        newExerciseId: 'exercise-2',
        sessionId: 'session-1',
      });
    });

    expect(queryClient.getQueryData(['workout-sessions', 'session-1'])).toEqual(response.data);
    expect(queryClient.getQueryData(workoutQueryKeys.session('session-1'))).toEqual(response.data);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.sessions(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['workout-sessions', 'session-1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.session('session-1'),
    });
    expect(toast.success).toHaveBeenCalledWith('Exercise swapped');
  });

  it('syncs both session-detail key families when updating a section timer', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        id: 'session-1',
        userId: 'user-1',
        templateId: 'template-1',
        name: 'Upper Push Plus',
        date: '2026-03-08',
        status: 'in-progress',
        startedAt: 1,
        completedAt: null,
        duration: null,
        timeSegments: [
          {
            start: '2026-03-08T00:00:00.000Z',
            end: null,
            section: 'warmup',
          },
        ],
        sectionDurations: {
          warmup: 0,
          main: 0,
          cooldown: 0,
          supplemental: 0,
        },
        feedback: null,
        notes: null,
        sets: [],
        createdAt: 1,
        updatedAt: 2,
      }),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const setQueryData = vi.spyOn(queryClient, 'setQueryData');
    const { result } = renderHook(() => useUpdateSessionSectionTimer('session-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        action: 'start',
        section: 'warmup',
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/workout-sessions/session-1/section-timer',
      expect.objectContaining({
        method: 'PATCH',
      }),
    );
    expect(setQueryData).toHaveBeenCalledWith(
      workoutQueryKeys.session('session-1'),
      expect.objectContaining({ id: 'session-1' }),
    );
    expect(setQueryData).toHaveBeenCalledWith(
      ['workout-sessions', 'session-1'],
      expect.objectContaining({ id: 'session-1' }),
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.sessions(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.session('session-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['workout-sessions', 'session-1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['workout-sessions'],
    });
  });

  it('invalidates dashboard snapshot queries when reordering template exercises', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        id: 'template-1',
        userId: 'user-1',
        name: 'Upper Push Plus',
        description: null,
        tags: [],
        sections: [
          { type: 'warmup', exercises: [] },
          { type: 'main', exercises: [] },
          { type: 'cooldown', exercises: [] },
        ],
        createdAt: 1,
        updatedAt: 2,
      }),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useReorderTemplateExercises(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        exerciseIds: [],
        section: 'main',
        templateId: 'template-1',
      });
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.templateList(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.template('template-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: dashboardSnapshotQueryKeys.all,
    });
    expect(toast.success).toHaveBeenCalledWith('Template exercise order updated');
  });

  it('shows the global error toast when updating a template fails', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 'NOT_FOUND',
            message: 'Template not found',
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
    const { result } = renderHook(() => useUpdateTemplate(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          id: 'missing-template',
          input: {
            name: 'Does not matter',
          },
        }),
      ).rejects.toThrow('Template not found');
    });

    expect(toast.error).toHaveBeenCalledWith('The requested item was not found');
  });
});
