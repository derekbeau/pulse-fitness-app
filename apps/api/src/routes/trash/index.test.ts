import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  exercises,
  foods,
  habitEntries,
  habits,
  mealItems,
  meals,
  nutritionLogs,
  sessionSets,
  users,
  workoutSessions,
  workoutTemplates,
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

describe('trash routes', () => {
  beforeAll(async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-trash-routes-'));

    process.env.JWT_SECRET = 'test-trash-secret';
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
    context.db.delete(sessionSets).run();
    context.db.delete(workoutSessions).run();
    context.db.delete(workoutTemplates).run();
    context.db.delete(exercises).run();
    context.db.delete(habitEntries).run();
    context.db.delete(habits).run();
    context.db.delete(foods).run();
    context.db.delete(users).run();

    context.db
      .insert(users)
      .values({
        id: 'user-1',
        username: 'derek',
        name: 'Derek',
        passwordHash: 'not-used',
      })
      .run();
    context.db
      .insert(users)
      .values({
        id: 'user-2',
        username: 'alex',
        name: 'Alex',
        passwordHash: 'not-used',
      })
      .run();
  });

  it('lists soft-deleted items grouped by type', async () => {
    context.db
      .insert(habits)
      .values({
        id: 'habit-1',
        userId: 'user-1',
        name: 'Hydrate',
        trackingType: 'boolean',
        active: false,
        deletedAt: '2026-03-10T00:00:00.000Z',
      })
      .run();
    context.db
      .insert(workoutTemplates)
      .values({
        id: 'template-1',
        userId: 'user-1',
        name: 'Upper A',
        tags: [],
        deletedAt: '2026-03-10T00:00:00.000Z',
      })
      .run();
    context.db
      .insert(foods)
      .values({
        id: 'food-1',
        userId: 'user-1',
        name: 'Greek Yogurt',
        calories: 90,
        protein: 18,
        carbs: 5,
        fat: 0,
        deletedAt: '2026-03-10T00:00:00.000Z',
      })
      .run();
    context.db
      .insert(exercises)
      .values({
        id: 'exercise-1',
        userId: 'user-1',
        name: 'Bench Press',
        muscleGroups: ['chest'],
        equipment: 'barbell',
        category: 'compound',
        tags: [],
        formCues: [],
        instructions: null,
      })
      .run();

    context.db
      .insert(workoutSessions)
      .values({
        id: 'session-1',
        userId: 'user-1',
        templateId: null,
        name: 'Push Day',
        date: '2026-03-10',
        startedAt: Date.now(),
        deletedAt: '2026-03-10T00:00:00.000Z',
      })
      .run();

    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/trash',
      headers: createAuthorizationHeader(authToken),
    });
    const payload = response.json() as {
      data: {
        habits: Array<{ id: string }>;
        'workout-templates': Array<{ id: string }>;
        exercises: Array<{ id: string }>;
        foods: Array<{ id: string }>;
        'workout-sessions': Array<{ id: string }>;
      };
    };

    expect(response.statusCode).toBe(200);
    expect(payload.data.habits.map((item) => item.id)).toEqual(['habit-1']);
    expect(payload.data['workout-templates'].map((item) => item.id)).toEqual(['template-1']);
    expect(payload.data.exercises).toEqual([]);
    expect(payload.data.foods.map((item) => item.id)).toEqual(['food-1']);
    expect(payload.data['workout-sessions'].map((item) => item.id)).toEqual(['session-1']);
  });

  it('restores a soft-deleted habit', async () => {
    context.db
      .insert(habits)
      .values({
        id: 'habit-1',
        userId: 'user-1',
        name: 'Hydrate',
        trackingType: 'boolean',
        active: false,
        deletedAt: '2026-03-10T00:00:00.000Z',
      })
      .run();

    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/trash/habits/habit-1/restore',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: { success: true },
    });

    const restored = context.db
      .select({ active: habits.active, deletedAt: habits.deletedAt })
      .from(habits)
      .where(eq(habits.id, 'habit-1'))
      .get();

    expect(restored).toEqual({
      active: true,
      deletedAt: null,
    });
  });

  it('purges soft-deleted items and cascades linked records', async () => {
    context.db
      .insert(exercises)
      .values({
        id: 'exercise-1',
        userId: 'user-1',
        name: 'Bench Press',
        muscleGroups: ['chest'],
        equipment: 'barbell',
        category: 'compound',
        tags: [],
        formCues: [],
        instructions: null,
      })
      .run();

    context.db
      .insert(foods)
      .values({
        id: 'food-1',
        userId: 'user-1',
        name: 'Greek Yogurt',
        calories: 90,
        protein: 18,
        carbs: 5,
        fat: 0,
        deletedAt: '2026-03-10T00:00:00.000Z',
      })
      .run();
    context.db
      .insert(nutritionLogs)
      .values({
        id: 'log-1',
        userId: 'user-1',
        date: '2026-03-10',
      })
      .run();
    context.db
      .insert(meals)
      .values({
        id: 'meal-1',
        nutritionLogId: 'log-1',
        name: 'Breakfast',
      })
      .run();
    context.db
      .insert(mealItems)
      .values({
        id: 'meal-item-1',
        mealId: 'meal-1',
        foodId: 'food-1',
        name: 'Greek Yogurt',
        amount: 1,
        unit: 'cup',
        calories: 90,
        protein: 18,
        carbs: 5,
        fat: 0,
      })
      .run();

    context.db
      .insert(workoutSessions)
      .values({
        id: 'session-1',
        userId: 'user-1',
        templateId: null,
        name: 'Push Day',
        date: '2026-03-10',
        startedAt: Date.now(),
        deletedAt: '2026-03-10T00:00:00.000Z',
      })
      .run();
    context.db
      .insert(sessionSets)
      .values({
        id: 'set-1',
        sessionId: 'session-1',
        exerciseId: 'exercise-1',
        setNumber: 1,
      })
      .run();

    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

    const purgeFoodResponse = await context.app.inject({
      method: 'DELETE',
      url: '/api/v1/trash/foods/food-1',
      headers: createAuthorizationHeader(authToken),
    });
    expect(purgeFoodResponse.statusCode).toBe(200);

    const purgeSessionResponse = await context.app.inject({
      method: 'DELETE',
      url: '/api/v1/trash/workout-sessions/session-1',
      headers: createAuthorizationHeader(authToken),
    });
    expect(purgeSessionResponse.statusCode).toBe(200);

    expect(
      context.db.select({ id: foods.id }).from(foods).where(eq(foods.id, 'food-1')).get(),
    ).toBeUndefined();
    expect(
      context.db
        .select({ id: mealItems.id })
        .from(mealItems)
        .where(eq(mealItems.id, 'meal-item-1'))
        .get(),
    ).toBeUndefined();
    expect(
      context.db
        .select({ id: workoutSessions.id })
        .from(workoutSessions)
        .where(eq(workoutSessions.id, 'session-1'))
        .get(),
    ).toBeUndefined();
    expect(
      context.db
        .select({ id: sessionSets.id })
        .from(sessionSets)
        .where(eq(sessionSets.id, 'set-1'))
        .get(),
    ).toBeUndefined();
  });
});
