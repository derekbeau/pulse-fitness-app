import { eq } from 'drizzle-orm';
import type { UpdateUserInput } from '@pulse/shared';

import { db } from '../../db/index.js';
import { users } from '../../db/schema/index.js';
import { resolveUserPreferenceTimeZone } from '../../lib/user-time-zone.js';

export async function getUserById(userId: string) {
  const row = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      weightUnit: users.weightUnit,
      preferences: users.preferences,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (!row) return null;
  const { preferences, ...profile } = row;
  return { ...profile, timeZone: resolveUserPreferenceTimeZone(preferences) };
}

export async function updateUser(userId: string, data: UpdateUserInput) {
  const existing = await db
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .get();
  if (!existing) return null;

  const [row] = await db
    .update(users)
    .set({
      name: data.name,
      weightUnit: data.weightUnit,
      preferences:
        data.timeZone === undefined
          ? undefined
          : { ...(existing.preferences ?? {}), timeZone: data.timeZone },
    })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      username: users.username,
      name: users.name,
      weightUnit: users.weightUnit,
      preferences: users.preferences,
      createdAt: users.createdAt,
    });

  if (!row) return null;
  const { preferences, ...profile } = row;
  return { ...profile, timeZone: resolveUserPreferenceTimeZone(preferences) };
}
