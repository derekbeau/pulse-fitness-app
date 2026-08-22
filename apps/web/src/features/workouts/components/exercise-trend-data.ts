import type { ExerciseTrackingType } from '@pulse/shared';

import type { ActiveWorkoutPerformanceHistorySession } from '../types';
import {
  computeEstimated1RM,
  computeSessionVolume,
  type TrendMetricKey,
} from './exercise-trend-metrics';

export type ExerciseTrendDatum = {
  date: string;
  value: number;
};

export function buildExerciseTrendData(input: {
  metric: TrendMetricKey;
  sessions: ActiveWorkoutPerformanceHistorySession[];
  trackingType: ExerciseTrackingType;
}): ExerciseTrendDatum[] {
  return input.sessions
    .map((session) => {
      const value = computeMetricValueFromSession(session, input.metric, input.trackingType);
      return value === null ? null : { date: session.date, value };
    })
    .filter((point): point is ExerciseTrendDatum => point !== null);
}

function computeMetricValueFromSession(
  session: ActiveWorkoutPerformanceHistorySession,
  metric: TrendMetricKey,
  trackingType: ExerciseTrackingType,
): number | null {
  const setsWithReps = session.sets.filter(
    (set): set is { reps: number; setNumber: number; weight: number | null } => set.reps != null,
  );
  if (setsWithReps.length === 0) return null;

  if (metric === 'max_weight') {
    const maxWeight = setsWithReps.reduce((best, set) => Math.max(best, set.weight ?? 0), 0);
    return Number.isFinite(maxWeight) ? maxWeight : null;
  }
  if (metric === 'max_reps' || metric === 'max_time') {
    return setsWithReps.reduce((best, set) => Math.max(best, set.reps), 0);
  }
  if (trackingType !== 'weight_reps') return null;

  const weightedSets = setsWithReps.filter((set) => (set.weight ?? 0) > 0);
  if (weightedSets.length === 0) return null;
  if (metric === 'total_volume') {
    return computeSessionVolume(
      weightedSets.map((set) => ({ reps: set.reps, weight: set.weight ?? 0 })),
    );
  }
  if (metric === 'est_1rm') {
    return weightedSets.reduce(
      (best, set) => Math.max(best, computeEstimated1RM(set.weight ?? 0, set.reps)),
      0,
    );
  }
  return null;
}
