import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it } from 'vitest';

import {
  foodAnalyticsDetailSchema,
  foodAnalyticsResponseSchema,
  type AdaptiveProgramMutation,
  type FoodAnalyticsQuery,
} from '@pulse/shared';

import { createAdaptiveNutritionStore } from '../adaptive-nutrition/store.js';
import {
  createFoodAnalyticsStore,
  FoodAnalyticsNotFoundError,
  FoodAnalyticsProgramProjectionError,
  FoodAnalyticsTimeZoneConflictError,
} from './analytics-store.js';

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));
const ids = {
  yogurt: '00000000-0000-4000-8000-000000000001',
  bar: '00000000-0000-4000-8000-000000000002',
  inactive: '00000000-0000-4000-8000-000000000003',
  foreign: '00000000-0000-4000-8000-000000000004',
  clear: '00000000-0000-4000-8000-000000000005',
  unused: '00000000-0000-4000-8000-000000000006',
  tieA: '00000000-0000-4000-8000-000000000007',
  tieB: '00000000-0000-4000-8000-000000000008',
  zero: '00000000-0000-4000-8000-000000000009',
} as const;

let sqlite: Database.Database | undefined;

const insertFood = (
  database: Database.Database,
  values: {
    id: string;
    userId: string;
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number | null;
    sugar?: number | null;
    verified?: number;
    source?: string | null;
    servingGrams?: number | null;
    deletedAt?: string | null;
    tags?: string;
  },
) => {
  database
    .prepare(
      `insert into foods
        (id, user_id, name, brand, serving_size, serving_grams, calories, protein, carbs, fat,
         fiber, sugar, verified, source, notes, tags, deleted_at, created_at, updated_at)
       values
        (@id, @userId, @name, null, '1 serving', @servingGrams, @calories, @protein, @carbs, @fat,
         @fiber, @sugar, @verified, @source, null, @tags, @deletedAt, 1000, 1000)`,
    )
    .run({
      verified: 0,
      fiber: null,
      sugar: null,
      source: null,
      servingGrams: null,
      deletedAt: null,
      tags: '[]',
      ...values,
    });
};

const insertDay = (
  database: Database.Database,
  date: string,
  status: 'complete' | 'partial' | 'unknown',
  items: Array<{
    id: string;
    foodId: string | null;
    name: string;
    calories: number;
    protein: number;
    amount?: number;
    unit?: string;
    displayQuantity?: number | null;
    displayUnit?: string | null;
  }>,
) => {
  const dateDigits = date.replaceAll('-', '');
  const logId = `10000000-0000-4000-8000-${dateDigits.padStart(12, '0')}`;
  const mealId = `20000000-0000-4000-8000-${dateDigits.padStart(12, '0')}`;
  database
    .prepare(
      `insert into nutrition_logs (id, user_id, date, status, created_at, updated_at)
       values (?, 'user-1', ?, ?, 1000, 1000)`,
    )
    .run(logId, date, status);
  database
    .prepare(
      `insert into meals (id, nutrition_log_id, name, time, created_at, updated_at)
       values (?, ?, 'Lunch', '12:00', 1000, 1000)`,
    )
    .run(mealId, logId);
  const statement = database.prepare(
    `insert into meal_items
      (id, meal_id, food_id, name, amount, unit, display_quantity, display_unit,
       calories, protein, carbs, fat, created_at)
     values
      (@id, @mealId, @foodId, @name, @amount, @unit, @displayQuantity, @displayUnit,
       @calories, @protein, 0, 0, @createdAt)`,
  );
  items.forEach((item, index) => {
    statement.run({
      mealId,
      amount: 1,
      unit: 'serving',
      displayQuantity: null,
      displayUnit: null,
      createdAt: 1000 + index,
      ...item,
      id: `30000000-0000-4000-8000-${`${dateDigits}${index}`.padStart(12, '0')}`,
    });
  });
};

type ObservedQuery = {
  name: string;
  statement?: { sql: string; parameters: Record<string, string | number | null> };
};

