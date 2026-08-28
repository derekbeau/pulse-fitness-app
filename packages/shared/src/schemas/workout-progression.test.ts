import { describe, expect, it } from 'vitest';

import {
  applyWorkoutProgressionActionInputSchema,
  configureWorkoutProgressionInputSchema,
  workoutMuscleAnalyticsQuerySchema,
  workoutMuscleAnalyticsSchema,
  workoutMuscleContributionSchema,
  workoutProgressionPolicySchema,
  workoutProgressionRecommendationSchema,
  workoutProgressionTargetSchema,
} from './workout-progression.js';

describe('workout progression schemas', () => {
  const policy = {
    allowReduction: false,
    contextRequired: false,
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

  it('rejects zero, extreme, ranged-exact, and unsupported policy configurations', () => {
    const target = {
      distance: null,
      reps: null,
      repsMax: 10,
      repsMin: 8,
      seconds: null,
      setId: 'set-1',
      setNumber: 1,
      weight: 20,
      weightMax: null,
      weightMin: null,
      zone: null,
    };
    expect(() => workoutProgressionTargetSchema.parse({ ...target, repsMin: 0 })).toThrow();
    expect(() => workoutProgressionTargetSchema.parse({ ...target, repsMax: 1_001 })).toThrow();
    expect(() => workoutProgressionTargetSchema.parse({ ...target, reps: 8 })).toThrow();
    expect(() => workoutProgressionTargetSchema.parse({ ...target, weight: 0 })).toThrow();
    expect(() => workoutProgressionTargetSchema.parse({ ...target, zone: 6 })).toThrow();
    expect(() =>
      configureWorkoutProgressionInputSchema.parse({
        contextAvailability: 'available',
        contextFacts: [],
        expectedRevision: 0,
        policy: {
          ...policy,
          effortCeiling: null,
          family: 'unsupported',
          loadIncrement: null,
          lowEffortThreshold: null,
          repRangeMax: null,
          repRangeMin: null,
        },
        priority: false,
      }),
    ).toThrow();
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

  it('keeps muscle analytics sources typed while allowing server-owned live dates', () => {
    expect(workoutMuscleAnalyticsQuerySchema.parse({ timeZone: 'UTC' })).toEqual({
      range: '30d',
      timeZone: 'UTC',
    });
    expect(workoutMuscleAnalyticsQuerySchema.parse({})).toEqual({ range: '30d' });
    expect(() => workoutMuscleAnalyticsQuerySchema.parse({ timeZone: 'Detroit' })).toThrow();

    const analytics = {
      contributionVersion: 1 as const,
      endDate: '2026-08-23',
      qualifyingSetPolicyVersion: 1 as const,
      range: '7d' as const,
      rows: [
        {
          change: 'increased' as const,
          completedSessionCount: 1,
          exerciseCount: 1,
          exposureState: 'fully_completed' as const,
          fulfilledPlannedSetEquivalents: 2,
          muscle: 'chest',
          plannedSetEquivalents: 2,
          previousQualifyingSetEquivalents: 1,
          priority: true,
          qualifyingSetEquivalents: 2,
          sourceCount: 1,
          sourceIds: ['set-1'],
          sourceIdsTruncated: false,
          volumeLoad: 400,
        },
      ],
      series: [
        {
          date: '2026-08-23',
          muscle: 'chest',
          plannedSetEquivalents: 2,
          qualifyingSetEquivalents: 2,
          volumeLoad: 400,
        },
      ],
      sources: [
        {
          contributionId: 'contribution-1',
          date: '2026-08-23',
          exerciseId: 'exercise-1',
          exerciseName: 'Press',
          factor: 1,
          muscle: 'chest',
          role: 'primary' as const,
          scheduledWorkoutId: null,
          sessionId: 'session-1',
          setId: 'set-1',
          sourceScheduledSetId: 'planned-set-1',
          sourceType: 'completed' as const,
          volumeLoad: 400,
        },
      ],
      sourceCount: 1,
      sourcesTruncated: false,
      startDate: '2026-08-17',
      timeZone: 'UTC',
      weightUnit: 'lbs' as const,
    };
    expect(workoutMuscleAnalyticsSchema.parse(analytics)).toEqual(analytics);
    expect(() =>
      workoutMuscleAnalyticsSchema.parse({
        ...analytics,
        rows: [{ ...analytics.rows[0], fulfilledPlannedSetEquivalents: 3 }],
      }),
    ).toThrow();
    expect(() =>
      workoutMuscleAnalyticsSchema.parse({ ...analytics, sourcesTruncated: true }),
    ).toThrow();
    expect(() =>
      workoutMuscleAnalyticsSchema.parse({
        ...analytics,
        sources: [
          {
            ...analytics.sources[0],
            scheduledWorkoutId: 'scheduled-1',
            sourceType: 'planned',
          },
        ],
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
      weightMax: null,
      weightMin: null,
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
        scheduledWorkoutDate: '2026-08-23',
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
