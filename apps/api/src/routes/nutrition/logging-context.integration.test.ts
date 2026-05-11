import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  agentTokens,
  foods,
  habitEntries,
  habits,
  mealItems,
  meals,
  nutritionLogs,
  nutritionTargets,
  users,
} from '../../db/schema/index.js';

type DatabaseModule = typeof import('../../db/index.js');

type TestContext = {
  app: FastifyInstance;
  db: DatabaseModule['db'];
  sqlite: DatabaseModule['sqlite'];
  tempDir: string;
};

let context: TestContext;

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

const createAgentTokenHeader = (token: string) => ({
  authorization: `AgentToken ${token}`,
});

const seedUser = (id: string, username: string, preferences?: Record<string, unknown>) =>
  context.db
    .insert(users)
    .values({
      id,
      username,
      name: username,
      passwordHash: 'not-used-in-this-suite',
      preferences,
    })
    .run();

const seedAgentToken = (userId: string, token = 'plain-agent-token') => {
  context.db
    .insert(agentTokens)
    .values({
      id: `agent-token-${userId}`,
      userId,
      name: `Agent ${userId}`,
      tokenHash: createHash('sha256').update(token).digest('hex'),
    })
    .run();

  return token;
};

const seedFood = (values: {
  id: string;
  userId: string;
  name: string;
  brand?: string | null;
  servingSize?: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  usageCount?: number;
  lastUsedAt?: number | null;
  tags?: string[];
}) =>
  context.db
    .insert(foods)
    .values({
      id: values.id,
      userId: values.userId,
      name: values.name,
      brand: values.brand ?? null,
      servingSize: values.servingSize ?? null,
      servingGrams: null,
      calories: values.calories,
      protein: values.protein,
      carbs: values.carbs,
      fat: values.fat,
      fiber: null,
      sugar: null,
      verified: true,
      source: null,
      notes: null,
      usageCount: values.usageCount ?? 0,
      lastUsedAt: values.lastUsedAt ?? null,
      tags: values.tags ?? [],
    })
    .run();

const seedNutritionLog = (id: string, userId: string, date: string, createdAt: number) =>
  context.db
    .insert(nutritionLogs)
    .values({
      id,
      userId,
      date,
      createdAt,
      updatedAt: createdAt,
    })
    .run();

const seedMeal = (values: {
  id: string;
  nutritionLogId: string;
  name: string;
  time?: string | null;
  createdAt: number;
}) =>
  context.db
    .insert(meals)
    .values({
      id: values.id,
      nutritionLogId: values.nutritionLogId,
      name: values.name,
      summary: null,
      time: values.time ?? null,
      notes: null,
      createdAt: values.createdAt,
      updatedAt: values.createdAt,
    })
    .run();

const seedMealItem = (values: {
  id: string;
  mealId: string;
  foodId?: string | null;
  name: string;
  amount: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  createdAt: number;
}) =>
  context.db
    .insert(mealItems)
    .values({
      id: values.id,
      mealId: values.mealId,
      foodId: values.foodId ?? null,
      name: values.name,
      amount: values.amount,
      unit: values.unit,
      displayQuantity: null,
      displayUnit: null,
      calories: values.calories,
      protein: values.protein,
      carbs: values.carbs,
      fat: values.fat,
      fiber: null,
      sugar: null,
      createdAt: values.createdAt,
    })
    .run();

