import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';

import { nutritionKeys } from './keys';
import {
  useDailyNutrition,
  useDeleteMeal,
  useNutritionSummary,
  useNutritionWeekSummary,
} from './nutrition';

const mockFetch = vi.fn();

const createJsonResponse = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    headers: {
      'Content-Type': 'application/json',
    },
    status: 200,
  });

describe('nutrition api hooks', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('loads daily nutrition for a given date', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        log: {
          id: 'log-1',
          userId: 'user-1',
          date: '2026-03-09',
          notes: null,
          createdAt: 1,
          updatedAt: 1,
        },
        meals: [
          {
            meal: {
              id: 'meal-1',
              nutritionLogId: 'log-1',
              name: 'Breakfast',
              summary: 'Large Eggs',
              time: '07:20',
              notes: null,
              createdAt: 1,
              updatedAt: 1,
            },
            items: [
              {
                id: 'item-1',
                mealId: 'meal-1',
                foodId: 'food-eggs',
                name: 'Large Eggs',
                amount: 3,
                unit: 'eggs',
                calories: 210,
                protein: 18,
                carbs: 1,
                fat: 15,
                fiber: null,
                sugar: null,
                displayQuantity: null,
                displayUnit: null,
                createdAt: 1,
              },
            ],
          },
        ],
      }),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useDailyNutrition('2026-03-09'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.log.id).toBe('log-1');
    expect(result.current.data?.meals[0]?.meal.id).toBe('meal-1');
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/nutrition/2026-03-09', expect.any(Object));
  });

  it('loads daily nutrition summary for a given date', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        date: '2026-03-09',
        meals: 3,
        actual: {
          calories: 1984,
          protein: 172,
          carbs: 211,
          fat: 62,
        },
        target: {
          calories: 2200,
          protein: 180,
          carbs: 250,
          fat: 73,
        },
      }),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useNutritionSummary('2026-03-09'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.actual.calories).toBe(1984);
    expect(result.current.data?.target?.protein).toBe(180);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/nutrition/2026-03-09/summary',
      expect.any(Object),
    );
  });

  it('loads nutrition week summary for the selected date', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse(
        Array.from({ length: 7 }, (_, index) => ({
          date: `2026-03-${String(index + 2).padStart(2, '0')}`,
          calories: 2000 + index * 10,
          caloriesTarget: 2200,
          protein: 160 + index,
          proteinTarget: 180,
          mealCount: index % 2 === 0 ? 3 : 2,
          completeness: 0.9,
        })),
      ),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useNutritionWeekSummary('2026-03-06'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(7);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/nutrition/week-summary?date=2026-03-06T12%3A00%3A00.000Z',
      expect.any(Object),
    );
  });

  it('deletes a meal and invalidates daily + summary cache for that date', async () => {
    mockFetch.mockResolvedValueOnce(createJsonResponse({ success: true }));

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteMeal(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        date: '2026-03-09',
        mealId: 'meal-1',
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/nutrition/2026-03-09/meals/meal-1',
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: nutritionKeys.daily('2026-03-09'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: nutritionKeys.summary('2026-03-09'),
    });
  });
});
