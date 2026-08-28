import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import {
  findAgentTokenByHash,
  findUserAuthById,
  updateAgentTokenLastUsedAt,
} from '../../middleware/store.js';
import { trackFoodUsage } from '../foods/store.js';
import { getDailyEnergyAdherenceForDate } from './daily-energy-store.js';

import {
  createMealForDate,
  deleteMealForDate,
  findMealForDate,
  findMealItemForDate,
  getDailyNutritionForDate,
  getDailyNutritionSummaryForDate,
  getNutritionLoggingContext,
  getNutritionWeekSummaryForDate,
  patchMealById,
  patchMealItemById,
} from './store.js';
import {
  FutureNutritionDateError,
  NutritionLogRequiredError,
  updateNutritionLogStatus,
} from './status-store.js';

vi.mock('./store.js', () => ({
  createMealForDate: vi.fn(),
  deleteMealForDate: vi.fn(),
  findMealForDate: vi.fn(),
  findMealItemForDate: vi.fn(),
  getDailyNutritionForDate: vi.fn(),
  getDailyNutritionSummaryForDate: vi.fn(),
  getNutritionLoggingContext: vi.fn(),
  getNutritionWeekSummaryForDate: vi.fn(),
  patchMealById: vi.fn(),
  patchMealItemById: vi.fn(),
}));

vi.mock('./daily-energy-store.js', () => ({
  getDailyEnergyAdherenceForDate: vi.fn(),
}));

vi.mock('./status-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./status-store.js')>();
  return {
    ...actual,
    updateNutritionLogStatus: vi.fn(),
  };
});

vi.mock('../foods/store.js', () => ({
  trackFoodUsage: vi.fn(),
}));

vi.mock('../../middleware/store.js', () => ({
  findAgentTokenByHash: vi.fn(),
  findUserAuthById: vi.fn(),
  updateAgentTokenLastUsedAt: vi.fn(),
}));

const createAuthorizationHeader = (token: string, scheme: 'Bearer' | 'AgentToken' = 'Bearer') => ({
  authorization: `${scheme} ${token}`,
});

