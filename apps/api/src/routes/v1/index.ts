import type { FastifyPluginAsync } from 'fastify';

import { usersRoutes } from '../users/index.js';

import { dashboardRoutes } from './dashboard.js';

export const v1Routes: FastifyPluginAsync = async (app) => {
  app.register(dashboardRoutes, { prefix: '/dashboard' });
  app.register(usersRoutes, { prefix: '/users' });
};
