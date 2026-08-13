import { describe, expect, it } from 'vitest';

import {
  adaptiveActivityLevelSchema,
  adaptiveCheckInKindSchema,
  adaptiveCheckInStatusSchema,
  adaptiveCheckInStateSchema,
  adaptiveConfidenceLabelSchema,
  adaptiveGoalTypeSchema,
  adaptiveAcceptInputSchema,
  adaptiveCheckInQuerySchema,
  adaptiveNutritionStateSchema,
  adaptiveProgramCalculationSchema,
  adaptiveProgramMutationSchema,
  adaptiveProgramSetupSchema,
  adaptivePreviewInputSchema,
  adaptiveRecommendationSchema,
  adaptiveReasonCodeSchema,
  adaptiveRmrEquationSchema,
} from './adaptive-nutrition.js';

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
    expect(adaptiveCheckInKindSchema.options).toEqual(['baseline', 'weekly', 'manual']);
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
        program: null,
        currentTarget: null,
        latestAcceptedCheckIn: null,
        pendingCheckIn: null,
        checkInDue: false,
        nextCheckInDate: null,
        eligibility: null,
      }),
    ).toMatchObject({ state: 'setup_required' });
  });
});
