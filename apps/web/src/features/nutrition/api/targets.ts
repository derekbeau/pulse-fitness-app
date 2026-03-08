import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateNutritionTargetInput } from '@pulse/shared';

import { apiRequest } from '@/lib/api';

export type NutritionTarget = {
  id: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  effectiveDate: string;
  createdAt: number;
  updatedAt: number;
};

export const nutritionTargetKeys = {
  all: ['nutrition-targets'] as const,
  current: () => [...nutritionTargetKeys.all, 'current'] as const,
};

const fetchCurrentNutritionTarget = () =>
  apiRequest<NutritionTarget | null>('/api/v1/nutrition-targets/current');

const postNutritionTarget = (input: CreateNutritionTargetInput) =>
  apiRequest<NutritionTarget>('/api/v1/nutrition-targets', {
    body: JSON.stringify(input),
    method: 'POST',
  });

export const useNutritionTargets = () =>
  useQuery({
    queryKey: nutritionTargetKeys.current(),
    queryFn: fetchCurrentNutritionTarget,
  });

export const useUpdateTargets = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postNutritionTarget,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: nutritionTargetKeys.all });
    },
  });
};
