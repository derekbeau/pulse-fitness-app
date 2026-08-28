import { describe, expect, it } from 'vitest';

import type {
  WorkoutProgressionEvidence,
  WorkoutProgressionPolicy,
} from '../schemas/workout-progression.js';
import {
  evaluateWorkoutProgression,
  interpretWorkoutProgressionEffort,
} from './workout-progression.js';

const basePolicy: WorkoutProgressionPolicy = {
  allowReduction: false,
  contextRequired: false,
  distanceStep: null,
  effortCeiling: 8,
  family: 'double_progression',
  loadIncrement: 2.5,
  loadIncreasePercent: null,
  lowEffortThreshold: 7,
  repRangeMax: 10,
  repRangeMin: 8,
  secondsStep: null,
  version: 1,
  zoneCeiling: null,
};

function evidence(overrides: Partial<WorkoutProgressionEvidence> = {}): WorkoutProgressionEvidence {
  const prescribed = (setNumber: number, setId = `set-${setNumber}`) => ({
    distance: null,
    reps: null,
    repsMax: 10,
    repsMin: 8,
    seconds: null,
    setId,
    setNumber,
    weight: 20,
    weightMax: null,
    weightMin: null,
    zone: null,
  });
  return {
    exerciseId: 'exercise-1',
    exerciseName: 'Incline press',
    performance: [
      {
        completed: true,
        distance: null,
        reps: 10,
        rpe: 8,
        rir: null,
        effortSource: 'native_rpe',
        seconds: null,
        setId: 'set-1',
        sourceScheduledSetId: 'source-scheduled-set-1',
        setNumber: 1,
        skipped: false,
        weight: 20,
        zone: null,
        prescribed: prescribed(1),
      },
      {
        completed: true,
        distance: null,
        reps: 10,
        rpe: 8,
        rir: null,
        effortSource: 'native_rpe',
        seconds: null,
        setId: 'set-2',
        sourceScheduledSetId: 'source-scheduled-set-2',
        setNumber: 2,
        skipped: false,
        weight: 20,
        zone: null,
        prescribed: prescribed(2),
      },
    ],
    context: { availability: 'available', facts: [] },
    policy: basePolicy,
    policySource: {
      actorId: 'user-1',
      actorLabel: 'You',
      actorType: 'user',
      configurationId: 'configuration-1',
      configuredAt: 100,
      revision: 1,
      type: 'programming_config',
    },
    priority: false,
    priorTargets: [prescribed(1, 'scheduled-set-1'), prescribed(2, 'scheduled-set-2')],
    scheduledWorkoutDate: '2026-08-24',
    scheduledWorkoutExerciseId: 'scheduled-exercise-1',
    scheduledWorkoutId: 'scheduled-1',
    sourceSessionDate: '2026-08-20',
    sourceSessionId: 'session-1',
    trackingType: 'weight_reps',
    ...overrides,
  };
}

