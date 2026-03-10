import type { FastifyPluginAsync } from 'fastify';

import { requireAuth } from '../../middleware/auth.js';

export const agentRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get('/ping', async (request) => ({
    data: {
      userId: request.userId,
    },
  }));
};
