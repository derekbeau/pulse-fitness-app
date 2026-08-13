import { describe, expect, it } from 'vitest';

import type {
  AdaptiveNutritionDay,
  AdaptiveProgramCalculation,
  AdaptiveWeightEntry,
} from '../schemas/adaptive-nutrition.js';
import { adaptiveRecommendationSchema } from '../schemas/adaptive-nutrition.js';
import {
  ADAPTIVE_ACTIVITY_MULTIPLIERS,
  ADAPTIVE_TDEE_CONSTANTS,
  AdaptiveTdeeConfigurationError,
  addCalendarDays,
  allocateMacros,
  buildAdaptiveRecommendation,
  calculateAdaptiveDateBoundaries,
  calculateAdaptiveTdee,
  calculateAgeOnDate,
  calculateBaselineTdee,
  calculateConfidence,
  calculateEwma,
  calculateGoalCalories,
  calculateMifflinRmr,
  calculateObservedTdee,
  calculateRegressionSlope,
  calculateSystemCalorieFloor,
  canonicalizeAdaptiveFingerprintInput,
  createAdaptiveInputFingerprint,
  detectSuspectWeightEntries,
  evaluateEligibility,
  interpolateDailyWeights,
  sha256Hex,
} from './adaptive-tdee.js';
import { convertWeightFromKg, convertWeightToKg } from './weight-unit.js';

const LOCAL_DATE = '2026-06-22';
const BOUNDARIES = calculateAdaptiveDateBoundaries(LOCAL_DATE, false);

const maintainProgram: AdaptiveProgramCalculation = {
  status: 'active',
  timeZone: 'America/Detroit',
  rmrEquation: 'manual_tdee',
  heightCm: null,
  birthDate: null,
  activityLevel: null,
  activityMultiplier: null,
  estimatedRmrKcal: null,
  calculatedBaselineTdeeKcal: null,
  manualBaselineTdeeKcal: 2500,
  baselineTdeeKcal: 2500,
  goalType: 'maintain',
  targetWeightKg: null,
  goalRatePctPerWeek: 0,
  proteinGrams: 180,
  fatAllocationPct: 30,
  systemCalorieFloorKcal: 1500,
  userCalorieFloorKcal: 1500,
  algorithmVersion: 'adaptive-tdee-v1',
};

function makeNutritionDays(
  count = 21,
  calories = 2500,
  start = BOUNDARIES.analysisStart,
): AdaptiveNutritionDay[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `nutrition-${String(index).padStart(2, '0')}`,
    date: addCalendarDays(start, index),
    status: 'complete',
    calories,
    itemCount: 3,
    updatedAt: 1_000 + index,
  }));
}

function makeDailyWeights(
  start = BOUNDARIES.warmupStart,
  end = BOUNDARIES.analysisEnd,
  initialWeightKg = 82,
  dailyChangeKg = 0,
): AdaptiveWeightEntry[] {
  const days = Math.max(
    0,
    Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000),
  );
  return Array.from({ length: days + 1 }, (_, index) => ({
    id: `weight-${String(index).padStart(2, '0')}`,
    date: addCalendarDays(start, index),
    weightKg: initialWeightKg + dailyChangeKg * index,
    updatedAt: 2_000 + index,
  }));
}

function buildInput(overrides: Partial<Parameters<typeof buildAdaptiveRecommendation>[0]> = {}) {
  return {
    localDate: LOCAL_DATE,
    includeToday: false,
    kind: 'weekly' as const,
    program: maintainProgram,
    nutritionDays: makeNutritionDays(),
    weightEntries: makeDailyWeights(),
    priorTdee: { checkInId: 'prior-check-in', tdeeKcal: 2500 },
    currentTarget: null,
    ...overrides,
  };
}

