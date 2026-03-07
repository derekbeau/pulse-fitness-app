import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { createAgentTokenInputSchema } from '@pulse/shared';
import type { FastifyPluginAsync } from 'fastify';

import { requireUserAuth } from '../../middleware/auth.js';
import { sendError } from '../../lib/reply.js';

import { createAgentToken, deleteAgentToken, listAgentTokens } from './store.js';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const agentTokenRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireUserAuth);

  app.post('/', async (request, reply) => {
    const parsedBody = createAgentTokenInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid agent token payload');
    }

    const token = randomBytes(32).toString('hex');
    const createdToken = await createAgentToken({
      id: randomUUID(),
      userId: request.userId,
      name: parsedBody.data.name,
      tokenHash: hashToken(token),
    });

    return reply.code(201).send({
      data: {
        id: createdToken.id,
        name: createdToken.name,
        token,
      },
    });
  });

  app.get('/', async (request, reply) => {
    const tokens = await listAgentTokens(request.userId);

    return reply.send({
      data: tokens,
    });
  });

  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const deleted = await deleteAgentToken(request.params.id, request.userId);
    if (!deleted) {
      return sendError(reply, 404, 'AGENT_TOKEN_NOT_FOUND', 'Agent token not found');
    }

    return reply.send({
      data: {
        success: true,
      },
    });
  });
};
