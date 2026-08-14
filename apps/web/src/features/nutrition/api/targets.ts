import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type CreateNutritionTargetInput, nutritionTargetSchema } from '@pulse/shared';
import { toast } from 'sonner';

import { apiRequest } from '@/lib/api-client';
import { crossFeatureInvalidationMap, invalidateQueryKeys } from '@/lib/query-invalidation';

export const nutritionTargetQueryKeys = {
  all: ['nutrition-targets'] as const,
  current: () => ['nutrition-targets', 'current'] as const,
};

export const nutritionTargetKeys = nutritionTargetQueryKeys;

const fetchCurrentNutritionTarget = () =>
  apiRequest<unknown>('/api/v1/nutrition-targets/current').then((value) =>
    nutritionTargetSchema.nullable().parse(value),
  );

const postNutritionTarget = (input: CreateNutritionTargetInput) =>
  apiRequest<unknown>('/api/v1/nutrition-targets', {
    body: JSON.stringify(input),
    method: 'POST',
  }).then((value) => nutritionTargetSchema.parse(value));

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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: nutritionTargetQueryKeys.all }),
        invalidateQueryKeys(queryClient, crossFeatureInvalidationMap.nutritionTargetMutation()),
      ]);
      toast.success('Nutrition targets updated');
    },
  });
};
