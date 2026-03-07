import { eq } from 'drizzle-orm';

import { users } from '../../db/schema/index.js';

export type AuthUserRecord = {
  id: string;
  username: string;
  name: string | null;
  passwordHash: string;
};

type CreateUserInput = {
  id: string;
  username: string;
  name?: string;
  passwordHash: string;
};

export const findUserByUsername = async (username: string): Promise<AuthUserRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  return db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.username, username))
    .limit(1)
    .get();
};

export const createUser = async ({
  id,
  username,
  name,
  passwordHash,
}: CreateUserInput): Promise<Omit<AuthUserRecord, 'passwordHash'>> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .insert(users)
    .values({
      id,
      username,
      name,
      passwordHash,
    })
    .run();

  if (result.changes !== 1) {
    throw new Error('Failed to persist auth user');
  }

  return {
    id,
    username,
    name: name ?? null,
  };
};
