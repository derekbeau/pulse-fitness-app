import { describe, expect, it } from 'vitest';

import type {
  WorkoutProgressionEvidence,
  WorkoutProgressionPolicy,
} from '../schemas/workout-progression.js';
import { evaluateWorkoutProgression } from './workout-progression.js';

const basePolicy: WorkoutProgressionPolicy = {
  allowReduction: false,
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
  return {
    exerciseId: 'exercise-1',
    exerciseName: 'Incline press',
    performance: [
      {
        completed: true,
        distance: null,
        reps: 10,
        rpe: 8,
        seconds: null,
        setId: 'set-1',
        setNumber: 1,
        skipped: false,
        weight: 20,
        zone: null,
      },
      {
        completed: true,
        distance: null,
        reps: 10,
        rpe: 8,
        seconds: null,
        setId: 'set-2',
        setNumber: 2,
        skipped: false,
        weight: 20,
        zone: null,
      },
    ],
    policy: basePolicy,
    priorTargets: [
      {
        distance: null,
        reps: null,
        repsMax: 10,
        repsMin: 8,
        seconds: null,
        setNumber: 1,
        weight: 20,
        zone: null,
      },
      {
        distance: null,
        reps: null,
        repsMax: 10,
        repsMin: 8,
        seconds: null,
        setNumber: 2,
        weight: 20,
        zone: null,
      },
    ],
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

  it('holds rather than inferring easy work when effort is missing', () => {
    const result = evaluateWorkoutProgression(
      evidence({ performance: evidence().performance.map((set) => ({ ...set, rpe: null })) }),
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
            seconds: 1_200,
            setId: 'set-cardio',
            setNumber: 1,
            skipped: false,
            weight: null,
            zone: 2,
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
            setNumber: 1,
            weight: null,
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
        setNumber: 1,
        weight: null,
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
});
