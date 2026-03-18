import { describe, expect, it } from 'vitest';

import {
  createFoodInputSchema,
  foodQueryParamsSchema,
  foodSchema,
  type Food,
  type FoodQueryParams,
  type PatchFoodInput,
  type UpdateFoodInput,
  patchFoodInputSchema,
  updateFoodInputSchema,
} from './foods';

describe('foodSchema', () => {
  it('parses a valid persisted food record', () => {
    const payload = foodSchema.parse({
      id: 'food-1',
      userId: 'user-1',
      name: ' Greek Yogurt ',
      brand: 'Fage',
      servingSize: '170 g',
      servingGrams: 170,
      calories: 90,
      protein: 18,
      carbs: 5,
      fat: 0,
      fiber: null,
      sugar: 5,
      verified: true,
      source: 'Manufacturer label',
      notes: null,
      usageCount: 12,
      tags: ['dairy', 'protein'],
      lastUsedAt: 1_700_000_000_000,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_001,
    });

    expect(payload.name).toBe('Greek Yogurt');
  });

  it('infers the Food type from the schema', () => {
    const payload: Food = {
      id: 'food-2',
      userId: 'user-1',
      name: 'Chicken Breast',
      brand: null,
      servingSize: '4 oz',
      servingGrams: 112,
      calories: 187,
      protein: 35,
      carbs: 0,
      fat: 4,
      fiber: null,
      sugar: null,
      verified: true,
      source: 'USDA',
      notes: null,
      usageCount: 0,
      tags: [],
      lastUsedAt: null,
      createdAt: 1,
      updatedAt: 2,
    };

    expect(payload.name).toBe('Chicken Breast');
  });
});

describe('createFoodInputSchema', () => {
  it('trims strings and defaults verified to false', () => {
    const payload = createFoodInputSchema.parse({
      name: ' Greek Yogurt ',
      brand: ' Fage 0% ',
      servingSize: ' 170 g ',
      calories: 90,
      protein: 18,
      carbs: 5,
      fat: 0,
      notes: ' High protein snack ',
      tags: [' dairy ', ' Snack '],
    });

    expect(payload).toEqual({
      name: 'Greek Yogurt',
      brand: 'Fage 0%',
      servingSize: '170 g',
      calories: 90,
      protein: 18,
      carbs: 5,
      fat: 0,
      notes: 'High protein snack',
      tags: ['dairy', 'snack'],
      verified: false,
    });
  });

  it('accepts foodName alias and normalizes to name', () => {
    const payload = createFoodInputSchema.parse({
      foodName: ' Chicken Breast ',
      calories: 187,
      protein: 35,
      carbs: 0,
      fat: 4,
    });

    expect(payload).toEqual({
      name: 'Chicken Breast',
      calories: 187,
      protein: 35,
      carbs: 0,
      fat: 4,
      verified: false,
      tags: [],
    });
  });

  it('rejects blank names and negative nutrition values', () => {
    expect(() =>
      createFoodInputSchema.parse({
        name: '   ',
        calories: -1,
        protein: 18,
        carbs: 5,
        fat: 0,
      }),
    ).toThrow();
  });
});

describe('updateFoodInputSchema', () => {
  it('accepts partial updates', () => {
    const payload: UpdateFoodInput = updateFoodInputSchema.parse({
      brand: ' Chobani ',
      verified: true,
      tags: ['dairy'],
    });

    expect(payload).toEqual({
      brand: 'Chobani',
      verified: true,
      tags: ['dairy'],
    });
  });

  it('rejects empty update payloads', () => {
    expect(() => updateFoodInputSchema.parse({})).toThrow();
  });
});

describe('patchFoodInputSchema', () => {
  it('accepts a valid single-field patch', () => {
    const payload: PatchFoodInput = patchFoodInputSchema.parse({
      notes: '  updated source  ',
    });

    expect(payload).toEqual({
      notes: 'updated source',
    });
  });

  it('does not inject tags when patch payload omits tags', () => {
    const payload = patchFoodInputSchema.parse({
      notes: 'updated source',
    });

    expect(payload).not.toHaveProperty('tags');
  });

  it('accepts a valid multi-field patch', () => {
    const payload = patchFoodInputSchema.parse({
      name: ' Greek Yogurt ',
      brand: ' Fage ',
      verified: true,
      tags: ['dairy'],
    });

    expect(payload).toEqual({
      name: 'Greek Yogurt',
      brand: 'Fage',
      verified: true,
      tags: ['dairy'],
    });
  });

  it('rejects an empty patch payload', () => {
    expect(() => patchFoodInputSchema.parse({})).toThrow();
  });

  it('enforces field constraints', () => {
    expect(() =>
      patchFoodInputSchema.parse({
        name: 'x'.repeat(256),
      }),
    ).toThrow();
  });
});

describe('foodQueryParamsSchema', () => {
  it('coerces pagination params and trims the search query', () => {
    const payload = foodQueryParamsSchema.parse({
      q: '  yogurt ',
      tags: ' dairy , breakfast ',
      sort: 'popular',
      page: '2',
      limit: '25',
    });

    expect(payload).toEqual({
      q: 'yogurt',
      tags: ['dairy', 'breakfast'],
      sort: 'popular',
      page: 2,
      limit: 25,
    });
  });

  it('defaults omitted params and treats blank q as undefined', () => {
    const payload: FoodQueryParams = foodQueryParamsSchema.parse({
      q: '   ',
    });

    expect(payload).toEqual({
      q: undefined,
      tags: undefined,
      sort: 'recent',
      page: 1,
      limit: 50,
    });
  });

  it('parses repeated and comma-delimited tag query params', () => {
    const payload = foodQueryParamsSchema.parse({
      tags: ['Protein, Dinner', 'Lean', ''],
    });

    expect(payload.tags).toEqual(['protein', 'dinner', 'lean']);
  });

  it('rejects invalid sort and page values', () => {
    expect(() =>
      foodQueryParamsSchema.parse({
        sort: 'calories',
        page: '0',
      }),
    ).toThrow();
  });
});
