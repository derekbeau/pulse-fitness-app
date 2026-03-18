import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import {
  findAgentTokenByHash,
  findUserAuthById,
  updateAgentTokenLastUsedAt,
} from '../../middleware/store.js';
import { createFood, findFoodById, findFoodByName } from '../foods/store.js';
import {
  addItemsToMeal,
  createMealForDate,
  findMealById,
  findMealItemById,
  MealFoodOwnershipError,
  patchMealById,
  patchMealItemById,
} from '../nutrition/store.js';

vi.mock('../../middleware/store.js', () => ({
  findAgentTokenByHash: vi.fn(),
  findUserAuthById: vi.fn(),
  updateAgentTokenLastUsedAt: vi.fn(),
}));

vi.mock('../foods/store.js', () => ({
  createFood: vi.fn(),
  findFoodById: vi.fn(),
  findFoodByName: vi.fn(),
}));

vi.mock('../nutrition/store.js', async () => {
  const actual =
    await vi.importActual<typeof import('../nutrition/store.js')>('../nutrition/store.js');
  return {
    ...actual,
    addItemsToMeal: vi.fn(),
    createMealForDate: vi.fn(),
    findMealById: vi.fn(),
    findMealItemById: vi.fn(),
    patchMealById: vi.fn(),
    patchMealItemById: vi.fn(),
  };
});

const createAuthorizationHeader = (token: string, scheme: 'Bearer' | 'AgentToken' = 'Bearer') => ({
  authorization: `${scheme} ${token}`,
});

const expectValidationError = (
  body: unknown,
  expectation: {
    url: string;
    instancePath: string;
  },
) => {
  expect(body).toMatchObject({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: {
        method: 'POST',
        url: expectation.url,
        issues: expect.arrayContaining([
          expect.objectContaining({
            instancePath: expectation.instancePath,
            message: expect.any(String),
          }),
        ]),
      },
    },
  });
};

