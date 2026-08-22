import type { ExerciseTrackingType } from '@pulse/shared';

import type { ActiveWorkoutPerformanceHistorySession } from '../types';
import {
  computeEstimated1RM,
  computeSessionVolume,
  type TrendMetricKey,
} from './exercise-trend-metrics';

export type ExerciseTrendDatum = {
  date: string;
  sessionId: string;
  value: number;
};

export function buildExerciseTrendData(input: {
  metric: TrendMetricKey;
  sessions: ActiveWorkoutPerformanceHistorySession[];
  trackingType: ExerciseTrackingType;
}): ExerciseTrendDatum[] {
  return [...input.sessions]
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.sessionId.localeCompare(right.sessionId),
    )
    .map((session) => {
      const value = computeMetricValueFromSession(session, input.metric, input.trackingType);
      return value === null ? null : { date: session.date, sessionId: session.sessionId, value };
    })
    .filter((point): point is ExerciseTrendDatum => point !== null);
}

function computeMetricValueFromSession(
  session: ActiveWorkoutPerformanceHistorySession,
  metric: TrendMetricKey,
  trackingType: ExerciseTrackingType,
): number | null {
  const weightedSets = session.sets.filter(
    (set): set is typeof set & { weight: number } =>
      typeof set.weight === 'number' && Number.isFinite(set.weight),
  );
  if (metric === 'max_weight') {
    return weightedSets.length === 0
      ? null
      : weightedSets.reduce((best, set) => Math.max(best, set.weight), -Infinity);
  }
  if (metric === 'max_reps') {
    const reps = session.sets.flatMap((set) =>
      typeof set.reps === 'number' && Number.isFinite(set.reps) ? [set.reps] : [],
    );
    return reps.length === 0 ? null : Math.max(...reps);
  }
  if (metric === 'max_time') {
    const durations = session.sets.flatMap((set) => {
      const value = set.seconds ?? set.reps;
      return typeof value === 'number' && Number.isFinite(value) ? [value] : [];
    });
    return durations.length === 0 ? null : Math.max(...durations);
  }
  if (trackingType !== 'weight_reps') return null;

  const volumeSets = weightedSets.flatMap((set) =>
    typeof set.reps === 'number' && Number.isFinite(set.reps)
      ? [{ reps: set.reps, weight: set.weight }]
      : [],
  );
  if (volumeSets.length === 0) return null;
  if (metric === 'total_volume') {
    return computeSessionVolume(volumeSets);
  }
  if (metric === 'est_1rm') {
    return volumeSets.reduce(
      (best, set) => Math.max(best, computeEstimated1RM(set.weight, set.reps)),
      0,
    );
  }
  return null;
}
