import type { ExerciseTrackingType, WeightUnit } from '@pulse/shared';

import { getDistanceUnit } from '../../lib/tracking';

import type {
  WorkoutExerciseCardTemplateExercise,
  WorkoutExerciseSetListItem,
  WorkoutExerciseSetTarget,
} from './types';

export function formatRepTarget(repsMin: number | null, repsMax: number | null) {
  if (repsMin !== null && repsMax !== null) {
    return repsMin === repsMax ? `${repsMin}` : `${repsMin}-${repsMax}`;
  }

  if (repsMin !== null) {
    return `${repsMin}+`;
  }

  if (repsMax !== null) {
    return `Up to ${repsMax}`;
  }

  return null;
}

export function formatTempo(tempo: string) {
  return tempo.split('').join('-');
}

export function formatTrackingTypeLabel(trackingType: ExerciseTrackingType) {
  switch (trackingType) {
    case 'weight_reps':
      return 'Weight × Reps';
    case 'bodyweight_reps':
      return 'Bodyweight Reps';
    case 'reps_only':
      return 'Reps Only';
    case 'weight_seconds':
      return 'Weight × Seconds';
    case 'reps_seconds':
      return 'Reps × Seconds';
    case 'seconds_only':
      return 'Seconds Only';
    case 'distance':
      return 'Distance';
    case 'cardio':
      return 'Cardio';
    default:
      return 'Weight × Reps';
  }
}

function formatTargetWeight(target: WorkoutExerciseSetTarget, weightUnit: WeightUnit) {
  if (target.targetWeight != null) {
    return `${target.targetWeight} ${weightUnit}`;
  }

  if (target.targetWeightMin != null && target.targetWeightMax != null) {
    return `${target.targetWeightMin}-${target.targetWeightMax} ${weightUnit}`;
  }

  return null;
}

function formatTargetByTrackingType(
  trackingType: ExerciseTrackingType,
  target: WorkoutExerciseSetTarget,
  weightUnit: WeightUnit,
  repsTarget: string | null,
) {
  const weightLabel = formatTargetWeight(target, weightUnit);
  const secondsLabel = target.targetSeconds != null ? `${target.targetSeconds} sec` : null;
  const distanceLabel =
    target.targetDistance != null
      ? `${target.targetDistance} ${getDistanceUnit(weightUnit)}`
      : null;

  switch (trackingType) {
    case 'seconds_only':
      return secondsLabel;
    case 'weight_seconds':
      if (weightLabel && secondsLabel) {
        return `${weightLabel} x ${secondsLabel}`;
      }
      return weightLabel ?? secondsLabel;
    case 'reps_seconds':
      if (repsTarget && secondsLabel) {
        return `${repsTarget} x ${secondsLabel}`;
      }
      return secondsLabel;
    case 'distance':
      return distanceLabel;
    case 'cardio':
      if (secondsLabel && distanceLabel) {
        return `${secondsLabel} + ${distanceLabel}`;
      }
      return secondsLabel ?? distanceLabel;
    case 'weight_reps':
      return weightLabel;
    default:
      return null;
  }
}

function summarizeSetTargets(
  exercise: {
    repsMax: number | null;
    repsMin: number | null;
    setTargets?: WorkoutExerciseSetTarget[] | null;
    trackingType: ExerciseTrackingType;
  },
  weightUnit: WeightUnit,
) {
  if (!exercise.setTargets || exercise.setTargets.length === 0) {
    return null;
  }

  const repsTarget = formatRepTarget(exercise.repsMin, exercise.repsMax);
  const labels = exercise.setTargets
    .map((setTarget) =>
      formatTargetByTrackingType(exercise.trackingType, setTarget, weightUnit, repsTarget),
    )
    .filter((value): value is string => value !== null);

  if (labels.length === 0) {
    return null;
  }

  const uniqueLabels = [...new Set(labels)];
  if (uniqueLabels.length === 1) {
    return uniqueLabels[0] ?? null;
  }

  return labels[0] ?? null;
}

export function formatSetTargetBreakdown(
  exercise: {
    repsMax: number | null;
    repsMin: number | null;
    setTargets?: WorkoutExerciseSetTarget[] | null;
    trackingType: ExerciseTrackingType;
  },
  weightUnit: WeightUnit,
) {
  const repsTarget = formatRepTarget(exercise.repsMin, exercise.repsMax);
  const targets = (exercise.setTargets ?? [])
    .map((setTarget) => {
      const label = formatTargetByTrackingType(
        exercise.trackingType,
        setTarget,
        weightUnit,
        repsTarget,
      );

      if (!label) {
        return null;
      }

      return `Set ${setTarget.setNumber}: ${label}`;
    })
    .filter((value): value is string => value !== null);

  if (targets.length <= 1) {
    return null;
  }

  return targets.join(' • ');
}

