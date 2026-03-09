import { describe, expect, it } from 'vitest';

import {
  type CreateMealInput,
  type MealItemInput,
  createMealInputSchema,
  mealItemInputSchema,
} from './nutrition';

describe('mealItemInputSchema', () => {
  it('parses a valid meal item payload', () => {
    const item = mealItemInputSchema.parse({
      foodId: 'food-1',
      name: ' Cooked Rice ',
      amount: 1.5,
      unit: ' cup ',
      calories: 300,
      protein: 6,
      carbs: 65,
      fat: 1,
    });

    expect(item).toEqual({
      foodId: 'food-1',
      name: 'Cooked Rice',
      amount: 1.5,
      unit: 'cup',
      calories: 300,
      protein: 6,
      carbs: 65,
      fat: 1,
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
