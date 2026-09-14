import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';

import {
  bodyMeasurementCanonicalFields,
  bodyMeasurementInputFields,
  convertCircumferenceToMm,
  type BodyMeasurementEntry,
  type BodyMeasurementQueryParams,
  type CreateBodyMeasurementInput,
  type PatchBodyMeasurementInput,
} from '@pulse/shared';

import { bodyMeasurements } from '../../db/schema/index.js';
import { addUtcDays } from '../../lib/date.js';
import { getUserLocalDate } from '../../lib/user-time-zone.js';

type MeasurementListFilters = Omit<BodyMeasurementQueryParams, 'page' | 'limit'>;

const inputToCanonicalField = {
  waist: 'waistMm',
  hips: 'hipsMm',
  chest: 'chestMm',
  neck: 'neckMm',
  left_arm: 'leftArmMm',
  right_arm: 'rightArmMm',
  left_thigh: 'leftThighMm',
  right_thigh: 'rightThighMm',
} as const;

const bodyMeasurementSelection = {
  id: bodyMeasurements.id,
  date: bodyMeasurements.date,
  waistMm: bodyMeasurements.waistMm,
  hipsMm: bodyMeasurements.hipsMm,
  chestMm: bodyMeasurements.chestMm,
  neckMm: bodyMeasurements.neckMm,
  leftArmMm: bodyMeasurements.leftArmMm,
  rightArmMm: bodyMeasurements.rightArmMm,
  leftThighMm: bodyMeasurements.leftThighMm,
  rightThighMm: bodyMeasurements.rightThighMm,
  bodyFatPercent: bodyMeasurements.bodyFatPercent,
  unitAtEntry: bodyMeasurements.unitAtEntry,
  notes: bodyMeasurements.notes,
  createdAt: bodyMeasurements.createdAt,
  updatedAt: bodyMeasurements.updatedAt,
};

export class EmptyBodyMeasurementError extends Error {
  readonly code = 'BODY_MEASUREMENT_EMPTY';

  constructor() {
    super('A body measurement record must contain at least one measurement; delete it instead');
    this.name = 'EmptyBodyMeasurementError';
  }
}

export class FutureBodyMeasurementDateError extends Error {
  readonly code = 'FUTURE_BODY_MEASUREMENT_DATE';

  constructor(date: string, localDate: string) {
    super(`Body measurement date ${date} is after the current user-local date ${localDate}`);
    this.name = 'FutureBodyMeasurementDateError';
  }
}

const isNonemptyMeasurement = (
  entry: Pick<
    BodyMeasurementEntry,
    (typeof bodyMeasurementCanonicalFields)[number] | 'bodyFatPercent'
  >,
) =>
  bodyMeasurementCanonicalFields.some((field) => entry[field] !== null) ||
  entry.bodyFatPercent !== null;

const getCanonicalMutations = (
  input: CreateBodyMeasurementInput | PatchBodyMeasurementInput,
): Partial<typeof bodyMeasurements.$inferInsert> => {
  const updates: Partial<typeof bodyMeasurements.$inferInsert> = {};
  let hasCircumferenceValue = false;

  for (const field of bodyMeasurementInputFields) {
    if (!(field in input)) continue;
    const value = input[field];
    const canonicalField = inputToCanonicalField[field];
    if (value === null) {
      updates[canonicalField] = null;
    } else if (value !== undefined) {
      if (!input.unit) throw new Error('Validated circumference input is missing its unit');
      updates[canonicalField] = convertCircumferenceToMm(value, input.unit);
      hasCircumferenceValue = true;
    }
  }

  if ('body_fat_percent' in input) {
    updates.bodyFatPercent = input.body_fat_percent ?? null;
  }
  if ('notes' in input) {
    updates.notes = input.notes ?? null;
  }
  if (hasCircumferenceValue) {
    updates.unitAtEntry = input.unit;
  }

  return updates;
};

const toListConditions = (
  userId: string,
  query: MeasurementListFilters,
  resolvedLocalDate?: string,
) => {
  const conditions = [eq(bodyMeasurements.userId, userId)];
  if (query.days !== undefined) {
    const rangeEnd = query.to ?? resolvedLocalDate;
    if (!rangeEnd) throw new Error('A resolved local date is required for a relative range');
    conditions.push(gte(bodyMeasurements.date, addUtcDays(rangeEnd, -(query.days - 1))));
  }
  if (query.from) conditions.push(gte(bodyMeasurements.date, query.from));
  if (query.to) conditions.push(lte(bodyMeasurements.date, query.to));
  return conditions;
};

export const findBodyMeasurementByDate = async (
  userId: string,
  date: string,
): Promise<BodyMeasurementEntry | null> => {
  const { db } = await import('../../db/index.js');
  return (
    db
      .select(bodyMeasurementSelection)
      .from(bodyMeasurements)
      .where(and(eq(bodyMeasurements.userId, userId), eq(bodyMeasurements.date, date)))
      .limit(1)
      .get() ?? null
  );
};