describe('canonical units, dates, and baseline energy', () => {
  it('round-trips pounds and kilograms with the exact conversion constant', () => {
    expect(convertWeightToKg(1, 'lbs')).toBe(0.45359237);
    expect(convertWeightFromKg(0.45359237, 'lbs')).toBe(1);
    for (const weightKg of [25, 50.12345678, 82, 175, 350]) {
      expect(convertWeightToKg(convertWeightFromKg(weightKg, 'lbs'), 'lbs')).toBeCloseTo(
        weightKg,
        10,
      );
    }
  });

  it('calculates integer age on explicit dates, including leap-day birthdays', () => {
    expect(calculateAgeOnDate('1990-06-22', '2026-06-21')).toBe(35);
    expect(calculateAgeOnDate('1990-06-22', '2026-06-22')).toBe(36);
    expect(calculateAgeOnDate('2000-02-29', '2025-02-28')).toBe(24);
    expect(calculateAgeOnDate('2000-02-29', '2025-03-01')).toBe(25);
  });

  it('uses explicit local-date boundaries and excludes today by default', () => {
    expect(BOUNDARIES).toEqual({
      previewDate: '2026-06-22',
      analysisStart: '2026-06-01',
      analysisEnd: '2026-06-21',
      warmupStart: '2026-05-11',
    });
    expect(calculateAdaptiveDateBoundaries(LOCAL_DATE, true)).toEqual({
      previewDate: '2026-06-22',
      analysisStart: '2026-06-02',
      analysisEnd: '2026-06-22',
      warmupStart: '2026-05-12',
    });
  });

  it('implements both Mifflin-St Jeor equations and every activity multiplier', () => {
    expect(
      calculateMifflinRmr({
        equation: 'mifflin_male',
        weightKg: 80,
        heightCm: 180,
        ageYears: 40,
      }),
    ).toBe(1730);
    expect(
      calculateMifflinRmr({
        equation: 'mifflin_female',
        weightKg: 80,
        heightCm: 180,
        ageYears: 40,
      }),
    ).toBe(1564);
    expect(ADAPTIVE_ACTIVITY_MULTIPLIERS).toEqual({
      sedentary: 1.2,
      low_active: 1.375,
      active: 1.55,
      very_active: 1.725,
    });
  });

  it('rounds calculated and manual baselines as specified', () => {
    expect(
      calculateBaselineTdee({
        equation: 'mifflin_male',
        weightKg: 80,
        heightCm: 180,
        birthDate: '1986-06-21',
        activityLevel: 'active',
        manualBaselineTdeeKcal: null,
        calculationDate: '2026-06-21',
      }),
    ).toEqual({
      estimatedRmrKcal: 1730,
      activityMultiplier: 1.55,
      calculatedBaselineTdeeKcal: 2681.5,
      baselineTdeeKcal: 2682,
    });
    expect(
      calculateBaselineTdee({
        equation: 'manual_tdee',
        weightKg: 80,
        heightCm: null,
        birthDate: null,
        activityLevel: null,
        manualBaselineTdeeKcal: 2345.6,
        calculationDate: '2026-06-21',
      }),
    ).toEqual({
      estimatedRmrKcal: null,
      activityMultiplier: null,
      calculatedBaselineTdeeKcal: null,
      baselineTdeeKcal: 2346,
    });
    expect(calculateSystemCalorieFloor(2500)).toBe(1500);
    expect(calculateSystemCalorieFloor(1800)).toBe(1200);
    expect(
      calculateBaselineTdee({
        equation: 'mifflin_male',
        weightKg: 80,
        heightCm: 180,
        birthDate: '1986-06-21',
        activityLevel: 'active',
        manualBaselineTdeeKcal: 2400,
        calculationDate: '2026-06-21',
      }).baselineTdeeKcal,
    ).toBe(2400);
    expect(() =>
      calculateBaselineTdee({
        equation: 'manual_tdee',
        weightKg: 80,
        heightCm: null,
        birthDate: null,
        activityLevel: null,
        manualBaselineTdeeKcal: 799,
        calculationDate: '2026-06-21',
      }),
    ).toThrow(AdaptiveTdeeConfigurationError);
  });
});