const setup = (onQuery?: (name: string, statement?: ObservedQuery['statement']) => void) => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  migrate(drizzle(sqlite), { migrationsFolder });
  sqlite.exec(`
    insert into users (id, username, password_hash, created_at, updated_at)
    values ('user-1', 'food-analytics-one', 'hash', 1000, 1000),
           ('user-2', 'food-analytics-two', 'hash', 1000, 1000);
  `);
  insertFood(sqlite, {
    id: ids.yogurt,
    userId: 'user-1',
    name: 'Greek Yogurt',
    calories: 150,
    protein: 15,
    carbs: 10,
    fat: 3,
    verified: 1,
    source: 'Manufacturer label',
    servingGrams: 170,
    tags: '["protein","breakfast"]',
  });
  insertFood(sqlite, {
    id: ids.bar,
    userId: 'user-1',
    name: 'Snack Bar',
    calories: 50,
    protein: 1,
    carbs: 1,
    fat: 0,
    tags: '["snack"]',
  });
  insertFood(sqlite, {
    id: ids.inactive,
    userId: 'user-1',
    name: 'Archived Food',
    calories: 75,
    protein: 2,
    carbs: 10,
    fat: 3,
    deletedAt: '2026-08-24T00:00:00.000Z',
  });
  insertFood(sqlite, {
    id: ids.foreign,
    userId: 'user-2',
    name: 'Private Food',
    calories: 900,
    protein: 90,
    carbs: 0,
    fat: 0,
  });
  insertDay(sqlite, '2026-08-24', 'complete', [
    {
      id: 'item-yogurt-complete',
      foodId: ids.yogurt,
      name: 'Greek Yogurt',
      calories: 200,
      protein: 20,
      displayQuantity: 170,
      displayUnit: 'grams',
    },
  ]);
  insertDay(sqlite, '2026-08-23', 'partial', [
    {
      id: 'item-yogurt-partial',
      foodId: ids.yogurt,
      name: 'Greek Yogurt',
      calories: 100,
      protein: 10,
      displayQuantity: 170,
      displayUnit: 'g',
    },
    {
      id: 'item-unlinked',
      foodId: null,
      name: 'Greek Yogurt',
      calories: 300,
      protein: 5,
    },
    {
      id: 'item-inactive',
      foodId: ids.inactive,
      name: 'Archived Food',
      calories: 75,
      protein: 2,
    },
    {
      id: 'item-foreign',
      foodId: ids.foreign,
      name: 'Private Food',
      calories: 900,
      protein: 90,
    },
  ]);
  insertDay(sqlite, '2026-08-22', 'unknown', [
    {
      id: 'item-bar-unknown',
      foodId: ids.bar,
      name: 'Snack Bar',
      calories: 50,
      protein: 1,
    },
  ]);
  insertDay(sqlite, '2026-07-26', 'complete', [
    {
      id: 'item-outside-range',
      foodId: ids.yogurt,
      name: 'Greek Yogurt',
      calories: 999,
      protein: 99,
    },
  ]);

  return createFoodAnalyticsStore({
    sqlite,
    now: () => new Date('2026-08-25T16:00:00.000Z'),
    onQuery,
  });
};

const baseQuery: FoodAnalyticsQuery = {
  range: '30d',
  end: '2026-08-25',
  timeZone: 'America/Detroit',
  sort: 'most_used',
  usage: 'any',
  verification: 'any',
  review: 'any',
  grams: 'any',
  page: 1,
  limit: 25,
};

const seedFilterFoods = () => {
  if (!sqlite) throw new Error('Expected test database');
  insertFood(sqlite, {
    id: ids.clear,
    userId: 'user-1',
    name: 'Clear Food',
    calories: 100,
    protein: 10,
    carbs: 15,
    fat: 0,
    verified: 1,
    source: 'Label',
    servingGrams: 50,
    tags: '["protein","meal"]',
  });
  insertFood(sqlite, {
    id: ids.unused,
    userId: 'user-1',
    name: 'Unused Food',
    calories: 100,
    protein: 10,
    carbs: 15,
    fat: 0,
  });
  for (const id of [ids.tieA, ids.tieB]) {
    insertFood(sqlite, {
      id,
      userId: 'user-1',
      name: 'Tie Food',
      calories: 100,
      protein: 10,
      carbs: 15,
      fat: 0,
    });
  }
  insertDay(sqlite, '2026-08-21', 'complete', [
    {
      id: 'clear-use',
      foodId: ids.clear,
      name: 'Clear Food',
      calories: 120,
      protein: 20,
      displayQuantity: 60,
      displayUnit: 'g',
    },
  ]);
};

afterEach(() => {
  sqlite?.close();
  sqlite = undefined;
});

