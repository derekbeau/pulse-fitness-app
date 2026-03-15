import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import {
  findAgentTokenByHash,
  findUserAuthById,
  updateAgentTokenLastUsedAt,
} from '../../middleware/store.js';
import { createFood, findFoodByName } from '../foods/store.js';
import {
  createMealForDate,
  findMealById,
  findMealItemById,
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
  findFoodByName: vi.fn(),
}));

vi.mock('../nutrition/store.js', async () => {
  const actual =
    await vi.importActual<typeof import('../nutrition/store.js')>('../nutrition/store.js');
  return {
    ...actual,
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

describe('meal routes', () => {
  beforeEach(() => {
    vi.mocked(findAgentTokenByHash).mockReset();
    vi.mocked(findUserAuthById).mockReset();
    vi.mocked(updateAgentTokenLastUsedAt).mockReset();
    vi.mocked(createFood).mockReset();
    vi.mocked(findFoodByName).mockReset();
    vi.mocked(createMealForDate).mockReset();
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
            calories: 300,
            protein: 40,
            carbs: 0,
            fat: 10,
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
      expect(response.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid meal payload',
        },
      });
      expect(vi.mocked(createMealForDate)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('creates an agent meal via AgentToken with food resolution and auto-create', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-1',
    });
    vi.mocked(findFoodByName)
      .mockResolvedValueOnce({
        id: 'food-1',
        name: 'Chicken Breast',
        brand: null,
        servingSize: 'serving',
        calories: 200,
        protein: 35,
        carbs: 0,
        fat: 5,
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
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
        summary: 'Chicken Breast, Rice Bowl',
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
          name: 'Chicken Breast',
          amount: 1,
          unit: 'serving',
          displayQuantity: null,
          displayUnit: null,
          calories: 200,
          protein: 35,
          carbs: 0,
          fat: 5,
          fiber: null,
          sugar: null,
          createdAt: 1,
        },
        {
          id: 'item-2',
          mealId: 'meal-1',
          foodId: 'food-2',
          name: 'Rice Bowl',
          amount: 1,
          unit: 'bowl',
          displayQuantity: null,
          displayUnit: null,
          calories: 400,
          protein: 10,
          carbs: 70,
          fat: 8,
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
        url: '/api/v1/meals',
        headers: createAuthorizationHeader('plain-agent-token', 'AgentToken'),
        payload: {
          date: '2026-03-09',
          name: 'Lunch',
          time: '12:30',
          items: [
            { foodName: 'Chicken Breast', quantity: 1, unit: 'serving' },
            {
              foodName: 'Rice Bowl',
              quantity: 1,
              unit: 'bowl',
              calories: 400,
              protein: 10,
              carbs: 70,
              fat: 8,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        data: {
          meal: expect.objectContaining({
            id: 'meal-1',
            name: 'Lunch',
            date: '2026-03-09',
          }),
          macros: {
            calories: 600,
            protein: 45,
            carbs: 70,
            fat: 13,
          },
          items: [
            expect.objectContaining({ id: 'item-1', foodId: 'food-1' }),
            expect.objectContaining({ id: 'item-2', foodId: 'food-2' }),
          ],
        },
        agent: {
          hints: [
            'Lunch adds 600 kcal, 45g protein, 70g carbs, and 13g fat.',
            'Use the day nutrition summary to judge what macros remain before the next meal.',
          ],
          suggestedActions: [
            'Log the next meal or snack when it happens.',
            "Review today's nutrition summary if you need remaining macro targets.",
          ],
          relatedState: {
            date: '2026-03-09',
            mealName: 'Lunch',
            itemCount: 2,
            mealMacros: {
              calories: 600,
              protein: 45,
              carbs: 70,
              fat: 13,
            },
          },
        },
      });
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
      expect(vi.mocked(findFoodByName)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(updateAgentTokenLastUsedAt)).toHaveBeenCalledWith('agent-token-1');
    } finally {
      await app.close();
    }
  });
});
