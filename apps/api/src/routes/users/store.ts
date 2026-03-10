import { eq } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { users } from '../../db/schema/index.js';

export async function getUserById(userId: string) {
  const row = await db.select({
    id: users.id,
    username: users.username,
    name: users.name,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.id, userId)).get();

  return row ?? null;
}

export async function updateUser(userId: string, data: { name: string }) {
  await db.update(users).set({ name: data.name }).where(eq(users.id, userId));

  return getUserById(userId);
}