export const findBodyMeasurementById = async (
  id: string,
  userId: string,
): Promise<BodyMeasurementEntry | null> => {
  const { db } = await import('../../db/index.js');
  return (
    db
      .select(bodyMeasurementSelection)
      .from(bodyMeasurements)
      .where(and(eq(bodyMeasurements.id, id), eq(bodyMeasurements.userId, userId)))
      .limit(1)
      .get() ?? null
  );
};

export const upsertBodyMeasurement = async (
  userId: string,
  input: CreateBodyMeasurementInput,
): Promise<BodyMeasurementEntry> => {
  const localDate = await getUserLocalDate(userId);
  if (input.date > localDate) throw new FutureBodyMeasurementDateError(input.date, localDate);

  const { db } = await import('../../db/index.js');
  const updates = getCanonicalMutations(input);
  const insertedValues = Object.fromEntries(
    bodyMeasurementCanonicalFields.map((field) => [field, updates[field] ?? null]),
  ) as Pick<typeof bodyMeasurements.$inferInsert, (typeof bodyMeasurementCanonicalFields)[number]>;
  const updatedAt = Date.now();

  try {
    const entry = db
      .insert(bodyMeasurements)
      .values({
        userId,
        date: input.date,
        ...insertedValues,
        bodyFatPercent: updates.bodyFatPercent ?? null,
        unitAtEntry: updates.unitAtEntry ?? null,
        notes: input.notes ?? null,
      })
      .onConflictDoUpdate({
        target: [bodyMeasurements.userId, bodyMeasurements.date],
        set: {
          ...updates,
          updatedAt: sql<number>`max(${bodyMeasurements.updatedAt} + 1, ${updatedAt})`,
        },
      })
      .returning(bodyMeasurementSelection)
      .get();

    if (!entry) throw new Error('Failed to persist body measurement entry');
    return entry;
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as { code?: string }).code === 'SQLITE_CONSTRAINT_CHECK'
    ) {
      throw new EmptyBodyMeasurementError();
    }
    throw error;
  }
};

export const patchBodyMeasurementById = async (
  id: string,
  userId: string,
  input: PatchBodyMeasurementInput,
): Promise<BodyMeasurementEntry | null> => {
  const { db } = await import('../../db/index.js');
  const existing = await findBodyMeasurementById(id, userId);
  if (!existing) return null;

  const updates = getCanonicalMutations(input);
  const resultState = { ...existing, ...updates };
  if (!isNonemptyMeasurement(resultState)) throw new EmptyBodyMeasurementError();

  const updatedAt = Date.now();
  const result = db
    .update(bodyMeasurements)
    .set({
      ...updates,
      updatedAt: sql<number>`max(${bodyMeasurements.updatedAt} + 1, ${updatedAt})`,
    })
    .where(and(eq(bodyMeasurements.id, id), eq(bodyMeasurements.userId, userId)))
    .run();
  if (result.changes !== 1) return null;
  return findBodyMeasurementById(id, userId);
};

export const listBodyMeasurements = async (
  userId: string,
  query: MeasurementListFilters,
): Promise<BodyMeasurementEntry[]> => {
  const { db } = await import('../../db/index.js');
  const resolvedLocalDate =
    query.days !== undefined && !query.to ? await getUserLocalDate(userId) : undefined;
  return db
    .select(bodyMeasurementSelection)
    .from(bodyMeasurements)
    .where(and(...toListConditions(userId, query, resolvedLocalDate)))
    .orderBy(asc(bodyMeasurements.date))
    .all();
};

export const listBodyMeasurementsPaginated = async (
  userId: string,
  query: MeasurementListFilters,
  pagination: { limit: number; offset: number },
): Promise<{ entries: BodyMeasurementEntry[]; total: number }> => {
  const { db } = await import('../../db/index.js');
  const resolvedLocalDate =
    query.days !== undefined && !query.to ? await getUserLocalDate(userId) : undefined;
  const where = and(...toListConditions(userId, query, resolvedLocalDate));
  const entries = db
    .select(bodyMeasurementSelection)
    .from(bodyMeasurements)
    .where(where)
    .orderBy(asc(bodyMeasurements.date))
    .limit(pagination.limit)
    .offset(pagination.offset)
    .all();
  const count = db
    .select({ total: sql<number>`count(*)` })
    .from(bodyMeasurements)
    .where(where)
    .get();
  return { entries, total: count?.total ?? 0 };
};

export const deleteBodyMeasurementById = async (id: string, userId: string): Promise<boolean> => {
  const { db } = await import('../../db/index.js');
  return (
    db
      .delete(bodyMeasurements)
      .where(and(eq(bodyMeasurements.id, id), eq(bodyMeasurements.userId, userId)))
      .run().changes === 1
  );
};
