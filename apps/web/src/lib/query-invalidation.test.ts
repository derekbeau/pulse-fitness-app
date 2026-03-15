import { describe, expect, it } from 'vitest';

import { habitQueryKeys } from '@/features/habits/api/keys';
import { dashboardSnapshotQueryKeys } from '@/hooks/use-dashboard-snapshot';
import { habitChainQueryKeys } from '@/hooks/use-habit-chains';
import { macroTrendQueryKeys } from '@/hooks/use-macro-trend';
import { recentWorkoutQueryKeys } from '@/hooks/use-recent-workouts';
import { dashboardWeightTrendQueryKeys } from '@/hooks/use-weight-trend';

import { crossFeatureInvalidationMap } from './query-invalidation';

describe('crossFeatureInvalidationMap', () => {
  it('returns the expected workout-session invalidations', () => {
    expect(crossFeatureInvalidationMap.workoutSessionChange()).toEqual([
      dashboardSnapshotQueryKeys.all,
      recentWorkoutQueryKeys.all,
      habitQueryKeys.list(),
      habitQueryKeys.entryList(),
      habitChainQueryKeys.all,
    ]);
  });

  it('returns the expected meal invalidations', () => {
    expect(crossFeatureInvalidationMap.mealMutation()).toEqual([
      dashboardSnapshotQueryKeys.all,
      macroTrendQueryKeys.all,
      habitQueryKeys.list(),
      habitQueryKeys.entryList(),
      habitChainQueryKeys.all,
    ]);
  });

  it('returns the expected habit-entry invalidations', () => {
    expect(crossFeatureInvalidationMap.habitEntryMutation()).toEqual([
      dashboardSnapshotQueryKeys.all,
      habitChainQueryKeys.all,
    ]);
  });

  it('returns the expected weight invalidations', () => {
    expect(crossFeatureInvalidationMap.weightMutation()).toEqual([
      dashboardSnapshotQueryKeys.all,
      dashboardWeightTrendQueryKeys.all,
      habitQueryKeys.list(),
      habitQueryKeys.entryList(),
      habitChainQueryKeys.all,
    ]);
  });
});
