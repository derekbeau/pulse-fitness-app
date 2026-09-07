import { materializeMealFood } from '../meals/food-plans.js';
import {
  FOOD_ALIAS_VERSION,
  foodQueryVariants,
  rankFoodMatches,
  buildPromotionCandidates,
} from '../foods/reuse-policy.js';
import { listOwnedFoodsForReuse } from '../foods/store.js';
import { refreshFoodUsage } from '../foods/store.js';
import { and, asc, between, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';

import { type ProteinFloorProgress } from '@pulse/shared';
import type {
  CreateMealInput,
  NutritionFoodMatch,
  NutritionLoggingContext,
  NutritionLoggingContextQuery,
  NutritionRecentMealItem,
  NutritionShorthandExpansion,
  NutritionWaterHabitState,
  NutritionWeekDaySummary,
  NutritionWeekSummary,
  PatchNutritionLogInput,
  PatchMealInput,
  PatchMealItemInput,
} from '@pulse/shared';

import {
  foods,
  habitEntries,
  habits,
  mealItems,
  meals,
  nutritionLogs,
  nutritionTargets,
} from '../../db/schema/index.js';
import { downgradeCompleteNutritionLogs } from '../../db/nutrition-completeness.js';
import { getApplicationNow } from '../../lib/clock.js';
import { getDailyEnergyAdherenceForDate } from './daily-energy-store.js';
import { getNutritionLocalDateForUser } from './status-store.js';

export type NutritionLogRecord = {
  id: string;
  userId: string;
  date: string;
  notes: string | null;
  status: 'unknown' | 'partial' | 'complete';
  statusUpdatedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type MealRecord = {
  id: string;
  nutritionLogId: string;
  name: string;
  summary: string | null;
  time: string | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
};

export type MealItemRecord = {
  id: string;
  mealId: string;
  foodId: string | null;
  name: string;
  amount: number;
  unit: string;
  displayQuantity: number | null;
  displayUnit: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
  createdAt: number;
};

export type DailyNutritionRecord = {
  log: NutritionLogRecord;
  meals: Array<{
    meal: MealRecord;
    items: MealItemRecord[];
  }>;
};

export type NutritionSummaryRecord = {
  date: string;
  notes: string | null;
  meals: number;
  actual: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  target: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  } | null;
  proteinFloor: ProteinFloorProgress;
};

const WEEK_DAYS = 7;
type MealInputItemWithMacros = CreateMealInput['items'][number] & {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export class MealFoodOwnershipError extends Error {
  constructor() {
    super('One or more foodIds do not belong to this user');
    this.name = 'MealFoodOwnershipError';
  }
}

const nutritionLogSelection = {
  id: nutritionLogs.id,
  userId: nutritionLogs.userId,
  date: nutritionLogs.date,
  notes: nutritionLogs.notes,
  status: nutritionLogs.status,
  statusUpdatedAt: nutritionLogs.statusUpdatedAt,
  createdAt: nutritionLogs.createdAt,
  updatedAt: nutritionLogs.updatedAt,
};

const mealSelection = {
  id: meals.id,
  nutritionLogId: meals.nutritionLogId,
  name: meals.name,
  summary: meals.summary,
  time: meals.time,
  notes: meals.notes,
  createdAt: meals.createdAt,
  updatedAt: meals.updatedAt,
};

const mealItemSelection = {
  id: mealItems.id,
  mealId: mealItems.mealId,
  foodId: mealItems.foodId,
  name: mealItems.name,
  amount: mealItems.amount,
  unit: mealItems.unit,
  displayQuantity: mealItems.displayQuantity,
  displayUnit: mealItems.displayUnit,
  calories: mealItems.calories,
  protein: mealItems.protein,
  carbs: mealItems.carbs,
  fat: mealItems.fat,
  fiber: mealItems.fiber,
  sugar: mealItems.sugar,
  createdAt: mealItems.createdAt,
};

const nutritionSummarySelection = {
  notes: nutritionLogs.notes,
  calories: sql<number>`coalesce(sum(${mealItems.calories}), 0)`,
  protein: sql<number>`coalesce(sum(${mealItems.protein}), 0)`,
  carbs: sql<number>`coalesce(sum(${mealItems.carbs}), 0)`,
  fat: sql<number>`coalesce(sum(${mealItems.fat}), 0)`,
  meals: sql<number>`count(distinct ${meals.id})`,
};

const nutritionTargetMacroSelection = {
  calories: nutritionTargets.calories,
  protein: nutritionTargets.protein,
  carbs: nutritionTargets.carbs,
  fat: nutritionTargets.fat,
};

const toNullable = <T>(value: T | undefined): T | null => value ?? null;
const isTrackedFoodId = (foodId: string | null): foodId is string =>
  typeof foodId === 'string' && foodId.length > 0;

const clampToUnitRange = (value: number) => Math.max(0, Math.min(1, value));

const toDateKey = (date: Date) => date.toISOString().slice(0, 10);

const addUtcDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
};

const addUtcDateKeyDays = (date: string, days: number) => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const getWeekStartMonday = (date: Date) => {
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addUtcDays(date, offset);
};

const normalizeSearchText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const STANDARD_SHAKE_EXPANSION: NutritionShorthandExpansion = {
  phrase: 'standard shake',
  label: 'Standard shake',
  score: 1,
  reason: 'Known shorthand for the usual protein shake ingredients.',
  items: [
    {
      foodName: 'Orgain Chocolate Protein Powder',
      quantity: 0.5,
      unit: 'serving',
      displayQuantity: 1,
      displayUnit: 'scoop',
      reason: '0.5 saved serving is logged as 1 scoop.',
    },
    {
      foodName: "Anthony's Premium Pea Protein",
      quantity: 1.9,
      unit: 'serving',
      displayQuantity: 1.9,
      displayUnit: 'Tbsp',
      reason: 'Known shake ratio uses 1.9 saved servings/Tbsp.',
    },
  ],
};

export const buildNutritionLoggingContextVariants = foodQueryVariants;

export const getNutritionShorthandExpansions = (
  query: string | undefined,
): NutritionShorthandExpansion[] => {
  if (!query) {
    return [STANDARD_SHAKE_EXPANSION];
  }

  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.includes('standard shake') || normalizedQuery.includes('protein shake')) {
    return [STANDARD_SHAKE_EXPANSION];
  }

  return [];
};

