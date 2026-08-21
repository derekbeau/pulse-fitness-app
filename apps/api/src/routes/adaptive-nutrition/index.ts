import {
  AdaptiveTdeeConfigurationError,
  adaptiveAcceptInputSchema,
  adaptiveReviewActionInputSchema,
  adaptiveReviewContextCreateInputSchema,
  adaptiveReviewContextDeleteQuerySchema,
  adaptiveReviewContextSchema,
  adaptiveReviewContextUpdateInputSchema,
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
  adaptiveGoalTrajectoryQuerySchema,
  adaptiveGoalTrajectorySchema,
  adaptiveNutritionStateSchema,
  energyBalanceAnalyticsQuerySchema,
  energyBalanceAnalyticsSchema,
  adaptivePreviewInputSchema,
  adaptiveProgramMutationSchema,
  adaptiveProgramSchema,
  adaptiveWeeklyReviewListQuerySchema,
  adaptiveWeeklyReviewPendingSchema,
  adaptiveWeeklyReviewPreviewInputSchema,
  adaptiveWeeklyReviewSchema,
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
  AdaptiveGoalTrajectoryFutureEndError,
  AdaptiveGoalTrajectoryPreGoalEndError,
  getAdaptiveGoalTrajectory,
} from './goal-trajectory-store.js';
import {
  AdaptiveAnalyticsFutureEndError,
  AdaptiveAnalyticsPreProgramEndError,
  getAdaptiveEnergyBalanceAnalytics,
} from './analytics-store.js';

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
import {
  actOnAdaptiveWeeklyReview,
  AdaptiveReviewActionConflictError,
  AdaptiveReviewActionNotAllowedError,
  AdaptiveReviewContextConflictError,
  AdaptiveReviewContextNotFoundError,
  AdaptiveReviewNotFoundError,
  AdaptiveReviewProposalInvalidError,
  AdaptiveReviewRefreshNotAllowedError,
  AdaptiveReviewStaleError,
  createAdaptiveReviewContext,
  deleteAdaptiveReviewContext,
  getAdaptiveWeeklyReview,
  getPendingAdaptiveWeeklyReview,
  listAdaptiveWeeklyReviews,
  previewAdaptiveWeeklyReview,
  refreshAdaptiveWeeklyReview,
  updateAdaptiveReviewContext,
  type AdaptiveReviewActor,
} from './review-store.js';

const conflictResponseSchema = apiErrorResponseSchema;

