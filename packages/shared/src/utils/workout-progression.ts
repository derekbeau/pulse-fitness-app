import type {
  WorkoutProgressionDecision,
  WorkoutProgressionEvidence,
  WorkoutProgressionPolicy,
  WorkoutProgressionReasonCode,
  WorkoutProgressionTarget,
} from '../schemas/workout-progression.js';

export type WorkoutProgressionEvaluation = {
  confidence: 'supported' | 'limited' | 'unavailable';
  decision: WorkoutProgressionDecision;
  facts: string[];
  reasonCodes: WorkoutProgressionReasonCode[];
  recommendedTargets: WorkoutProgressionTarget[];
};

function roundToIncrement(value: number, increment: number): number {
  const rounded = Math.round(value / increment) * increment;
  return Number(rounded.toFixed(6));
}

function adjustLoads(
  targets: WorkoutProgressionTarget[],
  policy: WorkoutProgressionPolicy,
  direction: 1 | -1,
): WorkoutProgressionTarget[] {
  return targets.map((target) => {
    const increment = policy.loadIncrement;
    if (increment === null) {
      return target;
    }
    const adjust = (value: number | null) =>
      value === null
        ? null
        : Math.max(0, roundToIncrement(value + direction * increment, increment));
    return {
      ...target,
      weight: adjust(target.weight),
      weightMax: adjust(target.weightMax),
      weightMin: adjust(target.weightMin),
    };
  });
}

function increaseStrengthLoads(
  targets: WorkoutProgressionTarget[],
  policy: WorkoutProgressionPolicy,
): WorkoutProgressionTarget[] {
  return targets.map((target) => {
    const increment = policy.loadIncrement;
    const increasePercent = policy.loadIncreasePercent;
    if (increment === null || increasePercent === null) {
      return target;
    }
    const increase = (value: number | null) =>
      value === null ? null : roundToIncrement(value * (1 + increasePercent / 100), increment);
    return {
      ...target,
      weight: increase(target.weight),
      weightMax: increase(target.weightMax),
      weightMin: increase(target.weightMin),
    };
  });
}

function increaseTimeDistanceTargets(
  targets: WorkoutProgressionTarget[],
  policy: WorkoutProgressionPolicy,
): WorkoutProgressionTarget[] {
  return targets.map((target) => ({
    ...target,
    distance:
      target.distance !== null && policy.distanceStep !== null
        ? Number((target.distance + policy.distanceStep).toFixed(6))
        : target.distance,
    seconds:
      target.seconds !== null && policy.secondsStep !== null
        ? target.seconds + policy.secondsStep
        : target.seconds,
  }));
}

function hold(
  evidence: WorkoutProgressionEvidence,
  confidence: WorkoutProgressionEvaluation['confidence'],
  reasonCodes: WorkoutProgressionReasonCode[],
  facts: string[],
): WorkoutProgressionEvaluation {
  return {
    confidence,
    decision: 'hold',
    facts,
    reasonCodes,
    recommendedTargets: evidence.priorTargets,
  };
}