const listFrequentFoodMatches = async (
  userId: string,
  limit: number,
): Promise<NutritionFoodMatch[]> => {
  const { listFoods } = await import('../foods/store.js');
  const result = await listFoods(userId, {
    sort: 'most-used',
    page: 1,
    limit,
  });

  return result.foods.map((food) => ({
    food,
    score: clampToUnitRange(food.usageCount / 10),
    reason:
      food.usageCount > 0
        ? `Frequent saved food used ${food.usageCount} time${food.usageCount === 1 ? '' : 's'}.`
        : 'Saved food available for quick logging.',
    matchedVariant: null,
    evidence: [{ category: 'frequent', field: 'usage', value: String(food.usageCount) }],
    ambiguity: 'none',
    aliasVersion: FOOD_ALIAS_VERSION,
  }));
};

const listRecentMealItems = async ({
  userId,
  date,
  days,
  limit,
}: {
  userId: string;
  date: string;
  days: number;
  limit?: number;
}): Promise<NutritionRecentMealItem[]> => {
  const { db } = await import('../../db/index.js');
  const fromDate = addUtcDateKeyDays(date, -days);
  const toDate = addUtcDateKeyDays(date, -1);

  const rows = db
    .select({
      date: nutritionLogs.date,
      contextMealId: meals.id,
      mealName: meals.name,
      mealTime: meals.time,
      id: mealItems.id,
      itemMealId: mealItems.mealId,
      foodId: mealItems.foodId,
      name: mealItems.name,
      amount: mealItems.amount,
      unit: mealItems.unit,
      displayQuantity: mealItems.displayQuantity,
      displayUnit: mealItems.displayUnit,
      calories: mealItems.calories,
      protein: mealItems.protein,
      carbs: mealItems.carbs,
      fat: mealItems.fat,
      fiber: mealItems.fiber,
      sugar: mealItems.sugar,
      createdAt: mealItems.createdAt,
    })
    .from(nutritionLogs)
    .innerJoin(meals, eq(meals.nutritionLogId, nutritionLogs.id))
    .innerJoin(mealItems, eq(mealItems.mealId, meals.id))
    .where(and(eq(nutritionLogs.userId, userId), between(nutritionLogs.date, fromDate, toDate)))
    .orderBy(
      desc(nutritionLogs.date),
      desc(meals.createdAt),
      desc(mealItems.createdAt),
      asc(mealItems.id),
    )
    .limit(limit ?? -1)
    .all();

  return rows.map((row) => ({
    date: row.date,
    mealId: row.contextMealId,
    mealName: row.mealName,
    mealTime: row.mealTime,
    item: {
      id: row.id,
      mealId: row.itemMealId,
      foodId: row.foodId,
      name: row.name,
      amount: row.amount,
      unit: row.unit,
      displayQuantity: row.displayQuantity,
      displayUnit: row.displayUnit,
      calories: row.calories,
      protein: row.protein,
      carbs: row.carbs,
      fat: row.fat,
      fiber: row.fiber,
      sugar: row.sugar,
      createdAt: row.createdAt,
    },
  }));
};

