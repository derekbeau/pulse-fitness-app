import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Habit } from '@pulse/shared';

import {
  bodyWeight,
  mealItems,
  meals,
  nutritionLogs,
  workoutSessions,
} from '../db/schema/index.js';

type HabitResolution = { completed: boolean; value?: number };
type NumericOp = 'gte' | 'lte' | 'eq';

const compareNumber = (actual: number, op: NumericOp, target: number): boolean => {
  if (op === 'gte') {
    return actual >= target;
  }

  if (op === 'lte') {
    return actual <= target;
  }

  return actual === target;
};

const isNumericOp = (value: string): value is NumericOp =>
  value === 'gte' || value === 'lte' || value === 'eq';

const getDailyMacroFieldValue = (
  row: { calories: number; protein: number; carbs: number; fat: number },
  field: 'protein' | 'calories' | 'carbs' | 'fat',
): number => row[field];

const getMealFieldValue = (
  row: { calories: number; protein: number; carbs: number; fat: number },
  field: 'protein' | 'calories' | 'carbs' | 'fat',
): number => row[field];

export const resolveWeightCompletion = async (
  userId: string,
  date: string,
): Promise<HabitResolution> => {
  const { db } = await import('../db/index.js');

  const row = db
    .select({ id: bodyWeight.id })
    .from(bodyWeight)
    .where(and(eq(bodyWeight.userId, userId), eq(bodyWeight.date, date)))
    .limit(1)
    .get();

  return { completed: row !== undefined };
};

export const resolveNutritionDailyCompletion = async (
  userId: string,
  date: string,
  config: {
    field: 'protein' | 'calories' | 'carbs' | 'fat';
    op: NumericOp;
    value: number;
  },
): Promise<HabitResolution> => {
  const { db } = await import('../db/index.js');

  const totals = db
    .select({
      calories: sql<number>`coalesce(sum(${mealItems.calories}), 0)`,
      protein: sql<number>`coalesce(sum(${mealItems.protein}), 0)`,
      carbs: sql<number>`coalesce(sum(${mealItems.carbs}), 0)`,
      fat: sql<number>`coalesce(sum(${mealItems.fat}), 0)`,
    })
    .from(nutritionLogs)
    .leftJoin(meals, eq(meals.nutritionLogId, nutritionLogs.id))
    .leftJoin(mealItems, eq(mealItems.mealId, meals.id))
    .where(and(eq(nutritionLogs.userId, userId), eq(nutritionLogs.date, date)))
    .limit(1)
    .get() ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };

  const actual = getDailyMacroFieldValue(totals, config.field);
  return {
    completed: compareNumber(actual, config.op, config.value),
    value: actual,
  };
};

export const resolveNutritionMealCompletion = async (
  userId: string,
  date: string,
  config: {
    mealType: string;
    field: 'protein' | 'calories' | 'carbs' | 'fat';
    op: NumericOp;
    value: number;
  },
): Promise<HabitResolution> => {
  const { db } = await import('../db/index.js');

  const totals = db
    .select({
      calories: sql<number>`coalesce(sum(${mealItems.calories}), 0)`,
      protein: sql<number>`coalesce(sum(${mealItems.protein}), 0)`,
      carbs: sql<number>`coalesce(sum(${mealItems.carbs}), 0)`,
      fat: sql<number>`coalesce(sum(${mealItems.fat}), 0)`,
    })
    .from(nutritionLogs)
    .innerJoin(meals, eq(meals.nutritionLogId, nutritionLogs.id))
    .leftJoin(mealItems, eq(mealItems.mealId, meals.id))
    .where(
      and(
        eq(nutritionLogs.userId, userId),
        eq(nutritionLogs.date, date),
        sql`lower(${meals.name}) = lower(${config.mealType})`,
      ),
    )
    .limit(1)
    .get() ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };

  const actual = getMealFieldValue(totals, config.field);
  return {
    completed: compareNumber(actual, config.op, config.value),
    value: actual,
  };
};

export const resolveWorkoutCompletion = async (
  userId: string,
  date: string,
): Promise<HabitResolution> => {
  const { db } = await import('../db/index.js');

  const row = db
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.date, date),
        eq(workoutSessions.status, 'completed'),
        isNull(workoutSessions.deletedAt),
      ),
    )
    .limit(1)
    .get();

  return { completed: row !== undefined };
};

export const resolveHabitCompletion = async (
  habit: Habit,
  userId: string,
  date: string,
): Promise<HabitResolution> => {
  const referenceSource = habit.referenceSource;
  const referenceConfig = habit.referenceConfig;

  if (referenceSource == null || referenceConfig == null) {
    return { completed: false };
  }

  if (
    referenceSource === 'weight' &&
    'condition' in referenceConfig &&
    referenceConfig.condition === 'exists_today'
  ) {
    return resolveWeightCompletion(userId, date);
  }

  if (
    referenceSource === 'nutrition_daily' &&
    'field' in referenceConfig &&
    'op' in referenceConfig &&
    'value' in referenceConfig &&
    (referenceConfig.field === 'protein' ||
      referenceConfig.field === 'calories' ||
      referenceConfig.field === 'carbs' ||
      referenceConfig.field === 'fat') &&
    (referenceConfig.op === 'gte' || referenceConfig.op === 'lte' || referenceConfig.op === 'eq')
  ) {
    return resolveNutritionDailyCompletion(userId, date, {
      field: referenceConfig.field,
      op: referenceConfig.op,
      value: referenceConfig.value,
    });
  }

  if (
    referenceSource === 'nutrition_meal' &&
    'mealType' in referenceConfig &&
    'field' in referenceConfig &&
    'op' in referenceConfig &&
    'value' in referenceConfig &&
    (referenceConfig.field === 'protein' ||
      referenceConfig.field === 'calories' ||
      referenceConfig.field === 'carbs' ||
      referenceConfig.field === 'fat') &&
    isNumericOp(referenceConfig.op)
  ) {
    return resolveNutritionMealCompletion(userId, date, {
      mealType: referenceConfig.mealType,
      field: referenceConfig.field,
      op: referenceConfig.op,
      value: referenceConfig.value,
    });
  }

  if (
    referenceSource === 'workout' &&
    'condition' in referenceConfig &&
    referenceConfig.condition === 'session_completed_today'
  ) {
    return resolveWorkoutCompletion(userId, date);
  }

  return { completed: false };
};

export type { HabitResolution };
