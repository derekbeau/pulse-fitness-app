import { agentContextResponseSchema } from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';

import {
  findAgentContextUser,
  getAgentContextTodayNutrition,
  getAgentContextWeight,
  listAgentContextHabits,
  listAgentContextRecentWorkouts,
  listAgentContextScheduledWorkouts,
} from './context-store.js';
import { getTodayDate, shiftDate } from './date-utils.js';

export const agentContextRoutes: FastifyPluginAsync = async (app) => {
  app.get('/context', async (request, reply) => {
    const today = getTodayDate();
    const scheduleEnd = shiftDate(today, 6);

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
      request.log.error(
        {
          issues: parsed.error.issues,
        },
        'Failed to build agent context payload',
      );
      return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to build agent context payload');
    }

    return reply.send({
      data: parsed.data,
    });
  });
};