const getWaterHabitState = async (
  userId: string,
  date: string,
): Promise<NutritionWaterHabitState> => {
  const { db } = await import('../../db/index.js');
  const waterPattern = '%water%';
  const habit = db
    .select({
      id: habits.id,
      name: habits.name,
      trackingType: habits.trackingType,
      target: habits.target,
      unit: habits.unit,
    })
    .from(habits)
    .where(
      and(
        eq(habits.userId, userId),
        eq(habits.active, true),
        isNull(habits.deletedAt),
        sql`lower(${habits.name}) like ${waterPattern}`,
      ),
    )
    .orderBy(asc(habits.sortOrder), asc(habits.createdAt))
    .limit(1)
    .get();

  if (!habit) {
    return null;
  }

  const entry = db
    .select({
      completed: habitEntries.completed,
      value: habitEntries.value,
      isOverride: habitEntries.isOverride,
    })
    .from(habitEntries)
    .where(
      and(
        eq(habitEntries.userId, userId),
        eq(habitEntries.habitId, habit.id),
        eq(habitEntries.date, date),
      ),
    )
    .limit(1)
    .get();

  return {
    habitId: habit.id,
    name: habit.name,
    trackingType: habit.trackingType,
    target: habit.target,
    unit: habit.unit,
    date,
    completed: entry?.completed ?? false,
    value: entry?.value ?? null,
    isOverride: entry?.isOverride ?? false,
  };
};

export const calculateNutritionCompleteness = (input: {
  calories: number;
  caloriesTarget: number;
  protein: number;
  proteinTarget: number;
  mealCount: number;
}): number => {
  if (input.mealCount <= 0) {
    return 0;
  }

  const ratios: number[] = [];

  if (input.caloriesTarget > 0) {
    ratios.push(input.calories / input.caloriesTarget);
  }
  if (input.proteinTarget > 0) {
    ratios.push(input.protein / input.proteinTarget);
  }

  if (ratios.length === 0) {
    return 0;
  }

  const averageRatio = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
  return clampToUnitRange(averageRatio);
};

export const createMealForDate = async (
  userId: string,
  date: string,
  input: CreateMealInput,
): Promise<{ meal: MealRecord; items: MealItemRecord[] }> => {
  const { db } = await import('../../db/index.js');

  const created = db.transaction((tx) => {
    tx.insert(nutritionLogs)
      .values({
        userId,
        date,
      })
      .onConflictDoNothing({
        target: [nutritionLogs.userId, nutritionLogs.date],
      })
      .run();

    const nutritionLog = tx
      .select(nutritionLogSelection)
      .from(nutritionLogs)
      .where(and(eq(nutritionLogs.userId, userId), eq(nutritionLogs.date, date)))
      .limit(1)
      .get();

    if (!nutritionLog) {
      throw new Error('Failed to load nutrition log');
    }

    const meal = tx
      .insert(meals)
      .values({
        nutritionLogId: nutritionLog.id,
        name: input.name,
        summary: toNullable(input.summary),
        time: toNullable(input.time),
        notes: toNullable(input.notes),
      })
      .returning(mealSelection)
      .get();

    if (!meal) {
      throw new Error('Failed to persist meal');
    }

    const itemValues = (input.items as MealInputItemWithMacros[]).map((inputItem) => {
      const item = materializeMealFood(tx, userId, inputItem);
      return {
        mealId: meal.id,
        foodId: toNullable(item.foodId),
        name: item.name,
        amount: item.amount,
        unit: item.unit,
        displayQuantity: toNullable(item.displayQuantity),
        displayUnit: toNullable(item.displayUnit),
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        fiber: toNullable(item.fiber),
        sugar: toNullable(item.sugar),
      };
    });

    const foodIds = [...new Set(itemValues.map((item) => item.foodId).filter(isTrackedFoodId))];
    if (foodIds.length > 0) {
      const ownedFoods = tx
        .select({ id: foods.id })
        .from(foods)
        .where(and(inArray(foods.id, foodIds), eq(foods.userId, userId), isNull(foods.deletedAt)))
        .all();

      if (ownedFoods.length !== foodIds.length) {
        throw new MealFoodOwnershipError();
      }
    }

    const items = tx.insert(mealItems).values(itemValues).returning(mealItemSelection).all();

    if (items.length !== input.items.length) {
      throw new Error('Failed to persist meal items');
    }

    downgradeCompleteNutritionLogs(tx, [nutritionLog.id]);

    refreshFoodUsage(
      tx,
      userId,
      items.map((item) => item.foodId),
    );
    return { meal, items };
  });

  return created;
};