export function formatPrescription(
  exercise: {
    repsMax: number | null;
    repsMin: number | null;
    restSeconds: number | null;
    setTargets?: WorkoutExerciseSetTarget[] | null;
    sets: number | null;
    trackingType: ExerciseTrackingType;
  },
  weightUnit: WeightUnit,
) {
  const repsTarget = formatRepTarget(exercise.repsMin, exercise.repsMax);
  const setTargetSummary = summarizeSetTargets(exercise, weightUnit);
  const trackingTypeLabel = exercise.trackingType === 'bodyweight_reps' ? ' (bodyweight)' : '';

  if (setTargetSummary) {
    if (exercise.sets !== null) {
      return `${exercise.sets} x ${setTargetSummary}${trackingTypeLabel}`;
    }

    return `${setTargetSummary}${trackingTypeLabel}`;
  }

  if (exercise.trackingType === 'seconds_only') {
    if (repsTarget) {
      if (exercise.sets !== null) {
        return `${exercise.sets} x ${repsTarget} sec`;
      }

      return `${repsTarget} sec`;
    }

    if (exercise.sets !== null) {
      return `${exercise.sets} timed set${exercise.sets === 1 ? '' : 's'}`;
    }
  }

  if (exercise.trackingType === 'distance') {
    if (repsTarget) {
      if (exercise.sets !== null) {
        return `${exercise.sets} x ${repsTarget} ${getDistanceUnit(weightUnit)}`;
      }

      return `${repsTarget} ${getDistanceUnit(weightUnit)}`;
    }

    if (exercise.sets !== null) {
      return `${exercise.sets} distance set${exercise.sets === 1 ? '' : 's'}`;
    }
  }

  if (exercise.sets !== null && repsTarget) {
    return `${exercise.sets} x ${repsTarget}${trackingTypeLabel}`;
  }

  if (exercise.sets !== null) {
    return `${exercise.sets} set${exercise.sets === 1 ? '' : 's'}`;
  }

  if (repsTarget) {
    return `${repsTarget}${trackingTypeLabel}`;
  }

  return 'Prescription not set';
}

export function formatCompactSetSummary(
  exercise: {
    repsMax: number | null;
    repsMin: number | null;
    setTargets?: WorkoutExerciseSetTarget[] | null;
    sets: number | null;
    trackingType: ExerciseTrackingType;
  },
  weightUnit: WeightUnit,
) {
  const setTargetSummary = summarizeSetTargets(exercise, weightUnit);
  const repsTarget = formatRepTarget(exercise.repsMin, exercise.repsMax);

  if (exercise.sets !== null && setTargetSummary) {
    return `${exercise.sets}×${setTargetSummary}`;
  }

  if (exercise.sets !== null && repsTarget) {
    return `${exercise.sets}×${repsTarget}`;
  }

  if (exercise.sets !== null) {
    return `${exercise.sets} set${exercise.sets === 1 ? '' : 's'}`;
  }

  return formatPrescription(
    {
      repsMax: exercise.repsMax,
      repsMin: exercise.repsMin,
      restSeconds: null,
      setTargets: exercise.setTargets,
      sets: exercise.sets,
      trackingType: exercise.trackingType,
    },
    weightUnit,
  );
}

export function buildTemplateSetListItems(
  exercise: Pick<WorkoutExerciseCardTemplateExercise, 'setTargets' | 'sets' | 'trackingType'>,
): WorkoutExerciseSetListItem[] {
  const setCount = Math.max(exercise.sets ?? 0, exercise.setTargets?.length ?? 0);

  return Array.from({ length: setCount }).map((_, index) => {
    const setNumber = index + 1;
    const target =
      exercise.setTargets?.find((setTarget) => setTarget.setNumber === setNumber) ??
      exercise.setTargets?.[index] ??
      null;

    return {
      completed: false,
      distance: null,
      reps: null,
      seconds: null,
      setNumber,
      targetDistance: target?.targetDistance ?? null,
      targetSeconds: target?.targetSeconds ?? null,
      targetWeight: target?.targetWeight ?? null,
      targetWeightMax: target?.targetWeightMax ?? null,
      targetWeightMin: target?.targetWeightMin ?? null,
      weight: null,
    };
  });
}
