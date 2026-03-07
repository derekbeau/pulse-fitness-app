import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { exercises, users } from '../../db/schema/index.js';

type DatabaseModule = typeof import('../../db/index.js');

type TestContext = {
  app: FastifyInstance;
  db: DatabaseModule['db'];
  sqlite: DatabaseModule['sqlite'];
  tempDir: string;
};

let context: TestContext;

const createAuthorizationHeader = (token: string) => ({
  authorization: `Bearer ${token}`,
});

const seedUser = (id: string, username: string) =>
  context.db
    .insert(users)
    .values({
      id,
      username,
      name: username,
      passwordHash: 'not-used-in-this-suite',
    })
    .run();

const seedExercise = (values: {
  id: string;
  userId: string | null;
  name: string;
  muscleGroups: string[];
  equipment: string;
  category: 'compound' | 'isolation' | 'cardio' | 'mobility';
  instructions?: string | null;
}) =>
  context.db
    .insert(exercises)
    .values({
      ...values,
      instructions: values.instructions ?? null,
    })
    .run();

describe('exercise routes', () => {
  beforeAll(async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-exercises-routes-'));

    process.env.JWT_SECRET = 'test-exercises-secret';
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
    context.db.delete(exercises).run();
    context.db.delete(users).run();

    seedUser('user-1', 'derek');
    seedUser('user-2', 'alex');
  });

  it('requires auth for create, list, update, and delete', async () => {
    const responses = await Promise.all([
      context.app.inject({
        method: 'POST',
        url: '/api/v1/exercises',
        payload: {
          name: 'Goblet Squat',
          muscleGroups: ['quads'],
          equipment: 'dumbbell',
          category: 'compound',
        },
      }),
      context.app.inject({
        method: 'GET',
        url: '/api/v1/exercises',
      }),
      context.app.inject({
        method: 'PUT',
        url: '/api/v1/exercises/exercise-1',
        payload: { name: 'Updated' },
      }),
      context.app.inject({
        method: 'DELETE',
        url: '/api/v1/exercises/exercise-1',
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
  });

  it('creates a user-specific exercise for the authenticated user', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/exercises',
      headers: createAuthorizationHeader(authToken),
      payload: {
        name: ' Single-Arm Cable Row ',
        muscleGroups: ['lats', 'upper back'],
        equipment: ' cable machine ',
        category: 'compound',
        instructions: ' Pull elbow toward hip. ',
      },
    });

    expect(response.statusCode).toBe(201);

    const payload = response.json() as {
      data: {
        id: string;
        userId: string | null;
        name: string;
        muscleGroups: string[];
        equipment: string;
        category: string;
        instructions: string | null;
        createdAt: number;
        updatedAt: number;
      };
    };

    expect(payload.data).toMatchObject({
      userId: 'user-1',
      name: 'Single-Arm Cable Row',
      muscleGroups: ['lats', 'upper back'],
      equipment: 'cable machine',
      category: 'compound',
      instructions: 'Pull elbow toward hip.',
    });
    expect(payload.data.id).toBeTruthy();
    expect(payload.data.createdAt).toBeTypeOf('number');
    expect(payload.data.updatedAt).toBeTypeOf('number');
  });

  it('lists visible exercises with case-insensitive search, filtering, and pagination', async () => {
    seedExercise({
      id: 'global-press',
      userId: null,
      name: 'Incline Press',
      muscleGroups: ['chest', 'triceps'],
      equipment: 'barbell',
      category: 'compound',
    });
    seedExercise({
      id: 'user-press',
      userId: 'user-1',
      name: 'Cable Press Around',
      muscleGroups: ['chest'],
      equipment: 'cable machine',
      category: 'isolation',
    });
    seedExercise({
      id: 'user-row',
      userId: 'user-1',
      name: 'Chest Supported Row',
      muscleGroups: ['lats', 'upper back'],
      equipment: 'machine',
      category: 'compound',
    });
    seedExercise({
      id: 'other-user',
      userId: 'user-2',
      name: 'Private Exercise',
      muscleGroups: ['quads'],
      equipment: 'dumbbell',
      category: 'compound',
    });

    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    const [searchResponse, filterResponse, pagedResponse] = await Promise.all([
      context.app.inject({
        method: 'GET',
        url: '/api/v1/exercises?q=PRESS',
        headers: createAuthorizationHeader(authToken),
      }),
      context.app.inject({
        method: 'GET',
        url: '/api/v1/exercises?muscleGroup=lats&equipment=machine&category=compound',
        headers: createAuthorizationHeader(authToken),
      }),
      context.app.inject({
        method: 'GET',
        url: '/api/v1/exercises?page=1&limit=2',
        headers: createAuthorizationHeader(authToken),
      }),
    ]);

    expect(searchResponse.statusCode).toBe(200);
    expect(searchResponse.json()).toEqual({
      data: [
        expect.objectContaining({ id: 'user-press', name: 'Cable Press Around' }),
        expect.objectContaining({ id: 'global-press', name: 'Incline Press' }),
      ],
      meta: {
        page: 1,
        limit: 20,
        total: 2,
      },
    });

    expect(filterResponse.statusCode).toBe(200);
    expect(filterResponse.json()).toEqual({
      data: [expect.objectContaining({ id: 'user-row', name: 'Chest Supported Row' })],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
      },
    });

    expect(pagedResponse.statusCode).toBe(200);
    expect(pagedResponse.json()).toEqual({
      data: [
        expect.objectContaining({ id: 'user-press' }),
        expect.objectContaining({ id: 'user-row' }),
      ],
      meta: {
        page: 1,
        limit: 2,
        total: 3,
      },
    });
  });

  it('updates only user-specific exercises and rejects global rows', async () => {
    seedExercise({
      id: 'user-exercise',
      userId: 'user-1',
      name: 'Lat Pulldown',
      muscleGroups: ['lats'],
      equipment: 'cable machine',
      category: 'compound',
      instructions: 'Use a shoulder-width grip.',
    });
    seedExercise({
      id: 'global-exercise',
      userId: null,
      name: 'Air Bike',
      muscleGroups: ['conditioning'],
      equipment: 'air bike',
      category: 'cardio',
    });

    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    const updateResponse = await context.app.inject({
      method: 'PUT',
      url: '/api/v1/exercises/user-exercise',
      headers: createAuthorizationHeader(authToken),
      payload: {
        name: 'Wide-Grip Lat Pulldown',
        instructions: '   ',
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toEqual({
      data: expect.objectContaining({
        id: 'user-exercise',
        userId: 'user-1',
        name: 'Wide-Grip Lat Pulldown',
        instructions: null,
      }),
    });

    const globalResponse = await context.app.inject({
      method: 'PUT',
      url: '/api/v1/exercises/global-exercise',
      headers: createAuthorizationHeader(authToken),
      payload: {
        name: 'Updated Air Bike',
      },
    });

    expect(globalResponse.statusCode).toBe(403);
    expect(globalResponse.json()).toEqual({
      error: {
        code: 'GLOBAL_EXERCISE_READ_ONLY',
        message: 'Global exercises cannot be modified',
      },
    });
  });

  it('deletes only user-specific exercises and rejects global rows', async () => {
    seedExercise({
      id: 'user-exercise',
      userId: 'user-1',
      name: 'Goblet Squat',
      muscleGroups: ['quads', 'glutes'],
      equipment: 'dumbbell',
      category: 'compound',
    });
    seedExercise({
      id: 'global-exercise',
      userId: null,
      name: 'Couch Stretch',
      muscleGroups: ['hip flexors', 'quads'],
      equipment: 'bodyweight',
      category: 'mobility',
    });

    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    const deleteResponse = await context.app.inject({
      method: 'DELETE',
      url: '/api/v1/exercises/user-exercise',
      headers: createAuthorizationHeader(authToken),
    });

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({
      data: {
        success: true,
      },
    });

    const remainingExerciseIds = context.db.select({ id: exercises.id }).from(exercises).all();
    expect(remainingExerciseIds).toEqual([{ id: 'global-exercise' }]);

    const globalResponse = await context.app.inject({
      method: 'DELETE',
      url: '/api/v1/exercises/global-exercise',
      headers: createAuthorizationHeader(authToken),
    });

    expect(globalResponse.statusCode).toBe(403);
    expect(globalResponse.json()).toEqual({
      error: {
        code: 'GLOBAL_EXERCISE_READ_ONLY',
        message: 'Global exercises cannot be modified',
      },
    });
  });

  it('returns validation errors for invalid create payloads and query params', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    const [createResponse, queryResponse] = await Promise.all([
      context.app.inject({
        method: 'POST',
        url: '/api/v1/exercises',
        headers: createAuthorizationHeader(authToken),
        payload: {
          name: '   ',
          muscleGroups: [],
          equipment: 'cable',
          category: 'compound',
        },
      }),
      context.app.inject({
        method: 'GET',
        url: '/api/v1/exercises?page=0&limit=200',
        headers: createAuthorizationHeader(authToken),
      }),
    ]);

    expect(createResponse.statusCode).toBe(400);
    expect(createResponse.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid exercise payload',
      },
    });

    expect(queryResponse.statusCode).toBe(400);
    expect(queryResponse.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid exercise query',
      },
    });
  });
});
