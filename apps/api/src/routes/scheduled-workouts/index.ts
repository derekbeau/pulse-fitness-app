import { randomUUID } from 'node:crypto';

import {
  apiDataResponseSchema,
  createScheduledWorkoutInputSchema,
  scheduledWorkoutDetailSchema,
  scheduledWorkoutListItemSchema,
  scheduledWorkoutQueryParamsSchema,
  scheduledWorkoutSchema,
  swapScheduledWorkoutExerciseInputSchema,
  swapScheduledWorkoutExerciseResponseSchema,
  updateScheduledWorkoutExerciseNotesInputSchema,
  updateScheduledWorkoutExerciseNotesResponseSchema,
  updateScheduledWorkoutInputSchema,
  workoutTemplateSchema,
} from '@pulse/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { TemplateExerciseSetTarget } from '../../db/schema/index.js';
import {
  agentTokens,
  exercises,
  scheduledWorkoutExerciseSets,
  scheduledWorkoutExercises,
  scheduledWorkouts,
  templateExercises,
  workoutTemplates,
} from '../../db/schema/index.js';
import { sendError } from '../../lib/reply.js';
import { requireAgentOnly, requireAuth } from '../../middleware/auth.js';
import {
  apiErrorResponseSchema,
  agentTokenSecurity,
  authSecurity,
  badRequestResponseSchema,
  idParamsSchema,
  successFlagSchema,
} from '../../openapi.js';
import { allRelatedExercisesOwned } from '../exercises/store.js';
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

const SCHEDULED_WORKOUT_EXERCISE_NOT_FOUND_RESPONSE = {
  code: 'SCHEDULED_WORKOUT_EXERCISE_NOT_FOUND',
  message: 'Scheduled workout exercise not found',
} as const;

const SCHEDULED_WORKOUT_DUPLICATE_EXERCISE_RESPONSE = {
  code: 'SCHEDULED_WORKOUT_DUPLICATE_EXERCISE',
  message: 'Target exercise already exists in this scheduled workout',
} as const;

const INVALID_SCHEDULED_WORKOUT_EXERCISE_RESPONSE = {
  code: 'INVALID_SCHEDULED_WORKOUT_EXERCISE',
  message: 'Exercise is not available for this user',
} as const;

const TEMPLATE_DRIFT_SUMMARY = 'Template has been updated since scheduling.';

const scheduledWorkoutDetailWithTemplateSchema = scheduledWorkoutDetailSchema.extend({
  template: workoutTemplateSchema.nullable(),
});

const DAY_MS = 24 * 60 * 60 * 1000;

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

const toUtcDay = (date: string): number => {
  const [yearText, monthText, dayText] = date.split('-');
  const year = Number.parseInt(yearText ?? '', 10);
  const month = Number.parseInt(monthText ?? '', 10);
  const day = Number.parseInt(dayText ?? '', 10);
  return Math.trunc(Date.UTC(year, month - 1, day) / DAY_MS);
};

const shouldMarkAgentNoteStale = ({
  scheduledDateAtGeneration,
  newDate,
}: {
  scheduledDateAtGeneration: string;
  newDate: string;
}) => Math.abs(toUtcDay(newDate) - toUtcDay(scheduledDateAtGeneration)) > 2;

const toExactReps = (repsMin: number | null, repsMax: number | null): number | null => {
  if (repsMin === null || repsMax === null) {
    return null;
  }

  return repsMin === repsMax ? repsMin : null;
};

