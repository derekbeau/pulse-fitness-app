import { createHash } from 'node:crypto';

import type { FastifyReply, FastifyRequest, onRequestHookHandler } from 'fastify';

import { sendError } from '../lib/reply.js';

import { findAgentTokenByHash, updateAgentTokenLastUsedAt } from './store.js';

type AuthScheme = 'AgentToken' | 'Bearer';

type SessionJwtPayload = {
  userId: string;
};

const getAuthorizationHeader = (request: FastifyRequest): string | undefined => {
  const { authorization } = request.headers;

  return typeof authorization === 'string' ? authorization.trim() : undefined;
};

const extractAuthorizationToken = (
  request: FastifyRequest,
  scheme: AuthScheme,
): string | undefined => {
  const authorization = getAuthorizationHeader(request);
  if (!authorization) {
    return undefined;
  }

  const [prefix, ...tokenParts] = authorization.split(/\s+/);
  if (!prefix || prefix.toLowerCase() !== scheme.toLowerCase()) {
    return undefined;
  }

  const token = tokenParts.join(' ').trim();
  return token.length > 0 ? token : undefined;
};

const setRequestUserId = (request: FastifyRequest, userId: string) => {
  request.userId = userId;
  return userId;
};

const verifyJwt = async (request: FastifyRequest): Promise<string | undefined> => {
  if (!extractAuthorizationToken(request, 'Bearer')) {
    return undefined;
  }

  try {
    const payload = await request.jwtVerify<SessionJwtPayload>();

    if (typeof payload.userId !== 'string' || payload.userId.length === 0) {
      return undefined;
    }

    return setRequestUserId(request, payload.userId);
  } catch {
    return undefined;
  }
};

const verifyAgentToken = async (request: FastifyRequest): Promise<string | undefined> => {
  const token = extractAuthorizationToken(request, 'AgentToken');
  if (!token) {
    return undefined;
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const agentToken = await findAgentTokenByHash(tokenHash);
  if (!agentToken) {
    return undefined;
  }

  await updateAgentTokenLastUsedAt(agentToken.id);

  return setRequestUserId(request, agentToken.userId);
};

const sendUnauthorized = (reply: FastifyReply) =>
  sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');

export const requireAuth: onRequestHookHandler = async (request, reply) => {
  if ((await verifyJwt(request)) || (await verifyAgentToken(request))) {
    return;
  }

  return sendUnauthorized(reply);
};

export const requireUserAuth: onRequestHookHandler = async (request, reply) => {
  if (await verifyJwt(request)) {
    return;
  }

  return sendUnauthorized(reply);
};
