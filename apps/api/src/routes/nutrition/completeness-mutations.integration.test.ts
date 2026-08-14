import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { foods, mealItems, meals, nutritionLogs, users } from '../../db/schema/index.js';

type DatabaseModule = typeof import('../../db/index.js');

let dbModule: DatabaseModule;
let tempDir = '';

const getStatus = (logId = 'log-1') =>
  dbModule.db
    .select({ status: nutritionLogs.status, statusUpdatedAt: nutritionLogs.statusUpdatedAt })
    .from(nutritionLogs)
    .where(eq(nutritionLogs.id, logId))
    .get();

const markComplete = (logId = 'log-1') =>
  dbModule.db
    .update(nutritionLogs)
    .set({ status: 'complete', statusUpdatedAt: 1 })
    .where(eq(nutritionLogs.id, logId))
    .run();

describe('complete nutrition day mutation downgrades', () => {
  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pulse-nutrition-completeness-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    vi.resetModules();
    dbModule = await import('../../db/index.js');
    migrate(dbModule.db, {
      migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
    });
  });

  afterAll(() => {
    dbModule.sqlite.close();
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env.DATABASE_URL;
    vi.resetModules();
  });

  beforeEach(() => {
    dbModule.db.delete(mealItems).run();
    dbModule.db.delete(meals).run();
    dbModule.db.delete(nutritionLogs).run();
    dbModule.db.delete(foods).run();
    dbModule.db.delete(users).run();

    dbModule.db
      .insert(users)
      .values({ id: 'user-1', username: 'user-1', passwordHash: 'hash' })
      .run();
    dbModule.db
      .insert(nutritionLogs)
      .values({
        id: 'log-1',
        userId: 'user-1',
        date: '2026-03-09',
        status: 'complete',
        statusUpdatedAt: 1,
      })
      .run();
    dbModule.db
      .insert(meals)
      .values({ id: 'meal-1', nutritionLogId: 'log-1', name: 'Breakfast' })
      .run();
    dbModule.db
      .insert(mealItems)
      .values({
        id: 'item-1',
        mealId: 'meal-1',
        foodId: null,
        name: 'Eggs',
        amount: 1,
        unit: 'serving',
        calories: 210,
        protein: 18,
        carbs: 1,
        fat: 15,
      })
      .run();
  });

  it('downgrades meal create, item append, meal edit, item edit, and meal delete atomically', async () => {
    const {
      addItemsToMeal,
      createMealForDate,
      deleteMealForDate,
      patchMealById,
      patchMealItemById,
    } = await import('./store.js');

    await createMealForDate('user-1', '2026-03-09', {
      name: 'Lunch',
      items: [
        {
          foodId: null,
          name: 'Rice',
          amount: 1,
          unit: 'cup',
          calories: 200,
          protein: 4,
          carbs: 45,
          fat: 1,
        },
      ],
    });
    expect(getStatus()?.status).toBe('partial');

    markComplete();
    await addItemsToMeal('user-1', 'meal-1', [
      {
        foodId: null,
        name: 'Toast',
        amount: 1,
        unit: 'slice',
        calories: 100,
        protein: 3,
        carbs: 18,
        fat: 2,
      },
    ]);
    expect(getStatus()?.status).toBe('partial');

    markComplete();
    await patchMealById('user-1', 'meal-1', { name: 'Updated breakfast' });
    expect(getStatus()?.status).toBe('partial');

    markComplete();
    await patchMealItemById('user-1', 'meal-1', 'item-1', { calories: 211 });
    expect(getStatus()?.status).toBe('partial');

    markComplete();
    await deleteMealForDate('user-1', '2026-03-09', 'meal-1');
    expect(getStatus()?.status).toBe('partial');
    expect(getStatus()?.statusUpdatedAt).not.toBe(1);
  });

  it('does not downgrade when a meal mutation fails and rolls back', async () => {
    const { createMealForDate, patchMealItemById } = await import('./store.js');

    await expect(
      createMealForDate('user-1', '2026-03-09', {
        name: 'Invalid meal',
        items: [
          {
            foodId: 'missing-food',
            name: 'Missing',
            amount: 1,
            unit: 'serving',
            calories: 100,
            protein: 1,
            carbs: 1,
            fat: 1,
          },
        ],
      }),
    ).rejects.toThrow('One or more foodIds do not belong to this user');
    expect(getStatus()).toEqual({ status: 'complete', statusUpdatedAt: 1 });

    await expect(
      patchMealItemById('user-1', 'meal-1', 'item-1', { foodId: 'missing-food' }),
    ).rejects.toThrow('One or more foodIds do not belong to this user');
    expect(getStatus()).toEqual({ status: 'complete', statusUpdatedAt: 1 });
  });

  it('downgrades every affected complete day when food merge relinks meal items', async () => {
    const { mergeFoods } = await import('../foods/store.js');
    dbModule.db
      .insert(foods)
      .values([
        {
          id: 'food-winner',
          userId: 'user-1',
          name: 'Winner',
          calories: 100,
          protein: 10,
          carbs: 10,
          fat: 2,
        },
        {
          id: 'food-loser',
          userId: 'user-1',
          name: 'Loser',
          calories: 100,
          protein: 10,
          carbs: 10,
          fat: 2,
        },
      ])
      .run();
    dbModule.db
      .update(mealItems)
      .set({ foodId: 'food-loser' })
      .where(eq(mealItems.id, 'item-1'))
      .run();

    await mergeFoods('user-1', 'food-winner', 'food-loser');

    expect(getStatus()?.status).toBe('partial');
    expect(
      dbModule.db
        .select({ foodId: mealItems.foodId })
        .from(mealItems)
        .where(eq(mealItems.id, 'item-1'))
        .get(),
    ).toEqual({ foodId: 'food-winner' });
  });
});
