import { trashTypeSchema, type TrashListResponse, type TrashType } from '@pulse/shared';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import {
  exercises,
  foods,
  habits,
  mealItems,
  meals,
  nutritionLogs,
  sessionSets,
  templateExercises,
  workoutSessions,
  workoutTemplates,
} from '../../db/schema/index.js';
import { sendError } from '../../lib/reply.js';
import { requireUserAuth } from '../../middleware/auth.js';

const TRASH_ITEM_NOT_FOUND_RESPONSE = {
  code: 'TRASH_ITEM_NOT_FOUND',
  message: 'Trash item not found',
} as const;

const TRASH_INVALID_TYPE_RESPONSE = {
  code: 'VALIDATION_ERROR',
  message: 'Invalid trash type',
} as const;

const parseId = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const requireDeletedAt = (value: string | null): string => {
  if (value === null) {
    throw new Error('deletedAt unexpectedly null in trash list');
  }

  return value;
};

const listTrash = async (userId: string): Promise<TrashListResponse> => {
  const { db } = await import('../../db/index.js');

  const [habitRows, templateRows, exerciseRows, foodRows, sessionRows] = await Promise.all([
    db
      .select({ id: habits.id, name: habits.name, deletedAt: habits.deletedAt })
      .from(habits)
      .where(and(eq(habits.userId, userId), isNotNull(habits.deletedAt)))
      .orderBy(sql`${habits.deletedAt} desc`)
      .all(),
    db
      .select({
        id: workoutTemplates.id,
        name: workoutTemplates.name,
        deletedAt: workoutTemplates.deletedAt,
      })
      .from(workoutTemplates)
      .where(and(eq(workoutTemplates.userId, userId), isNotNull(workoutTemplates.deletedAt)))
      .orderBy(sql`${workoutTemplates.deletedAt} desc`)
      .all(),
    db
      .select({ id: exercises.id, name: exercises.name, deletedAt: exercises.deletedAt })
      .from(exercises)
      .where(and(eq(exercises.userId, userId), isNotNull(exercises.deletedAt)))
      .orderBy(sql`${exercises.deletedAt} desc`)
      .all(),
    db
      .select({ id: foods.id, name: foods.name, deletedAt: foods.deletedAt })
      .from(foods)
      .where(and(eq(foods.userId, userId), isNotNull(foods.deletedAt)))
      .orderBy(sql`${foods.deletedAt} desc`)
      .all(),
    db
      .select({
        id: workoutSessions.id,
        name: workoutSessions.name,
        deletedAt: workoutSessions.deletedAt,
      })
      .from(workoutSessions)
      .where(and(eq(workoutSessions.userId, userId), isNotNull(workoutSessions.deletedAt)))
      .orderBy(sql`${workoutSessions.deletedAt} desc`)
      .all(),
  ]);

  return {
    habits: habitRows.map((row) => ({
      id: row.id,
      type: 'habits',
      name: row.name,
      deletedAt: requireDeletedAt(row.deletedAt),
    })),
    'workout-templates': templateRows.map((row) => ({
      id: row.id,
      type: 'workout-templates',
      name: row.name,
      deletedAt: requireDeletedAt(row.deletedAt),
    })),
    exercises: exerciseRows.map((row) => ({
      id: row.id,
      type: 'exercises',
      name: row.name,
      deletedAt: requireDeletedAt(row.deletedAt),
    })),
    foods: foodRows.map((row) => ({
      id: row.id,
      type: 'foods',
      name: row.name,
      deletedAt: requireDeletedAt(row.deletedAt),
    })),
    'workout-sessions': sessionRows.map((row) => ({
      id: row.id,
      type: 'workout-sessions',
      name: row.name,
      deletedAt: requireDeletedAt(row.deletedAt),
    })),
  };
};

const restoreTrashItem = async ({
  id,
  type,
  userId,
}: {
  id: string;
  type: TrashType;
  userId: string;
}): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  switch (type) {
    case 'habits': {
      const result = db
        .update(habits)
        .set({
          deletedAt: null,
          active: true,
        })
        .where(and(eq(habits.id, id), eq(habits.userId, userId), isNotNull(habits.deletedAt)))
        .run();

      return result.changes === 1;
    }

    case 'workout-templates': {
      const result = db
        .update(workoutTemplates)
        .set({
          deletedAt: null,
        })
        .where(
          and(
            eq(workoutTemplates.id, id),
            eq(workoutTemplates.userId, userId),
            isNotNull(workoutTemplates.deletedAt),
          ),
        )
        .run();

      return result.changes === 1;
    }

    case 'exercises': {
      const result = db
        .update(exercises)
        .set({
          deletedAt: null,
        })
        .where(
          and(eq(exercises.id, id), eq(exercises.userId, userId), isNotNull(exercises.deletedAt)),
        )
        .run();

      return result.changes === 1;
    }

    case 'foods': {
      const result = db
        .update(foods)
        .set({
          deletedAt: null,
        })
        .where(and(eq(foods.id, id), eq(foods.userId, userId), isNotNull(foods.deletedAt)))
        .run();

      return result.changes === 1;
    }

    case 'workout-sessions': {
      const result = db
        .update(workoutSessions)
        .set({
          deletedAt: null,
        })
        .where(
          and(
            eq(workoutSessions.id, id),
            eq(workoutSessions.userId, userId),
            isNotNull(workoutSessions.deletedAt),
          ),
        )
        .run();

      return result.changes === 1;
    }
  }
};

