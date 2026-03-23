import type { ExerciseTrackingType } from '@pulse/shared';

export type TrendMetricKey = 'max_weight' | 'max_reps' | 'total_volume' | 'est_1rm' | 'max_time';

export type TrendMetricOption = {
  key: TrendMetricKey;
  label: string;
};

const metricDefinitions: Record<TrendMetricKey, TrendMetricOption> = {
  max_weight: { key: 'max_weight', label: 'Max Weight' },
  max_reps: { key: 'max_reps', label: 'Max Reps' },
  total_volume: { key: 'total_volume', label: 'Total Volume' },
  est_1rm: { key: 'est_1rm', label: 'Est 1RM' },
  max_time: { key: 'max_time', label: 'Max Time' },
};

export function computeEstimated1RM(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

export function computeSessionVolume(sets: Array<{ weight: number; reps: number }>): number {
  return sets.reduce((total, set) => total + set.weight * set.reps, 0);
}

export function getMetricOptionsForTrackingType(
  trackingType: ExerciseTrackingType,
): TrendMetricOption[] {
  switch (trackingType) {
    case 'weight_reps':
      return [
        metricDefinitions.max_weight,
        metricDefinitions.max_reps,
        metricDefinitions.total_volume,
        metricDefinitions.est_1rm,
      ];
    case 'weight_seconds':
      return [metricDefinitions.max_weight, metricDefinitions.max_time];
    case 'bodyweight_reps':
    case 'reps_only':
      return [metricDefinitions.max_reps];
    case 'reps_seconds':
    case 'seconds_only':
    case 'cardio':
      return [metricDefinitions.max_time];
    case 'distance':
      return [metricDefinitions.max_reps];
    default:
      return [metricDefinitions.max_weight, metricDefinitions.max_reps];
  }
}