const toSnapshotSetDrafts = ({
  sets,
  repsMin,
  repsMax,
  setTargets,
}: {
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  setTargets: TemplateExerciseSetTarget[] | null;
}) => {
  const sortedTargets = [...(setTargets ?? [])].sort((left, right) => left.setNumber - right.setNumber);
  const reps = toExactReps(repsMin, repsMax);

  if (sortedTargets.length > 0) {
    return sortedTargets.map((target) => ({
      setNumber: target.setNumber,
      repsMin,
      repsMax,
      reps,
      targetWeight: target.targetWeight ?? null,
      targetWeightMin: target.targetWeightMin ?? null,
      targetWeightMax: target.targetWeightMax ?? null,
      targetSeconds: target.targetSeconds ?? null,
      targetDistance: target.targetDistance ?? null,
    }));
  }

  const setCount = Math.max(1, sets ?? 1);
  return Array.from({ length: setCount }, (_, index) => ({
    setNumber: index + 1,
    repsMin,
    repsMax,
    reps,
    targetWeight: null,
    targetWeightMin: null,
    targetWeightMax: null,
    targetSeconds: null,
    targetDistance: null,
  }));
};

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

const markRescheduledAgentNotesAsStale = async ({
  scheduledWorkoutId,
  newDate,
}: {
  scheduledWorkoutId: string;
  newDate: string;
}) => {
  const { db } = await import('../../db/index.js');
  db.transaction((tx) => {
    const exercisesWithAgentNotes = tx
      .select({
        id: scheduledWorkoutExercises.id,
        agentNotesMeta: scheduledWorkoutExercises.agentNotesMeta,
      })
      .from(scheduledWorkoutExercises)
      .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
      .all();

    for (const row of exercisesWithAgentNotes) {
      if (!row.agentNotesMeta) {
        continue;
      }

      if (
        !shouldMarkAgentNoteStale({
          scheduledDateAtGeneration: row.agentNotesMeta.scheduledDateAtGeneration,
          newDate,
        })
      ) {
        continue;
      }

      tx.update(scheduledWorkoutExercises)
        .set({
          agentNotesMeta: {
            ...row.agentNotesMeta,
            stale: true,
          },
        })
        .where(eq(scheduledWorkoutExercises.id, row.id))
        .run();
    }
  });
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
    '/:id/exercise-notes',
    {
      preHandler: requireAgentOnly,
      schema: {
        params: idParamsSchema,
        body: updateScheduledWorkoutExerciseNotesInputSchema,
        response: {
          200: apiDataResponseSchema(updateScheduledWorkoutExerciseNotesResponseSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['scheduled-workouts'],
        summary: 'Update per-exercise agent notes on a scheduled workout',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) => {
      const scheduledWorkout = await findScheduledWorkoutById(request.params.id, request.userId);
      if (!scheduledWorkout) {
        return sendError(
          reply,
          404,
          SCHEDULED_WORKOUT_NOT_FOUND_RESPONSE.code,
          SCHEDULED_WORKOUT_NOT_FOUND_RESPONSE.message,
        );
      }

      const snapshot = await readSnapshot(scheduledWorkout.id);
      const snapshotExerciseIds = new Set(snapshot.exercises.map((exercise) => exercise.exerciseId));
      const noteUpdates = new Map<string, string | null>();
      for (const note of request.body.notes) {
        noteUpdates.set(note.exerciseId, note.agentNotes);
      }

      const unknownExerciseIds = [...noteUpdates.keys()].filter(
        (exerciseId) => !snapshotExerciseIds.has(exerciseId),
      );
      if (unknownExerciseIds.length > 0) {
        return sendError(
          reply,
          400,
          'VALIDATION_ERROR',
          `Unknown exerciseId values for this scheduled workout: ${unknownExerciseIds.join(', ')}`,
        );
      }

      const { db } = await import('../../db/index.js');
      const agentTokenId = request.agentTokenId;
      if (!agentTokenId) {
        throw new Error('Agent token id missing for AgentToken-authenticated request');
      }

      const tokenIdentity = db
        .select({ name: agentTokens.name })
        .from(agentTokens)
        .where(
          and(
            eq(agentTokens.id, agentTokenId),
            eq(agentTokens.userId, request.userId),
          ),
        )
        .limit(1)
        .get();
      const author = tokenIdentity?.name ?? agentTokenId;
      const generatedAt = new Date().toISOString();

      db.transaction((tx) => {
        for (const [exerciseId, agentNotes] of noteUpdates.entries()) {
          tx.update(scheduledWorkoutExercises)
            .set({
              agentNotes,
              agentNotesMeta:
                agentNotes === null
                  ? null
                  : {
                      author,
                      generatedAt,
                      scheduledDateAtGeneration: scheduledWorkout.date,
                      stale: false,
                    },
            })
            .where(
              and(
                eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkout.id),
                eq(scheduledWorkoutExercises.exerciseId, exerciseId),
              ),
            )
            .run();
        }
      });

      const updatedDetail = await buildScheduledWorkoutDetail({
        scheduledWorkoutId: scheduledWorkout.id,
        userId: request.userId,
      });
      if (!updatedDetail) {
        throw new Error('Updated scheduled workout could not be loaded');
      }

      return reply.send({
        data: updatedDetail,
      });
    },
  );

  typedApp.patch(
    '/:id/exercise-swap',
    {
      schema: {
        params: idParamsSchema,
        body: swapScheduledWorkoutExerciseInputSchema,
        response: {
          200: apiDataResponseSchema(swapScheduledWorkoutExerciseResponseSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['scheduled-workouts'],
        summary: 'Swap or remove an exercise in a scheduled workout snapshot',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const scheduledWorkout = await findScheduledWorkoutById(request.params.id, request.userId);
      if (!scheduledWorkout) {
        return sendError(
          reply,
          404,
          SCHEDULED_WORKOUT_NOT_FOUND_RESPONSE.code,
          SCHEDULED_WORKOUT_NOT_FOUND_RESPONSE.message,
        );
      }

      const snapshot = await readSnapshot(scheduledWorkout.id);
      const sourceSnapshotExercise = snapshot.exercises.find(
        (exercise) => exercise.exerciseId === request.body.fromExerciseId,
      );
      if (!sourceSnapshotExercise) {
        return sendError(
          reply,
          404,
          SCHEDULED_WORKOUT_EXERCISE_NOT_FOUND_RESPONSE.code,
          SCHEDULED_WORKOUT_EXERCISE_NOT_FOUND_RESPONSE.message,
        );
      }

      if (request.body.toExerciseId === request.body.fromExerciseId) {
        return sendError(
          reply,
          400,
          INVALID_SCHEDULED_WORKOUT_EXERCISE_RESPONSE.code,
          INVALID_SCHEDULED_WORKOUT_EXERCISE_RESPONSE.message,
        );
      }

      if (
        request.body.toExerciseId !== null &&
        snapshot.exercises.some((exercise) => exercise.exerciseId === request.body.toExerciseId)
      ) {
        return sendError(
          reply,
          409,
          SCHEDULED_WORKOUT_DUPLICATE_EXERCISE_RESPONSE.code,
          SCHEDULED_WORKOUT_DUPLICATE_EXERCISE_RESPONSE.message,
        );
      }

      if (request.body.toExerciseId !== null) {
        const hasValidSwapTarget = await allRelatedExercisesOwned({
          userId: request.userId,
          exerciseIds: [request.body.toExerciseId],
        });
        if (!hasValidSwapTarget) {
          return sendError(
            reply,
            400,
            INVALID_SCHEDULED_WORKOUT_EXERCISE_RESPONSE.code,
            INVALID_SCHEDULED_WORKOUT_EXERCISE_RESPONSE.message,
          );
        }
      }

      const { db } = await import('../../db/index.js');
      const swapSucceeded = db.transaction((tx) => {
        const sourceRows = tx
          .select({
            id: scheduledWorkoutExercises.id,
            programmingNotes: scheduledWorkoutExercises.programmingNotes,
          })
          .from(scheduledWorkoutExercises)
          .where(
            and(
              eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkout.id),
              eq(scheduledWorkoutExercises.exerciseId, request.body.fromExerciseId),
            ),
          )
          .all();

        if (sourceRows.length === 0) {
          return false;
        }

        if (request.body.toExerciseId === null) {
          tx.delete(scheduledWorkoutExercises)
            .where(
              and(
                eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkout.id),
                eq(scheduledWorkoutExercises.exerciseId, request.body.fromExerciseId),
              ),
            )
            .run();

          tx.update(scheduledWorkouts)
            .set({ updatedAt: Date.now() })
            .where(eq(scheduledWorkouts.id, scheduledWorkout.id))
            .run();

          return true;
        }

        const carryOverProgrammingNotes = request.body.carryOverProgrammingNotes === true;
        for (const sourceRow of sourceRows) {
          tx.update(scheduledWorkoutExercises)
            .set({
              exerciseId: request.body.toExerciseId,
              programmingNotes: carryOverProgrammingNotes ? sourceRow.programmingNotes : null,
              agentNotes: null,
              agentNotesMeta: null,
              templateCues: null,
            })
            .where(eq(scheduledWorkoutExercises.id, sourceRow.id))
            .run();
        }

        const templateIdForDefaults = scheduledWorkout.templateId;
        const shouldResetSets =
          request.body.preserveSets !== true && templateIdForDefaults !== null;
        if (shouldResetSets) {
          const targetTemplateExercise = tx
            .select({
              id: templateExercises.id,
              sets: templateExercises.sets,
              repsMin: templateExercises.repsMin,
              repsMax: templateExercises.repsMax,
              setTargets: templateExercises.setTargets,
            })
            .from(templateExercises)
            .where(
              and(
                eq(templateExercises.templateId, templateIdForDefaults),
                eq(templateExercises.exerciseId, request.body.toExerciseId),
              ),
            )
            .orderBy(asc(templateExercises.orderIndex), asc(templateExercises.id))
            .limit(1)
            .get();

          if (targetTemplateExercise) {
            const setDrafts = toSnapshotSetDrafts(targetTemplateExercise);

            for (const sourceRow of sourceRows) {
              tx.delete(scheduledWorkoutExerciseSets)
                .where(eq(scheduledWorkoutExerciseSets.scheduledWorkoutExerciseId, sourceRow.id))
                .run();

              if (setDrafts.length > 0) {
                tx.insert(scheduledWorkoutExerciseSets)
                  .values(
                    setDrafts.map((setDraft) => ({
                      id: randomUUID(),
                      scheduledWorkoutExerciseId: sourceRow.id,
                      setNumber: setDraft.setNumber,
                      repsMin: setDraft.repsMin,
                      repsMax: setDraft.repsMax,
                      reps: setDraft.reps,
                      targetWeight: setDraft.targetWeight,
                      targetWeightMin: setDraft.targetWeightMin,
                      targetWeightMax: setDraft.targetWeightMax,
                      targetSeconds: setDraft.targetSeconds,
                      targetDistance: setDraft.targetDistance,
                    })),
                  )
                  .run();
              }
            }
          }
        }

        tx.update(scheduledWorkouts)
          .set({ updatedAt: Date.now() })
          .where(eq(scheduledWorkouts.id, scheduledWorkout.id))
          .run();

        return true;
      });

      if (!swapSucceeded) {
        return sendError(
          reply,
          404,
          SCHEDULED_WORKOUT_EXERCISE_NOT_FOUND_RESPONSE.code,
          SCHEDULED_WORKOUT_EXERCISE_NOT_FOUND_RESPONSE.message,
        );
      }

      const updatedDetail = await buildScheduledWorkoutDetail({
        scheduledWorkoutId: scheduledWorkout.id,
        userId: request.userId,
      });
      if (!updatedDetail) {
        throw new Error('Swapped scheduled workout could not be loaded');
      }

      return reply.send({
        data: updatedDetail,
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

      if (
        request.body.date !== undefined &&
        request.body.date !== existingScheduledWorkout.date
      ) {
        await markRescheduledAgentNotesAsStale({
          scheduledWorkoutId: scheduledWorkout.id,
          newDate: scheduledWorkout.date,
        });
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
