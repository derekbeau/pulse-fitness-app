import type { ExerciseTrackingType, SessionSet, WeightUnit, WorkoutSession } from '@pulse/shared';

import { mockExercises } from '@/lib/mock-data/workouts';

const trackingTypeByExerciseId = new Map<string, ExerciseTrackingType>(
  mockExercises.map((exercise) => [exercise.id, exercise.trackingType ?? inferTrackingType(exercise.id)]),
);

type SessionSetWithOptionalMetrics = SessionSet & {
  distance?: number | null;
  seconds?: number | null;
};

function inferTrackingType(exerciseId: string): ExerciseTrackingType {
  const normalized = exerciseId.toLowerCase();

  if (normalized.includes('bodyweight')) {
    return 'bodyweight_reps';
  }

  if (normalized.includes('stretch')) {
    return 'seconds_only';
  }

  return 'weight_reps';
}

export function getExerciseTrackingType(exerciseId: string): ExerciseTrackingType {
  return trackingTypeByExerciseId.get(exerciseId) ?? inferTrackingType(exerciseId);
}

export function getDistanceUnit(weightUnit: WeightUnit) {
  return weightUnit === 'lbs' ? 'mi' : 'm';
}

export function getSetSeconds(set: SessionSetWithOptionalMetrics) {
  return set.seconds ?? set.reps ?? null;
}

export function getSetDistance(set: SessionSetWithOptionalMetrics) {
  return set.distance ?? null;
}

export function getSetTrackingVolume(
  set: SessionSetWithOptionalMetrics,
  trackingType: ExerciseTrackingType,
) {
  const reps = set.reps ?? 0;
  const seconds = getSetSeconds(set) ?? 0;
  const distance = getSetDistance(set) ?? 0;
  const weight = set.weight ?? 0;

  switch (trackingType) {
    case 'weight_reps':
      return weight * reps;
    case 'weight_seconds':
      return weight * seconds;
    case 'bodyweight_reps':
    case 'reps_only':
      return reps;
    case 'reps_seconds':
      return reps * seconds;
    case 'seconds_only':
      return seconds;
    case 'distance':
      return distance;
    case 'cardio':
      return seconds + distance;
    default:
      return 0;
  }
}

export function getMetricLabelForTrackingType(trackingType: ExerciseTrackingType) {
  switch (trackingType) {
    case 'bodyweight_reps':
    case 'reps_only':
      return 'reps';
    case 'seconds_only':
    case 'weight_seconds':
      return 'seconds';
    case 'distance':
      return 'distance';
    case 'cardio':
      return 'work';
    default:
      return 'volume';
  }
}

export function getMetricSuffixForTrackingType(
  trackingType: ExerciseTrackingType,
  weightUnit: WeightUnit,
) {
  switch (trackingType) {
    case 'bodyweight_reps':
    case 'reps_only':
      return 'reps';
    case 'seconds_only':
    case 'weight_seconds':
      return 'seconds';
    case 'distance':
      return getDistanceUnit(weightUnit);
    case 'cardio':
      return 'work';
    default:
      return weightUnit;
  }
}

export function getSessionMetricKind(session: WorkoutSession) {
  const trackingTypes = new Set(session.sets.map((set) => getExerciseTrackingType(set.exerciseId)));

  if (trackingTypes.size !== 1) {
    return 'work';
  }

  return getMetricLabelForTrackingType([...trackingTypes][0]);
}
