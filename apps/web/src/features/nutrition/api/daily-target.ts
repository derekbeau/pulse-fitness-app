import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  patchDailyNutritionTargetInputSchema,
  resolvedDailyNutritionTargetSchema,
  type PatchDailyNutritionTargetInput,
} from '@pulse/shared';
import { toast } from 'sonner';

import { dashboardSnapshotQueryKeys } from '@/hooks/use-dashboard-snapshot';
import { apiRequest } from '@/lib/api-client';

import { nutritionQueryKeys } from './keys';

export const fetchDailyNutritionTarget = (date: string, signal?: AbortSignal) =>
  apiRequest<unknown>(`/api/v1/nutrition/${date}/target-override`, {
    method: 'GET',
    signal,
  }).then((value) => resolvedDailyNutritionTargetSchema.parse(value));

export const useDailyNutritionTarget = (date: string) =>
  useQuery({
    enabled: date.length > 0,
    queryKey: nutritionQueryKeys.targetOverride(date),
    queryFn: ({ signal }) => fetchDailyNutritionTarget(date, signal),
  });

const invalidateDailyTargetConsumers = async (
  queryClient: ReturnType<typeof useQueryClient>,
  date: string,
) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: nutritionQueryKeys.targetOverride(date) }),
    queryClient.invalidateQueries({ queryKey: nutritionQueryKeys.summary(date) }),
    queryClient.invalidateQueries({ queryKey: nutritionQueryKeys.energyAdherence(date) }),
    queryClient.invalidateQueries({ queryKey: nutritionQueryKeys.weekSummary(date) }),
    queryClient.invalidateQueries({ queryKey: dashboardSnapshotQueryKeys.detail(date) }),
  ]);
};

export const usePatchDailyNutritionTarget = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ date, input }: { date: string; input: PatchDailyNutritionTargetInput }) =>
      apiRequest<unknown>(`/api/v1/nutrition/${date}/target-override`, {
        method: 'PATCH',
        body: patchDailyNutritionTargetInputSchema.parse(input),
      }).then((value) => resolvedDailyNutritionTargetSchema.parse(value)),
    onSuccess: async (_data, { date }) => {
      await invalidateDailyTargetConsumers(queryClient, date);
      toast.success('Daily targets adjusted');
    },
  });
};

export const useRestoreDailyNutritionTarget = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (date: string) =>
      apiRequest<unknown>(`/api/v1/nutrition/${date}/target-override`, {
        method: 'DELETE',
      }).then((value) => resolvedDailyNutritionTargetSchema.parse(value)),
    onSuccess: async (_data, date) => {
      await invalidateDailyTargetConsumers(queryClient, date);
      toast.success('Daily targets restored');
    },
  });
};
