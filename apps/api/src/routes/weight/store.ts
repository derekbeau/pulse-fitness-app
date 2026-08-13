import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';

import {
  convertWeightFromKg,
  convertWeightToKg,
  isCanonicalBodyWeight,
  type BodyWeightEntry,
  type CreateWeightInput,
  type PatchWeightInput,
  type WeightQueryParams,
  type WeightUnit,
} from '@pulse/shared';

import { bodyWeight, users } from '../../db/schema/index.js';
import { addUtcDays, getTodayDate } from '../../lib/date.js';

export type CanonicalBodyWeightEntry = {
  id: string;
  date: string;
  weightKg: number;
  unitAtEntry: WeightUnit;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
};

const canonicalBodyWeightEntrySelection = {
  id: bodyWeight.id,
  date: bodyWeight.date,
  weightKg: bodyWeight.weightKg,
  unitAtEntry: bodyWeight.unitAtEntry,
  notes: bodyWeight.notes,
  createdAt: bodyWeight.createdAt,
  updatedAt: bodyWeight.updatedAt,
};

type WeightListFilters = Omit<WeightQueryParams, 'page' | 'limit'>;

const toBodyWeightConditions = (userId: string, query: WeightListFilters) => {
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

  return conditions;
};

const roundDisplayWeight = (value: number) => Number(value.toFixed(8));

export const toBodyWeightEntry = (
  entry: CanonicalBodyWeightEntry,
  displayUnit: WeightUnit,
): BodyWeightEntry => ({
  id: entry.id,
  date: entry.date,
  weight: roundDisplayWeight(convertWeightFromKg(Number(entry.weightKg), displayUnit)),
  unit: displayUnit,
  notes: entry.notes,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
});

export const getBodyWeightDisplayUnit = async (userId: string): Promise<WeightUnit> => {
  const { db } = await import('../../db/index.js');
  const user = db
    .select({ weightUnit: users.weightUnit })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .get();

  if (!user) {
    throw new Error('Authenticated user not found while resolving weight unit');
  }

  return user.weightUnit;
};

const getCanonicalWriteValues = (weight: number, unit: WeightUnit) => {
  const weightKg = convertWeightToKg(weight, unit);
  if (!isCanonicalBodyWeight(weightKg)) {
    throw new RangeError('Weight must be between 25 and 350 kg after conversion');
  }

  return {
    // Compatibility invariant: legacy weight is pounds regardless of request/display unit.
    weight: convertWeightFromKg(weightKg, 'lbs'),
    weightKg,
    unitAtEntry: unit,
  };
};

export const findBodyWeightEntryByDate = async (
  userId: string,
  date: string,
): Promise<CanonicalBodyWeightEntry | null> => {
  const { db } = await import('../../db/index.js');

  return (
    db
      .select(canonicalBodyWeightEntrySelection)
      .from(bodyWeight)
      .where(and(eq(bodyWeight.userId, userId), eq(bodyWeight.date, date)))
      .limit(1)
      .get() ?? null
  );
};

export const findBodyWeightEntryById = async (
  id: string,
  userId: string,
): Promise<CanonicalBodyWeightEntry | null> => {
  const { db } = await import('../../db/index.js');

  return (
    db
      .select(canonicalBodyWeightEntrySelection)
      .from(bodyWeight)
      .where(and(eq(bodyWeight.id, id), eq(bodyWeight.userId, userId)))
      .limit(1)
      .get() ?? null
  );
};

export const upsertBodyWeightEntry = async (
  userId: string,
  input: CreateWeightInput,
  inputUnit: WeightUnit,
): Promise<CanonicalBodyWeightEntry> => {
  const { db } = await import('../../db/index.js');
  const canonicalWeight = getCanonicalWriteValues(input.weight, inputUnit);
  const updatedAt = Date.now();

  const entry = db
    .insert(bodyWeight)
    .values({
      userId,
      date: input.date,
      ...canonicalWeight,
      notes: input.notes ?? null,
    })
    .onConflictDoUpdate({
      target: [bodyWeight.userId, bodyWeight.date],
      set: {
        ...canonicalWeight,
        notes: input.notes ?? null,
        updatedAt,
      },
    })
    .returning(canonicalBodyWeightEntrySelection)
    .get();

  if (!entry) {
    throw new Error('Failed to persist body weight entry');
  }

  return entry;
};

export const listBodyWeightEntries = async (
  userId: string,
  query: WeightListFilters,
): Promise<CanonicalBodyWeightEntry[]> => {
  const { db } = await import('../../db/index.js');
  const conditions = toBodyWeightConditions(userId, query);

  return db
    .select(canonicalBodyWeightEntrySelection)
    .from(bodyWeight)
    .where(and(...conditions))
    .orderBy(asc(bodyWeight.date))
    .all();
};

export const listBodyWeightEntriesPaginated = async (
  userId: string,
  query: WeightListFilters,
  pagination: { limit: number; offset: number },
): Promise<{ entries: CanonicalBodyWeightEntry[]; total: number }> => {
  const { db } = await import('../../db/index.js');
  const conditions = toBodyWeightConditions(userId, query);
  const whereClause = and(...conditions);

  const entries = db
    .select(canonicalBodyWeightEntrySelection)
    .from(bodyWeight)
    .where(whereClause)
    .orderBy(asc(bodyWeight.date))
    .limit(pagination.limit)
    .offset(pagination.offset)
    .all();

  const countResult = db
    .select({ total: sql<number>`count(*)` })
    .from(bodyWeight)
    .where(whereClause)
    .get();

  return {
    entries,
    total: countResult?.total ?? 0,
  };
};

export const getLatestBodyWeightEntry = async (
  userId: string,
): Promise<CanonicalBodyWeightEntry | null> => {
  const { db } = await import('../../db/index.js');

  return (
    db
      .select(canonicalBodyWeightEntrySelection)
      .from(bodyWeight)
      .where(eq(bodyWeight.userId, userId))
      .orderBy(desc(bodyWeight.date))
      .limit(1)
      .get() ?? null
  );
};

export const patchBodyWeightEntryById = async (
  id: string,
  userId: string,
  input: PatchWeightInput,
  inputUnit: WeightUnit,
): Promise<CanonicalBodyWeightEntry | null> => {
  const { db } = await import('../../db/index.js');
  const updates: Partial<typeof bodyWeight.$inferInsert> & { updatedAt: number } = {
    updatedAt: Date.now(),
  };

  if (input.weight !== undefined) {
    Object.assign(updates, getCanonicalWriteValues(input.weight, inputUnit));
  }

  if ('notes' in input) {
    updates.notes = input.notes ?? null;
  }

  const result = db
    .update(bodyWeight)
    .set(updates)
    .where(and(eq(bodyWeight.id, id), eq(bodyWeight.userId, userId)))
    .run();

  if (result.changes !== 1) {
    return null;
  }

  return findBodyWeightEntryById(id, userId);
};

export const deleteBodyWeightEntryById = async (id: string, userId: string): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .delete(bodyWeight)
    .where(and(eq(bodyWeight.id, id), eq(bodyWeight.userId, userId)))
    .run();

  return result.changes === 1;
};
