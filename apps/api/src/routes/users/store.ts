import { eq } from 'drizzle-orm';
import type { UpdateUserInput } from '@pulse/shared';

import { db } from '../../db/index.js';
import { users } from '../../db/schema/index.js';

export async function getUserById(userId: string) {
  const row = await db.select({
    id: users.id,
    username: users.username,
    name: users.name,
    weightUnit: users.weightUnit,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.id, userId)).get();

  return row ?? null;
}

export async function updateUser(userId: string, data: UpdateUserInput) {
  const [row] = await db
    .update(users)
    .set({
      name: data.name,
      weightUnit: data.weightUnit,
    })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      username: users.username,
      name: users.name,
      weightUnit: users.weightUnit,
      createdAt: users.createdAt,
    });

  return row ?? null;
}
