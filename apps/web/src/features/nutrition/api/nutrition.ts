import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DailyNutrition,
  DeleteMealResult,
  NutritionSummary,
  NutritionWeekSummary,
} from '@pulse/shared';
import { toast } from 'sonner';

import { apiRequest } from '@/lib/api-client';

import { nutritionQueryKeys } from './keys';

export type DeleteMealInput = {
  date: string;
  mealId: string;
};

const fetchDailyNutrition = (date: string, signal?: AbortSignal) =>
  apiRequest<DailyNutrition>(`/api/v1/nutrition/${date}`, {
    method: 'GET',
    signal,
  });

const fetchNutritionSummary = (date: string, signal?: AbortSignal) =>
  apiRequest<NutritionSummary>(`/api/v1/nutrition/${date}/summary`, {
    method: 'GET',
    signal,
  });

const fetchNutritionWeekSummary = (date: string, signal?: AbortSignal) => {
  const dateOnly = date.length > 10 ? date.slice(0, 10) : date;

  return apiRequest<NutritionWeekSummary>(
    `/api/v1/nutrition/week-summary?date=${encodeURIComponent(`${dateOnly}T12:00:00.000Z`)}`,
    {
      method: 'GET',
      signal,
    },
  );
};

const deleteMeal = ({ date, mealId }: DeleteMealInput) =>
  apiRequest<DeleteMealResult>(`/api/v1/nutrition/${date}/meals/${mealId}`, {
    method: 'DELETE',
  });

export const useDailyNutrition = (date: string) =>
  useQuery({
    queryKey: nutritionQueryKeys.day(date),
    queryFn: ({ signal }) => fetchDailyNutrition(date, signal),
  });

export const useNutritionSummary = (date: string) =>
  useQuery({
    queryKey: nutritionQueryKeys.summary(date),
    queryFn: ({ signal }) => fetchNutritionSummary(date, signal),
  });

export const useNutritionWeekSummary = (date: string) =>
  useQuery({
    queryKey: nutritionQueryKeys.weekSummary(date),
    queryFn: ({ signal }) => fetchNutritionWeekSummary(date, signal),
  });

export const prefetchNutritionDay = async (queryClient: QueryClient, date: string) => {
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: nutritionQueryKeys.day(date),
      queryFn: ({ signal }) => fetchDailyNutrition(date, signal),
    }),
    queryClient.prefetchQuery({
      queryKey: nutritionQueryKeys.summary(date),
      queryFn: ({ signal }) => fetchNutritionSummary(date, signal),
    }),
  ]);
};

export const useDeleteMeal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteMeal,
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: nutritionQueryKeys.day(variables.date),
        }),
        queryClient.invalidateQueries({
          queryKey: nutritionQueryKeys.summary(variables.date),
        }),
        queryClient.invalidateQueries({
          queryKey: nutritionQueryKeys.weekSummary(variables.date),
        }),
      ]);
      toast.success('Meal deleted');
    },
  });
};
