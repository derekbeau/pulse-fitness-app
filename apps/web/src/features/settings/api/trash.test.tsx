import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';

import { trashKeys, usePurgeItem, useRestoreItem, useTrashItems } from './trash';

const mockFetch = vi.fn();

const createJsonResponse = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    headers: {
      'Content-Type': 'application/json',
    },
    status: 200,
  });

describe('trash api hooks', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('loads grouped trash items', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        habits: [
          {
            id: 'habit-1',
            type: 'habits',
            name: 'Hydrate',
            deletedAt: '2026-03-11T15:00:00.000Z',
          },
        ],
        'workout-templates': [],
        exercises: [],
        foods: [],
        'workout-sessions': [],
      }),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTrashItems(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.habits).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/trash', expect.any(Object));
  });

  it('restores an item and invalidates related queries', async () => {
    mockFetch.mockResolvedValueOnce(createJsonResponse({ success: true }));

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useRestoreItem(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'habit-1',
        type: 'habits',
      });
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/v1/trash/habits/habit-1/restore',
      expect.objectContaining({ method: 'POST' }));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: trashKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['habits'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['foods'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['workouts'] });
  });

  it('purges an item and invalidates related queries', async () => {
    mockFetch.mockResolvedValueOnce(createJsonResponse({ success: true }));

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => usePurgeItem(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'food-1',
        type: 'foods',
      });
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/v1/trash/foods/food-1',
      expect.objectContaining({ method: 'DELETE' }));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: trashKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['habits'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['foods'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['workouts'] });
  });
});
