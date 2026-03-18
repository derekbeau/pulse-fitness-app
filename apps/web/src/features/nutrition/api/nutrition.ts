import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DailyNutrition,
  DeleteMealResult,
  NutritionMeal,
  NutritionSummary,
  NutritionWeekSummary,
} from '@pulse/shared';
import { toast } from 'sonner';

import { crossFeatureInvalidationMap, invalidateQueryKeys } from '@/lib/query-invalidation';
import { apiRequest } from '@/lib/api-client';

import { nutritionQueryKeys } from './keys';

export type DeleteMealInput = {
  date: string;
  mealId: string;
};

export type RenameMealInput = {
  date: string;
  mealId: string;
  name: string;
};

type RenameMealMutationContext = {
  previousDailyNutrition: DailyNutrition | null | undefined;
};

type NutritionQueryOptions = {
  enabled?: boolean;
  refetchIntervalMs?: number;
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

const renameMeal = ({ date, mealId, name }: RenameMealInput) =>
  apiRequest<NutritionMeal>(`/api/v1/nutrition/${date}/meals/${mealId}`, {
    body: {
      name,
    },
    method: 'PATCH',
  });

const renameMealInDailyNutrition = (
  dailyNutrition: DailyNutrition | null | undefined,
  mealId: string,
  name: string,
): DailyNutrition | null | undefined => {
  if (!dailyNutrition) {
    return dailyNutrition;
  }

  return {
    ...dailyNutrition,
    meals: dailyNutrition.meals.map((entry) =>
      entry.meal.id === mealId
        ? {
            ...entry,
            meal: {
              ...entry.meal,
              name,
            },
          }
        : entry,
    ),
  };
};

export const useDailyNutrition = (date: string, options: NutritionQueryOptions = {}) =>
  useQuery({
    enabled: (options.enabled ?? true) && date.length > 0,
    queryKey: nutritionQueryKeys.day(date),
    queryFn: ({ signal }) => fetchDailyNutrition(date, signal),
    refetchInterval: options.refetchIntervalMs ?? false,
    refetchIntervalInBackground: false,
  });

export const useNutritionSummary = (date: string, options: NutritionQueryOptions = {}) =>
  useQuery({
    enabled: (options.enabled ?? true) && date.length > 0,
    queryKey: nutritionQueryKeys.summary(date),
    queryFn: ({ signal }) => fetchNutritionSummary(date, signal),
    refetchInterval: options.refetchIntervalMs ?? false,
    refetchIntervalInBackground: false,
  });

export const useNutritionWeekSummary = (date: string, options: NutritionQueryOptions = {}) =>
  useQuery({
    enabled: (options.enabled ?? true) && date.length > 0,
    queryKey: nutritionQueryKeys.weekSummary(date),
    queryFn: ({ signal }) => fetchNutritionWeekSummary(date, signal),
    refetchInterval: options.refetchIntervalMs ?? false,
    refetchIntervalInBackground: false,
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
        invalidateQueryKeys(queryClient, crossFeatureInvalidationMap.mealMutation()),
      ]);
      toast.success('Meal deleted');
    },
  });
};

export const useRenameMeal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: renameMeal,
    onMutate: async (variables): Promise<RenameMealMutationContext> => {
      await queryClient.cancelQueries({
        queryKey: nutritionQueryKeys.day(variables.date),
      });

      const previousDailyNutrition = queryClient.getQueryData<DailyNutrition | null>(
        nutritionQueryKeys.day(variables.date),
      );

      queryClient.setQueryData<DailyNutrition | null>(
        nutritionQueryKeys.day(variables.date),
        (currentDailyNutrition) =>
          renameMealInDailyNutrition(currentDailyNutrition, variables.mealId, variables.name) ??
          null,
      );

      return {
        previousDailyNutrition,
      };
    },
    onError: (_error, variables, context) => {
      queryClient.setQueryData(
        nutritionQueryKeys.day(variables.date),
        context?.previousDailyNutrition,
      );
    },
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
        invalidateQueryKeys(queryClient, crossFeatureInvalidationMap.mealMutation()),
      ]);
      toast.success('Meal renamed');
    },
  });
};
