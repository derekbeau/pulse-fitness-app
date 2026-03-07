import { describe, expect, it } from 'vitest';

import {
  type CreateNutritionTargetInput,
  createNutritionTargetInputSchema,
} from './nutrition-targets';

describe('createNutritionTargetInputSchema', () => {
  it('parses a valid nutrition target payload', () => {
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
});
