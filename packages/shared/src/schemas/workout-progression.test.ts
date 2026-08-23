import { describe, expect, it } from 'vitest';

import {
  applyWorkoutProgressionActionInputSchema,
  workoutMuscleContributionSchema,
  workoutProgressionPolicySchema,
  workoutProgressionRecommendationSchema,
} from './workout-progression.js';

describe('workout progression schemas', () => {
  const policy = {
    allowReduction: false,
    distanceStep: null,
    effortCeiling: 8,
    family: 'double_progression' as const,
    loadIncrement: 2.5,
    loadIncreasePercent: null,
    lowEffortThreshold: 7,
    repRangeMax: 10,
    repRangeMin: 8,
    secondsStep: null,
    version: 1 as const,
    zoneCeiling: null,
  };

  it('rejects contradictory policy thresholds and unknown fields', () => {
    expect(() =>
      workoutProgressionPolicySchema.parse({ ...policy, repRangeMin: 12, surprise: true }),
    ).toThrow();
  });

  it('requires bounded edit targets and hold reasons exactly for their actions', () => {
    const base = {
      editedTargets: null,
      expectedFingerprint: 'a'.repeat(64),
      idempotencyKey: 'action-key-1',
      reason: null,
    };

    expect(() =>
      applyWorkoutProgressionActionInputSchema.parse({ ...base, action: 'edit' }),
    ).toThrow();
    expect(() =>
      applyWorkoutProgressionActionInputSchema.parse({ ...base, action: 'hold' }),
    ).toThrow();
    expect(
      applyWorkoutProgressionActionInputSchema.parse({ ...base, action: 'keep' }),
    ).toMatchObject({ action: 'keep' });
  });

  it('enforces explicit versioned primary and secondary factors', () => {
    expect(
      workoutMuscleContributionSchema.parse({
        effectiveAt: 1,
        exerciseId: 'exercise-1',
        factor: 1,
        id: 'contribution-1',
        muscle: 'chest',
        role: 'primary',
        version: 1,
      }),
    ).toMatchObject({ role: 'primary' });
    expect(() =>
      workoutMuscleContributionSchema.parse({
        effectiveAt: 1,
        exerciseId: 'exercise-1',
        factor: 0.75,
        id: 'contribution-1',
        muscle: 'chest',
        role: 'secondary',
        version: 1,
      }),
    ).toThrow();
  });

  it('rejects stale-state contradictions and changed set counts', () => {
    const target = {
      distance: null,
      reps: null,
      repsMax: 10,
      repsMin: 8,
      seconds: null,
      setNumber: 1,
      weight: 20,
      zone: null,
    };
    const recommendation = {
      confidence: 'supported',
      decision: 'hold',
      effectiveDate: '2026-08-23',
      evidence: {
        exerciseId: 'exercise-1',
        exerciseName: 'Press',
        performance: [],
        policy,
        priorTargets: [target],
        scheduledWorkoutExerciseId: 'scheduled-exercise-1',
        scheduledWorkoutId: 'scheduled-1',
        sourceSessionDate: null,
        sourceSessionId: null,
        trackingType: 'weight_reps',
      },
      facts: ['Hold current targets.'],
      generatedAt: 1,
      id: 'recommendation-1',
      reasonCodes: ['NO_COMPLETED_HISTORY'],
      recommendedTargets: [target],
      sourceFingerprint: 'a'.repeat(64),
      staleAt: null,
      state: 'stale',
      userId: 'user-1',
    };

    expect(() => workoutProgressionRecommendationSchema.parse(recommendation)).toThrow();
    expect(() =>
      workoutProgressionRecommendationSchema.parse({
        ...recommendation,
        recommendedTargets: [target, { ...target, setNumber: 2 }],
        staleAt: 2,
      }),
    ).toThrow();
  });
});
