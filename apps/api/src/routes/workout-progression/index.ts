import {
  apiDataResponseSchema,
  applyWorkoutProgressionActionInputSchema,
  configureWorkoutProgressionInputSchema,
  previewWorkoutProgressionInputSchema,
  workoutMuscleAnalyticsQuerySchema,
  workoutMuscleAnalyticsSchema,
  workoutProgressionActionSchema,
  workoutProgressionConfigurationSchema,
  workoutProgressionPreviewResponseSchema,
  workoutProgressionRecommendationSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';

import { sendError } from '../../lib/reply.js';
import { buildDataResponse } from '../../middleware/agent-enrichment.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
  idParamsSchema,
} from '../../openapi.js';
import {
  getWorkoutMuscleAnalytics,
  WorkoutMuscleAnalyticsTimeZoneConflictError,
} from './muscle-store.js';
import {
  applyWorkoutProgressionAction,
  configureWorkoutProgression,
  getWorkoutProgressionRecommendation,
  previewWorkoutProgression,
  WorkoutProgressionAlreadyDecidedError,
  WorkoutProgressionIdempotencyConflictError,
  WorkoutProgressionInvalidEditError,
  WorkoutProgressionNotFoundError,
  WorkoutProgressionScheduleLockedError,
  WorkoutProgressionStaleError,
} from './store.js';

function actorFromRequest(request: FastifyRequest) {
  if (request.authType === 'agent-token') {
    return {
      id: request.agentTokenId ?? '',
      label: request.agentTokenName ?? 'Connected agent',
      type: 'agent_token' as const,
    };
  }
  return { id: request.userId, label: 'You', type: 'user' as const };
}

export const workoutProgressionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.put(
    '/scheduled-exercises/:id/configuration',
    {
      schema: {
        body: configureWorkoutProgressionInputSchema,
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(workoutProgressionConfigurationSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        security: authSecurity,
        summary: 'Configure explicit workout progression policy and context',
        tags: ['workout-progression'],
      },
    },
    async (request, reply) => {
      try {
        const configuration = await configureWorkoutProgression({
          actor: actorFromRequest(request),
          input: request.body,
          scheduledWorkoutExerciseId: request.params.id,
          userId: request.userId,
        });
        if (!configuration) {
          return sendError(
            reply,
            404,
            'SCHEDULED_WORKOUT_EXERCISE_NOT_FOUND',
            'Scheduled workout exercise not found',
          );
        }
        return reply.send(buildDataResponse(request, configuration));
      } catch (error) {
        if (error instanceof WorkoutProgressionStaleError) {
          return sendError(reply, 409, 'WORKOUT_PROGRESSION_STALE', error.message);
        }
        throw error;
      }
    },
  );

  typedApp.post(
    '/preview',
    {
      schema: {
        body: previewWorkoutProgressionInputSchema,
        response: {
          200: apiDataResponseSchema(workoutProgressionPreviewResponseSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        security: authSecurity,
        summary: 'Preview deterministic next-session workout progression',
        tags: ['workout-progression'],
      },
    },
    async (request, reply) => {
      const recommendations = await previewWorkoutProgression({
        scheduledWorkoutId: request.body.scheduledWorkoutId,
        userId: request.userId,
      });
      if (!recommendations) {
        return sendError(reply, 404, 'SCHEDULED_WORKOUT_NOT_FOUND', 'Scheduled workout not found');
      }
      return reply.send(buildDataResponse(request, { recommendations }));
    },
  );

  typedApp.get(
    '/recommendations/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(workoutProgressionRecommendationSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        security: authSecurity,
        summary: 'Get immutable workout progression evidence and current state',
        tags: ['workout-progression'],
      },
    },
    async (request, reply) => {
      const recommendation = await getWorkoutProgressionRecommendation(
        request.userId,
        request.params.id,
      );
      if (!recommendation) {
        return sendError(
          reply,
          404,
          'WORKOUT_PROGRESSION_NOT_FOUND',
          'Workout progression recommendation not found',
        );
      }
      return reply.send(buildDataResponse(request, recommendation));
    },
  );

  typedApp.post(
    '/recommendations/:id/actions',
    {
      schema: {
        params: idParamsSchema,
        body: applyWorkoutProgressionActionInputSchema,
        response: {
          200: apiDataResponseSchema(workoutProgressionActionSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        security: authSecurity,
        summary: 'Apply an explicit workout progression decision',
        tags: ['workout-progression'],
      },
    },
    async (request, reply) => {
      try {
        const action = await applyWorkoutProgressionAction({
          actor: actorFromRequest(request),
          input: request.body,
          recommendationId: request.params.id,
          userId: request.userId,
        });
        return reply.send(buildDataResponse(request, action));
      } catch (error) {
        if (error instanceof WorkoutProgressionNotFoundError) {
          return sendError(
            reply,
            404,
            'WORKOUT_PROGRESSION_NOT_FOUND',
            'Workout progression recommendation not found',
          );
        }
        if (error instanceof WorkoutProgressionInvalidEditError) {
          return sendError(reply, 400, 'INVALID_WORKOUT_PROGRESSION_EDIT', error.message);
        }
        if (error instanceof WorkoutProgressionStaleError) {
          return sendError(reply, 409, 'WORKOUT_PROGRESSION_STALE', error.message);
        }
        if (error instanceof WorkoutProgressionAlreadyDecidedError) {
          return sendError(reply, 409, 'WORKOUT_PROGRESSION_ALREADY_DECIDED', error.message);
        }
        if (error instanceof WorkoutProgressionIdempotencyConflictError) {
          return sendError(reply, 409, 'WORKOUT_PROGRESSION_IDEMPOTENCY_CONFLICT', error.message);
        }
        if (error instanceof WorkoutProgressionScheduleLockedError) {
          return sendError(reply, 409, 'WORKOUT_PROGRESSION_SCHEDULE_LOCKED', error.message);
        }
        throw error;
      }
    },
  );

  typedApp.get(
    '/muscles',
    {
      schema: {
        querystring: workoutMuscleAnalyticsQuerySchema,
        response: {
          200: apiDataResponseSchema(workoutMuscleAnalyticsSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        security: authSecurity,
        summary: 'Get versioned muscle training exposure analytics',
        tags: ['workout-progression'],
      },
    },
    async (request, reply) => {
      let analytics;
      try {
        analytics = await getWorkoutMuscleAnalytics(request.userId, request.query);
      } catch (error) {
        if (error instanceof WorkoutMuscleAnalyticsTimeZoneConflictError) {
          return sendError(reply, 400, 'TIME_ZONE_CONFLICT', error.message);
        }
        throw error;
      }
      return reply.send(buildDataResponse(request, analytics));
    },
  );
};
