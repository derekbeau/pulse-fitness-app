import {
  AdaptiveTdeeConfigurationError,
  adaptiveAcceptInputSchema,
  adaptiveAcceptResultSchema,
  adaptiveCheckInDetailSchema,
  adaptiveCheckInQuerySchema,
  adaptiveCheckInSummarySchema,
  adaptiveCurrentGoalSchema,
  adaptiveGoalDetailSchema,
  adaptiveGoalHistorySummarySchema,
  adaptiveGoalQuerySchema,
  adaptiveNutritionStateSchema,
  adaptivePreviewInputSchema,
  adaptiveProgramMutationSchema,
  adaptiveProgramSchema,
  apiDataResponseSchema,
  apiPaginatedResponseSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';

import { sendError } from '../../lib/reply.js';
import { requireAuth, requireJwtOnly } from '../../middleware/auth.js';
import {
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
  idParamsSchema,
  jwtSecurity,
} from '../../openapi.js';

import {
  AdaptiveGoalNotFoundError,
  getAdaptiveGoal,
  getCurrentAdaptiveGoal,
  listAdaptiveGoals,
} from './goal-store.js';

import {
  acceptAdaptiveNutritionCheckIn,
  AdaptiveActiveGoalRequiredError,
  AdaptiveAlgorithmVersionMismatchError,
  AdaptiveCalorieFloorError,
  AdaptiveCheckInNotAcceptableError,
  AdaptiveCheckInNotDeclinableError,
  AdaptiveCheckInNotFoundError,
  AdaptiveCheckInStaleError,
  AdaptiveCurrentWeightRequiredError,
  AdaptiveGoalDirectionError,
  AdaptivePendingCheckInExistsError,
  AdaptiveProgramInvalidError,
  AdaptiveProgramNotFoundError,
  AdaptiveSameDateTargetExistsError,
  declineAdaptiveNutritionCheckIn,
  getAdaptiveNutritionCheckIn,
  getAdaptiveNutritionState,
  listAdaptiveNutritionCheckIns,
  previewAdaptiveNutritionCheckIn,
  putAdaptiveNutritionProgram,
} from './store.js';

const conflictResponseSchema = apiErrorResponseSchema;

const sendAdaptiveError = (reply: FastifyReply, error: unknown) => {
  if (error instanceof AdaptiveGoalNotFoundError) {
    return sendError(reply, 404, 'ADAPTIVE_GOAL_NOT_FOUND', error.message);
  }
  if (error instanceof AdaptiveActiveGoalRequiredError) {
    return sendError(reply, 409, 'ACTIVE_GOAL_REQUIRED', error.message);
  }
  if (error instanceof AdaptiveProgramNotFoundError) {
    return sendError(reply, 404, 'ADAPTIVE_PROGRAM_NOT_FOUND', error.message);
  }
  if (error instanceof AdaptiveCheckInNotFoundError) {
    return sendError(reply, 404, 'ADAPTIVE_CHECK_IN_NOT_FOUND', error.message);
  }
  if (error instanceof AdaptiveCurrentWeightRequiredError) {
    return sendError(reply, 400, 'NO_CURRENT_WEIGHT', error.message);
  }
  if (error instanceof AdaptiveGoalDirectionError) {
    return sendError(reply, 400, 'GOAL_TARGET_DIRECTION_INVALID', error.message);
  }
  if (error instanceof AdaptiveCalorieFloorError) {
    return sendError(reply, 400, 'CALORIE_FLOOR_TOO_LOW', error.message);
  }
  if (error instanceof AdaptiveProgramInvalidError) {
    return sendError(reply, 400, 'ADAPTIVE_PROGRAM_INVALID', error.message);
  }
  if (error instanceof AdaptiveTdeeConfigurationError) {
    return sendError(reply, 400, error.code, error.message);
  }
  if (error instanceof AdaptivePendingCheckInExistsError) {
    return sendError(reply, 409, 'PENDING_CHECKIN_EXISTS', error.message);
  }
  if (error instanceof AdaptiveAlgorithmVersionMismatchError) {
    return sendError(reply, 409, 'ALGORITHM_VERSION_MISMATCH', error.message);
  }
  if (error instanceof AdaptiveCheckInStaleError) {
    return sendError(reply, 409, 'CHECKIN_STALE', error.message);
  }
  if (error instanceof AdaptiveSameDateTargetExistsError) {
    return sendError(reply, 409, 'SAME_DATE_TARGET_EXISTS', error.message);
  }
  if (error instanceof AdaptiveCheckInNotAcceptableError) {
    return sendError(reply, 409, 'CHECKIN_NOT_ACCEPTABLE', error.message);
  }
  if (error instanceof AdaptiveCheckInNotDeclinableError) {
    return sendError(reply, 409, 'CHECKIN_NOT_DECLINABLE', error.message);
  }
  throw error;
};

export const adaptiveNutritionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/goals/current',
    {
      schema: {
        response: {
          200: apiDataResponseSchema(adaptiveCurrentGoalSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Get the current adaptive nutrition goal',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({ data: await getCurrentAdaptiveGoal(request.userId) });
      } catch (error) {
        return sendAdaptiveError(reply, error);
      }
    },
  );

  typedApp.get(
    '/goals',
    {
      schema: {
        querystring: adaptiveGoalQuerySchema,
        response: {
          200: apiPaginatedResponseSchema(adaptiveGoalHistorySummarySchema),
          401: apiErrorResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'List adaptive nutrition goal history',
        security: authSecurity,
      },
    },
    async (request, reply) => reply.send(await listAdaptiveGoals(request.userId, request.query)),
  );

  typedApp.get(
    '/goals/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(adaptiveGoalDetailSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Get adaptive nutrition goal details',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({ data: await getAdaptiveGoal(request.userId, request.params.id) });
      } catch (error) {
        return sendAdaptiveError(reply, error);
      }
    },
  );

  typedApp.get(
    '/',
    {
      schema: {
        response: {
          200: apiDataResponseSchema(adaptiveNutritionStateSchema),
          401: apiErrorResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Get the adaptive nutrition program state',
        security: authSecurity,
      },
    },
    async (request, reply) => reply.send({ data: await getAdaptiveNutritionState(request.userId) }),
  );

  typedApp.put(
    '/program',
    {
      onRequest: requireJwtOnly,
      schema: {
        body: adaptiveProgramMutationSchema,
        response: {
          200: apiDataResponseSchema(adaptiveProgramSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: conflictResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Create, update, or explicitly rebaseline an adaptive nutrition program',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({
          data: await putAdaptiveNutritionProgram(request.userId, request.body),
        });
      } catch (error) {
        return sendAdaptiveError(reply, error);
      }
    },
  );

  typedApp.post(
    '/check-ins/preview',
    {
      schema: {
        body: adaptivePreviewInputSchema,
        response: {
          200: apiDataResponseSchema(adaptiveCheckInDetailSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: conflictResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Preview and persist an adaptive nutrition check-in',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({
          data: await previewAdaptiveNutritionCheckIn(request.userId, request.body),
        });
      } catch (error) {
        return sendAdaptiveError(reply, error);
      }
    },
  );

  typedApp.post(
    '/check-ins/:id/accept',
    {
      onRequest: requireJwtOnly,
      schema: {
        params: idParamsSchema,
        body: adaptiveAcceptInputSchema,
        response: {
          200: apiDataResponseSchema(adaptiveAcceptResultSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: conflictResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Accept an adaptive recommendation and write its nutrition target',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({
          data: await acceptAdaptiveNutritionCheckIn(
            request.userId,
            request.params.id,
            request.body,
          ),
        });
      } catch (error) {
        return sendAdaptiveError(reply, error);
      }
    },
  );

  typedApp.post(
    '/check-ins/:id/decline',
    {
      onRequest: requireJwtOnly,
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(adaptiveCheckInDetailSchema),
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: conflictResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Decline a pending adaptive recommendation',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({
          data: await declineAdaptiveNutritionCheckIn(request.userId, request.params.id),
        });
      } catch (error) {
        return sendAdaptiveError(reply, error);
      }
    },
  );

  typedApp.get(
    '/check-ins',
    {
      schema: {
        querystring: adaptiveCheckInQuerySchema,
        response: {
          200: apiPaginatedResponseSchema(adaptiveCheckInSummarySchema),
          401: apiErrorResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'List adaptive nutrition check-in history',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const result = await listAdaptiveNutritionCheckIns(request.userId, request.query);
      return reply.send(result);
    },
  );

  typedApp.get(
    '/check-ins/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(adaptiveCheckInDetailSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Get one adaptive nutrition check-in snapshot',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({
          data: await getAdaptiveNutritionCheckIn(request.userId, request.params.id),
        });
      } catch (error) {
        return sendAdaptiveError(reply, error);
      }
    },
  );
};
