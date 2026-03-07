import { randomUUID } from 'node:crypto';

import {
  createExerciseInputSchema,
  exerciseQueryParamsSchema,
  updateExerciseInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';

import {
  createExercise,
  deleteOwnedExercise,
  findExerciseOwnership,
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

export const exerciseRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.post('/', async (request, reply) => {
    const parsedBody = createExerciseInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid exercise payload');
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

    return reply.send(result);
  });

  app.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsedBody = updateExerciseInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid exercise payload');
    }

    const exerciseOwnership = await findExerciseOwnership(request.params.id);
    if (!exerciseOwnership) {
      return sendError(
        reply,
        404,
        EXERCISE_NOT_FOUND_RESPONSE.code,
        EXERCISE_NOT_FOUND_RESPONSE.message,
      );
    }

    if (exerciseOwnership.userId === null) {
      return sendError(
        reply,
        403,
        GLOBAL_EXERCISE_READ_ONLY_RESPONSE.code,
        GLOBAL_EXERCISE_READ_ONLY_RESPONSE.message,
      );
    }

    if (exerciseOwnership.userId !== request.userId) {
      return sendError(
        reply,
        404,
        EXERCISE_NOT_FOUND_RESPONSE.code,
        EXERCISE_NOT_FOUND_RESPONSE.message,
      );
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
  });

  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const exerciseOwnership = await findExerciseOwnership(request.params.id);
    if (!exerciseOwnership) {
      return sendError(
        reply,
        404,
        EXERCISE_NOT_FOUND_RESPONSE.code,
        EXERCISE_NOT_FOUND_RESPONSE.message,
      );
    }

    if (exerciseOwnership.userId === null) {
      return sendError(
        reply,
        403,
        GLOBAL_EXERCISE_READ_ONLY_RESPONSE.code,
        GLOBAL_EXERCISE_READ_ONLY_RESPONSE.message,
      );
    }

    if (exerciseOwnership.userId !== request.userId) {
      return sendError(
        reply,
        404,
        EXERCISE_NOT_FOUND_RESPONSE.code,
        EXERCISE_NOT_FOUND_RESPONSE.message,
      );
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
