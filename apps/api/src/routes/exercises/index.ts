import { randomUUID } from 'node:crypto';

import {
  agentExerciseDedupCandidateSchema,
  apiDataResponseSchema,
  apiPaginatedResponseSchema,
  createExerciseInputSchema,
  exerciseHistoryWithRelatedSchema,
  exerciseLastPerformanceQuerySchema,
  exerciseLastPerformancesSchema,
  exercisePerformanceHistoryQuerySchema,
  exercisePerformanceHistorySchema,
  exerciseQueryParamsSchema,
  exerciseSchema,
  updateExerciseInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { sendError } from '../../lib/reply.js';
import { agentEnrichmentOnSend } from '../../middleware/agent-enrichment.js';
import { isAgentRequest, requireAuth } from '../../middleware/auth.js';
import { agentRequestTransform } from '../../middleware/agent-transforms.js';
import {
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
  idParamsSchema,
  successFlagSchema,
} from '../../openapi.js';

import {
  allRelatedExercisesOwned,
  createExercise,
  deleteOwnedExercise,
  findExerciseDedupCandidates,
  findExerciseHistoryWithRelated,
  findExerciseLastPerformance,
  findExercisePerformanceHistory,
  findExerciseOwnership,
  findVisibleExerciseDetailsById,
  findVisibleExerciseById,
  isExerciseInUse,
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

const EXERCISE_IN_USE_RESPONSE = {
  code: 'EXERCISE_IN_USE',
  message:
    'This exercise is referenced by workout templates or sessions. Remove it from all templates first.',
} as const;

const isSqliteForeignKeyConstraintError = (error: unknown): error is { code: string } => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  return (error as { code?: unknown }).code === 'SQLITE_CONSTRAINT_FOREIGNKEY';
};

const exerciseCreateDedupResponseSchema = z.object({
  created: z.literal(false),
  candidates: z.array(agentExerciseDedupCandidateSchema).min(1),
});

const exerciseFiltersSchema = z.object({
  muscleGroups: z.array(z.string()),
  equipment: z.array(z.string()),
});

type UpdateExerciseRequest = {
  body: z.infer<typeof updateExerciseInputSchema>;
  params: z.infer<typeof idParamsSchema>;
  userId: string;
};

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

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  const updateExerciseHandler = async (request: UpdateExerciseRequest, reply: FastifyReply) => {
    if (request.body.relatedExerciseIds !== undefined) {
      const hasValidRelatedExerciseIds = await allRelatedExercisesOwned({
        userId: request.userId,
        exerciseIds: request.body.relatedExerciseIds,
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
      changes: request.body,
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

  typedApp.post(
    '/',
    {
      preHandler: agentRequestTransform,
      onSend: agentEnrichmentOnSend,
      schema: {
        body: createExerciseInputSchema,
        response: {
          200: apiDataResponseSchema(exerciseCreateDedupResponseSchema),
          201: apiDataResponseSchema(exerciseSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['exercises'],
        summary: 'Create an exercise',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      if (isAgentRequest(request)) {
        const dedupCandidates = await findExerciseDedupCandidates({
          userId: request.userId,
          name: request.body.name,
        });
        if (dedupCandidates.length > 0 && !request.body.force) {
          return reply.send({
            data: {
              created: false,
              candidates: dedupCandidates,
            },
          });
        }
      }

      const hasValidRelatedExerciseIds = await allRelatedExercisesOwned({
        userId: request.userId,
        exerciseIds: request.body.relatedExerciseIds,
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
        name: request.body.name,
        muscleGroups: request.body.muscleGroups,
        equipment: request.body.equipment,
        category: request.body.category,
        trackingType: request.body.trackingType,
        tags: request.body.tags,
        formCues: request.body.formCues,
        instructions: request.body.instructions,
        coachingNotes: request.body.coachingNotes,
        relatedExerciseIds: request.body.relatedExerciseIds,
      });

      return reply.code(201).send({
        data: exercise,
      });
    },
  );

  typedApp.get(
    '/',
    {
      schema: {
        querystring: exerciseQueryParamsSchema,
        response: {
          200: apiPaginatedResponseSchema(exerciseSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['exercises'],
        summary: 'List visible exercises',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const result = await listExercises({
        userId: request.userId,
        ...request.query,
      });

      reply.header('Cache-Control', 'private, no-cache');

      return reply.send(result);
    },
  );

  typedApp.get(
    '/filters',
    {
      schema: {
        response: {
          200: apiDataResponseSchema(exerciseFiltersSchema),
          401: apiErrorResponseSchema,
        },
        tags: ['exercises'],
        summary: 'List available exercise filters',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const filters = await listExerciseFilters(request.userId);

      reply.header('Cache-Control', 'private, no-cache');

      return reply.send({
        data: filters,
      });
    },
  );

  typedApp.get(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(exerciseSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['exercises'],
        summary: 'Get a visible exercise by id',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const exercise = await findVisibleExerciseDetailsById({
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

      return reply.send({
        data: exercise,
      });
    },
  );

  typedApp.get(
    '/:id/history',
    {
      schema: {
        params: idParamsSchema,
        querystring: exercisePerformanceHistoryQuerySchema,
        response: {
          200: apiDataResponseSchema(exercisePerformanceHistorySchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['exercises'],
        summary: 'Get recent completed session history for an exercise',
        security: authSecurity,
      },
    },
    async (request, reply) => {
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

      const history = await findExercisePerformanceHistory({
        exerciseId: request.params.id,
        userId: request.userId,
        limit: request.query.limit,
      });

      reply.header('Cache-Control', 'private, no-cache');

      return reply.send({
        data: history,
      });
    },
  );

  typedApp.get(
    '/:id/last-performance',
    {
      schema: {
        params: idParamsSchema,
        querystring: exerciseLastPerformanceQuerySchema,
        response: {
          200: apiDataResponseSchema(
            z.union([exerciseLastPerformancesSchema, exerciseHistoryWithRelatedSchema]),
          ),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['exercises'],
        summary: 'Get recent completed performances for an exercise',
        security: authSecurity,
      },
    },
    async (request, reply) => {
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

      if (request.query.includeRelated) {
        // `limit` applies only to the non-related array response shape.
        // The related-history branch always returns one latest entry per exercise.
        const historyWithRelated = await findExerciseHistoryWithRelated({
          exerciseId: request.params.id,
          relatedExerciseIds: exercise.relatedExerciseIds,
          userId: request.userId,
        });

        return reply.send({
          data: historyWithRelated,
        });
      }

      const lastPerformance = await findExerciseLastPerformance({
        exerciseId: request.params.id,
        limit: request.query.limit,
        userId: request.userId,
      });

      return reply.send({
        data: lastPerformance,
      });
    },
  );

  typedApp.put(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateExerciseInputSchema,
        response: {
          200: apiDataResponseSchema(exerciseSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['exercises'],
        summary: 'Replace an exercise',
        security: authSecurity,
      },
    },
    async (request, reply) => updateExerciseHandler(request, reply),
  );

  typedApp.patch(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateExerciseInputSchema,
        response: {
          200: apiDataResponseSchema(exerciseSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['exercises'],
        summary: 'Update an exercise',
        security: authSecurity,
      },
    },
    async (request, reply) => updateExerciseHandler(request, reply),
  );

  typedApp.delete(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(successFlagSchema),
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['exercises'],
        summary: 'Delete an exercise',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const canMutate = await ensureOwnedMutableExercise({
        exerciseId: request.params.id,
        reply,
        userId: request.userId,
      });
      if (!canMutate) {
        return reply;
      }

      const inUse = await isExerciseInUse(request.params.id);
      if (inUse) {
        return sendError(
          reply,
          409,
          EXERCISE_IN_USE_RESPONSE.code,
          EXERCISE_IN_USE_RESPONSE.message,
        );
      }

      let deleted: boolean;
      try {
        deleted = await deleteOwnedExercise(request.params.id, request.userId);
      } catch (error) {
        if (isSqliteForeignKeyConstraintError(error)) {
          return sendError(
            reply,
            409,
            EXERCISE_IN_USE_RESPONSE.code,
            EXERCISE_IN_USE_RESPONSE.message,
          );
        }

        throw error;
      }

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
    },
  );
};
