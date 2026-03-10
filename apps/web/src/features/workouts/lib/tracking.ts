import type { ExerciseTrackingType, WeightUnit } from '@pulse/shared';

type SetMetrics = {
  distance?: number | null;
  reps?: number | null;
  seconds?: number | null;
  weight?: number | null;
};

type ResolveTrackingTypeInput = {
  category?: 'cardio' | 'compound' | 'isolation' | 'mobility' | null;
  exerciseId?: string | null;
  exerciseName?: string | null;
  prescribedReps?: string | null;
  trackingType?: ExerciseTrackingType | null;
};

const timePattern = /\b(?:sec|secs|second|seconds|min|mins|minute|minutes)\b/i;

export function resolveTrackingType({
  category,
  exerciseId,
  exerciseName,
  prescribedReps,
  trackingType,
}: ResolveTrackingTypeInput): ExerciseTrackingType {
  if (trackingType) {
    return trackingType;
  }

  const descriptor = `${exerciseId ?? ''} ${exerciseName ?? ''} ${prescribedReps ?? ''}`.toLowerCase();

  if (category === 'cardio') {
    return 'cardio';
  }

  if (descriptor.includes('distance') || /\b(?:km|mi|mile|miles|meter|meters)\b/.test(descriptor)) {
    return 'distance';
  }

  if (descriptor.includes('bodyweight')) {
    return 'bodyweight_reps';
  }

  if (/\b(?:stretch|plank|hold|isometric)\b/.test(descriptor)) {
    return 'seconds_only';
  }

  if (timePattern.test(descriptor)) {
    if (descriptor.includes('weight')) {
      return 'weight_seconds';
    }

    if (descriptor.includes('rep') && descriptor.includes('sec')) {
      return 'reps_seconds';
    }

    return 'seconds_only';
  }

  if (category === 'mobility') {
    return 'reps_only';
  }

  return 'weight_reps';
}

export function getDistanceUnit(weightUnit: WeightUnit) {
  return weightUnit === 'kg' ? 'm' : 'mi';
}

export function getSetSeconds(set: SetMetrics) {
  if (set.seconds != null) {
    return set.seconds;
  }

  // Temporary bridge: persisted session sets still store time values in `reps`.
  // Remove this fallback once session-set `seconds` is migrated end-to-end.
  return set.reps;
}

export function getSetDistance(set: SetMetrics) {
  return set.distance ?? null;
}

export function isSetCompleteForTrackingType(trackingType: ExerciseTrackingType, set: SetMetrics) {
  const reps = set.reps ?? 0;
  const weight = set.weight ?? 0;
  const seconds = getSetSeconds(set) ?? 0;
  const distance = getSetDistance(set) ?? 0;

  switch (trackingType) {
    case 'weight_reps':
      return weight > 0 && reps > 0;
    case 'weight_seconds':
      return weight > 0 && seconds > 0;
    case 'bodyweight_reps':
    case 'reps_only':
      return reps > 0;
    case 'reps_seconds':
      return reps > 0 && seconds > 0;
    case 'seconds_only':
      return seconds > 0;
    case 'distance':
      return distance > 0;
    case 'cardio':
      return seconds > 0 && distance > 0;
    default:
      return false;
  }
}

export function getSetVolume(trackingType: ExerciseTrackingType, set: SetMetrics) {
  const reps = set.reps ?? 0;
  const weight = set.weight ?? 0;
  const seconds = getSetSeconds(set) ?? 0;
  const distance = getSetDistance(set) ?? 0;

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
      return seconds;
    default:
      return 0;
  }
}

export function getTrackingVolumeLabel(trackingType: ExerciseTrackingType) {
  switch (trackingType) {
    case 'bodyweight_reps':
    case 'reps_only':
      return 'reps';
    case 'seconds_only':
    case 'cardio':
      return 'seconds';
    default:
      return 'volume';
  }
}

export function parsePrescribedRepsValue(reps: string) {
  const lower = reps.toLowerCase();
  const numberMatch = lower.match(/\d+/);

  if (!numberMatch) {
    return null;
  }

  const value = Number(numberMatch[0]);

  if (!Number.isFinite(value)) {
    return null;
  }

  if (lower.includes('min')) {
    return value * 60;
  }

  return value;
}