const seedLoggingContextData = () => {
  seedFood({
    id: 'food-jam',
    userId: 'user-1',
    name: 'TJ Organic Reduced Sugar Raspberry Preserves',
    brand: "Trader Joe's",
    servingSize: '1 Tbsp (18g)',
    calories: 25,
    protein: 0,
    carbs: 7,
    fat: 0,
    usageCount: 4,
    lastUsedAt: 1_710_000_000_000,
    tags: ['spread'],
  });
  seedFood({
    id: 'food-orgain',
    userId: 'user-1',
    name: 'Orgain Chocolate Protein Powder',
    servingSize: '2 scoops',
    calories: 150,
    protein: 21,
    carbs: 15,
    fat: 4,
    usageCount: 12,
    lastUsedAt: 1_710_000_001_000,
  });
  seedFood({
    id: 'food-pea',
    userId: 'user-1',
    name: "Anthony's Premium Pea Protein",
    servingSize: '1 Tbsp',
    calories: 35,
    protein: 8,
    carbs: 1,
    fat: 0,
    usageCount: 6,
    lastUsedAt: 1_710_000_002_000,
  });
  seedFood({
    id: 'food-other-user',
    userId: 'user-2',
    name: 'TJ Organic Reduced Sugar Raspberry Preserves',
    calories: 25,
    protein: 0,
    carbs: 7,
    fat: 0,
    usageCount: 99,
  });

  context.db
    .insert(nutritionTargets)
    .values({
      id: 'target-1',
      userId: 'user-1',
      calories: 2350,
      protein: 180,
      carbs: 240,
      fat: 75,
      effectiveDate: '2026-03-01',
    })
    .run();

  seedNutritionLog('log-today', 'user-1', '2026-03-09', 1_710_000_010_000);
  seedNutritionLog('log-yesterday', 'user-1', '2026-03-08', 1_710_000_000_000);
  seedMeal({
    id: 'meal-today',
    nutritionLogId: 'log-today',
    name: 'Breakfast',
    time: '08:00',
    createdAt: 1_710_000_011_000,
  });
  seedMeal({
    id: 'meal-yesterday',
    nutritionLogId: 'log-yesterday',
    name: 'Breakfast',
    time: '07:45',
    createdAt: 1_710_000_001_000,
  });
  seedMealItem({
    id: 'item-orgain',
    mealId: 'meal-today',
    foodId: 'food-orgain',
    name: 'Orgain Chocolate Protein Powder',
    amount: 0.5,
    unit: 'serving',
    calories: 75,
    protein: 10.5,
    carbs: 7.5,
    fat: 2,
    createdAt: 1_710_000_012_000,
  });
  seedMealItem({
    id: 'item-jam',
    mealId: 'meal-yesterday',
    foodId: 'food-jam',
    name: 'TJ Organic Reduced Sugar Raspberry Preserves',
    amount: 1,
    unit: 'Tbsp',
    calories: 25,
    protein: 0,
    carbs: 7,
    fat: 0,
    createdAt: 1_710_000_002_000,
  });

  context.db
    .insert(habits)
    .values({
      id: 'habit-water',
      userId: 'user-1',
      name: 'Water',
      trackingType: 'numeric',
      target: 8,
      unit: 'glasses',
      frequency: 'daily',
      sortOrder: 0,
      active: true,
    })
    .run();
  context.db
    .insert(habitEntries)
    .values({
      id: 'entry-water',
      habitId: 'habit-water',
      userId: 'user-1',
      date: '2026-03-09',
      completed: false,
      value: 5,
      isOverride: false,
    })
    .run();
};

