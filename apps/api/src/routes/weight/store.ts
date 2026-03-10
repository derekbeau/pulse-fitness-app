import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';

import type { BodyWeightEntry, CreateWeightInput, WeightQueryParams } from '@pulse/shared';

import { bodyWeight } from '../../db/schema/index.js';

const bodyWeightEntrySelection = {
  id: bodyWeight.id,
  date: bodyWeight.date,
  weight: bodyWeight.weight,
  notes: bodyWeight.notes,
  createdAt: bodyWeight.createdAt,
  updatedAt: bodyWeight.updatedAt,
};

const addUtcDays = (date: string, days: number) => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const getTodayDate = () => new Date().toISOString().slice(0, 10);

export const findBodyWeightEntryByDate = async (
  userId: string,
  date: string,
): Promise<BodyWeightEntry | null> => {
  const { db } = await import('../../db/index.js');

  return (
    db
      .select(bodyWeightEntrySelection)
      .from(bodyWeight)
      .where(and(eq(bodyWeight.userId, userId), eq(bodyWeight.date, date)))
      .limit(1)
      .get() ?? null
  );
};

export const upsertBodyWeightEntry = async (
  userId: string,
  input: CreateWeightInput,
): Promise<BodyWeightEntry> => {
  const { db } = await import('../../db/index.js');

  const updatedAt = Date.now();

  const entry = db
    .insert(bodyWeight)
    .values({
      userId,
      date: input.date,
      weight: input.weight,
      notes: input.notes ?? null,
    })
    .onConflictDoUpdate({
      target: [bodyWeight.userId, bodyWeight.date],
      set: {
        weight: input.weight,
        notes: input.notes ?? null,
        updatedAt,
      },
    })
    .returning(bodyWeightEntrySelection)
    .get();

  if (!entry) {
    throw new Error('Failed to persist body weight entry');
  }

  return entry;
};

export const listBodyWeightEntries = async (
  userId: string,
  query: WeightQueryParams,
): Promise<BodyWeightEntry[]> => {
  const { db } = await import('../../db/index.js');

  const conditions = [eq(bodyWeight.userId, userId)];

  if (query.days !== undefined) {
    const rangeEnd = query.to ?? getTodayDate();
    const rangeStart = addUtcDays(rangeEnd, -(query.days - 1));
    conditions.push(gte(bodyWeight.date, rangeStart));
  }

  if (query.from) {
    conditions.push(gte(bodyWeight.date, query.from));
  }

  if (query.to) {
    conditions.push(lte(bodyWeight.date, query.to));
  }

  return db
    .select(bodyWeightEntrySelection)
    .from(bodyWeight)
    .where(and(...conditions))
    .orderBy(asc(bodyWeight.date))
    .all();
};

export const getLatestBodyWeightEntry = async (userId: string): Promise<BodyWeightEntry | null> => {
  const { db } = await import('../../db/index.js');

  return (
    db
      .select(bodyWeightEntrySelection)
      .from(bodyWeight)
      .where(eq(bodyWeight.userId, userId))
      .orderBy(desc(bodyWeight.date))
      .limit(1)
      .get() ?? null
  );
};
