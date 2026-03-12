import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { updateFoodLastUsedAt } from '../foods/store.js';
import { createMealForDate, findMealById, findMealItemById, patchMealById, patchMealItemById } from '../nutrition/store.js';

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
  findMealById: vi.fn(),
  findMealItemById: vi.fn(),
  patchMealById: vi.fn(),
  patchMealItemById: vi.fn(),
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

const patchedMeal = {
  ...createdMeal,
  name: 'Updated Lunch',
  time: '13:00',
  notes: 'changed by agent',
  updatedAt: 1_700_000_000_100,
};

const patchedMealItem = {
  ...createdItems[0],
  amount: 2.5,
  calories: 345,
  protein: 63,
  carbs: 2,
  fat: 8,
  fiber: 1,
  sugar: 0,
};

describe('agent meals routes', () => {
  beforeEach(() => {
    vi.mocked(findFoodByName).mockReset();
    vi.mocked(createMealForDate).mockReset();
    vi.mocked(findMealById).mockReset();
    vi.mocked(findMealItemById).mockReset();
    vi.mocked(patchMealById).mockReset();
    vi.mocked(patchMealItemById).mockReset();
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

    it('returns 400 for impossible calendar dates', async () => {
      const app = buildServer();

      try {
        await app.ready();

        const token = app.jwt.sign({ userId: 'user-1' });
        const response = await app.inject({
          method: 'POST',
          url: '/api/agent/meals',
          headers: createAuthorizationHeader(token),
          body: {
            name: 'Lunch',
            date: '2026-02-30',
            items: [{ foodName: 'Chicken Breast', quantity: 1 }],
          },
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

  describe('PATCH /api/agent/meals/:id', () => {
    it('patches meals with partial payloads', async () => {
      const app = buildServer();

      try {
        await app.ready();
        vi.mocked(findMealById).mockResolvedValueOnce(createdMeal).mockResolvedValueOnce(createdMeal).mockResolvedValueOnce(createdMeal);
        vi.mocked(patchMealById).mockResolvedValue(patchedMeal);

        const token = app.jwt.sign({ userId: 'user-1' });
        const patchNameResponse = await app.inject({
          method: 'PATCH',
          url: '/api/agent/meals/meal-1',
          headers: createAuthorizationHeader(token),
          body: {
            name: ' Updated Lunch ',
          },
        });
        const patchTimeResponse = await app.inject({
          method: 'PATCH',
          url: '/api/agent/meals/meal-1',
          headers: createAuthorizationHeader(token),
          body: {
            time: '13:00',
          },
        });
        const patchMultipleResponse = await app.inject({
          method: 'PATCH',
          url: '/api/agent/meals/meal-1',
          headers: createAuthorizationHeader(token),
          body: {
            name: 'Updated Lunch',
            time: '13:00',
            notes: 'changed by agent',
          },
        });

        expect(patchNameResponse.statusCode).toBe(200);
        expect(patchTimeResponse.statusCode).toBe(200);
        expect(patchMultipleResponse.statusCode).toBe(200);
        expect(patchNameResponse.json()).toEqual({
          data: patchedMeal,
        });
        expect(vi.mocked(findMealById)).toHaveBeenNthCalledWith(1, 'user-1', 'meal-1');
        expect(vi.mocked(findMealById)).toHaveBeenNthCalledWith(2, 'user-1', 'meal-1');
        expect(vi.mocked(findMealById)).toHaveBeenNthCalledWith(3, 'user-1', 'meal-1');
        expect(vi.mocked(patchMealById)).toHaveBeenNthCalledWith(1, 'meal-1', {
          name: 'Updated Lunch',
        });
        expect(vi.mocked(patchMealById)).toHaveBeenNthCalledWith(2, 'meal-1', {
          time: '13:00',
        });
        expect(vi.mocked(patchMealById)).toHaveBeenNthCalledWith(3, 'meal-1', {
          name: 'Updated Lunch',
          time: '13:00',
          notes: 'changed by agent',
        });
      } finally {
        await app.close();
      }
    });

    it('returns 404 when patching a meal not in user scope', async () => {
      const app = buildServer();

      try {
        await app.ready();
        vi.mocked(findMealById).mockResolvedValue(undefined);

        const token = app.jwt.sign({ userId: 'user-1' });
        const wrongUserResponse = await app.inject({
          method: 'PATCH',
          url: '/api/agent/meals/meal-404',
          headers: createAuthorizationHeader(token),
          body: {
            notes: 'irrelevant',
          },
        });
        const missingResponse = await app.inject({
          method: 'PATCH',
          url: '/api/agent/meals/missing-meal',
          headers: createAuthorizationHeader(token),
          body: {
            notes: 'missing',
          },
        });

        expect(wrongUserResponse.statusCode).toBe(404);
        expect(wrongUserResponse.json()).toEqual({
          error: {
            code: 'MEAL_NOT_FOUND',
            message: 'Meal not found',
          },
        });
        expect(missingResponse.statusCode).toBe(404);
        expect(missingResponse.json()).toEqual({
          error: {
            code: 'MEAL_NOT_FOUND',
            message: 'Meal not found',
          },
        });
      } finally {
        await app.close();
      }
    });
  });

  describe('PATCH /api/agent/meals/:id/items/:itemId', () => {
    it('patches meal-item snapshots directly', async () => {
      const app = buildServer();

      try {
        await app.ready();
        vi.mocked(findMealItemById)
          .mockResolvedValueOnce(createdItems[0])
          .mockResolvedValueOnce(createdItems[0])
          .mockResolvedValueOnce(createdItems[0]);
        vi.mocked(patchMealItemById).mockResolvedValue(patchedMealItem);

        const token = app.jwt.sign({ userId: 'user-1' });
        const patchAmountResponse = await app.inject({
          method: 'PATCH',
          url: '/api/agent/meals/meal-1/items/item-1',
          headers: createAuthorizationHeader(token),
          body: {
            amount: 2.5,
          },
        });
        const patchMacrosResponse = await app.inject({
          method: 'PATCH',
          url: '/api/agent/meals/meal-1/items/item-1',
          headers: createAuthorizationHeader(token),
          body: {
            calories: 345,
            protein: 63,
            carbs: 2,
            fat: 8,
          },
        });
        const patchMultipleResponse = await app.inject({
          method: 'PATCH',
          url: '/api/agent/meals/meal-1/items/item-1',
          headers: createAuthorizationHeader(token),
          body: {
            amount: 2.5,
            calories: 345,
            protein: 63,
            carbs: 2,
            fat: 8,
            fiber: 1,
            sugar: 0,
          },
        });

        expect(patchAmountResponse.statusCode).toBe(200);
        expect(patchMacrosResponse.statusCode).toBe(200);
        expect(patchMultipleResponse.statusCode).toBe(200);
        expect(patchMacrosResponse.json()).toEqual({
          data: patchedMealItem,
        });
        expect(vi.mocked(findMealItemById)).toHaveBeenNthCalledWith(1, 'user-1', 'meal-1', 'item-1');
        expect(vi.mocked(findMealItemById)).toHaveBeenNthCalledWith(2, 'user-1', 'meal-1', 'item-1');
        expect(vi.mocked(findMealItemById)).toHaveBeenNthCalledWith(3, 'user-1', 'meal-1', 'item-1');
        expect(vi.mocked(patchMealItemById)).toHaveBeenNthCalledWith(1, 'meal-1', 'item-1', {
          amount: 2.5,
        });
        expect(vi.mocked(patchMealItemById)).toHaveBeenNthCalledWith(2, 'meal-1', 'item-1', {
          calories: 345,
          protein: 63,
          carbs: 2,
          fat: 8,
        });
        expect(vi.mocked(patchMealItemById)).toHaveBeenNthCalledWith(3, 'meal-1', 'item-1', {
          amount: 2.5,
          calories: 345,
          protein: 63,
          carbs: 2,
          fat: 8,
          fiber: 1,
          sugar: 0,
        });
      } finally {
        await app.close();
      }
    });

    it('returns 404 when patching a meal item outside user scope', async () => {
      const app = buildServer();

      try {
        await app.ready();
        vi.mocked(findMealItemById).mockResolvedValue(undefined);

        const token = app.jwt.sign({ userId: 'user-1' });
        const wrongUserResponse = await app.inject({
          method: 'PATCH',
          url: '/api/agent/meals/meal-1/items/item-404',
          headers: createAuthorizationHeader(token),
          body: {
            amount: 1.1,
          },
        });
        const missingResponse = await app.inject({
          method: 'PATCH',
          url: '/api/agent/meals/meal-404/items/item-missing',
          headers: createAuthorizationHeader(token),
          body: {
            amount: 1.2,
          },
        });

        expect(wrongUserResponse.statusCode).toBe(404);
        expect(wrongUserResponse.json()).toEqual({
          error: {
            code: 'MEAL_ITEM_NOT_FOUND',
            message: 'Meal item not found',
          },
        });
        expect(missingResponse.statusCode).toBe(404);
        expect(missingResponse.json()).toEqual({
          error: {
            code: 'MEAL_ITEM_NOT_FOUND',
            message: 'Meal item not found',
          },
        });
      } finally {
        await app.close();
      }
    });
  });
});
