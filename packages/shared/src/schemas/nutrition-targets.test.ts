import { describe, expect, it } from 'vitest';

import {
  type CreateNutritionTargetInput,
  type NutritionTarget,
  createNutritionTargetInputSchema,
  nutritionTargetSchema,
  nutritionTargetSourceSchema,
} from './nutrition-targets';

describe('createNutritionTargetInputSchema', () => {
  it('parses a valid manual target payload without accepting caller-owned provenance', () => {
    const payload = createNutritionTargetInputSchema.parse({
      calories: 2200,
      protein: 180,
      carbs: 250,
      fat: 70,
      effectiveDate: '2026-03-07',
    });

    expect(payload).toEqual({
      calories: 2200,
      protein: 180,
      carbs: 250,
      fat: 70,
      effectiveDate: '2026-03-07',
    });
  });

  it('rejects negative macro targets', () => {
    expect(() =>
      createNutritionTargetInputSchema.parse({
        calories: -1,
        protein: 180,
        carbs: 250,
        fat: 70,
        effectiveDate: '2026-03-07',
      }),
    ).toThrow();
  });

  it('rejects implausibly large nutrition targets', () => {
    expect(() =>
      createNutritionTargetInputSchema.parse({
        calories: 10_001,
        protein: 180,
        carbs: 250,
        fat: 70,
        effectiveDate: '2026-03-07',
      }),
    ).toThrow();
  });

  it('infers the CreateNutritionTargetInput type from the schema', () => {
    const payload: CreateNutritionTargetInput = {
      calories: 2200,
      protein: 180,
      carbs: 250,
      fat: 70,
      effectiveDate: '2026-03-07',
    };

    expect(payload.effectiveDate).toBe('2026-03-07');
  });

  it('validates target provenance enums and macro calories', () => {
    expect(nutritionTargetSourceSchema.parse('manual')).toBe('manual');
    expect(nutritionTargetSourceSchema.parse('adaptive')).toBe('adaptive');
    expect(() => nutritionTargetSourceSchema.parse('imported')).toThrow();
    expect(() =>
      nutritionTargetSchema.parse({
        id: 'target-1',
        calories: 2200,
        protein: 180,
        carbs: 250,
        fat: 70,
        source: 'manual',
        adaptiveCheckInId: null,
        macroCalories: -1,
        effectiveDate: '2026-03-07',
        createdAt: 1,
        updatedAt: 2,
      }),
    ).toThrow();
    expect(() =>
      nutritionTargetSchema.parse({
        id: 'target-1',
        calories: 2200,
        protein: 180,
        carbs: 250,
        fat: 70,
        source: 'adaptive',
        adaptiveCheckInId: null,
        macroCalories: 2350,
        effectiveDate: '2026-03-07',
        createdAt: 1,
        updatedAt: 2,
      }),
    ).toThrow();
    expect(() =>
      nutritionTargetSchema.parse({
        id: 'target-1',
        calories: 2200,
        protein: 180,
        carbs: 250,
        fat: 70,
        source: 'manual',
        adaptiveCheckInId: 'check-in-1',
        macroCalories: 2350,
        effectiveDate: '2026-03-07',
        createdAt: 1,
        updatedAt: 2,
      }),
    ).toThrow();
  });
});

describe('nutritionTargetSchema', () => {
  it('parses a persisted nutrition target', () => {
    const target = nutritionTargetSchema.parse({
      id: 'target-1',
      calories: 2200,
      protein: 180,
      carbs: 250,
      fat: 70,
      source: 'adaptive',
      adaptiveCheckInId: 'check-in-1',
      macroCalories: 2350,
      effectiveDate: '2026-03-07',
      createdAt: 1,
      updatedAt: 2,
    });

    expect(target).toEqual({
      id: 'target-1',
      calories: 2200,
      protein: 180,
      carbs: 250,
      fat: 70,
      source: 'adaptive',
      adaptiveCheckInId: 'check-in-1',
      macroCalories: 2350,
      effectiveDate: '2026-03-07',
      createdAt: 1,
      updatedAt: 2,
    });
  });

  it('infers the NutritionTarget type from the schema', () => {
    const target: NutritionTarget = {
      id: 'target-1',
      calories: 2200,
      protein: 180,
      carbs: 250,
      fat: 70,
      source: 'manual',
      adaptiveCheckInId: null,
      macroCalories: 2350,
      effectiveDate: '2026-03-07',
      createdAt: 1,
      updatedAt: 2,
    };

    expect(target.calories).toBe(2200);
  });
});
