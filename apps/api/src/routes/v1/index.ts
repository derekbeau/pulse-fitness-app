import type { FastifyPluginAsync } from 'fastify';

import { requireAuth } from '../../middleware/auth.js';
import { usersRoutes } from '../users/index.js';

import { contextRoutes } from './context.js';
import { dashboardRoutes } from './dashboard.js';

export const v1Routes: FastifyPluginAsync = async (app) => {
  app.get('/ping', { onRequest: requireAuth }, async (request) => ({
    data: {
      userId: request.userId,
    },
  }));

  app.register(contextRoutes, { prefix: '/context' });
  app.register(dashboardRoutes, { prefix: '/dashboard' });
  app.register(usersRoutes, { prefix: '/users' });
};
