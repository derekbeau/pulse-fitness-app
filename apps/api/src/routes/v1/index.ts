import { apiDataResponseSchema } from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.js';
import { apiErrorResponseSchema, authSecurity } from '../../openapi.js';
import { usersRoutes } from '../users/index.js';

import { contextRoutes } from './context.js';
import { dashboardRoutes } from './dashboard.js';

const pingResponseSchema = z.object({
  userId: z.string(),
});

export const v1Routes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/ping',
    {
      onRequest: requireAuth,
      schema: {
        response: {
          200: apiDataResponseSchema(pingResponseSchema),
          401: apiErrorResponseSchema,
        },
        tags: ['system'],
        summary: 'Verify API authentication',
        security: authSecurity,
      },
    },
    async (request) => ({
      data: {
        userId: request.userId,
      },
    }),
  );

  app.register(contextRoutes, { prefix: '/context' });
  app.register(dashboardRoutes, { prefix: '/dashboard' });
  app.register(usersRoutes, { prefix: '/users' });
};
