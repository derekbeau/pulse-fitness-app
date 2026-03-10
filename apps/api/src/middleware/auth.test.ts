import { createHash } from 'node:crypto';

import fastifyJwt from '@fastify/jwt';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requireAuth, requireUserAuth } from './auth.js';
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
        userId: request.userId,
      },
    }),
  );

  app.get(
    '/require-user-auth',
    {
      onRequest: requireUserAuth,
    },
    async (request) => ({
      data: {
        userId: request.userId,
      },
    }),
  );

  await app.register(async (instance) => {
    instance.addHook('onRequest', requireAuth);

    instance.get('/plugin-protected', async (request) => ({
      data: {
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

  it('accepts bearer JWTs and injects request.userId for requireAuth', async () => {
    const app = await buildTestApp();

    try {
      const token = app.jwt.sign({ userId: 'user-jwt-1' });
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
      const jwt = app.jwt.sign({ userId: 'user-jwt-1' });
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

  it('accepts agent tokens through plugin-level protection when lastUsedAt update fails', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-agent-1',
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

  it('rejects tampered bearer JWTs for requireUserAuth', async () => {
    const app = await buildTestApp();

    try {
      const jwt = app.jwt.sign({ userId: 'user-jwt-1' });
      const response = await app.inject({
        method: 'GET',
        url: '/require-user-auth',
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

  it('rejects agent tokens for requireUserAuth', async () => {
    const app = await buildTestApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/require-user-auth',
        headers: {
          authorization: 'AgentToken plain-agent-token',
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

  it('rejects bearer JWTs when the user no longer exists outside test mode', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    vi.mocked(findUserAuthById).mockResolvedValue(undefined);

    const app = await buildTestApp();

    try {
      const token = app.jwt.sign({ userId: 'deleted-user-id' });
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
});
