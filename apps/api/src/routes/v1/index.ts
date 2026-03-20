import { apiDataResponseSchema } from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { requireAuth, requireJwtOnly } from '../../middleware/auth.js';
import { apiErrorResponseSchema, authSecurity, jwtSecurity } from '../../openapi.js';
import { reconcileFoodUsage } from '../foods/store.js';
import { usersRoutes } from '../users/index.js';

import { contextRoutes } from './context.js';
import { dashboardRoutes } from './dashboard.js';

const pingResponseSchema = z.object({
  userId: z.string(),
});

const reconcileFoodUsageResponseSchema = z.object({
  reconciled: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
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

  typedApp.post(
    '/admin/reconcile-food-usage',
    {
      onRequest: [requireAuth, requireJwtOnly],
      schema: {
        response: {
          200: apiDataResponseSchema(reconcileFoodUsageResponseSchema),
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
        },
        tags: ['admin'],
        summary: 'Reconcile food usage metadata from meal item references',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      const result = await reconcileFoodUsage(request.userId);
      return reply.send({ data: result });
    },
  );

  app.register(contextRoutes, { prefix: '/context' });
  app.register(dashboardRoutes, { prefix: '/dashboard' });
  app.register(usersRoutes, { prefix: '/users' });
};
