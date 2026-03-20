import type { ExerciseTrackingType, WeightUnit } from '@pulse/shared';

type SetMetrics = {
  distance?: number | null;
  reps?: number | null;
  setNumber?: number | null;
  skipped?: boolean;
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
const TRACKING_TYPE_ORDER: ExerciseTrackingType[] = [
  'weight_reps',
  'bodyweight_reps',
  'reps_only',
  'weight_seconds',
  'reps_seconds',
  'seconds_only',
  'distance',
  'cardio',
];
const integerFormatter = new Intl.NumberFormat('en-US');

export type TrackingSummaryMetricLabel = 'distance' | 'reps' | 'seconds' | 'volume';

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

  const descriptor =
    `${exerciseId ?? ''} ${exerciseName ?? ''} ${prescribedReps ?? ''}`.toLowerCase();

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
  return weightUnit === 'kg' ? 'km' : 'mi';
}

export function isWeightedTrackingType(trackingType: ExerciseTrackingType) {
  return trackingType === 'weight_reps' || trackingType === 'weight_seconds';
}

export function isTimeBasedTrackingType(trackingType: ExerciseTrackingType) {
  return (
    trackingType === 'weight_seconds' ||
    trackingType === 'reps_seconds' ||
    trackingType === 'seconds_only' ||
    trackingType === 'cardio'
  );
}

export function getSetSeconds(set: SetMetrics) {
  return getSetSecondsValue(set, true);
}

export function getSetDistance(set: SetMetrics) {
  return set.distance ?? null;
}

export function formatSetSummary(
  set: SetMetrics,
  trackingType: ExerciseTrackingType,
  {
    compact = false,
    includeSetNumber = false,
    useLegacySecondsFallback = true,
    weightUnit = 'lbs',
  }: {
    compact?: boolean;
    includeSetNumber?: boolean;
    useLegacySecondsFallback?: boolean;
    weightUnit?: WeightUnit;
  } = {},
) {
  const prefix = includeSetNumber && set.setNumber != null ? `Set ${set.setNumber}: ` : '';

  if (set.skipped) {
    return `${prefix}Skipped`;
  }

  if (compact) {
    return `${prefix}${formatSetCompact(set, trackingType, useLegacySecondsFallback, weightUnit)}`;
  }

  const weightLabel = set.weight != null ? `${formatWeightNumber(set.weight)} ${weightUnit}` : null;
  const repsLabel = set.reps != null ? `${formatMetricNumber(set.reps)} reps` : null;
  const seconds = getSetSecondsValue(set, useLegacySecondsFallback);
  const secondsLabel = seconds != null ? `${formatMetricNumber(seconds)} sec` : null;
  const distance = getSetDistance(set);
  const resolvedDistance = distance ?? (trackingType === 'distance' ? set.reps : null);
  const distanceLabel =
    resolvedDistance != null
      ? `${formatMetricNumber(resolvedDistance)} ${getDistanceUnit(weightUnit)}`
      : null;

  switch (trackingType) {
    case 'weight_reps':
      return `${prefix}${joinSegments(weightLabel, repsLabel, ' × ')}`;
    case 'weight_seconds':
      return `${prefix}${joinSegments(weightLabel, secondsLabel, ' × ')}`;
    case 'bodyweight_reps':
    case 'reps_only':
      return `${prefix}${repsLabel ?? '-'}`;
    case 'reps_seconds':
      return `${prefix}${joinSegments(repsLabel, secondsLabel, ' × ')}`;
    case 'seconds_only':
      return `${prefix}${secondsLabel ?? '-'}`;
    case 'distance':
      return `${prefix}${distanceLabel ?? '-'}`;
    case 'cardio':
      return `${prefix}${joinSegments(secondsLabel, distanceLabel, ' / ')}`;
    default:
      return `${prefix}${joinSegments(weightLabel, repsLabel, ' × ')}`;
  }
}

export function formatCompactSets(
  sets: SetMetrics[],
  trackingType: ExerciseTrackingType,
  {
    useLegacySecondsFallback = true,
  }: {
    useLegacySecondsFallback?: boolean;
  } = {},
) {
  if (sets.length === 0) {
    return '-';
  }

  return sets
    .map((set) => formatCompactHistorySet(set, trackingType, useLegacySecondsFallback))
    .join(', ');
}