export const getDailyNutritionForDate = async (
  userId: string,
  date: string,
): Promise<DailyNutritionRecord | null> => {
  const { db } = await import('../../db/index.js');

  return readDailyNutrition(db, userId, date);
};

// Share the owned read model with the note transaction so its response is atomic.
const readDailyNutrition = (
  db: Pick<(typeof import('../../db/index.js'))['db'], 'select'>,
  userId: string,
  date: string,
): DailyNutritionRecord | null => {
  const log = db
    .select(nutritionLogSelection)
    .from(nutritionLogs)
    .where(and(eq(nutritionLogs.userId, userId), eq(nutritionLogs.date, date)))
    .limit(1)
    .get();

  if (!log) {
    return null;
  }

  const dayMeals = db
    .select(mealSelection)
    .from(meals)
    .where(eq(meals.nutritionLogId, log.id))
    .orderBy(asc(meals.createdAt))
    .all();

  if (dayMeals.length === 0) {
    return {
      log,
      meals: [],
    };
  }

  const mealIds = dayMeals.map((meal) => meal.id);
  const items = db
    .select(mealItemSelection)
    .from(mealItems)
    .where(inArray(mealItems.mealId, mealIds))
    .orderBy(asc(mealItems.createdAt))
    .all();

  const itemsByMealId = new Map<string, MealItemRecord[]>();
  for (const item of items) {
    const existingItems = itemsByMealId.get(item.mealId) ?? [];
    existingItems.push(item);
    itemsByMealId.set(item.mealId, existingItems);
  }

  return {
    log,
    meals: dayMeals.map((meal) => ({
      meal,
      items: itemsByMealId.get(meal.id) ?? [],
    })),
  };
};

export const patchNutritionLogForDate = async (
  userId: string,
  date: string,
  input: PatchNutritionLogInput,
): Promise<DailyNutritionRecord | null> => {
  const { db } = await import('../../db/index.js');

  return db.transaction(
    (tx) => {
      const ownerDate = and(eq(nutritionLogs.userId, userId), eq(nutritionLogs.date, date));
      const log = tx.select(nutritionLogSelection).from(nutritionLogs).where(ownerDate).get();

      if (input.notes !== undefined && input.notes !== (log?.notes ?? null)) {
        if (log) {
          tx.update(nutritionLogs)
            .set({ notes: input.notes, updatedAt: log.updatedAt })
            .where(ownerDate)
            .run();
        } else {
          tx.insert(nutritionLogs).values({ userId, date, notes: input.notes }).run();
        }
      }

      // Omitted and repeated writes are true no-ops; clearing an absent day stays absent.
      // Notes never change completeness or refresh food usage projections.
      return readDailyNutrition(tx, userId, date);
    },
    { behavior: 'immediate' },
  );
};

