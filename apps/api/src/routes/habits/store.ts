import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { CreateHabitInput, Habit, UpdateHabitInput } from '@pulse/shared';

import { habits } from '../../db/schema/index.js';

type HabitRecord = Habit;

type CreateHabitRecordInput = CreateHabitInput & {
  id: string;
  userId: string;
  sortOrder: number;
};

const habitSelection = {
  id: habits.id,
  userId: habits.userId,
  name: habits.name,
  emoji: habits.emoji,
  trackingType: habits.trackingType,
  target: habits.target,
  unit: habits.unit,
  sortOrder: habits.sortOrder,
  active: habits.active,
  createdAt: habits.createdAt,
  updatedAt: habits.updatedAt,
};

export const getNextHabitSortOrder = async (userId: string): Promise<number> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .select({
      maxSortOrder: sql<number>`coalesce(max(${habits.sortOrder}), -1)`,
    })
    .from(habits)
    .where(eq(habits.userId, userId))
    .get();

  return (result?.maxSortOrder ?? -1) + 1;
};

export const createHabit = async ({
  id,
  userId,
  name,
  emoji,
  trackingType,
  target,
  unit,
  sortOrder,
}: CreateHabitRecordInput): Promise<HabitRecord> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .insert(habits)
    .values({
      id,
      userId,
      name,
      emoji: emoji ?? null,
      trackingType,
      target: target ?? null,
      unit: unit ?? null,
      sortOrder,
      active: true,
    })
    .run();

  if (result.changes !== 1) {
    throw new Error('Failed to persist habit');
  }

  const habit = await findHabitById(id, userId);
  if (!habit) {
    throw new Error('Failed to load created habit');
  }

  return habit;
};

export const listActiveHabits = async (userId: string): Promise<HabitRecord[]> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(habitSelection)
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.active, true)))
    .orderBy(asc(habits.sortOrder), asc(habits.createdAt))
    .all();
};

export const findHabitById = async (
  id: string,
  userId: string,
): Promise<HabitRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(habitSelection)
    .from(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
    .limit(1)
    .get();
};

export const updateHabit = async (
  id: string,
  userId: string,
  updates: UpdateHabitInput,
): Promise<HabitRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  const values = {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.emoji !== undefined ? { emoji: updates.emoji } : {}),
    ...(updates.trackingType !== undefined ? { trackingType: updates.trackingType } : {}),
    ...(updates.target !== undefined ? { target: updates.target } : {}),
    ...(updates.unit !== undefined ? { unit: updates.unit } : {}),
  };

  const result = db
    .update(habits)
    .set(values)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
    .run();

  if (result.changes !== 1) {
    return undefined;
  }

  return findHabitById(id, userId);
};

export const softDeleteHabit = async (id: string, userId: string): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .update(habits)
    .set({ active: false })
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
    .run();

  return result.changes === 1;
};

export const reorderHabits = async (
  userId: string,
  items: Array<{ id: string; sortOrder: number }>,
): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  const ids = items.map((item) => item.id);
  const existingHabits = db
    .select({ id: habits.id })
    .from(habits)
    .where(and(eq(habits.userId, userId), inArray(habits.id, ids)))
    .all();

  if (existingHabits.length !== ids.length) {
    return false;
  }

  db.transaction((tx) => {
    for (const item of items) {
      tx.update(habits)
        .set({ sortOrder: item.sortOrder })
        .where(and(eq(habits.id, item.id), eq(habits.userId, userId)))
        .run();
    }
  });

  return true;
};
