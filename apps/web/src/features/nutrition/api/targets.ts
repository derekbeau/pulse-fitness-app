import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateNutritionTargetInput, NutritionTarget } from '@pulse/shared';
import { toast } from 'sonner';

import { apiRequest } from '@/lib/api-client';

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
      toast.success('Nutrition targets updated');
    },
  });
};
