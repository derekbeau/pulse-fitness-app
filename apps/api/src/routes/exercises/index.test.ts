import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  agentTokens,
  exercises,
  sessionSets,
  templateExercises,
  users,
  workoutSessions,
  workoutTemplates,
} from '../../db/schema/index.js';

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

const createAgentTokenHeader = (token: string) => ({
  authorization: `AgentToken ${token}`,
});

const seedAgentToken = (userId: string, token = 'plain-agent-token') => {
  context.db
    .insert(agentTokens)
    .values({
      id: `agent-token-${userId}`,
      userId,
      name: `Agent ${userId}`,
      tokenHash: createHash('sha256').update(token).digest('hex'),
    })
    .run();

  return token;
};

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
  tags?: string[];
  formCues?: string[];
  instructions?: string | null;
  coachingNotes?: string | null;
  relatedExerciseIds?: string[];
}) =>
  context.db
    .insert(exercises)
    .values({
      ...values,
      tags: values.tags ?? [],
      formCues: values.formCues ?? [],
      instructions: values.instructions ?? null,
      coachingNotes: values.coachingNotes ?? null,
      relatedExerciseIds: values.relatedExerciseIds ?? [],
    })
    .run();

const seedWorkoutSession = (values: {
  id: string;
  userId: string;
  name: string;
  date: string;
  startedAt: number;
  status?: 'scheduled' | 'in-progress' | 'completed';
  completedAt?: number | null;
}) =>
  context.db
    .insert(workoutSessions)
    .values({
      id: values.id,
      userId: values.userId,
      templateId: null,
      name: values.name,
      date: values.date,
      status: values.status ?? 'in-progress',
      startedAt: values.startedAt,
      completedAt: values.completedAt ?? null,
      duration: null,
      feedback: null,
      notes: null,
    })
    .run();

