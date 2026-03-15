import { apiDataResponseSchema, updateUserInputSchema, userProfileSchema } from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';

import { sendError } from '../../lib/reply.js';
import { requireAuth, requireJwtOnly } from '../../middleware/auth.js';
import {
  apiErrorResponseSchema,
  badRequestResponseSchema,
  jwtSecurity,
} from '../../openapi.js';

import { getUserById, updateUser } from './store.js';

export const usersRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);
  app.addHook('onRequest', requireJwtOnly);

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/me',
    {
      schema: {
        response: {
          200: apiDataResponseSchema(userProfileSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['settings'],
        summary: 'Get the current user profile',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      const user = await getUserById(request.userId);

      if (!user) {
        return sendError(reply, 404, 'NOT_FOUND', 'User not found');
      }

      return reply.send({ data: user });
    },
  );

  typedApp.patch(
    '/me',
    {
      schema: {
        body: updateUserInputSchema,
        response: {
          200: apiDataResponseSchema(userProfileSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['settings'],
        summary: 'Update the current user profile',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      const user = await updateUser(request.userId, request.body);

      if (!user) {
        return sendError(reply, 404, 'NOT_FOUND', 'User not found');
      }

      return reply.send({ data: user });
    },
  );
};
