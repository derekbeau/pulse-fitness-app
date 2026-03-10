import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { asc, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { habits, users } from '../../db/schema/index.js';

type DatabaseModule = typeof import('../../db/index.js');

type TestContext = {
  app: FastifyInstance;
  db: DatabaseModule['db'];
  sqlite: DatabaseModule['sqlite'];
  tempDir: string;
};

const expectedStarterHabits = [
  {
    name: 'Hydrate',
    emoji: '💧',
    trackingType: 'numeric',
    target: 8,
    unit: 'glasses',
  },
  {
    name: 'Take vitamins',
    emoji: '💊',
    trackingType: 'boolean',
    target: null,
    unit: null,
  },
  {
    name: 'Protein goal',
    emoji: '🥗',
    trackingType: 'numeric',
    target: 120,
    unit: 'grams',
  },
  {
    name: 'Sleep',
    emoji: '😴',
    trackingType: 'time',
    target: 8,
    unit: 'hours',
  },
  {
    name: 'Mobility warm-up',
    emoji: '🧘',
    trackingType: 'boolean',
    target: null,
    unit: null,
  },
] as const;

let context: TestContext;

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

describe('auth starter habits integration', () => {
  beforeAll(async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-auth-starter-habits-'));

    process.env.JWT_SECRET = 'test-auth-starter-habits-secret';
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    vi.resetModules();

    const [{ buildServer }, dbModule] = await Promise.all([
      import('../../index.js'),
      import('../../db/index.js'),
    ]);

    migrate(dbModule.db, {
      migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
    });

    const app = buildServer();
    await app.ready();

    context = {
      app,
      db: dbModule.db,
      sqlite: dbModule.sqlite,
      tempDir,
    };
  });

  afterAll(async () => {
    if (context) {
      await context.app.close();
      context.sqlite.close();
      rmSync(context.tempDir, { recursive: true, force: true });
    }

    delete process.env.JWT_SECRET;
    delete process.env.DATABASE_URL;
    vi.resetModules();
  });

  beforeEach(() => {
    context.db.delete(habits).run();
    context.db.delete(users).run();
  });

  it('seeds five starter habits on register and returns them from GET /api/v1/habits', async () => {
    const registerResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        username: 'derek',
        password: 'super-secret-password',
        name: 'Derek',
      },
    });

    expect(registerResponse.statusCode).toBe(201);

    const registerPayload = registerResponse.json() as {
      data: {
        token: string;
        user: {
          id: string;
        };
      };
    };

    const userId = registerPayload.data.user.id;
    const seededHabits = context.db
      .select({
        name: habits.name,
        emoji: habits.emoji,
        trackingType: habits.trackingType,
        target: habits.target,
        unit: habits.unit,
        sortOrder: habits.sortOrder,
      })
      .from(habits)
      .where(eq(habits.userId, userId))
      .orderBy(asc(habits.sortOrder))
      .all();

    expect(seededHabits).toHaveLength(5);
    expect(seededHabits).toEqual(
      expectedStarterHabits.map((habit, index) => ({
        ...habit,
        sortOrder: index,
      })),
    );

    const listResponse = await context.app.inject({
      method: 'GET',
      url: '/api/v1/habits',
      headers: createAuthorizationHeader(registerPayload.data.token),
    });

    expect(listResponse.statusCode).toBe(200);

    const listPayload = listResponse.json() as {
      data: Array<{
        name: string;
        emoji: string | null;
        trackingType: string;
        target: number | null;
        unit: string | null;
        sortOrder: number;
      }>;
    };

    expect(listPayload.data).toHaveLength(5);
    expect(
      listPayload.data.map(({ name, emoji, trackingType, target, unit, sortOrder }) => ({
        name,
        emoji,
        trackingType,
        target,
        unit,
        sortOrder,
      })),
    ).toEqual(
      expectedStarterHabits.map((habit, index) => ({
        ...habit,
        sortOrder: index,
      })),
    );
  });
});
