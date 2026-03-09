import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { updateFoodLastUsedAt } from '../foods/store.js';

import {
  createMealForDate,
  deleteMealForDate,
  getDailyNutritionForDate,
  getDailyNutritionSummaryForDate,
} from './store.js';

vi.mock('./store.js', () => ({
  createMealForDate: vi.fn(),
  deleteMealForDate: vi.fn(),
  getDailyNutritionForDate: vi.fn(),
  getDailyNutritionSummaryForDate: vi.fn(),
}));

vi.mock('../foods/store.js', () => ({
  updateFoodLastUsedAt: vi.fn(),
}));

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

const meal = {
  id: 'meal-1',
  nutritionLogId: 'log-1',
  name: 'Lunch',
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
    createdAt: 1_700_000_000_002,
  },
];

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

describe('nutrition routes', () => {
  beforeEach(() => {
    vi.mocked(createMealForDate).mockReset();
    vi.mocked(deleteMealForDate).mockReset();
    vi.mocked(getDailyNutritionForDate).mockReset();
    vi.mocked(getDailyNutritionSummaryForDate).mockReset();
    vi.mocked(updateFoodLastUsedAt).mockReset();
    vi.mocked(updateFoodLastUsedAt).mockResolvedValue(undefined);
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
      expect(vi.mocked(updateFoodLastUsedAt)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(updateFoodLastUsedAt)).toHaveBeenCalledWith('food-1', 'user-1');
    } finally {
      await app.close();
    }
  });

  it('does not fail meal creation when recency updates fail', async () => {
    vi.mocked(createMealForDate).mockResolvedValue({
      meal,
      items: mealItems,
    });
    vi.mocked(updateFoodLastUsedAt).mockRejectedValueOnce(new Error('transient update failure'));

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
      expect(vi.mocked(updateFoodLastUsedAt)).toHaveBeenCalledWith('food-1', 'user-1');
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
        invalidPayloadResponse,
        invalidDeleteParamsResponse,
      ] =
        await Promise.all([
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
          method: 'DELETE',
          url: '/api/v1/nutrition/2026-03-09/meals/meal-1',
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
