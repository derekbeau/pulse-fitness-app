import { describe, expect, it } from 'vitest';

import { energyBalanceAnalyticsQuerySchema, energyBalancePointSchema } from './energy-balance.js';

const base = {
  periodStart: '2026-08-18',
  periodEnd: '2026-08-18',
  nutritionStatus: 'missing' as const,
  sourceNutritionStatus: null,
  nutritionLogIds: [],
  loggedIntakeKcal: null,
  intakeKcal: null,
  includedInBalance: false,
  completeNutritionDays: 0,
  partialNutritionDays: 0,
  unknownNutritionDays: 0,
  missingNutritionDays: 1,
  excludedNutritionDays: 1,
  targetKcal: 2400,
  targetIds: ['target-1'],
  expenditureKcal: 2600,
  trendWeightKg: null,
  goalType: 'maintain' as const,
  state: 'learning' as const,
  calculationState: 'learning' as const,
  calculationReasonCodes: ['INSUFFICIENT_NUTRITION' as const],
  reasonCodes: ['MISSING_NUTRITION_EXCLUDED' as const],
  expenditureSourceCheckInId: 'check-in-1',
  expenditureSourceInputFingerprint: 'a'.repeat(64),
  stateSourceCheckInId: 'check-in-1',
  stateSourceInputFingerprint: 'a'.repeat(64),
  sourceCheckInIds: ['check-in-1'],
  sourceInputFingerprints: ['a'.repeat(64)],
  goalRevisionIds: ['revision-1'],
};

describe('energy balance contracts', () => {
  it('is strict and rejects fabricated missing-day intake', () => {
    expect(energyBalancePointSchema.parse(base)).toEqual(base);
    expect(() => energyBalancePointSchema.parse({ ...base, loggedIntakeKcal: 0 })).toThrow();
    expect(() => energyBalancePointSchema.parse({ ...base, surprise: true })).toThrow();
  });

  it('accepts mixed aggregate periods only when they contain complete modeled evidence', () => {
    expect(
      energyBalancePointSchema.parse({
        ...base,
        nutritionStatus: 'mixed',
        loggedIntakeKcal: 2520,
        intakeKcal: 2520,
        includedInBalance: true,
        completeNutritionDays: 1,
      }),
    ).toMatchObject({ nutritionStatus: 'mixed', includedInBalance: true });
    expect(() =>
      energyBalancePointSchema.parse({
        ...base,
        nutritionStatus: 'mixed',
        intakeKcal: 2520,
        includedInBalance: true,
      }),
    ).toThrow();
  });

  it('accepts only supported range query fields', () => {
    expect(energyBalanceAnalyticsQuerySchema.parse({})).toEqual({
      range: '1m',
      aggregation: 'auto',
    });
    expect(() => energyBalanceAnalyticsQuerySchema.parse({ range: '2m' })).toThrow();
    expect(() => energyBalanceAnalyticsQuerySchema.parse({ extra: true })).toThrow();
  });
});
