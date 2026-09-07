import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  agentTokens,
  foods,
  mealItems,
  meals,
  nutritionLogs,
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
const required = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error('Missing expected fixture row');
  return value;
};

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

describe('food usage lifecycle integrity', () => {
  beforeAll(async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-food-usage-reconcile-'));

    process.env.JWT_SECRET = 'test-food-usage-reconcile-secret';
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
    context.db.delete(mealItems).run();
    context.db.delete(meals).run();
    context.db.delete(nutritionLogs).run();
    context.db.delete(agentTokens).run();
    context.db.delete(foods).run();
    context.db.delete(users).run();

    seedUser('user-1', 'fictional-alpha');
    seedUser('user-2', 'fictional-beta');
  });

  const inputItem = (foodId: string | null = '11111111-1111-4111-8111-111111111111') => ({
    foodId,
    name: 'Fictional food',
    amount: 1,
    unit: 'serving',
    calories: 100,
    protein: 10,
    carbs: 10,
    fat: 5,
  });
  const snapshot = () => context.sqlite.serialize();
  const assertInvariant = () => {
    const rows = context.sqlite
      .prepare(
        `SELECT f.id, f.usage_count, f.last_used_at,
      (SELECT COUNT(*) FROM meal_items i JOIN meals m ON m.id=i.meal_id JOIN nutrition_logs n ON n.id=m.nutrition_log_id WHERE i.food_id=f.id AND n.user_id=f.user_id) AS expected_count,
      (SELECT MAX(i.created_at) FROM meal_items i JOIN meals m ON m.id=i.meal_id JOIN nutrition_logs n ON n.id=m.nutrition_log_id WHERE i.food_id=f.id AND n.user_id=f.user_id) AS expected_time
      FROM foods f WHERE f.user_id='user-1' ORDER BY f.id`,
      )
      .all();
    for (const row of rows as {
      usage_count: number;
      last_used_at: number | null;
      expected_count: number;
      expected_time: number | null;
    }[]) {
      expect(row.usage_count).toBe(row.expected_count);
      expect(row.last_used_at).toBe(row.expected_time);
    }
    return rows;
  };
  const auth = () =>
    createAuthorizationHeader(
      context.app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '1h' },
      ),
    );
  const failUsage = () =>
    context.sqlite.exec(
      `CREATE TRIGGER fail_usage BEFORE UPDATE OF usage_count ON foods BEGIN SELECT RAISE(ABORT, 'injected usage failure'); END`,
    );
  const clearFailure = () => context.sqlite.exec('DROP TRIGGER IF EXISTS fail_usage');

  it.each(['preferred', 'date-scoped'])(
    'counts every linked row through %s JWT and AgentToken creation',
    async (route) => {
      seedFood({ id: '11111111-1111-4111-8111-111111111111', userId: 'user-1' });
      const token = 'fictional-agent-token';
      context.db
        .insert(agentTokens)
        .values({
          id: 'token-1',
          userId: 'user-1',
          name: 'fixture',
          tokenHash: createHash('sha256').update(token).digest('hex'),
        })
        .run();
      for (const headers of [auth(), createAuthorizationHeader(token, 'AgentToken')]) {
        for (const count of [1, 2]) {
          const response = await context.app.inject({
            method: 'POST',
            url: route === 'preferred' ? '/api/v1/meals' : '/api/v1/nutrition/2026-03-20/meals',
            headers,
            payload: {
              ...(route === 'preferred' ? { date: '2026-03-20' } : {}),
              name: 'Fixture meal',
              items: Array.from({ length: count }, () => inputItem()),
            },
          });
          expect(response.statusCode, response.body).toBe(201);
          assertInvariant();
        }
      }
      expect(getFoodUsage('11111111-1111-4111-8111-111111111111')?.usageCount).toBe(6);
    },
  );

  it('preserves exact links through append, metadata, all corrections, delete and retry', async () => {
    seedFood({ id: '11111111-1111-4111-8111-111111111111', userId: 'user-1' });
    seedFood({ id: '22222222-2222-4222-8222-222222222222', userId: 'user-1' });
    seedFood({ id: 'foreign', userId: 'user-2', usageCount: 77, lastUsedAt: 77 });
    const store = await import('./store.js');
    const created = await store.createMealForDate('user-1', '2026-03-20', {
      name: 'Fixture',
      items: [inputItem(), inputItem(), inputItem(null)],
    });
    assertInvariant();
    const beforeMetadata = getFoodUsage('11111111-1111-4111-8111-111111111111');
    await store.patchMealById('user-1', created.meal.id, { name: 'Renamed' });
    expect(getFoodUsage('11111111-1111-4111-8111-111111111111')).toEqual(beforeMetadata);
    const appended = await store.addItemsToMeal('user-1', created.meal.id, [
      inputItem(),
      inputItem('22222222-2222-4222-8222-222222222222'),
    ]);
    expect(appended?.items).toHaveLength(5);
    assertInvariant();
    const id = required(created.items[0]).id;
    for (const foodId of [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      null,
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
    ]) {
      await store.patchMealItemById('user-1', created.meal.id, id, { foodId });
      assertInvariant();
    }
    for (const foodId of ['foreign', 'missing']) {
      const before = snapshot();
      await expect(
        store.patchMealItemById('user-1', created.meal.id, id, { foodId }),
      ).rejects.toThrow();
      expect(snapshot()).toEqual(before);
    }
    const beforeForeign = snapshot();
    expect(await store.deleteMealForDate('user-2', '2026-03-20', created.meal.id)).toBe(false);
    expect(snapshot()).toEqual(beforeForeign);
    expect(await store.deleteMealForDate('user-1', '2026-03-20', created.meal.id)).toBe(true);
    expect(await store.deleteMealForDate('user-1', '2026-03-20', created.meal.id)).toBe(false);
    assertInvariant();
    expect(getFoodUsage('11111111-1111-4111-8111-111111111111')).toEqual({
      usageCount: 0,
      lastUsedAt: null,
    });
    expect(getFoodUsage('foreign')).toEqual({ usageCount: 77, lastUsedAt: 77 });
    expect(await store.addItemsToMeal('user-1', 'missing', [inputItem()])).toBeUndefined();
  });

  it('rolls back create, append, correction and delete when usage persistence fails', async () => {
    seedFood({ id: '11111111-1111-4111-8111-111111111111', userId: 'user-1' });
    seedFood({ id: '22222222-2222-4222-8222-222222222222', userId: 'user-1' });
    const store = await import('./store.js');
    const created = await store.createMealForDate('user-1', '2026-03-20', {
      name: 'Fixture',
      items: [inputItem()],
    });
    const operations = [
      () =>
        store.createMealForDate('user-1', '2026-03-21', { name: 'Failed', items: [inputItem()] }),
      () => store.addItemsToMeal('user-1', created.meal.id, [inputItem()]),
      () =>
        store.patchMealItemById('user-1', created.meal.id, required(created.items[0]).id, {
          foodId: '22222222-2222-4222-8222-222222222222',
        }),
      () => store.deleteMealForDate('user-1', '2026-03-20', created.meal.id),
    ];
    for (const operation of operations) {
      failUsage();
      const before = snapshot();
      try {
        await expect(operation()).rejects.toThrow('injected usage failure');
        expect(snapshot()).toEqual(before);
      } finally {
        clearFailure();
      }
      assertInvariant();
    }
  });

  it('derives merge from links despite stale counters, with atomic restore and ownership failures', async () => {
    seedFood({
      id: '11111111-1111-4111-8111-111111111111',
      userId: 'user-1',
      usageCount: 90,
      lastUsedAt: 99,
    });
    seedFood({
      id: '22222222-2222-4222-8222-222222222222',
      userId: 'user-1',
      usageCount: 80,
      lastUsedAt: 88,
    });
    seedFood({ id: 'foreign', userId: 'user-2', usageCount: 70, lastUsedAt: 77 });
    seedMeal({ id: 'meal-1', userId: 'user-1', date: '2026-03-20' });
    seedMealItem({
      id: 'item-1',
      mealId: 'meal-1',
      foodId: '22222222-2222-4222-8222-222222222222',
      createdAt: 123,
    });
    seedMealItem({
      id: 'item-2',
      mealId: 'meal-1',
      foodId: '22222222-2222-4222-8222-222222222222',
      createdAt: 456,
    });
    const { mergeFoods, deleteFood } = await import('../foods/store.js');
    const { restoreTrashItem } = await import('../trash/index.js');
    for (const operation of [
      () => mergeFoods('user-1', '11111111-1111-4111-8111-111111111111', 'foreign'),
      () =>
        mergeFoods(
          'user-2',
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
        ),
    ]) {
      const before = snapshot();
      await expect(operation()).rejects.toThrow();
      expect(snapshot()).toEqual(before);
    }
    failUsage();
    const before = snapshot();
    try {
      await expect(
        mergeFoods(
          'user-1',
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
        ),
      ).rejects.toThrow();
      expect(snapshot()).toEqual(before);
    } finally {
      clearFailure();
    }
    const merged = await mergeFoods(
      'user-1',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    );
    expect(merged).toMatchObject({ usageCount: 2, lastUsedAt: 456 });
    assertInvariant();
    expect(
      await restoreTrashItem({
        id: '22222222-2222-4222-8222-222222222222',
        type: 'foods',
        userId: 'user-1',
      }),
    ).toBe(true);
    expect(getFoodUsage('22222222-2222-4222-8222-222222222222')).toEqual({
      usageCount: 0,
      lastUsedAt: null,
    });
    await deleteFood('11111111-1111-4111-8111-111111111111', 'user-1');
    context.db
      .update(foods)
      .set({ usageCount: 99 })
      .where(eq(foods.id, '11111111-1111-4111-8111-111111111111'))
      .run();
    failUsage();
    const restoreBefore = snapshot();
    try {
      await expect(
        restoreTrashItem({
          id: '11111111-1111-4111-8111-111111111111',
          type: 'foods',
          userId: 'user-1',
        }),
      ).rejects.toThrow();
      expect(snapshot()).toEqual(restoreBefore);
    } finally {
      clearFailure();
    }
    expect(
      await restoreTrashItem({
        id: '11111111-1111-4111-8111-111111111111',
        type: 'foods',
        userId: 'user-2',
      }),
    ).toBe(false);
    expect(
      await restoreTrashItem({
        id: '11111111-1111-4111-8111-111111111111',
        type: 'foods',
        userId: 'user-1',
      }),
    ).toBe(true);
    assertInvariant();
    expect(getFoodUsage('foreign')).toEqual({ usageCount: 70, lastUsedAt: 77 });
  });

  it('serializes concurrent and retry-shaped creates, appends, corrections and deletes without lost projection', async () => {
    seedFood({ id: '11111111-1111-4111-8111-111111111111', userId: 'user-1' });
    seedFood({ id: '22222222-2222-4222-8222-222222222222', userId: 'user-1' });
    const store = await import('./store.js');
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        store.createMealForDate('user-1', '2026-03-20', {
          name: 'Retry fixture',
          items: [inputItem(), inputItem()],
        }),
      ),
    );
    expect(getFoodUsage('11111111-1111-4111-8111-111111111111')?.usageCount).toBe(16);
    assertInvariant();
    await Promise.all(
      Array.from({ length: 8 }, () =>
        store.addItemsToMeal('user-1', required(results[0]).meal.id, [inputItem()]),
      ),
    );
    expect(getFoodUsage('11111111-1111-4111-8111-111111111111')?.usageCount).toBe(24);
    assertInvariant();
    await Promise.all(
      Array.from({ length: 8 }, () =>
        store.patchMealItemById(
          'user-1',
          required(results[0]).meal.id,
          required(required(results[0]).items[0]).id,
          {
            foodId: '22222222-2222-4222-8222-222222222222',
          },
        ),
      ),
    );
    expect(getFoodUsage('22222222-2222-4222-8222-222222222222')?.usageCount).toBe(1);
    assertInvariant();
    const deleted = await Promise.all(
      Array.from({ length: 8 }, () =>
        store.deleteMealForDate('user-1', '2026-03-20', required(results[0]).meal.id),
      ),
    );
    expect(deleted.filter(Boolean)).toHaveLength(1);
    assertInvariant();
  });
  it('keeps trashed food exact through linked-item edits, deletes, reconciliation and restore', async () => {
    seedFood({ id: '11111111-1111-4111-8111-111111111111', userId: 'user-1' });
    seedFood({ id: '22222222-2222-4222-8222-222222222222', userId: 'user-1' });
    seedFood({ id: 'foreign', userId: 'user-2', usageCount: 77, lastUsedAt: 77 });
    const store = await import('./store.js');
    const { deleteFood } = await import('../foods/store.js');
    const { restoreTrashItem } = await import('../trash/index.js');
    const first = await store.createMealForDate('user-1', '2026-03-20', {
      name: 'First',
      items: [inputItem(), inputItem()],
    });
    const second = await store.createMealForDate('user-1', '2026-03-21', {
      name: 'Second',
      items: [inputItem()],
    });
    const links = context.sqlite.prepare('SELECT * FROM meal_items ORDER BY id').all();
    await deleteFood('11111111-1111-4111-8111-111111111111', 'user-1');
    expect(context.sqlite.prepare('SELECT * FROM meal_items ORDER BY id').all()).toEqual(links);
    assertInvariant();
    await store.patchMealItemById('user-1', first.meal.id, required(first.items[0]).id, {
      calories: 101,
    });
    assertInvariant();
    await store.patchMealItemById('user-1', first.meal.id, required(first.items[0]).id, {
      foodId: '22222222-2222-4222-8222-222222222222',
    });
    assertInvariant();
    await store.patchMealItemById('user-1', first.meal.id, required(first.items[1]).id, {
      foodId: null,
    });
    assertInvariant();
    expect(getFoodUsage('11111111-1111-4111-8111-111111111111')?.usageCount).toBe(1);
    await store.deleteMealForDate('user-1', '2026-03-21', second.meal.id);
    assertInvariant();
    expect(getFoodUsage('11111111-1111-4111-8111-111111111111')).toEqual({
      usageCount: 0,
      lastUsedAt: null,
    });
    context.db
      .update(foods)
      .set({ usageCount: 88, lastUsedAt: 888 })
      .where(eq(foods.id, '11111111-1111-4111-8111-111111111111'))
      .run();
    const before = snapshot();
    const preview = await context.app.inject({
      method: 'POST',
      url: '/api/v1/admin/reconcile-food-usage',
      headers: auth(),
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().data.rows).toContainEqual({
      id: '11111111-1111-4111-8111-111111111111',
      before: { usageCount: 88, lastUsedAt: 888 },
      projected: { usageCount: 0, lastUsedAt: null },
    });
    expect(snapshot()).toEqual(before);
    for (const updated of [1, 0]) {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/v1/admin/reconcile-food-usage',
        headers: auth(),
        payload: { mode: 'apply' },
      });
      expect(response.json().data.updated).toBe(updated);
      assertInvariant();
    }
    expect(
      await restoreTrashItem({
        id: '11111111-1111-4111-8111-111111111111',
        type: 'foods',
        userId: 'user-1',
      }),
    ).toBe(true);
    assertInvariant();
    expect(getFoodUsage('foreign')).toEqual({ usageCount: 77, lastUsedAt: 77 });
  });
  it.each(['Bearer', 'AgentToken'] as const)(
    'uses authenticated %s append, metadata, correction, delete, merge and trash routes',
    async (scheme) => {
      seedFood({ id: '11111111-1111-4111-8111-111111111111', userId: 'user-1' });
      seedFood({ id: '22222222-2222-4222-8222-222222222222', userId: 'user-1' });
      seedFood({ id: 'foreign', userId: 'user-2', usageCount: 77, lastUsedAt: 77 });
      const token = 'fictional-lifecycle-agent';
      context.db
        .insert(agentTokens)
        .values({
          id: 'lifecycle-token',
          userId: 'user-1',
          name: 'fixture',
          tokenHash: createHash('sha256').update(token).digest('hex'),
        })
        .run();
      const headers = scheme === 'Bearer' ? auth() : createAuthorizationHeader(token, scheme);
      const store = await import('./store.js');
      const created = await store.createMealForDate('user-1', '2026-03-20', {
        name: 'Fixture',
        items: [inputItem(), inputItem()],
      });
      const mealId = created.meal.id;
      const itemId = required(created.items[0]).id;
      const append = await context.app.inject({
        method: 'POST',
        url: `/api/v1/meals/${mealId}/items`,
        headers,
        payload: { items: [inputItem(), inputItem()] },
      });
      expect(append.statusCode, append.body).toBe(200);
      assertInvariant();
      const beforeMetadata = getFoodUsage('11111111-1111-4111-8111-111111111111');
      const metadata = await context.app.inject({
        method: 'PATCH',
        url: `/api/v1/meals/${mealId}`,
        headers,
        payload: { name: 'Edited fixture' },
      });
      expect(metadata.statusCode, metadata.body).toBe(200);
      expect(getFoodUsage('11111111-1111-4111-8111-111111111111')).toEqual(beforeMetadata);
      for (const prefix of ['/api/v1/meals', '/api/v1/nutrition/2026-03-20/meals']) {
        for (const foodId of [
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
          null,
          '11111111-1111-4111-8111-111111111111',
          '11111111-1111-4111-8111-111111111111',
        ]) {
          const response = await context.app.inject({
            method: 'PATCH',
            url: `${prefix}/${mealId}/items/${itemId}`,
            headers,
            payload: { foodId },
          });
          expect(response.statusCode, response.body).toBe(200);
          assertInvariant();
        }
        for (const foodId of ['foreign', 'missing']) {
          const before = context.sqlite.prepare('SELECT * FROM meal_items ORDER BY id').all();
          const response = await context.app.inject({
            method: 'PATCH',
            url: `${prefix}/${mealId}/items/${itemId}`,
            headers,
            payload: { foodId },
          });
          expect(response.statusCode, response.body).toBe(400);
          expect(context.sqlite.prepare('SELECT * FROM meal_items ORDER BY id').all()).toEqual(
            before,
          );
          assertInvariant();
        }
      }
      const foreignMeal = await store.createMealForDate('user-2', '2026-03-20', {
        name: 'Foreign fixture',
        items: [inputItem('foreign')],
      });
      const forbidden = await context.app.inject({
        method: 'PATCH',
        url: `/api/v1/meals/${foreignMeal.meal.id}/items/${required(foreignMeal.items[0]).id}`,
        headers,
        payload: { foodId: '11111111-1111-4111-8111-111111111111' },
      });
      expect(forbidden.statusCode, forbidden.body).toBe(404);
      const merged = await context.app.inject({
        method: 'POST',
        url: '/api/v1/foods/22222222-2222-4222-8222-222222222222/merge',
        headers,
        payload: { loserId: '11111111-1111-4111-8111-111111111111' },
      });
      expect(merged.statusCode, merged.body).toBe(200);
      assertInvariant();
      const restore = await context.app.inject({
        method: 'POST',
        url: '/api/v1/trash/foods/11111111-1111-4111-8111-111111111111/restore',
        headers,
      });
      expect(restore.statusCode, restore.body).toBe(200);
      assertInvariant();
      const trashed = await context.app.inject({
        method: 'DELETE',
        url: '/api/v1/foods/22222222-2222-4222-8222-222222222222',
        headers,
      });
      expect(trashed.statusCode, trashed.body).toBe(200);
      assertInvariant();
      const deleted = await context.app.inject({
        method: 'DELETE',
        url: `/api/v1/nutrition/2026-03-20/meals/${mealId}`,
        headers,
      });
      expect(deleted.statusCode, deleted.body).toBe(200);
      assertInvariant();
      expect(getFoodUsage('22222222-2222-4222-8222-222222222222')).toEqual({
        usageCount: 0,
        lastUsedAt: null,
      });
    },
  );

  it('rejects unprefixed agent tokens and rolls back date route create failures', async () => {
    seedFood({ id: '11111111-1111-4111-8111-111111111111', userId: 'user-1' });
    const payload = { name: 'Fixture', items: [inputItem()] };
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/nutrition/2026-03-20/meals',
      headers: { authorization: 'fictional-agent-token' },
      payload,
    });
    expect(response.statusCode).toBe(401);
    failUsage();
    const before = snapshot();
    try {
      const failed = await context.app.inject({
        method: 'POST',
        url: '/api/v1/nutrition/2026-03-20/meals',
        headers: auth(),
        payload,
      });
      expect(failed.statusCode, failed.body).toBe(500);
      expect(snapshot()).toEqual(before);
    } finally {
      clearFailure();
    }
  });
  it('falls back to the newest surviving timestamp and refuses foreign or partial purges', async () => {
    const foodId = '11111111-1111-4111-8111-111111111111';
    seedFood({ id: foodId, userId: 'user-1' });
    seedMeal({ id: 'older', userId: 'user-1', date: '2026-03-22' });
    seedMeal({ id: 'newer', userId: 'user-1', date: '2026-03-20' });
    seedMealItem({ id: 'old-item', mealId: 'older', foodId, createdAt: 100 });
    seedMealItem({ id: 'new-item', mealId: 'newer', foodId, createdAt: 200 });
    const { deleteFood } = await import('../foods/store.js');
    const { deleteMealForDate } = await import('./store.js');
    await deleteFood(foodId, 'user-1');
    expect(getFoodUsage(foodId)).toEqual({ usageCount: 2, lastUsedAt: 200 });
    await deleteMealForDate('user-1', '2026-03-20', 'newer');
    expect(getFoodUsage(foodId)).toEqual({ usageCount: 1, lastUsedAt: 100 });
    seedMeal({ id: 'foreign-meal', userId: 'user-2', date: '2026-03-20' });
    seedMealItem({ id: 'foreign-link', mealId: 'foreign-meal', foodId, createdAt: 999 });
    let before = snapshot();
    const blocked = await context.app.inject({
      method: 'DELETE',
      url: `/api/v1/trash/foods/${foodId}`,
      headers: auth(),
    });
    expect(blocked.statusCode).toBe(500);
    expect(snapshot()).toEqual(before);
    context.db.delete(mealItems).where(eq(mealItems.id, 'foreign-link')).run();
    context.sqlite.exec(
      'CREATE TRIGGER ignore_food_delete BEFORE DELETE ON foods BEGIN SELECT RAISE(IGNORE); END',
    );
    before = snapshot();
    try {
      const failed = await context.app.inject({
        method: 'DELETE',
        url: `/api/v1/trash/foods/${foodId}`,
        headers: auth(),
      });
      expect(failed.statusCode).toBe(500);
      expect(snapshot()).toEqual(before);
    } finally {
      context.sqlite.exec('DROP TRIGGER ignore_food_delete');
    }
    const purged = await context.app.inject({
      method: 'DELETE',
      url: `/api/v1/trash/foods/${foodId}`,
      headers: auth(),
    });
    expect(purged.statusCode).toBe(200);
    expect(getFoodUsage(foodId)).toBeUndefined();
    expect(context.db.select().from(mealItems).all()).toHaveLength(0);
  });
});
