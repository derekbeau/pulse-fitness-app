import type { FastifyPluginAsync } from 'fastify';

import { requireAuth } from '../../middleware/auth.js';

import { agentContextRoutes } from './context.js';
import { agentDailyRoutes } from './daily.js';
import { agentExerciseRoutes } from './exercises.js';
import { agentFoodsRoutes } from './foods.js';
import { agentMealsRoutes } from './meals.js';
import { agentWorkoutRoutes } from './workouts.js';

export const agentRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get('/ping', async (request) => ({
    data: {
      userId: request.userId,
    },
  }));

  app.register(agentFoodsRoutes, { prefix: '/foods' });
  app.register(agentMealsRoutes, { prefix: '/meals' });
  app.register(agentExerciseRoutes, { prefix: '/exercises' });
  app.register(agentWorkoutRoutes);
  app.register(agentDailyRoutes);
  app.register(agentContextRoutes);
};