describe('evaluateWorkoutProgression', () => {
  it('increases one explicit increment only after every set reaches the top of the range', () => {
    const result = evaluateWorkoutProgression(evidence());

    expect(result).toMatchObject({
      confidence: 'supported',
      decision: 'increase',
      reasonCodes: ['ALL_SETS_AT_RANGE_TOP', 'ROUNDED_TO_INCREMENT'],
    });
    expect(result.recommendedTargets.map((target) => target.weight)).toEqual([22.5, 22.5]);
  });

  it.each([
    { label: 'below the range', reps: 8, reason: 'BELOW_RANGE_TOP' },
    { label: 'in the middle of the range', reps: 9, reason: 'BELOW_RANGE_TOP' },
  ])('holds when performance is $label', ({ reason, reps }) => {
    const result = evaluateWorkoutProgression(
      evidence({ performance: evidence().performance.map((set) => ({ ...set, reps })) }),
    );

    expect(result.decision).toBe('hold');
    expect(result.reasonCodes).toContain(reason);
    expect(result.recommendedTargets).toEqual(evidence().priorTargets);
  });

  it('uses the rep-completion rule with limited confidence when optional effort is missing', () => {
    const result = evaluateWorkoutProgression(
      evidence({ performance: evidence().performance.map((set) => ({ ...set, rpe: null })) }),
    );

    expect(result).toMatchObject({
      confidence: 'limited',
      decision: 'increase',
      reasonCodes: ['ALL_SETS_AT_RANGE_TOP', 'ROUNDED_TO_INCREMENT', 'MISSING_EFFORT'],
    });
  });

  it('holds when effort is missing for an effort-regulated policy', () => {
    const result = evaluateWorkoutProgression(
      evidence({
        performance: evidence().performance.map((set) => ({ ...set, rpe: null })),
        policy: { ...basePolicy, family: 'rpe_regulated' },
      }),
    );

    expect(result).toMatchObject({
      confidence: 'limited',
      decision: 'hold',
      reasonCodes: ['MISSING_EFFORT'],
    });
  });

  it('holds after high effort under double progression', () => {
    const result = evaluateWorkoutProgression(
      evidence({ performance: evidence().performance.map((set) => ({ ...set, rpe: 9 })) }),
    );

    expect(result).toMatchObject({ decision: 'hold', reasonCodes: ['HIGH_EFFORT'] });
  });

  it('reduces one increment after high effort under RPE regulation', () => {
    const result = evaluateWorkoutProgression(
      evidence({
        performance: evidence().performance.map((set) => ({ ...set, rpe: 9 })),
        policy: { ...basePolicy, family: 'rpe_regulated' },
      }),
    );

    expect(result.decision).toBe('reduce');
    expect(result.recommendedTargets.map((target) => target.weight)).toEqual([17.5, 17.5]);
  });

  it.each([
    { rir: 0, rpe: 10 },
    { rir: 1, rpe: 9 },
    { rir: 2, rpe: 8 },
    { rir: 3, rpe: 7 },
    { rir: 4, rpe: 6 },
  ])('treats native RIR $rir as policy-equivalent to native RPE $rpe', ({ rir, rpe }) => {
    const nativeRpe = evaluateWorkoutProgression(
      evidence({
        performance: evidence().performance.map((set) => ({
          ...set,
          effortSource: 'native_rpe',
          rir: null,
          rpe,
        })),
        policy: { ...basePolicy, family: 'rpe_regulated' },
      }),
    );
    const nativeRir = evaluateWorkoutProgression(
      evidence({
        performance: evidence().performance.map((set) => ({
          ...set,
          effortSource: 'native_rir',
          rir,
          rpe: null,
        })),
        policy: { ...basePolicy, family: 'rpe_regulated' },
      }),
    );

    expect(nativeRir).toEqual(nativeRpe);
  });

  it('keeps RIR 5+ as a bounded low-effort bucket rather than exact RPE 5', () => {
    expect(
      interpretWorkoutProgressionEffort({ effortSource: 'native_rir', rir: 5, rpe: null }),
    ).toEqual({
      kind: 'upper_bound',
      maximumEffectiveRpe: 5,
    });
    const result = evaluateWorkoutProgression(
      evidence({
        performance: evidence().performance.map((set) => ({
          ...set,
          effortSource: 'native_rir',
          rir: 5,
          rpe: null,
        })),
        policy: { ...basePolicy, family: 'rpe_regulated' },
      }),
    );
    expect(result).toMatchObject({ confidence: 'supported', decision: 'increase' });
  });

  it('respects non-standard increments', () => {
    const result = evaluateWorkoutProgression(
      evidence({ policy: { ...basePolicy, loadIncrement: 1.25 } }),
    );

    expect(result.recommendedTargets.map((target) => target.weight)).toEqual([21.25, 21.25]);
  });

  it('never silently increases a rehab prescription', () => {
    const result = evaluateWorkoutProgression(
      evidence({ policy: { ...basePolicy, family: 'rehab_capacity' } }),
    );

    expect(result).toMatchObject({
      decision: 'hold',
      reasonCodes: ['REHAB_NO_AUTOMATIC_INCREASE'],
    });
  });

  it('progresses duration and distance without inventing load or reps', () => {
    const result = evaluateWorkoutProgression(
      evidence({
        performance: [
          {
            completed: true,
            distance: 2,
            reps: null,
            rpe: 6,
            rir: null,
            effortSource: 'native_rpe',
            seconds: 1_200,
            setId: 'set-cardio',
            sourceScheduledSetId: 'source-cardio-set',
            setNumber: 1,
            skipped: false,
            weight: null,
            zone: 2,
            prescribed: {
              distance: 2,
              reps: null,
              repsMax: null,
              repsMin: null,
              seconds: 1_200,
              setId: 'set-cardio',
              setNumber: 1,
              weight: null,
              weightMax: null,
              weightMin: null,
              zone: 2,
            },
          },
        ],
        policy: {
          ...basePolicy,
          distanceStep: 0.25,
          family: 'time_distance',
          loadIncrement: null,
          repRangeMax: null,
          repRangeMin: null,
          secondsStep: 60,
          zoneCeiling: 2,
        },
        priorTargets: [
          {
            distance: 2,
            reps: null,
            repsMax: null,
            repsMin: null,
            seconds: 1_200,
            setId: 'scheduled-cardio-set',
            setNumber: 1,
            weight: null,
            weightMax: null,
            weightMin: null,
            zone: 2,
          },
        ],
        trackingType: 'cardio',
      }),
    );

    expect(result).toMatchObject({ decision: 'increase' });
    expect(result.recommendedTargets).toEqual([
      {
        distance: 2.25,
        reps: null,
        repsMax: null,
        repsMin: null,
        seconds: 1_260,
        setId: 'scheduled-cardio-set',
        setNumber: 1,
        weight: null,
        weightMax: null,
        weightMin: null,
        zone: 2,
      },
    ]);
  });

  it('preserves exercise and set identity by returning one target for every prior set', () => {
    const input = evidence();
    const result = evaluateWorkoutProgression(input);

    expect(result.recommendedTargets.map((target) => target.setNumber)).toEqual(
      input.priorTargets.map((target) => target.setNumber),
    );
    expect(input.exerciseId).toBe('exercise-1');
  });

  it.each([
    ['weight', { weight: 19 }],
    ['reps', { reps: 7 }],
  ])('holds when completed %s is below the immutable previous prescription', (_label, patch) => {
    const result = evaluateWorkoutProgression(
      evidence({
        performance: evidence().performance.map((set, index) =>
          index === 0 ? { ...set, ...patch } : set,
        ),
      }),
    );

    expect(result).toMatchObject({
      decision: 'hold',
      reasonCodes: ['UNDER_PRESCRIBED_TARGET'],
    });
  });

  it('uses the source prescription threshold when the future plan rep range changes', () => {
    const changedFuturePlan = evidence().priorTargets.map((target) => ({
      ...target,
      repsMax: 15,
      repsMin: 12,
    }));
    const result = evaluateWorkoutProgression(evidence({ priorTargets: changedFuturePlan }));

    expect(result.decision).toBe('increase');
    expect(result.reasonCodes).toContain('ALL_SETS_AT_RANGE_TOP');
    expect(result.recommendedTargets.map((target) => target.repsMax)).toEqual([15, 15]);
  });

  it.each([
    ['double_progression', 'pain', 'PAIN_OR_SYMPTOMS'],
    ['strength_load', 'symptoms', 'PAIN_OR_SYMPTOMS'],
    ['rpe_regulated', 'form_failure', 'FORM_FAILURE'],
    ['time_distance', 'programming_hold', 'PROGRAMMING_HOLD'],
    ['rehab_capacity', 'pain', 'PAIN_OR_SYMPTOMS'],
  ] as const)(
    'lets %s policy adverse %s context override progression',
    (family, type, reasonCode) => {
      const result = evaluateWorkoutProgression(
        evidence({
          context: {
            availability: 'available',
            facts: [{ detail: `Observed ${type}`, source: 'programming_config', type }],
          },
          policy: {
            ...basePolicy,
            distanceStep: family === 'time_distance' ? 0.25 : null,
            family,
            loadIncreasePercent: family === 'strength_load' ? 2.5 : null,
          },
        }),
      );

      expect(result).toMatchObject({ decision: 'hold', reasonCodes: [reasonCode] });
    },
  );

  it('fails closed when a conservative policy requires unavailable context', () => {
    expect(
      evaluateWorkoutProgression(
        evidence({
          context: { availability: 'unavailable', facts: [] },
          policy: { ...basePolicy, contextRequired: true, family: 'rehab_capacity' },
        }),
      ),
    ).toMatchObject({ confidence: 'unavailable', reasonCodes: ['CONTEXT_UNAVAILABLE'] });
  });

  it('holds unavailable without changing targets when no policy is configured', () => {
    const input = evidence({
      policy: {
        ...basePolicy,
        effortCeiling: null,
        family: 'unsupported',
        loadIncrement: null,
        lowEffortThreshold: null,
        repRangeMax: null,
        repRangeMin: null,
      },
      policySource: {
        actorId: null,
        actorLabel: null,
        actorType: null,
        configurationId: null,
        configuredAt: null,
        revision: 0,
        type: 'none',
      },
    });
    const result = evaluateWorkoutProgression(input);
    expect(result).toMatchObject({
      confidence: 'unavailable',
      decision: 'hold',
      reasonCodes: ['MISSING_POLICY'],
    });
    expect(result.recommendedTargets).toEqual(input.priorTargets);
  });

  it('fails closed when a configured increase cannot change a compatible target', () => {
    const input = evidence({
      priorTargets: evidence().priorTargets.map((target) => ({ ...target, weight: null })),
      trackingType: 'bodyweight_reps',
    });

    expect(evaluateWorkoutProgression(input)).toMatchObject({
      confidence: 'unavailable',
      decision: 'hold',
      reasonCodes: ['MISSING_PRIOR_PRESCRIPTION'],
      recommendedTargets: input.priorTargets,
    });
  });

  it('holds instead of inverting a light load range during reduction', () => {
    const rangeTarget = (target: WorkoutProgressionEvidence['priorTargets'][number]) => ({
      ...target,
      weight: null,
      weightMax: 20,
      weightMin: 14,
    });
    const input = evidence({
      performance: evidence().performance.map((set) => ({
        ...set,
        prescribed: rangeTarget(set.prescribed),
        rpe: 9,
        weight: 14,
      })),
      policy: { ...basePolicy, family: 'rpe_regulated', loadIncrement: 10 },
      priorTargets: evidence().priorTargets.map(rangeTarget),
    });

    expect(evaluateWorkoutProgression(input)).toMatchObject({
      confidence: 'unavailable',
      decision: 'hold',
      reasonCodes: ['MISSING_PRIOR_PRESCRIPTION'],
      recommendedTargets: input.priorTargets,
    });
  });

  it('holds instead of producing an invalid zero-load reduction', () => {
    const input = evidence({
      performance: evidence().performance.map((set) => ({
        ...set,
        prescribed: { ...set.prescribed, weight: 2.5 },
        rpe: 9,
        weight: 2.5,
      })),
      policy: { ...basePolicy, family: 'rpe_regulated', loadIncrement: 5 },
      priorTargets: evidence().priorTargets.map((target) => ({ ...target, weight: 2.5 })),
    });

    expect(evaluateWorkoutProgression(input)).toMatchObject({
      confidence: 'unavailable',
      decision: 'hold',
      reasonCodes: ['MISSING_PRIOR_PRESCRIPTION'],
      recommendedTargets: input.priorTargets,
    });
  });
});
