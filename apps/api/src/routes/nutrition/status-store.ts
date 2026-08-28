import type { NutritionLog, NutritionLogStatus } from '@pulse/shared';
import { and, eq } from 'drizzle-orm';

import { nutritionLogs } from '../../db/schema/index.js';
import { getApplicationNow } from '../../lib/clock.js';
import { getUserLocalDate } from '../../lib/user-time-zone.js';

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

export const getNutritionLocalDateForUser = async (userId: string, now = getApplicationNow()) => {
  return getUserLocalDate(userId, now);
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