export const getDailyNutritionSummaryForDate = async (
  userId: string,
  date: string,
): Promise<NutritionSummaryRecord> => {
  const { db } = await import('../../db/index.js');

  const actuals = db
    .select(nutritionSummarySelection)
    .from(nutritionLogs)
    .leftJoin(meals, eq(meals.nutritionLogId, nutritionLogs.id))
    .leftJoin(mealItems, eq(mealItems.mealId, meals.id))
    .where(and(eq(nutritionLogs.userId, userId), eq(nutritionLogs.date, date)))
    .get() ?? {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    meals: 0,
    notes: null,
  };

  const target =
    db
      .select(nutritionTargetMacroSelection)
      .from(nutritionTargets)
      .where(and(eq(nutritionTargets.userId, userId), lte(nutritionTargets.effectiveDate, date)))
      .orderBy(desc(nutritionTargets.effectiveDate))
      .limit(1)
      .get() ?? null;
  const dailyEnergy = await getDailyEnergyAdherenceForDate(userId, date);
  const acceptedProteinFloorGrams = dailyEnergy.proteinFloor.proteinFloorGrams;

  return {
    date,
    notes: actuals.notes ?? null,
    meals: Number(actuals.meals ?? 0),
    actual: {
      calories: Number(actuals.calories ?? 0),
      protein: dailyEnergy.proteinFloor.actualProteinGrams ?? Number(actuals.protein ?? 0),
      carbs: Number(actuals.carbs ?? 0),
      fat: Number(actuals.fat ?? 0),
    },
    target: target
      ? {
          calories: Number(target.calories),
          // Legacy macro targets cannot represent an unavailable protein floor.
          // Keep the numeric compatibility field neutral instead of leaking a
          // mutable materialized target that is not causally valid for `date`.
          protein: acceptedProteinFloorGrams ?? 0,
          carbs: Number(target.carbs),
          fat: Number(target.fat),
        }
      : null,
    proteinFloor: dailyEnergy.proteinFloor,
  };
};

export const getNutritionLoggingContext = async (
  userId: string,
  input: NutritionLoggingContextQuery,
): Promise<NutritionLoggingContext> => {
  const date = input.date ?? (await getNutritionLocalDateForUser(userId, getApplicationNow()));
  const query = input.q;
  const variants = buildNutritionLoggingContextVariants(query);
  const days = input.days ?? 7;
  const limitFoods = input.limitFoods ?? 10;
  const limitRecentItems = input.limitRecentItems ?? 50;

  const [nutrition, summary, history, ownedFoods, frequentFoods, shorthandExpansions, waterHabit] =
    await Promise.all([
      getDailyNutritionForDate(userId, date),
      getDailyNutritionSummaryForDate(userId, date),
      listRecentMealItems({ userId, date, days: 30 }),
      listOwnedFoodsForReuse(userId),
      listFrequentFoodMatches(userId, limitFoods),
      Promise.resolve(getNutritionShorthandExpansions(query)),
      getWaterHabitState(userId, date),
    ]);

  return {
    date,
    query: {
      q: query ?? null,
      variants,
    },
    today: {
      nutrition,
      summary,
    },
    recentMealItems: history
      .filter((entry) => entry.date >= addUtcDateKeyDays(date, -days))
      .slice(0, limitRecentItems),
    savedFoodMatches: rankFoodMatches(
      ownedFoods,
      query,
      history.filter((entry) => entry.date >= addUtcDateKeyDays(date, -days)),
    ).slice(0, limitFoods),
    promotionCandidates: buildPromotionCandidates(history, ownedFoods),
    frequentFoods,
    shorthandExpansions,
    waterHabit,
  };
};

