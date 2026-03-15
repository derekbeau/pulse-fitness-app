import { describe, expect, it } from 'vitest';

import {
  formatCalories,
  formatDisplayServing,
  formatGrams,
  sortMeals,
  toMealLoggedAtTimestamp,
} from '@/features/nutrition/lib/nutrition-utils';

describe('macro formatting', () => {
  it('supports compact nutrition labels without string replacement at call sites', () => {
    expect(formatCalories(535, { compact: true })).toBe('535cal');
    expect(formatCalories(535)).toBe('535 cal');
    expect(formatGrams(29, { compact: true, suffix: 'P' })).toBe('29P');
    expect(formatGrams(29)).toBe('29g');
    expect(formatGrams(31.7, { compact: true })).toBe('32g');
  });
});

describe('formatDisplayServing', () => {
  it('prefers display quantity and unit when both are present', () => {
    expect(
      formatDisplayServing({
        amount: 0.69,
        unit: 'serving',
        displayQuantity: 5.5,
        displayUnit: 'oz',
      }),
    ).toBe('5.5 oz');
  });

  it('falls back to amount and unit when display quantity is missing', () => {
    expect(
      formatDisplayServing({
        amount: 0.69,
        unit: 'serving',
        displayQuantity: null,
        displayUnit: 'oz',
      }),
    ).toBe('0.69 serving');
  });

  it('falls back to amount and unit when display unit is missing', () => {
    expect(
      formatDisplayServing({
        amount: 2,
        unit: 'servings',
        displayQuantity: 3,
        displayUnit: null,
      }),
    ).toBe('2 servings');
  });

  it('formats numbers without trailing zeros', () => {
    expect(
      formatDisplayServing({
        amount: 1,
        unit: 'serving',
        displayQuantity: 2,
        displayUnit: 'scoops',
      }),
    ).toBe('2 scoops');
  });
});

describe('sortMeals', () => {
  const meals = [
    { id: 'meal-2', name: 'Lunch', loggedAt: '2026-03-05T12:30:00.000Z' },
    { id: 'meal-1', name: 'Breakfast', loggedAt: '2026-03-05T07:20:00.000Z' },
    { id: 'meal-3', name: 'Dinner', loggedAt: '2026-03-05T18:40:00.000Z' },
  ];

  it('sorts by loggedAt ascending by default', () => {
    expect(sortMeals(meals, 'asc', (meal) => meal.name).map((meal) => meal.name)).toEqual([
      'Breakfast',
      'Lunch',
      'Dinner',
    ]);
  });

  it('sorts by loggedAt descending when direction is desc', () => {
    expect(sortMeals(meals, 'desc', (meal) => meal.name).map((meal) => meal.name)).toEqual([
      'Dinner',
      'Lunch',
      'Breakfast',
    ]);
  });

  it('reverses tie-break ordering when direction is desc', () => {
    const mealsWithMatchingTimestamp = [
      { id: 'meal-1', name: 'Breakfast', loggedAt: '2026-03-05T12:30:00.000Z' },
      { id: 'meal-2', name: 'Lunch', loggedAt: '2026-03-05T12:30:00.000Z' },
      { id: 'meal-3', name: 'Dinner', loggedAt: '2026-03-05T12:30:00.000Z' },
    ];

    expect(
      sortMeals(mealsWithMatchingTimestamp, 'desc', (meal) => meal.name).map((meal) => meal.name),
    ).toEqual(['Lunch', 'Dinner', 'Breakfast']);
  });

  it('sorts meal-like objects without requiring a name field', () => {
    const entries = [
      { id: 'entry-2', loggedAt: '2026-03-05T10:00:00.000Z' },
      { id: 'entry-1', loggedAt: '2026-03-05T09:00:00.000Z' },
    ];

    expect(sortMeals(entries).map((entry) => entry.id)).toEqual(['entry-1', 'entry-2']);
  });
});

describe('toMealLoggedAtTimestamp', () => {
  it('derives a local timestamp from date key and meal time', () => {
    expect(toMealLoggedAtTimestamp('2026-03-05', '07:20', 123)).toBe(
      new Date('2026-03-05T07:20:00').getTime(),
    );
  });

  it('falls back to createdAt timestamp when meal time is missing', () => {
    expect(toMealLoggedAtTimestamp('2026-03-05', null, 456)).toBe(456);
  });

  it('falls back when meal time is invalid', () => {
    expect(toMealLoggedAtTimestamp('2026-03-05', 'invalid', 789)).toBe(789);
  });
});
