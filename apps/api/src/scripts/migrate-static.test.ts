import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { and, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bodyWeight,
  exercises,
  foods,
  habitEntries,
  habits,
  mealItems,
  meals,
  nutritionLogs,
  sessionSets,
  templateExercises,
  users,
  workoutSessions,
  workoutTemplates,
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

  dbModule.db
    .insert(exercises)
    .values({
      id: 'exercise-bench-global',
      userId: null,
      name: 'Barbell Bench Press',
      muscleGroups: ['chest', 'triceps'],
      equipment: 'barbell',
      category: 'compound',
      instructions: null,
    })
    .run();
};

const writeFixtureData = () => {
  mkdirSync(join(dataRoot, 'daily', '2026', '03'), { recursive: true });
  mkdirSync(join(dataRoot, 'workouts', 'templates'), { recursive: true });
  mkdirSync(join(dataRoot, 'workouts', '2026', 'Q1'), { recursive: true });

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

  writeFileSync(
    join(dataRoot, 'workouts', 'templates', 'upper-push.json'),
    JSON.stringify({
      name: 'Upper Push',
      description: 'Chest and shoulder focused day',
      tags: ['push', 'strength'],
      sections: [
        {
          type: 'warmup',
          exercises: [
            {
              name: 'Band Pull Apart',
              sets: 2,
              reps: '15',
              category: 'mobility',
              muscleGroups: ['rear delts'],
              equipment: 'band',
            },
          ],
        },
        {
          type: 'main',
          exercises: [
            {
              name: 'Barbell Bench Press',
              sets: 3,
              reps: '5-8',
              category: 'compound',
              muscleGroups: ['chest', 'triceps'],
              equipment: 'barbell',
            },
            {
              name: 'Incline Dumbbell Fly',
              sets: 3,
              repsMin: 10,
              repsMax: 12,
              category: 'isolation',
              muscles: ['chest'],
              equipment: 'dumbbells',
            },
          ],
        },
      ],
    }),
    'utf8',
  );

  writeFileSync(
    join(dataRoot, 'workouts', 'templates', 'lower-body.json'),
    JSON.stringify({
      templateName: 'Lower Body',
      warmup: [
        {
          name: 'Bodyweight Squat',
          sets: 2,
          reps: '10',
          category: 'mobility',
          muscleGroups: ['quads'],
          equipment: 'bodyweight',
        },
      ],
      main: [
        {
          name: 'Romanian Deadlift',
          sets: 4,
          reps: '6-8',
          category: 'compound',
          targetMuscles: ['hamstrings', 'glutes'],
          equipment: 'barbell',
        },
      ],
    }),
    'utf8',
  );

  writeFileSync(
    join(dataRoot, 'workouts', '2026', 'Q1', 'upper-push-session.json'),
    JSON.stringify({
      name: 'Upper Push',
      startedAt: '2026-01-12T14:00:00.000Z',
      completedAt: '2026-01-12T14:48:00.000Z',
      exercises: [
        {
          exerciseName: 'Barbell Bench Press',
          sets: [
            { setNumber: 1, weight: 185, reps: 8 },
            { setNumber: 2, weight: 195, reps: 6 },
          ],
        },
        {
          exerciseName: 'Incline Dumbbell Fly',
          sets: [
            { setNumber: 1, weight: 40, reps: 12 },
            { setNumber: 2, weight: 40, reps: 10 },
          ],
        },
      ],
    }),
    'utf8',
  );

  writeFileSync(
    join(dataRoot, 'workouts', '2026', 'Q1', 'lower-body-session.json'),
    JSON.stringify({
      templateName: 'Lower Body',
      name: 'Lower Body',
      startedAt: '2026-01-14T15:00:00.000Z',
      durationMinutes: 52,
      sections: [
        {
          type: 'warmup',
          exercises: [
            {
              name: 'Bodyweight Squat',
              sets: [{ reps: 10 }, { reps: 10 }],
            },
          ],
        },
        {
          type: 'main',
          exercises: [
            {
              name: 'Romanian Deadlift',
              sets: [
                { weight: 225, reps: 8 },
                { weight: 235, reps: 6 },
              ],
            },
          ],
        },
      ],
    }),
    'utf8',
  );

  writeFileSync(
    join(dataRoot, 'foods.json'),
    JSON.stringify([
      {
        name: 'Greek Yogurt',
        brand: 'Fage',
        servingSize: '3/4 cup',
        servingGrams: 170,
        calories: 130,
        protein: 18,
        carbs: 7,
        fat: 0,
        fiber: 0,
        sugar: 5,
        verified: true,
        source: 'manual',
        notes: 'Plain 0%',
      },
      {
        name: 'Oat Bran',
        brand: null,
        servingSize: '1/4 cup dry',
        calories: 150,
        protein: 7,
        carbohydrates: 27,
        fat: 3,
        verified: false,
        source: 'USDA',
      },
      {
        name: 'Large Eggs',
        brand: null,
        calories: 140,
        protein: 12,
        carbs: 1,
        fat: 10,
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

  it('migrates workout templates and sessions with template linking and set preservation', async () => {
    const captured = buildLogger();

    const summary = await scriptModule.migrateWorkoutTemplatesAndSessions({
      userId: 'user-1',
      dataRoot,
      logger: captured.logger,
    });

    expect(summary).toEqual({
      processedTemplates: 2,
      failedTemplates: 0,
      processedSessions: 2,
      failedSessions: 0,
      totalTemplateExercises: 5,
      totalSessionSets: 8,
      createdExercises: 4,
    });

    expect(captured.errorMessages).toEqual([]);

    const templateCount = dbModule.db.select().from(workoutTemplates).all().length;
    const templateExerciseCount = dbModule.db.select().from(templateExercises).all().length;
    const sessionCount = dbModule.db.select().from(workoutSessions).all().length;
    const setCount = dbModule.db.select().from(sessionSets).all().length;

    expect(templateCount).toBe(2);
    expect(templateExerciseCount).toBe(5);
    expect(sessionCount).toBe(2);
    expect(setCount).toBe(8);

    const benchExercises = dbModule.db
      .select({
        id: exercises.id,
      })
      .from(exercises)
      .where(eq(exercises.name, 'Barbell Bench Press'))
      .all();

    expect(benchExercises).toHaveLength(1);

    const createdFly = dbModule.db
      .select({
        userId: exercises.userId,
        category: exercises.category,
      })
      .from(exercises)
      .where(eq(exercises.name, 'Incline Dumbbell Fly'))
      .limit(1)
      .get();

    expect(createdFly).toEqual({
      userId: 'user-1',
      category: 'isolation',
    });

    const upperTemplate = dbModule.db
      .select({
        id: workoutTemplates.id,
      })
      .from(workoutTemplates)
      .where(eq(workoutTemplates.name, 'Upper Push'))
      .limit(1)
      .get();

    expect(upperTemplate?.id).toBeTruthy();

    const upperSession = dbModule.db
      .select({
        id: workoutSessions.id,
        templateId: workoutSessions.templateId,
        status: workoutSessions.status,
      })
      .from(workoutSessions)
      .where(eq(workoutSessions.name, 'Upper Push'))
      .limit(1)
      .get();

    expect(upperSession?.status).toBe('completed');
    expect(upperSession?.templateId).toBe(upperTemplate?.id);

    const benchSet = dbModule.db
      .select({
        weight: sessionSets.weight,
        reps: sessionSets.reps,
      })
      .from(sessionSets)
      .innerJoin(exercises, eq(exercises.id, sessionSets.exerciseId))
      .where(
        and(eq(sessionSets.sessionId, upperSession?.id ?? ''), eq(exercises.name, 'Barbell Bench Press')),
      )
      .limit(1)
      .get();

    expect(benchSet).toEqual({
      weight: 185,
      reps: 8,
    });
  });

  it('is idempotent for workout templates and sessions when re-run', async () => {
    const captured = buildLogger();

    await scriptModule.migrateWorkoutTemplatesAndSessions({
      userId: 'user-1',
      dataRoot,
      logger: captured.logger,
    });

    const firstPassCounts = {
      exercises: dbModule.db.select().from(exercises).all().length,
      templates: dbModule.db.select().from(workoutTemplates).all().length,
      templateExercises: dbModule.db.select().from(templateExercises).all().length,
      sessions: dbModule.db.select().from(workoutSessions).all().length,
      sets: dbModule.db.select().from(sessionSets).all().length,
    };

    await scriptModule.migrateWorkoutTemplatesAndSessions({
      userId: 'user-1',
      dataRoot,
      logger: captured.logger,
    });

    const secondPassCounts = {
      exercises: dbModule.db.select().from(exercises).all().length,
      templates: dbModule.db.select().from(workoutTemplates).all().length,
      templateExercises: dbModule.db.select().from(templateExercises).all().length,
      sessions: dbModule.db.select().from(workoutSessions).all().length,
      sets: dbModule.db.select().from(sessionSets).all().length,
    };

    expect(secondPassCounts).toEqual(firstPassCounts);
  });

  it('migrates foods from foods.json, skipping duplicates and backfilling lastUsedAt', async () => {
    const captured = buildLogger();

    const summary = await scriptModule.migrateFoodsDatabase({
      userId: 'user-1',
      dataRoot,
      logger: captured.logger,
    });

    // Greek Yogurt and Oat Bran are new; Large Eggs already seeded → skipped
    expect(summary.inserted).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(captured.warnMessages).toEqual([]);

    const allFoods = dbModule.db.select().from(foods).where(eq(foods.userId, 'user-1')).all();
    expect(allFoods).toHaveLength(4); // 2 seeded + 2 inserted

    const yogurt = dbModule.db
      .select({ brand: foods.brand, protein: foods.protein, verified: foods.verified, source: foods.source })
      .from(foods)
      .where(and(eq(foods.userId, 'user-1'), eq(foods.name, 'Greek Yogurt')))
      .limit(1)
      .get();

    expect(yogurt).toEqual({ brand: 'Fage', protein: 18, verified: true, source: 'manual' });

    const oatBran = dbModule.db
      .select({ carbs: foods.carbs, verified: foods.verified, source: foods.source })
      .from(foods)
      .where(and(eq(foods.userId, 'user-1'), eq(foods.name, 'Oat Bran')))
      .limit(1)
      .get();

    expect(oatBran).toEqual({ carbs: 27, verified: false, source: 'USDA' });
  });

  it('skips foods.json gracefully when file is missing', async () => {
    const captured = buildLogger();

    const summary = await scriptModule.migrateFoodsDatabase({
      userId: 'user-1',
      dataRoot: '/nonexistent/path',
      logger: captured.logger,
    });

    expect(summary).toEqual({ inserted: 0, skipped: 0, lastUsedAtUpdated: 0 });
    expect(captured.warnMessages.some((m) => m.includes('not found or unreadable'))).toBe(true);
  });

  it('backfills lastUsedAt from meal_items after daily logs are migrated', async () => {
    // First migrate foods (new: Greek Yogurt, Oat Bran; seeded: Large Eggs, Chicken Breast)
    await scriptModule.migrateFoodsDatabase({ userId: 'user-1', dataRoot });

    // Then migrate daily logs (which inserts meal_items referencing "Large Eggs")
    await scriptModule.migrateDailyLogsAndBodyWeight({ userId: 'user-1', dataRoot });

    // Seed a stale timestamp to verify backfill moves it forward when newer usage exists.
    dbModule.db
      .update(foods)
      .set({ lastUsedAt: new Date('2026-03-01T00:00:00.000Z').getTime() })
      .where(and(eq(foods.userId, 'user-1'), eq(foods.name, 'Large Eggs')))
      .run();

    // Re-run foods migration to trigger lastUsedAt backfill
    const captured = buildLogger();
    const summary2 = await scriptModule.migrateFoodsDatabase({
      userId: 'user-1',
      dataRoot,
      logger: captured.logger,
    });

    // All foods skipped on second run (already exist)
    expect(summary2.inserted).toBe(0);
    expect(summary2.skipped).toBe(3);
    expect(summary2.lastUsedAtUpdated).toBeGreaterThanOrEqual(2);

    // lastUsedAt should be moved to latest usage date for Large Eggs (used in daily logs)
    const eggs = dbModule.db
      .select({ lastUsedAt: foods.lastUsedAt })
      .from(foods)
      .where(and(eq(foods.userId, 'user-1'), eq(foods.name, 'Large Eggs')))
      .limit(1)
      .get();

    expect(eggs?.lastUsedAt).toBe(new Date('2026-03-06T00:00:00.000Z').getTime());
  });

  it('is idempotent for foods migration when re-run', async () => {
    await scriptModule.migrateFoodsDatabase({ userId: 'user-1', dataRoot });
    const firstCount = dbModule.db.select().from(foods).where(eq(foods.userId, 'user-1')).all().length;

    await scriptModule.migrateFoodsDatabase({ userId: 'user-1', dataRoot });
    const secondCount = dbModule.db.select().from(foods).where(eq(foods.userId, 'user-1')).all().length;

    expect(secondCount).toBe(firstCount);
  });
});