export const getNutritionWeekSummaryForDate = async (
  userId: string,
  centerDate: Date,
): Promise<NutritionWeekSummary> => {
  const { db } = await import('../../db/index.js');

  const normalizedCenterDate = new Date(
    Date.UTC(centerDate.getUTCFullYear(), centerDate.getUTCMonth(), centerDate.getUTCDate()),
  );
  const weekStart = getWeekStartMonday(normalizedCenterDate);
  const weekDates = Array.from({ length: WEEK_DAYS }, (_unused, index) =>
    toDateKey(addUtcDays(weekStart, index)),
  );
  const weekFrom = toDateKey(weekStart);
  const weekTo = toDateKey(addUtcDays(weekStart, WEEK_DAYS - 1));

  const actualRows = db
    .select({
      date: nutritionLogs.date,
      notes: nutritionLogs.notes,
      calories: sql<number>`coalesce(sum(${mealItems.calories}), 0)`,
      protein: sql<number>`coalesce(sum(${mealItems.protein}), 0)`,
      mealCount: sql<number>`count(distinct ${meals.id})`,
    })
    .from(nutritionLogs)
    .leftJoin(meals, eq(meals.nutritionLogId, nutritionLogs.id))
    .leftJoin(mealItems, eq(mealItems.mealId, meals.id))
    .where(and(eq(nutritionLogs.userId, userId), between(nutritionLogs.date, weekFrom, weekTo)))
    .groupBy(nutritionLogs.date)
    .all();

  const targetRows = db
    .select({
      effectiveDate: nutritionTargets.effectiveDate,
      calories: nutritionTargets.calories,
      protein: nutritionTargets.protein,
    })
    .from(nutritionTargets)
    .where(and(eq(nutritionTargets.userId, userId), lte(nutritionTargets.effectiveDate, weekTo)))
    .orderBy(desc(nutritionTargets.effectiveDate))
    .limit(WEEK_DAYS + 1)
    .all();
  const targetRowsAsc = targetRows.reverse();

  const actualByDate = new Map(
    actualRows.map((row) => [
      row.date,
      {
        calories: Number(row.calories ?? 0),
        protein: Number(row.protein ?? 0),
        mealCount: Number(row.mealCount ?? 0),
        hasNote: Boolean(row.notes?.trim()),
      },
    ]),
  );

  const targetsByDate = new Map<string, { calories: number; protein: number }>();
  let targetIndex = 0;
  let currentTarget: { calories: number; protein: number } = { calories: 0, protein: 0 };

  for (const date of weekDates) {
    while (
      targetIndex < targetRowsAsc.length &&
      targetRowsAsc[targetIndex]?.effectiveDate <= date
    ) {
      const target = targetRowsAsc[targetIndex];
      currentTarget = {
        calories: Number(target.calories),
        protein: Number(target.protein),
      };
      targetIndex += 1;
    }
    targetsByDate.set(date, currentTarget);
  }

  return weekDates.map<NutritionWeekDaySummary>((date) => {
    const actual = actualByDate.get(date) ?? {
      calories: 0,
      protein: 0,
      mealCount: 0,
      hasNote: false,
    };
    const target = targetsByDate.get(date) ?? { calories: 0, protein: 0 };

    return {
      date,
      calories: actual.calories,
      caloriesTarget: target.calories,
      protein: actual.protein,
      proteinTarget: target.protein,
      mealCount: actual.mealCount,
      hasNote: actual.hasNote,
      completeness: calculateNutritionCompleteness({
        calories: actual.calories,
        caloriesTarget: target.calories,
        protein: actual.protein,
        proteinTarget: target.protein,
        mealCount: actual.mealCount,
      }),
    };
  });
};

export const deleteMealForDate = async (
  userId: string,
  date: string,
  mealId: string,
): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  const deleteResult = db.transaction((tx) => {
    const scopedMeal = tx
      .select({ id: meals.id, nutritionLogId: meals.nutritionLogId })
      .from(meals)
      .innerJoin(nutritionLogs, eq(nutritionLogs.id, meals.nutritionLogId))
      .where(
        and(eq(meals.id, mealId), eq(nutritionLogs.userId, userId), eq(nutritionLogs.date, date)),
      )
      .limit(1)
      .get();

    if (!scopedMeal) {
      return {
        deleted: false,
        foodIds: [] as string[],
      };
    }

    const existingItems = tx
      .select({ foodId: mealItems.foodId })
      .from(mealItems)
      .where(eq(mealItems.mealId, mealId))
      .all();

    tx.delete(mealItems).where(eq(mealItems.mealId, mealId)).run();
    const result = tx.delete(meals).where(eq(meals.id, mealId)).run();

    if (result.changes !== 1) throw new Error('Failed to delete meal');
    downgradeCompleteNutritionLogs(tx, [scopedMeal.nutritionLogId]);

    refreshFoodUsage(
      tx,
      userId,
      existingItems.map((item) => item.foodId),
    );
    return {
      deleted: result.changes === 1,
      foodIds: existingItems.map((item) => item.foodId).filter(isTrackedFoodId),
    };
  });

  if (!deleteResult.deleted) {
    return false;
  }

  return true;
};

export const findMealForDate = async (
  userId: string,
  date: string,
  mealId: string,
): Promise<MealRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(mealSelection)
    .from(meals)
    .innerJoin(nutritionLogs, eq(nutritionLogs.id, meals.nutritionLogId))
    .where(
      and(eq(meals.id, mealId), eq(nutritionLogs.userId, userId), eq(nutritionLogs.date, date)),
    )
    .limit(1)
    .get();
};

