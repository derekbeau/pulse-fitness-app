import { createHash } from 'node:crypto';

import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type StoredUser = {
  id: string;
  username: string;
  name: string | null;
  passwordHash: string;
};

type StoredAgentToken = {
  id: string;
  userId: string;
  name: string;
  tokenHash: string;
  lastUsedAt: number | null;
  createdAt: number;
};

const testState = vi.hoisted(() => {
  const users = new Map<string, StoredUser>();
  const agentTokens = new Map<string, StoredAgentToken>();
  const initialCreatedAt = 1_700_000_000_000;
  let createdAtCounter = initialCreatedAt;

  return {
    users,
    agentTokens,
    reset() {
      users.clear();
      agentTokens.clear();
      createdAtCounter = initialCreatedAt;
    },
    nextCreatedAt() {
      const createdAt = createdAtCounter;
      createdAtCounter += 1;
      return createdAt;
    },
  };
});

vi.mock('../routes/auth/store.js', () => ({
  createUser: vi.fn(
    async ({
      id,
      username,
      name,
      passwordHash,
    }: {
      id: string;
      username: string;
      name?: string;
      passwordHash: string;
    }) => {
      if (testState.users.has(username)) {
        throw Object.assign(new Error('Username already exists'), {
          code: 'SQLITE_CONSTRAINT_UNIQUE',
        });
      }

      testState.users.set(username, {
        id,
        username,
        name: name ?? null,
        passwordHash,
      });

      return {
        id,
        username,
        name: name ?? null,
      };
    },
  ),
  ensureStarterHabitsForUser: vi.fn(async () => undefined),
  findUserByUsername: vi.fn(async (username: string) => testState.users.get(username)),
}));

vi.mock('../routes/agent-tokens/store.js', () => ({
  createAgentToken: vi.fn(
    async ({
      id,
      userId,
      name,
      tokenHash,
    }: {
      id: string;
      userId: string;
      name: string;
      tokenHash: string;
    }) => {
      testState.agentTokens.set(id, {
        id,
        userId,
        name,
        tokenHash,
        lastUsedAt: null,
        createdAt: testState.nextCreatedAt(),
      });

      return { id, name };
    },
  ),
  listAgentTokens: vi.fn(async (userId: string) =>
    [...testState.agentTokens.values()]
      .filter((token) => token.userId === userId)
      .sort((left, right) => right.createdAt - left.createdAt)
      .map(({ id, name, lastUsedAt, createdAt }) => ({
        id,
        name,
        lastUsedAt,
        createdAt,
      })),
  ),
  deleteAgentToken: vi.fn(async (id: string, userId: string) => {
    const token = testState.agentTokens.get(id);
    if (!token || token.userId !== userId) {
      return false;
    }

    testState.agentTokens.delete(id);
    return true;
  }),
}));

vi.mock('../middleware/store.js', () => ({
  findAgentTokenByHash: vi.fn(async (tokenHash: string) => {
    const token = [...testState.agentTokens.values()].find(
      (candidate) => candidate.tokenHash === tokenHash,
    );

    return token ? { id: token.id, userId: token.userId } : undefined;
  }),
  findUserAuthById: vi.fn(async (userId: string) => {
    const user = [...testState.users.values()].find((candidate) => candidate.id === userId);
    return user ? { id: user.id } : undefined;
  }),
  updateAgentTokenLastUsedAt: vi.fn(async (id: string, lastUsedAt = Date.now()) => {
    const token = testState.agentTokens.get(id);
    if (!token) {
      throw new Error('Failed to update agent token last used timestamp');
    }

    token.lastUsedAt = lastUsedAt;
  }),
}));

const createAuthorizationHeader = (token: string, scheme: 'Bearer' | 'AgentToken' = 'Bearer') => ({
  authorization: `${scheme} ${token}`,
});

const createTestApp = async () => {
  process.env.JWT_SECRET = 'integration-test-jwt-secret';

  vi.resetModules();

  const { buildServer } = await import('../index.js');

  const app = buildServer();

  await app.ready();

  return { app };
};

