import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { workoutQueryKeys } from '@/features/workouts/api/workouts';
import { createQueryClientWrapper } from '@/test/query-client';

import { useSaveAsTemplate } from './use-save-as-template';
import { workoutSessionQueryKeys } from './use-workout-session';

const mockFetch = vi.fn();

const createJsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  });

const templateResponse = {
  id: 'template-from-session',
  userId: 'user-1',
  name: 'Upper Push',
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
          exerciseId: 'global-bench-press',
          exerciseName: 'Bench Press',
          sets: 3,
          repsMin: null,
          repsMax: null,
          tempo: null,
          restSeconds: null,
          supersetGroup: null,
          notes: null,
          cues: [],
        },
      ],
    },
    {
      type: 'cooldown' as const,
      exercises: [],
    },
  ],
  createdAt: 100,
  updatedAt: 100,
};

describe('use-save-as-template hook', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('posts save-as-template and invalidates related queries', async () => {
    mockFetch.mockResolvedValueOnce(createJsonResponse(templateResponse, 201));

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useSaveAsTemplate('session-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/workout-sessions/session-1/save-as-template',
      expect.objectContaining({
        method: 'POST',
      }),
    );

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: workoutQueryKeys.templates() });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: workoutSessionQueryKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: workoutSessionQueryKeys.detail('session-1'),
    });
  });

  it('throws when session id is missing', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useSaveAsTemplate(null), { wrapper });

    await expect(result.current.mutateAsync(undefined)).rejects.toThrow(
      'Session id is required to save as template',
    );
  });
});
