import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { ACTIVE_WORKOUT_SESSION_STORAGE_KEY } from '@/features/workouts/lib/session-persistence';
import { workoutQueryKeys } from '@/features/workouts/api/workouts';
import { dashboardSnapshotQueryKeys } from '@/hooks/use-dashboard-snapshot';
import { createQueryClientWrapper } from '@/test/query-client';

import {
  useReorderSessionExercises,
  useStartSession,
  useUpdateSessionStartTime,
  useUpdateSessionStatus,
  useUpdateSessionTimeSegments,
  useWorkoutSession,
  workoutSessionQueryKeys,
} from './use-workout-session';

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
  timeSegments: [
    {
      start: '2026-03-08T00:00:00.000Z',
      end: null,
    },
  ],
  feedback: null,
  notes: null,
  sets: [],
  createdAt: 100,
  updatedAt: 100,
};

describe('use-workout-session hooks', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    window.localStorage.removeItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY);
  });

  it('loads a workout session by id', async () => {
    mockFetch.mockResolvedValueOnce(createJsonResponse(sessionResponse));

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useWorkoutSession('session-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.id).toBe('session-1');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/workout-sessions/session-1',
      expect.any(Object),
    );
  });

  it('starts a session and invalidates list/detail queries', async () => {
    mockFetch.mockResolvedValueOnce(createJsonResponse(sessionResponse, 201));

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useStartSession(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        date: '2026-03-08',
        name: 'Upper Push',
        sets: [],
        startedAt: 100,
        templateId: 'template-1',
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/workout-sessions',
      expect.objectContaining({
        method: 'POST',
      }),
    );

    const createRequest = mockFetch.mock.calls.find(
      ([input, init]) => String(input) === '/api/v1/workout-sessions' && init?.method === 'POST',
    );

    expect(createRequest).toBeDefined();
    expect(JSON.parse(String(createRequest?.[1]?.body))).toMatchObject({
      date: '2026-03-08',
      name: 'Upper Push',
      templateId: 'template-1',
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
    expect(window.localStorage.getItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY)).toBe('session-1');
  });

  it('patches session start time and refreshes the session query', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        ...sessionResponse,
        startedAt: 200,
      }),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateSessionStartTime('session-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        startedAt: 200,
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/workout-sessions/session-1',
      expect.objectContaining({
        method: 'PATCH',
      }),
    );

    const patchRequest = mockFetch.mock.calls.find(
      ([input, init]) =>
        String(input) === '/api/v1/workout-sessions/session-1' && init?.method === 'PATCH',
    );

    expect(patchRequest).toBeDefined();
    expect(JSON.parse(String(patchRequest?.[1]?.body))).toMatchObject({
      startedAt: 200,
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutSessionQueryKeys.detail('session-1'),
    });
    expect(toast.success).toHaveBeenCalledWith('Workout start time updated');
  });

  it('updates workout status and refreshes session + list caches', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        ...sessionResponse,
        status: 'paused',
        timeSegments: [
          {
            start: '2026-03-08T00:00:00.000Z',
            end: '2026-03-08T00:05:00.000Z',
          },
        ],
      }),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateSessionStatus('session-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        status: 'paused',
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/workout-sessions/session-1',
      expect.objectContaining({
        method: 'PATCH',
      }),
    );

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: workoutSessionQueryKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutSessionQueryKeys.detail('session-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: dashboardSnapshotQueryKeys.all,
    });
    expect(toast.success).toHaveBeenCalledWith('Workout paused');
  });

  it('updates workout time segments via dedicated endpoint', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        ...sessionResponse,
        status: 'paused',
        duration: 10,
        timeSegments: [
          {
            start: '2026-03-08T00:00:00.000Z',
            end: '2026-03-08T00:10:00.000Z',
          },
        ],
      }),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useUpdateSessionTimeSegments('session-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        timeSegments: [
          {
            start: '2026-03-08T00:00:00.000Z',
            end: '2026-03-08T00:10:00.000Z',
          },
        ],
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/workout-sessions/session-1/time-segments',
      expect.objectContaining({
        method: 'PATCH',
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Workout timing updated');
  });

  it('reorders workout session exercises via dedicated endpoint', async () => {
    mockFetch.mockResolvedValueOnce(createJsonResponse(sessionResponse));

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useReorderSessionExercises('session-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        section: 'main',
        exerciseIds: ['exercise-2', 'exercise-1'],
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/workout-sessions/session-1/reorder',
      expect.objectContaining({
        method: 'PATCH',
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Workout exercise order updated');
  });
});