describe('weight trend and observed expenditure', () => {
  it('linearly interpolates missing dates without extrapolation', () => {
    expect(
      interpolateDailyWeights([
        { id: 'later', date: '2026-06-04', weightKg: 79, updatedAt: 2 },
        { id: 'earlier', date: '2026-06-01', weightKg: 82, updatedAt: 1 },
      ]),
    ).toEqual([
      {
        date: '2026-06-01',
        weightKg: 82,
        sourceEntryId: 'earlier',
        interpolated: false,
      },
      { date: '2026-06-02', weightKg: 81, sourceEntryId: null, interpolated: true },
      { date: '2026-06-03', weightKg: 80, sourceEntryId: null, interpolated: true },
      {
        date: '2026-06-04',
        weightKg: 79,
        sourceEntryId: 'later',
        interpolated: false,
      },
    ]);
  });

  it('uses a seven-day half-life EWMA seeded from the first value', () => {
    const alpha = 1 - Math.exp(Math.log(0.5) / 7);
    expect(alpha).toBeCloseTo(0.0942763357, 10);
    const result = calculateEwma([80, 81, 82]);
    expect(result[0]).toBe(80);
    expect(result[1]).toBeCloseTo(80 + alpha, 12);
    expect(result[2]).toBeCloseTo(alpha * 82 + (1 - alpha) * (result[1] ?? 0), 12);
  });

  it('calculates OLS slopes for flat, rising, and falling trends', () => {
    expect(calculateRegressionSlope([80, 80, 80, 80])).toBe(0);
    expect(calculateRegressionSlope([80, 80.2, 80.4, 80.6])).toBeCloseTo(0.2, 12);
    expect(calculateRegressionSlope([80, 79.8, 79.6, 79.4])).toBeCloseTo(-0.2, 12);
  });

  it('uses the correct energy-balance sign and canonical loss vector', () => {
    expect(calculateObservedTdee(2500, 0)).toBe(2500);
    expect(calculateObservedTdee(2500, 0.01)).toBe(2423);
    expect(calculateObservedTdee(2500, -0.01)).toBe(2577);
    expect(calculateObservedTdee(2500, -0.01292077922077922)).toBeCloseTo(2599.49, 2);
  });

  it('never increases observed TDEE when the weight slope becomes more positive', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (const slope of [-0.05, -0.025, 0, 0.025, 0.05]) {
      const observed = calculateObservedTdee(2500, slope);
      expect(observed).toBeLessThanOrEqual(previous);
      previous = observed;
    }
  });
});

