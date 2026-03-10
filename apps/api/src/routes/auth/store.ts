import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { habits, users } from '../../db/schema/index.js';

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

const starterHabitDefinitions: Array<{
  emoji: string;
  name: string;
  target: number | null;
  trackingType: 'boolean' | 'numeric' | 'time';
  unit: string | null;
}> = [
  {
    emoji: '💧',
    name: 'Hydrate',
    trackingType: 'numeric',
    target: 8,
    unit: 'glasses',
  },
  {
    emoji: '💊',
    name: 'Take vitamins',
    trackingType: 'boolean',
    target: null,
    unit: null,
  },
  {
    emoji: '🥗',
    name: 'Protein goal',
    trackingType: 'numeric',
    target: 120,
    unit: 'grams',
  },
  {
    emoji: '😴',
    name: 'Sleep',
    trackingType: 'time',
    target: 8,
    unit: 'hours',
  },
  {
    emoji: '🧘',
    name: 'Mobility warm-up',
    trackingType: 'boolean',
    target: null,
    unit: null,
  },
];

const buildStarterHabits = (userId: string) =>
  starterHabitDefinitions.map((habit, index) => ({
    id: randomUUID(),
    userId,
    name: habit.name,
    emoji: habit.emoji,
    trackingType: habit.trackingType,
    target: habit.target,
    unit: habit.unit,
    sortOrder: index,
    active: true,
  }));

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

  const result = db.transaction((tx) => {
    const userInsertResult = tx
      .insert(users)
      .values({
        id,
        username,
        name,
        passwordHash,
      })
      .run();

    if (userInsertResult.changes !== 1) {
      throw new Error('Failed to persist auth user');
    }

    const starterHabits = buildStarterHabits(id);
    const habitInsertResult = tx.insert(habits).values(starterHabits).run();
    if (habitInsertResult.changes !== starterHabits.length) {
      throw new Error('Failed to persist starter habits');
    }

    return userInsertResult;
  });

  if (result.changes !== 1) {
    throw new Error('Failed to persist auth user');
  }

  return {
    id,
    username,
    name: name ?? null,
  };
};

export const ensureStarterHabitsForUser = async (userId: string): Promise<void> => {
  const { db } = await import('../../db/index.js');

  db.transaction((tx) => {
    const existingHabit = tx
      .select({ id: habits.id })
      .from(habits)
      .where(eq(habits.userId, userId))
      .limit(1)
      .get();

    if (existingHabit) {
      return;
    }

    const starterHabits = buildStarterHabits(userId);
    const habitInsertResult = tx.insert(habits).values(starterHabits).run();
    if (habitInsertResult.changes !== starterHabits.length) {
      throw new Error('Failed to persist starter habits');
    }
  });
};
