import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bodyWeight,
  foods,
  habitEntries,
  habits,
  mealItems,
  meals,
  nutritionLogs,
  users,
} from '../db/schema/index.js';

type DbModule = typeof import('../db/index.js');
type ScriptModule = typeof import('./migrate-static.js');

type CapturedLogger = {
  infoMessages: string[];
  warnMessages: string[];
  errorMessages: string[];
  logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
};

let tempDir: string;
let dataRoot: string;
let dbModule: DbModule;
let scriptModule: ScriptModule;

const buildLogger = (): CapturedLogger => {
  const infoMessages: string[] = [];
  const warnMessages: string[] = [];
  const errorMessages: string[] = [];

  return {
    infoMessages,
    warnMessages,
    errorMessages,
    logger: {
      info: (...args: unknown[]) => {
        infoMessages.push(args.map((value) => String(value)).join(' '));
      },
      warn: (...args: unknown[]) => {
        warnMessages.push(args.map((value) => String(value)).join(' '));
      },
      error: (...args: unknown[]) => {
        errorMessages.push(args.map((value) => String(value)).join(' '));
      },
    },
  };
};

const seedBaseData = () => {
  dbModule.db
    .insert(users)
    .values({
      id: 'user-1',
      username: 'migrate-user',
      name: 'Migrate User',
      passwordHash: 'not-used',
    })
    .run();

  dbModule.db
    .insert(foods)
    .values([
      {
        id: 'food-eggs',
        userId: 'user-1',
        name: 'Large Eggs',
        brand: null,
        servingSize: '2 eggs',
        servingGrams: null,
        calories: 140,
        protein: 12,
        carbs: 1,
        fat: 10,
        fiber: null,
        sugar: null,
        verified: true,
        source: 'manual',
        notes: null,
        lastUsedAt: null,
      },
      {
        id: 'food-chicken',
        userId: 'user-1',
        name: 'Chicken Breast',
        brand: null,
        servingSize: '4 oz',
        servingGrams: null,
        calories: 180,
        protein: 35,
        carbs: 0,
        fat: 4,
        fiber: null,
        sugar: null,
        verified: true,
        source: 'manual',
        notes: null,
        lastUsedAt: null,
      },
    ])
    .run();

  dbModule.db
    .insert(habits)
    .values([
      {
        id: 'habit-hydration',
        userId: 'user-1',
        name: 'Hydration',
        emoji: '💧',
        trackingType: 'boolean',
        target: null,
        unit: null,
        sortOrder: 0,
        active: true,
      },
      {
        id: 'habit-steps',
        userId: 'user-1',
        name: 'Steps',
        emoji: '👟',
        trackingType: 'numeric',
        target: 10000,
        unit: 'steps',
        sortOrder: 1,
        active: true,
      },
    ])
    .run();
};

const writeFixtureData = () => {
  mkdirSync(join(dataRoot, 'daily', '2026', '03'), { recursive: true });

  writeFileSync(
    join(dataRoot, 'daily', '2026', '03', '2026-03-05.json'),
    JSON.stringify({
      bodyWeight: 182.4,
      meals: {
        breakfast: {
          time: '7:15 AM',
          items: [
            {
              name: 'Large Eggs',
              quantity: 2,
              servingUnit: 'eggs',
              calories: 140,
              protein: 12,
              carbs: 1,
              fat: 10,
            },
            {
              name: 'Mystery Food',
              quantity: 1,
              servingUnit: 'serving',
              calories: 250,
              protein: 8,
              carbs: 20,
              fat: 12,
            },
          ],
        },
        lunch: {
          time: '12:30 PM',
          items: [
            {
              name: 'Chicken Breast',
              amount: 8,
              unit: 'oz',
              calories: 360,
              protein: 70,
              carbs: 0,
              fat: 8,
            },
          ],
        },
      },
      checklist: {
        Hydration: true,
        Steps: {
          value: 10250,
          completed: true,
        },
        'Unknown Habit': true,
      },
    }),
    'utf8',
  );

  writeFileSync(
    join(dataRoot, 'daily', '2026', '03', '2026-03-06.json'),
    JSON.stringify({
      weight: 180.8,
      meals: [
        {
          name: 'Dinner',
          time: '6:45 PM',
          items: [
            {
              name: 'Large Eggs',
              amount: 3,
              unit: 'eggs',
              calories: 210,
              protein: 18,
              carbs: 2,
              fat: 15,
            },
          ],
        },
      ],
      habitEntries: [
        {
          name: 'Hydration',
          completed: false,
        },
      ],
    }),
    'utf8',
  );

  writeFileSync(
    join(dataRoot, 'body-weight.json'),
    JSON.stringify([
      {
        date: '2026-03-05',
        weight: 181.9,
      },
      {
        date: '2026-03-07',
        weight: 181.1,
      },
    ]),
    'utf8',
  );
};

