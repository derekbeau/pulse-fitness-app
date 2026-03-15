import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { apiDataResponseSchema, createAgentTokenInputSchema } from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { sendError } from '../../lib/reply.js';
import { requireAuth, requireJwtOnly } from '../../middleware/auth.js';
import {
  apiErrorResponseSchema,
  badRequestResponseSchema,
  idParamsSchema,
  jwtSecurity,
  successFlagSchema,
} from '../../openapi.js';

import {
  createAgentToken,
  deleteAgentToken,
  listAgentTokens,
  regenerateAgentToken,
} from './store.js';

const agentTokenCreateResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  token: z.string(),
});

const agentTokenListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  lastUsedAt: z.number().int().nullable(),
  createdAt: z.number().int(),
});

const agentTokenRegenerateResultSchema = z.object({
  token: z.string(),
});

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const agentTokenRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);
  app.addHook('onRequest', requireJwtOnly);

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/',
    {
      schema: {
        body: createAgentTokenInputSchema,
        response: {
          201: apiDataResponseSchema(agentTokenCreateResultSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
        },
        tags: ['settings'],
        summary: 'Create an agent token',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      const token = randomBytes(32).toString('hex');
      const now = Date.now();
      const createdToken = await createAgentToken({
        id: randomUUID(),
        userId: request.userId,
        name: request.body.name,
        tokenHash: hashToken(token),
        lastRotatedAt: now,
      });

      return reply.code(201).send({
        data: {
          id: createdToken.id,
          name: createdToken.name,
          token,
        },
      });
    },
  );

  typedApp.get(
    '/',
    {
      schema: {
        response: {
          200: apiDataResponseSchema(z.array(agentTokenListItemSchema)),
          401: apiErrorResponseSchema,
        },
        tags: ['settings'],
        summary: 'List agent tokens',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      const tokens = await listAgentTokens(request.userId);

      return reply.send({
        data: tokens,
      });
    },
  );

  typedApp.post(
    '/:id/regenerate',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(agentTokenRegenerateResultSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['settings'],
        summary: 'Regenerate an agent token',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      const token = randomBytes(32).toString('hex');
      const updated = await regenerateAgentToken(request.params.id, request.userId, hashToken(token));

      if (!updated) {
        return sendError(reply, 404, 'AGENT_TOKEN_NOT_FOUND', 'Agent token not found');
      }

      return reply.send({
        data: { token },
      });
    },
  );

  typedApp.delete(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(successFlagSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['settings'],
        summary: 'Delete an agent token',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      const deleted = await deleteAgentToken(request.params.id, request.userId);
      if (!deleted) {
        return sendError(reply, 404, 'AGENT_TOKEN_NOT_FOUND', 'Agent token not found');
      }

      return reply.send({
        data: {
          success: true,
        },
      });
    },
  );
};
