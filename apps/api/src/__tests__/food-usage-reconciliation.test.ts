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

    seedUser('user-1', 'fictional-alpha');
    seedUser('user-2', 'fictional-beta');
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
      payload: { mode: 'apply' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
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
      payload: { mode: 'apply' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
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

  it('counts rows as updated when only lastUsedAt changes', async () => {
    seedFood({
      id: 'food-timestamp',
      userId: 'user-1',
      usageCount: 1,
      lastUsedAt: 1_800_000_001_000,
    });
    seedMeal({ id: 'meal-1', userId: 'user-1', date: '2026-03-20' });
    seedMealItem({
      id: 'meal-item-1',
      mealId: 'meal-1',
      foodId: 'food-timestamp',
      createdAt: 1_800_000_090_000,
    });

    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/admin/reconcile-food-usage',
      headers: createAuthorizationHeader(authToken),
      payload: { mode: 'apply' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        reconciled: 1,
        updated: 1,
      },
    });
    expect(getFoodUsage('food-timestamp')).toEqual({
      usageCount: 1,
      lastUsedAt: 1_800_000_090_000,
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
      payload: { mode: 'apply' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
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
  const auth = (userId = 'user-1') =>
    createAuthorizationHeader(
      context.app.jwt.sign({ sub: userId, type: 'session', iss: 'pulse-api' }, { expiresIn: '1h' }),
    );
  const request = (payload?: object) =>
    context.app.inject({
      method: 'POST',
      url: '/api/v1/admin/reconcile-food-usage',
      headers: auth(),
      ...(payload === undefined ? {} : { payload }),
    });
  const snapshot = () => context.sqlite.serialize();

  it('defaults to a byte-identical dry run, isolates hostile links and deleted foods, then applies idempotently', async () => {
    seedFood({ id: 'food-a', userId: 'user-1', usageCount: 88, lastUsedAt: 999 });
    seedFood({ id: 'food-b', userId: 'user-1', usageCount: 99, lastUsedAt: 888 });
    seedFood({ id: 'trashed', userId: 'user-1', usageCount: 55, lastUsedAt: 55 });
    seedFood({ id: 'foreign', userId: 'user-2', usageCount: 66, lastUsedAt: 66 });
    context.db
      .update(foods)
      .set({ deletedAt: '2026-01-01T00:00:00.000Z' })
      .where(eq(foods.id, 'trashed'))
      .run();
    seedMeal({ id: 'owned', userId: 'user-1', date: '2026-03-20' });
    seedMeal({ id: 'foreign-meal', userId: 'user-2', date: '2026-03-20' });
    for (const [id, mealId, foodId, createdAt] of [
      ['i1', 'owned', 'food-a', 123],
      ['i2', 'owned', 'food-a', 456],
      ['i3', 'foreign-meal', 'food-a', 999],
      ['i4', 'owned', 'foreign', 1000],
      ['i5', 'owned', 'trashed', 555],
      ['i6', 'owned', null, 777],
    ] as [string, string, string | null, number][])
      seedMealItem({ id, mealId, foodId, createdAt });
    const before = snapshot();
    for (const payload of [undefined, {}, { mode: 'dry-run' }]) {
      const response = await request(payload);
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().data).toMatchObject({
        userId: 'user-1',
        mode: 'dry-run',
        reconciled: 3,
        changed: 3,
        updated: 0,
        rows: [
          { id: 'food-a', projected: { usageCount: 2, lastUsedAt: 456 } },
          { id: 'food-b', projected: { usageCount: 0, lastUsedAt: null } },
          { id: 'trashed', projected: { usageCount: 1, lastUsedAt: 555 } },
        ],
      });
      expect(snapshot()).toEqual(before);
    }
    const protectedBefore = context.sqlite
      .prepare("SELECT * FROM foods WHERE id = 'foreign' ORDER BY id")
      .all();
    const linksBefore = context.sqlite.prepare('SELECT * FROM meal_items ORDER BY id').all();
    const response = await request({ mode: 'apply' });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ changed: 3, updated: 3 });
    expect(
      context.sqlite.prepare("SELECT * FROM foods WHERE id = 'foreign' ORDER BY id").all(),
    ).toEqual(protectedBefore);
    expect(context.sqlite.prepare('SELECT * FROM meal_items ORDER BY id').all()).toEqual(
      linksBefore,
    );
    const applied = snapshot();
    const repeat = await request({ mode: 'apply' });
    expect(repeat.json().data).toMatchObject({ changed: 0, updated: 0 });
    expect(snapshot()).toEqual(applied);
  });

  it.each([
    { mode: 'invalid' },
    { mode: null },
    { limit: 0 },
    { limit: 501 },
    { limit: 1.5 },
    { limit: '1' },
    { cursor: 'anything' },
    { userId: 'user-2' },
    { allUsers: true },
    { foodId: 'foreign' },
  ])('rejects malformed or broadened scope %j without writes', async (payload) => {
    seedFood({ id: 'food-a', userId: 'user-1', usageCount: 9 });
    const before = snapshot();
    const response = await request(payload);
    expect(response.statusCode, response.body).toBe(400);
    expect(snapshot()).toEqual(before);
  });

  it('fails closed on excessive scope, missing users and invalid JWT claims', async () => {
    seedFood({ id: 'food-a', userId: 'user-1', usageCount: 9 });
    seedFood({ id: 'food-b', userId: 'user-1', usageCount: 9 });
    const before = snapshot();
    expect((await request({ mode: 'apply', limit: 1 })).statusCode).toBe(400);
    for (const headers of [
      {},
      createAuthorizationHeader(context.app.jwt.sign({ sub: 'user-1' }, { expiresIn: '1h' })),
    ]) {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/v1/admin/reconcile-food-usage',
        headers,
      });
      expect(response.statusCode).toBe(401);
    }
    const unknown = await context.app.inject({
      method: 'POST',
      url: '/api/v1/admin/reconcile-food-usage',
      headers: auth('missing-user'),
    });
    expect(unknown.statusCode).toBe(400);
    const { reconcileFoodUsage } = await import('../routes/foods/store.js');
    for (const userId of ['', ' ', 'missing-user'])
      expect(() => context.db.transaction((tx) => reconcileFoodUsage(tx, userId))).toThrow();
    expect(() =>
      context.db.transaction((tx) =>
        reconcileFoodUsage(tx, 'user-1', { mode: 'apply' }, 'foreign'),
      ),
    ).toThrow();
    expect(snapshot()).toEqual(before);
  });

  it('rolls back earlier target writes when a later update fails', async () => {
    seedFood({ id: 'food-a', userId: 'user-1', usageCount: 8 });
    seedFood({ id: 'food-b', userId: 'user-1', usageCount: 9 });
    seedFood({ id: 'foreign', userId: 'user-2', usageCount: 77 });
    context.sqlite.exec(
      "CREATE TRIGGER fail_later BEFORE UPDATE ON foods WHEN OLD.id='food-b' BEGIN SELECT RAISE(ABORT, 'injected second target failure'); END",
    );
    const before = snapshot();
    try {
      const response = await request({ mode: 'apply' });
      expect(response.statusCode).toBe(500);
      expect(snapshot()).toEqual(before);
    } finally {
      context.sqlite.exec('DROP TRIGGER fail_later');
    }
  });
  it('rejects query selectors and explicit null bodies without writes', async () => {
    const before = snapshot();
    for (const query of ['?userId=user-2', '?cursor=bad', '?limit=0']) {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/v1/admin/reconcile-food-usage' + query,
        headers: auth(),
      });
      expect(response.statusCode, response.body).toBe(400);
    }
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/admin/reconcile-food-usage',
      headers: { ...auth(), 'content-type': 'application/json' },
      payload: 'null',
    });
    expect(response.statusCode, response.body).toBe(400);
    expect(snapshot()).toEqual(before);
  });
  it.each([-1, 1.5])(
    'previews and repairs malformed stored count %s without a post-commit serialization error',
    async (usageCount) => {
      seedFood({ id: 'food-a', userId: 'user-1', usageCount, lastUsedAt: -1.5 });
      const before = snapshot();
      const preview = await request();
      expect(preview.statusCode, preview.body).toBe(200);
      expect(preview.json().data.rows[0].before).toEqual({ usageCount, lastUsedAt: -1.5 });
      expect(snapshot()).toEqual(before);
      const applied = await request({ mode: 'apply' });
      expect(applied.statusCode, applied.body).toBe(200);
      expect(getFoodUsage('food-a')).toEqual({ usageCount: 0, lastUsedAt: null });
      expect((await request({ mode: 'apply' })).json().data.updated).toBe(0);
    },
  );

  it('rolls back all apply writes if a malformed source timestamp cannot produce a valid response', async () => {
    seedFood({ id: 'food-a', userId: 'user-1', usageCount: 8 });
    seedFood({ id: 'food-b', userId: 'user-1', usageCount: 9 });
    seedMeal({ id: 'meal-1', userId: 'user-1', date: '2026-03-20' });
    seedMealItem({ id: 'item-1', mealId: 'meal-1', foodId: 'food-b', createdAt: 1.5 });
    const before = snapshot();
    const response = await request({ mode: 'apply' });
    expect(response.statusCode).toBe(500);
    expect(snapshot()).toEqual(before);
  });
});
