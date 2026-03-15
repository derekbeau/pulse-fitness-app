import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { findAgentTokenByHash, updateAgentTokenLastUsedAt } from '../../middleware/store.js';
import { createAgentToken, deleteAgentToken, listAgentTokens } from './store.js';

vi.mock('./store.js', () => ({
  createAgentToken: vi.fn(),
  deleteAgentToken: vi.fn(),
  listAgentTokens: vi.fn(),
}));

vi.mock('../../middleware/store.js', () => ({
  findAgentTokenByHash: vi.fn(),
  findUserAuthById: vi.fn(),
  updateAgentTokenLastUsedAt: vi.fn(),
}));

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

describe('agent token routes', () => {
  beforeEach(() => {
    vi.mocked(createAgentToken).mockReset();
    vi.mocked(deleteAgentToken).mockReset();
    vi.mocked(listAgentTokens).mockReset();
    vi.mocked(findAgentTokenByHash).mockReset();
    vi.mocked(updateAgentTokenLastUsedAt).mockReset();
    vi.mocked(updateAgentTokenLastUsedAt).mockResolvedValue(undefined);
    process.env.JWT_SECRET = 'test-agent-token-secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('creates an agent token, stores only its SHA-256 hash, and returns the plain token once', async () => {
    vi.mocked(createAgentToken).mockImplementation(async ({ id, name }) => ({
      id,
      name,
    }));

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agent-tokens',
        headers: createAuthorizationHeader(authToken),
        payload: {
          name: ' Meal logger ',
        },
      });

      expect(response.statusCode).toBe(201);

      const payload = response.json() as {
        data: {
          id: string;
          name: string;
          token: string;
        };
      };

      expect(payload.data.name).toBe('Meal logger');
      expect(payload.data.id).toBeTruthy();
      expect(payload.data.token).toHaveLength(64);
      expect(vi.mocked(createAgentToken)).toHaveBeenCalledOnce();
      expect(vi.mocked(createAgentToken)).toHaveBeenCalledWith({
        id: payload.data.id,
        userId: 'user-1',
        name: 'Meal logger',
        tokenHash: createHash('sha256').update(payload.data.token).digest('hex'),
      });
    } finally {
      await app.close();
    }
  });

  it('rejects invalid creation payloads', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agent-tokens',
        headers: createAuthorizationHeader(authToken),
        payload: {
          name: '   ',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid agent token payload',
        },
      });
      expect(vi.mocked(createAgentToken)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('requires JWT authentication for create, list, and delete', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const requests = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/v1/agent-tokens',
          payload: { name: 'Meal logger' },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/agent-tokens',
        }),
        app.inject({
          method: 'DELETE',
          url: '/api/v1/agent-tokens/token-1',
        }),
      ]);

      for (const response of requests) {
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

  it('rejects valid agent tokens with 403 because agent token management is JWT-only', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-1',
    });

    const app = buildServer();

    try {
      await app.ready();
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agent-tokens',
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
      expect(vi.mocked(listAgentTokens)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('lists only the safe token metadata for the authenticated user', async () => {
    vi.mocked(listAgentTokens).mockResolvedValue([
      {
        id: 'token-2',
        name: 'Workout planner',
        lastUsedAt: null,
        createdAt: 1_700_000_000_000,
      },
      {
        id: 'token-1',
        name: 'Meal logger',
        lastUsedAt: 1_700_000_100_000,
        createdAt: 1_700_000_200_000,
      },
    ]);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agent-tokens',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: [
          {
            id: 'token-2',
            name: 'Workout planner',
            lastUsedAt: null,
            createdAt: 1_700_000_000_000,
          },
          {
            id: 'token-1',
            name: 'Meal logger',
            lastUsedAt: 1_700_000_100_000,
            createdAt: 1_700_000_200_000,
          },
        ],
      });
      expect(vi.mocked(listAgentTokens)).toHaveBeenCalledWith('user-1');
    } finally {
      await app.close();
    }
  });

  it('deletes a token only within the authenticated user scope', async () => {
    vi.mocked(deleteAgentToken).mockResolvedValue(true);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/agent-tokens/token-1',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          success: true,
        },
      });
      expect(vi.mocked(deleteAgentToken)).toHaveBeenCalledWith('token-1', 'user-1');
    } finally {
      await app.close();
    }
  });

  it('returns not found when deleting a token outside the user scope', async () => {
    vi.mocked(deleteAgentToken).mockResolvedValue(false);

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/agent-tokens/token-1',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          code: 'AGENT_TOKEN_NOT_FOUND',
          message: 'Agent token not found',
        },
      });
    } finally {
      await app.close();
    }
  });
});
