import { agentContextResponseSchema } from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../lib/reply.js';

import {
  agentContextDateUtils,
  findAgentContextUser,
  getAgentContextTodayNutrition,
  getAgentContextWeight,
  listAgentContextHabits,
  listAgentContextRecentWorkouts,
  listAgentContextScheduledWorkouts,
} from './context-store.js';

const padDatePart = (value: number) => String(value).padStart(2, '0');

const getTodayDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = padDatePart(now.getMonth() + 1);
  const day = padDatePart(now.getDate());
  return `${year}-${month}-${day}`;
};

export const agentContextRoutes: FastifyPluginAsync = async (app) => {
  app.get('/context', async (request, reply) => {
    const today = getTodayDate();
    const scheduleEnd = agentContextDateUtils.addUtcDays(today, 6);

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
