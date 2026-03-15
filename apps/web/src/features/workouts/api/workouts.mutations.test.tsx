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

  it('invalidates session detail and list caches when swapping a session exercise', async () => {
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
        sets: [],
        createdAt: 1,
        updatedAt: 2,
      }),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useSwapSessionExercise(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        exerciseId: 'exercise-1',
        newExerciseId: 'exercise-2',
        sessionId: 'session-1',
      });
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.sessions(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutQueryKeys.session('session-1'),
    });
    expect(toast.success).toHaveBeenCalledWith('Exercise swapped');
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
