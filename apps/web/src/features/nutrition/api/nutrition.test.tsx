import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { habitQueryKeys } from '@/features/habits/api/keys';
import { dashboardSnapshotQueryKeys } from '@/hooks/use-dashboard-snapshot';
import { habitChainQueryKeys } from '@/hooks/use-habit-chains';
import { macroTrendQueryKeys } from '@/hooks/use-macro-trend';
import { createQueryClientWrapper } from '@/test/query-client';

import { nutritionQueryKeys } from './keys';
import {
  useDailyNutrition,
  useDeleteMeal,
  useRenameMeal,
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

  it('normalizes week summary request when called with an ISO timestamp', async () => {
    mockFetch.mockResolvedValueOnce(createJsonResponse([]));

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useNutritionWeekSummary('2026-03-06T03:00:00.000Z'), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/nutrition/week-summary?date=2026-03-06T12%3A00%3A00.000Z',
      expect.any(Object),
    );
  });

  it('deletes a meal and invalidates daily + summary + week-summary cache for that date', async () => {
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
      queryKey: nutritionQueryKeys.daily('2026-03-09'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: nutritionQueryKeys.summary('2026-03-09'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: nutritionQueryKeys.weekSummary('2026-03-09'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: dashboardSnapshotQueryKeys.all,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: macroTrendQueryKeys.all,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitQueryKeys.list(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitQueryKeys.entryList(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitChainQueryKeys.all,
    });
  });

  it('renames a meal and invalidates daily + summary + week-summary cache for that date', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        id: 'meal-1',
        nutritionLogId: 'log-1',
        name: 'Brunch',
        summary: null,
        time: '07:20',
        notes: null,
        createdAt: 1,
        updatedAt: 2,
      }),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useRenameMeal(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        date: '2026-03-09',
        mealId: 'meal-1',
        name: 'Brunch',
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/nutrition/2026-03-09/meals/meal-1',
      expect.objectContaining({
        body: JSON.stringify({ name: 'Brunch' }),
        method: 'PATCH',
      }),
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: nutritionQueryKeys.day('2026-03-09'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: nutritionQueryKeys.summary('2026-03-09'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: nutritionQueryKeys.weekSummary('2026-03-09'),
    });
  });

  it('optimistically updates meal name and rolls back when rename fails', async () => {
    let rejectRenameRequest: (error: Error) => void = () => {};
    mockFetch.mockImplementationOnce(
      () =>
        new Promise<Response>((_resolve, reject) => {
          rejectRenameRequest = reject;
        }),
    );

    const { queryClient, wrapper } = createQueryClientWrapper();
    queryClient.setQueryData(nutritionQueryKeys.day('2026-03-09'), {
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
            summary: null,
            time: '07:20',
            notes: null,
            createdAt: 1,
            updatedAt: 1,
          },
          items: [],
        },
      ],
    });

    const { result } = renderHook(() => useRenameMeal(), { wrapper });

    act(() => {
      result.current.mutate({
        date: '2026-03-09',
        mealId: 'meal-1',
        name: 'Brunch',
      });
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData<{
          meals: Array<{ meal: { name: string } }>;
        }>(nutritionQueryKeys.day('2026-03-09'))?.meals[0]?.meal.name,
      ).toBe('Brunch');
    });

    act(() => {
      rejectRenameRequest(new Error('rename failed'));
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(
      queryClient.getQueryData<{
        meals: Array<{ meal: { name: string } }>;
      }>(nutritionQueryKeys.day('2026-03-09'))?.meals[0]?.meal.name,
    ).toBe('Breakfast');
  });
});