const purgeTrashItem = async ({
  id,
  type,
  userId,
}: {
  id: string;
  type: TrashType;
  userId: string;
}): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  switch (type) {
    case 'habits': {
      const result = db
        .delete(habits)
        .where(and(eq(habits.id, id), eq(habits.userId, userId), isNotNull(habits.deletedAt)))
        .run();

      return result.changes === 1;
    }

    case 'workout-templates': {
      const result = db
        .delete(workoutTemplates)
        .where(
          and(
            eq(workoutTemplates.id, id),
            eq(workoutTemplates.userId, userId),
            isNotNull(workoutTemplates.deletedAt),
          ),
        )
        .run();

      return result.changes === 1;
    }

    case 'exercises':
      return db.transaction((tx) => {
        const target = tx
          .select({ id: exercises.id })
          .from(exercises)
          .where(and(eq(exercises.id, id), eq(exercises.userId, userId), isNotNull(exercises.deletedAt)))
          .limit(1)
          .get();

        if (!target) {
          return false;
        }

        tx.delete(templateExercises)
          .where(
            and(
              eq(templateExercises.exerciseId, id),
              sql`exists (
                select 1
                from ${workoutTemplates}
                where ${workoutTemplates.id} = ${templateExercises.templateId}
                  and ${workoutTemplates.userId} = ${userId}
              )`,
            ),
          )
          .run();

        tx.delete(sessionSets)
          .where(
            and(
              eq(sessionSets.exerciseId, id),
              sql`exists (
                select 1
                from ${workoutSessions}
                where ${workoutSessions.id} = ${sessionSets.sessionId}
                  and ${workoutSessions.userId} = ${userId}
              )`,
            ),
          )
          .run();

        tx.delete(exercises)
          .where(
            and(eq(exercises.id, id), eq(exercises.userId, userId), isNotNull(exercises.deletedAt)),
          )
          .run();

        return true;
      });

    case 'foods':
      return db.transaction((tx) => {
        const linkedMealIds = tx
          .select({ mealId: mealItems.mealId })
          .from(mealItems)
          .where(eq(mealItems.foodId, id))
          .all();

        if (linkedMealIds.length > 0) {
          const mealIds = [...new Set(linkedMealIds.map((row) => row.mealId))];
          const ownedMealIds = tx
            .select({ id: meals.id })
            .from(meals)
            .innerJoin(nutritionLogs, eq(nutritionLogs.id, meals.nutritionLogId))
            .where(and(inArray(meals.id, mealIds), eq(nutritionLogs.userId, userId)))
            .all()
            .map((row) => row.id);

          if (ownedMealIds.length > 0) {
            tx.delete(mealItems)
              .where(and(eq(mealItems.foodId, id), inArray(mealItems.mealId, ownedMealIds)))
              .run();
          }
        }

        const deletedFood = tx
          .delete(foods)
          .where(and(eq(foods.id, id), eq(foods.userId, userId), isNotNull(foods.deletedAt)))
          .run();

        return deletedFood.changes === 1;
      });

    case 'workout-sessions':
      return db.transaction((tx) => {
        const target = tx
          .select({ id: workoutSessions.id })
          .from(workoutSessions)
          .where(
            and(
              eq(workoutSessions.id, id),
              eq(workoutSessions.userId, userId),
              isNotNull(workoutSessions.deletedAt),
            ),
          )
          .limit(1)
          .get();

        if (!target) {
          return false;
        }

        tx.delete(sessionSets).where(eq(sessionSets.sessionId, id)).run();

        tx.delete(workoutSessions)
          .where(
            and(
              eq(workoutSessions.id, id),
              eq(workoutSessions.userId, userId),
              isNotNull(workoutSessions.deletedAt),
            ),
          )
          .run();

        return true;
      });
  }
};

export const trashRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireUserAuth);

  app.get('/', async (request, reply) => {
    const trash = await listTrash(request.userId);
    return reply.send({ data: trash });
  });

  app.post<{ Params: { id: string; type: string } }>(
    '/:type/:id/restore',
    async (request, reply) => {
      const typeParse = trashTypeSchema.safeParse(request.params.type);
      if (!typeParse.success) {
        return sendError(
          reply,
          400,
          TRASH_INVALID_TYPE_RESPONSE.code,
          TRASH_INVALID_TYPE_RESPONSE.message,
        );
      }

      const id = parseId(request.params.id);
      if (!id) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid trash item id');
      }

      const restored = await restoreTrashItem({
        id,
        type: typeParse.data,
        userId: request.userId,
      });
      if (!restored) {
        return sendError(
          reply,
          404,
          TRASH_ITEM_NOT_FOUND_RESPONSE.code,
          TRASH_ITEM_NOT_FOUND_RESPONSE.message,
        );
      }

      return reply.send({ data: { success: true } });
    },
  );

  app.delete<{ Params: { id: string; type: string } }>('/:type/:id', async (request, reply) => {
    const typeParse = trashTypeSchema.safeParse(request.params.type);
    if (!typeParse.success) {
      return sendError(
        reply,
        400,
        TRASH_INVALID_TYPE_RESPONSE.code,
        TRASH_INVALID_TYPE_RESPONSE.message,
      );
    }

    const id = parseId(request.params.id);
    if (!id) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid trash item id');
    }

    const purged = await purgeTrashItem({
      id,
      type: typeParse.data,
      userId: request.userId,
    });
    if (!purged) {
      return sendError(
        reply,
        404,
        TRASH_ITEM_NOT_FOUND_RESPONSE.code,
        TRASH_ITEM_NOT_FOUND_RESPONSE.message,
      );
    }

    return reply.send({ data: { success: true } });
  });
};
