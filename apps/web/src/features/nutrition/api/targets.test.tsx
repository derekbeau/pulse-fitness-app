import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';

import { nutritionTargetKeys, useNutritionTargets, useUpdateTargets } from './targets';

const mockFetch = vi.fn();

const createJsonResponse = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    headers: {
      'Content-Type': 'application/json',
    },
    status: 200,
  });

describe('nutrition target api hooks', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('loads the current nutrition targets', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        id: 'target-1',
        calories: 2300,
        protein: 190,
        carbs: 260,
        fat: 75,
        effectiveDate: '2026-03-07',
        createdAt: 1,
        updatedAt: 1,
      }),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useNutritionTargets(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.calories).toBe(2300);
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/nutrition-targets/current', expect.any(Object));
  });

  it('supports an empty current nutrition target response', async () => {
    mockFetch.mockResolvedValueOnce(createJsonResponse(null));

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useNutritionTargets(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });

  it('posts updated nutrition targets and invalidates cached target queries', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        id: 'target-2',
        calories: 2250,
        protein: 185,
        carbs: 245,
        fat: 70,
        effectiveDate: '2026-03-07',
        createdAt: 1,
        updatedAt: 2,
      }),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateTargets(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        calories: 2250,
        protein: 185,
        carbs: 245,
        fat: 70,
        effectiveDate: '2026-03-07',
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/nutrition-targets',
      expect.objectContaining({
        body: JSON.stringify({
          calories: 2250,
          protein: 185,
          carbs: 245,
          fat: 70,
          effectiveDate: '2026-03-07',
        }),
        method: 'POST',
      }),
    );
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: nutritionTargetKeys.all });
  });
});
