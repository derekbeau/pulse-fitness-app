import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { updateFoodLastUsedAt } from '../foods/store.js';
import { createMealForDate } from '../nutrition/store.js';

import { findFoodByName } from './store.js';

vi.mock('./store.js', () => ({
  searchFoodsByName: vi.fn(),
  findFoodByName: vi.fn(),
}));

vi.mock('../foods/store.js', () => ({
  createFood: vi.fn(),
  deleteFood: vi.fn(),
  listFoods: vi.fn(),
  updateFood: vi.fn(),
  updateFoodLastUsedAt: vi.fn(),
}));

vi.mock('../nutrition/store.js', () => ({
  createMealForDate: vi.fn(),
  deleteMealForDate: vi.fn(),
  getDailyNutritionForDate: vi.fn(),
  getDailyNutritionSummaryForDate: vi.fn(),
}));

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

const chickenFood = {
  id: 'food-chicken',
  name: 'Chicken Breast',
  brand: null,
  servingSize: '100 g',
  calories: 165,
  protein: 31,
  carbs: 0,
  fat: 3.6,
};

const riceFood = {
  id: 'food-rice',
  name: 'White Rice',
  brand: null,
  servingSize: '1 cup cooked',
  calories: 206,
  protein: 4.3,
  carbs: 44.5,
  fat: 0.4,
};

const createdMeal = {
  id: 'meal-1',
  nutritionLogId: 'log-1',
  name: 'Lunch',
  time: '12:00',
  notes: null,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};

const createdItems = [
  {
    id: 'item-1',
    mealId: 'meal-1',
    foodId: 'food-chicken',
    name: 'Chicken Breast',
    amount: 2,
    unit: 'serving',
    calories: 330,
    protein: 62,
    carbs: 0,
    fat: 7.2,
    fiber: null,
    sugar: null,
    createdAt: 1_700_000_000_001,
  },
  {
    id: 'item-2',
    mealId: 'meal-1',
    foodId: 'food-rice',
    name: 'White Rice',
    amount: 1,
    unit: 'serving',
    calories: 206,
    protein: 4.3,
    carbs: 44.5,
    fat: 0.4,
    fiber: null,
    sugar: null,
    createdAt: 1_700_000_000_002,
  },
];

describe('agent meals routes', () => {
  beforeEach(() => {
    vi.mocked(findFoodByName).mockReset();
    vi.mocked(createMealForDate).mockReset();
    vi.mocked(updateFoodLastUsedAt).mockReset();
    vi.mocked(updateFoodLastUsedAt).mockResolvedValue(undefined);
    process.env.JWT_SECRET = 'test-agent-meals-secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  describe('POST /api/agent/meals', () => {
    it('returns 401 without auth', async () => {
      const app = buildServer();

      try {
        await app.ready();

        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/meals',
          body: {
            name: 'Lunch',
            date: '2026-03-09',
            items: [{ foodName: 'Chicken Breast', quantity: 1 }],
          },
        });

        expect(response.statusCode).toBe(401);
      } finally {
        await app.close();
      }
    });

    it('creates a meal with resolved food names and returns macros', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findFoodByName)
          .mockResolvedValueOnce(chickenFood)
          .mockResolvedValueOnce(riceFood);
        vi.mocked(createMealForDate).mockResolvedValue({ meal: createdMeal, items: createdItems });

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/meals',
          headers: createAuthorizationHeader(token),
          body: {
            name: 'Lunch',
            date: '2026-03-09',
            time: '12:00',
            items: [
              { foodName: 'Chicken Breast', quantity: 2 },
              { foodName: 'White Rice', quantity: 1 },
            ],
          },
        });

        expect(response.statusCode).toBe(201);
        const json = response.json();
        expect(json.data.meal).toEqual({
          id: 'meal-1',
          name: 'Lunch',
          date: '2026-03-09',
          time: '12:00',
        });
        expect(json.data.macros).toEqual({
          calories: 536,
          protein: 66.3,
          carbs: 44.5,
          fat: 7.6000000000000005,
        });
        expect(json.data.items).toHaveLength(2);

        expect(vi.mocked(createMealForDate)).toHaveBeenCalledWith(
          'user-1',
          '2026-03-09',
          expect.objectContaining({
            name: 'Lunch',
            time: '12:00',
            items: [
              expect.objectContaining({
                foodId: 'food-chicken',
                name: 'Chicken Breast',
                amount: 2,
                unit: 'serving',
                calories: 330,
                protein: 62,
              }),
              expect.objectContaining({
                foodId: 'food-rice',
                name: 'White Rice',
                amount: 1,
                unit: 'serving',
                calories: 206,
              }),
            ],
          }),
        );
      } finally {
        await app.close();
      }
    });

    it('returns 422 when a food name cannot be resolved', async () => {
      const app = buildServer();

      try {
        await app.ready();

        vi.mocked(findFoodByName)
          .mockResolvedValueOnce(chickenFood)
          .mockResolvedValueOnce(undefined);

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/meals',
          headers: createAuthorizationHeader(token),
          body: {
            name: 'Breakfast',
            date: '2026-03-09',
            items: [
              { foodName: 'Chicken Breast', quantity: 1 },
              { foodName: 'Unknown Food XYZ', quantity: 1 },
            ],
          },
        });

        expect(response.statusCode).toBe(422);
        expect(response.json()).toEqual({
          error: {
            code: 'UNRESOLVED_FOODS',
            message: 'Could not find foods: Unknown Food XYZ',
          },
        });
        expect(vi.mocked(createMealForDate)).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });

    it('returns 400 for invalid payload', async () => {
      const app = buildServer();

      try {
        await app.ready();

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/meals',
          headers: createAuthorizationHeader(token),
          body: { name: 'Missing date and items' },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid meal payload' },
        });
      } finally {
        await app.close();
      }
    });
  });
});
