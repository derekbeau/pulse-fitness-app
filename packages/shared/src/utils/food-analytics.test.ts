import { describe, expect, it } from 'vitest';

import {
  calculateFoodCurrentDefinition,
  calculateFoodDefinitionReviewReasons,
  calculateMacroCalorieTolerance,
  calculatePercent,
  calculateProteinPer100Kcal,
  FOOD_MACRO_CALORIE_ABSOLUTE_TOLERANCE_KCAL,
  FOOD_MACRO_CALORIE_RELATIVE_TOLERANCE,
  normalizeObservedPortionUnit,
  resolveFoodAnalyticsRange,
} from './food-analytics.js';

const definition = {
  servingSize: '1 bottle',
  servingGrams: 340,
  calories: 150,
  protein: 30,
  carbs: 6,
  fat: 2,
  fiber: null,
  sugar: null,
  verified: true,
  source: 'Manufacturer label',
  notes: null,
  updatedAt: 1_700_000_000_000,
};

describe('food analytics', () => {
  it('separates current definition densities from source fields', () => {
    expect(calculateFoodCurrentDefinition(definition)).toEqual({
      servingSize: '1 bottle',
      servingGrams: 340,
      calories: 150,
      protein: 30,
      carbs: 6,
      fat: 2,
      fiber: null,
      sugar: null,
      proteinPer100Kcal: 20,
      caloriesPer100Grams: (150 * 100) / 340,
      macroDerivedCalories: 162,
      macroCalorieDifference: 12,
      macroCalorieTolerance: 10,
      verified: true,
      source: 'Manufacturer label',
      notes: null,
      updatedAt: 1_700_000_000_000,
    });
  });

  it('keeps zero-calorie density mathematically unavailable', () => {
    const result = calculateFoodCurrentDefinition({
      ...definition,
      calories: 0,
      protein: 0,
      servingGrams: null,
    });

    expect(result.proteinPer100Kcal).toBeNull();
    expect(result.caloriesPer100Grams).toBeNull();
    expect(calculateProteinPer100Kcal(0, 0)).toBeNull();
    expect(calculatePercent(0, 0)).toBeNull();
  });

  it('uses the larger named macro-calorie tolerance and flags only beyond it', () => {
    expect(calculateMacroCalorieTolerance(100)).toBe(FOOD_MACRO_CALORIE_ABSOLUTE_TOLERANCE_KCAL);
    expect(calculateMacroCalorieTolerance(500)).toBe(500 * FOOD_MACRO_CALORIE_RELATIVE_TOLERANCE);

    expect(
      calculateFoodDefinitionReviewReasons(
        { ...definition, calories: 152, protein: 30, carbs: 6, fat: 2 },
        1,
      ),
    ).not.toContain('MACRO_CALORIE_MISMATCH');
    expect(
      calculateFoodDefinitionReviewReasons(
        { ...definition, calories: 151, protein: 30, carbs: 6, fat: 2 },
        1,
      ),
    ).toContain('MACRO_CALORIE_MISMATCH');
  });

  it('returns deterministic neutral review reasons without inventing stale provenance', () => {
    expect(
      calculateFoodDefinitionReviewReasons(
        {
          ...definition,
          verified: false,
          source: '   ',
          servingGrams: null,
          calories: 50,
        },
        0,
      ),
    ).toEqual([
      'UNVERIFIED',
      'SOURCE_MISSING',
      'SERVING_GRAMS_MISSING',
      'MACRO_CALORIE_MISMATCH',
      'NO_LINKED_USAGE',
    ]);
  });

  it('resolves inclusive 30D and 90D date-only ranges without UTC drift', () => {
    expect(resolveFoodAnalyticsRange('30d', '2026-03-09', 'America/Detroit', '2026-03-09')).toEqual(
      {
        kind: '30d',
        startDate: '2026-02-08',
        endDate: '2026-03-09',
        calendarDays: 30,
        timeZone: 'America/Detroit',
        timeZoneSource: 'request',
        isHistorical: false,
      },
    );
    expect(
      resolveFoodAnalyticsRange('90d', '2026-11-01', 'America/Detroit', '2026-11-02'),
    ).toMatchObject({ startDate: '2026-08-04', endDate: '2026-11-01', isHistorical: true });
    expect(
      resolveFoodAnalyticsRange('all', '2026-03-09', 'UTC', '2026-03-09').startDate,
    ).toBeNull();
  });

  it('normalizes compatible observed portion units without converting them', () => {
    expect(normalizeObservedPortionUnit('  SERVING ')).toBe('serving');
    expect(normalizeObservedPortionUnit('g')).toBe('g');
  });
});
