import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { trackFoodUsage } from '../foods/store.js';

import {
  createMealForDate,
  deleteMealForDate,
  findMealForDate,
  findMealItemForDate,
  getDailyNutritionForDate,
  getDailyNutritionSummaryForDate,
  getNutritionWeekSummaryForDate,
  patchMealById,
  patchMealItemById,
} from './store.js';

vi.mock('./store.js', () => ({
  createMealForDate: vi.fn(),
  deleteMealForDate: vi.fn(),
  findMealForDate: vi.fn(),
  findMealItemForDate: vi.fn(),
  getDailyNutritionForDate: vi.fn(),
  getDailyNutritionSummaryForDate: vi.fn(),
  getNutritionWeekSummaryForDate: vi.fn(),
  patchMealById: vi.fn(),
  patchMealItemById: vi.fn(),
}));

vi.mock('../foods/store.js', () => ({
  trackFoodUsage: vi.fn(),
}));

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

const meal = {
  id: 'meal-1',
  nutritionLogId: 'log-1',
  name: 'Lunch',
  summary: 'Chicken Breast, Olive Oil',
  time: '12:30',
  notes: null,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};

const mealItems = [
  {
    id: 'item-1',
    mealId: 'meal-1',
    foodId: 'food-1',
    name: 'Chicken Breast',
    amount: 8,
    unit: 'oz',
    calories: 374,
    protein: 70,
    carbs: 0,
    fat: 8,
    fiber: null,
    sugar: null,
    displayQuantity: null,
    displayUnit: null,
    createdAt: 1_700_000_000_001,
  },
  {
    id: 'item-2',
    mealId: 'meal-1',
    foodId: null,
    name: 'Olive Oil',
    amount: 1,
    unit: 'tbsp',
    calories: 120,
    protein: 0,
    carbs: 0,
    fat: 14,
    fiber: null,
    sugar: null,
    displayQuantity: null,
    displayUnit: null,
    createdAt: 1_700_000_000_002,
  },
];

const patchedMeal = {
  ...meal,
  name: 'Updated Lunch',
  time: '13:15',
  notes: 'Updated note',
  updatedAt: 1_700_000_000_100,
};

const patchedMealItem = {
  ...mealItems[0],
  amount: 9,
  calories: 420,
  protein: 78,
  carbs: 1,
  fat: 9,
  fiber: 1,
  sugar: 0,
};

const nutritionSummary = {
  date: '2026-03-09',
  meals: 1,
  actual: {
    calories: 494,
    protein: 70,
    carbs: 0,
    fat: 22,
  },
  target: {
    calories: 2200,
    protein: 180,
    carbs: 250,
    fat: 70,
  },
};

const nutritionWeekSummary = [
  {
    date: '2026-03-02',
    calories: 1900,
    caloriesTarget: 2200,
    protein: 160,
    proteinTarget: 180,
    mealCount: 3,
    completeness: 0.88,
  },
  {
    date: '2026-03-03',
    calories: 0,
    caloriesTarget: 2200,
    protein: 0,
    proteinTarget: 180,
    mealCount: 0,
    completeness: 0,
  },
  {
    date: '2026-03-04',
    calories: 2200,
    caloriesTarget: 2200,
    protein: 180,
    proteinTarget: 180,
    mealCount: 4,
    completeness: 1,
  },
  {
    date: '2026-03-05',
    calories: 2100,
    caloriesTarget: 2200,
    protein: 172,
    proteinTarget: 180,
    mealCount: 3,
    completeness: 0.95,
  },
  {
    date: '2026-03-06',
    calories: 2050,
    caloriesTarget: 2200,
    protein: 170,
    proteinTarget: 180,
    mealCount: 3,
    completeness: 0.93,
  },
  {
    date: '2026-03-07',
    calories: 1800,
    caloriesTarget: 2200,
    protein: 150,
    proteinTarget: 180,
    mealCount: 2,
    completeness: 0.83,
  },
  {
    date: '2026-03-08',
    calories: 1750,
    caloriesTarget: 2200,
    protein: 145,
    proteinTarget: 180,
    mealCount: 2,
    completeness: 0.8,
  },
];

