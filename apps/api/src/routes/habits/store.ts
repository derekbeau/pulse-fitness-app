import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { CreateHabitInput, Habit } from '@pulse/shared';

import { habits } from '../../db/schema/index.js';

type HabitRecord = Habit;

type CreateHabitRecordInput = CreateHabitInput & {
  id: string;
  userId: string;
  sortOrder: number;
};

function parseScheduledDays(rawValue: string | null): number[] | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return null;
    }

    const days = parsed.filter(
      (day): day is number => Number.isInteger(day) && day >= 0 && day <= 6,
    );
    return days.length === parsed.length ? days : null;
  } catch {
    return null;
  }
}

function mapHabitRecord(
  record: Omit<HabitRecord, 'scheduledDays'> & { scheduledDays: string | null },
) {
  return {
    ...record,
    scheduledDays: parseScheduledDays(record.scheduledDays),
  };
}

const habitSelection = {
  id: habits.id,
  userId: habits.userId,
  name: habits.name,
  emoji: habits.emoji,
  trackingType: habits.trackingType,
  target: habits.target,
  unit: habits.unit,
  frequency: habits.frequency,
  frequencyTarget: habits.frequencyTarget,
  scheduledDays: habits.scheduledDays,
  pausedUntil: habits.pausedUntil,
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
  frequency,
  frequencyTarget,
  scheduledDays,
  pausedUntil,
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
      frequency: frequency ?? 'daily',
      frequencyTarget: frequencyTarget ?? null,
      scheduledDays: scheduledDays ? JSON.stringify(scheduledDays) : null,
      pausedUntil: pausedUntil ?? null,
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

  const rows = db
    .select(habitSelection)
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.active, true)))
    .orderBy(asc(habits.sortOrder), asc(habits.createdAt))
    .all();

  return rows.map((row) => mapHabitRecord(row));
};

export const findHabitById = async (
  id: string,
  userId: string,
): Promise<HabitRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  const row = db
    .select(habitSelection)
    .from(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
    .limit(1)
    .get();

  return row ? mapHabitRecord(row) : undefined;
};

export const updateHabit = async (
  id: string,
  userId: string,
  updates: CreateHabitInput,
): Promise<HabitRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .update(habits)
    .set({
      name: updates.name,
      emoji: updates.emoji ?? null,
      trackingType: updates.trackingType,
      target: updates.target ?? null,
      unit: updates.unit ?? null,
      frequency: updates.frequency ?? 'daily',
      frequencyTarget: updates.frequencyTarget ?? null,
      scheduledDays: updates.scheduledDays ? JSON.stringify(updates.scheduledDays) : null,
      pausedUntil: updates.pausedUntil ?? null,
    })
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
    .where(and(eq(habits.userId, userId), eq(habits.active, true), inArray(habits.id, ids)))
    .all();

  if (existingHabits.length !== ids.length) {
    return false;
  }

  const sortOrderCases = sql.join(
    items.map((item) => sql`when ${habits.id} = ${item.id} then ${item.sortOrder}`),
    sql.raw(' '),
  );

  db.update(habits)
    .set({
      sortOrder: sql<number>`case ${sortOrderCases} else ${habits.sortOrder} end`,
    })
    .where(and(eq(habits.userId, userId), eq(habits.active, true), inArray(habits.id, ids)))
    .run();

  return true;
};
