import type { FastifyReply, FastifyRequest } from 'fastify';

import { sendError } from './reply.js';

export type SessionJwtPayload = {
  userId: string;
};

export const authenticate = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<SessionJwtPayload | undefined> => {
  try {
    return await request.jwtVerify<SessionJwtPayload>();
  } catch {
    return sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
  }
};
