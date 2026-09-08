import {
  agentContextResponseSchema,
  apiDataResponseSchema,
  applyFeedbackPrecautionDecisionInputSchema,
  feedbackPlanningContextQuerySchema,
  feedbackPlanningContextResponseSchema,
  feedbackPrecautionDecisionSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';

import { addUtcDays } from '../../lib/date.js';
import { getApplicationNow } from '../../lib/clock.js';
import { requireAgentOnly, requireAuth } from '../../middleware/auth.js';
import {
  agentTokenSecurity,
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
} from '../../openapi.js';
import {
  findAgentContextUser,
  getAgentContextTodayNutrition,
  getAgentContextWeight,
  listAgentContextHabits,
  listAgentContextRecentWorkouts,
  listAgentContextScheduledWorkouts,
} from '../agent/context-store.js';
import { getNutritionLocalDateForUser } from '../nutrition/status-store.js';
import {
  applyFeedbackPrecautionDecision,
  FeedbackPlanningConflictError,
  FeedbackPlanningIdempotencyConflictError,
  FeedbackPlanningInvalidDecisionError,
  FeedbackPlanningNotFoundError,
  readFeedbackPlanningContext,
} from '../feedback-planning/store.js';

export const contextRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/feedback',
    {
      schema: {
        querystring: feedbackPlanningContextQuerySchema,
        response: {
          200: apiDataResponseSchema(feedbackPlanningContextResponseSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['context'],
        summary: 'Get bounded source-linked workout feedback planning context',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const today = await getNutritionLocalDateForUser(request.userId, getApplicationNow());
      const context = await readFeedbackPlanningContext(request.userId, request.query, today);
      reply.header('Cache-Control', 'private, no-cache');
      return reply.send({ data: context });
    },
  );

  typedApp.post(
    '/feedback/precaution-decisions',
    {
      preHandler: requireAgentOnly,
      schema: {
        body: applyFeedbackPrecautionDecisionInputSchema,
        response: {
          200: apiDataResponseSchema(feedbackPrecautionDecisionSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
        },
        tags: ['context'],
        summary: 'Apply an explicit source-linked future precaution-note decision',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) => {
      const agentTokenId = request.agentTokenId;
      if (!agentTokenId) throw new Error('Agent token identity missing after authentication.');
      const today = await getNutritionLocalDateForUser(request.userId, getApplicationNow());
      try {
        const decision = await applyFeedbackPrecautionDecision({
          actor: {
            kind: 'agent_token',
            id: agentTokenId,
            label: request.agentTokenName ?? 'Connected agent',
          },
          input: request.body,
          today,
          userId: request.userId,
        });
        reply.header('Cache-Control', 'private, no-cache');
        return reply.send({ data: decision });
      } catch (error) {
        if (error instanceof FeedbackPlanningNotFoundError) {
          return reply.code(404).send({
            error: { code: 'FEEDBACK_PLANNING_SOURCE_NOT_FOUND', message: error.message },
          });
        }
        if (error instanceof FeedbackPlanningInvalidDecisionError) {
          return reply.code(400).send({
            error: { code: 'INVALID_FEEDBACK_PRECAUTION_DECISION', message: error.message },
          });
        }
        if (error instanceof FeedbackPlanningConflictError) {
          return reply.code(409).send({
            error: { code: 'FEEDBACK_PLANNING_STALE', message: error.message },
          });
        }
        if (error instanceof FeedbackPlanningIdempotencyConflictError) {
          return reply.code(409).send({
            error: { code: 'FEEDBACK_PLANNING_IDEMPOTENCY_CONFLICT', message: error.message },
          });
        }
        throw error;
      }
    },
  );

  typedApp.get(
    '/',
    {
      preHandler: requireAgentOnly,
      schema: {
        response: {
          200: apiDataResponseSchema(agentContextResponseSchema),
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
        },
        tags: ['context'],
        summary: 'Get the agent context payload',
        security: agentTokenSecurity,
      },
    },
    async (request, reply) => {
      const today = await getNutritionLocalDateForUser(request.userId, getApplicationNow());
      const scheduleEnd = addUtcDays(today, 6);

      const [user, recentWorkouts, todayNutrition, weight, habits, scheduledWorkouts] =
        await Promise.all([
          findAgentContextUser(request.userId),
          listAgentContextRecentWorkouts(request.userId, 5),
          getAgentContextTodayNutrition(request.userId, today),
          getAgentContextWeight(request.userId),
          listAgentContextHabits(request.userId, today),
          listAgentContextScheduledWorkouts({
            userId: request.userId,
            from: today,
            to: scheduleEnd,
          }),
        ]);

      reply.header('Cache-Control', 'private, no-cache');
      return reply.send({
        data: {
          user,
          recentWorkouts,
          todayNutrition,
          weight,
          habits,
          scheduledWorkouts,
        },
      });
    },
  );
};
