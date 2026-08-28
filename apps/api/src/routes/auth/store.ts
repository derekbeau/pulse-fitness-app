import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import {
  adaptiveNutritionAccountDeletionScope,
  adaptiveNutritionCheckIns,
  adaptiveNutritionGoalCompletions,
  adaptiveNutritionGoalRevisions,
  adaptiveNutritionGoals,
  adaptiveNutritionPrograms,
  adaptiveNutritionReviewActions,
  adaptiveNutritionReviewContexts,
  adaptiveNutritionReviews,
  habits,
  nutritionTargets,
  nutritionTargetEvents,
  exerciseMuscleContributions,
  users,
  workoutProgressionAccountDeletionScope,
  workoutProgressionActions,
  workoutProgressionRecommendations,
} from '../../db/schema/index.js';

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
  timeZone: string;
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
  timeZone,
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
        preferences: { timeZone },
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

export const deleteUserAccount = async (userId: string): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  return db.transaction((tx) => {
    const user = tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).get();
    if (!user) {
      return false;
    }

    // The scope row exists only inside this write transaction. SQLite's single-writer lock prevents
    // another account deletion from borrowing it, and rollback restores every ordered deletion.
    tx.insert(adaptiveNutritionAccountDeletionScope).values({ userId }).run();
    tx.insert(workoutProgressionAccountDeletionScope).values({ userId }).run();
    tx.delete(workoutProgressionActions).where(eq(workoutProgressionActions.userId, userId)).run();
    tx.delete(workoutProgressionRecommendations)
      .where(eq(workoutProgressionRecommendations.userId, userId))
      .run();
    tx.delete(exerciseMuscleContributions)
      .where(eq(exerciseMuscleContributions.ownerUserId, userId))
      .run();
    tx.delete(adaptiveNutritionReviewActions)
      .where(eq(adaptiveNutritionReviewActions.userId, userId))
      .run();
    tx.delete(adaptiveNutritionReviews).where(eq(adaptiveNutritionReviews.userId, userId)).run();
    tx.delete(adaptiveNutritionReviewContexts)
      .where(eq(adaptiveNutritionReviewContexts.userId, userId))
      .run();
    tx.delete(nutritionTargetEvents).where(eq(nutritionTargetEvents.userId, userId)).run();
    tx.delete(nutritionTargets).where(eq(nutritionTargets.userId, userId)).run();
    tx.delete(adaptiveNutritionGoalCompletions)
      .where(eq(adaptiveNutritionGoalCompletions.userId, userId))
      .run();
    tx.delete(adaptiveNutritionCheckIns).where(eq(adaptiveNutritionCheckIns.userId, userId)).run();
    tx.delete(adaptiveNutritionGoalRevisions)
      .where(eq(adaptiveNutritionGoalRevisions.userId, userId))
      .run();
    tx.delete(adaptiveNutritionGoals).where(eq(adaptiveNutritionGoals.userId, userId)).run();
    tx.delete(adaptiveNutritionPrograms).where(eq(adaptiveNutritionPrograms.userId, userId)).run();
    const result = tx.delete(users).where(eq(users.id, userId)).run();
    return result.changes === 1;
  });
};
