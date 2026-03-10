import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { findAgentTokenByHash, updateAgentTokenLastUsedAt } from '../../middleware/store.js';

vi.mock('../../middleware/store.js', () => ({
  findAgentTokenByHash: vi.fn(),
  updateAgentTokenLastUsedAt: vi.fn(),
}));

const createAuthorizationHeader = (token: string, scheme: 'Bearer' | 'AgentToken' = 'Bearer') => ({
  authorization: `${scheme} ${token}`,
});

describe('agent route namespace', () => {
  beforeEach(() => {
    vi.mocked(findAgentTokenByHash).mockReset();
    vi.mocked(updateAgentTokenLastUsedAt).mockReset();
    vi.mocked(updateAgentTokenLastUsedAt).mockResolvedValue(undefined);
    process.env.JWT_SECRET = 'test-agent-routes-secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('rejects requests without auth credentials', async () => {
    const app = buildServer();

    try {
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/api/agent/ping',
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

  it('accepts bearer JWT auth for /api/agent routes', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const token = app.jwt.sign({ userId: 'user-jwt-1' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/agent/ping',
        headers: createAuthorizationHeader(token),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          userId: 'user-jwt-1',
        },
      });
      expect(vi.mocked(findAgentTokenByHash)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('accepts AgentToken auth for /api/agent routes', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-agent-1',
    });

    const app = buildServer();

    try {
      await app.ready();
      const token = 'plain-agent-token';
      const response = await app.inject({
        method: 'GET',
        url: '/api/agent/ping',
        headers: createAuthorizationHeader(token, 'AgentToken'),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          userId: 'user-agent-1',
        },
      });
      expect(vi.mocked(findAgentTokenByHash)).toHaveBeenCalledWith(
        createHash('sha256').update(token).digest('hex'),
      );
      expect(vi.mocked(updateAgentTokenLastUsedAt)).toHaveBeenCalledWith('agent-token-1');
    } finally {
      await app.close();
    }
  });

  it('rejects unknown AgentToken credentials', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue(undefined);

    const app = buildServer();

    try {
      await app.ready();
      const response = await app.inject({
        method: 'GET',
        url: '/api/agent/ping',
        headers: createAuthorizationHeader('unknown-agent-token', 'AgentToken'),
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
});
