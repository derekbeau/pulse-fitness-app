import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { CreateHabitInput, Habit, UpdateHabitInput } from '@pulse/shared';

import { habits } from '../../db/schema/index.js';

type HabitRecord = Habit;

const serializeScheduledDays = (scheduledDays: number[] | null | undefined): string | null =>
  scheduledDays === undefined || scheduledDays === null ? null : JSON.stringify(scheduledDays);

const parseScheduledDays = (scheduledDays: string | null): number[] | null => {
  if (scheduledDays === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(scheduledDays) as unknown;
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  if (!parsed.every((value) => Number.isInteger(value) && value >= 0 && value <= 6)) {
    return null;
  }

  return parsed as number[];
};

type CreateHabitRecordInput = CreateHabitInput & {
  id: string;
  userId: string;
  sortOrder: number;
};

const habitSelection = {
  id: habits.id,
  userId: habits.userId,
  name: habits.name,
  description: habits.description,
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

const mapHabitRecord = (record: {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  emoji: string | null;
  trackingType: Habit['trackingType'];
  target: number | null;
  unit: string | null;
  frequency: Habit['frequency'];
  frequencyTarget: number | null;
  scheduledDays: string | null;
  pausedUntil: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}): HabitRecord => ({
  ...record,
  scheduledDays: parseScheduledDays(record.scheduledDays),
});

export const getNextHabitSortOrder = async (userId: string): Promise<number> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .select({
      maxSortOrder: sql<number>`coalesce(max(${habits.sortOrder}), -1)`,
    })
    .from(habits)
    .where(and(eq(habits.userId, userId), isNull(habits.deletedAt)))
    .get();

  return (result?.maxSortOrder ?? -1) + 1;
};

export const createHabit = async ({
  id,
  userId,
  name,
  description,
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
      description: description ?? null,
      emoji: emoji ?? null,
      trackingType,
      target: target ?? null,
      unit: unit ?? null,
      frequency: frequency ?? 'daily',
      frequencyTarget: frequencyTarget ?? null,
      scheduledDays: serializeScheduledDays(scheduledDays),
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

  const records = db
    .select(habitSelection)
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.active, true), isNull(habits.deletedAt)))
    .orderBy(asc(habits.sortOrder), asc(habits.createdAt))
    .all();

  return records.map(mapHabitRecord);
};

export const findHabitById = async (
  id: string,
  userId: string,
): Promise<HabitRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  const record = db
    .select(habitSelection)
    .from(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId), isNull(habits.deletedAt)))
    .limit(1)
    .get();

  return record ? mapHabitRecord(record) : undefined;
};

export const updateHabit = async (
  id: string,
  userId: string,
  updates: UpdateHabitInput,
): Promise<HabitRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .update(habits)
    .set({
      name: updates.name,
      description: updates.description ?? null,
      emoji: updates.emoji ?? null,
      trackingType: updates.trackingType,
      target: updates.target ?? null,
      unit: updates.unit ?? null,
      frequency: updates.frequency,
      frequencyTarget: updates.frequencyTarget ?? null,
      scheduledDays: serializeScheduledDays(updates.scheduledDays),
      pausedUntil: updates.pausedUntil ?? null,
      ...(updates.active === undefined ? {} : { active: updates.active }),
    })
    .where(and(eq(habits.id, id), eq(habits.userId, userId), isNull(habits.deletedAt)))
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
    .set({ active: false, deletedAt: new Date().toISOString() })
    .where(and(eq(habits.id, id), eq(habits.userId, userId), isNull(habits.deletedAt)))
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
    .where(
      and(
        eq(habits.userId, userId),
        eq(habits.active, true),
        isNull(habits.deletedAt),
        inArray(habits.id, ids),
      ),
    )
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
    .where(
      and(
        eq(habits.userId, userId),
        eq(habits.active, true),
        isNull(habits.deletedAt),
        inArray(habits.id, ids),
      ),
    )
    .run();

  return true;
};