export function evaluateWorkoutProgression(
  evidence: WorkoutProgressionEvidence,
): WorkoutProgressionEvaluation {
  const { performance, policy, priorTargets } = evidence;
  if (performance.length === 0) {
    return hold(
      evidence,
      'unavailable',
      ['NO_COMPLETED_HISTORY'],
      ['No completed performance exists for this exercise, so the current prescription is held.'],
    );
  }

  if (performance.some((set) => set.skipped || !set.completed)) {
    if (policy.family === 'rehab_capacity' && policy.allowReduction) {
      return {
        confidence: 'supported',
        decision: 'reduce',
        facts: [
          'At least one required set was missed, so the conservative capacity policy reduces one increment.',
        ],
        reasonCodes: ['MISSED_OR_SKIPPED_SETS'],
        recommendedTargets: adjustLoads(priorTargets, policy, -1),
      };
    }
    return hold(
      evidence,
      'supported',
      ['MISSED_OR_SKIPPED_SETS'],
      ['At least one required set was missed or skipped, so the current prescription is held.'],
    );
  }

  const effortRequired =
    policy.family === 'rpe_regulated' ||
    policy.family === 'rehab_capacity' ||
    policy.effortCeiling !== null;
  const rpeValues = performance.map((set) => set.rpe).filter((value) => value !== null);
  if (effortRequired && rpeValues.length !== performance.length) {
    return hold(
      evidence,
      'limited',
      ['MISSING_EFFORT'],
      [
        'Effort was not logged for every completed set, so Pulse will not infer that the work was easy.',
      ],
    );
  }

  const effortCeiling = policy.effortCeiling;
  const highEffort = effortCeiling !== null && rpeValues.some((value) => value > effortCeiling);
  if (highEffort) {
    if (
      policy.family === 'rpe_regulated' ||
      (policy.family === 'rehab_capacity' && policy.allowReduction)
    ) {
      return {
        confidence: 'supported',
        decision: 'reduce',
        facts: [`Logged effort exceeded the policy ceiling of RPE ${policy.effortCeiling}.`],
        reasonCodes: ['HIGH_EFFORT'],
        recommendedTargets: adjustLoads(priorTargets, policy, -1),
      };
    }
    return hold(
      evidence,
      'supported',
      ['HIGH_EFFORT'],
      [
        `Logged effort exceeded the policy ceiling of RPE ${policy.effortCeiling}, so load is held.`,
      ],
    );
  }

  if (policy.family === 'rehab_capacity') {
    return hold(
      evidence,
      'supported',
      ['REHAB_NO_AUTOMATIC_INCREASE'],
      ['The conservative rehab policy never increases capacity automatically.'],
    );
  }

  if (policy.family === 'double_progression') {
    if (policy.repRangeMax === null || policy.loadIncrement === null) {
      return hold(
        evidence,
        'unavailable',
        ['MISSING_PRIOR_PRESCRIPTION'],
        ['The rep-range or equipment increment is missing, so the prescription cannot progress.'],
      );
    }
    const rangeMax = policy.repRangeMax;
    const everySetAtTop = performance.every((set) => set.reps !== null && set.reps >= rangeMax);
    if (!everySetAtTop) {
      return hold(
        evidence,
        'supported',
        ['BELOW_RANGE_TOP'],
        [
          `Not every required set reached the top of the ${policy.repRangeMin ?? '?'}–${policy.repRangeMax} rep range.`,
        ],
      );
    }
    return {
      confidence: 'supported',
      decision: 'increase',
      facts: [
        `Every required set reached ${policy.repRangeMax} reps.`,
        `Load increases by ${policy.loadIncrement} using the configured equipment increment.`,
      ],
      reasonCodes: ['ALL_SETS_AT_RANGE_TOP', 'ROUNDED_TO_INCREMENT'],
      recommendedTargets: adjustLoads(priorTargets, policy, 1),
    };
  }

  if (policy.family === 'strength_load') {
    if (policy.loadIncrement === null || policy.loadIncreasePercent === null) {
      return hold(
        evidence,
        'unavailable',
        ['MISSING_PRIOR_PRESCRIPTION'],
        ['The strength percentage or equipment increment is missing, so the prescription is held.'],
      );
    }
    return {
      confidence: 'supported',
      decision: 'increase',
      facts: [
        `All required work was completed within the effort ceiling.`,
        `The configured ${policy.loadIncreasePercent}% increase is rounded to a ${policy.loadIncrement} increment.`,
      ],
      reasonCodes: ['ALL_TARGETS_COMPLETED', 'ROUNDED_TO_INCREMENT'],
      recommendedTargets: increaseStrengthLoads(priorTargets, policy),
    };
  }

  if (policy.family === 'rpe_regulated') {
    if (policy.lowEffortThreshold === null || policy.loadIncrement === null) {
      return hold(
        evidence,
        'unavailable',
        ['MISSING_PRIOR_PRESCRIPTION'],
        ['The effort threshold or equipment increment is missing, so the prescription is held.'],
      );
    }
    const lowEffortThreshold = policy.lowEffortThreshold;
    const allLowEffort = rpeValues.every((value) => value <= lowEffortThreshold);
    if (!allLowEffort) {
      return hold(
        evidence,
        'supported',
        ['ALL_TARGETS_COMPLETED'],
        ['All work was completed, but effort did not support a load change.'],
      );
    }
    return {
      confidence: 'supported',
      decision: 'increase',
      facts: [`All completed sets were at or below RPE ${policy.lowEffortThreshold}.`],
      reasonCodes: ['LOW_EFFORT', 'ROUNDED_TO_INCREMENT'],
      recommendedTargets: adjustLoads(priorTargets, policy, 1),
    };
  }

  if (policy.family === 'time_distance') {
    if (policy.secondsStep === null && policy.distanceStep === null) {
      return hold(
        evidence,
        'unavailable',
        ['MISSING_PRIOR_PRESCRIPTION'],
        ['No time or distance progression step is configured, so the prescription is held.'],
      );
    }
    const zoneCeiling = policy.zoneCeiling;
    const zoneTooHigh =
      zoneCeiling !== null &&
      performance.some((set) => set.zone !== null && set.zone > zoneCeiling);
    if (zoneTooHigh) {
      return hold(
        evidence,
        'supported',
        ['HIGH_EFFORT'],
        [`Logged zone exceeded the policy ceiling of Zone ${policy.zoneCeiling}.`],
      );
    }
    return {
      confidence: 'supported',
      decision: 'increase',
      facts: ['All required work was completed within the configured effort zone.'],
      reasonCodes: ['ALL_TARGETS_COMPLETED'],
      recommendedTargets: increaseTimeDistanceTargets(priorTargets, policy),
    };
  }

  return hold(
    evidence,
    'unavailable',
    ['UNSUPPORTED_TRACKING_TYPE'],
    ['This exercise tracking mode does not have a supported progression rule.'],
  );
}
