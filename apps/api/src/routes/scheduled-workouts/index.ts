import { randomUUID } from 'node:crypto';

import {
  createScheduledWorkoutInputSchema,
  scheduledWorkoutQueryParamsSchema,
  updateScheduledWorkoutInputSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';
import { requireUserAuth } from '../../middleware/auth.js';
import { templateBelongsToUser } from '../workout-templates/template-access.js';

import {
  createScheduledWorkout,
  deleteScheduledWorkout,
  findScheduledWorkoutById,
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

export const scheduledWorkoutRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireUserAuth);

  app.post('/', async (request, reply) => {
    const parsedBody = createScheduledWorkoutInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid scheduled workout payload');
    }

    const templateAccessible = await templateBelongsToUser(
      parsedBody.data.templateId,
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
      input: parsedBody.data,
    });

    return reply.code(201).send({
      data: scheduledWorkout,
    });
  });

  app.get('/', async (request, reply) => {
    const parsedQuery = scheduledWorkoutQueryParamsSchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid scheduled workout query');
    }

    const scheduledWorkoutItems = await listScheduledWorkouts({
      userId: request.userId,
      ...parsedQuery.data,
    });

    return reply.send({
      data: scheduledWorkoutItems,
    });
  });

  app.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsedBody = updateScheduledWorkoutInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid scheduled workout payload');
    }

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

    if (parsedBody.data.templateId !== undefined) {
      const templateAccessible = await templateBelongsToUser(
        parsedBody.data.templateId,
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
    }

    const scheduledWorkout = await updateScheduledWorkout({
      id: request.params.id,
      userId: request.userId,
      changes: parsedBody.data,
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
  });

  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
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
  });
};
