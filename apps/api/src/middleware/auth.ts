import { createHash } from 'node:crypto';

import type { FastifyReply, FastifyRequest, onRequestHookHandler } from 'fastify';

import { sendError } from '../lib/reply.js';

import { findAgentTokenByHash, findUserAuthById, updateAgentTokenLastUsedAt } from './store.js';

type AuthScheme = 'AgentToken' | 'Bearer';

type SessionJwtPayload = {
  userId: string;
};

type AuthContext =
  | {
      authType: 'jwt';
      userId: string;
    }
  | {
      authType: 'agent-token';
      agentTokenId: string;
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

  const [prefix, token] = authorization.split(/\s+/);
  if (!prefix || prefix.toLowerCase() !== scheme.toLowerCase()) {
    return undefined;
  }

  return token && token.length > 0 ? token : undefined;
};

const setRequestAuthContext = (request: FastifyRequest, context: AuthContext) => {
  request.authType = context.authType;
  request.userId = context.userId;
  request.agentTokenId = context.authType === 'agent-token' ? context.agentTokenId : undefined;

  return context.userId;
};

const shouldVerifyUserExists = () => process.env.NODE_ENV !== 'test';

const resolveVerifiedUserId = async (userId: string): Promise<string | undefined> => {
  if (!shouldVerifyUserExists()) {
    return userId;
  }

  const user = await findUserAuthById(userId);
  if (!user) {
    return undefined;
  }

  return user.id;
};

const verifyJwt = async (request: FastifyRequest): Promise<AuthContext | undefined> => {
  if (!extractAuthorizationToken(request, 'Bearer')) {
    return undefined;
  }

  try {
    const payload = await request.jwtVerify<SessionJwtPayload>();

    if (typeof payload.userId !== 'string' || payload.userId.length === 0) {
      return undefined;
    }

    const verifiedUserId = await resolveVerifiedUserId(payload.userId);
    if (!verifiedUserId) {
      return undefined;
    }

    return {
      authType: 'jwt',
      userId: verifiedUserId,
    };
  } catch {
    return undefined;
  }
};

const verifyAgentToken = async (request: FastifyRequest): Promise<AuthContext | undefined> => {
  const token = extractAuthorizationToken(request, 'AgentToken');
  if (!token) {
    return undefined;
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const agentToken = await findAgentTokenByHash(tokenHash);
  if (!agentToken) {
    return undefined;
  }

  const verifiedUserId = await resolveVerifiedUserId(agentToken.userId);
  if (!verifiedUserId) {
    return undefined;
  }

  try {
    await updateAgentTokenLastUsedAt(agentToken.id);
  } catch {
    // Best-effort tracking: auth should still succeed if the write fails.
  }

  return {
    authType: 'agent-token',
    agentTokenId: agentToken.id,
    userId: verifiedUserId,
  };
};

const sendUnauthorized = (reply: FastifyReply) =>
  sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');

const sendForbidden = (reply: FastifyReply) =>
  sendError(reply, 403, 'FORBIDDEN', 'JWT authentication required');

export const requireAuth: onRequestHookHandler = async (request, reply) => {
  const context = (await verifyJwt(request)) ?? (await verifyAgentToken(request));
  if (context) {
    setRequestAuthContext(request, context);
    return;
  }

  return sendUnauthorized(reply);
};

export const requireJwtOnly: onRequestHookHandler = async (request, reply) => {
  if (request.authType === 'jwt') {
    return;
  }

  return sendForbidden(reply);
};

export const isAgentRequest = (request: FastifyRequest) => request.authType === 'agent-token';
