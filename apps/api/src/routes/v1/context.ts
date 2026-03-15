import { agentContextResponseSchema } from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { addUtcDays, getTodayDate } from '../../lib/date.js';
import { sendError } from '../../lib/reply.js';
import { isAgentRequest, requireAuth } from '../../middleware/auth.js';
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

  app.get('/', async (request, reply) => {
    if (!isAgentRequest(request)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Context is only available for agent tokens');
    }

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

    const payload = {
      user,
      recentWorkouts,
      todayNutrition,
      weight,
      habits,
      scheduledWorkouts,
    };
    const parsed = agentContextResponseSchema.safeParse(payload);
    if (!parsed.success) {
      request.log.error({ issues: parsed.error.issues }, 'Failed to build agent context payload');
      return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to build agent context payload');
    }

    return reply.send({
      data: parsed.data,
    });
  });
};
