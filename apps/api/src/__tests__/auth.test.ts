import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import bcrypt from 'bcryptjs';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '../../drizzle');

type TestContext = {
  app: Awaited<ReturnType<typeof createTestApp>>['app'];
  db: Awaited<ReturnType<typeof createTestApp>>['db'];
  sqlite: Awaited<ReturnType<typeof createTestApp>>['sqlite'];
};

const createAuthorizationHeader = (token: string, scheme: 'Bearer' | 'AgentToken' = 'Bearer') => ({
  authorization: `${scheme} ${token}`,
});

const createTestApp = async () => {
  process.env.DATABASE_URL = ':memory:';
  process.env.JWT_SECRET = 'integration-test-jwt-secret';

  vi.resetModules();

  const [{ buildServer }, { requireAuth }, dbModule, schemaModule] = await Promise.all([
    import('../index.js'),
    import('../middleware/auth.js'),
    import('../db/index.js'),
    import('../db/schema/index.js'),
  ]);

  migrate(dbModule.db, { migrationsFolder });

  const app = buildServer();

  await app.register(async (instance) => {
    instance.addHook('onRequest', requireAuth);

    instance.get('/api/agent/ping', async (request) => ({
      data: {
        userId: request.userId,
      },
    }));
  });

  await app.ready();

  return {
    app,
    db: dbModule.db,
    sqlite: dbModule.sqlite,
    schema: schemaModule,
  };
};

const registerUser = async (
  app: TestContext['app'],
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
  app: TestContext['app'],
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

const registerAndLogin = async (app: TestContext['app']) => {
  const registerResponse = await registerUser(app);
  expect(registerResponse.statusCode).toBe(201);

  const loginResponse = await loginUser(app);
  expect(loginResponse.statusCode).toBe(200);

  const payload = loginResponse.json() as {
    data: {
      token: string;
      user: {
        id: string;
        username: string;
        name: string | null;
      };
    };
  };

  return payload.data;
};

describe('auth integration', () => {
  afterEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.JWT_SECRET;
    vi.resetModules();
  });

  it('registers a user, returns a JWT, and stores a hashed password', async () => {
    const { app, db, sqlite, schema } = await createTestApp();

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

      const storedUser = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, 'derek'))
        .limit(1)
        .get();

      expect(storedUser).toBeDefined();
      expect(storedUser?.passwordHash).not.toBe('super-secret-password');
      expect(storedUser?.passwordHash).toBeTruthy();
      expect(await bcrypt.compare('super-secret-password', storedUser?.passwordHash ?? '')).toBe(
        true,
      );
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('rejects duplicate usernames with a 409 conflict', async () => {
    const { app, sqlite } = await createTestApp();

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
      sqlite.close();
    }
  });

  it('rejects registration when required fields are missing', async () => {
    const { app, sqlite } = await createTestApp();

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
      sqlite.close();
    }
  });

  it('rejects registration when the password is too short', async () => {
    const { app, sqlite } = await createTestApp();

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
      sqlite.close();
    }
  });

  it('logs in with valid credentials and returns a JWT', async () => {
    const { app, sqlite } = await createTestApp();

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
      sqlite.close();
    }
  });

  it('returns INVALID_CREDENTIALS for the wrong password', async () => {
    const { app, sqlite } = await createTestApp();

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
      sqlite.close();
    }
  });

  it('returns INVALID_CREDENTIALS for a nonexistent username', async () => {
    const { app, sqlite } = await createTestApp();

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
      sqlite.close();
    }
  });

  it('accepts a valid JWT on a protected route', async () => {
    const { app, sqlite } = await createTestApp();

    try {
      const authData = await registerAndLogin(app);
      const response = await app.inject({
        method: 'GET',
        url: '/api/agent/ping',
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
      sqlite.close();
    }
  });

  it('rejects expired JWTs on protected routes', async () => {
    const { app, sqlite } = await createTestApp();

    try {
      const authData = await registerAndLogin(app);
      const expiredToken = app.jwt.sign({ userId: authData.user.id }, { expiresIn: -1 });
      const response = await app.inject({
        method: 'GET',
        url: '/api/agent/ping',
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
      sqlite.close();
    }
  });

  it('rejects malformed JWTs on protected routes', async () => {
    const { app, sqlite } = await createTestApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/agent/ping',
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
      sqlite.close();
    }
  });

  it('rejects requests without an Authorization header', async () => {
    const { app, sqlite } = await createTestApp();

    try {
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
      sqlite.close();
    }
  });

  it('creates and lists agent tokens without exposing stored hashes', async () => {
    const { app, db, sqlite, schema } = await createTestApp();

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

      const storedToken = db
        .select()
        .from(schema.agentTokens)
        .where(eq(schema.agentTokens.id, createdPayload.data.id))
        .limit(1)
        .get();

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
      sqlite.close();
    }
  });

  it('authenticates /api/agent routes with an agent token and updates lastUsedAt', async () => {
    const { app, db, sqlite, schema } = await createTestApp();

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

      const beforeUse = db
        .select()
        .from(schema.agentTokens)
        .where(eq(schema.agentTokens.id, createdPayload.data.id))
        .limit(1)
        .get();
      expect(beforeUse?.lastUsedAt).toBeNull();

      const useResponse = await app.inject({
        method: 'GET',
        url: '/api/agent/ping',
        headers: createAuthorizationHeader(createdPayload.data.token, 'AgentToken'),
      });

      expect(useResponse.statusCode).toBe(200);
      expect(useResponse.json()).toEqual({
        data: {
          userId: authData.user.id,
        },
      });

      const afterUse = db
        .select()
        .from(schema.agentTokens)
        .where(eq(schema.agentTokens.id, createdPayload.data.id))
        .limit(1)
        .get();
      expect(afterUse?.lastUsedAt).toBeTypeOf('number');
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('rejects deleted agent tokens on subsequent use', async () => {
    const { app, sqlite } = await createTestApp();

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
        url: '/api/agent/ping',
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
      sqlite.close();
    }
  });
});
