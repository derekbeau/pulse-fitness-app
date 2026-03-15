import { randomUUID } from 'node:crypto';

import {
  agentCreateExerciseInputSchema,
  createExerciseInputSchema,
  exerciseLastPerformanceQuerySchema,
  exerciseQueryParamsSchema,
  updateExerciseInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { isAgentRequest, requireAuth } from '../../middleware/auth.js';

import {
  allRelatedExercisesOwned,
  createExercise,
  deleteOwnedExercise,
  findExerciseDedupCandidates,
  findExerciseHistoryWithRelated,
  findExerciseLastPerformance,
  findExerciseOwnership,
  findVisibleExerciseById,
  listExerciseFilters,
  listExercises,
  updateOwnedExercise,
} from './store.js';

const EXERCISE_NOT_FOUND_RESPONSE = {
  code: 'EXERCISE_NOT_FOUND',
  message: 'Exercise not found',
} as const;

const GLOBAL_EXERCISE_READ_ONLY_RESPONSE = {
  code: 'GLOBAL_EXERCISE_READ_ONLY',
  message: 'Global exercises cannot be modified',
} as const;

const INVALID_RELATED_EXERCISES_RESPONSE = {
  code: 'VALIDATION_ERROR',
  message: 'relatedExerciseIds must reference existing user-owned exercises',
} as const;

const DEFAULT_CATEGORY = 'compound' as const;
const DEFAULT_TRACKING_TYPE = 'weight_reps' as const;

const ensureOwnedMutableExercise = async ({
  exerciseId,
  reply,
  userId,
}: {
  exerciseId: string;
  reply: FastifyReply;
  userId: string;
}) => {
  const exerciseOwnership = await findExerciseOwnership(exerciseId, userId);
  if (!exerciseOwnership) {
    sendError(reply, 404, EXERCISE_NOT_FOUND_RESPONSE.code, EXERCISE_NOT_FOUND_RESPONSE.message);
    return false;
  }

  if (exerciseOwnership.userId === null) {
    sendError(
      reply,
      403,
      GLOBAL_EXERCISE_READ_ONLY_RESPONSE.code,
      GLOBAL_EXERCISE_READ_ONLY_RESPONSE.message,
    );
    return false;
  }

  if (exerciseOwnership.userId !== userId) {
    sendError(reply, 404, EXERCISE_NOT_FOUND_RESPONSE.code, EXERCISE_NOT_FOUND_RESPONSE.message);
    return false;
  }

  return true;
};

export const exerciseRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  const updateExerciseHandler = async (
    request: {
      body: unknown;
      params: { id: string };
      userId: string;
    },
    reply: FastifyReply,
  ) => {
    const parsedBody = updateExerciseInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid exercise payload');
    }

    if (parsedBody.data.relatedExerciseIds !== undefined) {
      const hasValidRelatedExerciseIds = await allRelatedExercisesOwned({
        userId: request.userId,
        exerciseIds: parsedBody.data.relatedExerciseIds,
      });
      if (!hasValidRelatedExerciseIds) {
        return sendError(
          reply,
          400,
          INVALID_RELATED_EXERCISES_RESPONSE.code,
          INVALID_RELATED_EXERCISES_RESPONSE.message,
        );
      }
    }

    const canMutate = await ensureOwnedMutableExercise({
      exerciseId: request.params.id,
      reply,
      userId: request.userId,
    });
    if (!canMutate) {
      return reply;
    }

    const exercise = await updateOwnedExercise({
      id: request.params.id,
      userId: request.userId,
      changes: parsedBody.data,
    });

    if (!exercise) {
      return sendError(
        reply,
        404,
        EXERCISE_NOT_FOUND_RESPONSE.code,
        EXERCISE_NOT_FOUND_RESPONSE.message,
      );
    }

    return reply.send({
      data: exercise,
    });
  };

  app.post('/', async (request, reply) => {
    if (isAgentRequest(request)) {
      const parsedBody = agentCreateExerciseInputSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid exercise payload');
      }

      const dedupCandidates = await findExerciseDedupCandidates({
        userId: request.userId,
        name: parsedBody.data.name,
      });
      if (dedupCandidates.length > 0 && !parsedBody.data.force) {
        return reply.send({
          data: {
            created: false,
            candidates: dedupCandidates,
          },
        });
      }

      const hasValidRelatedExerciseIds = await allRelatedExercisesOwned({
        userId: request.userId,
        exerciseIds: parsedBody.data.relatedExerciseIds,
      });
      if (!hasValidRelatedExerciseIds) {
        return sendError(
          reply,
          400,
          INVALID_RELATED_EXERCISES_RESPONSE.code,
          INVALID_RELATED_EXERCISES_RESPONSE.message,
        );
      }

      const exercise = await createExercise({
        id: randomUUID(),
        userId: request.userId,
        name: parsedBody.data.name,
        category: parsedBody.data.category ?? DEFAULT_CATEGORY,
        trackingType: DEFAULT_TRACKING_TYPE,
        muscleGroups: parsedBody.data.muscleGroups ?? [],
        equipment: parsedBody.data.equipment ?? '',
        tags: [],
        formCues: [],
        instructions: null,
        coachingNotes: parsedBody.data.coachingNotes ?? null,
        relatedExerciseIds: parsedBody.data.relatedExerciseIds,
      });

      return reply.code(201).send({
        data: {
          created: true,
          exercise: {
            id: exercise.id,
            name: exercise.name,
            category: exercise.category,
            trackingType: exercise.trackingType,
            muscleGroups: exercise.muscleGroups,
            equipment: exercise.equipment,
            instructions: exercise.instructions,
            coachingNotes: exercise.coachingNotes,
            relatedExerciseIds: exercise.relatedExerciseIds,
            tags: exercise.tags,
            formCues: exercise.formCues,
          },
        },
      });
    }

    const parsedBody = createExerciseInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid exercise payload');
    }

    const hasValidRelatedExerciseIds = await allRelatedExercisesOwned({
      userId: request.userId,
      exerciseIds: parsedBody.data.relatedExerciseIds,
    });
    if (!hasValidRelatedExerciseIds) {
      return sendError(
        reply,
        400,
        INVALID_RELATED_EXERCISES_RESPONSE.code,
        INVALID_RELATED_EXERCISES_RESPONSE.message,
      );
    }

    const exercise = await createExercise({
      id: randomUUID(),
      userId: request.userId,
      ...parsedBody.data,
    });

    return reply.code(201).send({
      data: exercise,
    });
  });

  app.get('/', async (request, reply) => {
    const parsedQuery = exerciseQueryParamsSchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid exercise query');
    }

    const result = await listExercises({
      userId: request.userId,
      ...parsedQuery.data,
    });

    reply.header('Cache-Control', 'private, no-cache');

    if (isAgentRequest(request)) {
      return reply.send({
        data: result.data.map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
          category: exercise.category,
          muscleGroups: exercise.muscleGroups,
          equipment: exercise.equipment,
        })),
      });
    }

    return reply.send(result);
  });

  app.get('/filters', async (request, reply) => {
    const filters = await listExerciseFilters(request.userId);

    reply.header('Cache-Control', 'private, no-cache');

    return reply.send({
      data: filters,
    });
  });

  app.get<{ Params: { id: string } }>('/:id/last-performance', async (request, reply) => {
    const parsedQuery = exerciseLastPerformanceQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid exercise history query');
    }

    const exercise = await findVisibleExerciseById({
      id: request.params.id,
      userId: request.userId,
    });
    if (!exercise) {
      return sendError(
        reply,
        404,
        EXERCISE_NOT_FOUND_RESPONSE.code,
        EXERCISE_NOT_FOUND_RESPONSE.message,
      );
    }

    if (parsedQuery.data.includeRelated) {
      const historyWithRelated = await findExerciseHistoryWithRelated({
        exerciseId: request.params.id,
        relatedExerciseIds: exercise.relatedExerciseIds,
        userId: request.userId,
      });

      return reply.send({
        data: historyWithRelated,
      });
    }

    const lastPerformance =
      (await findExerciseLastPerformance({
        exerciseId: request.params.id,
        userId: request.userId,
      })) ?? null;

    return reply.send({
      data: lastPerformance,
    });
  });

  app.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    return updateExerciseHandler(request, reply);
  });

  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    return updateExerciseHandler(request, reply);
  });

  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const canMutate = await ensureOwnedMutableExercise({
      exerciseId: request.params.id,
      reply,
      userId: request.userId,
    });
    if (!canMutate) {
      return reply;
    }

    const deleted = await deleteOwnedExercise(request.params.id, request.userId);
    if (!deleted) {
      return sendError(
        reply,
        404,
        EXERCISE_NOT_FOUND_RESPONSE.code,
        EXERCISE_NOT_FOUND_RESPONSE.message,
      );
    }

    return reply.send({
      data: {
        success: true,
      },
    });
  });
};
