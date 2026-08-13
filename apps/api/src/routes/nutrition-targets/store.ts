import { and, desc, eq, lte } from 'drizzle-orm';

import type { CreateNutritionTargetInput, NutritionTarget } from '@pulse/shared';

import { adaptiveNutritionCheckIns, nutritionTargets } from '../../db/schema/index.js';

export class AdaptiveCheckInNotFoundError extends Error {
  constructor() {
    super('Adaptive check-in not found');
    this.name = 'AdaptiveCheckInNotFoundError';
  }
}

export class SameDateNutritionTargetExistsError extends Error {
  constructor() {
    super('A nutrition target already exists on the effective date');
    this.name = 'SameDateNutritionTargetExistsError';
  }
}

export class ReplacedTargetSnapshotMismatchError extends Error {
  constructor() {
    super('The check-in does not preserve the same-date target being replaced');
    this.name = 'ReplacedTargetSnapshotMismatchError';
  }
}

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

// Keep "current target" resolution aligned to UTC date-only semantics.
const getTodayDate = () => new Date().toISOString().slice(0, 10);

const calculateMacroCalories = (target: Pick<NutritionTarget, 'protein' | 'carbs' | 'fat'>) =>
  target.protein * 4 + target.carbs * 4 + target.fat * 9;

const targetSnapshotsMatch = (left: NutritionTarget | null, right: NutritionTarget | null) => {
  if (left === null || right === null) {
    return left === right;
  }

  return (
    left.id === right.id &&
    left.calories === right.calories &&
    left.protein === right.protein &&
    left.carbs === right.carbs &&
    left.fat === right.fat &&
    left.source === right.source &&
    left.adaptiveCheckInId === right.adaptiveCheckInId &&
    left.macroCalories === right.macroCalories &&
    left.effectiveDate === right.effectiveDate &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt
  );
};

export const upsertNutritionTarget = async (
  userId: string,
  input: CreateNutritionTargetInput,
): Promise<NutritionTarget> => {
  const { db } = await import('../../db/index.js');

  const updatedAt = Date.now();
  const macroCalories = calculateMacroCalories(input);

  const target = db
    .insert(nutritionTargets)
    .values({
      userId,
      calories: input.calories,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
      source: 'manual',
      adaptiveCheckInId: null,
      macroCalories,
      effectiveDate: input.effectiveDate,
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

  if (!target) {
    throw new Error('Failed to persist nutrition target');
  }

  return target;
};

export const persistAdaptiveNutritionTarget = async (
  userId: string,
  checkInId: string,
  input: CreateNutritionTargetInput,
  replaceSameDateTarget: boolean,
): Promise<NutritionTarget> => {
  const { db } = await import('../../db/index.js');

  return db.transaction((tx) => {
    const checkIn = tx
      .select({ currentTargets: adaptiveNutritionCheckIns.currentTargets })
      .from(adaptiveNutritionCheckIns)
      .where(
        and(
          eq(adaptiveNutritionCheckIns.id, checkInId),
          eq(adaptiveNutritionCheckIns.userId, userId),
        ),
      )
      .limit(1)
      .get();

    if (!checkIn) {
      throw new AdaptiveCheckInNotFoundError();
    }

    const existing =
      tx
        .select(nutritionTargetSelection)
        .from(nutritionTargets)
        .where(
          and(
            eq(nutritionTargets.userId, userId),
            eq(nutritionTargets.effectiveDate, input.effectiveDate),
          ),
        )
        .limit(1)
        .get() ?? null;

    if (existing && !replaceSameDateTarget) {
      throw new SameDateNutritionTargetExistsError();
    }

    if (existing && !targetSnapshotsMatch(checkIn.currentTargets, existing)) {
      throw new ReplacedTargetSnapshotMismatchError();
    }

    const updatedAt = Date.now();
    const macroCalories = calculateMacroCalories(input);
    const target = tx
      .insert(nutritionTargets)
      .values({
        userId,
        ...input,
        source: 'adaptive',
        adaptiveCheckInId: checkInId,
        macroCalories,
      })
      .onConflictDoUpdate({
        target: [nutritionTargets.userId, nutritionTargets.effectiveDate],
        set: {
          calories: input.calories,
          protein: input.protein,
          carbs: input.carbs,
          fat: input.fat,
          source: 'adaptive',
          adaptiveCheckInId: checkInId,
          macroCalories,
          updatedAt,
        },
      })
      .returning(nutritionTargetSelection)
      .get();

    if (!target) {
      throw new Error('Failed to persist adaptive nutrition target');
    }

    return target;
  });
};

export const getCurrentNutritionTarget = async (
  userId: string,
): Promise<NutritionTarget | null> => {
  const { db } = await import('../../db/index.js');

  return (
    db
      .select(nutritionTargetSelection)
      .from(nutritionTargets)
      .where(
        and(
          eq(nutritionTargets.userId, userId),
          lte(nutritionTargets.effectiveDate, getTodayDate()),
        ),
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
