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
    const adjust = (value: number | null) => {
      if (value === null) return null;
      const adjusted = roundToIncrement(value + direction * increment, increment);
      return adjusted > 0 ? adjusted : value;
    };
    const adjusted = {
      ...target,
      weight: adjust(target.weight),
      weightMax: adjust(target.weightMax),
      weightMin: adjust(target.weightMin),
    };
    if (
      adjusted.weightMin !== null &&
      adjusted.weightMax !== null &&
      adjusted.weightMin > adjusted.weightMax
    ) {
      return target;
    }
    return adjusted;
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

function requireMaterialChange(
  evidence: WorkoutProgressionEvidence,
  result: WorkoutProgressionEvaluation,
): WorkoutProgressionEvaluation {
  if (
    result.decision === 'hold' ||
    JSON.stringify(result.recommendedTargets) !== JSON.stringify(evidence.priorTargets)
  ) {
    return result;
  }
  return hold(
    evidence,
    'unavailable',
    ['MISSING_PRIOR_PRESCRIPTION'],
    ['The configured policy cannot produce a valid change for the current prescription.'],
  );
}

export function evaluateWorkoutProgression(
  evidence: WorkoutProgressionEvidence,
): WorkoutProgressionEvaluation {
  const { performance, policy, priorTargets } = evidence;
  if (policy.family === 'unsupported' || evidence.policySource.type === 'none') {
    return hold(
      evidence,
      'unavailable',
      ['MISSING_POLICY'],
      ['No explicit progression policy is configured, so the current prescription is held.'],
    );
  }

  if (policy.contextRequired && evidence.context.availability === 'unavailable') {
    return hold(
      evidence,
      'unavailable',
      ['CONTEXT_UNAVAILABLE'],
      [
        'Required pain, symptom, and technique context is unavailable, so progression fails closed.',
      ],
    );
  }

  const adverseReason = evidence.context.facts.find((fact) =>
    ['programming_hold', 'pain', 'symptoms', 'form_failure'].includes(fact.type),
  );
  if (adverseReason) {
    const reasonCode =
      adverseReason.type === 'programming_hold'
        ? 'PROGRAMMING_HOLD'
        : adverseReason.type === 'form_failure'
          ? 'FORM_FAILURE'
          : 'PAIN_OR_SYMPTOMS';
    return hold(evidence, 'supported', [reasonCode], [adverseReason.detail]);
  }

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
      return requireMaterialChange(evidence, {
        confidence: 'supported',
        decision: 'reduce',
        facts: [
          'At least one required set was missed, so the conservative capacity policy reduces one increment.',
        ],
        reasonCodes: ['MISSED_OR_SKIPPED_SETS'],
        recommendedTargets: adjustLoads(priorTargets, policy, -1),
      });
    }
    return hold(
      evidence,
      'supported',
      ['MISSED_OR_SKIPPED_SETS'],
      ['At least one required set was missed or skipped, so the current prescription is held.'],
    );
  }

  const targetMet = (actual: number | null, exact: number | null, minimum: number | null) => {
    const threshold = exact ?? minimum;
    return threshold === null || (actual !== null && actual >= threshold);
  };
  const completedAsPrescribed = (set: (typeof performance)[number]) =>
    targetMet(set.weight, set.prescribed.weight, set.prescribed.weightMin) &&
    targetMet(set.reps, set.prescribed.reps, set.prescribed.repsMin) &&
    targetMet(set.seconds, set.prescribed.seconds, null) &&
    targetMet(set.distance, set.prescribed.distance, null) &&
    targetMet(set.zone, set.prescribed.zone, null);

  if (!performance.every(completedAsPrescribed)) {
    return hold(
      evidence,
      'supported',
      ['UNDER_PRESCRIBED_TARGET'],
      [
        'At least one completed set was below its previous prescribed load, reps, time, distance, or zone.',
      ],
    );
  }

  const rpeValues = performance.map((set) => set.rpe).filter((value) => value !== null);
  const missingEffort = rpeValues.length !== performance.length;
  const effortRequired = policy.family === 'rpe_regulated' || policy.family === 'rehab_capacity';
  if (effortRequired && missingEffort) {
    return hold(
      evidence,
      'limited',
      ['MISSING_EFFORT'],
      [
        'Effort was not logged for every completed set, so Pulse will not infer that the work was easy.',
      ],
    );
  }

  const withOptionalEffortContext = (
    result: WorkoutProgressionEvaluation,
  ): WorkoutProgressionEvaluation => {
    if (!missingEffort) {
      return result;
    }
    return {
      ...result,
      confidence: result.confidence === 'unavailable' ? 'unavailable' : 'limited',
      facts: [
        ...result.facts,
        'Effort was not logged for every completed set; the completion rule still applies with limited confidence.',
      ],
      reasonCodes: result.reasonCodes.includes('MISSING_EFFORT')
        ? result.reasonCodes
        : [...result.reasonCodes, 'MISSING_EFFORT'],
    };
  };

  const effortCeiling = policy.effortCeiling;
  const highEffort = effortCeiling !== null && rpeValues.some((value) => value > effortCeiling);
  if (highEffort) {
    if (
      policy.family === 'rpe_regulated' ||
      (policy.family === 'rehab_capacity' && policy.allowReduction)
    ) {
      return requireMaterialChange(evidence, {
        confidence: 'supported',
        decision: 'reduce',
        facts: [`Logged effort exceeded the policy ceiling of RPE ${policy.effortCeiling}.`],
        reasonCodes: ['HIGH_EFFORT'],
        recommendedTargets: adjustLoads(priorTargets, policy, -1),
      });
    }
    return withOptionalEffortContext(
      hold(
        evidence,
        'supported',
        ['HIGH_EFFORT'],
        [
          `Logged effort exceeded the policy ceiling of RPE ${policy.effortCeiling}, so load is held.`,
        ],
      ),
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
    if (policy.loadIncrement === null) {
      return withOptionalEffortContext(
        hold(
          evidence,
          'unavailable',
          ['MISSING_PRIOR_PRESCRIPTION'],
          ['The rep-range or equipment increment is missing, so the prescription cannot progress.'],
        ),
      );
    }
    const everySetAtTop = performance.every(
      (set) =>
        set.prescribed.repsMax !== null && set.reps !== null && set.reps >= set.prescribed.repsMax,
    );
    if (!everySetAtTop) {
      return withOptionalEffortContext(
        hold(
          evidence,
          'supported',
          ['BELOW_RANGE_TOP'],
          ['Not every required set reached the top of its previous prescribed rep range.'],
        ),
      );
    }
    return requireMaterialChange(
      evidence,
      withOptionalEffortContext({
        confidence: 'supported',
        decision: 'increase',
        facts: [
          'Every required set reached the top of its previous prescribed rep range.',
          `Load increases by ${policy.loadIncrement} using the configured equipment increment.`,
        ],
        reasonCodes: ['ALL_SETS_AT_RANGE_TOP', 'ROUNDED_TO_INCREMENT'],
        recommendedTargets: adjustLoads(priorTargets, policy, 1),
      }),
    );
  }

  if (policy.family === 'strength_load') {
    if (policy.loadIncrement === null || policy.loadIncreasePercent === null) {
      return withOptionalEffortContext(
        hold(
          evidence,
          'unavailable',
          ['MISSING_PRIOR_PRESCRIPTION'],
          [
            'The strength percentage or equipment increment is missing, so the prescription is held.',
          ],
        ),
      );
    }
    return requireMaterialChange(
      evidence,
      withOptionalEffortContext({
        confidence: 'supported',
        decision: 'increase',
        facts: [
          `All required work was completed within the effort ceiling.`,
          `The configured ${policy.loadIncreasePercent}% increase is rounded to a ${policy.loadIncrement} increment.`,
        ],
        reasonCodes: ['ALL_TARGETS_COMPLETED', 'ROUNDED_TO_INCREMENT'],
        recommendedTargets: increaseStrengthLoads(priorTargets, policy),
      }),
    );
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
    return requireMaterialChange(evidence, {
      confidence: 'supported',
      decision: 'increase',
      facts: [`All completed sets were at or below RPE ${policy.lowEffortThreshold}.`],
      reasonCodes: ['LOW_EFFORT', 'ROUNDED_TO_INCREMENT'],
      recommendedTargets: adjustLoads(priorTargets, policy, 1),
    });
  }

  if (policy.family === 'time_distance') {
    if (policy.secondsStep === null && policy.distanceStep === null) {
      return withOptionalEffortContext(
        hold(
          evidence,
          'unavailable',
          ['MISSING_PRIOR_PRESCRIPTION'],
          ['No time or distance progression step is configured, so the prescription is held.'],
        ),
      );
    }
    const zoneCeiling = policy.zoneCeiling;
    const zoneTooHigh =
      zoneCeiling !== null &&
      performance.some((set) => set.zone !== null && set.zone > zoneCeiling);
    if (zoneTooHigh) {
      return withOptionalEffortContext(
        hold(
          evidence,
          'supported',
          ['HIGH_EFFORT'],
          [`Logged zone exceeded the policy ceiling of Zone ${policy.zoneCeiling}.`],
        ),
      );
    }
    return requireMaterialChange(
      evidence,
      withOptionalEffortContext({
        confidence: 'supported',
        decision: 'increase',
        facts: ['All required work was completed within the configured effort zone.'],
        reasonCodes: ['ALL_TARGETS_COMPLETED'],
        recommendedTargets: increaseTimeDistanceTargets(priorTargets, policy),
      }),
    );
  }

  return hold(
    evidence,
    'unavailable',
    ['UNSUPPORTED_TRACKING_TYPE'],
    ['This exercise tracking mode does not have a supported progression rule.'],
  );
}
