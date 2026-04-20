import { randomUUID } from 'node:crypto';

import {
  apiDataResponseSchema,
  createScheduledWorkoutInputSchema,
  scheduledWorkoutDetailSchema,
  scheduledWorkoutListItemSchema,
  scheduledWorkoutQueryParamsSchema,
  scheduledWorkoutSchema,
  updateScheduledWorkoutInputSchema,
  workoutTemplateSchema,
} from '@pulse/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { exercises, workoutTemplates } from '../../db/schema/index.js';
import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
  idParamsSchema,
  successFlagSchema,
} from '../../openapi.js';
import { templateBelongsToUser } from '../workout-templates/template-access.js';
import { findWorkoutTemplateById } from '../workout-templates/store.js';

import {
  computeTemplateVersionForTemplateId,
  readSnapshot,
  writeSnapshot,
} from './snapshot-store.js';
import {
  createScheduledWorkout,
  deleteScheduledWorkout,
  findScheduledWorkoutById,
  findScheduledWorkoutByIdWithTemplateVersion,
  listScheduledWorkouts,
  updateScheduledWorkout,
} from './store.js';

const SCHEDULED_WORKOUT_NOT_FOUND_RESPONSE = {
  code: 'SCHEDULED_WORKOUT_NOT_FOUND',
  message: 'Scheduled workout not found',
} as const;

const WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE = {
  code: 'WORKOUT_TEMPLATE_NOT_FOUND',
  message: 'Workout template not found',
} as const;

const TEMPLATE_DRIFT_SUMMARY = 'Template has been updated since scheduling.';

const scheduledWorkoutDetailWithTemplateSchema = scheduledWorkoutDetailSchema.extend({
  template: workoutTemplateSchema.nullable(),
});

const mapSnapshotExercise = (exercise: Awaited<ReturnType<typeof readSnapshot>>['exercises'][number]) => ({
  exerciseId: exercise.exerciseId,
  section: exercise.section,
  orderIndex: exercise.orderIndex,
  programmingNotes: exercise.programmingNotes,
  agentNotes: exercise.agentNotes,
  agentNotesMeta: exercise.agentNotesMeta,
  templateCues: exercise.templateCues,
  supersetGroup: exercise.supersetGroup,
  tempo: exercise.tempo,
  restSeconds: exercise.restSeconds,
  sets: exercise.sets.map((set) => ({
    setNumber: set.setNumber,
    repsMin: set.repsMin,
    repsMax: set.repsMax,
    reps: set.reps,
    targetWeight: set.targetWeight,
    targetWeightMin: set.targetWeightMin,
    targetWeightMax: set.targetWeightMax,
    targetSeconds: set.targetSeconds,
    targetDistance: set.targetDistance,
  })),
});

const buildScheduledWorkoutDetail = async ({
  scheduledWorkoutId,
  userId,
}: {
  scheduledWorkoutId: string;
  userId: string;
}) => {
  const scheduledWorkout = await findScheduledWorkoutByIdWithTemplateVersion(
    scheduledWorkoutId,
    userId,
  );
  if (!scheduledWorkout) {
    return null;
  }

  const { db } = await import('../../db/index.js');
  const snapshot = await readSnapshot(scheduledWorkout.id, db);
  const snapshotExercises = snapshot.exercises.map(mapSnapshotExercise);
  const uniqueSnapshotExerciseIds = [...new Set(snapshotExercises.map((exercise) => exercise.exerciseId))];

  const exerciseRows =
    uniqueSnapshotExerciseIds.length === 0
      ? []
      : db
          .select({
            id: exercises.id,
            userId: exercises.userId,
            name: exercises.name,
            deletedAt: exercises.deletedAt,
          })
          .from(exercises)
          .where(inArray(exercises.id, uniqueSnapshotExerciseIds))
          .all();

  const exercisesById = new Map(exerciseRows.map((row) => [row.id, row]));
  const staleByExerciseId = new Map<string, { exerciseId: string; snapshotName: string }>();

  for (const snapshotExercise of snapshotExercises) {
    const exercise = exercisesById.get(snapshotExercise.exerciseId);
    const isMissing = !exercise;
    const isSoftDeleted = exercise?.deletedAt != null;
    const isOutsideUserScope =
      exercise !== undefined && exercise.userId !== null && exercise.userId !== userId;

    if (isMissing || isSoftDeleted || isOutsideUserScope) {
      staleByExerciseId.set(snapshotExercise.exerciseId, {
        exerciseId: snapshotExercise.exerciseId,
        // Snapshot rows do not currently denormalize exercise names, so
        // hard-deleted exercises fall back to the historical exercise id.
        snapshotName: exercise?.name ?? snapshotExercise.exerciseId,
      });
    }
  }

  let templateDeleted = false;
  let templateDrift: { changedAt: number; summary: string } | null = null;

  if (scheduledWorkout.templateId) {
    const sourceTemplate = db
      .select({
        id: workoutTemplates.id,
        deletedAt: workoutTemplates.deletedAt,
        updatedAt: workoutTemplates.updatedAt,
      })
      .from(workoutTemplates)
      .where(
        and(
          eq(workoutTemplates.id, scheduledWorkout.templateId),
          eq(workoutTemplates.userId, userId),
        ),
      )
      .limit(1)
      .get();

    templateDeleted = !sourceTemplate || sourceTemplate.deletedAt !== null;

    if (sourceTemplate && sourceTemplate.deletedAt === null && scheduledWorkout.templateVersion) {
      const currentTemplateVersion = await computeTemplateVersionForTemplateId(
        scheduledWorkout.templateId,
        db,
      );

      if (currentTemplateVersion !== scheduledWorkout.templateVersion) {
        templateDrift = {
          changedAt: sourceTemplate.updatedAt,
          summary: TEMPLATE_DRIFT_SUMMARY,
        };
      }
    }
  }

  return {
    ...scheduledWorkout,
    exercises: snapshotExercises,
    templateDrift,
    staleExercises: [...staleByExerciseId.values()],
    templateDeleted,
  };
};

