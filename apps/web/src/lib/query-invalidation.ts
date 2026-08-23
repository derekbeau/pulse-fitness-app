import type { QueryClient, QueryKey } from '@tanstack/react-query';

import { habitQueryKeys } from '@/features/habits/api/keys';
import { dashboardSnapshotQueryKeys } from '@/hooks/use-dashboard-snapshot';
import { habitChainQueryKeys } from '@/hooks/use-habit-chains';
import { macroTrendQueryKeys } from '@/hooks/use-macro-trend';
import { recentWorkoutQueryKeys } from '@/hooks/use-recent-workouts';
import { dashboardWeightTrendQueryKeys } from '@/hooks/use-weight-trend';
import { nutritionQueryKeys } from '@/features/nutrition/api/keys';

export const adaptiveNutritionQueryKey = ['adaptive-nutrition'] as const;
export const dataQualityQueryKey = ['data-quality'] as const;
export const nutritionTargetQueryKey = ['nutrition-targets'] as const;

/**
 * Query key convention:
 * - `all` is the stable feature root used for broad invalidation.
 * - Static resource segments come next (`detail`, `list`, `sessions`, `summary`).
 * - Dynamic ids or normalized params are always the final segment.
 *
 * Cross-feature invalidation map:
 * - Habit definition mutations refresh dashboard snapshot data.
 * - Workout session changes refresh dashboard snapshot data, recent workouts, and referential habit caches.
 * - Active/scheduled workout mutations refresh dashboard snapshot data.
 * - Workout template mutations refresh dashboard snapshot data.
 * - Meal mutations refresh dashboard nutrition widgets and referential habit caches.
 * - Habit entry mutations refresh dashboard snapshot and chain views.
 * - Weight mutations refresh dashboard weight widgets and referential habit caches.
 */
export const crossFeatureInvalidationMap = {
  activeWorkoutSessionMutation: () =>
    [dashboardSnapshotQueryKeys.all, dataQualityQueryKey] as const satisfies readonly QueryKey[],
  adaptiveProgramMutation: () =>
    [adaptiveNutritionQueryKey, dataQualityQueryKey] as const satisfies readonly QueryKey[],
  adaptiveGoalMutation: () =>
    [adaptiveNutritionQueryKey, dataQualityQueryKey] as const satisfies readonly QueryKey[],
  adaptivePreviewMutation: () =>
    [adaptiveNutritionQueryKey, dataQualityQueryKey] as const satisfies readonly QueryKey[],
  adaptiveResolutionMutation: () =>
    [
      adaptiveNutritionQueryKey,
      dataQualityQueryKey,
      nutritionTargetQueryKey,
      nutritionQueryKeys.all,
      dashboardSnapshotQueryKeys.all,
      macroTrendQueryKeys.all,
    ] as const satisfies readonly QueryKey[],
  habitDefinitionMutation: () =>
    [dashboardSnapshotQueryKeys.all] as const satisfies readonly QueryKey[],
  habitEntryMutation: () =>
    [
      dashboardSnapshotQueryKeys.all,
      habitChainQueryKeys.all,
    ] as const satisfies readonly QueryKey[],
  mealMutation: () =>
    [
      adaptiveNutritionQueryKey,
      dataQualityQueryKey,
      dashboardSnapshotQueryKeys.all,
      macroTrendQueryKeys.all,
      habitQueryKeys.list(),
      habitQueryKeys.entryList(),
      habitChainQueryKeys.all,
    ] as const satisfies readonly QueryKey[],
  nutritionTargetMutation: () =>
    [
      adaptiveNutritionQueryKey,
      dataQualityQueryKey,
      nutritionQueryKeys.all,
      dashboardSnapshotQueryKeys.all,
      macroTrendQueryKeys.all,
    ] as const satisfies readonly QueryKey[],
  weightMutation: () =>
    [
      adaptiveNutritionQueryKey,
      dataQualityQueryKey,
      dashboardSnapshotQueryKeys.all,
      dashboardWeightTrendQueryKeys.all,
      habitQueryKeys.list(),
      habitQueryKeys.entryList(),
      habitChainQueryKeys.all,
    ] as const satisfies readonly QueryKey[],
  scheduledWorkoutMutation: () =>
    [dashboardSnapshotQueryKeys.all, dataQualityQueryKey] as const satisfies readonly QueryKey[],
  workoutTemplateMutation: () =>
    [dashboardSnapshotQueryKeys.all] as const satisfies readonly QueryKey[],
  workoutSessionChange: () =>
    [
      dashboardSnapshotQueryKeys.all,
      dataQualityQueryKey,
      recentWorkoutQueryKeys.all,
      habitQueryKeys.list(),
      habitQueryKeys.entryList(),
      habitChainQueryKeys.all,
    ] as const satisfies readonly QueryKey[],
};

export async function invalidateQueryKeys(
  queryClient: QueryClient,
  queryKeys: readonly QueryKey[],
) {
  await Promise.all(
    queryKeys.map((queryKey) =>
      queryClient.invalidateQueries({
        queryKey,
      }),
    ),
  );
}
