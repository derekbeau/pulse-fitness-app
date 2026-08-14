import {
  AdaptiveTdeeConfigurationError,
  adaptiveAcceptInputSchema,
  adaptiveAcceptResultSchema,
  adaptiveCheckInDetailSchema,
  adaptiveCheckInQuerySchema,
  adaptiveCheckInSummarySchema,
  adaptiveCurrentGoalSchema,
  adaptiveGoalCompleteInputSchema,
  adaptiveGoalDetailSchema,
  adaptiveGoalEditInputSchema,
  adaptiveGoalHistorySummarySchema,
  adaptiveGoalLifecycleInputSchema,
  adaptiveGoalQuerySchema,
  adaptiveGoalSchema,
  adaptiveGoalStartInputSchema,
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

import { AdaptiveGoalNotFoundError, getAdaptiveGoal, listAdaptiveGoals } from './goal-store.js';

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
  AdaptiveGoalCompletionError,
  AdaptiveGoalRevisionConflictError,
  AdaptiveGoalTypeConflictError,
  AdaptivePendingCheckInExistsError,
  AdaptiveProgramInvalidError,
  AdaptiveProgramNotFoundError,
  AdaptiveSameDateTargetExistsError,
  cancelAdaptiveGoal,
  completeAdaptiveGoal,
  declineAdaptiveNutritionCheckIn,
  editAdaptiveGoal,
  getAdaptiveNutritionCheckIn,
  getAdaptiveNutritionState,
  getCurrentAdaptiveGoalWithProgress,
  listAdaptiveNutritionCheckIns,
  previewAdaptiveNutritionCheckIn,
  putAdaptiveNutritionProgram,
  startAdaptiveGoal,
} from './store.js';

const conflictResponseSchema = apiErrorResponseSchema;

const sendAdaptiveError = (reply: FastifyReply, error: unknown) => {
  if (error instanceof AdaptiveGoalNotFoundError) {
    return sendError(reply, 404, 'ADAPTIVE_GOAL_NOT_FOUND', error.message);
  }
  if (error instanceof AdaptiveActiveGoalRequiredError) {
    return sendError(reply, 409, 'ACTIVE_GOAL_REQUIRED', error.message);
  }
  if (error instanceof AdaptiveGoalRevisionConflictError) {
    return sendError(reply, 409, 'GOAL_REVISION_CONFLICT', error.message);
  }
  if (error instanceof AdaptiveGoalTypeConflictError) {
    return sendError(reply, 409, 'GOAL_TYPE_CONFLICT', error.message);
  }
  if (error instanceof AdaptiveGoalCompletionError) {
    return sendError(reply, 409, 'GOAL_COMPLETION_NOT_READY', error.message);
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
        description:
          'Returns the active first-class goal, latest immutable revision, and server-owned trend-weight progress. AgentToken callers are read-only.',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({ data: await getCurrentAdaptiveGoalWithProgress(request.userId) });
      } catch (error) {
        return sendAdaptiveError(reply, error);
      }
    },
  );

  typedApp.patch(
    '/goals/:id',
    {
      onRequest: requireJwtOnly,
      schema: {
        params: idParamsSchema,
        body: adaptiveGoalEditInputSchema,
        response: {
          200: apiDataResponseSchema(adaptiveCurrentGoalSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: conflictResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Edit the active adaptive goal without applying nutrition targets',
        description:
          'Preserves the progress origin, appends an immutable revision, and creates a reviewable goal-change recommendation. Current nutrition targets remain unchanged until explicit acceptance.',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({
          data: await editAdaptiveGoal(request.userId, request.params.id, request.body),
        });
      } catch (error) {
        return sendAdaptiveError(reply, error);
      }
    },
  );

  typedApp.post(
    '/goals',
    {
      onRequest: requireJwtOnly,
      schema: {
        body: adaptiveGoalStartInputSchema,
        response: {
          200: apiDataResponseSchema(adaptiveCurrentGoalSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: conflictResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Start a new adaptive goal and preserve expenditure history',
        description:
          'Ends the prior direction, starts a new progress period, and creates a reviewable goal-change recommendation without resetting Adaptive TDEE or applying nutrition targets.',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({ data: await startAdaptiveGoal(request.userId, request.body) });
      } catch (error) {
        return sendAdaptiveError(reply, error);
      }
    },
  );

  typedApp.post(
    '/goals/:id/cancel',
    {
      onRequest: requireJwtOnly,
      schema: {
        params: idParamsSchema,
        body: adaptiveGoalLifecycleInputSchema,
        response: {
          200: apiDataResponseSchema(adaptiveGoalSchema),
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: conflictResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Cancel the active adaptive goal without changing nutrition targets',
        description:
          'Closes the active goal with optimistic revision checks and preserves weight, nutrition, expenditure, target, and check-in history.',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({
          data: await cancelAdaptiveGoal(request.userId, request.params.id, request.body),
        });
      } catch (error) {
        return sendAdaptiveError(reply, error);
      }
    },
  );

  typedApp.post(
    '/goals/:id/complete',
    {
      onRequest: requireJwtOnly,
      schema: {
        params: idParamsSchema,
        body: adaptiveGoalCompleteInputSchema,
        response: {
          200: apiDataResponseSchema(adaptiveCurrentGoalSchema),
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: conflictResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Complete a reached goal and begin explicit maintenance',
        description:
          'Rechecks the accepted reached-goal fingerprint, completes the goal, and creates maintenance exactly once. This separate reviewed transition does not create or replace a nutrition target.',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({
          data: await completeAdaptiveGoal(request.userId, request.params.id, request.body),
        });
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
        description:
          'Returns paginated active and historical goal summaries with lifecycle status, final canonical trend weight, net trend change, and duration.',
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
        description:
          'Returns one owned goal with immutable revisions, linked accepted check-ins, and canonical weekly trend points. Nullable scale weights are separately identified from authoritative trend weights.',
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
