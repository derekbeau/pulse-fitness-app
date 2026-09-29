import { apiDataResponseSchema, dateSchema, sessionContextRuntimeSchema } from '@pulse/shared';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { sqlite } from '../../db/index.js';
import { sendError } from '../../lib/reply.js';
import { requireAuth } from '../../middleware/auth.js';
import { apiErrorResponseSchema, authSecurity, badRequestResponseSchema } from '../../openapi.js';
import {
  buildSessionContext,
  SessionContextNotFoundError,
  SessionContextReadLimitError,
  SessionContextTimeZoneError,
} from './session-context.js';

export const sendSessionContextError = (reply: FastifyReply, error: unknown) => {
  if (error instanceof SessionContextNotFoundError)
    return sendError(reply, 404, 'SESSION_CONTEXT_NOT_FOUND', 'Session context not found');
  if (error instanceof SessionContextTimeZoneError)
    return sendError(reply, 400, 'USER_TIME_ZONE_REQUIRED', 'Set a valid IANA time zone');
  if (error instanceof SessionContextReadLimitError)
    return sendError(reply, 422, 'SESSION_CONTEXT_READ_LIMIT_EXCEEDED', error.message, {
      scope: error.scope,
      limit: error.limit,
    });
  throw error;
};

export const planningRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);
  app.withTypeProvider<ZodTypeProvider>().get(
    '/planning/what-matters',
    {
      schema: {
        querystring: z.object({ date: dateSchema.optional() }).strict(),
        response: {
          200: apiDataResponseSchema(sessionContextRuntimeSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          422: apiErrorResponseSchema,
        },
        security: authSecurity,
        tags: ['planning'],
        summary: 'Read subject-local planning context and source-linked load',
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'private, no-cache');
      try {
        return {
          data: await buildSessionContext({
            sqlite,
            userId: request.userId,
            date: request.query.date,
          }),
        };
      } catch (error) {
        return sendSessionContextError(reply, error);
      }
    },
  );
};