const seedSessionSet = (values: {
  id: string;
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  weight?: number | null;
  reps?: number | null;
}) =>
  context.db
    .insert(sessionSets)
    .values({
      id: values.id,
      sessionId: values.sessionId,
      exerciseId: values.exerciseId,
      setNumber: values.setNumber,
      weight: values.weight ?? null,
      reps: values.reps ?? null,
      completed: false,
      skipped: false,
      section: 'main',
      notes: null,
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
    context.db.delete(agentTokens).run();
    context.db.delete(sessionSets).run();
    context.db.delete(workoutSessions).run();
    context.db.delete(templateExercises).run();
    context.db.delete(workoutTemplates).run();
    context.db.delete(exercises).run();
    context.db.delete(users).run();

    seedUser('user-1', 'derek');
    seedUser('user-2', 'alex');
  });

  it('requires auth for create, list, last-performance, update, and delete', async () => {
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
        method: 'GET',
        url: '/api/v1/exercises/exercise-1/last-performance',
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

  it('returns most recent completed last performance for a visible exercise', async () => {
    seedExercise({
      id: 'global-bench',
      userId: null,
      name: 'Bench Press',
      muscleGroups: ['chest'],
      equipment: 'barbell',
      category: 'compound',
    });
    seedExercise({
      id: 'user-1-no-data',
      userId: 'user-1',
      name: 'No Data Exercise',
      muscleGroups: ['chest'],
      equipment: 'machine',
      category: 'isolation',
    });
    seedExercise({
      id: 'user-2-private',
      userId: 'user-2',
      name: 'Private Exercise',
      muscleGroups: ['back'],
      equipment: 'cable',
      category: 'compound',
    });

    seedWorkoutSession({
      id: 'session-old',
      userId: 'user-1',
      name: 'Upper Push',
      date: '2026-03-01',
      status: 'completed',
      startedAt: 1_700_000_000_000,
      completedAt: 1_700_000_003_000,
    });
    seedWorkoutSession({
      id: 'session-latest',
      userId: 'user-1',
      name: 'Upper Push',
      date: '2026-03-08',
      status: 'completed',
      startedAt: 1_700_000_010_000,
      completedAt: 1_700_000_015_000,
    });
    seedWorkoutSession({
      id: 'session-in-progress',
      userId: 'user-1',
      name: 'Upper Push',
      date: '2026-03-09',
      status: 'in-progress',
      startedAt: 1_700_000_020_000,
    });
    seedWorkoutSession({
      id: 'session-other-user',
      userId: 'user-2',
      name: 'Private User Session',
      date: '2026-03-09',
      status: 'completed',
      startedAt: 1_700_000_020_000,
      completedAt: 1_700_000_025_000,
    });

    seedSessionSet({
      id: 'set-old-1',
      sessionId: 'session-old',
      exerciseId: 'global-bench',
      setNumber: 1,
      weight: 100,
      reps: 8,
    });
    seedSessionSet({
      id: 'set-old-2',
      sessionId: 'session-old',
      exerciseId: 'global-bench',
      setNumber: 2,
      weight: 100,
      reps: 7,
    });
    seedSessionSet({
      id: 'set-latest-1',
      sessionId: 'session-latest',
      exerciseId: 'global-bench',
      setNumber: 1,
      weight: 105,
      reps: 9,
    });
    seedSessionSet({
      id: 'set-in-progress',
      sessionId: 'session-in-progress',
      exerciseId: 'global-bench',
      setNumber: 1,
      weight: 115,
      reps: 12,
    });
    seedSessionSet({
      id: 'set-other-user',
      sessionId: 'session-other-user',
      exerciseId: 'global-bench',
      setNumber: 1,
      weight: 200,
      reps: 20,
    });

    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/exercises/global-bench/last-performance',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        sessionId: 'session-latest',
        date: '2026-03-08',
        sets: [
          {
            setNumber: 1,
            weight: 105,
            reps: 9,
          },
        ],
      },
    });

    const noDataResponse = await context.app.inject({
      method: 'GET',
      url: '/api/v1/exercises/user-1-no-data/last-performance',
      headers: createAuthorizationHeader(authToken),
    });

    expect(noDataResponse.statusCode).toBe(200);
    expect(noDataResponse.json()).toEqual({
      data: null,
    });

    const privateExerciseResponse = await context.app.inject({
      method: 'GET',
      url: '/api/v1/exercises/user-2-private/last-performance',
      headers: createAuthorizationHeader(authToken),
    });

    expect(privateExerciseResponse.statusCode).toBe(404);
    expect(privateExerciseResponse.json()).toEqual({
      error: {
        code: 'EXERCISE_NOT_FOUND',
        message: 'Exercise not found',
      },
    });
  });

  it('returns the newest same-day completed performance for history lookups', async () => {
    seedExercise({
      id: 'global-squat',
      userId: null,
      name: 'Back Squat',
      muscleGroups: ['quads'],
      equipment: 'barbell',
      category: 'compound',
    });

    seedWorkoutSession({
      id: 'session-early',
      userId: 'user-1',
      name: 'Lower Body',
      date: '2026-03-12',
      status: 'completed',
      startedAt: Date.parse('2026-03-12T09:00:00.000Z'),
      completedAt: Date.parse('2026-03-12T09:35:00.000Z'),
    });
    seedWorkoutSession({
      id: 'session-late',
      userId: 'user-1',
      name: 'Lower Body PM',
      date: '2026-03-12',
      status: 'completed',
      startedAt: Date.parse('2026-03-12T17:00:00.000Z'),
      completedAt: Date.parse('2026-03-12T17:42:00.000Z'),
    });

    seedSessionSet({
      id: 'set-early',
      sessionId: 'session-early',
      exerciseId: 'global-squat',
      setNumber: 1,
      weight: 225,
      reps: 5,
    });
    seedSessionSet({
      id: 'set-late',
      sessionId: 'session-late',
      exerciseId: 'global-squat',
      setNumber: 1,
      weight: 235,
      reps: 4,
    });

    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/exercises/global-squat/last-performance',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        sessionId: 'session-late',
        date: '2026-03-12',
        sets: [
          {
            setNumber: 1,
            weight: 235,
            reps: 4,
          },
        ],
      },
    });
  });

  it('returns exact and related history when includeRelated=true', async () => {
    seedExercise({
      id: 'flat-bench',
      userId: 'user-1',
      name: 'Flat Bench Press',
      muscleGroups: ['chest'],
      equipment: 'barbell',
      category: 'compound',
      relatedExerciseIds: ['incline-bench', 'db-bench'],
    });
    seedExercise({
      id: 'incline-bench',
      userId: 'user-1',
      name: 'Incline Bench Press',
      muscleGroups: ['chest'],
      equipment: 'barbell',
      category: 'compound',
    });
    seedExercise({
      id: 'db-bench',
      userId: 'user-1',
      name: 'Dumbbell Bench Press',
      muscleGroups: ['chest'],
      equipment: 'dumbbell',
      category: 'compound',
    });

    seedWorkoutSession({
      id: 'session-flat',
      userId: 'user-1',
      name: 'Push Day',
      date: '2026-03-10',
      status: 'completed',
      startedAt: 1_700_000_000_000,
      completedAt: 1_700_000_003_000,
    });
    seedWorkoutSession({
      id: 'session-incline',
      userId: 'user-1',
      name: 'Push Day 2',
      date: '2026-03-11',
      status: 'completed',
      startedAt: 1_700_000_010_000,
      completedAt: 1_700_000_015_000,
    });

    seedSessionSet({
      id: 'set-flat-1',
      sessionId: 'session-flat',
      exerciseId: 'flat-bench',
      setNumber: 1,
      weight: 205,
      reps: 5,
    });
    seedSessionSet({
      id: 'set-incline-1',
      sessionId: 'session-incline',
      exerciseId: 'incline-bench',
      setNumber: 1,
      weight: 185,
      reps: 6,
    });

    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/exercises/flat-bench/last-performance?includeRelated=true',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        history: {
          sessionId: 'session-flat',
          date: '2026-03-10',
          sets: [
            {
              setNumber: 1,
              weight: 205,
              reps: 5,
            },
          ],
        },
        related: [
          {
            exerciseId: 'incline-bench',
            exerciseName: 'Incline Bench Press',
            trackingType: 'weight_reps',
            history: {
              sessionId: 'session-incline',
              date: '2026-03-11',
              sets: [
                {
                  setNumber: 1,
                  weight: 185,
                  reps: 6,
                },
              ],
            },
          },
          {
            exerciseId: 'db-bench',
            exerciseName: 'Dumbbell Bench Press',
            trackingType: 'weight_reps',
            history: null,
          },
        ],
      },
    });
  });

  it('excludes soft-deleted related exercises from includeRelated history results', async () => {
    seedExercise({
      id: 'flat-bench',
      userId: 'user-1',
      name: 'Flat Bench Press',
      muscleGroups: ['chest'],
      equipment: 'barbell',
      category: 'compound',
      relatedExerciseIds: ['incline-bench'],
    });
    seedExercise({
      id: 'incline-bench',
      userId: 'user-1',
      name: 'Incline Bench Press',
      muscleGroups: ['chest'],
      equipment: 'barbell',
      category: 'compound',
    });
    context.db
      .update(exercises)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(exercises.id, 'incline-bench'))
      .run();

    const authToken = context.app.jwt.sign({ userId: 'user-1' });
    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/exercises/flat-bench/last-performance?includeRelated=true',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        history: null,
        related: [],
      },
    });
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
        tags: ['rehab', 'core'],
        formCues: ['chest up', 'drive through heels'],
        instructions: ' Pull elbow toward hip. ',
        coachingNotes: ' Keep torso stable and avoid shrugging. ',
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
        tags: string[];
        formCues: string[];
        instructions: string | null;
        coachingNotes: string | null;
        relatedExerciseIds: string[];
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
      tags: ['rehab', 'core'],
      formCues: ['chest up', 'drive through heels'],
      instructions: 'Pull elbow toward hip.',
      coachingNotes: 'Keep torso stable and avoid shrugging.',
      relatedExerciseIds: [],
    });
    expect(payload.data.id).toBeTruthy();
    expect(payload.data.createdAt).toBeTypeOf('number');
    expect(payload.data.updatedAt).toBeTypeOf('number');

    const storedExercise = context.db
      .select({
        tags: exercises.tags,
        formCues: exercises.formCues,
        coachingNotes: exercises.coachingNotes,
        relatedExerciseIds: exercises.relatedExerciseIds,
      })
      .from(exercises)
      .where(eq(exercises.id, payload.data.id))
      .get();
    expect(storedExercise).toEqual({
      tags: ['rehab', 'core'],
      formCues: ['chest up', 'drive through heels'],
      coachingNotes: 'Keep torso stable and avoid shrugging.',
      relatedExerciseIds: [],
    });
  });

  it('defaults tags and formCues to empty arrays when omitted', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/exercises',
      headers: createAuthorizationHeader(authToken),
      payload: {
        name: 'Goblet Squat',
        muscleGroups: ['quads', 'glutes'],
        equipment: 'dumbbell',
        category: 'compound',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        name: 'Goblet Squat',
        tags: [],
        formCues: [],
        coachingNotes: null,
        relatedExerciseIds: [],
      }),
    });
  });

  it('creates an exercise with relatedExerciseIds and rejects non-owned references', async () => {
    seedExercise({
      id: 'owned-reference',
      userId: 'user-1',
      name: 'Flat Bench Press',
      muscleGroups: ['chest'],
      equipment: 'barbell',
      category: 'compound',
    });
    seedExercise({
      id: 'other-user-reference',
      userId: 'user-2',
      name: 'Private Press',
      muscleGroups: ['chest'],
      equipment: 'machine',
      category: 'compound',
    });

    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    const validResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/exercises',
      headers: createAuthorizationHeader(authToken),
      payload: {
        name: 'Incline Bench Press',
        muscleGroups: ['chest'],
        equipment: 'barbell',
        category: 'compound',
        relatedExerciseIds: ['owned-reference'],
      },
    });

    expect(validResponse.statusCode).toBe(201);
    expect(validResponse.json()).toEqual({
      data: expect.objectContaining({
        name: 'Incline Bench Press',
        relatedExerciseIds: ['owned-reference'],
      }),
    });

    const invalidResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/exercises',
      headers: createAuthorizationHeader(authToken),
      payload: {
        name: 'Decline Bench Press',
        muscleGroups: ['chest'],
        equipment: 'barbell',
        category: 'compound',
        relatedExerciseIds: ['other-user-reference'],
      },
    });

    expect(invalidResponse.statusCode).toBe(400);
    expect(invalidResponse.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'relatedExerciseIds must reference existing user-owned exercises',
      },
    });
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

    const [searchResponse, filterResponse, filtersResponse, pagedResponse] = await Promise.all([
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
        url: '/api/v1/exercises/filters',
        headers: createAuthorizationHeader(authToken),
      }),
      context.app.inject({
        method: 'GET',
        url: '/api/v1/exercises?page=1&limit=2',
        headers: createAuthorizationHeader(authToken),
      }),
    ]);

    expect(searchResponse.statusCode).toBe(200);
    expect(searchResponse.headers['cache-control']).toBe('private, no-cache');
    expect(searchResponse.json()).toEqual({
      data: [
        expect.objectContaining({
          id: 'user-press',
          name: 'Cable Press Around',
          tags: [],
          formCues: [],
        }),
        expect.objectContaining({
          id: 'global-press',
          name: 'Incline Press',
          tags: [],
          formCues: [],
        }),
      ],
      meta: {
        page: 1,
        limit: 20,
        total: 2,
      },
    });

    expect(filterResponse.statusCode).toBe(200);
    expect(filterResponse.headers['cache-control']).toBe('private, no-cache');
    expect(filterResponse.json()).toEqual({
      data: [expect.objectContaining({ id: 'user-row', name: 'Chest Supported Row' })],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
      },
    });

    expect(filtersResponse.statusCode).toBe(200);
    expect(filtersResponse.headers['cache-control']).toBe('private, no-cache');
    expect(filtersResponse.json()).toEqual({
      data: {
        muscleGroups: ['chest', 'lats', 'triceps', 'upper back'],
        equipment: ['barbell', 'cable machine', 'machine'],
      },
    });

    expect(pagedResponse.statusCode).toBe(200);
    expect(pagedResponse.headers['cache-control']).toBe('private, no-cache');
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

  it('includes soft-deleted user exercises when they are referenced by workout history', async () => {
    seedExercise({
      id: 'active-owned',
      userId: 'user-1',
      name: 'Active Owned',
      muscleGroups: ['quads'],
      equipment: 'barbell',
      category: 'compound',
    });
    seedExercise({
      id: 'deleted-used',
      userId: 'user-1',
      name: 'Deleted But Used',
      muscleGroups: ['hamstrings'],
      equipment: 'machine',
      category: 'isolation',
    });
    seedExercise({
      id: 'deleted-unused',
      userId: 'user-1',
      name: 'Deleted Unused',
      muscleGroups: ['calves'],
      equipment: 'machine',
      category: 'isolation',
    });

    context.db
      .update(exercises)
      .set({ deletedAt: '2026-03-01T00:00:00.000Z' })
      .where(eq(exercises.id, 'deleted-used'))
      .run();
    context.db
      .update(exercises)
      .set({ deletedAt: '2026-03-01T00:00:00.000Z' })
      .where(eq(exercises.id, 'deleted-unused'))
      .run();

    seedWorkoutSession({
      id: 'history-session',
      userId: 'user-1',
      name: 'Lower',
      date: '2026-03-10',
      status: 'completed',
      startedAt: 1_700_000_100_000,
      completedAt: 1_700_000_120_000,
    });
    seedSessionSet({
      id: 'history-set',
      sessionId: 'history-session',
      exerciseId: 'deleted-used',
      setNumber: 1,
      weight: 100,
      reps: 10,
    });

    const authToken = context.app.jwt.sign({ userId: 'user-1' });
    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/exercises?page=1&limit=20',
      headers: createAuthorizationHeader(authToken),
    });
    const filtersResponse = await context.app.inject({
      method: 'GET',
      url: '/api/v1/exercises/filters',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [
        expect.objectContaining({ id: 'active-owned' }),
        expect.objectContaining({ id: 'deleted-used' }),
      ],
      meta: {
        page: 1,
        limit: 20,
        total: 2,
      },
    });

    expect(filtersResponse.statusCode).toBe(200);
    expect(filtersResponse.json()).toEqual({
      data: {
        muscleGroups: ['hamstrings', 'quads'],
        equipment: ['barbell', 'machine'],
      },
    });
  });

  it('excludes soft-deleted exercises referenced only by deleted sessions or templates', async () => {
    seedExercise({
      id: 'deleted-session-only',
      userId: 'user-1',
      name: 'Deleted Session Only',
      muscleGroups: ['hamstrings'],
      equipment: 'machine',
      category: 'isolation',
    });
    seedExercise({
      id: 'deleted-template-only',
      userId: 'user-1',
      name: 'Deleted Template Only',
      muscleGroups: ['glutes'],
      equipment: 'cable',
      category: 'isolation',
    });

    context.db
      .update(exercises)
      .set({ deletedAt: '2026-03-01T00:00:00.000Z' })
      .where(eq(exercises.id, 'deleted-session-only'))
      .run();
    context.db
      .update(exercises)
      .set({ deletedAt: '2026-03-01T00:00:00.000Z' })
      .where(eq(exercises.id, 'deleted-template-only'))
      .run();

    seedWorkoutSession({
      id: 'deleted-history-session',
      userId: 'user-1',
      name: 'Deleted Session',
      date: '2026-03-10',
      status: 'completed',
      startedAt: 1_700_000_100_000,
      completedAt: 1_700_000_120_000,
    });
    seedSessionSet({
      id: 'deleted-history-set',
      sessionId: 'deleted-history-session',
      exerciseId: 'deleted-session-only',
      setNumber: 1,
      weight: 100,
      reps: 10,
    });
    context.db
      .update(workoutSessions)
      .set({ deletedAt: '2026-03-12T00:00:00.000Z' })
      .where(eq(workoutSessions.id, 'deleted-history-session'))
      .run();

    context.db
      .insert(workoutTemplates)
      .values({
        id: 'deleted-template',
        userId: 'user-1',
        name: 'Deleted Template',
        description: null,
        tags: [],
      })
      .run();
    context.db
      .insert(templateExercises)
      .values({
        id: 'deleted-template-exercise',
        templateId: 'deleted-template',
        exerciseId: 'deleted-template-only',
        orderIndex: 0,
        section: 'main',
      })
      .run();
    context.db
      .update(workoutTemplates)
      .set({ deletedAt: '2026-03-12T00:00:00.000Z' })
      .where(eq(workoutTemplates.id, 'deleted-template'))
      .run();

    const authToken = context.app.jwt.sign({ userId: 'user-1' });
    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/exercises?page=1&limit=20',
      headers: createAuthorizationHeader(authToken),
    });
    const filtersResponse = await context.app.inject({
      method: 'GET',
      url: '/api/v1/exercises/filters',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [],
      meta: {
        page: 1,
        limit: 20,
        total: 0,
      },
    });

    expect(filtersResponse.statusCode).toBe(200);
    expect(filtersResponse.json()).toEqual({
      data: {
        muscleGroups: [],
        equipment: [],
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
      method: 'PATCH',
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
      method: 'PATCH',
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

    const putResponse = await context.app.inject({
      method: 'PUT',
      url: '/api/v1/exercises/user-exercise',
      headers: createAuthorizationHeader(authToken),
      payload: {
        name: 'Narrow-Grip Lat Pulldown',
      },
    });

    expect(putResponse.statusCode).toBe(200);
    expect(putResponse.json()).toEqual({
      data: expect.objectContaining({
        id: 'user-exercise',
        name: 'Narrow-Grip Lat Pulldown',
      }),
    });
  });

  it('updates coachingNotes and validates relatedExerciseIds on patch', async () => {
    seedExercise({
      id: 'user-exercise',
      userId: 'user-1',
      name: 'Split Squat',
      muscleGroups: ['quads', 'glutes'],
      equipment: 'dumbbell',
      category: 'compound',
    });
    seedExercise({
      id: 'owned-reference',
      userId: 'user-1',
      name: 'Goblet Squat',
      muscleGroups: ['quads'],
      equipment: 'dumbbell',
      category: 'compound',
    });
    seedExercise({
      id: 'other-user-reference',
      userId: 'user-2',
      name: 'Private Squat',
      muscleGroups: ['quads'],
      equipment: 'machine',
      category: 'compound',
    });

    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    const updateResponse = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/exercises/user-exercise',
      headers: createAuthorizationHeader(authToken),
      payload: {
        coachingNotes: 'Keep front heel planted and torso upright.',
        relatedExerciseIds: ['owned-reference'],
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toEqual({
      data: expect.objectContaining({
        id: 'user-exercise',
        coachingNotes: 'Keep front heel planted and torso upright.',
        relatedExerciseIds: ['owned-reference'],
      }),
    });

    const invalidResponse = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/exercises/user-exercise',
      headers: createAuthorizationHeader(authToken),
      payload: {
        relatedExerciseIds: ['other-user-reference'],
      },
    });

    expect(invalidResponse.statusCode).toBe(400);
    expect(invalidResponse.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'relatedExerciseIds must reference existing user-owned exercises',
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

    const remainingExercises = context.db
      .select({ id: exercises.id, deletedAt: exercises.deletedAt })
      .from(exercises)
      .orderBy(exercises.id)
      .all();
    expect(remainingExercises).toEqual([
      { id: 'global-exercise', deletedAt: null },
      { id: 'user-exercise', deletedAt: expect.any(String) },
    ]);

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

  it('agent create exercise: creates when no close dedup candidates are found', async () => {
    seedExercise({
      id: 'agent-related-owned',
      userId: 'user-1',
      name: 'Goblet Squat',
      muscleGroups: ['quads'],
      equipment: 'dumbbell',
      category: 'compound',
    });

    const authToken = seedAgentToken('user-1');

    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/exercises',
      headers: createAgentTokenHeader(authToken),
      payload: {
        name: 'Landmine Press',
        coachingNotes: 'Keep ribs down and punch through at lockout.',
        relatedExerciseIds: ['agent-related-owned'],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      data: {
        created: true,
        exercise: expect.objectContaining({
          name: 'Landmine Press',
          coachingNotes: 'Keep ribs down and punch through at lockout.',
          relatedExerciseIds: ['agent-related-owned'],
          muscleGroups: [],
          equipment: '',
        }),
      },
    });
  });

  it('agent create exercise: returns dedup candidates for an exact name match', async () => {
    seedExercise({
      id: 'existing-row',
      userId: 'user-1',
      name: 'Bench Press',
      muscleGroups: ['chest'],
      equipment: 'barbell',
      category: 'compound',
    });
    const authToken = seedAgentToken('user-1', 'plain-agent-token-2');

    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/exercises',
      headers: createAgentTokenHeader(authToken),
      payload: {
        name: 'Bench Press',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        created: false,
        candidates: [
          {
            id: 'existing-row',
            name: 'Bench Press',
            similarity: 1,
          },
        ],
      },
    });
  });

  it('agent create exercise: returns dedup candidates for close typo matches', async () => {
    seedExercise({
      id: 'existing-bench',
      userId: 'user-1',
      name: 'Bench Press',
      muscleGroups: ['chest'],
      equipment: 'barbell',
      category: 'compound',
    });
    const authToken = seedAgentToken('user-1', 'plain-agent-token-3');

    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/exercises',
      headers: createAgentTokenHeader(authToken),
      payload: {
        name: 'Benchpress',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      data: {
        created: false;
        candidates: Array<{ id: string; name: string; similarity: number }>;
      };
    };
    expect(body.data.created).toBe(false);
    expect(body.data.candidates[0]?.id).toBe('existing-bench');
    expect(body.data.candidates[0]?.name).toBe('Bench Press');
    expect(body.data.candidates[0]?.similarity ?? 0).toBeGreaterThanOrEqual(0.5);
  });

  it('agent create exercise: force=true bypasses dedup and still creates', async () => {
    seedExercise({
      id: 'existing-row',
      userId: 'user-1',
      name: 'Bench Press',
      muscleGroups: ['chest'],
      equipment: 'barbell',
      category: 'compound',
    });
    const authToken = seedAgentToken('user-1', 'plain-agent-token-4');

    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/exercises',
      headers: createAgentTokenHeader(authToken),
      payload: {
        name: 'Bench Press',
        force: true,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      data: {
        created: true,
        exercise: expect.objectContaining({
          name: 'Bench Press',
        }),
      },
    });
    expect(context.db.select({ id: exercises.id }).from(exercises).all()).toHaveLength(2);
  });

  it('agent template creation returns newExercises and creates empty metadata for unknown exercises', async () => {
    seedExercise({
      id: 'similar-global',
      userId: null,
      name: 'Bench Press',
      muscleGroups: ['chest'],
      equipment: 'barbell',
      category: 'compound',
    });
    const authToken = seedAgentToken('user-1', 'plain-agent-token-5');

    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-templates',
      headers: createAgentTokenHeader(authToken),
      payload: {
        name: 'Push Day',
        sections: [
          {
            name: 'Main',
            exercises: [{ name: 'Incline Bench Press', sets: 3, reps: 8 }],
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      data: {
        template: expect.objectContaining({
          name: 'Push Day',
        }),
        newExercises: [
          {
            id: expect.any(String),
            name: 'Incline Bench Press',
            possibleDuplicates: ['similar-global'],
          },
        ],
      },
    });

    const created = context.db
      .select({
        name: exercises.name,
        muscleGroups: exercises.muscleGroups,
        equipment: exercises.equipment,
        instructions: exercises.instructions,
      })
      .from(exercises)
      .where(eq(exercises.name, 'Incline Bench Press'))
      .get();

    expect(created).toEqual({
      name: 'Incline Bench Press',
      muscleGroups: [],
      equipment: '',
      instructions: null,
    });
  });

  it('agent patch exercise metadata updates enrichment fields', async () => {
    seedExercise({
      id: 'to-enrich',
      userId: 'user-1',
      name: 'Cable Fly',
      muscleGroups: [],
      equipment: '',
      category: 'compound',
      instructions: null,
    });
    seedExercise({
      id: 'related-owned',
      userId: 'user-1',
      name: 'Dumbbell Fly',
      muscleGroups: ['chest'],
      equipment: 'dumbbell',
      category: 'isolation',
    });
    const authToken = seedAgentToken('user-1', 'plain-agent-token-6');

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/exercises/to-enrich',
      headers: createAgentTokenHeader(authToken),
      payload: {
        category: 'isolation',
        trackingType: 'reps_only',
        muscleGroups: ['Chest'],
        equipment: 'Cable',
        instructions: 'Control the eccentric.',
        coachingNotes: 'Keep your shoulders pinned down.',
        relatedExerciseIds: ['related-owned'],
        formCues: ['slight elbow bend'],
        tags: ['hypertrophy'],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: 'to-enrich',
        category: 'isolation',
        trackingType: 'reps_only',
        muscleGroups: ['Chest'],
        equipment: 'Cable',
        instructions: 'Control the eccentric.',
        coachingNotes: 'Keep your shoulders pinned down.',
        relatedExerciseIds: ['related-owned'],
        formCues: ['slight elbow bend'],
        tags: ['hypertrophy'],
      }),
    });
  });

  it('agent exercise search excludes soft-deleted user exercises', async () => {
    context.db
      .insert(exercises)
      .values({
        id: 'active-owned',
        userId: 'user-1',
        name: 'Cable Curl',
        muscleGroups: ['biceps'],
        equipment: 'cable',
        category: 'isolation',
        tags: [],
        formCues: [],
        instructions: null,
      })
      .run();
    context.db
      .insert(exercises)
      .values({
        id: 'deleted-owned',
        userId: 'user-1',
        name: 'Cable Curl Old',
        muscleGroups: ['biceps'],
        equipment: 'cable',
        category: 'isolation',
        tags: [],
        formCues: [],
        instructions: null,
        deletedAt: new Date().toISOString(),
      })
      .run();

    const authToken = seedAgentToken('user-1', 'plain-agent-token-7');

    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/exercises?q=cable%20curl&limit=10',
      headers: createAgentTokenHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [
        expect.objectContaining({
          id: 'active-owned',
          name: 'Cable Curl',
        }),
      ],
    });
  });
});
