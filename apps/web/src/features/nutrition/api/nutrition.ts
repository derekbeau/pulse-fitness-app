import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DailyNutrition, DeleteMealResult, NutritionSummary } from '@pulse/shared';
import { toast } from 'sonner';

import { apiRequest } from '@/lib/api-client';

import { nutritionKeys } from './keys';

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

const deleteMeal = ({ date, mealId }: DeleteMealInput) =>
  apiRequest<DeleteMealResult>(`/api/v1/nutrition/${date}/meals/${mealId}`, {
    method: 'DELETE',
  });

export const useDailyNutrition = (date: string) =>
  useQuery({
    queryKey: nutritionKeys.daily(date),
    queryFn: ({ signal }) => fetchDailyNutrition(date, signal),
  });

export const useNutritionSummary = (date: string) =>
  useQuery({
    queryKey: nutritionKeys.summary(date),
    queryFn: ({ signal }) => fetchNutritionSummary(date, signal),
  });

export const useDeleteMeal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteMeal,
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: nutritionKeys.daily(variables.date),
        }),
        queryClient.invalidateQueries({
          queryKey: nutritionKeys.summary(variables.date),
        }),
      ]);
      toast.success('Meal deleted');
    },
  });
};
