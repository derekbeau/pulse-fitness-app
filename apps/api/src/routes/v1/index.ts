import {
  apiDataResponseSchema,
  reconcileFoodUsageInputSchema,
  reconcileFoodUsageResponseSchema,
} from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { requireAuth, requireJwtOnly } from '../../middleware/auth.js';
import { apiErrorResponseSchema, authSecurity, jwtSecurity } from '../../openapi.js';
import { reconcileFoodUsage, FoodUsageScopeError } from '../foods/store.js';
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

  typedApp.post(
    '/admin/reconcile-food-usage',
    {
      onRequest: [requireAuth, requireJwtOnly],
      preValidation: async (request) => {
        if (request.body == null && request.headers['content-type'] === undefined) {
          request.body = reconcileFoodUsageInputSchema.parse({});
        }
      },
      schema: {
        body: reconcileFoodUsageInputSchema.default({}),
        querystring: z.object({}).strict(),
        response: {
          400: apiErrorResponseSchema,
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
      const { db } = await import('../../db/index.js');
      try {
        const result = db.transaction(
          (tx) => reconcileFoodUsage(tx, request.userId, request.body ?? {}),
          { behavior: 'immediate' },
        );
        return reply.send({ data: result });
      } catch (error) {
        if (error instanceof FoodUsageScopeError)
          return reply
            .code(400)
            .send({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        throw error;
      }
    },
  );

  app.register(contextRoutes, { prefix: '/context' });
  app.register(dashboardRoutes, { prefix: '/dashboard' });
  app.register(usersRoutes, { prefix: '/users' });
};
