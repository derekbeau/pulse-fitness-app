import { describe, expect, it } from 'vitest';

import {
  type CreateMealInput,
  type DailyNutrition,
  type DeleteMealResult,
  type MealItemInput,
  type PatchMealInput,
  type PatchMealItemInput,
  type NutritionSummary,
  createMealInputSchema,
  dailyNutritionSchema,
  deleteMealResultSchema,
  mealItemInputSchema,
  patchMealInputSchema,
  patchMealItemInputSchema,
  nutritionSummarySchema,
} from './nutrition';

describe('mealItemInputSchema', () => {
  it('parses a valid meal item payload', () => {
    const item = mealItemInputSchema.parse({
      foodId: 'food-1',
      name: ' Cooked Rice ',
      amount: 1.5,
      unit: ' cup ',
      displayQuantity: 2,
      displayUnit: ' scoops ',
      calories: 300,
      protein: 6,
      carbs: 65,
      fat: 1,
      fiber: 2.5,
      sugar: 1,
    });

    expect(item).toEqual({
      foodId: 'food-1',
      name: 'Cooked Rice',
      amount: 1.5,
      unit: 'cup',
      displayQuantity: 2,
      displayUnit: 'scoops',
      calories: 300,
      protein: 6,
      carbs: 65,
      fat: 1,
      fiber: 2.5,
      sugar: 1,
    });
  });

  it('accepts omitted or null display fields', () => {
    expect(
      mealItemInputSchema.parse({
        name: 'Protein Powder',
        amount: 1,
        unit: 'serving',
        calories: 120,
        protein: 24,
        carbs: 3,
        fat: 1.5,
      }),
    ).toEqual({
      name: 'Protein Powder',
      amount: 1,
      unit: 'serving',
      calories: 120,
      protein: 24,
      carbs: 3,
      fat: 1.5,
    });

    expect(
      mealItemInputSchema.parse({
        name: 'Protein Powder',
        amount: 1,
        unit: 'serving',
        displayQuantity: null,
        displayUnit: null,
        calories: 120,
        protein: 24,
        carbs: 3,
        fat: 1.5,
      }),
    ).toEqual({
      name: 'Protein Powder',
      amount: 1,
      unit: 'serving',
      displayQuantity: null,
      displayUnit: null,
      calories: 120,
      protein: 24,
      carbs: 3,
      fat: 1.5,
    });
  });

  it('rejects invalid quantities and macros', () => {
    expect(() =>
      mealItemInputSchema.parse({
        name: 'Cooked Rice',
        amount: 0,
        unit: 'cup',
        calories: -1,
        protein: 6,
        carbs: 65,
        fat: 1,
        fiber: -1,
      }),
    ).toThrow();

    expect(() =>
      mealItemInputSchema.parse({
        name: 'Cooked Rice',
        amount: 1,
        unit: 'cup',
        displayQuantity: 0,
        calories: 100,
        protein: 2,
        carbs: 20,
        fat: 0,
      }),
    ).toThrow();

    expect(() =>
      mealItemInputSchema.parse({
        name: 'Cooked Rice',
        amount: 1,
        unit: 'cup',
        displayUnit: 'x'.repeat(51),
        calories: 100,
        protein: 2,
        carbs: 20,
        fat: 0,
      }),
    ).toThrow();
  });

  it('infers the MealItemInput type from the schema', () => {
    const item: MealItemInput = {
      name: 'Egg Whites',
      amount: 4,
      unit: 'oz',
      calories: 68,
      protein: 14,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
    };

    expect(item.protein).toBe(14);
  });
});

describe('createMealInputSchema', () => {
  it('parses a valid meal payload with items', () => {
    const meal = createMealInputSchema.parse({
      name: ' Lunch ',
      time: '12:30',
      notes: ' Post workout ',
      items: [
        {
          name: 'Cooked Rice',
          amount: 1,
          unit: 'cup',
          calories: 200,
          protein: 4,
          carbs: 45,
          fat: 1,
        },
      ],
    });

    expect(meal).toEqual({
      name: 'Lunch',
      time: '12:30',
      notes: 'Post workout',
      items: [
        {
          name: 'Cooked Rice',
          amount: 1,
          unit: 'cup',
          calories: 200,
          protein: 4,
          carbs: 45,
          fat: 1,
        },
      ],
    });
  });

  it('rejects invalid meal payloads', () => {
    expect(() =>
      createMealInputSchema.parse({
        name: '  ',
        time: '7:30',
        items: [],
      }),
    ).toThrow();
  });

  it('infers the CreateMealInput type from the schema', () => {
    const meal: CreateMealInput = {
      name: 'Breakfast',
      items: [
        {
          name: 'Oats',
          amount: 60,
          unit: 'g',
          calories: 228,
          protein: 8,
          carbs: 39,
          fat: 4,
        },
      ],
    };

    expect(meal.name).toBe('Breakfast');
  });
});

