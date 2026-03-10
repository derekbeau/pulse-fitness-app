import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutSessionListItem } from '@pulse/shared';

import { workoutQueryKeys } from '@/features/workouts/api/workouts';
import { ACTIVE_WORKOUT_SESSION_STORAGE_KEY } from '@/features/workouts/lib/session-persistence';
import { createQueryClientWrapper } from '@/test/query-client';

import { useCompleteSession } from './use-complete-session';
import { workoutSessionQueryKeys } from './use-workout-session';

const mockFetch = vi.fn();

const createJsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  });

const completedSessionResponse = {
  id: 'session-1',
  userId: 'user-1',
  templateId: 'template-1',
  name: 'Upper Push',
  date: '2026-03-08',
  status: 'completed' as const,
  startedAt: 100,
  completedAt: 2_700_000,
  duration: 45,
  feedback: {
    energy: 4,
    recovery: 3,
    technique: 5,
    notes: 'Strong finish',
  },
  notes: 'Strong finish',
  sets: [],
  createdAt: 100,
  updatedAt: 200,
};

describe('use-complete-session hook', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    window.localStorage.setItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY, 'session-1');
  });

  it('completes a session and invalidates session queries', async () => {
    mockFetch.mockResolvedValueOnce(createJsonResponse(completedSessionResponse));

    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setQueryData<WorkoutSessionListItem[]>(workoutQueryKeys.sessionsList({}), [
      {
        completedAt: null,
        createdAt: 100,
        date: '2026-03-08',
        duration: null,
        exerciseCount: 2,
        id: 'session-1',
        name: 'Upper Push',
        startedAt: 100,
        status: 'in-progress',
        templateId: 'template-1',
        templateName: 'Upper Push Template',
      },
    ]);
    queryClient.setQueryData<WorkoutSessionListItem[]>(workoutQueryKeys.completedSessions(), [
      {
        completedAt: 1_000,
        createdAt: 90,
        date: '2026-03-07',
        duration: 41,
        exerciseCount: 5,
        id: 'session-old',
        name: 'Upper Push',
        startedAt: 90,
        status: 'completed',
        templateId: 'template-1',
        templateName: 'Upper Push Template',
      },
    ]);
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCompleteSession('session-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        completedAt: 2_700_000,
        duration: 45,
        feedback: {
          energy: 4,
          recovery: 3,
          technique: 5,
        },
        exerciseNotes: {
          'incline-dumbbell-press': 'Keep shoulders packed',
        },
        notes: 'Strong finish',
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/workout-sessions/session-1',
      expect.objectContaining({
        method: 'PUT',
      }),
    );

    const request = mockFetch.mock.calls.find(
      ([input, init]) => String(input) === '/api/v1/workout-sessions/session-1' && init?.method === 'PUT',
    );

    expect(request).toBeDefined();
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      completedAt: 2_700_000,
      duration: 45,
      feedback: {
        energy: 4,
        recovery: 3,
        technique: 5,
      },
      exerciseNotes: {
        'incline-dumbbell-press': 'Keep shoulders packed',
      },
      notes: 'Strong finish',
      status: 'completed',
    });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: workoutQueryKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: workoutSessionQueryKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutSessionQueryKeys.detail('session-1'),
    });
    expect(window.localStorage.getItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY)).toBeNull();

    expect(queryClient.getQueryData<WorkoutSessionListItem[]>(workoutQueryKeys.sessionsList({}))).toEqual([
      {
        completedAt: 2_700_000,
        createdAt: 100,
        date: '2026-03-08',
        duration: 45,
        exerciseCount: 2,
        id: 'session-1',
        name: 'Upper Push',
        startedAt: 100,
        status: 'completed',
        templateId: 'template-1',
        templateName: 'Upper Push Template',
      },
    ]);
    expect(queryClient.getQueryData(workoutQueryKeys.session('session-1'))).toEqual(
      completedSessionResponse,
    );
    expect(queryClient.getQueryData<WorkoutSessionListItem[]>(workoutQueryKeys.completedSessions())).toEqual([
      {
        completedAt: 2_700_000,
        createdAt: 100,
        date: '2026-03-08',
        duration: 45,
        exerciseCount: 0,
        id: 'session-1',
        name: 'Upper Push',
        startedAt: 100,
        status: 'completed',
        templateId: 'template-1',
        templateName: null,
      },
      {
        completedAt: 1_000,
        createdAt: 90,
        date: '2026-03-07',
        duration: 41,
        exerciseCount: 5,
        id: 'session-old',
        name: 'Upper Push',
        startedAt: 90,
        status: 'completed',
        templateId: 'template-1',
        templateName: 'Upper Push Template',
      },
    ]);
  });

  it('upserts the completed session into list caches when it was missing', async () => {
    mockFetch.mockResolvedValueOnce(createJsonResponse(completedSessionResponse));

    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setQueryData<WorkoutSessionListItem[]>(workoutQueryKeys.sessionsList({}), [
      {
        completedAt: 1_000,
        createdAt: 90,
        date: '2026-03-07',
        duration: 41,
        exerciseCount: 5,
        id: 'session-old',
        name: 'Upper Push',
        startedAt: 90,
        status: 'completed',
        templateId: 'template-1',
        templateName: 'Upper Push Template',
      },
    ]);
    const { result } = renderHook(() => useCompleteSession('session-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        feedback: {
          energy: 4,
          recovery: 3,
          technique: 5,
        },
      });
    });

    expect(queryClient.getQueryData<WorkoutSessionListItem[]>(workoutQueryKeys.sessionsList({}))).toEqual([
      {
        completedAt: 2_700_000,
        createdAt: 100,
        date: '2026-03-08',
        duration: 45,
        exerciseCount: 0,
        id: 'session-1',
        name: 'Upper Push',
        startedAt: 100,
        status: 'completed',
        templateId: 'template-1',
        templateName: null,
      },
      {
        completedAt: 1_000,
        createdAt: 90,
        date: '2026-03-07',
        duration: 41,
        exerciseCount: 5,
        id: 'session-old',
        name: 'Upper Push',
        startedAt: 90,
        status: 'completed',
        templateId: 'template-1',
        templateName: 'Upper Push Template',
      },
    ]);
  });
});