describe('food analytics store', () => {
  it('reconciles selected-range snapshots without attributing same-name or foreign items', () => {
    const store = setup();
    const response = store.getAnalytics('user-1', {
      range: '30d',
      end: '2026-08-25',
      timeZone: 'America/Detroit',
      sort: 'most_used',
      usage: 'any',
      verification: 'any',
      review: 'any',
      grams: 'any',
      page: 1,
      limit: 25,
    });

    expect(() => foodAnalyticsResponseSchema.parse(response)).not.toThrow();
    expect(response.data.range).toEqual({
      kind: '30d',
      startDate: '2026-07-27',
      endDate: '2026-08-25',
      calendarDays: 30,
      timeZone: 'America/Detroit',
      timeZoneSource: 'request',
      isHistorical: false,
    });
    expect(response.data.summary).toMatchObject({
      savedFoodsTotal: 2,
      savedFoodsUsed: 2,
      linkedUsageOccurrences: 3,
      distinctLoggedDays: 3,
      linkedFoodCalories: 350,
      totalMealItemCalories: 1625,
      unlinkedMealItemCount: 1,
      unlinkedMealItemCalories: 300,
      inactiveLinkedMealItemCount: 1,
      inactiveLinkedMealItemCalories: 75,
      unresolvedLinkedMealItemCount: 1,
      unresolvedLinkedMealItemCalories: 900,
      definitionsNeedingReview: 2,
    });
    expect(
      response.data.summary.linkedFoodCalories +
        response.data.summary.unlinkedMealItemCalories +
        response.data.summary.inactiveLinkedMealItemCalories +
        response.data.summary.unresolvedLinkedMealItemCalories,
    ).toBe(response.data.summary.totalMealItemCalories);
    expect(JSON.stringify(response)).not.toContain('Private Food');
    expect(response.data.items.map((item) => item.foodId)).toEqual([ids.yogurt, ids.bar]);
    expect(response.data.items[0]).toMatchObject({
      foodId: ids.yogurt,
      observed: {
        usageOccurrences: 2,
        distinctLoggedDays: 2,
        totalCalories: 300,
        totalProtein: 30,
        proteinPer100Kcal: 10,
        portion: {
          state: 'compatible',
          unit: 'g',
          medianQuantity: 170,
          recentQuantity: 170,
          recentLocalDate: '2026-08-24',
          evidenceCount: 2,
        },
      },
    });
    expect(response.data.items[0]?.observed.caloriesPer100Grams).toBeCloseTo(88.235, 3);
    expect(response.data.items[1]?.definitionReviewReasons).toEqual([
      'UNVERIFIED',
      'SOURCE_MISSING',
      'SERVING_GRAMS_MISSING',
      'MACRO_CALORIE_MISMATCH',
    ]);
  });

  it('keeps historical snapshots immutable when the current definition changes', () => {
    const store = setup();
    const before = store.getDetail('user-1', ids.yogurt, {
      range: '30d',
      end: '2026-08-25',
      timeZone: 'America/Detroit',
      occurrencePage: 1,
      occurrenceLimit: 25,
    });
    sqlite
      ?.prepare(
        `update foods set calories = 500, protein = 50, serving_grams = 200, updated_at = 2000
        where id = ?`,
      )
      .run(ids.yogurt);
    const after = store.getDetail('user-1', ids.yogurt, {
      range: '30d',
      end: '2026-08-25',
      timeZone: 'America/Detroit',
      occurrencePage: 1,
      occurrenceLimit: 25,
    });

    expect(() => foodAnalyticsDetailSchema.parse(after)).not.toThrow();
    expect(after.food.currentDefinition).not.toEqual(before.food.currentDefinition);
    expect(after.food.observed).toEqual(before.food.observed);
    expect(after.occurrences).toEqual(before.occurrences);
    expect(after.occurrences.map((occurrence) => occurrence.localDate)).toEqual([
      '2026-08-24',
      '2026-08-23',
    ]);
  });

  it('keeps filters and pagination server-authoritative and scopes details by owner', () => {
    const store = setup();
    const query = {
      range: '30d' as const,
      end: '2026-08-25',
      timeZone: 'America/Detroit',
      sort: 'name' as const,
      usage: 'any' as const,
      verification: 'any' as const,
      review: 'any' as const,
      grams: 'any' as const,
      page: 1,
      limit: 1,
    };
    const first = store.getAnalytics('user-1', query);
    const second = store.getAnalytics('user-1', { ...query, page: 2 });

    expect(first.meta).toEqual({ page: 1, limit: 1, total: 2 });
    expect(second.meta).toEqual({ page: 2, limit: 1, total: 2 });
    expect([first.data.items[0]?.foodId, second.data.items[0]?.foodId].sort()).toEqual(
      [ids.yogurt, ids.bar].sort(),
    );
    expect(first.data.summary).toEqual(second.data.summary);
    expect(first.data.availableTags).toEqual(second.data.availableTags);
    expect(() =>
      store.getDetail('user-1', ids.foreign, {
        range: '30d',
        end: '2026-08-25',
        timeZone: 'America/Detroit',
        occurrencePage: 1,
        occurrenceLimit: 25,
      }),
    ).toThrow(FoodAnalyticsNotFoundError);
  });

  it('applies every filter, sort, tag intersection, and tie breaker before pagination', () => {
    const store = setup();
    seedFilterFoods();

    const idsFor = (overrides: Partial<FoodAnalyticsQuery>) =>
      store
        .getAnalytics('user-1', { ...baseQuery, ...overrides })
        .data.items.map((item) => item.foodId);

    expect(idsFor({ q: 'clear' })).toEqual([ids.clear]);
    expect(idsFor({ tags: ['protein', 'meal'] })).toEqual([ids.clear]);
    expect(idsFor({ usage: 'used' })).toEqual([ids.yogurt, ids.clear, ids.bar]);
    expect(idsFor({ usage: 'unused' })).toEqual([ids.tieA, ids.tieB, ids.unused]);
    expect(idsFor({ verification: 'verified' })).toEqual([ids.yogurt, ids.clear]);
    expect(idsFor({ verification: 'unverified' })).toEqual([
      ids.bar,
      ids.tieA,
      ids.tieB,
      ids.unused,
    ]);
    expect(idsFor({ review: 'clear' })).toEqual([ids.clear]);
    expect(idsFor({ review: 'needs_review' })).toEqual([
      ids.yogurt,
      ids.bar,
      ids.tieA,
      ids.tieB,
      ids.unused,
    ]);
    expect(idsFor({ grams: 'has_grams' })).toEqual([ids.yogurt, ids.clear]);
    expect(idsFor({ grams: 'missing_grams' })).toEqual([ids.bar, ids.tieA, ids.tieB, ids.unused]);

    const expectedOrder: Array<[FoodAnalyticsQuery['sort'], string[]]> = [
      ['most_used', [ids.yogurt, ids.clear, ids.bar, ids.tieA, ids.tieB, ids.unused]],
      ['most_recent', [ids.yogurt, ids.bar, ids.clear, ids.tieA, ids.tieB, ids.unused]],
      ['calorie_contribution', [ids.yogurt, ids.clear, ids.bar, ids.tieA, ids.tieB, ids.unused]],
      ['protein_contribution', [ids.yogurt, ids.clear, ids.bar, ids.tieA, ids.tieB, ids.unused]],
      ['protein_density', [ids.clear, ids.yogurt, ids.bar, ids.tieA, ids.tieB, ids.unused]],
      ['calorie_density', [ids.clear, ids.yogurt, ids.bar, ids.tieA, ids.tieB, ids.unused]],
      ['needs_review', [ids.bar, ids.tieA, ids.tieB, ids.unused, ids.yogurt, ids.clear]],
      ['name', [ids.clear, ids.yogurt, ids.bar, ids.tieA, ids.tieB, ids.unused]],
    ];
    for (const [sort, expected] of expectedOrder) {
      expect(idsFor({ sort }), sort).toEqual(expected);
    }

    const tiePageOne = idsFor({ q: 'tie', sort: 'name', page: 1, limit: 1 });
    const tiePageTwo = idsFor({ q: 'tie', sort: 'name', page: 2, limit: 1 });
    expect([...tiePageOne, ...tiePageTwo]).toEqual([ids.tieA, ids.tieB]);
  });

  it('reconciles snapshot corrections, item deletion, meal deletion, and food trash state', () => {
    const store = setup();
    if (!sqlite) throw new Error('Expected test database');
    const read = () => store.getAnalytics('user-1', baseQuery).data;

    sqlite
      .prepare(
        'update meal_items set calories = 250, protein = 25 where food_id = ? and calories = 200',
      )
      .run(ids.yogurt);
    expect(read().summary).toMatchObject({ linkedUsageOccurrences: 3, linkedFoodCalories: 400 });

    sqlite.prepare('delete from meal_items where food_id = ?').run(ids.bar);
    expect(read().summary).toMatchObject({ linkedUsageOccurrences: 2, linkedFoodCalories: 350 });

    sqlite
      .prepare("update foods set deleted_at = '2026-08-25T00:00:00.000Z' where id = ?")
      .run(ids.yogurt);
    expect(read().summary).toMatchObject({
      linkedUsageOccurrences: 0,
      linkedFoodCalories: 0,
      inactiveLinkedMealItemCount: 3,
      inactiveLinkedMealItemCalories: 425,
    });
    expect(read().items.map((item) => item.foodId)).not.toContain(ids.yogurt);

    sqlite.prepare('update foods set deleted_at = null where id = ?').run(ids.yogurt);
    expect(read().summary).toMatchObject({ linkedUsageOccurrences: 2, linkedFoodCalories: 350 });

    sqlite
      .prepare(
        `delete from meals where id = (
           select m.id from meals m join nutrition_logs nl on nl.id = m.nutrition_log_id
            where nl.user_id = 'user-1' and nl.date = '2026-08-24'
         )`,
      )
      .run();
    expect(read().summary).toMatchObject({ linkedUsageOccurrences: 1, linkedFoodCalories: 100 });
  });

  it('keeps zero-calorie density unavailable and rejects mixed historical portion units', () => {
    const store = setup();
    if (!sqlite) throw new Error('Expected test database');
    insertFood(sqlite, {
      id: ids.zero,
      userId: 'user-1',
      name: 'Zero Food',
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      servingGrams: 50,
      verified: 1,
      source: 'Label',
    });
    insertDay(sqlite, '2026-08-20', 'complete', [
      {
        id: 'zero-use',
        foodId: ids.zero,
        name: 'Zero Food',
        calories: 0,
        protein: 0,
        displayQuantity: 50,
        displayUnit: 'g',
      },
      {
        id: 'mixed-yogurt',
        foodId: ids.yogurt,
        name: 'Greek Yogurt',
        calories: 50,
        protein: 5,
        displayQuantity: 0.5,
        displayUnit: 'cup',
      },
    ]);

    const zero = store.getDetail('user-1', ids.zero, {
      range: '30d',
      end: '2026-08-25',
      timeZone: 'America/Detroit',
      occurrencePage: 1,
      occurrenceLimit: 25,
    }).food;
    expect(zero.currentDefinition.caloriesPer100Grams).toBe(0);
    expect(zero.currentDefinition.proteinPer100Kcal).toBeNull();
    expect(zero.observed.proteinPer100Kcal).toBeNull();

    const yogurt = store.getDetail('user-1', ids.yogurt, {
      range: '30d',
      end: '2026-08-25',
      timeZone: 'America/Detroit',
      occurrencePage: 1,
      occurrenceLimit: 25,
    }).food;
    expect(yogurt.observed.portion).toMatchObject({ state: 'mixed_units', unit: null });
    expect(yogurt.observed.caloriesPer100Grams).toBeNull();
  });

  it('uses only a program revision effective on the requested historical end date', () => {
    const store = setup();
    if (!sqlite) throw new Error('Expected test database');
    const input: AdaptiveProgramMutation = {
      status: 'active',
      timeZone: 'America/Detroit',
      heightCm: null,
      birthDate: null,
      rmrEquation: 'manual_tdee',
      activityLevel: null,
      manualBaselineTdeeKcal: 2500,
      goalType: 'maintain',
      targetWeightKg: null,
      goalRatePctPerWeek: 0,
      proteinGrams: 160,
      fatAllocationPct: 30,
      currentWeight: { weight: 80, unit: 'kg' },
      rebaseline: false,
      supersedePending: false,
    };
    createAdaptiveNutritionStore({
      db: drizzle(sqlite),
      sqlite,
      now: () => new Date('2026-08-25T16:00:00.000Z'),
    }).upsertProgram('user-1', input);

    const historical = store.getAnalytics('user-1', {
      ...baseQuery,
      end: '2026-08-20',
      timeZone: 'Asia/Tokyo',
    });
    expect(historical.data.range).toMatchObject({
      timeZone: 'Asia/Tokyo',
      timeZoneSource: 'request',
    });
    expect(() => store.getAnalytics('user-1', { ...baseQuery, timeZone: 'Asia/Tokyo' })).toThrow(
      FoodAnalyticsTimeZoneConflictError,
    );
  });

  it('keeps list and detail query counts bounded and explains the production statements', () => {
    const queries: string[] = [];
    const observedQueries: ObservedQuery[] = [];
    const store = setup((name, statement) => {
      queries.push(name);
      observedQueries.push({ name, statement });
    });
    for (const range of ['30d', '90d'] as const) {
      queries.length = 0;
      store.getAnalytics('user-1', {
        range,
        end: '2026-08-25',
        timeZone: 'America/Detroit',
        sort: 'most_used',
        usage: 'any',
        verification: 'any',
        review: 'any',
        grams: 'any',
        page: 1,
        limit: 1,
      });
      expect(queries, `${range} list statements`).toEqual([
        'program-authority',
        'summary',
        'saved-food-total',
        'review-total',
        'row-count',
        'rows',
        'portions',
        'tags',
      ]);

      queries.length = 0;
      store.getDetail('user-1', ids.yogurt, {
        range,
        end: '2026-08-25',
        timeZone: 'America/Detroit',
        occurrencePage: 1,
        occurrenceLimit: 1,
      });
      expect(queries, `${range} detail statements`).toEqual([
        'program-authority',
        'summary',
        'row-count',
        'rows',
        'portions',
        'occurrence-count',
        'occurrences',
      ]);
    }

    const productionStatements = observedQueries.filter(
      (query): query is Required<ObservedQuery> =>
        query.statement !== undefined && !query.name.startsWith('program-'),
    );
    expect(new Set(productionStatements.map((query) => query.name))).toEqual(
      new Set([
        'summary',
        'saved-food-total',
        'review-total',
        'row-count',
        'rows',
        'portions',
        'tags',
        'occurrence-count',
        'occurrences',
      ]),
    );
    const plans = productionStatements.map((query) => ({
      name: query.name,
      details: (
        sqlite
          ?.prepare(`explain query plan ${query.statement.sql}`)
          .all(query.statement.parameters) as Array<{ detail: string }>
      ).map((row) => row.detail),
    }));
    const rangeEvidenceNames = new Set([
      'summary',
      'review-total',
      'row-count',
      'rows',
      'portions',
      'occurrence-count',
      'occurrences',
    ]);
    for (const plan of plans) {
      if (rangeEvidenceNames.has(plan.name)) {
        expect(plan.details, `${plan.name}: bounded range is materialized`).toEqual(
          expect.arrayContaining([
            expect.stringContaining('MATERIALIZE range_logs'),
            expect.stringContaining('MATERIALIZE range_items'),
          ]),
        );
        expect(plan.details, `${plan.name}: nutrition log range index`).toEqual(
          expect.arrayContaining([expect.stringContaining('nutrition_logs_user_id_date_unique')]),
        );
        expect(plan.details, `${plan.name}: meal ownership index`).toEqual(
          expect.arrayContaining([expect.stringContaining('meals_nutrition_log_id_idx')]),
        );
        expect(plan.details, `${plan.name}: meal item index`).toEqual(
          expect.arrayContaining([expect.stringContaining('meal_items_meal_id_idx')]),
        );
      } else {
        expect(plan.details, `${plan.name}: owned foods index`).toEqual(
          expect.arrayContaining([expect.stringContaining('idx_foods_user_id_deleted_at')]),
        );
      }
    }
  });

  it('keeps bounded presets insensitive to 100,000 old linked occurrences', () => {
    const observedQueries: ObservedQuery[] = [];
    const store = setup((name, statement) => observedQueries.push({ name, statement }));
    if (!sqlite) throw new Error('Expected test database');
    insertDay(sqlite, '2026-05-27', 'complete', []);
    const presets = [
      { range: '30d' as const, startDate: '2026-07-27', expectedCalories: 300 },
      { range: '90d' as const, startDate: '2026-05-28', expectedCalories: 1_299 },
    ];
    const read = (range: '30d' | '90d') =>
      store.getAnalytics('user-1', { ...baseQuery, range, limit: 1 });
    for (const preset of presets) {
      expect(read(preset.range).data.items[0]?.observed.totalCalories).toBe(
        preset.expectedCalories,
      );
    }
    const measurements = presets.map((preset) => {
      const rowsQuery = observedQueries.find(
        (query): query is Required<ObservedQuery> =>
          query.name === 'rows' &&
          query.statement != null &&
          query.statement.parameters.startDate === preset.startDate,
      );
      if (!rowsQuery) throw new Error(`Expected captured ${preset.range} row query`);
      const prepared = sqlite?.prepare(rowsQuery.statement.sql);
      if (!prepared) throw new Error('Expected test database');
      const medianRuntime = () => {
        const values = Array.from({ length: 5 }, () => {
          const started = performance.now();
          prepared.all(rowsQuery.statement.parameters);
          return performance.now() - started;
        }).sort((a, b) => a - b);
        return values[2] ?? Number.POSITIVE_INFINITY;
      };
      medianRuntime();
      return { ...preset, medianRuntime, beforeMs: medianRuntime(), rowsQuery };
    });

    sqlite.exec(`
      with digits(n) as (values (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)),
      sequence(n) as (
        select a.n + b.n * 10 + c.n * 100 + d.n * 1000 + e.n * 10000
          from digits a cross join digits b cross join digits c cross join digits d cross join digits e
      )
      insert into meal_items
        (id, meal_id, food_id, name, amount, unit, calories, protein, carbs, fat, created_at)
      select printf('dense-old-%06d', n),
             '20000000-0000-4000-8000-000020260527',
             '${ids.yogurt}', 'Greek Yogurt', 1, 'serving', 999, 99, 0, 0, 1000 + n
        from sequence;
    `);

    for (const measurement of measurements) {
      expect(read(measurement.range).data.items[0]?.observed.totalCalories).toBe(
        measurement.expectedCalories,
      );
      const afterMs = measurement.medianRuntime();
      expect(afterMs, `${measurement.range} dense-history runtime`).toBeLessThan(
        measurement.beforeMs + 1,
      );

      const details = (
        sqlite
          .prepare(`explain query plan ${measurement.rowsQuery.statement.sql}`)
          .all(measurement.rowsQuery.statement.parameters) as Array<{ detail: string }>
      ).map((row) => row.detail);
      expect(details, `${measurement.range} dense-history plan`).toEqual(
        expect.arrayContaining([
          expect.stringContaining('MATERIALIZE range_logs'),
          expect.stringContaining('nutrition_logs_user_id_date_unique'),
          expect.stringContaining('meals_nutrition_log_id_idx'),
          expect.stringContaining('meal_items_meal_id_idx'),
        ]),
      );
      expect(
        details.some((detail) => detail.includes('meal_items_food_id_idx')),
        `${measurement.range} does not scan lifetime food history`,
      ).toBe(false);
    }
  });

  it('fails closed when an intermediate historical projection is missing', () => {
    setup();
    if (!sqlite) throw new Error('Expected test database');
    const input: AdaptiveProgramMutation = {
      status: 'active',
      timeZone: 'America/Detroit',
      heightCm: null,
      birthDate: null,
      rmrEquation: 'manual_tdee',
      activityLevel: null,
      manualBaselineTdeeKcal: 2500,
      goalType: 'maintain',
      targetWeightKg: null,
      goalRatePctPerWeek: 0,
      proteinGrams: 160,
      fatAllocationPct: 30,
      currentWeight: { weight: 80, unit: 'kg' },
      rebaseline: false,
      supersedePending: false,
    };
    createAdaptiveNutritionStore({
      db: drizzle(sqlite),
      sqlite,
      now: () => new Date('2026-08-20T16:00:00.000Z'),
    }).upsertProgram('user-1', input);
    const program = sqlite
      .prepare('select id from adaptive_nutrition_programs where user_id = ?')
      .get('user-1') as { id: string };
    const first = sqlite
      .prepare(
        `select sequence, effective_at as effectiveAt, snapshot
           from adaptive_nutrition_program_revisions
          where program_id = ? order by sequence desc limit 1`,
      )
      .get(program.id) as { sequence: number; effectiveAt: number; snapshot: string };
    const insertRevision = sqlite.prepare(
      `insert into adaptive_nutrition_program_revisions
        (id, program_id, user_id, sequence, effective_at, snapshot, source, created_at)
       values (@id, @programId, 'user-1', @sequence, @effectiveAt, @snapshot, 'program_updated', @effectiveAt)`,
    );
    const insertDate = sqlite.prepare(
      `insert into adaptive_nutrition_program_revision_dates
        (revision_id, program_id, user_id, sequence, effective_local_date, created_at)
       values (@id, @programId, 'user-1', @sequence, @effectiveLocalDate, @effectiveAt)`,
    );
    const revisions = [
      {
        id: 'middle-revision',
        sequence: first.sequence + 1,
        date: '2026-08-21',
        zone: 'America/Los_Angeles',
      },
      {
        id: 'latest-revision',
        sequence: first.sequence + 2,
        date: '2026-08-23',
        zone: 'Asia/Tokyo',
      },
    ];
    for (const revision of revisions) {
      const values = {
        id: revision.id,
        programId: program.id,
        sequence: revision.sequence,
        effectiveAt: first.effectiveAt + revision.sequence,
        effectiveLocalDate: revision.date,
        snapshot: JSON.stringify({ ...JSON.parse(first.snapshot), timeZone: revision.zone }),
      };
      insertRevision.run(values);
      insertDate.run(values);
    }
    const store = createFoodAnalyticsStore({
      sqlite,
      now: () => new Date('2026-08-25T16:00:00.000Z'),
    });
    expect(
      store.getAnalytics('user-1', {
        ...baseQuery,
        end: '2026-08-21',
        timeZone: 'America/Los_Angeles',
      }).data.range.timeZone,
    ).toBe('America/Los_Angeles');

    sqlite.exec(
      "insert into adaptive_nutrition_account_deletion_scope (user_id) values ('user-1')",
    );
    sqlite
      .prepare('delete from adaptive_nutrition_program_revision_dates where revision_id = ?')
      .run('middle-revision');
    sqlite.exec("delete from adaptive_nutrition_account_deletion_scope where user_id = 'user-1'");

    expect(() =>
      store.getAnalytics('user-1', {
        ...baseQuery,
        end: '2026-08-21',
        timeZone: undefined,
      }),
    ).toThrow(FoodAnalyticsProgramProjectionError);
    expect(() =>
      store.getAnalytics('user-1', {
        ...baseQuery,
        end: '2026-08-21',
        timeZone: 'America/Los_Angeles',
      }),
    ).toThrow(FoodAnalyticsProgramProjectionError);
  });

  it('selects one indexed program revision and fails closed when the latest projection is missing', () => {
    const initialStore = setup();
    if (!sqlite) throw new Error('Expected test database');
    const input: AdaptiveProgramMutation = {
      status: 'active',
      timeZone: 'America/Detroit',
      heightCm: null,
      birthDate: null,
      rmrEquation: 'manual_tdee',
      activityLevel: null,
      manualBaselineTdeeKcal: 2500,
      goalType: 'maintain',
      targetWeightKg: null,
      goalRatePctPerWeek: 0,
      proteinGrams: 160,
      fatAllocationPct: 30,
      currentWeight: { weight: 80, unit: 'kg' },
      rebaseline: false,
      supersedePending: false,
    };
    createAdaptiveNutritionStore({
      db: drizzle(sqlite),
      sqlite,
      now: () => new Date('2026-08-20T16:00:00.000Z'),
    }).upsertProgram('user-1', input);
    const program = sqlite
      .prepare('select id from adaptive_nutrition_programs where user_id = ?')
      .get('user-1') as { id: string };
    const first = sqlite
      .prepare(
        `select sequence, effective_at as effectiveAt, snapshot
           from adaptive_nutrition_program_revisions
          where program_id = ? order by sequence desc limit 1`,
      )
      .get(program.id) as { sequence: number; effectiveAt: number; snapshot: string };
    const insertRevision = sqlite.prepare(
      `insert into adaptive_nutrition_program_revisions
        (id, program_id, user_id, sequence, effective_at, snapshot, source, created_at)
       values (@id, @programId, 'user-1', @sequence, @effectiveAt, @snapshot, 'program_updated', @effectiveAt)`,
    );
    const insertDate = sqlite.prepare(
      `insert into adaptive_nutrition_program_revision_dates
        (revision_id, program_id, user_id, sequence, effective_local_date, created_at)
       values (@id, @programId, 'user-1', @sequence, @effectiveLocalDate, @effectiveAt)`,
    );
    sqlite.transaction(() => {
      for (let offset = 1; offset <= 2_000; offset += 1) {
        const sequence = first.sequence + offset;
        const id = `dense-revision-${String(sequence).padStart(6, '0')}`;
        const timeZone = offset % 2 === 0 ? 'Asia/Tokyo' : 'America/Los_Angeles';
        const snapshot = JSON.stringify({ ...JSON.parse(first.snapshot), timeZone });
        const values = {
          id,
          programId: program.id,
          sequence,
          effectiveAt: first.effectiveAt + offset,
          effectiveLocalDate: '2026-08-21',
          snapshot,
        };
        insertRevision.run(values);
        insertDate.run(values);
      }
    })();

    const observed: ObservedQuery[] = [];
    const store = createFoodAnalyticsStore({
      sqlite,
      now: () => new Date('2026-08-25T16:00:00.000Z'),
      onQuery: (name, statement) => observed.push({ name, statement }),
    });
    expect(
      store.getAnalytics('user-1', { ...baseQuery, timeZone: 'Asia/Tokyo' }).data.range,
    ).toMatchObject({
      timeZone: 'Asia/Tokyo',
      timeZoneSource: 'adaptive_program',
    });
    expect(
      store.getAnalytics('user-1', {
        ...baseQuery,
        end: '2026-08-21',
        timeZone: 'Asia/Tokyo',
      }).data.range.timeZone,
    ).toBe('Asia/Tokyo');
    expect(
      initialStore.getAnalytics('user-1', {
        ...baseQuery,
        end: '2026-08-19',
        timeZone: 'Pacific/Kiritimati',
      }).data.range,
    ).toMatchObject({ timeZone: 'Pacific/Kiritimati', timeZoneSource: 'request' });

    const programQueries = observed.filter(
      (query): query is Required<ObservedQuery> =>
        query.statement !== undefined && query.name.startsWith('program-'),
    );
    for (const query of programQueries) {
      expect(
        sqlite.prepare(query.statement.sql).all(query.statement.parameters),
        `${query.name}: constant-row selection`,
      ).toHaveLength(1);
      const plan = (
        sqlite
          .prepare(`explain query plan ${query.statement.sql}`)
          .all(query.statement.parameters) as Array<{ detail: string }>
      ).map((row) => row.detail);
      if (query.name === 'program-authority') {
        expect(plan.join('\n')).toContain('adaptive_nutrition_programs_user_id_unique');
      } else if (query.name === 'program-latest-revision') {
        expect(plan.join('\n')).toContain(
          'adaptive_nutrition_program_revisions_program_sequence_unique',
        );
      } else if (query.name === 'program-historical-revision') {
        expect(plan.join('\n')).toContain('adaptive_nutrition_program_revision_dates_lookup_idx');
      }
    }

    sqlite.exec(
      "insert into adaptive_nutrition_account_deletion_scope (user_id) values ('user-1')",
    );
    sqlite
      .prepare('delete from adaptive_nutrition_program_revision_dates where sequence = ?')
      .run(first.sequence + 2_000);
    sqlite.exec("delete from adaptive_nutrition_account_deletion_scope where user_id = 'user-1'");
    expect(() => store.getAnalytics('user-1', { ...baseQuery, timeZone: 'Asia/Tokyo' })).toThrow(
      FoodAnalyticsProgramProjectionError,
    );
  });
});
