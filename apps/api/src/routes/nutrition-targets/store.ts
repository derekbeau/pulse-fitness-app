import { randomUUID } from 'node:crypto';

import { and, desc, eq, lte, max } from 'drizzle-orm';

import { type CreateNutritionTargetInput, type NutritionTarget } from '@pulse/shared';

import { nutritionTargetEvents, nutritionTargets } from '../../db/schema/index.js';
import { getUserLocalDate } from '../../lib/user-time-zone.js';

const nutritionTargetSelection = {
  id: nutritionTargets.id,
  calories: nutritionTargets.calories,
  protein: nutritionTargets.protein,
  carbs: nutritionTargets.carbs,
  fat: nutritionTargets.fat,
  source: nutritionTargets.source,
  adaptiveCheckInId: nutritionTargets.adaptiveCheckInId,
  macroCalories: nutritionTargets.macroCalories,
  effectiveDate: nutritionTargets.effectiveDate,
  createdAt: nutritionTargets.createdAt,
  updatedAt: nutritionTargets.updatedAt,
};

const calculateMacroCalories = (target: Pick<NutritionTarget, 'protein' | 'carbs' | 'fat'>) =>
  target.protein * 4 + target.carbs * 4 + target.fat * 9;

export const upsertNutritionTarget = async (
  userId: string,
  input: CreateNutritionTargetInput,
): Promise<NutritionTarget> => {
  const { db } = await import('../../db/index.js');

  const updatedAt = Date.now();
  const macroCalories = calculateMacroCalories(input);

  const target = db.transaction((tx) => {
    const persisted = tx
      .insert(nutritionTargets)
      .values({
        id: randomUUID(),
        userId,
        calories: input.calories,
        protein: input.protein,
        carbs: input.carbs,
        fat: input.fat,
        source: 'manual',
        adaptiveCheckInId: null,
        macroCalories,
        effectiveDate: input.effectiveDate,
        createdAt: updatedAt,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: [nutritionTargets.userId, nutritionTargets.effectiveDate],
        set: {
          calories: input.calories,
          protein: input.protein,
          carbs: input.carbs,
          fat: input.fat,
          source: 'manual',
          adaptiveCheckInId: null,
          macroCalories,
          updatedAt,
        },
      })
      .returning(nutritionTargetSelection)
      .get();

    if (!persisted) throw new Error('Failed to persist nutrition target');
    const sequence =
      (tx
        .select({ value: max(nutritionTargetEvents.sequence) })
        .from(nutritionTargetEvents)
        .where(eq(nutritionTargetEvents.targetId, persisted.id))
        .get()?.value ?? 0) + 1;
    tx.insert(nutritionTargetEvents)
      .values({
        id: randomUUID(),
        targetId: persisted.id,
        userId,
        sequence,
        effectiveDate: input.effectiveDate,
        calories: input.calories,
        protein: input.protein,
        carbs: input.carbs,
        fat: input.fat,
        macroCalories,
        source: 'manual',
        adaptiveCheckInId: null,
        eventType: 'manual_write',
        recordedAt: updatedAt,
        createdAt: updatedAt,
      })
      .run();
    return persisted;
  });

  if (!target) {
    throw new Error('Failed to persist nutrition target');
  }

  return target;
};

export const getCurrentNutritionTarget = async (
  userId: string,
): Promise<NutritionTarget | null> => {
  const { db } = await import('../../db/index.js');
  const localDate = await getUserLocalDate(userId);

  return (
    db
      .select(nutritionTargetSelection)
      .from(nutritionTargets)
      .where(
        and(eq(nutritionTargets.userId, userId), lte(nutritionTargets.effectiveDate, localDate)),
      )
      .orderBy(desc(nutritionTargets.effectiveDate))
      .limit(1)
      .get() ?? null
  );
};

export const listNutritionTargets = async (userId: string): Promise<NutritionTarget[]> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(nutritionTargetSelection)
    .from(nutritionTargets)
    .where(eq(nutritionTargets.userId, userId))
    .orderBy(desc(nutritionTargets.effectiveDate))
    .all();
};
