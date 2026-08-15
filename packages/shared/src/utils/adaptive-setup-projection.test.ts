import { describe, expect, it } from 'vitest';

import {
  ADAPTIVE_SETUP_GOAL_RATE_RULES,
  calculateAdaptiveProteinPresets,
  calculateAdaptiveSetupProjection,
  classifyAdaptiveSetupGoalRate,
  convertAdaptiveSetupRateForDisplay,
  getAdaptiveSetupLocalDate,
  matchAdaptiveProteinPreset,
} from './adaptive-setup-projection';
import { convertWeightToKg } from './weight-unit';

const baseInput = {
  baselineTdeeKcal: 2500,
  calculationLocalDate: '2026-03-07',
  currentWeightKg: 80,
  estimatedRmrKcal: 1750,
  fatAllocationPct: 30,
  goalRatePctPerWeek: 0.25,
  goalType: 'gain' as const,
  proteinGrams: 145,
  systemCalorieFloorKcal: 1500,
  targetWeightKg: 84,
  userCalorieFloorKcal: 1500,
};

describe('Adaptive TDEE setup projection', () => {
  it('uses compounded gain math for duration and changing absolute rates', () => {
    const projection = calculateAdaptiveSetupProjection(baseInput);

    expect(projection.timeline?.fractionalWeeks).toBeCloseTo(19.54, 2);
    expect(projection.timeline?.displayWeeks).toBe(20);
    expect(projection.startingWeightChangeKgPerWeek).toBeCloseTo(0.2, 8);
    expect(projection.endingWeightChangeKgPerWeek).toBeCloseTo(0.21, 8);
    expect(projection.timeline?.completionLocalDate).toBe('2026-07-22');
  });

  it('uses compounded loss math and preserves the signed calorie adjustment', () => {
    const projection = calculateAdaptiveSetupProjection({
      ...baseInput,
      goalRatePctPerWeek: -0.5,
      goalType: 'lose',
      targetWeightKg: 72,
    });

    expect(projection.timeline?.fractionalWeeks).toBeCloseTo(21.02, 2);
    expect(projection.timeline?.displayWeeks).toBe(22);
    expect(projection.goal.requestedCalorieAdjustment).toBeLessThan(0);
    expect(projection.startingWeightChangeKgPerWeek).toBeCloseTo(0.4, 8);
    expect(projection.endingWeightChangeKgPerWeek).toBeCloseTo(0.36, 8);
  });

  it('matches the representative 177.2 lb to 185 lb example', () => {
    const projection = calculateAdaptiveSetupProjection({
      ...baseInput,
      currentWeightKg: convertWeightToKg(177.2, 'lbs'),
      goalRatePctPerWeek: 0.35,
      targetWeightKg: convertWeightToKg(185, 'lbs'),
    });

    expect(projection.timeline?.displayWeeks).toBe(13);
    expect(
      convertAdaptiveSetupRateForDisplay(projection.startingWeightChangeKgPerWeek, 'lbs'),
    ).toBe(0.62);
    expect(convertAdaptiveSetupRateForDisplay(projection.endingWeightChangeKgPerWeek, 'lbs')).toBe(
      0.65,
    );
    expect(convertAdaptiveSetupRateForDisplay(projection.approximateMonthlyChangeKg, 'lbs')).toBe(
      2.69,
    );
  });

  it('adds projected dates as local calendar days across daylight-saving changes', () => {
    expect(getAdaptiveSetupLocalDate(new Date('2026-03-08T04:30:00.000Z'), 'America/Detroit')).toBe(
      '2026-03-07',
    );
    expect(getAdaptiveSetupLocalDate(new Date('2026-03-08T05:30:00.000Z'), 'America/Detroit')).toBe(
      '2026-03-08',
    );

    const projection = calculateAdaptiveSetupProjection({
      ...baseInput,
      calculationLocalDate: '2026-03-07',
      currentWeightKg: 80,
      goalRatePctPerWeek: 0.5,
      targetWeightKg: 80.8,
    });
    expect(projection.timeline?.completionLocalDate).toBe('2026-03-21');
  });

  it('returns maintenance without a fabricated target timeline', () => {
    const projection = calculateAdaptiveSetupProjection({
      ...baseInput,
      goalRatePctPerWeek: 0,
      goalType: 'maintain',
      targetWeightKg: null,
    });

    expect(projection.timeline).toBeNull();
    expect(projection.totalWeightChangeKg).toBe(0);
    expect(projection.rateGuidance.status).toBe('maintenance');
    expect(projection.goal.goalCalories).toBe(2500);
  });

  it.each([
    { goalRatePctPerWeek: 0, goalType: 'gain' as const, targetWeightKg: 84 },
    { goalRatePctPerWeek: 0.25, goalType: 'gain' as const, targetWeightKg: null },
    { goalRatePctPerWeek: 0.25, goalType: 'gain' as const, targetWeightKg: 79 },
    { goalRatePctPerWeek: -0.5, goalType: 'lose' as const, targetWeightKg: 81 },
  ])('fails closed for invalid directional input %#', (input) => {
    expect(() => calculateAdaptiveSetupProjection({ ...baseInput, ...input })).toThrow();
  });

  it('withholds a date when the target is already inside goal tolerance', () => {
    const projection = calculateAdaptiveSetupProjection({
      ...baseInput,
      currentWeightKg: 80,
      goalRatePctPerWeek: -0.5,
      goalType: 'lose',
      targetWeightKg: 79.9,
    });

    expect(projection.goal.goalReached).toBe(true);
    expect(projection.timeline).toBeNull();
    expect(projection.warningCodes).toContain('GOAL_REACHED');
  });

  it('classifies recommendation bands independently from hard allowed ranges', () => {
    expect(classifyAdaptiveSetupGoalRate('gain', 0.25)).toMatchObject({
      label: 'Standard',
      status: 'recommended',
    });
    expect(classifyAdaptiveSetupGoalRate('gain', 0.45)).toMatchObject({
      label: 'Faster',
      status: 'caution',
    });
    expect(classifyAdaptiveSetupGoalRate('lose', -0.2)).toMatchObject({
      label: 'Gradual',
      status: 'caution',
    });
    expect(classifyAdaptiveSetupGoalRate('lose', -0.75).status).toBe('recommended');
    expect(ADAPTIVE_SETUP_GOAL_RATE_RULES.gain.recommendedMaximumPct).toBe(0.35);
    expect(ADAPTIVE_SETUP_GOAL_RATE_RULES.lose.recommendedMinimumPct).toBe(0.25);
  });

  it('calculates and matches protein presets at nearest-five rounding boundaries', () => {
    expect(calculateAdaptiveProteinPresets(80)).toEqual({
      high: 175,
      moderate: 130,
      recommended: 145,
    });
    expect(matchAdaptiveProteinPreset(80, 145)).toBe('recommended');
    expect(matchAdaptiveProteinPreset(80, 150)).toBe('custom');
  });

  it('allocates fat from calories and carbohydrates from the remainder', () => {
    const projection = calculateAdaptiveSetupProjection(baseInput);

    expect(projection.macros.fat).toBe(90);
    expect(projection.macros.carbs).toBe(332);
    expect(projection.fatCaloriesPct).toBeCloseTo(29.78, 2);
    expect(projection.carbohydrateCaloriesPct).toBeCloseTo(48.82, 2);
  });

  it('rejects an infeasible protein and fat configuration', () => {
    expect(() =>
      calculateAdaptiveSetupProjection({
        ...baseInput,
        baselineTdeeKcal: 1200,
        currentWeightKg: 100,
        fatAllocationPct: 40,
        goalRatePctPerWeek: -1,
        goalType: 'lose',
        proteinGrams: 400,
        systemCalorieFloorKcal: 1200,
        targetWeightKg: 80,
        userCalorieFloorKcal: 1200,
      }),
    ).toThrow(/Protein and fat allocations exceed/);
  });

  it('discloses floor and deficit guardrails plus the achievable rate', () => {
    const projection = calculateAdaptiveSetupProjection({
      ...baseInput,
      baselineTdeeKcal: 2000,
      currentWeightKg: 100,
      goalRatePctPerWeek: -1,
      goalType: 'lose',
      proteinGrams: 150,
      systemCalorieFloorKcal: 1200,
      targetWeightKg: 80,
      userCalorieFloorKcal: 1200,
    });

    expect(projection.goal.goalCalories).toBe(1500);
    expect(projection.warningCodes).toEqual(
      expect.arrayContaining(['CALORIE_FLOOR_APPLIED', 'DEFICIT_LIMIT_APPLIED']),
    );
    expect(projection.goal.achievableGoalRatePctPerWeek).toBeCloseTo(-0.4545, 4);
    expect(projection.rateIsGuardrailLimited).toBe(true);
    expect(projection.requestedGoalRatePctPerWeek).toBe(-1);
  });
});