export const findMealById = async (
  userId: string,
  mealId: string,
): Promise<MealRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(mealSelection)
    .from(meals)
    .innerJoin(nutritionLogs, eq(nutritionLogs.id, meals.nutritionLogId))
    .where(and(eq(meals.id, mealId), eq(nutritionLogs.userId, userId)))
    .limit(1)
    .get();
};

export const addItemsToMeal = async (
  userId: string,
  mealId: string,
  items: MealInputItemWithMacros[],
): Promise<{ meal: MealRecord; items: MealItemRecord[] } | undefined> => {
  const { db } = await import('../../db/index.js');

  const now = Date.now();
  type AddItemsToMealTransactionResult =
    | {
        meal: MealRecord;
        items: MealItemRecord[];
        // Newly inserted items are used for the transactional projection.
        insertedItems: MealItemRecord[];
      }
    | undefined;

  const updated: AddItemsToMealTransactionResult = db.transaction((tx) => {
    const meal = tx
      .select(mealSelection)
      .from(meals)
      .innerJoin(nutritionLogs, eq(nutritionLogs.id, meals.nutritionLogId))
      .where(and(eq(meals.id, mealId), eq(nutritionLogs.userId, userId)))
      .limit(1)
      .get();

    if (!meal) {
      return undefined;
    }

    const itemValues = items
      .map((item) => materializeMealFood(tx, userId, item))
      .map((item) => ({
        mealId: meal.id,
        foodId: toNullable(item.foodId),
        name: item.name,
        amount: item.amount,
        unit: item.unit,
        displayQuantity: toNullable(item.displayQuantity),
        displayUnit: toNullable(item.displayUnit),
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        fiber: toNullable(item.fiber),
        sugar: toNullable(item.sugar),
      }));

    const foodIds = [...new Set(itemValues.map((item) => item.foodId).filter(isTrackedFoodId))];
    if (foodIds.length > 0) {
      const ownedFoods = tx
        .select({ id: foods.id })
        .from(foods)
        .where(and(inArray(foods.id, foodIds), eq(foods.userId, userId), isNull(foods.deletedAt)))
        .all();

      if (ownedFoods.length !== foodIds.length) {
        throw new MealFoodOwnershipError();
      }
    }

    const insertedItems = tx
      .insert(mealItems)
      .values(itemValues)
      .returning(mealItemSelection)
      .all();

    if (insertedItems.length !== items.length) {
      throw new Error('Failed to persist meal items');
    }

    const updatedMeal = tx
      .update(meals)
      .set({
        updatedAt: now,
      })
      .where(eq(meals.id, meal.id))
      .returning(mealSelection)
      .get();

    if (!updatedMeal) {
      throw new Error('Failed to persist meal update');
    }

    downgradeCompleteNutritionLogs(tx, [meal.nutritionLogId], now);

    const allItems = tx
      .select(mealItemSelection)
      .from(mealItems)
      .where(eq(mealItems.mealId, meal.id))
      .orderBy(asc(mealItems.createdAt))
      .all();

    refreshFoodUsage(
      tx,
      userId,
      insertedItems.map((item) => item.foodId),
    );
    return {
      meal: updatedMeal,
      items: allItems,
      insertedItems,
    };
  });

  if (!updated) {
    return undefined;
  }

  return {
    meal: updated.meal,
    items: updated.items,
  };
};

export const patchMealById = async (
  userId: string,
  mealId: string,
  updates: PatchMealInput,
): Promise<MealRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  const now = Date.now();
  const mealUpdate: Partial<typeof meals.$inferInsert> = {
    updatedAt: now,
  };

  if (updates.name !== undefined) {
    mealUpdate.name = updates.name;
  }
  if (updates.summary !== undefined) {
    mealUpdate.summary = updates.summary;
  }
  if (updates.time !== undefined) {
    mealUpdate.time = updates.time;
  }
  if (updates.notes !== undefined) {
    mealUpdate.notes = updates.notes;
  }

  return db.transaction((tx) => {
    const existingMeal = tx
      .select(mealSelection)
      .from(meals)
      .innerJoin(nutritionLogs, eq(nutritionLogs.id, meals.nutritionLogId))
      .where(and(eq(meals.id, mealId), eq(nutritionLogs.userId, userId)))
      .limit(1)
      .get();

    if (!existingMeal) {
      return undefined;
    }

    const updatedMeal = tx
      .update(meals)
      .set(mealUpdate)
      .where(and(eq(meals.id, mealId), eq(meals.nutritionLogId, existingMeal.nutritionLogId)))
      .returning(mealSelection)
      .get();

    if (updatedMeal) {
      downgradeCompleteNutritionLogs(tx, [existingMeal.nutritionLogId], now);
    }

    return updatedMeal;
  });
};