describe('migrate-static script', () => {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pulse-migrate-static-'));
    dataRoot = join(tempDir, 'static-data');

    process.env.DATABASE_URL = join(tempDir, 'test.db');
    vi.resetModules();

    dbModule = await import('../db/index.js');
    migrate(dbModule.db, {
      migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
    });

    scriptModule = await import('./migrate-static.js');

    seedBaseData();
    writeFixtureData();
  });

  afterEach(() => {
    dbModule.sqlite.close();
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env.DATABASE_URL;
    vi.resetModules();
  });

  it('migrates daily logs with nutrition, habits, and merged body weight history', async () => {
    const captured = buildLogger();

    const summary = await scriptModule.migrateDailyLogsAndBodyWeight({
      userId: 'user-1',
      dataRoot,
      logger: captured.logger,
    });

    expect(summary).toEqual({
      processedDays: 3,
      failedDays: 0,
      dailyLogDays: 2,
      bodyWeightFileEntries: 2,
      totalMeals: 3,
      totalHabitEntries: 3,
      totalWeightEntries: 3,
    });

    expect(captured.errorMessages).toEqual([]);
    expect(captured.warnMessages.some((line) => line.includes('Missing food reference for "Mystery Food"'))).toBe(
      true,
    );
    expect(captured.warnMessages.some((line) => line.includes('Missing habit reference for "Unknown Habit"'))).toBe(
      true,
    );

    expect(dbModule.db.select().from(nutritionLogs).all()).toHaveLength(2);
    expect(dbModule.db.select().from(meals).all()).toHaveLength(3);
    expect(dbModule.db.select().from(mealItems).all()).toHaveLength(4);

    const eggsItem = dbModule.db
      .select({
        foodId: mealItems.foodId,
      })
      .from(mealItems)
      .where(eq(mealItems.name, 'Large Eggs'))
      .limit(1)
      .get();

    expect(eggsItem?.foodId).toBe('food-eggs');

    const unknownItem = dbModule.db
      .select({
        foodId: mealItems.foodId,
      })
      .from(mealItems)
      .where(eq(mealItems.name, 'Mystery Food'))
      .limit(1)
      .get();

    expect(unknownItem?.foodId).toBeNull();

    const allHabitEntries = dbModule.db.select().from(habitEntries).all();
    expect(allHabitEntries).toHaveLength(3);

    const stepEntry = dbModule.db
      .select({
        value: habitEntries.value,
        completed: habitEntries.completed,
      })
      .from(habitEntries)
      .where(eq(habitEntries.habitId, 'habit-steps'))
      .limit(1)
      .get();

    expect(stepEntry).toEqual({
      value: 10250,
      completed: true,
    });

    const weightEntries = dbModule.db
      .select({
        date: bodyWeight.date,
        weight: bodyWeight.weight,
      })
      .from(bodyWeight)
      .orderBy(bodyWeight.date)
      .all();

    expect(weightEntries).toEqual([
      {
        date: '2026-03-05',
        weight: 181.9,
      },
      {
        date: '2026-03-06',
        weight: 180.8,
      },
      {
        date: '2026-03-07',
        weight: 181.1,
      },
    ]);
  });

  it('is idempotent when re-run for the same user and source data', async () => {
    const captured = buildLogger();

    await scriptModule.migrateDailyLogsAndBodyWeight({
      userId: 'user-1',
      dataRoot,
      logger: captured.logger,
    });

    const firstPassCounts = {
      nutritionLogs: dbModule.db.select().from(nutritionLogs).all().length,
      meals: dbModule.db.select().from(meals).all().length,
      mealItems: dbModule.db.select().from(mealItems).all().length,
      habitEntries: dbModule.db.select().from(habitEntries).all().length,
      bodyWeight: dbModule.db.select().from(bodyWeight).all().length,
    };

    await scriptModule.migrateDailyLogsAndBodyWeight({
      userId: 'user-1',
      dataRoot,
      logger: captured.logger,
    });

    const secondPassCounts = {
      nutritionLogs: dbModule.db.select().from(nutritionLogs).all().length,
      meals: dbModule.db.select().from(meals).all().length,
      mealItems: dbModule.db.select().from(mealItems).all().length,
      habitEntries: dbModule.db.select().from(habitEntries).all().length,
      bodyWeight: dbModule.db.select().from(bodyWeight).all().length,
    };

    expect(secondPassCounts).toEqual(firstPassCounts);

    const overriddenWeight = dbModule.db
      .select({
        weight: bodyWeight.weight,
      })
      .from(bodyWeight)
      .where(eq(bodyWeight.date, '2026-03-05'))
      .limit(1)
      .get();

    expect(overriddenWeight?.weight).toBe(181.9);
  });

  it('parses CLI arguments and enforces required userId', () => {
    expect(scriptModule.parseCliArgs(['--user', 'user-1'])).toEqual({
      userId: 'user-1',
      dataRoot: scriptModule.DEFAULT_STATIC_DATA_ROOT,
    });

    expect(scriptModule.parseCliArgs(['--user', 'user-1', '--source', '/tmp/static'])).toEqual({
      userId: 'user-1',
      dataRoot: '/tmp/static',
    });

    expect(() => scriptModule.parseCliArgs([])).toThrow('Missing required --user <userId> argument.');
    expect(() => scriptModule.parseCliArgs(['--user'])).toThrow(
      'Missing value for --user. Usage: npx tsx src/scripts/migrate-static.ts --user <userId>',
    );
    expect(() => scriptModule.parseCliArgs(['--oops'])).toThrow('Unknown argument: --oops');
  });
});
