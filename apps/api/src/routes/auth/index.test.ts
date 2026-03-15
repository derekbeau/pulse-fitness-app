import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SESSION_JWT_ISSUER,
  SESSION_JWT_TYPE,
  type SessionJwtPayload,
} from '../../lib/session-jwt.js';
import { buildServer } from '../../index.js';
import { createUser, ensureStarterHabitsForUser, findUserByUsername } from './store.js';

vi.mock('./store.js', () => ({
  createUser: vi.fn(),
  ensureStarterHabitsForUser: vi.fn(),
  findUserByUsername: vi.fn(),
}));

describe('auth routes', () => {
  beforeEach(() => {
    vi.mocked(createUser).mockReset();
    vi.mocked(ensureStarterHabitsForUser).mockReset();
    vi.mocked(findUserByUsername).mockReset();
    vi.mocked(ensureStarterHabitsForUser).mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('registers a new user, normalizes the username, hashes the password, and returns a 7-day JWT', async () => {
    process.env.JWT_SECRET = 'test-auth-secret';

    vi.mocked(findUserByUsername).mockResolvedValue(undefined);
    vi.mocked(createUser).mockImplementation(async ({ id, username, name, passwordHash }) => {
      expect(username).toBe('derek');
      expect(passwordHash).not.toBe('super-secret-password');
      expect(await bcrypt.compare('super-secret-password', passwordHash)).toBe(true);

      return {
        id,
        username,
        name: name ?? null,
      };
    });

    const app = buildServer();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          username: ' Derek ',
          password: 'super-secret-password',
          name: ' Derek ',
        },
      });

      expect(response.statusCode).toBe(201);

      const payload = response.json() as {
        data: {
          token: string;
          user: { id: string; username: string; name: string | null };
        };
      };

      expect(payload.data.user.username).toBe('derek');
      expect(payload.data.user.name).toBe('Derek');
      expect(payload.data.user.id).toBeTruthy();
      expect(vi.mocked(findUserByUsername)).toHaveBeenCalledWith('derek');
      expect(vi.mocked(createUser)).toHaveBeenCalledOnce();

      const decoded = app.jwt.verify<SessionJwtPayload>(payload.data.token);

      expect(decoded.sub).toBe(payload.data.user.id);
      expect(decoded.type).toBe(SESSION_JWT_TYPE);
      expect(decoded.iss).toBe(SESSION_JWT_ISSUER);
      expect(decoded.exp - decoded.iat).toBe(60 * 60 * 24 * 7);
    } finally {
      await app.close();
    }
  });

  it('rejects duplicate usernames during registration', async () => {
    vi.mocked(findUserByUsername).mockResolvedValue({
      id: 'user-1',
      username: 'derek',
      name: 'Derek',
      passwordHash: 'hashed-password',
    });

    const app = buildServer();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          username: 'derek',
          password: 'super-secret-password',
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        error: {
          code: 'USERNAME_TAKEN',
          message: 'Username is already taken',
        },
      });
      expect(vi.mocked(createUser)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('logs in a user and returns the auth envelope', async () => {
    process.env.JWT_SECRET = 'test-auth-secret';

    vi.mocked(findUserByUsername).mockResolvedValue({
      id: 'user-1',
      username: 'derek',
      name: 'Derek',
      passwordHash: await bcrypt.hash('super-secret-password', 12),
    });

    const app = buildServer();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          username: ' Derek ',
          password: 'super-secret-password',
        },
      });

      expect(response.statusCode).toBe(200);

      const payload = response.json() as {
        data: {
          token: string;
          user: { id: string; username: string; name: string | null };
        };
      };

      expect(payload.data.user).toEqual({
        id: 'user-1',
        username: 'derek',
        name: 'Derek',
      });

      const decoded = app.jwt.verify<SessionJwtPayload>(payload.data.token);
      expect(decoded.sub).toBe('user-1');
      expect(decoded.type).toBe(SESSION_JWT_TYPE);
      expect(decoded.iss).toBe(SESSION_JWT_ISSUER);
      expect(vi.mocked(findUserByUsername)).toHaveBeenCalledWith('derek');
      expect(vi.mocked(ensureStarterHabitsForUser)).toHaveBeenCalledWith('user-1');
    } finally {
      await app.close();
    }
  });

  it('returns INVALID_CREDENTIALS for a non-existent username', async () => {
    vi.mocked(findUserByUsername).mockResolvedValue(undefined);

    const app = buildServer();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          username: 'missing-user',
          password: 'whatever-password',
        },
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

  it('returns INVALID_CREDENTIALS for incorrect passwords', async () => {
    vi.mocked(findUserByUsername).mockResolvedValue({
      id: 'user-1',
      username: 'derek',
      name: 'Derek',
      passwordHash: await bcrypt.hash('correct-password', 12),
    });

    const app = buildServer();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          username: 'derek',
          password: 'wrong-password',
        },
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
});
