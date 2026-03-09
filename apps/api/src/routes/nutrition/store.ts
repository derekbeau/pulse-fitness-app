import { and, asc, eq, inArray } from 'drizzle-orm';

import type { CreateMealInput } from '@pulse/shared';

import { mealItems, meals, nutritionLogs } from '../../db/schema/index.js';

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

    const items = input.items.map((item) => {
      const mealItem = tx
        .insert(mealItems)
        .values({
          mealId: meal.id,
          foodId: toNullable(item.foodId),
          name: item.name,
          amount: item.amount,
          unit: item.unit,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
        })
        .returning(mealItemSelection)
        .get();

      if (!mealItem) {
        throw new Error('Failed to persist meal item');
      }

      return mealItem;
    });

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
