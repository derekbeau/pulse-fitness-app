export const isSupportedTimeZone = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.trim().length === 0) return false;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
};

export const resolveUserPreferenceTimeZone = (preferences: unknown): string | null => {
  if (!preferences || typeof preferences !== 'object') return null;

  const values = preferences as { timeZone?: unknown; timezone?: unknown };
  const candidate = values.timeZone ?? values.timezone;
  return isSupportedTimeZone(candidate) ? candidate : null;
};

export type ResolvedUserTimeZone = {
  timeZone: string;
  source: 'adaptive_program' | 'user_profile';
};

export class UserTimeZoneRequiredError extends Error {
  readonly code = 'TIME_ZONE_REQUIRED';

  constructor() {
    super('Set a valid IANA time zone before using current-day features');
    this.name = 'UserTimeZoneRequiredError';
  }
}

export const resolveUserTimeZone = ({
  programTimeZone,
  preferences,
}: {
  programTimeZone?: unknown;
  preferences: unknown;
}): ResolvedUserTimeZone | null => {
  if (isSupportedTimeZone(programTimeZone)) {
    return { source: 'adaptive_program', timeZone: programTimeZone };
  }

  const userTimeZone = resolveUserPreferenceTimeZone(preferences);
  return userTimeZone ? { source: 'user_profile', timeZone: userTimeZone } : null;
};

export const getDateKeyInTimeZone = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error(`Unable to resolve local date in ${timeZone}`);
  }

  return `${year}-${month}-${day}`;
};

export const resolveUserTimeZoneForUser = async (
  userId: string,
): Promise<ResolvedUserTimeZone | null> => {
  const { db } = await import('../db/index.js');
  const program = db
    .select({ timeZone: adaptiveNutritionPrograms.timeZone })
    .from(adaptiveNutritionPrograms)
    .where(eq(adaptiveNutritionPrograms.userId, userId))
    .limit(1)
    .get();
  const user = db
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .get();

  return resolveUserTimeZone({
    preferences: user?.preferences,
    programTimeZone: program?.timeZone,
  });
};

export const getUserLocalDate = async (
  userId: string,
  now = getApplicationNow(),
): Promise<string> => {
  const resolved = await resolveUserTimeZoneForUser(userId);
  if (!resolved) throw new UserTimeZoneRequiredError();
  return getDateKeyInTimeZone(now, resolved.timeZone);
};
import { eq } from 'drizzle-orm';

import { adaptiveNutritionPrograms, users } from '../db/schema/index.js';
import { getApplicationNow } from './clock.js';
