import { describe, expect, it } from 'vitest';

import { habitQueryKeys } from '@/features/habits/api/keys';
import { dashboardSnapshotQueryKeys } from '@/hooks/use-dashboard-snapshot';
import { habitChainQueryKeys } from '@/hooks/use-habit-chains';
import { macroTrendQueryKeys } from '@/hooks/use-macro-trend';
import { recentWorkoutQueryKeys } from '@/hooks/use-recent-workouts';
import { dashboardWeightTrendQueryKeys } from '@/hooks/use-weight-trend';
import { nutritionQueryKeys } from '@/features/nutrition/api/keys';

import {
  adaptiveNutritionQueryKey,
  crossFeatureInvalidationMap,
  nutritionTargetQueryKey,
} from './query-invalidation';

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
      adaptiveNutritionQueryKey,
      dashboardSnapshotQueryKeys.all,
      macroTrendQueryKeys.all,
      habitQueryKeys.list(),
      habitQueryKeys.entryList(),
      habitChainQueryKeys.all,
    ]);
  });

  it('returns all target-dependent invalidations', () => {
    expect(crossFeatureInvalidationMap.nutritionTargetMutation()).toEqual([
      adaptiveNutritionQueryKey,
      nutritionQueryKeys.all,
      dashboardSnapshotQueryKeys.all,
      macroTrendQueryKeys.all,
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
      adaptiveNutritionQueryKey,
      dashboardSnapshotQueryKeys.all,
      dashboardWeightTrendQueryKeys.all,
      habitQueryKeys.list(),
      habitQueryKeys.entryList(),
      habitChainQueryKeys.all,
    ]);
  });

  it('returns complete adaptive lifecycle invalidations', () => {
    expect(crossFeatureInvalidationMap.adaptiveProgramMutation()).toEqual([
      adaptiveNutritionQueryKey,
    ]);
    expect(crossFeatureInvalidationMap.adaptivePreviewMutation()).toEqual([
      adaptiveNutritionQueryKey,
    ]);
    expect(crossFeatureInvalidationMap.adaptiveResolutionMutation()).toEqual([
      adaptiveNutritionQueryKey,
      nutritionTargetQueryKey,
      nutritionQueryKeys.all,
      dashboardSnapshotQueryKeys.all,
      macroTrendQueryKeys.all,
    ]);
  });
});