describe('eligibility, confidence, and holds', () => {
  it('accepts all exact eligibility boundaries', () => {
    const weightEntries = [
      { id: 'w1', date: '2026-05-31', weightKg: 82, updatedAt: 1 },
      { id: 'w2', date: '2026-06-07', weightKg: 82, updatedAt: 2 },
      { id: 'w3', date: '2026-06-14', weightKg: 82, updatedAt: 3 },
    ];
    const result = evaluateEligibility({
      boundaries: BOUNDARIES,
      nutritionDays: makeNutritionDays(12),
      weightEntries,
    });
    expect(result.eligible).toBe(true);
    expect(result.usableNutritionDays).toHaveLength(12);
    expect(result.actualWeights).toHaveLength(3);
    expect(result.actualWeightSpanDays).toBe(14);
    expect(result.latestWeightAgeDays).toBe(7);
    expect(result.trendPoints).toHaveLength(14);
  });

  it('holds with only eleven complete nutrition days (vector E)', () => {
    const result = buildAdaptiveRecommendation(
      buildInput({ nutritionDays: makeNutritionDays(11) }),
    );
    expect(result.state).toBe('holding');
    expect(result.reasonCodes).toContain('INSUFFICIENT_NUTRITION');
    expect(result.adaptiveUpdate).toBeNull();
  });

  it('counts unique complete dates and deterministically uses the latest row per date', () => {
    const oneDateRepeated = makeNutritionDays(12).map((day, index) => ({
      ...day,
      id: `duplicate-${index}`,
      date: BOUNDARIES.analysisStart,
      updatedAt: index,
    }));
    const repeatedResult = evaluateEligibility({
      boundaries: BOUNDARIES,
      nutritionDays: oneDateRepeated,
      weightEntries: makeDailyWeights(),
    });
    expect(repeatedResult.usableNutritionDays).toHaveLength(1);
    expect(repeatedResult.holdReasons).toContain('INSUFFICIENT_NUTRITION');

    const completeDates = makeNutritionDays(12, 2400);
    const firstCompleteDate = completeDates[0];
    if (!firstCompleteDate) throw new Error('Expected a complete nutrition fixture day');
    const staleDuplicate = {
      ...firstCompleteDate,
      id: 'stale-duplicate',
      calories: 9000,
      updatedAt: 0,
    };
    const latestResult = evaluateEligibility({
      boundaries: BOUNDARIES,
      nutritionDays: [staleDuplicate, ...completeDates].reverse(),
      weightEntries: makeDailyWeights(),
    });
    expect(latestResult.usableNutritionDays).toHaveLength(12);
    expect(latestResult.averageDailyIntakeKcal).toBe(2400);
    expect(
      evaluateEligibility({
        boundaries: BOUNDARIES,
        nutritionDays: [...completeDates, staleDuplicate],
        weightEntries: makeDailyWeights(),
      }),
    ).toEqual(latestResult);
  });

  it('excludes partial days entirely from the intake average (vector F)', () => {
    const nutritionDays = [
      ...makeNutritionDays(12, 2400),
      {
        id: 'partial',
        date: addCalendarDays(BOUNDARIES.analysisStart, 12),
        status: 'partial' as const,
        calories: 500,
        itemCount: 1,
        updatedAt: 9_999,
      },
    ];
    const result = buildAdaptiveRecommendation(buildInput({ nutritionDays }));
    expect(result.state).toBe('updating');
    expect(result.completeNutritionDays).toBe(12);
    expect(result.averageDailyIntakeKcal).toBe(2400);
    expect(result.reasonCodes).toContain('EXCLUDED_INCOMPLETE_DAYS');
    expect(result.excludedNutritionDates).toEqual([addCalendarDays(BOUNDARIES.analysisStart, 12)]);

    const changedExcludedCalories = structuredClone(nutritionDays);
    const partialDay = changedExcludedCalories.find((day) => day.status === 'partial');
    if (!partialDay) throw new Error('Expected a partial nutrition fixture day');
    partialDay.calories = 7000;
    expect(
      buildAdaptiveRecommendation(buildInput({ nutritionDays: changedExcludedCalories })),
    ).toEqual(result);
  });

  it('holds when the latest weight is eight days old (vector G)', () => {
    const result = buildAdaptiveRecommendation(
      buildInput({
        weightEntries: makeDailyWeights(
          BOUNDARIES.warmupStart,
          addCalendarDays(BOUNDARIES.analysisEnd, -8),
        ),
      }),
    );
    expect(result.state).toBe('holding');
    expect(result.reasonCodes).toContain('STALE_WEIGHT');
    expect(result.adaptiveUpdate).toBeNull();
  });

  it('flags a water-weight spike and refuses an update (vector H)', () => {
    const weightEntries = makeDailyWeights();
    const spike = weightEntries.find((entry) => entry.date === '2026-06-10');
    if (!spike) throw new Error('Expected the spike fixture date');
    spike.weightKg = 87;
    expect(detectSuspectWeightEntries(weightEntries)).toContain(spike.id);
    const result = buildAdaptiveRecommendation(buildInput({ weightEntries }));
    expect(result.state).toBe('holding');
    expect(result.reasonCodes).toContain('SUSPECT_WEIGHT_DATA');
    expect(result.suspectWeightEntryIds).toContain(spike.id);
    expect(result.suspectWeightEntries).toContainEqual({ id: spike.id, date: spike.date });
  });

  it('holds for insufficient actual count, span, trend, and non-overlap boundaries', () => {
    const onlyTwo = evaluateEligibility({
      boundaries: BOUNDARIES,
      nutritionDays: makeNutritionDays(),
      weightEntries: [
        { id: 'a', date: '2026-06-01', weightKg: 82, updatedAt: 1 },
        { id: 'b', date: '2026-06-21', weightKg: 82, updatedAt: 2 },
      ],
    });
    expect(onlyTwo.holdReasons).toContain('INSUFFICIENT_WEIGHT');

    const shortSpan = evaluateEligibility({
      boundaries: BOUNDARIES,
      nutritionDays: makeNutritionDays(),
      weightEntries: [
        { id: 'a', date: '2026-06-01', weightKg: 82, updatedAt: 1 },
        { id: 'b', date: '2026-06-07', weightKg: 82, updatedAt: 2 },
        { id: 'c', date: '2026-06-14', weightKg: 82, updatedAt: 3 },
      ],
    });
    expect(shortSpan.holdReasons).toContain('INSUFFICIENT_WEIGHT_SPAN');

    const noOverlap = evaluateEligibility({
      boundaries: BOUNDARIES,
      nutritionDays: makeNutritionDays(),
      weightEntries: makeDailyWeights('2026-05-11', '2026-05-25'),
    });
    expect(noOverlap.holdReasons).toContain('NO_OVERLAPPING_DATA');
    expect(noOverlap.holdReasons).toContain('INSUFFICIENT_TREND_POINTS');
  });

  it('calculates weighted confidence and exact label boundaries', () => {
    expect(
      calculateConfidence({
        completeNutritionDays: 21,
        actualWeightCount: 7,
        weightSpanDays: 21,
        latestWeightAgeDays: 0,
      }),
    ).toMatchObject({ score: 1, label: 'High' });
    expect(
      calculateConfidence({
        completeNutritionDays: 21,
        actualWeightCount: 0,
        weightSpanDays: 7,
        latestWeightAgeDays: 7,
      }).label,
    ).toBe('Moderate');
    expect(
      calculateConfidence({
        completeNutritionDays: 21,
        actualWeightCount: 7,
        weightSpanDays: 7,
        latestWeightAgeDays: 7,
      }).label,
    ).toBe('High');
    expect(
      calculateConfidence({
        completeNutritionDays: 11,
        actualWeightCount: 3,
        weightSpanDays: 14,
        latestWeightAgeDays: 7,
      }).label,
    ).toBe('Developing');
  });

  it('holds implausible manual-mode expenditure and includes today only on request', () => {
    const implausible = buildAdaptiveRecommendation(
      buildInput({ nutritionDays: makeNutritionDays(21, 700) }),
    );
    expect(implausible.reasonCodes).toContain('IMPLAUSIBLE_EXPENDITURE');
    expect(implausible.adaptiveUpdate).toBeNull();

    const equationProgram: AdaptiveProgramCalculation = {
      ...maintainProgram,
      rmrEquation: 'mifflin_male',
      heightCm: 180,
      birthDate: '1986-06-21',
      activityLevel: 'active',
      activityMultiplier: 1.55,
      estimatedRmrKcal: 1730,
      calculatedBaselineTdeeKcal: 2681.5,
      manualBaselineTdeeKcal: null,
      baselineTdeeKcal: 2682,
      systemCalorieFloorKcal: 1610,
      userCalorieFloorKcal: 1610,
    };
    const equationImplausible = buildAdaptiveRecommendation(
      buildInput({
        program: equationProgram,
        nutritionDays: makeNutritionDays(21, 1000),
      }),
    );
    expect(equationImplausible.reasonCodes).toContain('IMPLAUSIBLE_EXPENDITURE');
    expect(equationImplausible.observedTdeeKcal).toBe(1000);

    const included = buildAdaptiveRecommendation(
      buildInput({
        kind: 'manual',
        includeToday: true,
        nutritionDays: makeNutritionDays(21, 2500, '2026-06-02'),
        weightEntries: makeDailyWeights('2026-05-12', '2026-06-22'),
      }),
    );
    expect(included.reasonCodes).toContain('TODAY_INCLUDED');
    expect(() =>
      buildAdaptiveRecommendation(
        buildInput({
          includeToday: true,
          nutritionDays: makeNutritionDays(21, 2500, '2026-06-02'),
          weightEntries: makeDailyWeights('2026-05-12', '2026-06-22'),
        }),
      ),
    ).toThrowError(/Weekly check-ins cannot include/);
  });

  it('returns learning with the baseline when there is no prior or current weight', () => {
    const result = buildAdaptiveRecommendation(buildInput({ priorTdee: null, weightEntries: [] }));
    expect(result.state).toBe('learning');
    expect(result.priorTdeeKcal).toBe(maintainProgram.baselineTdeeKcal);
    expect(result.reasonCodes).toContain('NO_CURRENT_WEIGHT');
    expect(result.adaptiveUpdate).toBeNull();
  });
});

