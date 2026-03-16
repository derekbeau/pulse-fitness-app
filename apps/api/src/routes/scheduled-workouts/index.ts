import { randomUUID } from 'node:crypto';

import {
  apiDataResponseSchema,
  createScheduledWorkoutInputSchema,
  scheduledWorkoutListItemSchema,
  scheduledWorkoutQueryParamsSchema,
  scheduledWorkoutSchema,
  updateScheduledWorkoutInputSchema,
  workoutTemplateSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

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
  app.addHook('onRequest', requireAuth);

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/',
    {
      schema: {
        body: createScheduledWorkoutInputSchema,
        response: {
          201: apiDataResponseSchema(scheduledWorkoutSchema),
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

      return reply.code(201).send({
        data: scheduledWorkout,
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

  const scheduledWorkoutDetailSchema = scheduledWorkoutSchema.extend({
    template: workoutTemplateSchema.nullable(),
  });

  typedApp.get(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(scheduledWorkoutDetailSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['scheduled-workouts'],
        summary: 'Get a scheduled workout with template details',
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

      const template = scheduledWorkout.templateId
        ? ((await findWorkoutTemplateById(scheduledWorkout.templateId, request.userId)) ?? null)
        : null;

      return reply.send({
        data: {
          ...scheduledWorkout,
          template,
        },
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
