import { createHash } from 'node:crypto';

import fastifyJwt from '@fastify/jwt';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_JWT_ISSUER, SESSION_JWT_TYPE, issueSessionJwt } from '../lib/session-jwt.js';
import { isAgentRequest, requireAuth, requireJwtOnly } from './auth.js';
import { findAgentTokenByHash, findUserAuthById, updateAgentTokenLastUsedAt } from './store.js';

vi.mock('./store.js', () => ({
  findAgentTokenByHash: vi.fn(),
  findUserAuthById: vi.fn(),
  updateAgentTokenLastUsedAt: vi.fn(),
}));

const buildTestApp = async () => {
  const app = Fastify();

  await app.register(fastifyJwt, {
    secret: 'test-jwt-secret',
  });

  app.get(
    '/require-auth',
    {
      onRequest: requireAuth,
    },
    async (request) => ({
      data: {
        agentTokenId: request.agentTokenId ?? null,
        authType: request.authType,
        isAgentRequest: isAgentRequest(request),
        userId: request.userId,
      },
    }),
  );

  app.get(
    '/jwt-only',
    {
      onRequest: [requireAuth, requireJwtOnly],
    },
    async (request) => ({
      data: {
        agentTokenId: request.agentTokenId ?? null,
        authType: request.authType,
        userId: request.userId,
      },
    }),
  );

  await app.register(async (instance) => {
    instance.addHook('onRequest', requireAuth);

    instance.get('/plugin-protected', async (request) => ({
      data: {
        agentTokenId: request.agentTokenId ?? null,
        authType: request.authType,
        userId: request.userId,
      },
    }));
  });

  await app.ready();

  return app;
};

