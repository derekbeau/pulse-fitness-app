import { and, asc, between, eq } from 'drizzle-orm';
import type { HabitEntry, UpdateHabitEntryInput } from '@pulse/shared';

import { habitEntries } from '../../db/schema/index.js';

type HabitEntryRecord = HabitEntry;

type UpsertHabitEntryInput = {
  id: string;
  habitId: string;
  userId: string;
  date: string;
  completed: boolean;
  value?: number;
};

const habitEntrySelection = {
  id: habitEntries.id,
  habitId: habitEntries.habitId,
  userId: habitEntries.userId,
  date: habitEntries.date,
  completed: habitEntries.completed,
  value: habitEntries.value,
  createdAt: habitEntries.createdAt,
};

export const findHabitEntryById = async (
  id: string,
  userId: string,
): Promise<HabitEntryRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(habitEntrySelection)
    .from(habitEntries)
    .where(and(eq(habitEntries.id, id), eq(habitEntries.userId, userId)))
    .limit(1)
    .get();
};

export const findHabitEntryByHabitAndDate = async (
  habitId: string,
  userId: string,
  date: string,
): Promise<HabitEntryRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(habitEntrySelection)
    .from(habitEntries)
    .where(
      and(
        eq(habitEntries.habitId, habitId),
        eq(habitEntries.userId, userId),
        eq(habitEntries.date, date),
      ),
    )
    .limit(1)
    .get();
};

export const upsertHabitEntry = async ({
  id,
  habitId,
  userId,
  date,
  completed,
  value,
}: UpsertHabitEntryInput): Promise<HabitEntryRecord> => {
  const { db } = await import('../../db/index.js');

  db.insert(habitEntries)
    .values({
      id,
      habitId,
      userId,
      date,
      completed,
      value: value ?? null,
    })
    .onConflictDoUpdate({
      target: [habitEntries.habitId, habitEntries.date],
      set: {
        completed,
        value: value ?? null,
      },
    })
    .run();

  const entry = await findHabitEntryByHabitAndDate(habitId, userId, date);
  if (!entry) {
    throw new Error('Failed to load upserted habit entry');
  }

  return entry;
};

export const listHabitEntriesByDateRange = async (
  userId: string,
  from: string,
  to: string,
): Promise<HabitEntryRecord[]> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(habitEntrySelection)
    .from(habitEntries)
    .where(and(eq(habitEntries.userId, userId), between(habitEntries.date, from, to)))
    .orderBy(asc(habitEntries.date), asc(habitEntries.createdAt), asc(habitEntries.id))
    .all();
};

export const listHabitEntriesForHabitByDateRange = async (
  habitId: string,
  userId: string,
  from: string,
  to: string,
): Promise<HabitEntryRecord[]> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(habitEntrySelection)
    .from(habitEntries)
    .where(
      and(
        eq(habitEntries.habitId, habitId),
        eq(habitEntries.userId, userId),
        between(habitEntries.date, from, to),
      ),
    )
    .orderBy(asc(habitEntries.date), asc(habitEntries.createdAt), asc(habitEntries.id))
    .all();
};

export const updateHabitEntry = async (
  id: string,
  userId: string,
  updates: UpdateHabitEntryInput,
): Promise<HabitEntryRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  const values = {
    ...(updates.completed !== undefined ? { completed: updates.completed } : {}),
    ...(updates.value !== undefined ? { value: updates.value } : {}),
  };

  const result = db
    .update(habitEntries)
    .set(values)
    .where(and(eq(habitEntries.id, id), eq(habitEntries.userId, userId)))
    .run();

  if (result.changes !== 1) {
    return undefined;
  }

  return findHabitEntryById(id, userId);
};