export const findMealItemForDate = async (
  userId: string,
  date: string,
  mealId: string,
  itemId: string,
): Promise<MealItemRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(mealItemSelection)
    .from(mealItems)
    .innerJoin(meals, eq(meals.id, mealItems.mealId))
    .innerJoin(nutritionLogs, eq(nutritionLogs.id, meals.nutritionLogId))
    .where(
      and(
        eq(mealItems.id, itemId),
        eq(mealItems.mealId, mealId),
        eq(nutritionLogs.userId, userId),
        eq(nutritionLogs.date, date),
      ),
    )
    .limit(1)
    .get();
};

export const findMealItemById = async (
  userId: string,
  mealId: string,
  itemId: string,
): Promise<MealItemRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(mealItemSelection)
    .from(mealItems)
    .innerJoin(meals, eq(meals.id, mealItems.mealId))
    .innerJoin(nutritionLogs, eq(nutritionLogs.id, meals.nutritionLogId))
    .where(
      and(eq(mealItems.id, itemId), eq(mealItems.mealId, mealId), eq(nutritionLogs.userId, userId)),
    )
    .limit(1)
    .get();
};

export const patchMealItemById = async (
  userId: string,
  mealId: string,
  itemId: string,
  updates: PatchMealItemInput,
): Promise<MealItemRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  const updated = db.transaction((tx) => {
    const itemUpdate: Partial<typeof mealItems.$inferInsert> = {};
    const existingItem = tx
      .select({
        ...mealItemSelection,
        nutritionLogId: meals.nutritionLogId,
      })
      .from(mealItems)
      .innerJoin(meals, eq(meals.id, mealItems.mealId))
      .innerJoin(nutritionLogs, eq(nutritionLogs.id, meals.nutritionLogId))
      .where(
        and(
          eq(mealItems.id, itemId),
          eq(mealItems.mealId, mealId),
          eq(nutritionLogs.userId, userId),
        ),
      )
      .limit(1)
      .get();

    if (!existingItem) {
      return undefined;
    }

    if (updates.name !== undefined) {
      itemUpdate.name = updates.name;
    }
    if (updates.amount !== undefined) {
      itemUpdate.amount = updates.amount;
    }
    if (updates.unit !== undefined) {
      itemUpdate.unit = updates.unit;
    }
    if (updates.calories !== undefined) {
      itemUpdate.calories = updates.calories;
    }
    if (updates.protein !== undefined) {
      itemUpdate.protein = updates.protein;
    }
    if (updates.carbs !== undefined) {
      itemUpdate.carbs = updates.carbs;
    }
    if (updates.fat !== undefined) {
      itemUpdate.fat = updates.fat;
    }
    if (updates.fiber !== undefined) {
      itemUpdate.fiber = updates.fiber;
    }
    if (updates.sugar !== undefined) {
      itemUpdate.sugar = updates.sugar;
    }
    if (updates.foodId !== undefined) {
      const nextFoodId = toNullable(updates.foodId);
      if (isTrackedFoodId(nextFoodId)) {
        const ownedFoods = tx
          .select({ id: foods.id })
          .from(foods)
          .where(and(eq(foods.id, nextFoodId), eq(foods.userId, userId), isNull(foods.deletedAt)))
          .all();

        if (ownedFoods.length !== 1) {
          throw new MealFoodOwnershipError();
        }
      }
      itemUpdate.foodId = nextFoodId;
    }

    const updatedItem = tx
      .update(mealItems)
      .set(itemUpdate)
      .where(and(eq(mealItems.id, itemId), eq(mealItems.mealId, mealId)))
      .returning(mealItemSelection)
      .get();

    if (!updatedItem) {
      return undefined;
    }

    downgradeCompleteNutritionLogs(tx, [existingItem.nutritionLogId]);

    refreshFoodUsage(tx, userId, [existingItem.foodId, updatedItem.foodId]);
    return {
      previousFoodId: existingItem.foodId,
      updatedItem,
    };
  });

  if (!updated) {
    return undefined;
  }

  return updated.updatedItem;
};