function formatSetCompact(
  set: SetMetrics,
  trackingType: ExerciseTrackingType,
  useLegacySecondsFallback: boolean,
  weightUnit: WeightUnit,
) {
  const w = set.weight != null ? formatWeightNumber(set.weight) : null;
  const r = set.reps != null ? formatMetricNumber(set.reps) : null;
  const seconds = getSetSecondsValue(set, useLegacySecondsFallback);
  const s = seconds != null ? `${formatMetricNumber(seconds)}s` : null;
  const distance = getSetDistance(set) ?? (trackingType === 'distance' ? set.reps : null);
  const d =
    distance != null ? `${formatMetricNumber(distance)}${getDistanceUnit(weightUnit)}` : null;

  switch (trackingType) {
    case 'weight_reps':
      return w != null && r != null ? `${w}x${r}` : (w ?? r ?? '-');
    case 'weight_seconds':
      return w != null && s != null ? `${w}x${s}` : (w ?? s ?? '-');
    case 'bodyweight_reps':
    case 'reps_only':
      return r ?? '-';
    case 'reps_seconds':
      return r != null && s != null ? `${r}x${s}` : (r ?? s ?? '-');
    case 'seconds_only':
      return s ?? '-';
    case 'distance':
      return d ?? '-';
    case 'cardio':
      return s != null && d != null ? `${s}/${d}` : (s ?? d ?? '-');
    default:
      return w != null && r != null ? `${w}x${r}` : (w ?? r ?? '-');
  }
}

function formatCompactHistorySet(
  set: SetMetrics,
  trackingType: ExerciseTrackingType,
  useLegacySecondsFallback: boolean,
) {
  const w = set.weight != null ? formatWeightNumber(set.weight) : null;
  const r = set.reps != null ? formatMetricNumber(set.reps) : null;
  const seconds = getSetSecondsValue(set, useLegacySecondsFallback);
  const s = seconds != null ? `${formatMetricNumber(seconds)}s` : null;
  const distance = getSetDistance(set) ?? (trackingType === 'distance' ? set.reps : null);
  const d = distance != null ? `${formatMetricNumber(distance)}m` : null;

  switch (trackingType) {
    case 'weight_reps':
      return w != null && r != null ? `${w}x${r}` : (w ?? r ?? '-');
    case 'weight_seconds':
      return w != null && s != null ? `${w}x${s}` : (w ?? s ?? '-');
    case 'bodyweight_reps':
    case 'reps_only':
      return r ?? '-';
    case 'reps_seconds':
      return r != null && s != null ? `${r}x${s}` : (r ?? s ?? '-');
    case 'seconds_only':
      return s ?? '-';
    case 'distance':
      return d ?? '-';
    case 'cardio':
      return s != null && d != null ? `${s}/${d}` : (s ?? d ?? '-');
    default:
      return w != null && r != null ? `${w}x${r}` : (w ?? r ?? '-');
  }
}

export function isSetCompleteForTrackingType(trackingType: ExerciseTrackingType, set: SetMetrics) {
  const reps = set.reps ?? 0;
  const weight = set.weight;
  const seconds = getSetSeconds(set) ?? 0;
  const distance = getSetDistance(set) ?? 0;

  switch (trackingType) {
    case 'weight_reps':
      return weight != null && reps > 0;
    case 'weight_seconds':
      return weight != null && seconds > 0;
    case 'bodyweight_reps':
    case 'reps_only':
      return reps > 0;
    case 'reps_seconds':
      return reps > 0 && seconds > 0;
    case 'seconds_only':
      return seconds > 0;
    case 'distance':
      return (set.distance ?? set.reps ?? 0) > 0;
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
      return set.distance ?? set.reps ?? 0;
    case 'cardio':
      return seconds;
    default:
      return 0;
  }
}