describe('adaptive update, goal calories, and macro allocation', () => {
  it('produces the canonical maintenance vector A', () => {
    const result = buildAdaptiveRecommendation(buildInput());
    expect(result.state).toBe('updating');
    expect(result.weightTrendKgPerDay).toBeCloseTo(0, 12);
    expect(result.observedTdeeKcal).toBeCloseTo(2500, 10);
    expect(result.confidence).toMatchObject({ score: 1, label: 'High' });
    expect(result.adaptiveUpdate).toMatchObject({ proposedTdeeKcal: 2500 });
    expect(result.goal).toMatchObject({ goalCalories: 2500, achievableGoalRatePctPerWeek: 0 });
    if (result.macros === null) throw new Error('Expected maintenance macros');
    expect(Math.abs(result.macros.calorieDifference)).toBeLessThanOrEqual(2);
    expect(adaptiveRecommendationSchema.parse(result)).toEqual(result);
  });

  it('produces the canonical loss vector B', () => {
    const slopeKgPerDay = -0.226796185 / 7;
    const observedTdeeKcal = calculateObservedTdee(2350, slopeKgPerDay);
    expect(observedTdeeKcal).toBeCloseTo(2599.49, 1);
    const adaptive = calculateAdaptiveTdee({
      priorTdeeKcal: 2500,
      observedTdeeKcal,
      confidence: 1,
    });
    expect(adaptive.requestedChangeKcal).toBeCloseTo(34.82, 2);
    expect(adaptive.proposedTdeeKcal).toBe(2530);
    const goal = calculateGoalCalories({
      goalType: 'lose',
      goalRatePctPerWeek: -0.5,
      targetWeightKg: 75,
      latestTrendWeightKg: 81.74,
      adaptiveTdeeKcal: adaptive.proposedTdeeKcal,
      systemCalorieFloorKcal: 1500,
      userCalorieFloorKcal: 1500,
    });
    expect(goal.rawGoalCalories).toBeCloseTo(2080.43, 2);
    expect(goal.goalCalories).toBe(2080);
  });

  it('produces gain vector C and enforces the TDEE limiter in vector D', () => {
    expect(calculateObservedTdee(3000, 0.25 / 7)).toBe(2725);
    const gainAdaptive = calculateAdaptiveTdee({
      priorTdeeKcal: 2600,
      observedTdeeKcal: 2725,
      confidence: 1,
    });
    expect(gainAdaptive.requestedChangeKcal).toBeCloseTo(43.75, 10);
    expect(gainAdaptive.proposedTdeeKcal).toBe(2640);
    const gainGoal = calculateGoalCalories({
      goalType: 'gain',
      goalRatePctPerWeek: 0.25,
      targetWeightKg: 90,
      latestTrendWeightKg: 82,
      adaptiveTdeeKcal: gainAdaptive.proposedTdeeKcal,
      systemCalorieFloorKcal: 1500,
      userCalorieFloorKcal: 1500,
    });
    expect(gainGoal.goalCalories).toBeGreaterThanOrEqual(gainAdaptive.proposedTdeeKcal);

    const capped = calculateAdaptiveTdee({
      priorTdeeKcal: 2200,
      observedTdeeKcal: 3200,
      confidence: 1,
    });
    expect(capped.requestedChangeKcal).toBe(350);
    expect(capped.limitedChangeKcal).toBe(150);
    expect(capped.proposedTdeeKcal).toBe(2350);
    expect(capped.reasonCodes).toEqual(['TDEE_CHANGE_LIMIT_APPLIED']);
  });

  it('never moves persisted adaptive TDEE by more than 150 kcal', () => {
    for (const priorTdeeKcal of [1801, 2000, 2206, 3000]) {
      for (const observedTdeeKcal of [800, 1200, 2500, 5000, 8000]) {
        const result = calculateAdaptiveTdee({
          priorTdeeKcal,
          observedTdeeKcal,
          confidence: 1,
        });
        expect(Math.abs(result.proposedTdeeKcal - priorTdeeKcal)).toBeLessThanOrEqual(150);
      }
    }
  });

  it('applies the 25% deficit limit and upward constrained rounding', () => {
    const deficitLimited = calculateGoalCalories({
      goalType: 'lose',
      goalRatePctPerWeek: -1,
      targetWeightKg: 60,
      latestTrendWeightKg: 100,
      adaptiveTdeeKcal: 2400,
      systemCalorieFloorKcal: 1200,
      userCalorieFloorKcal: 1200,
    });
    expect(deficitLimited.goalCalories).toBe(1800);
    expect(deficitLimited.reasonCodes).toContain('DEFICIT_LIMIT_APPLIED');

    const floorLimited = calculateGoalCalories({
      goalType: 'lose',
      goalRatePctPerWeek: -1,
      targetWeightKg: 60,
      latestTrendWeightKg: 100,
      adaptiveTdeeKcal: 2400,
      systemCalorieFloorKcal: 1801,
      userCalorieFloorKcal: 1801,
    });
    expect(floorLimited.goalCalories).toBe(1810);
    expect(floorLimited.reasonCodes).toContain('CALORIE_FLOOR_APPLIED');
    expect(floorLimited.achievableGoalRatePctPerWeek).toBeCloseTo(-0.53636, 4);
    for (let floor = 1801; floor <= 1809; floor += 1) {
      expect(
        calculateGoalCalories({
          goalType: 'lose',
          goalRatePctPerWeek: -1,
          targetWeightKg: 60,
          latestTrendWeightKg: 100,
          adaptiveTdeeKcal: 2400,
          systemCalorieFloorKcal: floor,
          userCalorieFloorKcal: floor,
        }).goalCalories,
      ).toBe(1810);
    }
  });

  it('does not silently discard an explicit calorie floor above adaptive TDEE', () => {
    const floorLimited = calculateGoalCalories({
      goalType: 'lose',
      goalRatePctPerWeek: -0.5,
      targetWeightKg: 70,
      latestTrendWeightKg: 80,
      adaptiveTdeeKcal: 1800,
      systemCalorieFloorKcal: 2000,
      userCalorieFloorKcal: 2000,
    });
    expect(floorLimited.goalCalories).toBe(2000);
    expect(floorLimited.goalCalories).toBeGreaterThanOrEqual(2000);
    expect(floorLimited.reasonCodes).toContain('CALORIE_FLOOR_APPLIED');
  });

  it('switches to maintenance within goal-completion tolerance', () => {
    const goal = calculateGoalCalories({
      goalType: 'lose',
      goalRatePctPerWeek: -0.5,
      targetWeightKg: 75,
      latestTrendWeightKg: 75.2,
      adaptiveTdeeKcal: 2300,
      systemCalorieFloorKcal: 1400,
      userCalorieFloorKcal: 1400,
    });
    expect(goal.goalReached).toBe(true);
    expect(goal.goalCalories).toBe(2300);
    expect(goal.reasonCodes).toEqual(['GOAL_REACHED']);

    const crossedGoal = buildAdaptiveRecommendation(
      buildInput({
        program: {
          ...maintainProgram,
          goalType: 'lose',
          targetWeightKg: 75,
          goalRatePctPerWeek: -0.5,
        },
        weightEntries: makeDailyWeights(BOUNDARIES.warmupStart, BOUNDARIES.analysisEnd, 74.9),
      }),
    );
    expect(crossedGoal.state).toBe('updating');
    expect(crossedGoal.goal).toMatchObject({ goalReached: true, goalCalories: 2500 });
    expect(crossedGoal.reasonCodes).toContain('GOAL_REACHED');

    const gainGoal = calculateGoalCalories({
      goalType: 'gain',
      goalRatePctPerWeek: 0.25,
      targetWeightKg: 90,
      latestTrendWeightKg: 89.8,
      adaptiveTdeeKcal: 2300,
      systemCalorieFloorKcal: 1400,
      userCalorieFloorKcal: 1400,
    });
    expect(gainGoal).toMatchObject({ goalReached: true, goalCalories: 2300 });
  });

  it('keeps loss at or below adaptive and gain at or above adaptive', () => {
    for (const rate of [-1, -0.5, -0.1]) {
      const loss = calculateGoalCalories({
        goalType: 'lose',
        goalRatePctPerWeek: rate,
        targetWeightKg: 60,
        latestTrendWeightKg: 82,
        adaptiveTdeeKcal: 2500,
        systemCalorieFloorKcal: 1500,
        userCalorieFloorKcal: 1500,
      });
      expect(loss.goalCalories).toBeLessThanOrEqual(2500);
    }
    for (const rate of [0.1, 0.25, 0.5]) {
      const gain = calculateGoalCalories({
        goalType: 'gain',
        goalRatePctPerWeek: rate,
        targetWeightKg: 90,
        latestTrendWeightKg: 82,
        adaptiveTdeeKcal: 2500,
        systemCalorieFloorKcal: 1500,
        userCalorieFloorKcal: 1500,
      });
      expect(gain.goalCalories).toBeGreaterThanOrEqual(2500);
    }
  });

  it('allocates macros within two calories and rejects infeasible settings', () => {
    for (const goalCalories of [1200, 1801, 2080, 2500, 3333]) {
      const macros = allocateMacros({ goalCalories, proteinGrams: 180, fatAllocationPct: 30 });
      expect(macros.fat % 5).toBe(0);
      expect(Number.isInteger(macros.carbs)).toBe(true);
      expect(Math.abs(macros.calorieDifference)).toBeLessThanOrEqual(2);
    }
    expect(() =>
      allocateMacros({ goalCalories: 1200, proteinGrams: 400, fatAllocationPct: 40 }),
    ).toThrowError(
      expect.objectContaining<Partial<AdaptiveTdeeConfigurationError>>({
        code: 'MACRO_CONFIGURATION_INFEASIBLE',
      }),
    );
  });

  it('reports macro calorie difference as goal calories minus macro calories', () => {
    const macros = allocateMacros({ goalCalories: 2000, proteinGrams: 150, fatAllocationPct: 30 });
    expect(macros.macroCalories).toBe(2001);
    expect(macros.calorieDifference).toBe(-1);
    expect(macros.calorieDifference).toBe(macros.calories - macros.macroCalories);
  });
});

