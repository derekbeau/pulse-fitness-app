import { describe, expect, it } from 'vitest';

import {
  adaptiveActivityLevelSchema,
  adaptiveCheckInKindSchema,
  adaptiveCheckInStatusSchema,
  adaptiveCheckInStateSchema,
  adaptiveConfidenceLabelSchema,
  adaptiveCurrentGoalSchema,
  adaptiveEligibilityProgressSchema,
  adaptiveGoalDetailSchema,
  adaptiveGoalCompletionSchema,
  adaptiveGoalEditInputSchema,
  adaptiveGoalCompleteInputSchema,
  adaptiveGoalLifecycleInputSchema,
  adaptiveGoalProgressSchema,
  adaptiveGoalProjectionSchema,
  adaptiveGoalStartInputSchema,
  adaptiveGoalHistorySummarySchema,
  adaptiveGoalRevisionSchema,
  adaptiveGoalSchema,
  adaptiveGoalSnapshotSchema,
  adaptiveGoalTypeSchema,
  adaptiveAcceptInputSchema,
  adaptiveCheckInQuerySchema,
  adaptiveCheckInInputSnapshotSchema,
  adaptiveNutritionStateSchema,
  adaptiveProgramCalculationSchema,
  adaptiveProgramMutationSchema,
  adaptiveProgramSetupSchema,
  adaptivePreviewInputSchema,
  adaptiveRecommendationSchema,
  adaptiveReasonCodeSchema,
  adaptiveRmrEquationSchema,
} from './adaptive-nutrition.js';
import { ADAPTIVE_TDEE_CONSTANTS } from '../utils/adaptive-tdee.js';

const validProgram = {
  status: 'active' as const,
  timeZone: 'America/Detroit',
  rmrEquation: 'mifflin_male' as const,
  heightCm: 178,
  birthDate: '1990-02-28',
  activityLevel: 'active' as const,
  activityMultiplier: 1.55,
  estimatedRmrKcal: 1700,
  calculatedBaselineTdeeKcal: 2635,
  manualBaselineTdeeKcal: null,
  baselineTdeeKcal: 2500,
  goalType: 'lose' as const,
  targetWeightKg: 75,
  goalRatePctPerWeek: -0.5,
  proteinGrams: 180,
  fatAllocationPct: 30,
  systemCalorieFloorKcal: 1500,
  userCalorieFloorKcal: 1600,
  algorithmVersion: 'adaptive-tdee-v1' as const,
};

const validProgramMutation = {
  status: 'active' as const,
  timeZone: 'America/Detroit',
  heightCm: 178,
  birthDate: '1990-02-28',
  rmrEquation: 'mifflin_male' as const,
  activityLevel: 'active' as const,
  manualBaselineTdeeKcal: null,
  goalType: 'lose' as const,
  targetWeightKg: 75,
  goalRatePctPerWeek: -0.5,
  proteinGrams: 180,
  fatAllocationPct: 30,
  currentWeight: { weight: 180, unit: 'lbs' as const },
};

