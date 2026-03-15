import { agentContextResponseSchema, apiDataResponseSchema } from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';

import { addUtcDays, getTodayDate } from '../../lib/date.js';
import { requireAgentOnly, requireAuth } from '../../middleware/auth.js';
import {
  agentTokenSecurity,
  apiErrorResponseSchema,
} from '../../openapi.js';
import {
  findAgentContextUser,
  getAgentContextTodayNutrition,
  getAgentContextWeight,
  listAgentContextHabits,
  listAgentContextRecentWorkouts,
  listAgentContextScheduledWorkouts,
} from '../agent/context-store.js';

export const contextRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);
  app.addHook('onRequest', requireAgentOnly);

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/',
    {
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
      const today = getTodayDate();
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
