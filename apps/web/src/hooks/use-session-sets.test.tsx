import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';

import { workoutSessionQueryKeys } from './use-workout-session';
import { useLogSet, useUpdateSet } from './use-session-sets';

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

describe('use-session-sets hooks', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('logs a set for a session and invalidates session queries', async () => {
    mockFetch.mockResolvedValueOnce(createJsonResponse(sessionSetResponse, 201));

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useLogSet('session-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        exerciseId: 'incline-dumbbell-press',
        reps: 8,
        section: 'main',
        setNumber: 1,
        weight: 60,
      });
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
      exerciseId: 'incline-dumbbell-press',
      reps: 8,
      seconds: null,
      distance: null,
      section: 'main',
      setNumber: 1,
      weight: 60,
    });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: workoutSessionQueryKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutSessionQueryKeys.detail('session-1'),
    });
  });

  it('updates a set for a session and invalidates session queries', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        ...sessionSetResponse,
        completed: true,
        reps: 9,
      }),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateSet('session-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        setId: 'set-1',
        update: {
          completed: true,
          reps: 9,
        },
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/workout-sessions/session-1/sets/set-1',
      expect.objectContaining({
        method: 'PATCH',
      }),
    );

    const request = mockFetch.mock.calls.find(
      ([input, init]) =>
        String(input) === '/api/v1/workout-sessions/session-1/sets/set-1' &&
        init?.method === 'PATCH',
    );

    expect(request).toBeDefined();
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      completed: true,
      reps: 9,
    });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: workoutSessionQueryKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutSessionQueryKeys.detail('session-1'),
    });
  });
});
