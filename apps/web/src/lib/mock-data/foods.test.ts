import { describe, expect, it } from 'vitest';
import { mockFoods } from '@/lib/mock-data/foods';

describe('mockFoods', () => {
  it('includes the expected 20 food database entries', () => {
    expect(mockFoods).toHaveLength(20);
  });

  it('includes the required common foods with serving data and macros', () => {
    const requiredFoods = [
      'Chicken Breast',
      'White Rice',
      'Large Eggs',
      'Rolled Oats',
      'Banana',
      'Sweet Potato',
      'Atlantic Salmon',
      'Greek Yogurt',
      'Almonds',
      'Whey Protein',
      'Broccoli',
      'Olive Oil',
      'Whole Wheat Bread',
      'Avocado',
      'Ground Beef 90/10',
      '2% Milk',
      'Peanut Butter',
      'Apple',
      'Spinach',
      'Cheddar Cheese',
    ];

    expect(mockFoods.map((food) => food.name)).toEqual(requiredFoods);

    for (const food of mockFoods) {
      expect(food.id).toBeTruthy();
      expect(food.servingSize).toBeGreaterThan(0);
      expect(food.servingUnit).toBeTruthy();
      expect(food.calories).toBeGreaterThan(0);
      expect(food.protein).toBeGreaterThanOrEqual(0);
      expect(food.carbs).toBeGreaterThanOrEqual(0);
      expect(food.fat).toBeGreaterThanOrEqual(0);
      expect(typeof food.verified).toBe('boolean');
    }
  });

  it('uses unique ids and only nullable timestamps for recency tracking', () => {
    const ids = mockFoods.map((food) => food.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(mockFoods.length);

    for (const food of mockFoods) {
      expect(food.lastUsedAt === null || !Number.isNaN(Date.parse(food.lastUsedAt))).toBe(true);
    }
  });
});
