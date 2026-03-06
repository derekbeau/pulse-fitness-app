import { describe, expect, it } from 'vitest';
import { mockFoods } from '@/lib/mock-data/foods';
import { mockDailyMeals, mockDailyTargets } from '@/lib/mock-data/nutrition';

describe('mockDailyTargets', () => {
  it('exports the expected macro targets', () => {
    expect(mockDailyTargets).toEqual({
      calories: 2200,
      protein: 180,
      carbs: 250,
      fat: 73,
    });
  });
});

describe('mockDailyMeals', () => {
  const foodIds = new Set(mockFoods.map((food) => food.id));

  it('includes three days of meal data', () => {
    expect(Object.keys(mockDailyMeals)).toEqual(['2026-03-03', '2026-03-04', '2026-03-05']);
  });

  it('includes breakfast, lunch, dinner, and snacks for each day', () => {
    for (const meals of Object.values(mockDailyMeals)) {
      expect(meals).toHaveLength(4);
      expect(meals.map((meal) => meal.name)).toEqual(['Breakfast', 'Lunch', 'Dinner', 'Snacks']);
    }
  });

  it('provides realistic macro totals and valid food references for every meal item', () => {
    for (const meals of Object.values(mockDailyMeals)) {
      for (const meal of meals) {
        expect(meal.time).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
        expect(meal.items.length).toBeGreaterThanOrEqual(3);

        for (const item of meal.items) {
          expect(item.id).toBeTruthy();
          expect(foodIds.has(item.foodId)).toBe(true);
          expect(item.name).toBeTruthy();
          expect(item.servingSize).toBeGreaterThan(0);
          expect(item.servingUnit).toBeTruthy();
          expect(item.quantity).toBeGreaterThan(0);
          expect(item.calories).toBeGreaterThan(0);
          expect(item.protein).toBeGreaterThanOrEqual(0);
          expect(item.carbs).toBeGreaterThanOrEqual(0);
          expect(item.fat).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('keeps daily calorie totals in a realistic range for the defined targets', () => {
    const totals = Object.values(mockDailyMeals).map((meals) =>
      meals.reduce(
        (dayTotal, meal) =>
          dayTotal + meal.items.reduce((mealTotal, item) => mealTotal + item.calories, 0),
        0,
      ),
    );

    expect(totals).toEqual([1891, 1629, 2131]);
    expect(totals.every((total) => total >= 1500 && total <= 2300)).toBe(true);
  });
});
