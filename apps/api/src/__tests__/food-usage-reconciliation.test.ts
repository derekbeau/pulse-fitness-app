import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentTokens, foods, mealItems, meals, nutritionLogs, users } from '../db/schema/index.js';

type DatabaseModule = typeof import('../db/index.js');

type TestContext = {
  app: FastifyInstance;
  db: DatabaseModule['db'];
  sqlite: DatabaseModule['sqlite'];
  tempDir: string;
};

let context: TestContext;

const createAuthorizationHeader = (token: string, scheme: 'Bearer' | 'AgentToken' = 'Bearer') => ({
  authorization: `${scheme} ${token}`,
});

const seedUser = (id: string, username: string) =>
  context.db
    .insert(users)
    .values({
      id,
      username,
      name: username,
      passwordHash: 'not-used-in-this-suite',
    })
    .run();

const seedFood = (values: {
  id: string;
  userId: string;
  usageCount?: number;
  lastUsedAt?: number | null;
}) =>
  context.db
    .insert(foods)
    .values({
      id: values.id,
      userId: values.userId,
      name: values.id,
      calories: 100,
      protein: 10,
      carbs: 10,
      fat: 5,
      verified: true,
      usageCount: values.usageCount ?? 0,
      lastUsedAt: values.lastUsedAt ?? null,
      tags: [],
    })
    .run();

const seedMeal = (values: { id: string; userId: string; date: string }) => {
  const logId = `log-${values.userId}-${values.date}`;

  context.db
    .insert(nutritionLogs)
    .values({
      id: logId,
      userId: values.userId,
      date: values.date,
    })
    .onConflictDoNothing({
      target: [nutritionLogs.userId, nutritionLogs.date],
    })
    .run();

  context.db
    .insert(meals)
    .values({
      id: values.id,
      nutritionLogId: logId,
      name: values.id,
    })
    .run();
};

const seedMealItem = (values: {
  id: string;
  mealId: string;
  foodId: string | null;
  createdAt: number;
}) =>
  context.db
    .insert(mealItems)
    .values({
      id: values.id,
      mealId: values.mealId,
      foodId: values.foodId,
      name: values.id,
      amount: 1,
      unit: 'serving',
      calories: 100,
      protein: 10,
      carbs: 10,
      fat: 5,
      createdAt: values.createdAt,
    })
    .run();

const getFoodUsage = (foodId: string) =>
  context.db
    .select({
      usageCount: foods.usageCount,
      lastUsedAt: foods.lastUsedAt,
    })
    .from(foods)
    .where(eq(foods.id, foodId))
    .limit(1)
    .get();

describe('food usage reconciliation endpoint', () => {
  beforeAll(async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-food-usage-reconcile-'));

    process.env.JWT_SECRET = 'test-food-usage-reconcile-secret';
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    vi.resetModules();

    const [{ buildServer }, dbModule] = await Promise.all([
      import('../index.js'),
      import('../db/index.js'),
    ]);

    migrate(dbModule.db, {
      migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
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
    context.db.delete(mealItems).run();
    context.db.delete(meals).run();
    context.db.delete(nutritionLogs).run();
    context.db.delete(agentTokens).run();
    context.db.delete(foods).run();
    context.db.delete(users).run();

    seedUser('user-1', 'derek');
    seedUser('user-2', 'alex');
  });

  it('recomputes usage counts and lastUsedAt from meal item references', async () => {
    seedFood({ id: 'food-a', userId: 'user-1', usageCount: 7, lastUsedAt: 111 });
    seedFood({ id: 'food-b', userId: 'user-1', usageCount: 0, lastUsedAt: null });

    seedMeal({ id: 'meal-1', userId: 'user-1', date: '2026-03-18' });
    seedMeal({ id: 'meal-2', userId: 'user-1', date: '2026-03-19' });

    seedMealItem({
      id: 'meal-item-1',
      mealId: 'meal-1',
      foodId: 'food-a',
      createdAt: 1_800_000_001_000,
    });
    seedMealItem({
      id: 'meal-item-2',
      mealId: 'meal-1',
      foodId: 'food-b',
      createdAt: 1_800_000_002_000,
    });
    seedMealItem({
      id: 'meal-item-3',
      mealId: 'meal-2',
      foodId: 'food-a',
      createdAt: 1_800_000_003_000,
    });

    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/admin/reconcile-food-usage',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        reconciled: 2,
        updated: 2,
      },
    });

    expect(getFoodUsage('food-a')).toEqual({
      usageCount: 2,
      lastUsedAt: 1_800_000_003_000,
    });
    expect(getFoodUsage('food-b')).toEqual({
      usageCount: 1,
      lastUsedAt: 1_800_000_002_000,
    });
  });

  it('corrects stale usageCount values to the true meal item count', async () => {
    seedFood({ id: 'food-stale', userId: 'user-1', usageCount: 99, lastUsedAt: 123 });
    seedMeal({ id: 'meal-1', userId: 'user-1', date: '2026-03-20' });
    seedMealItem({
      id: 'meal-item-1',
      mealId: 'meal-1',
      foodId: 'food-stale',
      createdAt: 1_800_000_010_000,
    });

    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/admin/reconcile-food-usage',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        reconciled: 1,
        updated: 1,
      },
    });
    expect(getFoodUsage('food-stale')).toEqual({
      usageCount: 1,
      lastUsedAt: 1_800_000_010_000,
    });
  });

  it('sets usageCount to 0 and clears lastUsedAt for foods with no references', async () => {
    seedFood({ id: 'food-unused', userId: 'user-1', usageCount: 5, lastUsedAt: 1_800_000_020_000 });
    seedFood({ id: 'food-used', userId: 'user-1', usageCount: 1, lastUsedAt: 1_800_000_030_000 });
    seedMeal({ id: 'meal-1', userId: 'user-1', date: '2026-03-20' });
    seedMealItem({
      id: 'meal-item-1',
      mealId: 'meal-1',
      foodId: 'food-used',
      createdAt: 1_800_000_030_000,
    });

    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/admin/reconcile-food-usage',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        reconciled: 2,
        updated: 1,
      },
    });
    expect(getFoodUsage('food-unused')).toEqual({
      usageCount: 0,
      lastUsedAt: null,
    });
    expect(getFoodUsage('food-used')).toEqual({
      usageCount: 1,
      lastUsedAt: 1_800_000_030_000,
    });
  });

  it('rejects agent token callers because reconciliation is JWT-only', async () => {
    seedFood({ id: 'food-a', userId: 'user-1' });
    const token = 'plain-agent-token';
    context.db
      .insert(agentTokens)
      .values({
        id: 'agent-token-1',
        userId: 'user-1',
        name: 'maintenance',
        tokenHash: createHash('sha256').update(token).digest('hex'),
      })
      .run();

    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/admin/reconcile-food-usage',
      headers: createAuthorizationHeader(token, 'AgentToken'),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'JWT authentication required',
      },
    });
  });
});