describe('patchMealInputSchema', () => {
  it('accepts a valid single-field patch', () => {
    const payload: PatchMealInput = patchMealInputSchema.parse({
      name: ' Dinner ',
    });

    expect(payload).toEqual({
      name: 'Dinner',
    });
  });

  it('accepts a valid multi-field patch', () => {
    const payload = patchMealInputSchema.parse({
      time: null,
      notes: '  lighter meal  ',
    });

    expect(payload).toEqual({
      time: null,
      notes: 'lighter meal',
    });
  });

  it('rejects an empty patch payload', () => {
    expect(() => patchMealInputSchema.parse({})).toThrow();
  });

  it('enforces field constraints', () => {
    expect(() =>
      patchMealInputSchema.parse({
        name: 'x'.repeat(121),
      }),
    ).toThrow();
  });
});

describe('patchMealItemInputSchema', () => {
  it('accepts a valid single-field patch', () => {
    const payload: PatchMealItemInput = patchMealItemInputSchema.parse({
      amount: 2.5,
    });

    expect(payload).toEqual({
      amount: 2.5,
    });
  });

  it('accepts a valid multi-field patch', () => {
    const payload = patchMealItemInputSchema.parse({
      name: ' Grilled Chicken ',
      calories: 220,
      fiber: null,
    });

    expect(payload).toEqual({
      name: 'Grilled Chicken',
      calories: 220,
      fiber: null,
    });
  });

  it('rejects an empty patch payload', () => {
    expect(() => patchMealItemInputSchema.parse({})).toThrow();
  });

  it('enforces field constraints', () => {
    expect(() =>
      patchMealItemInputSchema.parse({
        amount: 0,
      }),
    ).toThrow();
  });
});

describe('dailyNutritionSchema', () => {
  it('parses a valid daily nutrition payload', () => {
    const payload = dailyNutritionSchema.parse({
      log: {
        id: 'log-1',
        userId: 'user-1',
        date: '2026-03-09',
        notes: null,
        createdAt: 1,
        updatedAt: 1,
      },
      meals: [
        {
          meal: {
            id: 'meal-1',
            nutritionLogId: 'log-1',
            name: 'Breakfast',
            time: '07:20',
            notes: null,
            createdAt: 1,
            updatedAt: 1,
          },
          items: [
            {
              id: 'item-1',
              mealId: 'meal-1',
              foodId: null,
              name: 'Large Eggs',
              amount: 3,
              unit: 'eggs',
              displayQuantity: 3,
              displayUnit: 'eggs',
              calories: 210,
              protein: 18,
              carbs: 1,
              fat: 15,
              fiber: null,
              sugar: null,
              createdAt: 1,
            },
          ],
        },
      ],
    });

    expect(payload?.meals).toHaveLength(1);
    expect(payload?.meals[0]?.items[0]?.name).toBe('Large Eggs');
    expect(payload?.meals[0]?.items[0]?.displayUnit).toBe('eggs');
  });

  it('accepts null when no log exists for the date', () => {
    expect(dailyNutritionSchema.parse(null)).toBeNull();
  });

  it('infers DailyNutrition from the schema', () => {
    const daily: DailyNutrition = null;
    expect(daily).toBeNull();
  });
});

describe('nutritionSummarySchema', () => {
  it('parses summary payloads with and without target', () => {
    const withTarget = nutritionSummarySchema.parse({
      date: '2026-03-09',
      meals: 3,
      actual: {
        calories: 2100,
        protein: 180,
        carbs: 220,
        fat: 70,
      },
      target: {
        calories: 2300,
        protein: 190,
        carbs: 260,
        fat: 75,
      },
    });

    const withoutTarget = nutritionSummarySchema.parse({
      date: '2026-03-09',
      meals: 0,
      actual: {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      },
      target: null,
    });

    expect(withTarget.target?.calories).toBe(2300);
    expect(withoutTarget.target).toBeNull();
  });

  it('infers NutritionSummary from the schema', () => {
    const summary: NutritionSummary = {
      date: '2026-03-09',
      meals: 1,
      actual: {
        calories: 210,
        protein: 18,
        carbs: 1,
        fat: 15,
      },
      target: null,
    };

    expect(summary.actual.protein).toBe(18);
  });
});

describe('deleteMealResultSchema', () => {
  it('parses successful delete payloads', () => {
    expect(deleteMealResultSchema.parse({ success: true })).toEqual({ success: true });
  });

  it('infers DeleteMealResult from the schema', () => {
    const result: DeleteMealResult = { success: true };
    expect(result.success).toBe(true);
  });
});