describe('auth middleware', () => {
  beforeEach(() => {
    vi.mocked(findAgentTokenByHash).mockReset();
    vi.mocked(findUserAuthById).mockReset();
    vi.mocked(updateAgentTokenLastUsedAt).mockReset();
    vi.mocked(findUserAuthById).mockResolvedValue({ id: 'user-default' });
    vi.mocked(updateAgentTokenLastUsedAt).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('accepts bearer JWTs and injects authType and request.userId for requireAuth', async () => {
    const app = await buildTestApp();

    try {
      const token = issueSessionJwt(app, 'user-jwt-1');
      const response = await app.inject({
        method: 'GET',
        url: '/require-auth',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          agentTokenId: null,
          authType: 'jwt',
          isAgentRequest: false,
          userId: 'user-jwt-1',
        },
      });
      expect(vi.mocked(findUserAuthById)).not.toHaveBeenCalled();
      expect(vi.mocked(findAgentTokenByHash)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('rejects tampered bearer JWTs for requireAuth', async () => {
    vi.mocked(updateAgentTokenLastUsedAt).mockRejectedValue(new Error('best-effort write failure'));

    const app = await buildTestApp();

    try {
      const jwt = issueSessionJwt(app, 'user-jwt-1');
      const response = await app.inject({
        method: 'GET',
        url: '/require-auth',
        headers: {
          authorization: `Bearer ${jwt}tampered`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      expect(vi.mocked(findAgentTokenByHash)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('accepts agent tokens and injects authType, userId, and agentTokenId', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-agent-1',
      expiresAt: null,
    });

    const app = await buildTestApp();

    try {
      const token = 'plain-agent-token';
      const response = await app.inject({
        method: 'GET',
        url: '/require-auth',
        headers: {
          authorization: `AgentToken ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          agentTokenId: 'agent-token-1',
          authType: 'agent-token',
          isAgentRequest: true,
          userId: 'user-agent-1',
        },
      });
      expect(vi.mocked(findUserAuthById)).not.toHaveBeenCalled();
      expect(vi.mocked(findAgentTokenByHash)).toHaveBeenCalledWith(
        createHash('sha256').update(token).digest('hex'),
      );
      expect(vi.mocked(updateAgentTokenLastUsedAt)).toHaveBeenCalledWith('agent-token-1');
    } finally {
      await app.close();
    }
  });

  it('accepts agent tokens through plugin-level protection when lastUsedAt update fails', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-agent-1',
      expiresAt: null,
    });
    vi.mocked(updateAgentTokenLastUsedAt).mockRejectedValue(new Error('best-effort write failure'));

    const app = await buildTestApp();

    try {
      const token = 'plain-agent-token';
      const response = await app.inject({
        method: 'GET',
        url: '/plugin-protected',
        headers: {
          authorization: `AgentToken ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          agentTokenId: 'agent-token-1',
          authType: 'agent-token',
          userId: 'user-agent-1',
        },
      });
      expect(vi.mocked(findUserAuthById)).not.toHaveBeenCalled();
      expect(vi.mocked(findAgentTokenByHash)).toHaveBeenCalledWith(
        createHash('sha256').update(token).digest('hex'),
      );
      expect(vi.mocked(updateAgentTokenLastUsedAt)).toHaveBeenCalledWith('agent-token-1');
    } finally {
      await app.close();
    }
  });

  it('rejects tampered bearer JWTs for requireJwtOnly routes', async () => {
    const app = await buildTestApp();

    try {
      const jwt = issueSessionJwt(app, 'user-jwt-1');
      const response = await app.inject({
        method: 'GET',
        url: '/jwt-only',
        headers: {
          authorization: `Bearer ${jwt}tampered`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      expect(vi.mocked(findAgentTokenByHash)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('rejects agent tokens for requireJwtOnly', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-agent-1',
      expiresAt: null,
    });

    const app = await buildTestApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/jwt-only',
        headers: {
          authorization: 'AgentToken plain-agent-token',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: {
          code: 'FORBIDDEN',
          message: 'JWT authentication required',
        },
      });
      expect(vi.mocked(findAgentTokenByHash)).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it('allows JWTs through requireJwtOnly', async () => {
    const app = await buildTestApp();

    try {
      const jwt = issueSessionJwt(app, 'user-jwt-1');
      const response = await app.inject({
        method: 'GET',
        url: '/jwt-only',
        headers: {
          authorization: `Bearer ${jwt}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          agentTokenId: null,
          authType: 'jwt',
          userId: 'user-jwt-1',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('rejects requests without valid credentials', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue(undefined);

    const app = await buildTestApp();

    try {
      const responses = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/require-auth',
        }),
        app.inject({
          method: 'GET',
          url: '/plugin-protected',
          headers: {
            authorization: 'AgentToken unknown-token',
          },
        }),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }
    } finally {
      await app.close();
    }
  });

  it('rejects deleted or invalid agent tokens', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue(undefined);

    const app = await buildTestApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/require-auth',
        headers: {
          authorization: 'AgentToken deleted-token',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      expect(vi.mocked(updateAgentTokenLastUsedAt)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('checks agent token storage on every request so revoked tokens immediately fail', async () => {
    vi.mocked(findAgentTokenByHash)
      .mockResolvedValueOnce({
        id: 'agent-token-1',
        userId: 'user-agent-1',
        expiresAt: null,
      })
      .mockResolvedValueOnce(undefined);

    const app = await buildTestApp();

    try {
      const headers = {
        authorization: 'AgentToken plain-agent-token',
      };

      const firstResponse = await app.inject({
        method: 'GET',
        url: '/require-auth',
        headers,
      });
      const secondResponse = await app.inject({
        method: 'GET',
        url: '/require-auth',
        headers,
      });

      expect(firstResponse.statusCode).toBe(200);
      expect(secondResponse.statusCode).toBe(401);
      expect(secondResponse.json()).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      expect(vi.mocked(findAgentTokenByHash)).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
  });

  it('rejects bearer JWTs when the user no longer exists outside test mode', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    vi.mocked(findUserAuthById).mockResolvedValue(undefined);

    const app = await buildTestApp();

    try {
      const token = issueSessionJwt(app, 'deleted-user-id');
      const response = await app.inject({
        method: 'GET',
        url: '/require-auth',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      expect(vi.mocked(findUserAuthById)).toHaveBeenCalledWith('deleted-user-id');
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      await app.close();
    }
  });

  it('rejects JWTs without the required type claim', async () => {
    const app = await buildTestApp();

    try {
      const token = app.jwt.sign({
        sub: 'user-jwt-1',
        iss: SESSION_JWT_ISSUER,
      });
      const response = await app.inject({
        method: 'GET',
        url: '/require-auth',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('rejects JWTs with the wrong type claim', async () => {
    const app = await buildTestApp();

    try {
      const token = app.jwt.sign({
        sub: 'user-jwt-1',
        type: 'agent',
        iss: SESSION_JWT_ISSUER,
      });
      const response = await app.inject({
        method: 'GET',
        url: '/require-auth',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('rejects JWTs without the required issuer claim', async () => {
    const app = await buildTestApp();

    try {
      const token = app.jwt.sign({
        sub: 'user-jwt-1',
        type: SESSION_JWT_TYPE,
      });
      const response = await app.inject({
        method: 'GET',
        url: '/require-auth',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('rejects expired agent tokens', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-agent-1',
      expiresAt: Date.now() - 1,
    });

    const app = await buildTestApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/require-auth',
        headers: {
          authorization: 'AgentToken plain-agent-token',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(vi.mocked(updateAgentTokenLastUsedAt)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
