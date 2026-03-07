import { and, desc, eq, lte } from 'drizzle-orm';

import type { CreateNutritionTargetInput } from '@pulse/shared';

import { nutritionTargets } from '../../db/schema/index.js';

export type NutritionTargetEntry = {
  id: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  effectiveDate: string;
  createdAt: number;
  updatedAt: number;
};

const nutritionTargetSelection = {
  id: nutritionTargets.id,
  calories: nutritionTargets.calories,
  protein: nutritionTargets.protein,
  carbs: nutritionTargets.carbs,
  fat: nutritionTargets.fat,
  effectiveDate: nutritionTargets.effectiveDate,
  createdAt: nutritionTargets.createdAt,
  updatedAt: nutritionTargets.updatedAt,
};

const getTodayDate = () => {
  const now = new Date();
  const timezoneAdjusted = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);

  return timezoneAdjusted.toISOString().slice(0, 10);
};

export const upsertNutritionTarget = async (
  userId: string,
  input: CreateNutritionTargetInput,
): Promise<NutritionTargetEntry> => {
  const { db } = await import('../../db/index.js');

  const updatedAt = Date.now();

  db.insert(nutritionTargets)
    .values({
      userId,
      calories: input.calories,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
      effectiveDate: input.effectiveDate,
    })
    .onConflictDoUpdate({
      target: [nutritionTargets.userId, nutritionTargets.effectiveDate],
      set: {
        calories: input.calories,
        protein: input.protein,
        carbs: input.carbs,
        fat: input.fat,
        updatedAt,
      },
    })
    .run();

  const target = db
    .select(nutritionTargetSelection)
    .from(nutritionTargets)
    .where(
      and(
        eq(nutritionTargets.userId, userId),
        eq(nutritionTargets.effectiveDate, input.effectiveDate),
      ),
    )
    .limit(1)
    .get();

  if (!target) {
    throw new Error('Failed to persist nutrition target');
  }

  return target;
};

export const getCurrentNutritionTarget = async (
  userId: string,
): Promise<NutritionTargetEntry | null> => {
  const { db } = await import('../../db/index.js');

  return (
    db
      .select(nutritionTargetSelection)
      .from(nutritionTargets)
      .where(
        and(eq(nutritionTargets.userId, userId), lte(nutritionTargets.effectiveDate, getTodayDate())),
      )
      .orderBy(desc(nutritionTargets.effectiveDate))
      .limit(1)
      .get() ?? null
  );
};

export const listNutritionTargets = async (userId: string): Promise<NutritionTargetEntry[]> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(nutritionTargetSelection)
    .from(nutritionTargets)
    .where(eq(nutritionTargets.userId, userId))
    .orderBy(desc(nutritionTargets.effectiveDate))
    .all();
};