const sendAdaptiveError = (reply: FastifyReply, error: unknown) => {
  if (error instanceof AdaptiveGoalTrajectoryFutureEndError) {
    return sendError(reply, 400, 'ADAPTIVE_GOAL_TRAJECTORY_FUTURE_END', error.message);
  }
  if (error instanceof AdaptiveGoalTrajectoryPreGoalEndError) {
    return sendError(reply, 400, 'ADAPTIVE_GOAL_TRAJECTORY_PRE_GOAL_END', error.message);
  }
  if (error instanceof AdaptiveAnalyticsFutureEndError) {
    return sendError(reply, 400, 'ADAPTIVE_ANALYTICS_FUTURE_END', error.message);
  }
  if (error instanceof AdaptiveAnalyticsPreProgramEndError) {
    return sendError(reply, 400, 'ADAPTIVE_ANALYTICS_PRE_PROGRAM_END', error.message);
  }
  if (error instanceof AdaptiveReviewNotFoundError) {
    return sendError(reply, 404, 'ADAPTIVE_REVIEW_NOT_FOUND', error.message);
  }
  if (error instanceof AdaptiveReviewContextNotFoundError) {
    return sendError(reply, 404, 'ADAPTIVE_REVIEW_CONTEXT_NOT_FOUND', error.message);
  }
  if (error instanceof AdaptiveReviewContextConflictError) {
    return sendError(reply, 409, 'ADAPTIVE_REVIEW_CONTEXT_CONFLICT', error.message);
  }
  if (error instanceof AdaptiveReviewStaleError) {
    return sendError(reply, 409, 'ADAPTIVE_REVIEW_STALE', error.message);
  }
  if (error instanceof AdaptiveReviewRefreshNotAllowedError) {
    return sendError(reply, 409, 'ADAPTIVE_REVIEW_REFRESH_NOT_ALLOWED', error.message);
  }
  if (error instanceof AdaptiveReviewActionConflictError) {
    return sendError(reply, 409, 'ADAPTIVE_REVIEW_ACTION_CONFLICT', error.message);
  }
  if (error instanceof AdaptiveReviewActionNotAllowedError) {
    return sendError(reply, 409, 'ADAPTIVE_REVIEW_ACTION_NOT_ALLOWED', error.message);
  }
  if (error instanceof AdaptiveReviewProposalInvalidError) {
    return sendError(reply, 400, 'ADAPTIVE_REVIEW_PROPOSAL_INVALID', error.message);
  }
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

  const reviewActor = (request: {
    authType?: string;
    agentTokenId?: string;
    agentTokenName?: string;
  }): AdaptiveReviewActor =>
    request.authType === 'agent-token' && request.agentTokenId
      ? {
          type: 'agent_token',
          agentTokenId: request.agentTokenId,
          label: request.agentTokenName ?? request.agentTokenId,
        }
      : { type: 'user', label: 'You' };

  typedApp.get(
    '/reviews/pending',
    {
      schema: {
        response: {
          200: apiDataResponseSchema(adaptiveWeeklyReviewPendingSchema),
          401: apiErrorResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Get the surfaced weekly decision review without creating one',
        description:
          'Returns the same immutable, server-authored review facts to JWT and AgentToken callers. Reads never generate, wake, or mutate a review.',
        security: authSecurity,
      },
    },
    async (request, reply) =>
      reply.send({ data: { review: await getPendingAdaptiveWeeklyReview(request.userId) } }),
  );

  typedApp.post(
    '/reviews/preview',
    {
      schema: {
        body: adaptiveWeeklyReviewPreviewInputSchema,
        response: {
          200: apiDataResponseSchema(adaptiveWeeklyReviewSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: conflictResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Prepare a deterministic weekly decision review',
        description:
          'Persists one immutable, idempotent module snapshot over bounded Pulse records. No model call or plan change occurs.',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({
          data: await previewAdaptiveWeeklyReview(request.userId, request.body),
        });
      } catch (error) {
        return sendAdaptiveError(reply, error);
      }
    },
  );

  typedApp.get(
    '/reviews',
    {
      schema: {
        querystring: adaptiveWeeklyReviewListQuerySchema,
        response: {
          200: apiPaginatedResponseSchema(adaptiveWeeklyReviewSchema),
          401: apiErrorResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'List immutable weekly review history',
        security: authSecurity,
      },
    },
    async (request, reply) =>
      reply.send(await listAdaptiveWeeklyReviews(request.userId, request.query)),
  );

  typedApp.get(
    '/reviews/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(adaptiveWeeklyReviewSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Get an immutable weekly review and its action history',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({
          data: await getAdaptiveWeeklyReview(request.userId, request.params.id),
        });
      } catch (error) {
        return sendAdaptiveError(reply, error);
      }
    },
  );

  typedApp.post(
    '/reviews/:id/refresh',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(adaptiveWeeklyReviewSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: conflictResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Refresh a stale weekly review from current source records',
        description:
          'Creates a new immutable review and supersedes the old snapshot only when source evidence changed. It does not apply a plan change.',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({
          data: await refreshAdaptiveWeeklyReview(request.userId, request.params.id),
        });
      } catch (error) {
        return sendAdaptiveError(reply, error);
      }
    },
  );

  typedApp.post(
    '/reviews/:id/actions',
    {
      schema: {
        params: idParamsSchema,
        body: adaptiveReviewActionInputSchema,
        response: {
          200: apiDataResponseSchema(adaptiveWeeklyReviewSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: conflictResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Record an explicit weekly review action',
        description:
          'Accept, edit, defer, and decline are JWT-only material decisions. AgentToken callers may ask or answer bounded review questions but cannot change the plan.',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      if (
        request.authType === 'agent-token' &&
        ['accept', 'edit', 'defer', 'decline'].includes(request.body.type)
      ) {
        return sendError(reply, 403, 'FORBIDDEN', 'JWT authentication required for plan decisions');
      }
      try {
        return reply.send({
          data: await actOnAdaptiveWeeklyReview(
            request.userId,
            request.params.id,
            request.body,
            reviewActor(request),
          ),
        });
      } catch (error) {
        return sendAdaptiveError(reply, error);
      }
    },
  );

  typedApp.post(
    '/review-context',
    {
      schema: {
        body: adaptiveReviewContextCreateInputSchema,
        response: {
          201: apiDataResponseSchema(adaptiveReviewContextSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Create bounded weekly-review context',
        description:
          'Context can explain evidence or suppress a redundant question. It never changes quantitative eligibility or calculations.',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.code(201).send({
          data: await createAdaptiveReviewContext(
            request.userId,
            request.body,
            reviewActor(request) as Exclude<AdaptiveReviewActor, { type: 'system' }>,
          ),
        });
      } catch (error) {
        return sendAdaptiveError(reply, error);
      }
    },
  );

  typedApp.patch(
    '/review-context/:id',
    {
      schema: {
        params: idParamsSchema,
        body: adaptiveReviewContextUpdateInputSchema,
        response: {
          200: apiDataResponseSchema(adaptiveReviewContextSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: conflictResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Edit bounded weekly-review context with revision protection',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({
          data: await updateAdaptiveReviewContext(
            request.userId,
            request.params.id,
            request.body,
            reviewActor(request) as Exclude<AdaptiveReviewActor, { type: 'system' }>,
          ),
        });
      } catch (error) {
        return sendAdaptiveError(reply, error);
      }
    },
  );

  typedApp.delete(
    '/review-context/:id',
    {
      schema: {
        params: idParamsSchema,
        querystring: adaptiveReviewContextDeleteQuerySchema,
        response: {
          200: apiDataResponseSchema(adaptiveReviewContextSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: conflictResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Soft-delete bounded weekly-review context',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({
          data: await deleteAdaptiveReviewContext(
            request.userId,
            request.params.id,
            request.query.expectedRevision,
            reviewActor(request) as Exclude<AdaptiveReviewActor, { type: 'system' }>,
          ),
        });
      } catch (error) {
        return sendAdaptiveError(reply, error);
      }
    },
  );

  typedApp.get(
    '/analytics',
    {
      schema: {
        querystring: energyBalanceAnalyticsQuerySchema,
        response: {
          200: apiDataResponseSchema(energyBalanceAnalyticsSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Explain energy balance and adaptive expenditure history',
        description:
          'Returns a read-only, program-time-zone projection over immutable check-ins and effective-dated nutrition evidence. Partial, unknown, missing, and current incomplete-day data are visible but never modeled as zero.',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({
          data: await getAdaptiveEnergyBalanceAnalytics(request.userId, request.query),
        });
      } catch (error) {
        return sendAdaptiveError(reply, error);
      }
    },
  );

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
          'Atomically appends the one required immutable next revision, preserves the progress origin, and creates a reviewable goal-change recommendation. Current nutrition targets remain unchanged until explicit acceptance.',
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
          'Persists the prior goal’s actual final canonical trend, starts a new progress period from that same trend, and creates a reviewable goal-change recommendation without resetting Adaptive TDEE or applying nutrition targets.',
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
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: conflictResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Cancel the active adaptive goal without changing nutrition targets',
        description:
          'Closes the active goal with optimistic revision checks, persists its actual final canonical trend, and preserves weight, nutrition, expenditure, target, and check-in history.',
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
          'Rechecks the accepted reached-goal fingerprint, persists the final canonical trend, and creates maintenance exactly once with an immutable relation linking the accepted check-in and both goals. This separate reviewed transition does not create or replace a nutrition target.',
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
          'Returns paginated active and historical goal summaries. Closed-goal history and net change use the final canonical trend persisted when the goal ended.',
        security: authSecurity,
      },
    },
    async (request, reply) => reply.send(await listAdaptiveGoals(request.userId, request.query)),
  );

  typedApp.get(
    '/goals/:id/trajectory',
    {
      schema: {
        params: idParamsSchema,
        querystring: adaptiveGoalTrajectoryQuerySchema,
        response: {
          200: apiDataResponseSchema(adaptiveGoalTrajectorySchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['adaptive-nutrition'],
        summary: 'Get one goal’s longitudinal trajectory and forecast',
        description:
          'Returns a read-only, program-time-zone trajectory over the canonical Adaptive model trend. Historical revisions, weekly evidence gaps, maintenance range facts, completion review semantics, calorie targets, and expenditure provenance are server owned. AgentToken callers receive the same facts and no decision capability.',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({
          data: await getAdaptiveGoalTrajectory(request.userId, request.params.id, request.query),
        });
      } catch (error) {
        return sendAdaptiveError(reply, error);
      }
    },
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
          'Returns one owned goal with immutable revisions, linked accepted check-ins, any immutable completion relation, and server-authoritative weekly progress resolved against the revision effective on each date. Nullable scale weights are separately identified from authoritative trend weights; maintenance points use max(0.68 kg, center × 1%) on each side.',
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
