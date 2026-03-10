import type { FastifyPluginAsync } from 'fastify';

import { requireAuth } from '../../middleware/auth.js';

import { agentFoodsRoutes } from './foods.js';
import { agentMealsRoutes } from './meals.js';

export const agentRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get('/ping', async (request) => ({
    data: {
      userId: request.userId,
    },
  }));

  app.register(agentFoodsRoutes, { prefix: '/foods' });
  app.register(agentMealsRoutes, { prefix: '/meals' });
};