describe('nutrition routes', () => {
  beforeEach(() => {
    vi.mocked(createMealForDate).mockReset();
    vi.mocked(deleteMealForDate).mockReset();
    vi.mocked(findMealForDate).mockReset();
    vi.mocked(findMealItemForDate).mockReset();
    vi.mocked(getDailyNutritionForDate).mockReset();
    vi.mocked(getDailyNutritionSummaryForDate).mockReset();
    vi.mocked(getNutritionWeekSummaryForDate).mockReset();
    vi.mocked(patchMealById).mockReset();
    vi.mocked(patchMealItemById).mockReset();
    vi.mocked(trackFoodUsage).mockReset();
    vi.mocked(trackFoodUsage).mockResolvedValue(undefined);
    process.env.JWT_SECRET = 'test-nutrition-routes-secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('creates a meal for a date and updates referenced food recency', async () => {
    vi.mocked(createMealForDate).mockResolvedValue({
      meal,
      items: mealItems,
    });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/nutrition/2026-03-09/meals',
        headers: createAuthorizationHeader(authToken),
        payload: {
          name: ' Lunch ',
          time: '12:30',
          items: [
            {
              foodId: 'food-1',
              name: ' Chicken Breast ',
              amount: 8,
              unit: ' oz ',
              calories: 374,
              protein: 70,
              carbs: 0,
              fat: 8,
              fiber: 0,
              sugar: 0,
            },
            {
              name: 'Olive Oil',
              amount: 1,
              unit: 'tbsp',
              calories: 120,
              protein: 0,
              carbs: 0,
              fat: 14,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        data: {
          meal,
          items: mealItems,
        },
      });
      expect(vi.mocked(createMealForDate)).toHaveBeenCalledWith('user-1', '2026-03-09', {
        name: 'Lunch',
        time: '12:30',
        items: [
          {
            foodId: 'food-1',
            name: 'Chicken Breast',
            amount: 8,
            unit: 'oz',
            calories: 374,
            protein: 70,
            carbs: 0,
            fat: 8,
            fiber: 0,
            sugar: 0,
          },
          {
            name: 'Olive Oil',
            amount: 1,
            unit: 'tbsp',
            calories: 120,
            protein: 0,
            carbs: 0,
            fat: 14,
          },
        ],
      });
      expect(vi.mocked(trackFoodUsage)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(trackFoodUsage)).toHaveBeenCalledWith('food-1', 'user-1');
    } finally {
      await app.close();
    }
  });

  it('does not fail meal creation when recency updates fail', async () => {
    vi.mocked(createMealForDate).mockResolvedValue({
      meal,
      items: mealItems,
    });
    vi.mocked(trackFoodUsage).mockRejectedValueOnce(new Error('transient update failure'));

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/nutrition/2026-03-09/meals',
        headers: createAuthorizationHeader(authToken),
        payload: {
          name: 'Lunch',
          items: [
            {
              foodId: 'food-1',
              name: 'Chicken Breast',
              amount: 8,
              unit: 'oz',
              calories: 374,
              protein: 70,
              carbs: 0,
              fat: 8,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        data: {
          meal,
          items: mealItems,
        },
      });
      expect(vi.mocked(trackFoodUsage)).toHaveBeenCalledWith('food-1', 'user-1');
    } finally {
      await app.close();
    }
  });

  it('gets nested daily nutrition data or null for missing logs', async () => {
    vi.mocked(getDailyNutritionForDate)
      .mockResolvedValueOnce({
        log: {
          id: 'log-1',
          userId: 'user-1',
          date: '2026-03-09',
          notes: null,
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
        },
        meals: [
          {
            meal,
            items: mealItems,
          },
        ],
      })
      .mockResolvedValueOnce(null);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const [foundResponse, emptyResponse] = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/v1/nutrition/2026-03-09',
          headers: createAuthorizationHeader(authToken),
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/nutrition/2026-03-10',
          headers: createAuthorizationHeader(authToken),
        }),
      ]);

      expect(foundResponse.statusCode).toBe(200);
      expect(foundResponse.json()).toEqual({
        data: {
          log: {
            id: 'log-1',
            userId: 'user-1',
            date: '2026-03-09',
            notes: null,
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_000_000,
          },
          meals: [
            {
              meal,
              items: mealItems,
            },
          ],
        },
      });
      expect(emptyResponse.statusCode).toBe(200);
      expect(emptyResponse.json()).toEqual({
        data: null,
      });
      expect(vi.mocked(getDailyNutritionForDate)).toHaveBeenNthCalledWith(
        1,
        'user-1',
        '2026-03-09',
      );
      expect(vi.mocked(getDailyNutritionForDate)).toHaveBeenNthCalledWith(
        2,
        'user-1',
        '2026-03-10',
      );
    } finally {
      await app.close();
    }
  });

  it('returns week summary data for the requested center date', async () => {
    vi.mocked(getNutritionWeekSummaryForDate).mockResolvedValueOnce(nutritionWeekSummary);
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/nutrition/week-summary?date=2026-03-06T12:00:00.000Z',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: nutritionWeekSummary,
      });
      expect(vi.mocked(getNutritionWeekSummaryForDate)).toHaveBeenCalledWith(
        'user-1',
        new Date('2026-03-06T12:00:00.000Z'),
      );
    } finally {
      await app.close();
    }
  });

  it('deletes an existing meal in user scope and returns not found otherwise', async () => {
    vi.mocked(deleteMealForDate).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: '/api/v1/nutrition/2026-03-09/meals/meal-1',
        headers: createAuthorizationHeader(authToken),
      });
      const missingResponse = await app.inject({
        method: 'DELETE',
        url: '/api/v1/nutrition/2026-03-09/meals/missing-meal',
        headers: createAuthorizationHeader(authToken),
      });

      expect(deleteResponse.statusCode).toBe(200);
      expect(deleteResponse.json()).toEqual({
        data: {
          success: true,
        },
      });
      expect(missingResponse.statusCode).toBe(404);
      expect(missingResponse.json()).toEqual({
        error: {
          code: 'MEAL_NOT_FOUND',
          message: 'Meal not found',
        },
      });
      expect(vi.mocked(deleteMealForDate)).toHaveBeenNthCalledWith(
        1,
        'user-1',
        '2026-03-09',
        'meal-1',
      );
      expect(vi.mocked(deleteMealForDate)).toHaveBeenNthCalledWith(
        2,
        'user-1',
        '2026-03-09',
        'missing-meal',
      );
    } finally {
      await app.close();
    }
  });

  it('patches meals with partial payloads and returns 404 for out-of-scope meals', async () => {
    vi.mocked(findMealForDate)
      .mockResolvedValueOnce(meal)
      .mockResolvedValueOnce(meal)
      .mockResolvedValueOnce(meal)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    vi.mocked(patchMealById).mockResolvedValue(patchedMeal);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });

      const patchNameResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-09/meals/meal-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          name: ' Updated Lunch ',
        },
      });
      const patchTimeResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-09/meals/meal-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          time: '13:15',
        },
      });
      const patchMultipleResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-09/meals/meal-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          notes: 'Updated note',
          name: 'Updated Lunch',
        },
      });

      const wrongDateResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-10/meals/meal-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          notes: 'wrong date scope',
        },
      });
      const wrongUserResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-09/meals/meal-1',
        headers: createAuthorizationHeader(app.jwt.sign({ userId: 'user-2' })),
        payload: {
          notes: 'wrong user scope',
        },
      });
      const missingResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-09/meals/meal-404',
        headers: createAuthorizationHeader(authToken),
        payload: {
          notes: 'missing meal id',
        },
      });

      expect(patchNameResponse.statusCode).toBe(200);
      expect(patchTimeResponse.statusCode).toBe(200);
      expect(patchMultipleResponse.statusCode).toBe(200);
      expect(patchNameResponse.json()).toEqual({
        data: patchedMeal,
      });
      expect(vi.mocked(findMealForDate)).toHaveBeenNthCalledWith(
        1,
        'user-1',
        '2026-03-09',
        'meal-1',
      );
      expect(vi.mocked(findMealForDate)).toHaveBeenNthCalledWith(
        2,
        'user-1',
        '2026-03-09',
        'meal-1',
      );
      expect(vi.mocked(findMealForDate)).toHaveBeenNthCalledWith(
        3,
        'user-1',
        '2026-03-09',
        'meal-1',
      );
      expect(vi.mocked(findMealForDate)).toHaveBeenNthCalledWith(
        4,
        'user-1',
        '2026-03-10',
        'meal-1',
      );
      expect(vi.mocked(findMealForDate)).toHaveBeenNthCalledWith(
        5,
        'user-2',
        '2026-03-09',
        'meal-1',
      );
      expect(vi.mocked(findMealForDate)).toHaveBeenNthCalledWith(
        6,
        'user-1',
        '2026-03-09',
        'meal-404',
      );

      expect(vi.mocked(patchMealById)).toHaveBeenNthCalledWith(1, 'user-1', 'meal-1', {
        name: 'Updated Lunch',
      });
      expect(vi.mocked(patchMealById)).toHaveBeenNthCalledWith(2, 'user-1', 'meal-1', {
        time: '13:15',
      });
      expect(vi.mocked(patchMealById)).toHaveBeenNthCalledWith(3, 'user-1', 'meal-1', {
        notes: 'Updated note',
        name: 'Updated Lunch',
      });

      expect(wrongDateResponse.statusCode).toBe(404);
      expect(wrongUserResponse.statusCode).toBe(404);
      expect(missingResponse.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('patches meal-item snapshots and returns 404 for out-of-scope items', async () => {
    vi.mocked(findMealItemForDate)
      .mockResolvedValueOnce(mealItems[0])
      .mockResolvedValueOnce(mealItems[0])
      .mockResolvedValueOnce(mealItems[0])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    vi.mocked(patchMealItemById).mockResolvedValue(patchedMealItem);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });

      const patchAmountResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-09/meals/meal-1/items/item-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          amount: 9,
        },
      });

      const patchMacrosResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-09/meals/meal-1/items/item-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          calories: 400,
          protein: 78,
          carbs: 1,
          fat: 9,
        },
      });

      const patchMultipleResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-09/meals/meal-1/items/item-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          amount: 9,
          calories: 420,
          protein: 78,
          carbs: 1,
          fat: 9,
          fiber: 1,
          sugar: 0,
        },
      });

      const wrongMealResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-09/meals/meal-2/items/item-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          amount: 8.5,
        },
      });
      const wrongUserResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-09/meals/meal-1/items/item-1',
        headers: createAuthorizationHeader(app.jwt.sign({ userId: 'user-2' })),
        payload: {
          amount: 8.5,
        },
      });
      const missingResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-09/meals/meal-1/items/item-404',
        headers: createAuthorizationHeader(authToken),
        payload: {
          amount: 8.5,
        },
      });

      expect(patchAmountResponse.statusCode).toBe(200);
      expect(patchMacrosResponse.statusCode).toBe(200);
      expect(patchMultipleResponse.statusCode).toBe(200);
      expect(patchMacrosResponse.json()).toEqual({
        data: patchedMealItem,
      });
      expect(vi.mocked(findMealItemForDate)).toHaveBeenNthCalledWith(
        1,
        'user-1',
        '2026-03-09',
        'meal-1',
        'item-1',
      );
      expect(vi.mocked(findMealItemForDate)).toHaveBeenNthCalledWith(
        2,
        'user-1',
        '2026-03-09',
        'meal-1',
        'item-1',
      );
      expect(vi.mocked(findMealItemForDate)).toHaveBeenNthCalledWith(
        3,
        'user-1',
        '2026-03-09',
        'meal-1',
        'item-1',
      );
      expect(vi.mocked(findMealItemForDate)).toHaveBeenNthCalledWith(
        4,
        'user-1',
        '2026-03-09',
        'meal-2',
        'item-1',
      );
      expect(vi.mocked(findMealItemForDate)).toHaveBeenNthCalledWith(
        5,
        'user-2',
        '2026-03-09',
        'meal-1',
        'item-1',
      );
      expect(vi.mocked(findMealItemForDate)).toHaveBeenNthCalledWith(
        6,
        'user-1',
        '2026-03-09',
        'meal-1',
        'item-404',
      );

      expect(vi.mocked(patchMealItemById)).toHaveBeenNthCalledWith(
        1,
        'user-1',
        'meal-1',
        'item-1',
        {
          amount: 9,
        },
      );
      expect(vi.mocked(patchMealItemById)).toHaveBeenNthCalledWith(
        2,
        'user-1',
        'meal-1',
        'item-1',
        {
          calories: 400,
          protein: 78,
          carbs: 1,
          fat: 9,
        },
      );
      expect(vi.mocked(patchMealItemById)).toHaveBeenNthCalledWith(
        3,
        'user-1',
        'meal-1',
        'item-1',
        {
          amount: 9,
          calories: 420,
          protein: 78,
          carbs: 1,
          fat: 9,
          fiber: 1,
          sugar: 0,
        },
      );

      expect(wrongMealResponse.statusCode).toBe(404);
      expect(wrongUserResponse.statusCode).toBe(404);
      expect(missingResponse.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('gets a daily nutrition summary with actuals, target, and meal count', async () => {
    vi.mocked(getDailyNutritionSummaryForDate)
      .mockResolvedValueOnce(nutritionSummary)
      .mockResolvedValueOnce({
        date: '2026-03-10',
        meals: 0,
        actual: {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        },
        target: null,
      });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });

      const [foundResponse, emptyResponse] = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/v1/nutrition/2026-03-09/summary',
          headers: createAuthorizationHeader(authToken),
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/nutrition/2026-03-10/summary',
          headers: createAuthorizationHeader(authToken),
        }),
      ]);

      expect(foundResponse.statusCode).toBe(200);
      expect(foundResponse.json()).toEqual({
        data: nutritionSummary,
      });
      expect(emptyResponse.statusCode).toBe(200);
      expect(emptyResponse.json()).toEqual({
        data: {
          date: '2026-03-10',
          meals: 0,
          actual: {
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
          },
          target: null,
        },
      });
      expect(vi.mocked(getDailyNutritionSummaryForDate)).toHaveBeenNthCalledWith(
        1,
        'user-1',
        '2026-03-09',
      );
      expect(vi.mocked(getDailyNutritionSummaryForDate)).toHaveBeenNthCalledWith(
        2,
        'user-1',
        '2026-03-10',
      );
    } finally {
      await app.close();
    }
  });

  it('validates date and meal payloads', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const [
        invalidDateResponse,
        invalidCalendarDateResponse,
        invalidSummaryDateResponse,
        invalidWeekDateResponse,
        invalidPayloadResponse,
        invalidDeleteParamsResponse,
        invalidPatchMealPayloadResponse,
        invalidPatchMealItemParamsResponse,
      ] = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/v1/nutrition/03-09-2026',
          headers: createAuthorizationHeader(authToken),
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/nutrition/2026-02-30',
          headers: createAuthorizationHeader(authToken),
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/nutrition/03-09-2026/summary',
          headers: createAuthorizationHeader(authToken),
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/nutrition/week-summary?date=invalid',
          headers: createAuthorizationHeader(authToken),
        }),
        app.inject({
          method: 'POST',
          url: '/api/v1/nutrition/2026-03-09/meals',
          headers: createAuthorizationHeader(authToken),
          payload: {
            name: 'Lunch',
            time: '7:30',
            items: [],
          },
        }),
        app.inject({
          method: 'DELETE',
          url: '/api/v1/nutrition/2026-03-09/meals/%20%20',
          headers: createAuthorizationHeader(authToken),
        }),
        app.inject({
          method: 'PATCH',
          url: '/api/v1/nutrition/2026-03-09/meals/meal-1',
          headers: createAuthorizationHeader(authToken),
          payload: {},
        }),
        app.inject({
          method: 'PATCH',
          url: '/api/v1/nutrition/2026-03-09/meals/meal-1/items/%20%20',
          headers: createAuthorizationHeader(authToken),
          payload: { amount: 1 },
        }),
      ]);

      expect(invalidDateResponse.statusCode).toBe(400);
      expect(invalidDateResponse.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid nutrition date',
        },
      });
      expect(invalidCalendarDateResponse.statusCode).toBe(400);
      expect(invalidCalendarDateResponse.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid nutrition date',
        },
      });
      expect(invalidSummaryDateResponse.statusCode).toBe(400);
      expect(invalidSummaryDateResponse.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid nutrition date',
        },
      });
      expect(invalidWeekDateResponse.statusCode).toBe(400);
      expect(invalidWeekDateResponse.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid nutrition week date',
        },
      });

      expect(invalidPayloadResponse.statusCode).toBe(400);
      expect(invalidPayloadResponse.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid meal payload',
        },
      });

      expect(invalidDeleteParamsResponse.statusCode).toBe(400);
      expect(invalidDeleteParamsResponse.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid meal parameters',
        },
      });

      expect(invalidPatchMealPayloadResponse.statusCode).toBe(400);
      expect(invalidPatchMealPayloadResponse.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid meal payload',
        },
      });

      expect(invalidPatchMealItemParamsResponse.statusCode).toBe(400);
      expect(invalidPatchMealItemParamsResponse.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid meal item parameters',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('requires auth for nutrition endpoints', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const responses = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/v1/nutrition/2026-03-09/meals',
          payload: {
            name: 'Lunch',
            items: [
              {
                name: 'Chicken Breast',
                amount: 8,
                unit: 'oz',
                calories: 374,
                protein: 70,
                carbs: 0,
                fat: 8,
              },
            ],
          },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/nutrition/2026-03-09',
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/nutrition/2026-03-09/summary',
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/nutrition/week-summary?date=2026-03-09T00:00:00.000Z',
        }),
        app.inject({
          method: 'DELETE',
          url: '/api/v1/nutrition/2026-03-09/meals/meal-1',
        }),
        app.inject({
          method: 'PATCH',
          url: '/api/v1/nutrition/2026-03-09/meals/meal-1',
          payload: { name: 'Lunch 2' },
        }),
        app.inject({
          method: 'PATCH',
          url: '/api/v1/nutrition/2026-03-09/meals/meal-1/items/item-1',
          payload: { amount: 2 },
        }),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }
    } finally {
      await app.close();
    }
  });
});