const expectValidationError = (
  body: unknown,
  expectation: {
    method: 'DELETE' | 'GET' | 'PATCH' | 'POST';
    url: string;
    instancePath: string;
  },
) => {
  expect(body).toMatchObject({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: {
        method: expectation.method,
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
  proteinFloor: {
    actualProteinGrams: 70,
    proteinFloorGrams: 180,
    remainingToFloorGrams: 110,
    amountAboveFloorGrams: 0,
    state: 'below_floor' as const,
    isFinal: false,
  },
};

const loggingContext = {
  date: '2026-03-09',
  query: {
    q: 'tj jam',
    variants: [
      'tj jam',
      'tj',
      'Trader Joe',
      "Trader Joe's",
      'jam',
      'preserves',
      'jelly',
      'raspberry',
    ],
  },
  today: {
    nutrition: {
      log: {
        id: 'log-1',
        userId: 'user-1',
        date: '2026-03-09',
        notes: null,
        status: 'unknown' as const,
        statusUpdatedAt: null,
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
    summary: nutritionSummary,
  },
  recentMealItems: [
    {
      date: '2026-03-08',
      mealId: 'meal-previous',
      mealName: 'Breakfast',
      mealTime: '08:00',
      item: {
        ...mealItems[0],
        id: 'item-previous',
        mealId: 'meal-previous',
      },
    },
  ],
  savedFoodMatches: [
    {
      food: {
        id: 'food-jam',
        userId: 'user-1',
        name: 'TJ Organic Reduced Sugar Raspberry Preserves',
        brand: "Trader Joe's",
        servingSize: '1 Tbsp (18g)',
        servingGrams: 18,
        calories: 25,
        protein: 0,
        carbs: 7,
        fat: 0,
        fiber: null,
        sugar: null,
        verified: true,
        source: null,
        notes: null,
        usageCount: 4,
        tags: ['spread'],
        lastUsedAt: 1_700_000_000_000,
        createdAt: 1_699_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
      score: 0.86,
      reason: 'Matched synonym or alias "preserves".',
      matchedVariant: 'preserves',
    },
  ],
  frequentFoods: [],
  shorthandExpansions: [],
  waterHabit: {
    habitId: 'habit-water',
    name: 'Water',
    trackingType: 'numeric' as const,
    target: 8,
    unit: 'glasses',
    date: '2026-03-09',
    completed: false,
    value: 5,
    isOverride: false,
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
    vi.mocked(getNutritionLoggingContext).mockReset();
    vi.mocked(getNutritionWeekSummaryForDate).mockReset();
    vi.mocked(updateNutritionLogStatus).mockReset();
    vi.mocked(patchMealById).mockReset();
    vi.mocked(patchMealItemById).mockReset();
    vi.mocked(trackFoodUsage).mockReset();
    vi.mocked(findAgentTokenByHash).mockReset();
    vi.mocked(findUserAuthById).mockReset();
    vi.mocked(updateAgentTokenLastUsedAt).mockReset();
    vi.mocked(getDailyEnergyAdherenceForDate).mockReset();
    vi.mocked(trackFoodUsage).mockResolvedValue(undefined);
    vi.mocked(updateAgentTokenLastUsedAt).mockResolvedValue(undefined);
    process.env.JWT_SECRET = 'test-nutrition-routes-secret';
  });

  it('updates nutrition status for JWT and AgentToken callers', async () => {
    const unknownLog = {
      id: 'log-1',
      userId: 'user-1',
      date: '2026-03-09',
      notes: null,
      status: 'complete' as const,
      statusUpdatedAt: 1_700_000_200_000,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_200_000,
    };
    vi.mocked(updateNutritionLogStatus)
      .mockResolvedValueOnce(unknownLog)
      .mockResolvedValueOnce({ ...unknownLog, status: 'partial' });
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-1',
    });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const jwtResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-09/status',
        headers: createAuthorizationHeader(authToken),
        payload: { status: 'complete' },
      });
      const agentResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-09/status',
        headers: createAuthorizationHeader('plain-agent-token', 'AgentToken'),
        payload: { status: 'partial' },
      });

      expect(jwtResponse.statusCode).toBe(200);
      expect(jwtResponse.json()).toEqual({ data: unknownLog });
      expect(agentResponse.statusCode).toBe(200);
      expect(agentResponse.json().data.status).toBe('partial');
      expect(vi.mocked(updateNutritionLogStatus)).toHaveBeenNthCalledWith(
        1,
        'user-1',
        '2026-03-09',
        'complete',
      );
      expect(vi.mocked(updateNutritionLogStatus)).toHaveBeenNthCalledWith(
        2,
        'user-1',
        '2026-03-09',
        'partial',
      );
    } finally {
      await app.close();
    }
  });

  it('maps nutrition status domain errors and rejects invalid status values', async () => {
    vi.mocked(updateNutritionLogStatus)
      .mockRejectedValueOnce(new FutureNutritionDateError())
      .mockRejectedValueOnce(new NutritionLogRequiredError());

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const futureResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-10/status',
        headers: createAuthorizationHeader(authToken),
        payload: { status: 'complete' },
      });
      const missingResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-08/status',
        headers: createAuthorizationHeader(authToken),
        payload: { status: 'partial' },
      });
      const invalidResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-08/status',
        headers: createAuthorizationHeader(authToken),
        payload: { status: 'done' },
      });

      expect(futureResponse.statusCode).toBe(400);
      expect(futureResponse.json().error.code).toBe('FUTURE_NUTRITION_DATE');
      expect(missingResponse.statusCode).toBe(409);
      expect(missingResponse.json().error.code).toBe('NUTRITION_LOG_REQUIRED');
      expect(invalidResponse.statusCode).toBe(400);
      expect(vi.mocked(updateNutritionLogStatus)).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
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
      const authToken = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
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

  it('creates a meal with an updated daily summary when requested', async () => {
    vi.mocked(createMealForDate).mockResolvedValue({
      meal,
      items: mealItems,
    });
    vi.mocked(getDailyNutritionSummaryForDate).mockResolvedValue(nutritionSummary);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/nutrition/2026-03-09/meals',
        headers: createAuthorizationHeader(authToken),
        payload: {
          name: 'Lunch',
          returnSummary: true,
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
          summary: nutritionSummary,
        },
      });
      expect(vi.mocked(createMealForDate)).toHaveBeenCalledWith('user-1', '2026-03-09', {
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
      });
      expect(vi.mocked(getDailyNutritionSummaryForDate)).toHaveBeenCalledWith(
        'user-1',
        '2026-03-09',
      );
    } finally {
      await app.close();
    }
  });

  it('gets logging context for JWT and AgentToken callers', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-1',
    });
    vi.mocked(getNutritionLoggingContext).mockResolvedValue(loggingContext);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const [jwtResponse, agentResponse] = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/v1/nutrition/logging-context?date=2026-03-09&q=%20tj%20jam%20&days=7',
          headers: createAuthorizationHeader(authToken),
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/nutrition/logging-context?date=2026-03-09&q=tj%20jam',
          headers: createAuthorizationHeader('plain-agent-token', 'AgentToken'),
        }),
      ]);

      expect(jwtResponse.statusCode).toBe(200);
      expect(jwtResponse.headers['cache-control']).toBe('private, no-cache');
      expect(jwtResponse.json()).toEqual({
        data: loggingContext,
      });
      expect(agentResponse.statusCode).toBe(200);
      expect(agentResponse.json()).toEqual({
        data: loggingContext,
      });
      expect(vi.mocked(getNutritionLoggingContext)).toHaveBeenNthCalledWith(1, 'user-1', {
        date: '2026-03-09',
        q: 'tj jam',
        days: 7,
        limitFoods: 10,
        limitRecentItems: 50,
      });
      expect(vi.mocked(getNutritionLoggingContext)).toHaveBeenNthCalledWith(2, 'user-1', {
        date: '2026-03-09',
        q: 'tj jam',
        days: 7,
        limitFoods: 10,
        limitRecentItems: 50,
      });
      expect(vi.mocked(updateAgentTokenLastUsedAt)).toHaveBeenCalledWith('agent-token-1');
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
      const authToken = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
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
          status: 'unknown',
          statusUpdatedAt: null,
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
      const authToken = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
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
            status: 'unknown',
            statusUpdatedAt: null,
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
      const authToken = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
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
      const authToken = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );

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
      .mockResolvedValueOnce(meal)
      .mockResolvedValueOnce(meal)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    vi.mocked(patchMealById).mockResolvedValue(patchedMeal);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );

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
      const patchSummaryResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-09/meals/meal-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          summary: '  Applesauce Pancakes + Eggs  ',
        },
      });
      const clearSummaryResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-09/meals/meal-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          summary: null,
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
        headers: createAuthorizationHeader(
          app.jwt.sign({ sub: 'user-2', type: 'session', iss: 'pulse-api' }, { expiresIn: '7d' }),
        ),
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
      expect(patchSummaryResponse.statusCode).toBe(200);
      expect(clearSummaryResponse.statusCode).toBe(200);
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
        '2026-03-09',
        'meal-1',
      );
      expect(vi.mocked(findMealForDate)).toHaveBeenNthCalledWith(
        5,
        'user-1',
        '2026-03-09',
        'meal-1',
      );
      expect(vi.mocked(findMealForDate)).toHaveBeenNthCalledWith(
        6,
        'user-1',
        '2026-03-10',
        'meal-1',
      );
      expect(vi.mocked(findMealForDate)).toHaveBeenNthCalledWith(
        7,
        'user-2',
        '2026-03-09',
        'meal-1',
      );
      expect(vi.mocked(findMealForDate)).toHaveBeenNthCalledWith(
        8,
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
      expect(vi.mocked(patchMealById)).toHaveBeenNthCalledWith(4, 'user-1', 'meal-1', {
        summary: 'Applesauce Pancakes + Eggs',
      });
      expect(vi.mocked(patchMealById)).toHaveBeenNthCalledWith(5, 'user-1', 'meal-1', {
        summary: null,
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
      const authToken = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );

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
        headers: createAuthorizationHeader(
          app.jwt.sign({ sub: 'user-2', type: 'session', iss: 'pulse-api' }, { expiresIn: '7d' }),
        ),
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
        proteinFloor: {
          actualProteinGrams: null,
          proteinFloorGrams: null,
          remainingToFloorGrams: null,
          amountAboveFloorGrams: null,
          state: 'unavailable',
          isFinal: false,
        },
      });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );

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
          proteinFloor: {
            actualProteinGrams: null,
            proteinFloorGrams: null,
            remainingToFloorGrams: null,
            amountAboveFloorGrams: null,
            state: 'unavailable',
            isFinal: false,
          },
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

  it('returns the same daily summary schema for JWT and AgentToken callers', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-1',
    });
    vi.mocked(getDailyNutritionSummaryForDate).mockResolvedValue(nutritionSummary);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const [jwtResponse, agentResponse] = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/v1/nutrition/2026-03-09/summary',
          headers: createAuthorizationHeader(authToken),
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/nutrition/2026-03-09/summary',
          headers: createAuthorizationHeader('plain-agent-token', 'AgentToken'),
        }),
      ]);

      expect(jwtResponse.statusCode).toBe(200);
      expect(jwtResponse.json()).toEqual({
        data: nutritionSummary,
      });
      expect(agentResponse.statusCode).toBe(200);
      expect(agentResponse.json()).toMatchObject({
        data: nutritionSummary,
        agent: {
          hints: expect.arrayContaining([expect.any(String)]),
          suggestedActions: expect.arrayContaining([expect.any(String)]),
          relatedState: expect.objectContaining({
            date: '2026-03-09',
            meals: nutritionSummary.meals,
            actual: nutritionSummary.actual,
            target: nutritionSummary.target,
          }),
        },
      });
      expect(vi.mocked(getDailyNutritionForDate)).not.toHaveBeenCalled();
      expect(vi.mocked(updateAgentTokenLastUsedAt)).toHaveBeenCalledWith('agent-token-1');
    } finally {
      await app.close();
    }
  });

  it('returns identical accepted daily energy facts for JWT and AgentToken callers', async () => {
    const adherence = {
      localDate: '2026-03-09',
      timeZone: 'America/Detroit',
      todayLocalDate: '2026-03-10',
      completedDayCutoff: '2026-03-09',
      isHistorical: true,
      dataState: 'gradeable' as const,
      nutrition: {
        logId: 'log-1',
        status: 'complete' as const,
        intakeKcal: 2_100,
        actualProteinGrams: 170,
        mealCount: 3,
        itemCount: 8,
      },
      target: {
        targetEventId: 'target-event-1',
        targetId: 'target-1',
        effectiveDate: '2026-03-01',
        recordedAt: 1_772_380_800_000,
        caloriesKcal: 2_000,
        proteinFloorGrams: 180,
        source: 'adaptive' as const,
        adaptiveCheckInId: 'check-in-1',
      },
      proteinFloor: {
        actualProteinGrams: 170,
        proteinFloorGrams: 180,
        remainingToFloorGrams: 10,
        amountAboveFloorGrams: 0,
        state: 'below_floor' as const,
        isFinal: true,
      },
      expenditure: {
        caloriesKcal: 2_500,
        effectiveDate: '2026-03-01',
        source: 'accepted_check_in' as const,
        checkInId: 'check-in-1',
        inputFingerprint: 'a'.repeat(64),
      },
      intakeMinusTargetKcal: 100,
      intakeMinusExpenditureKcal: -400,
      innerToleranceKcal: 100,
      outerToleranceKcal: 250,
      adherence: 'on_target' as const,
      reasonCodes: [],
    };
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-1',
    });
    vi.mocked(getDailyEnergyAdherenceForDate).mockResolvedValue(adherence);
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const [jwtResponse, agentResponse] = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/v1/nutrition/2026-03-09/energy-adherence',
          headers: createAuthorizationHeader(authToken),
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/nutrition/2026-03-09/energy-adherence',
          headers: createAuthorizationHeader('plain-agent-token', 'AgentToken'),
        }),
      ]);

      expect(jwtResponse.statusCode).toBe(200);
      expect(agentResponse.statusCode).toBe(200);
      expect(jwtResponse.json()).toEqual(agentResponse.json());
      expect(jwtResponse.json()).toEqual({ data: adherence });
      expect(vi.mocked(getDailyEnergyAdherenceForDate)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(getDailyEnergyAdherenceForDate)).toHaveBeenNthCalledWith(
        1,
        'user-1',
        '2026-03-09',
      );
      expect(vi.mocked(getDailyEnergyAdherenceForDate)).toHaveBeenNthCalledWith(
        2,
        'user-1',
        '2026-03-09',
      );
      expect(vi.mocked(updateAgentTokenLastUsedAt)).toHaveBeenCalledWith('agent-token-1');
    } finally {
      await app.close();
    }
  });

  it('validates date and meal payloads', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );
      const [
        invalidDateResponse,
        invalidCalendarDateResponse,
        invalidSummaryDateResponse,
        invalidEnergyDateResponse,
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
          url: '/api/v1/nutrition/03-09-2026/energy-adherence',
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
      expectValidationError(invalidDateResponse.json(), {
        method: 'GET',
        url: '/api/v1/nutrition/03-09-2026',
        instancePath: '/date',
      });
      expect(invalidCalendarDateResponse.statusCode).toBe(400);
      expectValidationError(invalidCalendarDateResponse.json(), {
        method: 'GET',
        url: '/api/v1/nutrition/2026-02-30',
        instancePath: '/date',
      });
      expect(invalidSummaryDateResponse.statusCode).toBe(400);
      expectValidationError(invalidSummaryDateResponse.json(), {
        method: 'GET',
        url: '/api/v1/nutrition/03-09-2026/summary',
        instancePath: '/date',
      });
      expect(invalidEnergyDateResponse.statusCode).toBe(400);
      expectValidationError(invalidEnergyDateResponse.json(), {
        method: 'GET',
        url: '/api/v1/nutrition/03-09-2026/energy-adherence',
        instancePath: '/date',
      });
      expect(invalidWeekDateResponse.statusCode).toBe(400);
      expectValidationError(invalidWeekDateResponse.json(), {
        method: 'GET',
        url: '/api/v1/nutrition/week-summary?date=invalid',
        instancePath: '/date',
      });

      expect(invalidPayloadResponse.statusCode).toBe(400);
      expectValidationError(invalidPayloadResponse.json(), {
        method: 'POST',
        url: '/api/v1/nutrition/2026-03-09/meals',
        instancePath: '/time',
      });

      expect(invalidDeleteParamsResponse.statusCode).toBe(400);
      expectValidationError(invalidDeleteParamsResponse.json(), {
        method: 'DELETE',
        url: '/api/v1/nutrition/2026-03-09/meals/%20%20',
        instancePath: '/mealId',
      });

      expect(invalidPatchMealPayloadResponse.statusCode).toBe(400);
      expectValidationError(invalidPatchMealPayloadResponse.json(), {
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-09/meals/meal-1',
        instancePath: '/',
      });

      expect(invalidPatchMealItemParamsResponse.statusCode).toBe(400);
      expectValidationError(invalidPatchMealItemParamsResponse.json(), {
        method: 'PATCH',
        url: '/api/v1/nutrition/2026-03-09/meals/meal-1/items/%20%20',
        instancePath: '/itemId',
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