describe('meal routes', () => {
  beforeEach(() => {
    vi.mocked(findAgentTokenByHash).mockReset();
    vi.mocked(findUserAuthById).mockReset();
    vi.mocked(updateAgentTokenLastUsedAt).mockReset();
    vi.mocked(createFood).mockReset();
    vi.mocked(findFoodById).mockReset();
    vi.mocked(findFoodByName).mockReset();
    vi.mocked(createMealForDate).mockReset();
    vi.mocked(addItemsToMeal).mockReset();
    vi.mocked(findMealById).mockReset();
    vi.mocked(findMealItemById).mockReset();
    vi.mocked(patchMealById).mockReset();
    vi.mocked(patchMealItemById).mockReset();
    vi.mocked(updateAgentTokenLastUsedAt).mockResolvedValue(undefined);
    process.env.JWT_SECRET = 'test-meal-routes-secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('creates a standard meal via JWT at /api/v1/meals', async () => {
    vi.mocked(createMealForDate).mockResolvedValue({
      meal: {
        id: 'meal-1',
        nutritionLogId: 'log-1',
        name: 'Lunch',
        summary: 'Chicken',
        time: '12:30',
        notes: null,
        createdAt: 1,
        updatedAt: 1,
      },
      items: [
        {
          id: 'item-1',
          mealId: 'meal-1',
          foodId: 'food-1',
          name: 'Chicken',
          amount: 1,
          unit: 'serving',
          displayQuantity: null,
          displayUnit: null,
          calories: 300,
          protein: 40,
          carbs: 0,
          fat: 10,
          fiber: null,
          sugar: null,
          createdAt: 1,
        },
      ],
    });

    const app = buildServer();

    try {
      await app.ready();
      const token = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meals',
        headers: createAuthorizationHeader(token),
        payload: {
          date: '2026-03-09',
          name: 'Lunch',
          items: [
            {
              foodId: 'food-1',
              name: 'Chicken',
              amount: 1,
              unit: 'serving',
              calories: 300,
              protein: 40,
              carbs: 0,
              fat: 10,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        data: {
          meal: expect.objectContaining({ id: 'meal-1', name: 'Lunch' }),
          items: [expect.objectContaining({ id: 'item-1', foodId: 'food-1' })],
        },
      });
      expect(vi.mocked(createMealForDate)).toHaveBeenCalledWith('user-1', '2026-03-09', {
        name: 'Lunch',
        summary: undefined,
        time: undefined,
        notes: undefined,
        items: [
          {
            foodId: 'food-1',
            name: 'Chicken',
            amount: 1,
            unit: 'serving',
            displayQuantity: undefined,
            displayUnit: undefined,
            calories: 300,
            protein: 40,
            carbs: 0,
            fat: 10,
            fiber: undefined,
            sugar: undefined,
          },
        ],
      });
    } finally {
      await app.close();
    }
  });

  it('rejects impossible calendar dates via shared schema validation', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const token = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meals',
        headers: createAuthorizationHeader(token),
        payload: {
          date: '2026-02-30',
          name: 'Lunch',
          items: [
            {
              foodId: 'food-1',
              name: 'Chicken',
              amount: 1,
              unit: 'serving',
              calories: 300,
              protein: 40,
              carbs: 0,
              fat: 10,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      expectValidationError(response.json(), {
        url: '/api/v1/meals',
        instancePath: '/date',
      });
      expect(vi.mocked(createMealForDate)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('returns UNRESOLVED_FOODS when a referenced foodId cannot be loaded', async () => {
    vi.mocked(findFoodById).mockResolvedValue(undefined);

    const app = buildServer();

    try {
      await app.ready();
      const token = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meals',
        headers: createAuthorizationHeader(token),
        payload: {
          date: '2026-03-09',
          name: 'Lunch',
          items: [
            {
              foodId: 'food-404',
              name: 'Chicken breast (grilled)',
              amount: 1,
              unit: 'serving',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({
        error: {
          code: 'UNRESOLVED_FOODS',
          message: 'Could not find foods: Chicken breast (grilled)',
        },
      });
      expect(vi.mocked(createMealForDate)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('returns INVALID_MEAL_ITEMS when creating a meal references foods outside user scope', async () => {
    vi.mocked(createMealForDate).mockRejectedValue(new MealFoodOwnershipError());

    const app = buildServer();

    try {
      await app.ready();
      const token = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meals',
        headers: createAuthorizationHeader(token),
        payload: {
          date: '2026-03-09',
          name: 'Lunch',
          items: [
            {
              foodId: 'foreign-food-id',
              name: 'Chicken',
              amount: 1,
              unit: 'serving',
              calories: 300,
              protein: 40,
              carbs: 0,
              fat: 10,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({
        error: {
          code: 'INVALID_MEAL_ITEMS',
          message: 'One or more meal items reference unavailable foods',
        },
      });
      expect(vi.mocked(createMealForDate)).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it('preserves explicit item names when resolving macros from foodId', async () => {
    vi.mocked(findFoodById).mockResolvedValue({
      id: 'food-1',
      userId: 'user-1',
      name: 'Chicken Breast',
      brand: null,
      servingSize: 'serving',
      servingGrams: null,
      calories: 120,
      protein: 25,
      carbs: 0,
      fat: 2,
      fiber: null,
      sugar: null,
      verified: false,
      source: null,
      notes: null,
      usageCount: 0,
      tags: [],
      lastUsedAt: null,
      createdAt: 1,
      updatedAt: 1,
    });
    vi.mocked(createMealForDate).mockResolvedValue({
      meal: {
        id: 'meal-1',
        nutritionLogId: 'log-1',
        name: 'Lunch',
        summary: null,
        time: null,
        notes: null,
        createdAt: 1,
        updatedAt: 1,
      },
      items: [
        {
          id: 'item-1',
          mealId: 'meal-1',
          foodId: 'food-1',
          name: 'Chicken breast (grilled)',
          amount: 1,
          unit: 'serving',
          displayQuantity: null,
          displayUnit: null,
          calories: 120,
          protein: 25,
          carbs: 0,
          fat: 2,
          fiber: null,
          sugar: null,
          createdAt: 1,
        },
      ],
    });

    const app = buildServer();

    try {
      await app.ready();
      const token = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meals',
        headers: createAuthorizationHeader(token),
        payload: {
          date: '2026-03-09',
          name: 'Lunch',
          items: [
            {
              foodId: 'food-1',
              name: 'Chicken breast (grilled)',
              amount: 1,
              unit: 'serving',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      expect(vi.mocked(createMealForDate)).toHaveBeenCalledWith('user-1', '2026-03-09', {
        name: 'Lunch',
        summary: undefined,
        time: undefined,
        notes: undefined,
        items: [
          expect.objectContaining({
            foodId: 'food-1',
            name: 'Chicken breast (grilled)',
            amount: 1,
            calories: 120,
            protein: 25,
            carbs: 0,
            fat: 2,
          }),
        ],
      });
    } finally {
      await app.close();
    }
  });

  it('creates an agent meal via foodName resolution and appends enrichment', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-1',
    });
    vi.mocked(findFoodByName).mockResolvedValue({
      id: 'food-1',
      name: 'Chicken Breast',
      brand: null,
      servingSize: 'serving',
      calories: 120,
      protein: 25,
      carbs: 0,
      fat: 2,
    });
    vi.mocked(createMealForDate).mockResolvedValue({
      meal: {
        id: 'meal-1',
        nutritionLogId: 'log-1',
        name: 'Lunch',
        summary: null,
        time: null,
        notes: null,
        createdAt: 1,
        updatedAt: 1,
      },
      items: [
        {
          id: 'item-1',
          mealId: 'meal-1',
          foodId: 'food-1',
          name: 'Chicken Breast',
          amount: 2,
          unit: 'serving',
          displayQuantity: null,
          displayUnit: null,
          calories: 240,
          protein: 50,
          carbs: 0,
          fat: 4,
          fiber: null,
          sugar: null,
          createdAt: 1,
        },
      ],
    });

    const app = buildServer();

    try {
      await app.ready();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meals',
        headers: createAuthorizationHeader('plain-agent-token', 'AgentToken'),
        payload: {
          date: '2026-03-09',
          name: 'Lunch',
          items: [{ foodName: 'Chicken Breast', quantity: 2 }],
        },
      });

      expect(response.statusCode).toBe(201);
      expect(vi.mocked(createMealForDate)).toHaveBeenCalledWith('user-1', '2026-03-09', {
        name: 'Lunch',
        summary: 'Chicken Breast',
        time: undefined,
        notes: undefined,
        items: [
          expect.objectContaining({
            foodId: 'food-1',
            name: 'Chicken Breast',
            amount: 2,
            unit: 'serving',
            calories: 240,
            protein: 50,
            carbs: 0,
            fat: 4,
          }),
        ],
      });
      expect(response.json()).toMatchObject({
        data: {
          meal: {
            id: 'meal-1',
            name: 'Lunch',
          },
          items: [
            {
              id: 'item-1',
              foodId: 'food-1',
            },
          ],
        },
        agent: {
          hints: expect.any(Array),
          suggestedActions: expect.any(Array),
          relatedState: expect.objectContaining({
            date: '2026-03-09',
            mealName: 'Lunch',
            itemCount: 1,
          }),
        },
      });
      expect(vi.mocked(updateAgentTokenLastUsedAt)).toHaveBeenCalledWith('agent-token-1');
    } finally {
      await app.close();
    }
  });

  it('creates ad-hoc meal items without saving foods', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-1',
    });
    vi.mocked(createMealForDate).mockResolvedValue({
      meal: {
        id: 'meal-1',
        nutritionLogId: 'log-1',
        name: 'Dinner',
        summary: null,
        time: null,
        notes: null,
        createdAt: 1,
        updatedAt: 1,
      },
      items: [
        {
          id: 'item-1',
          mealId: 'meal-1',
          foodId: null,
          name: 'Homemade Chili',
          amount: 2,
          unit: 'bowl',
          displayQuantity: null,
          displayUnit: null,
          calories: 400,
          protein: 20,
          carbs: 30,
          fat: 12,
          fiber: null,
          sugar: null,
          createdAt: 1,
        },
      ],
    });

    const app = buildServer();

    try {
      await app.ready();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meals',
        headers: createAuthorizationHeader('plain-agent-token', 'AgentToken'),
        payload: {
          date: '2026-03-09',
          name: 'Dinner',
          items: [
            {
              foodName: 'Homemade Chili',
              quantity: 2,
              unit: 'bowl',
              adhoc: true,
              calories: 400,
              protein: 20,
              carbs: 30,
              fat: 12,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      expect(vi.mocked(createFood)).not.toHaveBeenCalled();
      expect(vi.mocked(findFoodByName)).not.toHaveBeenCalled();
      expect(vi.mocked(createMealForDate)).toHaveBeenCalledWith('user-1', '2026-03-09', {
        name: 'Dinner',
        summary: 'Homemade Chili',
        time: undefined,
        notes: undefined,
        items: [
          expect.objectContaining({
            foodId: null,
            name: 'Homemade Chili',
            amount: 2,
            calories: 400,
            protein: 20,
            carbs: 30,
            fat: 12,
          }),
        ],
      });
    } finally {
      await app.close();
    }
  });

  it('creates and links foods when saveToFoods is requested', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-1',
    });
    vi.mocked(findFoodByName).mockResolvedValueOnce(undefined);
    vi.mocked(createFood).mockResolvedValue({
      id: 'food-2',
      userId: 'user-1',
      name: 'Rice Bowl',
      brand: null,
      servingSize: 'bowl',
      servingGrams: null,
      calories: 400,
      protein: 10,
      carbs: 70,
      fat: 8,
      fiber: null,
      sugar: null,
      verified: false,
      source: null,
      notes: null,
      usageCount: 0,
      tags: [],
      lastUsedAt: null,
      createdAt: 1,
      updatedAt: 1,
    });
    vi.mocked(createMealForDate).mockResolvedValue({
      meal: {
        id: 'meal-1',
        nutritionLogId: 'log-1',
        name: 'Lunch',
        summary: null,
        time: null,
        notes: null,
        createdAt: 1,
        updatedAt: 1,
      },
      items: [
        {
          id: 'item-1',
          mealId: 'meal-1',
          foodId: 'food-2',
          name: 'Rice Bowl',
          amount: 2,
          unit: 'bowl',
          displayQuantity: null,
          displayUnit: null,
          calories: 800,
          protein: 20,
          carbs: 140,
          fat: 16,
          fiber: null,
          sugar: null,
          createdAt: 1,
        },
      ],
    });

    const app = buildServer();

    try {
      await app.ready();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meals',
        headers: createAuthorizationHeader('plain-agent-token', 'AgentToken'),
        payload: {
          date: '2026-03-09',
          name: 'Lunch',
          items: [
            {
              foodName: 'Rice Bowl',
              quantity: 2,
              unit: 'bowl',
              saveToFoods: true,
              calories: 400,
              protein: 10,
              carbs: 70,
              fat: 8,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      expect(vi.mocked(createFood)).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          name: 'Rice Bowl',
          servingSize: 'bowl',
          calories: 400,
          protein: 10,
          carbs: 70,
          fat: 8,
        }),
      );
      expect(vi.mocked(createMealForDate)).toHaveBeenCalledWith('user-1', '2026-03-09', {
        name: 'Lunch',
        summary: 'Rice Bowl',
        time: undefined,
        notes: undefined,
        items: [
          expect.objectContaining({
            foodId: 'food-2',
            name: 'Rice Bowl',
            amount: 2,
            calories: 800,
            protein: 20,
            carbs: 140,
            fat: 16,
          }),
        ],
      });
    } finally {
      await app.close();
    }
  });

  it('adds a single item to an existing meal via JWT', async () => {
    vi.mocked(addItemsToMeal).mockResolvedValue({
      meal: {
        id: 'meal-1',
        nutritionLogId: 'log-1',
        name: 'Lunch',
        summary: 'Chicken, Rice',
        time: '12:30',
        notes: null,
        createdAt: 1,
        updatedAt: 2,
      },
      items: [
        {
          id: 'item-1',
          mealId: 'meal-1',
          foodId: 'food-1',
          name: 'Chicken',
          amount: 1,
          unit: 'serving',
          displayQuantity: null,
          displayUnit: null,
          calories: 300,
          protein: 40,
          carbs: 0,
          fat: 10,
          fiber: null,
          sugar: null,
          createdAt: 1,
        },
        {
          id: 'item-2',
          mealId: 'meal-1',
          foodId: null,
          name: 'Olive Oil',
          amount: 1,
          unit: 'tbsp',
          displayQuantity: null,
          displayUnit: null,
          calories: 120,
          protein: 0,
          carbs: 0,
          fat: 14,
          fiber: null,
          sugar: null,
          createdAt: 2,
        },
      ],
    });

    const app = buildServer();

    try {
      await app.ready();
      const token = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meals/meal-1/items',
        headers: createAuthorizationHeader(token),
        payload: {
          items: [
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

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          meal: expect.objectContaining({ id: 'meal-1', updatedAt: 2 }),
          items: expect.arrayContaining([
            expect.objectContaining({ id: 'item-2', name: 'Olive Oil' }),
          ]),
        },
      });
      expect(vi.mocked(addItemsToMeal)).toHaveBeenCalledWith('user-1', 'meal-1', [
        {
          foodId: null,
          name: 'Olive Oil',
          amount: 1,
          unit: 'tbsp',
          displayQuantity: undefined,
          displayUnit: undefined,
          calories: 120,
          protein: 0,
          carbs: 0,
          fat: 14,
          fiber: undefined,
          sugar: undefined,
        },
      ]);
    } finally {
      await app.close();
    }
  });

  it('adds multiple items for agent callers and returns enrichment', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-1',
    });
    vi.mocked(findFoodByName).mockResolvedValue({
      id: 'food-1',
      name: 'Chicken Breast',
      brand: null,
      servingSize: 'serving',
      calories: 120,
      protein: 25,
      carbs: 0,
      fat: 2,
    });
    vi.mocked(addItemsToMeal).mockResolvedValue({
      meal: {
        id: 'meal-1',
        nutritionLogId: 'log-1',
        name: 'Lunch',
        summary: 'Chicken, Rice',
        time: '12:30',
        notes: null,
        createdAt: 1,
        updatedAt: 2,
      },
      items: [
        {
          id: 'item-0',
          mealId: 'meal-1',
          foodId: null,
          name: 'Apple',
          amount: 1,
          unit: 'medium',
          displayQuantity: null,
          displayUnit: null,
          calories: 95,
          protein: 0.5,
          carbs: 25,
          fat: 0.3,
          fiber: null,
          sugar: null,
          createdAt: 0,
        },
        {
          id: 'item-1',
          mealId: 'meal-1',
          foodId: 'food-1',
          name: 'Chicken Breast',
          amount: 1,
          unit: 'serving',
          displayQuantity: null,
          displayUnit: null,
          calories: 120,
          protein: 25,
          carbs: 0,
          fat: 2,
          fiber: null,
          sugar: null,
          createdAt: 1,
        },
        {
          id: 'item-2',
          mealId: 'meal-1',
          foodId: null,
          name: 'Rice Bowl',
          amount: 1,
          unit: 'bowl',
          displayQuantity: null,
          displayUnit: null,
          calories: 300,
          protein: 6,
          carbs: 60,
          fat: 2,
          fiber: null,
          sugar: null,
          createdAt: 2,
        },
      ],
    });

    const app = buildServer();

    try {
      await app.ready();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meals/meal-1/items',
        headers: createAuthorizationHeader('plain-agent-token', 'AgentToken'),
        payload: {
          items: [
            {
              foodName: 'Chicken Breast',
              quantity: 1,
            },
            {
              foodName: 'Rice Bowl',
              quantity: 1,
              unit: 'bowl',
              adhoc: true,
              calories: 300,
              protein: 6,
              carbs: 60,
              fat: 2,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.meal).toMatchObject({
        id: 'meal-1',
        name: 'Lunch',
      });
      expect(body.data.items).toContainEqual(expect.objectContaining({ id: 'item-0', foodId: null }));
      expect(body.data.items).toContainEqual(
        expect.objectContaining({ id: 'item-1', foodId: 'food-1' }),
      );
      expect(body.data.items).toContainEqual(expect.objectContaining({ id: 'item-2', foodId: null }));
      expect(body.agent).toEqual(
        expect.objectContaining({
          hints: expect.any(Array),
          suggestedActions: expect.any(Array),
          relatedState: expect.objectContaining({
            mealName: 'Lunch',
            itemCount: 2,
          }),
        }),
      );
      expect(body.agent.relatedState.mealMacros.calories).toBe(515);
      expect(body.agent.relatedState.mealMacros.protein).toBe(31.5);
      expect(body.agent.relatedState.mealMacros.carbs).toBe(85);
      expect(body.agent.relatedState.mealMacros.fat).toBeCloseTo(4.3, 5);
      expect(vi.mocked(addItemsToMeal)).toHaveBeenCalledWith('user-1', 'meal-1', [
        expect.objectContaining({
          foodId: 'food-1',
          name: 'Chicken Breast',
          amount: 1,
          calories: 120,
          protein: 25,
          carbs: 0,
          fat: 2,
        }),
        expect.objectContaining({
          foodId: null,
          name: 'Rice Bowl',
          amount: 1,
          unit: 'bowl',
          calories: 300,
          protein: 6,
          carbs: 60,
          fat: 2,
        }),
      ]);
      expect(vi.mocked(updateAgentTokenLastUsedAt)).toHaveBeenCalledWith('agent-token-1');
    } finally {
      await app.close();
    }
  });

  it('returns UNRESOLVED_FOODS when appended items cannot be resolved', async () => {
    vi.mocked(findFoodById).mockResolvedValue(undefined);

    const app = buildServer();

    try {
      await app.ready();
      const token = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meals/meal-1/items',
        headers: createAuthorizationHeader(token),
        payload: {
          items: [
            {
              foodId: 'food-404',
              name: 'Chicken breast (grilled)',
              amount: 1,
              unit: 'serving',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({
        error: {
          code: 'UNRESOLVED_FOODS',
          message: 'Could not find foods: Chicken breast (grilled)',
        },
      });
      expect(vi.mocked(addItemsToMeal)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('returns INVALID_MEAL_ITEMS when appended items reference foods outside user scope', async () => {
    vi.mocked(addItemsToMeal).mockRejectedValue(new MealFoodOwnershipError());

    const app = buildServer();

    try {
      await app.ready();
      const token = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meals/meal-1/items',
        headers: createAuthorizationHeader(token),
        payload: {
          items: [
            {
              foodId: 'foreign-food-id',
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

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({
        error: {
          code: 'INVALID_MEAL_ITEMS',
          message: 'One or more meal items reference unavailable foods',
        },
      });
      expect(vi.mocked(addItemsToMeal)).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it('returns 404 when appending items to a missing meal', async () => {
    vi.mocked(addItemsToMeal).mockResolvedValue(undefined);

    const app = buildServer();

    try {
      await app.ready();
      const token = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meals/missing-meal/items',
        headers: createAuthorizationHeader(token),
        payload: {
          items: [
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

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          code: 'MEAL_NOT_FOUND',
          message: 'Meal not found',
        },
      });
      expect(vi.mocked(addItemsToMeal)).toHaveBeenCalledWith(
        'user-1',
        'missing-meal',
        expect.any(Array),
      );
    } finally {
      await app.close();
    }
  });

  it('returns 404 when appending items to a meal owned by a different user', async () => {
    vi.mocked(addItemsToMeal).mockResolvedValue(undefined);

    const app = buildServer();

    try {
      await app.ready();
      const token = app.jwt.sign(
        { sub: 'user-2', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meals/meal-1/items',
        headers: createAuthorizationHeader(token),
        payload: {
          items: [
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

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          code: 'MEAL_NOT_FOUND',
          message: 'Meal not found',
        },
      });
      expect(vi.mocked(addItemsToMeal)).toHaveBeenCalledWith('user-2', 'meal-1', expect.any(Array));
    } finally {
      await app.close();
    }
  });

  it('patches meal summary for both JWT and AgentToken callers', async () => {
    const existingMeal = {
      id: 'meal-1',
      nutritionLogId: 'log-1',
      name: 'Lunch',
      summary: 'Chicken and rice',
      time: '12:30',
      notes: null,
      createdAt: 1,
      updatedAt: 1,
    };
    const updatedMeal = {
      ...existingMeal,
      summary: 'Applesauce Pancakes + Eggs',
      updatedAt: 2,
    };

    vi.mocked(findMealById).mockResolvedValue(existingMeal);
    vi.mocked(patchMealById).mockResolvedValue(updatedMeal);
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-1',
    });

    const app = buildServer();

    try {
      await app.ready();
      const jwt = app.jwt.sign({ sub: 'user-1', type: 'session', iss: 'pulse-api' }, { expiresIn: '7d' });

      const jwtResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/meals/meal-1',
        headers: createAuthorizationHeader(jwt),
        payload: {
          summary: '  Applesauce Pancakes + Eggs  ',
        },
      });

      const agentResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/meals/meal-1',
        headers: createAuthorizationHeader('plain-agent-token', 'AgentToken'),
        payload: {
          summary: '  Applesauce Pancakes + Eggs  ',
        },
      });

      expect(jwtResponse.statusCode).toBe(200);
      expect(agentResponse.statusCode).toBe(200);
      expect(jwtResponse.json()).toEqual({
        data: updatedMeal,
      });
      expect(agentResponse.json()).toMatchObject({
        data: updatedMeal,
        agent: expect.objectContaining({
          hints: expect.any(Array),
          suggestedActions: expect.any(Array),
        }),
      });
      expect(vi.mocked(patchMealById)).toHaveBeenNthCalledWith(1, 'user-1', 'meal-1', {
        summary: 'Applesauce Pancakes + Eggs',
      });
      expect(vi.mocked(patchMealById)).toHaveBeenNthCalledWith(2, 'user-1', 'meal-1', {
        summary: 'Applesauce Pancakes + Eggs',
      });
      expect(vi.mocked(patchMealById)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(findMealById)).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
  });
});