const buildScheduledWorkoutDetailWithTemplate = async ({
  scheduledWorkoutId,
  userId,
}: {
  scheduledWorkoutId: string;
  userId: string;
}) => {
  const payload = await buildScheduledWorkoutDetail({
    scheduledWorkoutId,
    userId,
  });
  if (!payload) {
    return null;
  }

  const template =
    payload.templateId && !payload.templateDeleted
      ? ((await findWorkoutTemplateById(payload.templateId, userId)) ?? null)
      : null;

  return {
    ...payload,
    template,
  };
};

export const scheduledWorkoutRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/',
    {
      schema: {
        body: createScheduledWorkoutInputSchema,
        response: {
          201: apiDataResponseSchema(scheduledWorkoutDetailSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['scheduled-workouts'],
        summary: 'Create a scheduled workout',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const templateAccessible = await templateBelongsToUser(
        request.body.templateId,
        request.userId,
      );
      if (!templateAccessible) {
        return sendError(
          reply,
          404,
          WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.code,
          WORKOUT_TEMPLATE_NOT_FOUND_RESPONSE.message,
        );
      }

      const scheduledWorkout = await createScheduledWorkout({
        id: randomUUID(),
        userId: request.userId,
        input: request.body,
      });

      await writeSnapshot({
        scheduledWorkoutId: scheduledWorkout.id,
        templateId: request.body.templateId,
      });

      const scheduledWorkoutDetail = await buildScheduledWorkoutDetail({
        scheduledWorkoutId: scheduledWorkout.id,
        userId: request.userId,
      });
      if (!scheduledWorkoutDetail) {
        throw new Error('Created scheduled workout could not be loaded');
      }

      return reply.code(201).send({
        data: scheduledWorkoutDetail,
      });
    },
  );

  typedApp.get(
    '/',
    {
      schema: {
        querystring: scheduledWorkoutQueryParamsSchema,
        response: {
          200: apiDataResponseSchema(z.array(scheduledWorkoutListItemSchema)),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['scheduled-workouts'],
        summary: 'List scheduled workouts',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const scheduledWorkoutItems = await listScheduledWorkouts({
        userId: request.userId,
        ...request.query,
      });

      return reply.send({
        data: scheduledWorkoutItems,
      });
    },
  );

  typedApp.get(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(scheduledWorkoutDetailWithTemplateSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['scheduled-workouts'],
        summary: 'Get a scheduled workout with template details',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const scheduledWorkoutDetail = await buildScheduledWorkoutDetailWithTemplate({
        scheduledWorkoutId: request.params.id,
        userId: request.userId,
      });
      if (!scheduledWorkoutDetail) {
        return sendError(
          reply,
          404,
          SCHEDULED_WORKOUT_NOT_FOUND_RESPONSE.code,
          SCHEDULED_WORKOUT_NOT_FOUND_RESPONSE.message,
        );
      }

      return reply.send({
        data: scheduledWorkoutDetail,
      });
    },
  );

  typedApp.patch(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateScheduledWorkoutInputSchema,
        response: {
          200: apiDataResponseSchema(scheduledWorkoutSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['scheduled-workouts'],
        summary: 'Update a scheduled workout',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const existingScheduledWorkout = await findScheduledWorkoutById(
        request.params.id,
        request.userId,
      );
      if (!existingScheduledWorkout) {
        return sendError(
          reply,
          404,
          SCHEDULED_WORKOUT_NOT_FOUND_RESPONSE.code,
          SCHEDULED_WORKOUT_NOT_FOUND_RESPONSE.message,
        );
      }

      const scheduledWorkout = await updateScheduledWorkout({
        id: request.params.id,
        userId: request.userId,
        changes: request.body,
      });
      if (!scheduledWorkout) {
        return sendError(
          reply,
          404,
          SCHEDULED_WORKOUT_NOT_FOUND_RESPONSE.code,
          SCHEDULED_WORKOUT_NOT_FOUND_RESPONSE.message,
        );
      }

      return reply.send({
        data: scheduledWorkout,
      });
    },
  );

  typedApp.delete(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(successFlagSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['scheduled-workouts'],
        summary: 'Delete a scheduled workout',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const deleted = await deleteScheduledWorkout(request.params.id, request.userId);
      if (!deleted) {
        return sendError(
          reply,
          404,
          SCHEDULED_WORKOUT_NOT_FOUND_RESPONSE.code,
          SCHEDULED_WORKOUT_NOT_FOUND_RESPONSE.message,
        );
      }

      return reply.send({
        data: {
          success: true,
        },
      });
    },
  );
};
