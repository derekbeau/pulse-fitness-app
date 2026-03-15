import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { findAgentTokenByHash, updateAgentTokenLastUsedAt } from '../../middleware/store.js';

import { getUserById, updateUser } from './store.js';

vi.mock('./store.js', () => ({
  getUserById: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('../../middleware/store.js', () => ({
  findAgentTokenByHash: vi.fn(),
  findUserAuthById: vi.fn(),
  updateAgentTokenLastUsedAt: vi.fn(),
}));

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

describe('users routes', () => {
  beforeEach(() => {
    vi.mocked(getUserById).mockReset();
    vi.mocked(updateUser).mockReset();
    vi.mocked(findAgentTokenByHash).mockReset();
    vi.mocked(updateAgentTokenLastUsedAt).mockReset();
    vi.mocked(updateAgentTokenLastUsedAt).mockResolvedValue(undefined);
    process.env.JWT_SECRET = 'test-users-routes-secret';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('GET /api/v1/users/me returns the authenticated user', async () => {
    vi.mocked(getUserById).mockResolvedValue({
      id: 'user-1',
      username: 'derek',
      name: 'Derek',
      weightUnit: 'lbs',
      createdAt: 1709913600000,
    });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          id: 'user-1',
          username: 'derek',
          name: 'Derek',
          weightUnit: 'lbs',
          createdAt: 1709913600000,
        },
      });
      expect(vi.mocked(getUserById)).toHaveBeenCalledWith('user-1');
    } finally {
      await app.close();
    }
  });

  it('PATCH /api/v1/users/me updates the name and returns updated user', async () => {
    vi.mocked(updateUser).mockResolvedValue({
      id: 'user-1',
      username: 'derek',
      name: 'Derek B',
      weightUnit: 'lbs',
      createdAt: 1709913600000,
    });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        payload: { name: 'Derek B' },
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          id: 'user-1',
          username: 'derek',
          name: 'Derek B',
          weightUnit: 'lbs',
          createdAt: 1709913600000,
        },
      });
      expect(vi.mocked(updateUser)).toHaveBeenCalledWith('user-1', { name: 'Derek B' });
    } finally {
      await app.close();
    }
  });

  it('PATCH /api/v1/users/me with empty name returns 400', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        payload: { name: '' },
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid user update payload',
        },
      });
      expect(vi.mocked(updateUser)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('PATCH /api/v1/users/me with invalid body returns 400', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        payload: { name: 123 },
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid user update payload',
        },
      });
      expect(vi.mocked(updateUser)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('PATCH /api/v1/users/me with empty body returns 400', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        payload: {},
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid user update payload',
        },
      });
      expect(vi.mocked(updateUser)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('PATCH /api/v1/users/me updates weight unit', async () => {
    vi.mocked(updateUser).mockResolvedValue({
      id: 'user-1',
      username: 'derek',
      name: 'Derek',
      weightUnit: 'kg',
      createdAt: 1709913600000,
    });

    const app = buildServer();

    try {
      await app.ready();
      const authToken = app.jwt.sign({ userId: 'user-1' });
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        payload: { weightUnit: 'kg' },
        headers: createAuthorizationHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          id: 'user-1',
          username: 'derek',
          name: 'Derek',
          weightUnit: 'kg',
          createdAt: 1709913600000,
        },
      });
      expect(vi.mocked(updateUser)).toHaveBeenCalledWith('user-1', { weightUnit: 'kg' });
    } finally {
      await app.close();
    }
  });

  it('rejects unauthenticated requests', async () => {
    const app = buildServer();

    try {
      await app.ready();
      const [getResponse, patchResponse, invalidTokenResponse] = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/v1/users/me',
        }),
        app.inject({
          method: 'PATCH',
          url: '/api/v1/users/me',
          payload: { name: 'Derek' },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/users/me',
          headers: createAuthorizationHeader('not-a-valid-token'),
        }),
      ]);

      for (const response of [getResponse, patchResponse, invalidTokenResponse]) {
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }
      expect(vi.mocked(getUserById)).not.toHaveBeenCalled();
      expect(vi.mocked(updateUser)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('rejects valid agent tokens with 403 because profile routes are JWT-only', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue({
      id: 'agent-token-1',
      userId: 'user-1',
    });

    const app = buildServer();

    try {
      await app.ready();
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
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
      expect(vi.mocked(getUserById)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