const registerUser = async (
  app: Awaited<ReturnType<typeof createTestApp>>['app'],
  overrides?: Partial<{
    username: string;
    password: string;
    name: string;
  }>,
) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      username: 'derek',
      password: 'super-secret-password',
      name: 'Derek',
      ...overrides,
    },
  });

const loginUser = async (
  app: Awaited<ReturnType<typeof createTestApp>>['app'],
  overrides?: Partial<{
    username: string;
    password: string;
  }>,
) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {
      username: 'derek',
      password: 'super-secret-password',
      ...overrides,
    },
  });

const registerAndLogin = async (app: Awaited<ReturnType<typeof createTestApp>>['app']) => {
  const registerResponse = await registerUser(app);
  expect(registerResponse.statusCode).toBe(201);

  const loginResponse = await loginUser(app);
  expect(loginResponse.statusCode).toBe(200);

  return (
    loginResponse.json() as {
      data: {
        token: string;
        user: {
          id: string;
          username: string;
          name: string | null;
        };
      };
    }
  ).data;
};

describe('auth integration', () => {
  beforeEach(() => {
    testState.reset();
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    vi.useRealTimers();
    vi.resetModules();
  });

  it('registers a user, returns a JWT, and stores a hashed password', async () => {
    const { app } = await createTestApp();

    try {
      const response = await registerUser(app, {
        username: ' Derek ',
        name: ' Derek ',
      });

      expect(response.statusCode).toBe(201);

      const payload = response.json() as {
        data: {
          token: string;
          user: {
            id: string;
            username: string;
            name: string | null;
          };
        };
      };

      expect(payload.data.user.username).toBe('derek');
      expect(payload.data.user.name).toBe('Derek');

      const decoded = app.jwt.verify<{ userId: string }>(payload.data.token);
      expect(decoded.userId).toBe(payload.data.user.id);

      const storedUser = testState.users.get('derek');

      expect(storedUser).toBeDefined();
      expect(storedUser?.passwordHash).not.toBe('super-secret-password');
      expect(storedUser?.passwordHash).toBeTruthy();
      expect(await bcrypt.compare('super-secret-password', storedUser?.passwordHash ?? '')).toBe(
        true,
      );
    } finally {
      await app.close();
    }
  });

  it('rejects duplicate usernames with a 409 conflict', async () => {
    const { app } = await createTestApp();

    try {
      expect((await registerUser(app)).statusCode).toBe(201);

      const response = await registerUser(app);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        error: {
          code: 'USERNAME_TAKEN',
          message: 'Username is already taken',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('rejects registration when required fields are missing', async () => {
    const { app } = await createTestApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          username: 'derek',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid registration payload',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('rejects registration when the password is too short', async () => {
    const { app } = await createTestApp();

    try {
      const response = await registerUser(app, {
        password: 'short',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid registration payload',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('logs in with valid credentials and returns a JWT', async () => {
    const { app } = await createTestApp();

    try {
      const authData = await registerAndLogin(app);

      expect(authData.user).toEqual({
        id: authData.user.id,
        username: 'derek',
        name: 'Derek',
      });

      const decoded = app.jwt.verify<{ userId: string }>(authData.token);
      expect(decoded.userId).toBe(authData.user.id);
    } finally {
      await app.close();
    }
  });

  it('returns INVALID_CREDENTIALS for the wrong password', async () => {
    const { app } = await createTestApp();

    try {
      await registerUser(app);

      const response = await loginUser(app, {
        password: 'wrong-password',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('returns INVALID_CREDENTIALS for a nonexistent username', async () => {
    const { app } = await createTestApp();

    try {
      const response = await loginUser(app, {
        username: 'missing-user',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('accepts a valid JWT on a protected route', async () => {
    const { app } = await createTestApp();

    try {
      const authData = await registerAndLogin(app);
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ping',
        headers: createAuthorizationHeader(authData.token),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: {
          userId: authData.user.id,
        },
      });
    } finally {
      await app.close();
    }
  });

  it('rejects expired JWTs on protected routes', async () => {
    const { app } = await createTestApp();

    try {
      const authData = await registerAndLogin(app);
      const expiredToken = app.jwt.sign({ userId: authData.user.id }, { expiresIn: -1 });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ping',
        headers: createAuthorizationHeader(expiredToken),
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

  it('rejects malformed JWTs on protected routes', async () => {
    const { app } = await createTestApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ping',
        headers: createAuthorizationHeader('not-a-jwt'),
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

  it('rejects requests without an Authorization header', async () => {
    const { app } = await createTestApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ping',
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

  it('creates and lists agent tokens without exposing stored hashes', async () => {
    const { app } = await createTestApp();

    try {
      const authData = await registerAndLogin(app);
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/agent-tokens',
        headers: createAuthorizationHeader(authData.token),
        payload: {
          name: ' Meal logger ',
        },
      });

      expect(createResponse.statusCode).toBe(201);

      const createdPayload = createResponse.json() as {
        data: {
          id: string;
          name: string;
          token: string;
        };
      };

      expect(createdPayload.data.name).toBe('Meal logger');
      expect(createdPayload.data.token).toHaveLength(64);

      const storedToken = testState.agentTokens.get(createdPayload.data.id);

      expect(storedToken).toBeDefined();
      expect(storedToken?.tokenHash).toBe(
        createHash('sha256').update(createdPayload.data.token).digest('hex'),
      );

      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/agent-tokens',
        headers: createAuthorizationHeader(authData.token),
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual({
        data: [
          {
            id: createdPayload.data.id,
            name: 'Meal logger',
            lastUsedAt: null,
            createdAt: storedToken?.createdAt,
          },
        ],
      });
      expect(listResponse.body).not.toContain('tokenHash');
      expect(listResponse.body).not.toContain(createdPayload.data.token);
    } finally {
      await app.close();
    }
  });

  it('authenticates unified /api/v1 routes with an agent token and updates lastUsedAt', async () => {
    const { app } = await createTestApp();

    try {
      const authData = await registerAndLogin(app);
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/agent-tokens',
        headers: createAuthorizationHeader(authData.token),
        payload: {
          name: 'Meal logger',
        },
      });

      const createdPayload = createResponse.json() as {
        data: {
          id: string;
          token: string;
        };
      };

      const beforeUse = testState.agentTokens.get(createdPayload.data.id);
      expect(beforeUse?.lastUsedAt).toBeNull();

      const useResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/ping',
        headers: createAuthorizationHeader(createdPayload.data.token, 'AgentToken'),
      });

      expect(useResponse.statusCode).toBe(200);
      expect(useResponse.json()).toEqual({
        data: {
          userId: authData.user.id,
        },
      });

      const afterUse = testState.agentTokens.get(createdPayload.data.id);
      expect(afterUse?.lastUsedAt).toBeTypeOf('number');
    } finally {
      await app.close();
    }
  });

  it('rejects deleted agent tokens on subsequent use', async () => {
    const { app } = await createTestApp();

    try {
      const authData = await registerAndLogin(app);
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/agent-tokens',
        headers: createAuthorizationHeader(authData.token),
        payload: {
          name: 'Meal logger',
        },
      });

      const createdPayload = createResponse.json() as {
        data: {
          id: string;
          token: string;
        };
      };

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/v1/agent-tokens/${createdPayload.data.id}`,
        headers: createAuthorizationHeader(authData.token),
      });

      expect(deleteResponse.statusCode).toBe(200);
      expect(deleteResponse.json()).toEqual({
        data: {
          success: true,
        },
      });

      const useResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/ping',
        headers: createAuthorizationHeader(createdPayload.data.token, 'AgentToken'),
      });

      expect(useResponse.statusCode).toBe(401);
      expect(useResponse.json()).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    } finally {
      await app.close();
    }
  });
});