describe('adaptive TDEE schemas', () => {
  it('requires explicit logged, usable, pending, and cutoff readiness semantics', () => {
    const readiness = {
      eligible: false,
      completeNutritionDaysLogged: 2,
      completeNutritionDaysUsable: 0,
      completeNutritionDaysBeforeWeightTrend: 2,
      completeNutritionDaysAwaitingWeightTrend: 0,
      completeNutritionDaysPendingCutoff: 1,
      requiredCompleteNutritionDays: 12,
      weighInsLogged: 1,
      weighInsUsable: 0,
      weighInsPendingCutoff: 1,
      requiredWeighIns: 3,
      weightSpanDays: 0,
      requiredWeightSpanDays: 14,
      latestUsableWeightAgeDays: null,
      analysisEndDate: '2026-08-13',
      pendingCutoffDate: '2026-08-14',
      timeZone: 'America/Detroit',
      noteCodes: [
        'COMPLETE_NUTRITION_PENDING_COMPLETED_DAY_CUTOFF',
        'WEIGH_INS_PENDING_COMPLETED_DAY_CUTOFF',
        'COMPLETE_NUTRITION_BEFORE_WEIGHT_TREND',
      ],
      reasonCodes: ['INSUFFICIENT_WEIGHT', 'NO_OVERLAPPING_DATA'],
    };

    expect(adaptiveEligibilityProgressSchema.safeParse(readiness).success).toBe(true);
    expect(
      adaptiveEligibilityProgressSchema.safeParse({
        ...readiness,
        completeNutritionDays: 0,
      }).success,
    ).toBe(false);
    const missingWeightPendingCount = Object.fromEntries(
      Object.entries(readiness).filter(([key]) => key !== 'weighInsPendingCutoff'),
    );
    expect(adaptiveEligibilityProgressSchema.safeParse(missingWeightPendingCount).success).toBe(
      false,
    );
    const missingNutritionPendingCount = Object.fromEntries(
      Object.entries(readiness).filter(([key]) => key !== 'completeNutritionDaysPendingCutoff'),
    );
    expect(adaptiveEligibilityProgressSchema.safeParse(missingNutritionPendingCount).success).toBe(
      false,
    );
  });

  it('exposes every closed calculation enum', () => {
    expect(adaptiveRmrEquationSchema.options).toEqual([
      'mifflin_male',
      'mifflin_female',
      'manual_tdee',
    ]);
    expect(adaptiveActivityLevelSchema.options).toEqual([
      'sedentary',
      'low_active',
      'active',
      'very_active',
    ]);
    expect(adaptiveGoalTypeSchema.options).toEqual(['lose', 'maintain', 'gain']);
    expect(adaptiveCheckInKindSchema.options).toEqual([
      'baseline',
      'weekly',
      'manual',
      'goal_change',
    ]);
    expect(adaptiveCheckInStatusSchema.options).toEqual([
      'pending',
      'accepted',
      'declined',
      'superseded',
      'held',
    ]);
    expect(adaptiveCheckInStateSchema.options).toEqual([
      'baseline',
      'learning',
      'holding',
      'updating',
    ]);
    expect(adaptiveConfidenceLabelSchema.options).toEqual(['Developing', 'Moderate', 'High']);
    expect(adaptiveReasonCodeSchema.options).toHaveLength(18);
  });

  it('accepts a complete equation-based program and rejects unknown fields', () => {
    expect(adaptiveProgramCalculationSchema.parse(validProgram)).toEqual(validProgram);
    expect(
      adaptiveProgramCalculationSchema.safeParse({ ...validProgram, createdAt: 123 }).success,
    ).toBe(false);
  });

  it('requires a manual TDEE in manual mode', () => {
    expect(
      adaptiveProgramCalculationSchema.safeParse({
        ...validProgram,
        rmrEquation: 'manual_tdee',
        heightCm: null,
        birthDate: null,
        activityLevel: null,
        activityMultiplier: null,
        estimatedRmrKcal: null,
        calculatedBaselineTdeeKcal: null,
        manualBaselineTdeeKcal: null,
      }).success,
    ).toBe(false);
    expect(
      adaptiveProgramCalculationSchema.safeParse({
        ...validProgram,
        rmrEquation: 'manual_tdee',
        heightCm: null,
        birthDate: null,
        activityLevel: null,
        activityMultiplier: null,
        estimatedRmrKcal: null,
        calculatedBaselineTdeeKcal: null,
        manualBaselineTdeeKcal: 2400,
      }).success,
    ).toBe(true);
  });

  it.each(['heightCm', 'birthDate', 'activityLevel'] as const)(
    'requires %s for an equation-based program',
    (field) => {
      expect(
        adaptiveProgramCalculationSchema.safeParse({ ...validProgram, [field]: null }).success,
      ).toBe(false);
    },
  );

  it.each([
    ['lose', -0.5],
    ['gain', 0.25],
  ] as const)('requires a target for %s goals', (goalType, goalRatePctPerWeek) => {
    expect(
      adaptiveProgramCalculationSchema.safeParse({
        ...validProgram,
        goalType,
        goalRatePctPerWeek,
        targetWeightKg: null,
      }).success,
    ).toBe(false);
  });

  it('requires zero rate for maintenance and the proper sign for weight-change goals', () => {
    expect(
      adaptiveProgramCalculationSchema.safeParse({
        ...validProgram,
        goalType: 'maintain',
        targetWeightKg: null,
        goalRatePctPerWeek: -0.1,
      }).success,
    ).toBe(false);
    expect(
      adaptiveProgramCalculationSchema.safeParse({
        ...validProgram,
        goalRatePctPerWeek: 0.1,
      }).success,
    ).toBe(false);
    expect(
      adaptiveProgramCalculationSchema.safeParse({
        ...validProgram,
        goalType: 'gain',
        goalRatePctPerWeek: -0.1,
      }).success,
    ).toBe(false);
  });

  it('rejects a user floor below the calculated system floor', () => {
    expect(
      adaptiveProgramCalculationSchema.safeParse({
        ...validProgram,
        systemCalorieFloorKcal: 1600,
        userCalorieFloorKcal: 1599,
      }).success,
    ).toBe(false);
  });

  it('validates loss and gain target direction against current weight', () => {
    expect(
      adaptiveProgramSetupSchema.safeParse({ ...validProgram, currentWeightKg: 82 }).success,
    ).toBe(true);
    expect(
      adaptiveProgramSetupSchema.safeParse({
        ...validProgram,
        targetWeightKg: 82,
        currentWeightKg: 82,
      }).success,
    ).toBe(false);
    expect(
      adaptiveProgramSetupSchema.safeParse({
        ...validProgram,
        goalType: 'gain',
        goalRatePctPerWeek: 0.25,
        targetWeightKg: 81,
        currentWeightKg: 82,
      }).success,
    ).toBe(false);
  });

  it('enforces every numeric program boundary', () => {
    for (const invalid of [
      { heightCm: 99 },
      { heightCm: 251 },
      { targetWeightKg: 24 },
      { targetWeightKg: 351 },
      { proteinGrams: 39 },
      { proteinGrams: 401 },
      { fatAllocationPct: 19.9 },
      { fatAllocationPct: 40.1 },
      { goalRatePctPerWeek: -1.01 },
      { goalRatePctPerWeek: -0.09 },
      { systemCalorieFloorKcal: 1199 },
      { systemCalorieFloorKcal: 1500.5 },
    ]) {
      expect(
        adaptiveProgramCalculationSchema.safeParse({ ...validProgram, ...invalid }).success,
      ).toBe(false);
    }

    expect(
      adaptiveProgramCalculationSchema.safeParse({
        ...validProgram,
        goalRatePctPerWeek: -1,
        heightCm: 100,
        targetWeightKg: 25,
        proteinGrams: 40,
        fatAllocationPct: 20,
      }).success,
    ).toBe(true);
    expect(
      adaptiveProgramCalculationSchema.safeParse({
        ...validProgram,
        goalType: 'gain',
        goalRatePctPerWeek: 0.09,
        targetWeightKg: 90,
      }).success,
    ).toBe(false);
    expect(
      adaptiveProgramCalculationSchema.safeParse({
        ...validProgram,
        goalType: 'gain',
        goalRatePctPerWeek: 0.5,
        targetWeightKg: 90,
      }).success,
    ).toBe(true);
  });

  it('parses every calculation response union and rejects mismatched payloads', () => {
    const base = {
      algorithmVersion: 'adaptive-tdee-v1' as const,
      inputFingerprint: 'a'.repeat(64),
      kind: 'manual' as const,
      boundaries: {
        previewDate: '2026-06-22',
        analysisStart: '2026-06-01',
        analysisEnd: '2026-06-21',
        warmupStart: '2026-05-11',
      },
      reasonCodes: [],
      suspectWeightEntryIds: [],
      suspectWeightEntries: [],
      excludedNutritionDates: [],
      completeNutritionDays: 21,
      actualWeightCount: 7,
      trendPointCount: 21,
      averageDailyIntakeKcal: 2500,
      priorTdeeKcal: 2500,
      latestTrendWeightKg: 82,
    };
    const goal = {
      rawGoalCalories: 2500,
      goalCalories: 2500,
      desiredWeightChangeKgPerDay: 0,
      requestedCalorieAdjustment: 0,
      achievableGoalRatePctPerWeek: 0,
      goalReached: false,
      reasonCodes: [],
    };
    const macros = {
      calories: 2500,
      protein: 180,
      carbs: 258,
      fat: 85,
      macroCalories: 2497,
      calorieDifference: -3,
    };
    const validMacros = { ...macros, carbs: 259, macroCalories: 2501, calorieDifference: 1 };
    const nonUpdating = {
      ...base,
      weightTrendKgPerDay: null,
      observedTdeeKcal: null,
      confidence: null,
      adaptiveUpdate: null,
      goal: null,
      macros: null,
    };
    for (const state of ['learning', 'holding'] as const) {
      expect(adaptiveRecommendationSchema.safeParse({ ...nonUpdating, state }).success).toBe(true);
    }
    expect(
      adaptiveRecommendationSchema.safeParse({
        ...base,
        state: 'baseline',
        weightTrendKgPerDay: null,
        observedTdeeKcal: null,
        confidence: null,
        adaptiveUpdate: null,
        goal,
        macros: validMacros,
      }).success,
    ).toBe(true);
    expect(
      adaptiveRecommendationSchema.safeParse({
        ...base,
        state: 'updating',
        weightTrendKgPerDay: 0,
        observedTdeeKcal: 2500,
        confidence: {
          score: 1,
          label: 'High',
          nutritionCoverage: 1,
          weightFrequency: 1,
          spanScore: 1,
          recencyScore: 1,
        },
        adaptiveUpdate: {
          priorTdeeKcal: 2500,
          observedTdeeKcal: 2500,
          blendedTdeeKcal: 2500,
          requestedChangeKcal: 0,
          limitedChangeKcal: 0,
          proposedTdeeKcal: 2500,
          limited: false,
          reasonCodes: [],
        },
        goal,
        macros: validMacros,
      }).success,
    ).toBe(true);
    expect(
      adaptiveRecommendationSchema.safeParse({ ...nonUpdating, state: 'updating' }).success,
    ).toBe(false);
    expect(
      adaptiveRecommendationSchema.safeParse({ ...nonUpdating, state: 'unknown' }).success,
    ).toBe(false);
  });

  it('validates lifecycle program mutations and applies explicit control defaults', () => {
    expect(adaptiveProgramMutationSchema.parse(validProgramMutation)).toMatchObject({
      ...validProgramMutation,
      rebaseline: false,
      supersedePending: false,
    });
    expect(
      adaptiveProgramMutationSchema.safeParse({
        ...validProgramMutation,
        rmrEquation: 'manual_tdee',
        heightCm: null,
        birthDate: null,
        activityLevel: null,
        manualBaselineTdeeKcal: null,
      }).success,
    ).toBe(false);
    for (const field of ['heightCm', 'birthDate', 'activityLevel'] as const) {
      expect(
        adaptiveProgramMutationSchema.safeParse({ ...validProgramMutation, [field]: null }).success,
      ).toBe(false);
    }
    expect(
      adaptiveProgramMutationSchema.safeParse({
        ...validProgramMutation,
        targetWeightKg: null,
      }).success,
    ).toBe(false);
    expect(
      adaptiveProgramMutationSchema.safeParse({
        ...validProgramMutation,
        goalType: 'maintain',
        targetWeightKg: null,
        goalRatePctPerWeek: -0.1,
      }).success,
    ).toBe(false);
  });

  it('validates preview, acceptance, pagination, and empty read-state contracts', () => {
    expect(adaptivePreviewInputSchema.parse({ kind: 'manual' })).toEqual({
      kind: 'manual',
      includeToday: false,
    });
    expect(
      adaptivePreviewInputSchema.safeParse({ kind: 'weekly', includeToday: true }).success,
    ).toBe(false);
    expect(adaptiveAcceptInputSchema.parse({})).toEqual({ replaceSameDateTarget: false });
    expect(adaptiveCheckInQuerySchema.parse({ page: '2', limit: '100' })).toEqual({
      page: 2,
      limit: 100,
    });
    expect(adaptiveCheckInQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(
      adaptiveNutritionStateSchema.parse({
        state: 'setup_required',
        localDate: '2026-08-23',
        timeZone: 'UTC',
        timeZoneSource: 'user_profile',
        program: null,
        currentTarget: null,
        latestAcceptedCheckIn: null,
        pendingCheckIn: null,
        checkInDue: false,
        nextCheckInDate: null,
        eligibility: null,
        activeGoal: null,
        goalProgress: null,
        pendingGoalChange: null,
        goalActionRequired: null,
      }),
    ).toMatchObject({ state: 'setup_required' });
    expect(
      adaptiveNutritionStateSchema.safeParse({
        state: 'setup_required',
        localDate: '2026-08-23',
        timeZone: 'America/Detroit',
        timeZoneSource: 'adaptive_program',
        program: null,
        currentTarget: null,
        latestAcceptedCheckIn: null,
        pendingCheckIn: null,
        checkInDue: false,
        nextCheckInDate: null,
        eligibility: null,
        activeGoal: null,
        goalProgress: null,
        pendingGoalChange: null,
        goalActionRequired: null,
      }).success,
    ).toBe(false);
  });

  it('validates strict goal, revision, history, detail, and current-read boundaries', () => {
    const goal = {
      id: 'goal-1',
      userId: 'user-1',
      programId: 'program-1',
      type: 'lose' as const,
      status: 'active' as const,
      startTrendWeightKg: 82,
      startScaleWeightKg: 82.2,
      finalTrendWeightKg: null,
      targetWeightKg: 75,
      maintenanceCenterKg: null,
      goalRatePctPerWeek: -0.5,
      startedLocalDate: '2026-06-01',
      endedLocalDate: null,
      endedReason: null,
      createdAt: 1,
      updatedAt: 1,
    };
    const revision = {
      id: 'revision-1',
      goalId: 'goal-1',
      userId: 'user-1',
      sequence: 1,
      targetWeightKg: 75,
      maintenanceCenterKg: null,
      goalRatePctPerWeek: -0.5,
      previousTargetWeightKg: 75,
      previousCenterKg: null,
      previousRatePctPerWeek: -0.5,
      reason: 'created' as const,
      effectiveLocalDate: '2026-06-01',
      createdAt: 1,
    };
    expect(adaptiveGoalSchema.parse(goal)).toEqual(goal);
    expect(adaptiveGoalRevisionSchema.parse(revision)).toEqual(revision);
    expect(
      adaptiveGoalSchema.safeParse({
        ...goal,
        status: 'completed',
        finalTrendWeightKg: 79.4,
        endedLocalDate: '2026-08-01',
        endedReason: 'completed',
      }).success,
    ).toBe(true);
    expect(
      adaptiveGoalSchema.safeParse({ ...goal, status: 'completed', endedLocalDate: null }).success,
    ).toBe(false);
    expect(
      adaptiveGoalSchema.safeParse({
        ...goal,
        status: 'completed',
        endedLocalDate: null,
        endedReason: 'completed',
      }).success,
    ).toBe(false);
    expect(
      adaptiveGoalSchema.safeParse({ ...goal, type: 'maintain', targetWeightKg: null }).success,
    ).toBe(false);
    expect(adaptiveGoalSchema.safeParse({ ...goal, unexpected: true }).success).toBe(false);
    expect(
      adaptiveGoalCompletionSchema.safeParse({
        checkInId: 'check-in-1',
        userId: goal.userId,
        completedGoalId: goal.id,
        maintenanceGoalId: 'maintenance-goal-1',
        createdAt: 2,
      }).success,
    ).toBe(true);
    expect(adaptiveGoalRevisionSchema.safeParse({ ...revision, sequence: 0 }).success).toBe(false);
    expect(
      adaptiveGoalSnapshotSchema.safeParse({
        id: goal.id,
        revisionId: revision.id,
        type: goal.type,
        targetWeightKg: 75,
        maintenanceCenterKg: null,
        goalRatePctPerWeek: -0.5,
      }).success,
    ).toBe(true);
    expect(
      adaptiveGoalHistorySummarySchema.safeParse({
        goal,
        latestRevision: revision,
        finalTrendWeightKg: null,
        netChangeKg: null,
        durationDays: null,
      }).success,
    ).toBe(true);
    expect(
      adaptiveGoalDetailSchema.safeParse({
        goal,
        revisions: [revision],
        acceptedCheckIns: [],
        trendPoints: [
          {
            kind: 'weight_change',
            date: '2026-06-01',
            trendWeightKg: 82,
            scaleWeightKg: 82.2,
            goalRevisionId: revision.id,
            revisionSequence: 1,
            targetWeightKg: 75,
            completedDistanceKg: 0,
            remainingDistanceKg: 7,
            percentComplete: 0,
          },
        ],
        completion: null,
      }).success,
    ).toBe(true);
    expect(
      adaptiveGoalProgressSchema.safeParse({
        kind: 'weight_change',
        goalId: goal.id,
        goalRevisionId: revision.id,
        revisionSequence: 1,
        startedLocalDate: '2026-06-01',
        currentLocalDate: '2026-06-21',
        currentTrendWeightKg: 80,
        latestScaleWeightKg: 79.8,
        actualRateKgPerWeek: -0.4,
        trendFreshness: 'fresh',
        confidence: 'High',
        provenance: 'valid_trend',
        type: 'lose',
        startTrendWeightKg: 82,
        targetWeightKg: 75,
        totalDistanceKg: 7,
        completedDistanceKg: 2,
        remainingDistanceKg: 5,
        percentComplete: 200 / 7,
        desiredRatePctPerWeek: -0.5,
        desiredRateKgPerWeek: -0.4,
        trajectory: 'toward_goal',
        status: 'on_track',
        desiredProjection: {
          basis: 'desired',
          weeks: 12.5,
          projectedStartDate: '2026-09-08',
          projectedEndDate: '2026-09-24',
          unavailableReason: null,
        },
        actualProjection: {
          basis: 'actual',
          weeks: null,
          projectedStartDate: null,
          projectedEndDate: null,
          unavailableReason: 'LOW_CONFIDENCE',
        },
      }).success,
    ).toBe(true);
    const progress = adaptiveGoalProgressSchema.parse({
      kind: 'maintenance',
      goalId: goal.id,
      goalRevisionId: revision.id,
      revisionSequence: 1,
      startedLocalDate: '2026-06-01',
      currentLocalDate: '2026-06-21',
      currentTrendWeightKg: 80,
      latestScaleWeightKg: 79.8,
      actualRateKgPerWeek: 0,
      trendFreshness: 'fresh',
      confidence: 'High',
      provenance: 'valid_trend',
      type: 'maintain',
      centerWeightKg: 80,
      signedDistanceFromCenterKg: 0,
      rangeRadiusKg: 0.8,
      rangeLowerKg: 79.2,
      rangeUpperKg: 80.8,
      rangeStatus: 'within',
      daysWithinRange: 10,
      observedDays: 12,
      trendDirection: 'flat',
    });
    expect(progress).not.toHaveProperty('percentComplete');
    expect(
      adaptiveCurrentGoalSchema.safeParse({
        goal,
        latestRevision: revision,
        progress: adaptiveGoalProgressSchema.parse({
          ...progress,
          kind: 'maintenance',
          type: 'maintain',
        }),
        pendingGoalChange: null,
        allowedActions: { edit: false, startNew: false, cancel: false, complete: false },
      }).success,
    ).toBe(true);
    expect(adaptiveGoalProjectionSchema.safeParse({ basis: 'actual', weeks: null }).success).toBe(
      false,
    );
    expect(
      adaptiveGoalEditInputSchema.parse({
        type: 'lose',
        targetWeightKg: 74,
        maintenanceCenterKg: null,
        goalRatePctPerWeek: -0.4,
      }),
    ).toMatchObject({ supersedePendingRecommendation: false });
    expect(
      adaptiveGoalStartInputSchema.safeParse({
        type: 'maintain',
        targetWeightKg: null,
        maintenanceCenterKg: 80,
        goalRatePctPerWeek: 0,
        unknown: true,
      }).success,
    ).toBe(false);
    expect(adaptiveGoalLifecycleInputSchema.parse({})).toEqual({});
    expect(adaptiveGoalCompleteInputSchema.parse({ checkInId: 'check-in-1' })).toEqual({
      checkInId: 'check-in-1',
    });
  });

  it('preserves version-one snapshots and requires goal linkage in version two', () => {
    const snapshotFields = {
      constants: ADAPTIVE_TDEE_CONSTANTS,
      program: validProgram,
      priorTdee: null,
      currentTarget: null,
      boundaries: {
        previewDate: '2026-06-01',
        analysisStart: '2026-05-11',
        analysisEnd: '2026-05-31',
        warmupStart: '2026-04-20',
      },
      includeToday: false,
      nutritionDays: [],
      weightEntries: [{ id: 'weight-1', date: '2026-05-31', weightKg: 82, updatedAt: 1 }],
    };
    expect(
      adaptiveCheckInInputSnapshotSchema.safeParse({ version: 1, ...snapshotFields }).success,
    ).toBe(true);
    expect(
      adaptiveCheckInInputSnapshotSchema.safeParse({
        version: 2,
        ...snapshotFields,
        goal: {
          id: 'goal-1',
          revisionId: 'revision-1',
          type: 'lose',
          targetWeightKg: 75,
          maintenanceCenterKg: null,
          goalRatePctPerWeek: -0.5,
        },
      }).success,
    ).toBe(true);
    expect(
      adaptiveCheckInInputSnapshotSchema.safeParse({ version: 2, ...snapshotFields }).success,
    ).toBe(false);
    expect(
      adaptiveCheckInInputSnapshotSchema.safeParse({
        version: 1,
        ...snapshotFields,
        unexpected: true,
      }).success,
    ).toBe(false);
  });
});
