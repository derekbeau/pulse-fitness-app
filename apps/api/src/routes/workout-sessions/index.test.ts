import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  exercises,
  scheduledWorkouts,
  serializeWorkoutSessionFeedback,
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

const seedTemplate = (values: {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  tags?: string[];
}) =>
  context.db
    .insert(workoutTemplates)
    .values({
      ...values,
      description: values.description ?? null,
      tags: values.tags ?? [],
    })
    .run();

const seedExercise = (values: {
  id: string;
  userId?: string | null;
  name: string;
  category?: 'compound' | 'isolation' | 'cardio' | 'mobility';
}) =>
  context.db
    .insert(exercises)
    .values({
      id: values.id,
      userId: values.userId ?? null,
      name: values.name,
      muscleGroups: ['chest'],
      equipment: 'barbell',
      category: values.category ?? 'compound',
      instructions: null,
    })
    .run();

const seedWorkoutSession = (values: {
  id: string;
  userId: string;
  templateId?: string | null;
  name: string;
  date: string;
  status?: 'scheduled' | 'in-progress' | 'completed';
  startedAt: number;
  completedAt?: number | null;
  duration?: number | null;
  feedback?: {
    energy: 1 | 2 | 3 | 4 | 5;
    recovery: 1 | 2 | 3 | 4 | 5;
    technique: 1 | 2 | 3 | 4 | 5;
    notes?: string;
  } | null;
  notes?: string | null;
}) =>
  context.db
    .insert(workoutSessions)
    .values({
      id: values.id,
      userId: values.userId,
      templateId: values.templateId ?? null,
      name: values.name,
      date: values.date,
      status: values.status ?? 'in-progress',
      startedAt: values.startedAt,
      completedAt: values.completedAt ?? null,
      duration: values.duration ?? null,
      feedback: serializeWorkoutSessionFeedback(values.feedback ?? null),
      notes: values.notes ?? null,
    })
    .run();

const seedSessionSet = (values: {
  id: string;
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  weight?: number | null;
  reps?: number | null;
  completed?: boolean;
  skipped?: boolean;
  section?: 'warmup' | 'main' | 'cooldown' | null;
  notes?: string | null;
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
      completed: values.completed ?? false,
      skipped: values.skipped ?? false,
      section: values.section ?? null,
      notes: values.notes ?? null,
    })
    .run();

const seedScheduledWorkout = (values: {
  id: string;
  userId: string;
  templateId?: string | null;
  date: string;
  sessionId?: string | null;
}) =>
  context.db
    .insert(scheduledWorkouts)
    .values({
      id: values.id,
      userId: values.userId,
      templateId: values.templateId ?? null,
      date: values.date,
      sessionId: values.sessionId ?? null,
    })
    .run();