describe('nutrition logging context integration', () => {
  beforeAll(async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-nutrition-context-'));

    process.env.JWT_SECRET = 'test-nutrition-context-secret';
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    vi.resetModules();

    const [{ buildServer }, dbModule] = await Promise.all([
      import('../../index.js'),
      import('../../db/index.js'),
    ]);

    migrate(dbModule.db, {
      migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
    });

    const app = buildServer();
    await app.ready();

    context = {
      app,
      db: dbModule.db,
      sqlite: dbModule.sqlite,
      tempDir,
    };
  });

  afterAll(async () => {
    if (context) {
      await context.app.close();
      context.sqlite.close();
      rmSync(context.tempDir, { recursive: true, force: true });
    }

    delete process.env.JWT_SECRET;
    delete process.env.DATABASE_URL;
    vi.resetModules();
  });

  beforeEach(() => {
    context.db.delete(habitEntries).run();
    context.db.delete(habits).run();
    context.db.delete(mealItems).run();
    context.db.delete(meals).run();
    context.db.delete(nutritionLogs).run();
    context.db.delete(nutritionTargets).run();
    context.db.delete(agentTokens).run();
    context.db.delete(foods).run();
    context.db.delete(users).run();

    seedUser('user-1', 'derek');
    seedUser('user-2', 'alex');
    seedLoggingContextData();
  });

  it('returns synonym-ranked matches, recent meal items, frequent foods, and water state', async () => {
    const token = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/nutrition/logging-context?date=2026-03-09&q=tj%20jam&days=2&limitFoods=5&limitRecentItems=5',
      headers: createAuthorizationHeader(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      data: {
        query: { variants: string[] };
        today: { summary: { actual: { calories: number }; target: { calories: number } | null } };
        recentMealItems: Array<{ date: string; item: { id: string; name: string } }>;
        savedFoodMatches: Array<{
          food: { id: string; userId: string };
          score: number;
          reason: string;
          matchedVariant: string | null;
        }>;
        frequentFoods: Array<{ food: { id: string } }>;
        waterHabit: { habitId: string; value: number | null; completed: boolean } | null;
      };
    };

    expect(body.data.query.variants).toEqual(
      expect.arrayContaining(['tj jam', 'Trader Joe', "Trader Joe's", 'preserves', 'raspberry']),
    );
    expect(body.data.savedFoodMatches[0]).toMatchObject({
      food: {
        id: 'food-jam',
        userId: 'user-1',
      },
      matchedVariant: expect.stringMatching(/preserves|Trader Joe/),
    });
    expect(body.data.savedFoodMatches[0]?.score).toBeGreaterThanOrEqual(0.74);
    expect(body.data.savedFoodMatches.map((match) => match.food.id)).not.toContain(
      'food-other-user',
    );
    expect(body.data.recentMealItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: '2026-03-08',
          item: expect.objectContaining({
            id: 'item-jam',
            name: 'TJ Organic Reduced Sugar Raspberry Preserves',
          }),
        }),
      ]),
    );
    expect(body.data.recentMealItems.map((recentItem) => recentItem.item.id)).not.toContain(
      'item-orgain',
    );
    expect(body.data.frequentFoods.map((match) => match.food.id)).toEqual(
      expect.arrayContaining(['food-orgain', 'food-pea']),
    );
    expect(body.data.today.summary.actual.calories).toBe(75);
    expect(body.data.today.summary.target?.calories).toBe(2350);
    expect(body.data.waterHabit).toMatchObject({
      habitId: 'habit-water',
      value: 5,
      completed: false,
    });
  });

  it('returns the standard shake shorthand and supports AgentToken auth', async () => {
    const agentToken = seedAgentToken('user-1');

    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/nutrition/logging-context?date=2026-03-09&q=standard%20shake',
      headers: createAgentTokenHeader(agentToken),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      data: {
        savedFoodMatches: Array<{ food: { id: string } }>;
        shorthandExpansions: Array<{
          phrase: string;
          items: Array<{ foodName: string; quantity: number; displayUnit: string | null }>;
        }>;
      };
    };

    expect(body.data.savedFoodMatches.map((match) => match.food.id)).toEqual(
      expect.arrayContaining(['food-orgain', 'food-pea']),
    );
    expect(body.data.shorthandExpansions).toEqual([
      expect.objectContaining({
        phrase: 'standard shake',
        items: expect.arrayContaining([
          expect.objectContaining({
            foodName: 'Orgain Chocolate Protein Powder',
            quantity: 0.5,
            displayUnit: 'scoop',
          }),
          expect.objectContaining({
            foodName: "Anthony's Premium Pea Protein",
            quantity: 1.9,
            displayUnit: 'Tbsp',
          }),
        ]),
      }),
    ]);
  });

  it('defaults omitted date from the user timezone preference', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-10T02:00:00.000Z'));

    context.db.delete(habitEntries).run();
    context.db.delete(habits).run();
    context.db.delete(mealItems).run();
    context.db.delete(meals).run();
    context.db.delete(nutritionLogs).run();
    context.db.delete(nutritionTargets).run();
    context.db.delete(agentTokens).run();
    context.db.delete(foods).run();
    context.db.delete(users).run();

    seedUser('user-1', 'derek', { timeZone: 'America/Detroit' });
    seedUser('user-2', 'alex');
    seedLoggingContextData();

    try {
      const token = context.app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '7d' },
      );

      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/nutrition/logging-context?q=tj%20jam',
        headers: createAuthorizationHeader(token),
      });

      expect(response.statusCode).toBe(200);
      expect((response.json() as { data: { date: string } }).data.date).toBe('2026-03-09');
    } finally {
      vi.useRealTimers();
    }
  });
});
