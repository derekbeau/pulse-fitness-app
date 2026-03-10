import type { FastifyPluginAsync } from 'fastify';

import { dashboardRoutes } from './dashboard.js';

export const v1Routes: FastifyPluginAsync = async (app) => {
  app.register(dashboardRoutes, { prefix: '/dashboard' });
};
