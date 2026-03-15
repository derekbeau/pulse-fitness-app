import { createHash } from 'node:crypto';

import type { FastifyReply, FastifyRequest, onRequestHookHandler } from 'fastify';

import {
  SESSION_JWT_ISSUER,
  SESSION_JWT_TYPE,
  type SessionJwtPayload,
} from '../lib/session-jwt.js';
import { sendError } from '../lib/reply.js';

import { findAgentTokenByHash, findUserAuthById, updateAgentTokenLastUsedAt } from './store.js';

type AuthScheme = 'AgentToken' | 'Bearer';

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
    // Unified auth supports two schemes on the same route surface:
    // 1. Bearer JWTs issued by login/register for interactive user sessions.
    // 2. AgentToken values that are stored hashed in the database for agents.
    //
    // JWTs must carry explicit session-only claims so a hand-crafted token that
    // only copies a user identifier is rejected even if it has a valid shape.
    const payload = await request.jwtVerify<SessionJwtPayload>();

    if (
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      payload.type !== SESSION_JWT_TYPE ||
      payload.iss !== SESSION_JWT_ISSUER ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return undefined;
    }

    const verifiedUserId = await resolveVerifiedUserId(payload.sub);
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

  // Agent tokens are bearer secrets stored only as hashes. Validation must hit
  // the database on every request so revocation and expiry take effect
  // immediately; do not cache token validity in memory.
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const agentToken = await findAgentTokenByHash(tokenHash);
  if (!agentToken) {
    return undefined;
  }

  if (typeof agentToken.expiresAt === 'number' && agentToken.expiresAt <= Date.now()) {
    return undefined;
  }

  const verifiedUserId = await resolveVerifiedUserId(agentToken.userId);
  if (!verifiedUserId) {
    return undefined;
  }

  try {
    await updateAgentTokenLastUsedAt(agentToken.id);
  } catch (error) {
    request.log.warn(
      { err: error, agentTokenId: agentToken.id, userId: verifiedUserId },
      'Failed to update agent token last used timestamp',
    );
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

const sendAgentTokenForbidden = (reply: FastifyReply) =>
  sendError(reply, 403, 'FORBIDDEN', 'Agent token authentication required');

export const requireAuth: onRequestHookHandler = async (request, reply) => {
  const context = (await verifyJwt(request)) ?? (await verifyAgentToken(request));
  if (context) {
    setRequestAuthContext(request, context);
    return;
  }

  return sendUnauthorized(reply);
};

export const requireJwtOnly: onRequestHookHandler = async (request, reply) => {
  if (request.authType === undefined) {
    return sendUnauthorized(reply);
  }

  if (request.authType === 'jwt') {
    return;
  }

  return sendForbidden(reply);
};

export const requireAgentOnly: onRequestHookHandler = async (request, reply) => {
  if (request.authType === undefined) {
    return sendUnauthorized(reply);
  }

  if (request.authType === 'agent-token') {
    return;
  }

  return sendAgentTokenForbidden(reply);
};

export const isAgentRequest = (request: FastifyRequest) => request.authType === 'agent-token';