describe('workout session routes', () => {
  beforeAll(async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-workout-session-routes-'));

    process.env.JWT_SECRET = 'test-workout-session-secret';
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
    context.db.delete(scheduledWorkouts).run();
    context.db.delete(sessionSets).run();
    context.db.delete(workoutSessions).run();
    context.db.delete(workoutTemplates).run();
    context.db.delete(exercises).run();
    context.db.delete(users).run();

    seedUser('user-1', 'derek');
    seedUser('user-2', 'alex');

    seedTemplate({
      id: 'template-1',
      userId: 'user-1',
      name: 'Upper Push',
    });
    seedTemplate({
      id: 'template-2',
      userId: 'user-1',
      name: 'Lower Body',
    });
    seedTemplate({
      id: 'template-3',
      userId: 'user-2',
      name: 'Private Other User Template',
    });

    seedExercise({
      id: 'global-bench-press',
      name: 'Bench Press',
    });
    seedExercise({
      id: 'user-1-lat-pulldown',
      userId: 'user-1',
      name: 'Lat Pulldown',
    });
    seedExercise({
      id: 'user-2-private-row',
      userId: 'user-2',
      name: 'Private Row',
    });
  });

  it('requires auth for workout session and session-set routes', async () => {
    const responses = await Promise.all([
      context.app.inject({
        method: 'POST',
        url: '/api/v1/workout-sessions',
        payload: {
          name: 'Upper Push',
          date: '2026-03-12',
          startedAt: 1000,
        },
      }),
      context.app.inject({
        method: 'GET',
        url: '/api/v1/workout-sessions?from=2026-03-10&to=2026-03-16',
      }),
      context.app.inject({
        method: 'GET',
        url: '/api/v1/workout-sessions/session-1',
      }),
      context.app.inject({
        method: 'PUT',
        url: '/api/v1/workout-sessions/session-1',
        payload: {
          notes: 'Felt solid',
        },
      }),
      context.app.inject({
        method: 'DELETE',
        url: '/api/v1/workout-sessions/session-1',
      }),
      context.app.inject({
        method: 'POST',
        url: '/api/v1/workout-sessions/session-1/sets',
        payload: {
          exerciseId: 'global-bench-press',
          setNumber: 1,
        },
      }),
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/workout-sessions/session-1/sets/set-1',
        payload: {
          reps: 10,
        },
      }),
      context.app.inject({
        method: 'GET',
        url: '/api/v1/workout-sessions/session-1/sets',
      }),
      context.app.inject({
        method: 'PUT',
        url: '/api/v1/workout-sessions/session-1/sets',
        payload: {
          sets: [],
        },
      }),
      context.app.inject({
        method: 'POST',
        url: '/api/v1/workout-sessions/session-1/save-as-template',
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

  it('saves a completed session as a template and allows duplicate saves', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    seedWorkoutSession({
      id: 'session-completed',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Completed Upper Push',
      date: '2026-03-12',
      status: 'completed',
      startedAt: 1_700_000_000_000,
      completedAt: 1_700_000_003_000,
      duration: 50,
    });
    seedWorkoutSession({
      id: 'session-in-progress',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'In Progress Upper Push',
      date: '2026-03-13',
      status: 'in-progress',
      startedAt: 1_700_000_100_000,
    });
    seedWorkoutSession({
      id: 'other-user-session',
      userId: 'user-2',
      templateId: 'template-3',
      name: 'Private Session',
      date: '2026-03-13',
      status: 'completed',
      startedAt: 1_700_000_100_000,
      completedAt: 1_700_000_103_000,
    });

    seedSessionSet({
      id: 'set-warmup-1',
      sessionId: 'session-completed',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      section: 'warmup',
      reps: 10,
    });
    seedSessionSet({
      id: 'set-main-1',
      sessionId: 'session-completed',
      exerciseId: 'user-1-lat-pulldown',
      setNumber: 1,
      section: 'main',
      reps: 10,
      weight: 140,
    });
    seedSessionSet({
      id: 'set-main-2',
      sessionId: 'session-completed',
      exerciseId: 'user-1-lat-pulldown',
      setNumber: 2,
      section: 'main',
      reps: 9,
      weight: 145,
    });
    seedSessionSet({
      id: 'set-cooldown-1',
      sessionId: 'session-completed',
      exerciseId: 'global-bench-press',
      setNumber: 2,
      section: 'cooldown',
      reps: 8,
    });

    const [firstSaveResponse, secondSaveResponse] = await Promise.all([
      context.app.inject({
        method: 'POST',
        url: '/api/v1/workout-sessions/session-completed/save-as-template',
        headers: createAuthorizationHeader(authToken),
      }),
      context.app.inject({
        method: 'POST',
        url: '/api/v1/workout-sessions/session-completed/save-as-template',
        headers: createAuthorizationHeader(authToken),
      }),
    ]);

    expect(firstSaveResponse.statusCode).toBe(201);
    expect(secondSaveResponse.statusCode).toBe(201);

    const firstPayload = firstSaveResponse.json() as { data: { id: string; name: string } };
    const secondPayload = secondSaveResponse.json() as { data: { id: string; name: string } };

    expect(firstPayload.data.id).not.toBe(secondPayload.data.id);
    expect(firstPayload.data.name).toBe('Completed Upper Push');
    expect(secondPayload.data.name).toBe('Completed Upper Push');

    const persistedTemplates = context.db
      .select({
        id: workoutTemplates.id,
        name: workoutTemplates.name,
      })
      .from(workoutTemplates)
      .where(eq(workoutTemplates.name, 'Completed Upper Push'))
      .all();

    expect(persistedTemplates).toHaveLength(2);

    const firstTemplateExercises = context.db
      .select({
        exerciseId: templateExercises.exerciseId,
        orderIndex: templateExercises.orderIndex,
        section: templateExercises.section,
        sets: templateExercises.sets,
      })
      .from(templateExercises)
      .where(eq(templateExercises.templateId, firstPayload.data.id))
      .all();

    const sortedTemplateExercises = [...firstTemplateExercises].sort((left, right) => {
      const sectionOrder = {
        warmup: 0,
        main: 1,
        cooldown: 2,
      };

      const leftSection = sectionOrder[left.section];
      const rightSection = sectionOrder[right.section];
      if (leftSection !== rightSection) {
        return leftSection - rightSection;
      }

      return left.orderIndex - right.orderIndex;
    });

    expect(sortedTemplateExercises).toEqual([
      {
        exerciseId: 'global-bench-press',
        orderIndex: 0,
        section: 'warmup',
        sets: 1,
      },
      {
        exerciseId: 'user-1-lat-pulldown',
        orderIndex: 0,
        section: 'main',
        sets: 2,
      },
      {
        exerciseId: 'global-bench-press',
        orderIndex: 0,
        section: 'cooldown',
        sets: 2,
      },
    ]);

    const inProgressResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions/session-in-progress/save-as-template',
      headers: createAuthorizationHeader(authToken),
    });

    expect(inProgressResponse.statusCode).toBe(409);
    expect(inProgressResponse.json()).toEqual({
      error: {
        code: 'WORKOUT_SESSION_NOT_COMPLETED',
        message: 'Workout session must be completed before saving as template',
      },
    });

    const otherUserResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions/other-user-session/save-as-template',
      headers: createAuthorizationHeader(authToken),
    });

    expect(otherUserResponse.statusCode).toBe(404);
    expect(otherUserResponse.json()).toEqual({
      error: {
        code: 'WORKOUT_SESSION_NOT_FOUND',
        message: 'Workout session not found',
      },
    });
  });

  it('applies save-as-template metadata overrides when provided', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    seedWorkoutSession({
      id: 'session-completed-overrides',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Completed Upper Push',
      date: '2026-03-12',
      status: 'completed',
      startedAt: 1_700_000_000_000,
      completedAt: 1_700_000_003_000,
      duration: 50,
    });

    seedSessionSet({
      id: 'set-main-1',
      sessionId: 'session-completed-overrides',
      exerciseId: 'user-1-lat-pulldown',
      setNumber: 1,
      section: 'main',
      reps: 10,
      weight: 140,
    });

    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions/session-completed-overrides/save-as-template',
      headers: createAuthorizationHeader(authToken),
      payload: {
        name: ' Upper Push Snapshot ',
        description: '  Heavy pressing focus ',
        tags: [' strength ', ' push '],
      },
    });

    expect(response.statusCode).toBe(201);

    const payload = response.json() as {
      data: { id: string; name: string; description: string | null; tags: string[] };
    };
    expect(payload.data.name).toBe('Upper Push Snapshot');
    expect(payload.data.description).toBe('Heavy pressing focus');
    expect(payload.data.tags).toEqual(['strength', 'push']);

    const persistedTemplate = context.db
      .select({
        id: workoutTemplates.id,
        name: workoutTemplates.name,
        description: workoutTemplates.description,
        tags: workoutTemplates.tags,
      })
      .from(workoutTemplates)
      .where(eq(workoutTemplates.id, payload.data.id))
      .get();

    expect(persistedTemplate).toEqual({
      id: payload.data.id,
      name: 'Upper Push Snapshot',
      description: 'Heavy pressing focus',
      tags: ['strength', 'push'],
    });
  });

  it('returns a validation error for invalid save-as-template payload', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions/session-1/save-as-template',
      headers: createAuthorizationHeader(authToken),
      payload: {
        name: '   ',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid save as template payload',
      },
    });
  });

  it('creates, updates, lists, and batch-upserts sets for an active owned session', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    seedWorkoutSession({
      id: 'session-1',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'in-progress',
      startedAt: 1000,
    });
    seedSessionSet({
      id: 'lat-set-2',
      sessionId: 'session-1',
      exerciseId: 'user-1-lat-pulldown',
      setNumber: 2,
      weight: 130,
      reps: 11,
      section: 'main',
    });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions/session-1/sets',
      headers: createAuthorizationHeader(authToken),
      payload: {
        exerciseId: ' global-bench-press ',
        setNumber: 1,
        weight: 185,
        reps: 8,
        section: 'main',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const createPayload = createResponse.json() as {
      data: {
        id: string;
        exerciseId: string;
        setNumber: number;
        weight: number | null;
        reps: number | null;
        completed: boolean;
        skipped: boolean;
        section: 'warmup' | 'main' | 'cooldown' | null;
        notes: string | null;
      };
    };

    expect(createPayload.data).toMatchObject({
      exerciseId: 'global-bench-press',
      setNumber: 1,
      weight: 185,
      reps: 8,
      completed: false,
      skipped: false,
      section: 'main',
      notes: null,
    });

    const patchResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/workout-sessions/session-1/sets/${createPayload.data.id}`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        reps: 9,
        completed: true,
        notes: ' Last hard rep ',
      },
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json()).toEqual({
      data: expect.objectContaining({
        id: createPayload.data.id,
        exerciseId: 'global-bench-press',
        setNumber: 1,
        weight: 185,
        reps: 9,
        completed: true,
        skipped: false,
        section: 'main',
        notes: 'Last hard rep',
      }),
    });

    const batchResponse = await context.app.inject({
      method: 'PUT',
      url: '/api/v1/workout-sessions/session-1/sets',
      headers: createAuthorizationHeader(authToken),
      payload: {
        sets: [
          {
            id: createPayload.data.id,
            exerciseId: 'global-bench-press',
            setNumber: 1,
            weight: 190,
            reps: 9,
            section: 'main',
          },
          {
            exerciseId: 'user-1-lat-pulldown',
            setNumber: 1,
            weight: 145,
            reps: 10,
            section: 'main',
          },
        ],
      },
    });

    expect(batchResponse.statusCode).toBe(200);
    expect(batchResponse.json()).toEqual({
      data: [
        {
          exerciseId: 'global-bench-press',
          sets: [
            expect.objectContaining({
              id: createPayload.data.id,
              setNumber: 1,
              weight: 190,
              reps: 9,
              completed: true,
              notes: 'Last hard rep',
            }),
          ],
        },
        {
          exerciseId: 'user-1-lat-pulldown',
          sets: [
            expect.objectContaining({
              setNumber: 1,
              weight: 145,
              reps: 10,
            }),
            expect.objectContaining({
              id: 'lat-set-2',
              setNumber: 2,
              weight: 130,
              reps: 11,
            }),
          ],
        },
      ],
    });

    const groupedResponse = await context.app.inject({
      method: 'GET',
      url: '/api/v1/workout-sessions/session-1/sets',
      headers: createAuthorizationHeader(authToken),
    });

    expect(groupedResponse.statusCode).toBe(200);
    expect(groupedResponse.json()).toEqual(batchResponse.json());
  });

  it('enforces ownership, active-session writes, and set-level validation', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    seedWorkoutSession({
      id: 'session-active',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'in-progress',
      startedAt: 1000,
    });
    seedWorkoutSession({
      id: 'session-completed',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-11',
      status: 'completed',
      startedAt: 1000,
      completedAt: 1100,
    });
    seedWorkoutSession({
      id: 'other-user-session',
      userId: 'user-2',
      templateId: 'template-3',
      name: 'Private Other User Session',
      date: '2026-03-12',
      status: 'in-progress',
      startedAt: 1000,
    });

    const [otherUserGetResponse, inactivePostResponse, invalidPatchBodyResponse] =
      await Promise.all([
        context.app.inject({
          method: 'GET',
          url: '/api/v1/workout-sessions/other-user-session/sets',
          headers: createAuthorizationHeader(authToken),
        }),
        context.app.inject({
          method: 'POST',
          url: '/api/v1/workout-sessions/session-completed/sets',
          headers: createAuthorizationHeader(authToken),
          payload: {
            exerciseId: 'global-bench-press',
            setNumber: 1,
          },
        }),
        context.app.inject({
          method: 'PATCH',
          url: '/api/v1/workout-sessions/session-active/sets/set-missing',
          headers: createAuthorizationHeader(authToken),
          payload: {},
        }),
      ]);

    expect(otherUserGetResponse.statusCode).toBe(404);
    expect(otherUserGetResponse.json()).toEqual({
      error: {
        code: 'WORKOUT_SESSION_NOT_FOUND',
        message: 'Workout session not found',
      },
    });

    expect(inactivePostResponse.statusCode).toBe(409);
    expect(inactivePostResponse.json()).toEqual({
      error: {
        code: 'WORKOUT_SESSION_NOT_ACTIVE',
        message: 'Workout session is not active',
      },
    });

    expect(invalidPatchBodyResponse.statusCode).toBe(400);
    expect(invalidPatchBodyResponse.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid session set payload',
      },
    });

    const inaccessibleExerciseResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions/session-active/sets',
      headers: createAuthorizationHeader(authToken),
      payload: {
        exerciseId: 'user-2-private-row',
        setNumber: 1,
      },
    });

    expect(inaccessibleExerciseResponse.statusCode).toBe(400);
    expect(inaccessibleExerciseResponse.json()).toEqual({
      error: {
        code: 'INVALID_SESSION_EXERCISE',
        message: 'Session references one or more unavailable exercises',
      },
    });

    const missingSetResponse = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-active/sets/set-missing',
      headers: createAuthorizationHeader(authToken),
      payload: {
        reps: 10,
      },
    });

    expect(missingSetResponse.statusCode).toBe(404);
    expect(missingSetResponse.json()).toEqual({
      error: {
        code: 'SESSION_SET_NOT_FOUND',
        message: 'Session set not found',
      },
    });
  });

  it('batch upsert is atomic when one set id is invalid', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    seedWorkoutSession({
      id: 'session-1',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'in-progress',
      startedAt: 1000,
    });
    seedSessionSet({
      id: 'set-1',
      sessionId: 'session-1',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      weight: 185,
      reps: 8,
      section: 'main',
    });

    const response = await context.app.inject({
      method: 'PUT',
      url: '/api/v1/workout-sessions/session-1/sets',
      headers: createAuthorizationHeader(authToken),
      payload: {
        sets: [
          {
            id: 'set-1',
            exerciseId: 'global-bench-press',
            setNumber: 1,
            weight: 205,
            reps: 6,
            section: 'main',
          },
          {
            id: 'missing-set',
            exerciseId: 'global-bench-press',
            setNumber: 2,
            weight: 195,
            reps: 7,
            section: 'main',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: 'SESSION_SET_NOT_FOUND',
        message: 'Session set not found',
      },
    });

    const persistedSet = context.db
      .select({
        weight: sessionSets.weight,
        reps: sessionSets.reps,
      })
      .from(sessionSets)
      .where(eq(sessionSets.id, 'set-1'))
      .get();

    expect(persistedSet).toEqual({
      weight: 185,
      reps: 8,
    });
  });

  it('creates, lists, and fetches workout sessions for the authenticated user', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    seedWorkoutSession({
      id: 'existing-session',
      userId: 'user-1',
      templateId: 'template-2',
      name: 'Lower Body',
      date: '2026-03-11',
      status: 'completed',
      startedAt: 1_700_000_000_000,
      completedAt: 1_700_000_002_700,
      duration: 45,
    });
    seedWorkoutSession({
      id: 'other-user-session',
      userId: 'user-2',
      templateId: 'template-3',
      name: 'Private Other User Session',
      date: '2026-03-12',
      startedAt: 1_700_000_001_000,
    });
    seedWorkoutSession({
      id: 'outside-range-session',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Outside Range',
      date: '2026-03-25',
      startedAt: 1_700_000_005_000,
    });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: ' template-1 ',
        name: ' Upper Push ',
        date: '2026-03-12',
        status: 'completed',
        startedAt: 1_700_000_100_000,
        completedAt: 1_700_000_103_000,
        duration: 50,
        feedback: {
          energy: 4,
          recovery: 3,
          technique: 5,
          notes: ' Locked in ',
        },
        notes: ' Great pressing day ',
        sets: [
          {
            exerciseId: 'global-bench-press',
            setNumber: 1,
            weight: 185,
            reps: 8,
            completed: true,
            section: 'main',
            notes: ' Fast bar path ',
          },
          {
            exerciseId: 'user-1-lat-pulldown',
            setNumber: 1,
            weight: 140,
            reps: 10,
            completed: true,
            section: 'main',
          },
        ],
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const createdPayload = createResponse.json() as {
      data: {
        id: string;
        userId: string;
        templateId: string | null;
        name: string;
        date: string;
        status: string;
        startedAt: number;
        completedAt: number | null;
        duration: number | null;
        feedback: {
          energy: number;
          recovery: number;
          technique: number;
          notes?: string;
        } | null;
        notes: string | null;
        sets: Array<{
          id: string;
          exerciseId: string;
          setNumber: number;
          weight: number | null;
          reps: number | null;
          completed: boolean;
          skipped: boolean;
          section: string | null;
          notes: string | null;
          createdAt: number;
        }>;
        createdAt: number;
        updatedAt: number;
      };
    };

    expect(createdPayload.data).toMatchObject({
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'completed',
      startedAt: 1_700_000_100_000,
      completedAt: 1_700_000_103_000,
      duration: 50,
      feedback: {
        energy: 4,
        recovery: 3,
        technique: 5,
        notes: 'Locked in',
      },
      notes: 'Great pressing day',
      sets: [
        expect.objectContaining({
          exerciseId: 'global-bench-press',
          setNumber: 1,
          weight: 185,
          reps: 8,
          completed: true,
          skipped: false,
          section: 'main',
          notes: 'Fast bar path',
        }),
        expect.objectContaining({
          exerciseId: 'user-1-lat-pulldown',
          setNumber: 1,
          weight: 140,
          reps: 10,
          completed: true,
          skipped: false,
          section: 'main',
          notes: null,
        }),
      ],
    });
    expect(createdPayload.data.id).toBeTruthy();
    expect(createdPayload.data.createdAt).toBeTypeOf('number');
    expect(createdPayload.data.updatedAt).toBeTypeOf('number');

    const listResponse = await context.app.inject({
      method: 'GET',
      url: '/api/v1/workout-sessions?from=2026-03-10&to=2026-03-16',
      headers: createAuthorizationHeader(authToken),
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      data: [
        {
          id: createdPayload.data.id,
          name: 'Upper Push',
          date: '2026-03-12',
          status: 'completed',
          templateId: 'template-1',
          templateName: 'Upper Push',
          startedAt: 1_700_000_100_000,
          completedAt: 1_700_000_103_000,
          duration: 50,
          exerciseCount: 2,
          createdAt: createdPayload.data.createdAt,
        },
        {
          id: 'existing-session',
          name: 'Lower Body',
          date: '2026-03-11',
          status: 'completed',
          templateId: 'template-2',
          templateName: 'Lower Body',
          startedAt: 1_700_000_000_000,
          completedAt: 1_700_000_002_700,
          duration: 45,
          exerciseCount: 0,
          createdAt: expect.any(Number),
        },
      ],
    });

    const detailResponse = await context.app.inject({
      method: 'GET',
      url: `/api/v1/workout-sessions/${createdPayload.data.id}`,
      headers: createAuthorizationHeader(authToken),
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toEqual({
      data: createdPayload.data,
    });
  });

  it('filters workout session listings by status and limit', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    seedWorkoutSession({
      id: 'session-completed-1',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-15',
      status: 'completed',
      startedAt: 1_700_100_000_000,
      completedAt: 1_700_100_003_000,
      duration: 50,
    });
    seedWorkoutSession({
      id: 'session-in-progress',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push Volume',
      date: '2026-03-14',
      status: 'in-progress',
      startedAt: 1_700_090_000_000,
    });
    seedWorkoutSession({
      id: 'session-completed-2',
      userId: 'user-1',
      templateId: 'template-2',
      name: 'Lower Body',
      date: '2026-03-13',
      status: 'completed',
      startedAt: 1_700_080_000_000,
      completedAt: 1_700_080_003_000,
      duration: 48,
    });
    seedWorkoutSession({
      id: 'session-completed-3',
      userId: 'user-1',
      templateId: 'template-2',
      name: 'Lower Body Volume',
      date: '2026-03-12',
      status: 'completed',
      startedAt: 1_700_070_000_000,
      completedAt: 1_700_070_003_000,
      duration: 45,
    });

    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/workout-sessions?status=completed&limit=2',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [
        expect.objectContaining({
          id: 'session-completed-1',
          status: 'completed',
        }),
        expect.objectContaining({
          id: 'session-completed-2',
          status: 'completed',
        }),
      ],
    });
  });

  it('updates owned workout sessions by replacing nested set rows', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    seedWorkoutSession({
      id: 'session-1',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      startedAt: 1000,
    });
    seedSessionSet({
      id: 'set-1',
      sessionId: 'session-1',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      weight: 185,
      reps: 8,
      completed: true,
      section: 'main',
    });
    seedWorkoutSession({
      id: 'session-2',
      userId: 'user-2',
      templateId: 'template-3',
      name: 'Other User Session',
      date: '2026-03-12',
      startedAt: 2000,
    });

    const response = await context.app.inject({
      method: 'PUT',
      url: '/api/v1/workout-sessions/session-1',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: 'template-2',
        status: 'completed',
        completedAt: 4000,
        duration: 50,
        feedback: {
          energy: 5,
          recovery: 4,
          technique: 4,
        },
        notes: ' Strong day ',
        sets: [
          {
            exerciseId: 'user-1-lat-pulldown',
            setNumber: 1,
            weight: 150,
            reps: 10,
            completed: true,
            section: 'main',
          },
          {
            exerciseId: 'user-1-lat-pulldown',
            setNumber: 2,
            weight: 150,
            reps: 9,
            completed: true,
            section: 'main',
            notes: ' Slowed down ',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-1',
        templateId: 'template-2',
        name: 'Upper Push',
        date: '2026-03-12',
        status: 'completed',
        startedAt: 1000,
        completedAt: 4000,
        duration: 50,
        feedback: {
          energy: 5,
          recovery: 4,
          technique: 4,
        },
        notes: 'Strong day',
        sets: [
          expect.objectContaining({
            exerciseId: 'user-1-lat-pulldown',
            setNumber: 1,
            weight: 150,
            reps: 10,
            completed: true,
            skipped: false,
            section: 'main',
            notes: null,
          }),
          expect.objectContaining({
            exerciseId: 'user-1-lat-pulldown',
            setNumber: 2,
            weight: 150,
            reps: 9,
            completed: true,
            skipped: false,
            section: 'main',
            notes: 'Slowed down',
          }),
        ],
      }),
    });

    const persistedSetRows = context.db
      .select({
        exerciseId: sessionSets.exerciseId,
        setNumber: sessionSets.setNumber,
        notes: sessionSets.notes,
      })
      .from(sessionSets)
      .where(eq(sessionSets.sessionId, 'session-1'))
      .all();

    expect(persistedSetRows).toEqual([
      {
        exerciseId: 'user-1-lat-pulldown',
        setNumber: 1,
        notes: null,
      },
      {
        exerciseId: 'user-1-lat-pulldown',
        setNumber: 2,
        notes: 'Slowed down',
      },
    ]);

    const otherUserResponse = await context.app.inject({
      method: 'PUT',
      url: '/api/v1/workout-sessions/session-2',
      headers: createAuthorizationHeader(authToken),
      payload: {
        notes: 'Nope',
      },
    });

    expect(otherUserResponse.statusCode).toBe(404);
    expect(otherUserResponse.json()).toEqual({
      error: {
        code: 'WORKOUT_SESSION_NOT_FOUND',
        message: 'Workout session not found',
      },
    });
  });

  it('patches workout session startedAt and rejects invalid, too-old, or future timestamps', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });
    const now = Date.now();

    seedWorkoutSession({
      id: 'session-1',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      startedAt: 1_000,
    });

    const validResponse = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-1',
      headers: createAuthorizationHeader(authToken),
      payload: {
        startedAt: now - 60_000,
      },
    });

    expect(validResponse.statusCode).toBe(200);
    expect(validResponse.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-1',
        startedAt: now - 60_000,
      }),
    });

    const [futureResponse, invalidResponse, tooOldResponse] = await Promise.all([
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/workout-sessions/session-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          startedAt: now + 60_000,
        },
      }),
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/workout-sessions/session-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          startedAt: Number.MAX_SAFE_INTEGER,
        },
      }),
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/workout-sessions/session-1',
        headers: createAuthorizationHeader(authToken),
        payload: {
          startedAt: 1_000,
        },
      }),
    ]);

    expect(futureResponse.statusCode).toBe(400);
    expect(futureResponse.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'startedAt cannot be in the future',
      },
    });

    expect(invalidResponse.statusCode).toBe(400);
    expect(invalidResponse.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid startedAt timestamp',
      },
    });

    expect(tooOldResponse.statusCode).toBe(400);
    expect(tooOldResponse.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid startedAt timestamp',
      },
    });
  });

  it('patches session notes and exercise notes on an existing completed session', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    seedWorkoutSession({
      id: 'session-1',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'completed',
      startedAt: 1000,
      completedAt: 4000,
      duration: 50,
      notes: 'Old summary',
    });
    seedSessionSet({
      id: 'set-1',
      sessionId: 'session-1',
      exerciseId: 'user-1-lat-pulldown',
      setNumber: 1,
      weight: 150,
      reps: 10,
      completed: true,
      section: 'main',
      notes: 'Old exercise cue',
    });
    seedSessionSet({
      id: 'set-2',
      sessionId: 'session-1',
      exerciseId: 'user-1-lat-pulldown',
      setNumber: 2,
      weight: 150,
      reps: 9,
      completed: true,
      section: 'main',
      notes: null,
    });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-1',
      headers: createAuthorizationHeader(authToken),
      payload: {
        notes: ' Better setup today ',
        exerciseNotes: {
          'user-1-lat-pulldown': ' Keep elbows tucked ',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-1',
        notes: 'Better setup today',
        sets: [
          expect.objectContaining({
            exerciseId: 'user-1-lat-pulldown',
            setNumber: 1,
            notes: 'Keep elbows tucked',
          }),
          expect.objectContaining({
            exerciseId: 'user-1-lat-pulldown',
            setNumber: 2,
            notes: null,
          }),
        ],
      }),
    });
  });

  it('deletes owned workout sessions, cascades set rows, and unlinks scheduled workouts', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    seedWorkoutSession({
      id: 'session-1',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      startedAt: 1000,
    });
    seedSessionSet({
      id: 'set-1',
      sessionId: 'session-1',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      reps: 8,
      completed: true,
    });
    seedScheduledWorkout({
      id: 'schedule-1',
      userId: 'user-1',
      templateId: 'template-1',
      date: '2026-03-12',
      sessionId: 'session-1',
    });
    seedWorkoutSession({
      id: 'session-2',
      userId: 'user-2',
      templateId: 'template-3',
      name: 'Other Session',
      date: '2026-03-12',
      startedAt: 1000,
    });

    const response = await context.app.inject({
      method: 'DELETE',
      url: '/api/v1/workout-sessions/session-1',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        success: true,
      },
    });

    expect(context.db.select().from(workoutSessions).all()).toEqual([
      expect.objectContaining({ id: 'session-2' }),
    ]);
    expect(context.db.select().from(sessionSets).all()).toEqual([]);
    expect(
      context.db
        .select({ sessionId: scheduledWorkouts.sessionId })
        .from(scheduledWorkouts)
        .where(eq(scheduledWorkouts.id, 'schedule-1'))
        .get(),
    ).toEqual({ sessionId: null });

    const otherUserResponse = await context.app.inject({
      method: 'DELETE',
      url: '/api/v1/workout-sessions/session-2',
      headers: createAuthorizationHeader(authToken),
    });

    expect(otherUserResponse.statusCode).toBe(404);
    expect(otherUserResponse.json()).toEqual({
      error: {
        code: 'WORKOUT_SESSION_NOT_FOUND',
        message: 'Workout session not found',
      },
    });
  });

  it('rejects inaccessible templates, unavailable exercises, and invalid merged updates', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    seedWorkoutSession({
      id: 'session-1',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      startedAt: 1000,
    });

    const otherUserTemplateResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: 'template-3',
        name: 'Upper Push',
        date: '2026-03-12',
        startedAt: 1000,
      },
    });

    expect(otherUserTemplateResponse.statusCode).toBe(404);
    expect(otherUserTemplateResponse.json()).toEqual({
      error: {
        code: 'WORKOUT_TEMPLATE_NOT_FOUND',
        message: 'Workout template not found',
      },
    });

    const unavailableExerciseResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions',
      headers: createAuthorizationHeader(authToken),
      payload: {
        name: 'Upper Push',
        date: '2026-03-12',
        startedAt: 1000,
        sets: [
          {
            exerciseId: 'user-2-private-row',
            setNumber: 1,
          },
        ],
      },
    });

    expect(unavailableExerciseResponse.statusCode).toBe(400);
    expect(unavailableExerciseResponse.json()).toEqual({
      error: {
        code: 'INVALID_SESSION_EXERCISE',
        message: 'Session references one or more unavailable exercises',
      },
    });

    const invalidMergedUpdateResponse = await context.app.inject({
      method: 'PUT',
      url: '/api/v1/workout-sessions/session-1',
      headers: createAuthorizationHeader(authToken),
      payload: {
        status: 'completed',
      },
    });

    expect(invalidMergedUpdateResponse.statusCode).toBe(400);
    expect(invalidMergedUpdateResponse.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid workout session payload',
      },
    });
  });

  it('rejects invalid list queries and malformed payloads', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    const [invalidRangeQueryResponse, invalidStatusQueryResponse, invalidLimitQueryResponse] =
      await Promise.all([
        context.app.inject({
          method: 'GET',
          url: '/api/v1/workout-sessions?from=2026-03-12&to=2026-03-10',
          headers: createAuthorizationHeader(authToken),
        }),
        context.app.inject({
          method: 'GET',
          url: '/api/v1/workout-sessions?status=finished',
          headers: createAuthorizationHeader(authToken),
        }),
        context.app.inject({
          method: 'GET',
          url: '/api/v1/workout-sessions?limit=0',
          headers: createAuthorizationHeader(authToken),
        }),
      ]);

    expect(invalidRangeQueryResponse.statusCode).toBe(400);
    expect(invalidRangeQueryResponse.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid workout session query',
      },
    });
    expect(invalidStatusQueryResponse.statusCode).toBe(400);
    expect(invalidStatusQueryResponse.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid workout session query',
      },
    });
    expect(invalidLimitQueryResponse.statusCode).toBe(400);
    expect(invalidLimitQueryResponse.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid workout session query',
      },
    });

    const invalidCreateResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions',
      headers: createAuthorizationHeader(authToken),
      payload: {
        name: '',
        date: '2026-03-12',
        startedAt: 1000,
      },
    });

    expect(invalidCreateResponse.statusCode).toBe(400);
    expect(invalidCreateResponse.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid workout session payload',
      },
    });

    const invalidUpdateResponse = await context.app.inject({
      method: 'PUT',
      url: '/api/v1/workout-sessions/session-1',
      headers: createAuthorizationHeader(authToken),
      payload: {},
    });

    expect(invalidUpdateResponse.statusCode).toBe(400);
    expect(invalidUpdateResponse.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid workout session payload',
      },
    });
  });
});
