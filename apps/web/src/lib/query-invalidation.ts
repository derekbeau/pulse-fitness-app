import type { QueryClient, QueryKey } from '@tanstack/react-query';

import { habitQueryKeys } from '@/features/habits/api/keys';
import { dashboardSnapshotQueryKeys } from '@/hooks/use-dashboard-snapshot';
import { habitChainQueryKeys } from '@/hooks/use-habit-chains';
import { macroTrendQueryKeys } from '@/hooks/use-macro-trend';
import { recentWorkoutQueryKeys } from '@/hooks/use-recent-workouts';
import { dashboardWeightTrendQueryKeys } from '@/hooks/use-weight-trend';

/**
 * Query key convention:
 * - `all` is the stable feature root used for broad invalidation.
 * - Static resource segments come next (`detail`, `list`, `sessions`, `summary`).
 * - Dynamic ids or normalized params are always the final segment.
 *
 * Cross-feature invalidation map:
 * - Workout completion refreshes dashboard snapshot data, recent workouts, and referential habit caches.
 * - Meal mutations refresh dashboard nutrition widgets and referential habit caches.
 * - Habit entry mutations refresh dashboard snapshot and chain views.
 * - Weight mutations refresh dashboard weight widgets and referential habit caches.
 */
export const crossFeatureInvalidationMap = {
  habitEntryMutation: () =>
    [
      dashboardSnapshotQueryKeys.all,
      habitChainQueryKeys.all,
    ] as const satisfies readonly QueryKey[],
  mealMutation: () =>
    [
      dashboardSnapshotQueryKeys.all,
      macroTrendQueryKeys.all,
      habitQueryKeys.list(),
      habitQueryKeys.entryList(),
      habitChainQueryKeys.all,
    ] as const satisfies readonly QueryKey[],
  weightMutation: () =>
    [
      dashboardSnapshotQueryKeys.all,
      dashboardWeightTrendQueryKeys.all,
      habitQueryKeys.list(),
      habitQueryKeys.entryList(),
      habitChainQueryKeys.all,
    ] as const satisfies readonly QueryKey[],
  workoutCompletion: () =>
    [
      dashboardSnapshotQueryKeys.all,
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
