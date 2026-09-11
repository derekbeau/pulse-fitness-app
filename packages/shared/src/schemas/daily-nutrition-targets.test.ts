import { describe, expect, it } from 'vitest';

import {
  patchDailyNutritionTargetInputSchema,
  resolvedDailyNutritionTargetSchema,
} from './daily-nutrition-targets.js';

describe('daily nutrition target override schemas', () => {
  it('preserves omission, accepts explicit null, and trims a reason', () => {
    expect(
      patchDailyNutritionTargetInputSchema.parse({
        calories: 2_500,
        protein: null,
        reason: '  Travel  ',
      }),
    ).toEqual({ calories: 2_500, protein: null, reason: 'Travel' });
    expect(patchDailyNutritionTargetInputSchema.parse({})).toEqual({});
    expect(patchDailyNutritionTargetInputSchema.parse({ reason: '😀'.repeat(1_000) })).toEqual({
      reason: '😀'.repeat(1_000),
    });
    expect(() =>
      patchDailyNutritionTargetInputSchema.parse({ reason: '😀'.repeat(1_001) }),
    ).toThrow();
  });

  it.each([
    { calories: Number.NaN },
    { calories: Number.POSITIVE_INFINITY },
    { calories: -1 },
    { calories: 10_001 },
    { protein: 1_001 },
    { carbs: -0.1 },
    { fat: 1_001 },
    { reason: '   ' },
    { reason: 'x'.repeat(2_001) },
    { unexpected: true },
  ])('rejects invalid or unknown patch input %#', (input) => {
    expect(() => patchDailyNutritionTargetInputSchema.parse(input)).toThrow();
  });

  it('keeps baseline, raw override, effective values, and provenance distinct', () => {
    expect(
      resolvedDailyNutritionTargetSchema.parse({
        date: '2026-08-17',
        timeZone: 'America/Detroit',
        baseline: {
          targetEventId: 'event-1',
          targetId: 'target-1',
          effectiveDate: '2026-08-01',
          recordedAt: 1_775_000_000_000,
          calories: 2_400,
          protein: 180,
          carbs: 210,
          fat: 80,
          source: 'manual',
          adaptiveCheckInId: null,
        },
        override: {
          id: 'override-1',
          date: '2026-08-17',
          calories: 2_600,
          protein: null,
          carbs: null,
          fat: null,
          reason: 'Planned event',
          createdAt: 1_775_000_100_000,
          updatedAt: 1_775_000_100_000,
        },
        effective: { calories: 2_600, protein: 180, carbs: 210, fat: 80 },
        adjusted: true,
        overriddenFields: ['calories'],
      }),
    ).toMatchObject({
      baseline: { calories: 2_400 },
      override: { calories: 2_600, protein: null },
      effective: { calories: 2_600, protein: 180 },
      adjusted: true,
    });
  });
});
