import { and, asc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import type {
  CreateScheduledWorkoutInput,
  ExerciseTrackingType,
  ScheduledWorkout,
  ScheduledWorkoutListItem,
  UpdateScheduledWorkoutInput,
} from '@pulse/shared';

import {
  exercises,
  scheduledWorkouts,
  templateExercises,
  workoutTemplates,
} from '../../db/schema/index.js';

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

  const scheduledWorkoutRows = db
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
        isNull(scheduledWorkouts.sessionId),
      ),
    )
    .orderBy(asc(scheduledWorkouts.date), asc(scheduledWorkouts.createdAt))
    .all();

  const templateIds = [
    ...new Set(
      scheduledWorkoutRows
        .map((scheduledWorkout) => scheduledWorkout.templateId)
        .filter((templateId): templateId is string => templateId !== null),
    ),
  ];

  if (templateIds.length === 0) {
    return scheduledWorkoutRows;
  }

  const templateTrackingTypeRows = db
    .select({
      templateId: templateExercises.templateId,
      trackingType: exercises.trackingType,
    })
    .from(templateExercises)
    .innerJoin(exercises, eq(exercises.id, templateExercises.exerciseId))
    .where(
      and(
        inArray(templateExercises.templateId, templateIds),
        or(
          isNull(exercises.userId),
          and(eq(exercises.userId, userId), isNull(exercises.deletedAt)),
        ),
      ),
    )
    .all();

  const trackingTypesByTemplateId = new Map<string, Set<ExerciseTrackingType>>();
  for (const row of templateTrackingTypeRows) {
    const existingTrackingTypes = trackingTypesByTemplateId.get(row.templateId) ?? new Set();
    existingTrackingTypes.add(row.trackingType);
    trackingTypesByTemplateId.set(row.templateId, existingTrackingTypes);
  }

  return scheduledWorkoutRows.map((scheduledWorkout) => {
    const trackingTypes =
      scheduledWorkout.templateId !== null
        ? [...(trackingTypesByTemplateId.get(scheduledWorkout.templateId) ?? new Set())]
        : [];

    if (trackingTypes.length === 0) {
      return scheduledWorkout;
    }

    return {
      ...scheduledWorkout,
      templateTrackingTypes: trackingTypes,
    };
  });
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

  const existingWorkout = await findScheduledWorkoutById(id, userId);
  if (!existingWorkout) {
    return undefined;
  }

  const shouldClearSessionLink = existingWorkout.date !== changes.date;
  const updatePayload = shouldClearSessionLink ? { ...changes, sessionId: null } : changes;

  const [updatedWorkout] = await db
    .update(scheduledWorkouts)
    .set(updatePayload)
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

export const findScheduledWorkoutBySessionId = async (
  sessionId: string,
  userId: string,
): Promise<ScheduledWorkout | undefined> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(scheduledWorkoutSelection)
    .from(scheduledWorkouts)
    .where(and(eq(scheduledWorkouts.sessionId, sessionId), eq(scheduledWorkouts.userId, userId)))
    .limit(1)
    .get();
};

export const unlinkScheduledWorkoutSession = async (
  id: string,
  userId: string,
): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .update(scheduledWorkouts)
    .set({ sessionId: null })
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
