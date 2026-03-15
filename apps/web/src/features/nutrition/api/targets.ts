import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateNutritionTargetInput, NutritionTarget } from '@pulse/shared';
import { toast } from 'sonner';

import { apiRequest } from '@/lib/api-client';

export const nutritionTargetQueryKeys = {
  all: ['nutrition-targets'] as const,
  current: () => ['nutrition-targets', 'current'] as const,
};

export const nutritionTargetKeys = nutritionTargetQueryKeys;

const fetchCurrentNutritionTarget = () =>
  apiRequest<NutritionTarget | null>('/api/v1/nutrition-targets/current');

const postNutritionTarget = (input: CreateNutritionTargetInput) =>
  apiRequest<NutritionTarget>('/api/v1/nutrition-targets', {
    body: JSON.stringify(input),
    method: 'POST',
  });

export const useNutritionTargets = () =>
  useQuery({
    queryKey: nutritionTargetQueryKeys.current(),
    queryFn: fetchCurrentNutritionTarget,
  });

export const useUpdateTargets = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postNutritionTarget,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: nutritionTargetQueryKeys.all });
      toast.success('Nutrition targets updated');
    },
  });
};
