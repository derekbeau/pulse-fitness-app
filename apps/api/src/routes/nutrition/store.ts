import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';

import type { CreateMealInput, PatchMealInput, PatchMealItemInput } from '@pulse/shared';

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

export const createMealForDate = async (
  userId: string,
  date: string,
  input: CreateMealInput,
): Promise<{ meal: MealRecord; items: MealItemRecord[] }> => {
  const { db } = await import('../../db/index.js');

  return db.transaction((tx) => {
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
        time: toNullable(input.time),
        notes: toNullable(input.notes),
      })
      .returning(mealSelection)
      .get();

    if (!meal) {
      throw new Error('Failed to persist meal');
    }

    const itemValues = input.items.map((item) => ({
      mealId: meal.id,
      foodId: toNullable(item.foodId),
      name: item.name,
      amount: item.amount,
      unit: item.unit,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      fiber: toNullable(item.fiber),
      sugar: toNullable(item.sugar),
    }));

    const foodIds = [
      ...new Set(itemValues.map((item) => item.foodId).filter((foodId): foodId is string => foodId !== null)),
    ];
    if (foodIds.length > 0) {
      const ownedFoods = tx
        .select({ id: foods.id })
        .from(foods)
        .where(and(inArray(foods.id, foodIds), eq(foods.userId, userId)))
        .all();

      if (ownedFoods.length !== foodIds.length) {
        throw new Error('One or more foodIds do not belong to this user');
      }
    }

    const items = tx.insert(mealItems).values(itemValues).returning(mealItemSelection).all();

    if (items.length !== input.items.length) {
      throw new Error('Failed to persist meal items');
    }

    return { meal, items };
  });
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

  const actuals =
    db
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

export const deleteMealForDate = async (
  userId: string,
  date: string,
  mealId: string,
): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  return db.transaction((tx) => {
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
      return false;
    }

    tx.delete(mealItems).where(eq(mealItems.mealId, mealId)).run();
    const result = tx.delete(meals).where(eq(meals.id, mealId)).run();

    return result.changes === 1;
  });
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
    .where(and(eq(meals.id, mealId), eq(nutritionLogs.userId, userId), eq(nutritionLogs.date, date)))
    .limit(1)
    .get();
};

export const findMealById = async (userId: string, mealId: string): Promise<MealRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(mealSelection)
    .from(meals)
    .innerJoin(nutritionLogs, eq(nutritionLogs.id, meals.nutritionLogId))
    .where(and(eq(meals.id, mealId), eq(nutritionLogs.userId, userId)))
    .limit(1)
    .get();
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

  const itemUpdate: Partial<typeof mealItems.$inferInsert> = {};
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

  const scopedMealIds = db
    .select({ id: meals.id })
    .from(meals)
    .innerJoin(nutritionLogs, eq(nutritionLogs.id, meals.nutritionLogId))
    .where(eq(nutritionLogs.userId, userId));

  return db
    .update(mealItems)
    .set(itemUpdate)
    .where(
      and(
        eq(mealItems.id, itemId),
        eq(mealItems.mealId, mealId),
        inArray(mealItems.mealId, scopedMealIds),
      ),
    )
    .returning(mealItemSelection)
    .get();
};