export function getTrackingSummaryMetricLabel(
  trackingType: ExerciseTrackingType,
): TrackingSummaryMetricLabel {
  switch (trackingType) {
    case 'weight_reps':
      return 'volume';
    case 'bodyweight_reps':
    case 'reps_only':
      return 'reps';
    case 'weight_seconds':
    case 'reps_seconds':
    case 'seconds_only':
    case 'cardio':
      return 'seconds';
    case 'distance':
      return 'distance';
    default:
      return 'volume';
  }
}

export function getSetSummaryMetricValue(trackingType: ExerciseTrackingType, set: SetMetrics) {
  switch (getTrackingSummaryMetricLabel(trackingType)) {
    case 'volume':
      return getSetVolume(trackingType, set);
    case 'reps':
      return set.reps ?? 0;
    case 'seconds':
      return getSetSeconds(set) ?? 0;
    case 'distance':
      return getSetDistance(set) ?? set.reps ?? 0;
    default:
      return 0;
  }
}

export function isRepTrackingType(trackingType: ExerciseTrackingType) {
  return (
    trackingType === 'weight_reps' ||
    trackingType === 'bodyweight_reps' ||
    trackingType === 'reps_only' ||
    trackingType === 'reps_seconds'
  );
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

export function getTrackingTypeLabel(trackingType: ExerciseTrackingType) {
  switch (trackingType) {
    case 'weight_reps':
      return 'Weight + reps';
    case 'weight_seconds':
      return 'Weight + time';
    case 'bodyweight_reps':
      return 'Bodyweight reps';
    case 'reps_only':
      return 'Reps only';
    case 'reps_seconds':
      return 'Reps + time';
    case 'seconds_only':
      return 'Time only';
    case 'distance':
      return 'Distance';
    case 'cardio':
      return 'Cardio';
    default:
      return 'Tracking';
  }
}

export function formatTrackingTypeSummary(trackingTypes: ExerciseTrackingType[]) {
  const uniqueTrackingTypes = [...new Set(trackingTypes)];
  if (uniqueTrackingTypes.length === 0) {
    return null;
  }

  uniqueTrackingTypes.sort(
    (left, right) => TRACKING_TYPE_ORDER.indexOf(left) - TRACKING_TYPE_ORDER.indexOf(right),
  );

  return uniqueTrackingTypes.map((trackingType) => getTrackingTypeLabel(trackingType)).join(' • ');
}

export function formatTrackingMetricBreakdown(
  totals: Record<TrackingSummaryMetricLabel, number>,
  weightUnit: WeightUnit,
) {
  const segments: string[] = [];

  if (totals.volume > 0) {
    segments.push(`${formatMetricNumber(totals.volume)} ${weightUnit}`);
  }
  if (totals.reps > 0) {
    segments.push(`${formatMetricNumber(totals.reps)} reps`);
  }
  if (totals.seconds > 0) {
    segments.push(`${formatMetricNumber(totals.seconds)} sec`);
  }
  if (totals.distance > 0) {
    segments.push(`${formatMetricNumber(totals.distance)} ${getDistanceUnit(weightUnit)}`);
  }

  if (segments.length === 0) {
    return '-';
  }

  return segments.join(' • ');
}

function joinSegments(left: string | null, right: string | null, separator: string) {
  if (left && right) {
    return `${left}${separator}${right}`;
  }

  return left ?? right ?? '-';
}

export function formatMetricNumber(value: number) {
  const normalized = Math.round(value * 100) / 100;
  if (Number.isInteger(normalized)) {
    return integerFormatter.format(normalized);
  }

  return normalized.toFixed(2).replace(/\.?0+$/, '');
}

function formatWeightNumber(value: number) {
  const normalized = Math.round(value * 10) / 10;
  if (Number.isInteger(normalized)) {
    return integerFormatter.format(normalized);
  }

  return normalized.toFixed(1);
}

function getSetSecondsValue(set: SetMetrics, useLegacyFallback: boolean) {
  if (set.seconds != null) {
    return set.seconds;
  }

  if (useLegacyFallback) {
    // Temporary bridge: persisted session sets still store time values in `reps`.
    // Remove this fallback once session-set `seconds` is migrated end-to-end.
    return set.reps;
  }

  return null;
}
