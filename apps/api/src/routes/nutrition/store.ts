import { and, asc, between, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';

import type {
  CreateMealInput,
  NutritionWeekDaySummary,
  NutritionWeekSummary,
  PatchMealInput,
  PatchMealItemInput,
} from '@pulse/shared';

import { foods, mealItems, meals, nutritionLogs, nutritionTargets } from '../../db/schema/index.js';

export type NutritionLogRecord = {
  id: string;
  userId: string;
  date: string;
  notes: string | null;
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
};

const WEEK_DAYS = 7;
type FoodUsageTrackingEffect =
  | {
      action: 'increment';
      foodId: string;
    }
  | {
      action: 'decrement';
      foodId: string;
    };
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

const getWeekStartMonday = (date: Date) => {
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addUtcDays(date, offset);
};

const logFoodUsageTrackingFailure = (
  userId: string,
  effect: FoodUsageTrackingEffect,
  reason: unknown,
  context: string,
) => {
  console.warn(`Failed to ${effect.action} food usage in meal store during ${context}`, {
    err: reason,
    foodId: effect.foodId,
    userId,
  });
};

const applyFoodUsageTrackingEffects = async (
  userId: string,
  effects: FoodUsageTrackingEffect[],
  context: string,
) => {
  if (effects.length === 0) {
    return;
  }

  try {
    const { decrementFoodUsage, trackFoodUsage } = await import('../foods/store.js');
    const results = await Promise.allSettled(
      effects.map((effect) =>
        effect.action === 'increment'
          ? trackFoodUsage(effect.foodId, userId)
          : decrementFoodUsage(effect.foodId, userId),
      ),
    );

    results.forEach((result, index) => {
      const effect = effects[index];
      if (result.status === 'rejected') {
        if (!effect) {
          return;
        }

        logFoodUsageTrackingFailure(userId, effect, result.reason, context);
      }
    });
  } catch (error) {
    effects.forEach((effect) => {
      logFoodUsageTrackingFailure(userId, effect, error, context);
    });
  }
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

    const itemValues = (input.items as MealInputItemWithMacros[]).map((item) => {
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

    return { meal, items };
  });

  await applyFoodUsageTrackingEffects(
    userId,
    created.items.flatMap((item) =>
      isTrackedFoodId(item.foodId)
        ? [
            {
              action: 'increment' as const,
              foodId: item.foodId,
            },
          ]
        : [],
    ),
    'meal creation',
  );

  return created;
};

export const getDailyNutritionForDate = async (
  userId: string,
  date: string,
): Promise<DailyNutritionRecord | null> => {
  const { db } = await import('../../db/index.js');

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
  };

  const target =
    db
      .select(nutritionTargetMacroSelection)
      .from(nutritionTargets)
      .where(and(eq(nutritionTargets.userId, userId), lte(nutritionTargets.effectiveDate, date)))
      .orderBy(desc(nutritionTargets.effectiveDate))
      .limit(1)
      .get() ?? null;

  return {
    date,
    meals: Number(actuals.meals ?? 0),
    actual: {
      calories: Number(actuals.calories ?? 0),
      protein: Number(actuals.protein ?? 0),
      carbs: Number(actuals.carbs ?? 0),
      fat: Number(actuals.fat ?? 0),
    },
    target: target
      ? {
          calories: Number(target.calories),
          protein: Number(target.protein),
          carbs: Number(target.carbs),
          fat: Number(target.fat),
        }
      : null,
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
    const actual = actualByDate.get(date) ?? { calories: 0, protein: 0, mealCount: 0 };
    const target = targetsByDate.get(date) ?? { calories: 0, protein: 0 };

    return {
      date,
      calories: actual.calories,
      caloriesTarget: target.calories,
      protein: actual.protein,
      proteinTarget: target.protein,
      mealCount: actual.mealCount,
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
      .select({ id: meals.id })
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

    return {
      deleted: result.changes === 1,
      foodIds: existingItems.map((item) => item.foodId).filter(isTrackedFoodId),
    };
  });

  if (!deleteResult.deleted) {
    return false;
  }

  await applyFoodUsageTrackingEffects(
    userId,
    deleteResult.foodIds.map((foodId) => ({
      action: 'decrement' as const,
      foodId,
    })),
    'meal deletion',
  );

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
        // Carry newly inserted items outside the transaction for usage tracking side effects.
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

    const itemValues = items.map((item) => ({
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

    const allItems = tx
      .select(mealItemSelection)
      .from(mealItems)
      .where(eq(mealItems.mealId, meal.id))
      .orderBy(asc(mealItems.createdAt))
      .all();

    return {
      meal: updatedMeal,
      items: allItems,
      insertedItems,
    };
  });

  if (!updated) {
    return undefined;
  }

  await applyFoodUsageTrackingEffects(
    userId,
    updated.insertedItems.flatMap((item) =>
      isTrackedFoodId(item.foodId)
        ? [
            {
              action: 'increment' as const,
              foodId: item.foodId,
            },
          ]
        : [],
    ),
    'meal item append',
  );

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

  const scopedNutritionLogIds = db
    .select({ id: nutritionLogs.id })
    .from(nutritionLogs)
    .where(eq(nutritionLogs.userId, userId));

  return db
    .update(meals)
    .set(mealUpdate)
    .where(and(eq(meals.id, mealId), inArray(meals.nutritionLogId, scopedNutritionLogIds)))
    .returning(mealSelection)
    .get();
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
      .select(mealItemSelection)
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
          .where(and(eq(foods.id, nextFoodId), eq(foods.userId, userId)))
          .all();

        if (ownedFoods.length !== 1) {
          throw new Error('One or more foodIds do not belong to this user');
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

    return {
      previousFoodId: existingItem.foodId,
      updatedItem,
    };
  });

  if (!updated) {
    return undefined;
  }

  const effects: FoodUsageTrackingEffect[] = [];
  if (updated.previousFoodId !== updated.updatedItem.foodId) {
    if (isTrackedFoodId(updated.previousFoodId)) {
      effects.push({
        action: 'decrement',
        foodId: updated.previousFoodId,
      });
    }
    if (isTrackedFoodId(updated.updatedItem.foodId)) {
      effects.push({
        action: 'increment',
        foodId: updated.updatedItem.foodId,
      });
    }
  }

  await applyFoodUsageTrackingEffects(userId, effects, 'meal item update');

  return updated.updatedItem;
};
