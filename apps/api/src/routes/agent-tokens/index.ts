import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { createAgentTokenInputSchema } from '@pulse/shared';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import { createAgentToken, deleteAgentToken, listAgentTokens } from './store.js';

const sendError = (reply: FastifyReply, statusCode: number, code: string, message: string) =>
  reply.code(statusCode).send({
    error: {
      code,
      message,
    },
  });

type SessionJwtPayload = {
  userId: string;
};

const authenticate = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<SessionJwtPayload | undefined> => {
  try {
    return await request.jwtVerify<SessionJwtPayload>();
  } catch {
    return sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
  }
};

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const agentTokenRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) {
      return;
    }

    const parsedBody = createAgentTokenInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid agent token payload');
    }

    const token = randomBytes(32).toString('hex');
    const createdToken = await createAgentToken({
      id: randomUUID(),
      userId: auth.userId,
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
    const auth = await authenticate(request, reply);
    if (!auth) {
      return;
    }

    const tokens = await listAgentTokens(auth.userId);

    return reply.send({
      data: tokens,
    });
  });

  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) {
      return;
    }

    const deleted = await deleteAgentToken(request.params.id, auth.userId);
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
