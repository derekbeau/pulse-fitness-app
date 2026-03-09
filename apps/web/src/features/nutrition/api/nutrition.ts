import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api-client';

import { nutritionKeys } from './keys';

export type NutritionLog = {
  id: string;
  userId: string;
  date: string;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
};

export type NutritionMealRecord = {
  id: string;
  nutritionLogId: string;
  name: string;
  time: string | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
};

export type NutritionMealItem = {
  id: string;
  mealId: string;
  foodId: string | null;
  name: string;
  amount: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
  createdAt: number;
};

export type DailyNutrition = {
  log: NutritionLog;
  meals: Array<{
    meal: NutritionMealRecord;
    items: NutritionMealItem[];
  }>;
} | null;

export type NutritionSummary = {
  date: string;
  meals: number;
  actual: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  target: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  } | null;
};

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
  apiRequest<{ success: true }>(`/api/v1/nutrition/${date}/meals/${mealId}`, {
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
    },
  });
};
