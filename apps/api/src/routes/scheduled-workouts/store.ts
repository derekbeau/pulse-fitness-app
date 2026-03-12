import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import type {
  CreateScheduledWorkoutInput,
  ScheduledWorkout,
  ScheduledWorkoutListItem,
  UpdateScheduledWorkoutInput,
} from '@pulse/shared';

import { scheduledWorkouts, workoutTemplates } from '../../db/schema/index.js';

const scheduledWorkoutSelection = {
  id: scheduledWorkouts.id,
  userId: scheduledWorkouts.userId,
  templateId: scheduledWorkouts.templateId,
  date: scheduledWorkouts.date,
  sessionId: scheduledWorkouts.sessionId,
  createdAt: scheduledWorkouts.createdAt,
  updatedAt: scheduledWorkouts.updatedAt,
};

const scheduledWorkoutListSelection = {
  id: scheduledWorkouts.id,
  date: scheduledWorkouts.date,
  templateId: scheduledWorkouts.templateId,
  templateName: workoutTemplates.name,
  sessionId: scheduledWorkouts.sessionId,
  createdAt: scheduledWorkouts.createdAt,
};

export const createScheduledWorkout = async ({
  id,
  userId,
  input,
}: {
  id: string;
  userId: string;
  input: CreateScheduledWorkoutInput;
}): Promise<ScheduledWorkout> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .insert(scheduledWorkouts)
    .values({
      id,
      userId,
      templateId: input.templateId,
      date: input.date,
    })
    .run();

  if (result.changes !== 1) {
    throw new Error('Failed to persist scheduled workout');
  }

  const scheduledWorkout = await findScheduledWorkoutById(id, userId);
  if (!scheduledWorkout) {
    throw new Error('Created scheduled workout could not be loaded');
  }

  return scheduledWorkout;
};

export const listScheduledWorkouts = async ({
  userId,
  from,
  to,
}: {
  userId: string;
  from: string;
  to: string;
}): Promise<ScheduledWorkoutListItem[]> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(scheduledWorkoutListSelection)
    .from(scheduledWorkouts)
    .leftJoin(
      workoutTemplates,
      and(
        eq(workoutTemplates.id, scheduledWorkouts.templateId),
        isNull(workoutTemplates.deletedAt),
      ),
    )
    .where(
      and(
        eq(scheduledWorkouts.userId, userId),
        gte(scheduledWorkouts.date, from),
        lte(scheduledWorkouts.date, to),
      ),
    )
    .orderBy(asc(scheduledWorkouts.date), asc(scheduledWorkouts.createdAt))
    .all();
};

export const findScheduledWorkoutById = async (
  id: string,
  userId: string,
): Promise<ScheduledWorkout | undefined> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(scheduledWorkoutSelection)
    .from(scheduledWorkouts)
    .where(and(eq(scheduledWorkouts.id, id), eq(scheduledWorkouts.userId, userId)))
    .limit(1)
    .get();
};

export const updateScheduledWorkout = async ({
  id,
  userId,
  changes,
}: {
  id: string;
  userId: string;
  changes: UpdateScheduledWorkoutInput;
}): Promise<ScheduledWorkout | undefined> => {
  const { db } = await import('../../db/index.js');

  const [updatedWorkout] = await db
    .update(scheduledWorkouts)
    .set(changes)
    .where(and(eq(scheduledWorkouts.id, id), eq(scheduledWorkouts.userId, userId)))
    .returning(scheduledWorkoutSelection);

  return updatedWorkout;
};

export const deleteScheduledWorkout = async (id: string, userId: string): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .delete(scheduledWorkouts)
    .where(and(eq(scheduledWorkouts.id, id), eq(scheduledWorkouts.userId, userId)))
    .run();

  return result.changes === 1;
};

export const linkTodayScheduledWorkoutToSession = async ({
  userId,
  templateId,
  date,
  sessionId,
}: {
  userId: string;
  templateId: string;
  date: string;
  sessionId: string;
}): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  const scheduledWorkout = db
    .select({
      id: scheduledWorkouts.id,
    })
    .from(scheduledWorkouts)
    .where(
      and(
        eq(scheduledWorkouts.userId, userId),
        eq(scheduledWorkouts.templateId, templateId),
        eq(scheduledWorkouts.date, date),
        isNull(scheduledWorkouts.sessionId),
      ),
    )
    .orderBy(asc(scheduledWorkouts.createdAt))
    .limit(1)
    .get();

  if (!scheduledWorkout) {
    return false;
  }

  const result = db
    .update(scheduledWorkouts)
    .set({ sessionId })
    .where(and(eq(scheduledWorkouts.id, scheduledWorkout.id), eq(scheduledWorkouts.userId, userId)))
    .run();

  return result.changes === 1;
};
