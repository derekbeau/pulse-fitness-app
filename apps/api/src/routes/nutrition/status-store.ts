import type { NutritionLog, NutritionLogStatus } from '@pulse/shared';
import { and, eq } from 'drizzle-orm';

import { adaptiveNutritionPrograms, nutritionLogs, users } from '../../db/schema/index.js';

export class FutureNutritionDateError extends Error {
  constructor() {
    super('Future nutrition dates cannot be marked complete');
    this.name = 'FutureNutritionDateError';
  }
}

export class NutritionLogRequiredError extends Error {
  constructor() {
    super('A nutrition log is required before its status can be changed');
    this.name = 'NutritionLogRequiredError';
  }
}

const nutritionLogSelection = {
  id: nutritionLogs.id,
  userId: nutritionLogs.userId,
  date: nutritionLogs.date,
  notes: nutritionLogs.notes,
  status: nutritionLogs.status,
  statusUpdatedAt: nutritionLogs.statusUpdatedAt,
  createdAt: nutritionLogs.createdAt,
  updatedAt: nutritionLogs.updatedAt,
};

const getDateKeyInTimeZone = (date: Date, timeZone?: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return year && month && day ? `${year}-${month}-${day}` : date.toISOString().slice(0, 10);
};

const isSupportedTimeZone = (timeZone: string) => {
  try {
    getDateKeyInTimeZone(new Date(0), timeZone);
    return true;
  } catch {
    return false;
  }
};

const readPreferenceTimeZone = (preferences: unknown) => {
  if (!preferences || typeof preferences !== 'object') {
    return undefined;
  }

  const values = preferences as { timeZone?: unknown; timezone?: unknown };
  const candidate =
    typeof values.timeZone === 'string'
      ? values.timeZone
      : typeof values.timezone === 'string'
        ? values.timezone
        : undefined;

  return candidate && isSupportedTimeZone(candidate) ? candidate : undefined;
};

export const getNutritionLocalDateForUser = async (userId: string, now = new Date()) => {
  const { db } = await import('../../db/index.js');

  const program = db
    .select({ timeZone: adaptiveNutritionPrograms.timeZone })
    .from(adaptiveNutritionPrograms)
    .where(eq(adaptiveNutritionPrograms.userId, userId))
    .limit(1)
    .get();

  if (program?.timeZone && isSupportedTimeZone(program.timeZone)) {
    return getDateKeyInTimeZone(now, program.timeZone);
  }

  const user = db
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .get();

  return getDateKeyInTimeZone(now, readPreferenceTimeZone(user?.preferences));
};

export const updateNutritionLogStatus = async (
  userId: string,
  date: string,
  status: NutritionLogStatus,
  now = new Date(),
): Promise<NutritionLog> => {
  if (status === 'complete' && date > (await getNutritionLocalDateForUser(userId, now))) {
    throw new FutureNutritionDateError();
  }

  const { db } = await import('../../db/index.js');
  const statusUpdatedAt = now.getTime();

  return db.transaction((tx) => {
    const existing = tx
      .select({ id: nutritionLogs.id })
      .from(nutritionLogs)
      .where(and(eq(nutritionLogs.userId, userId), eq(nutritionLogs.date, date)))
      .limit(1)
      .get();

    if (!existing) {
      throw new NutritionLogRequiredError();
    }

    const updated = tx
      .update(nutritionLogs)
      .set({
        status,
        statusUpdatedAt,
        updatedAt: statusUpdatedAt,
      })
      .where(and(eq(nutritionLogs.id, existing.id), eq(nutritionLogs.userId, userId)))
      .returning(nutritionLogSelection)
      .get();

    if (!updated) {
      throw new Error('Failed to update nutrition log status');
    }

    return updated;
  });
};