describe('deterministic fingerprint and recommendation output', () => {
  it('implements SHA-256 without a runtime-specific crypto dependency', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('Pulse 💪')).toHaveLength(64);
  });

  it('sorts object keys and source arrays and rounds canonical kg to eight decimals', () => {
    const input = buildInput();
    const boundaries = calculateAdaptiveDateBoundaries(input.localDate, input.includeToday);
    const fingerprintInput = {
      constants: ADAPTIVE_TDEE_CONSTANTS,
      program: input.program,
      priorTdee: input.priorTdee,
      currentTarget: input.currentTarget,
      boundaries,
      includeToday: input.includeToday,
      nutritionDays: input.nutritionDays,
      weightEntries: input.weightEntries,
    };
    const reversed = {
      ...fingerprintInput,
      nutritionDays: [...fingerprintInput.nutritionDays].reverse(),
      weightEntries: [...fingerprintInput.weightEntries].reverse(),
    };
    expect(createAdaptiveInputFingerprint(reversed)).toBe(
      createAdaptiveInputFingerprint(fingerprintInput),
    );
    expect(canonicalizeAdaptiveFingerprintInput(fingerprintInput)).toContain('82');
    expect(createAdaptiveInputFingerprint(fingerprintInput)).toMatch(/^[a-f0-9]{64}$/);

    const belowPrecision = structuredClone(fingerprintInput);
    const sameRoundedWeight = structuredClone(fingerprintInput);
    const changedRoundedWeight = structuredClone(fingerprintInput);
    const belowEntry = belowPrecision.weightEntries[0];
    const sameEntry = sameRoundedWeight.weightEntries[0];
    const changedEntry = changedRoundedWeight.weightEntries[0];
    if (!belowEntry || !sameEntry || !changedEntry) throw new Error('Expected weight fixtures');
    belowEntry.weightKg = 82.123456781;
    sameEntry.weightKg = 82.123456784;
    changedEntry.weightKg = 82.123456795;
    expect(createAdaptiveInputFingerprint(sameRoundedWeight)).toBe(
      createAdaptiveInputFingerprint(belowPrecision),
    );
    expect(createAdaptiveInputFingerprint(changedRoundedWeight)).not.toBe(
      createAdaptiveInputFingerprint(belowPrecision),
    );
  });

  it('returns identical fingerprints and outputs for identical data in any order (vector I)', () => {
    const input = buildInput();
    const reordered = {
      ...input,
      nutritionDays: [...input.nutritionDays].reverse(),
      weightEntries: [...input.weightEntries].reverse(),
    };
    expect(buildAdaptiveRecommendation(reordered)).toEqual(buildAdaptiveRecommendation(input));
  });

  it('ignores source rows outside the specified analysis and warmup boundaries', () => {
    const input = buildInput();
    const withIrrelevantHistory = {
      ...input,
      nutritionDays: [
        ...input.nutritionDays,
        {
          id: 'old-nutrition',
          date: addCalendarDays(BOUNDARIES.analysisStart, -1),
          status: 'complete' as const,
          calories: 999,
          itemCount: 1,
          updatedAt: 88,
        },
      ],
      weightEntries: [
        ...input.weightEntries,
        {
          id: 'old-weight',
          date: addCalendarDays(BOUNDARIES.warmupStart, -1),
          weightKg: 100,
          updatedAt: 99,
        },
      ],
    };
    expect(buildAdaptiveRecommendation(withIrrelevantHistory)).toEqual(
      buildAdaptiveRecommendation(input),
    );
  });

  it('changes the fingerprint after a source correction without mutating inputs (vector J)', () => {
    const original = buildInput();
    const snapshot = structuredClone(original);
    const corrected = structuredClone(original);
    const correctedDay = corrected.nutritionDays[0];
    if (!correctedDay) throw new Error('Expected a correction fixture day');
    correctedDay.calories += 100;
    correctedDay.updatedAt += 1;
    const first = buildAdaptiveRecommendation(original);
    const second = buildAdaptiveRecommendation(corrected);
    expect(second.inputFingerprint).not.toBe(first.inputFingerprint);
    expect(original).toEqual(snapshot);
  });

  it('changes the fingerprint when the current target changes', () => {
    const currentTarget = {
      id: 'target-1',
      calories: 2500,
      protein: 180,
      carbs: 259,
      fat: 85,
      source: 'manual' as const,
      adaptiveCheckInId: null,
      macroCalories: 2501,
      effectiveDate: '2026-06-01',
      updatedAt: 100,
    };
    const original = buildAdaptiveRecommendation(buildInput({ currentTarget }));
    const changed = buildAdaptiveRecommendation(
      buildInput({ currentTarget: { ...currentTarget, calories: 2510, updatedAt: 101 } }),
    );
    expect(changed.inputFingerprint).not.toBe(original.inputFingerprint);
  });

  it('holds a paused program while retaining the prior recommendation', () => {
    const result = buildAdaptiveRecommendation(
      buildInput({ program: { ...maintainProgram, status: 'paused' } }),
    );
    expect(result.state).toBe('holding');
    expect(result.priorTdeeKcal).toBe(2500);
    expect(result.reasonCodes).toContain('PROGRAM_PAUSED');
    expect(result.adaptiveUpdate).toBeNull();
  });
});
