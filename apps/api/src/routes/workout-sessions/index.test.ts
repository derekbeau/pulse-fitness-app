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
  scheduledWorkouts,
  serializeWorkoutSessionFeedback,
  serializeWorkoutSessionTimeSegments,
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

const expectRequestValidationError = (
  response: { json(): unknown },
  method: string,
  url: string,
) => {
  expect(response.json()).toMatchObject({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: {
        method,
        url,
      },
    },
  });
};

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
  trackingType?:
    | 'weight_reps'
    | 'weight_seconds'
    | 'bodyweight_reps'
    | 'reps_only'
    | 'reps_seconds'
    | 'seconds_only'
    | 'distance'
    | 'cardio';
  formCues?: string[];
  coachingNotes?: string | null;
  instructions?: string | null;
}) =>
  context.db
    .insert(exercises)
    .values({
      id: values.id,
      userId: values.userId ?? null,
      name: values.name,
      trackingType: values.trackingType ?? 'weight_reps',
      muscleGroups: ['chest'],
      equipment: 'barbell',
      category: values.category ?? 'compound',
      formCues: values.formCues ?? [],
      coachingNotes: values.coachingNotes ?? null,
      instructions: values.instructions ?? null,
    })
    .run();

const seedWorkoutSession = (values: {
  id: string;
  userId: string;
  templateId?: string | null;
  name: string;
  date: string;
  status?: 'scheduled' | 'in-progress' | 'paused' | 'cancelled' | 'completed';
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
  timeSegments?: Array<{
    start: string;
    end: string | null;
  }>;
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
      timeSegments: serializeWorkoutSessionTimeSegments(values.timeSegments ?? []),
      feedback: serializeWorkoutSessionFeedback(values.feedback ?? null),
      notes: values.notes ?? null,
    })
    .run();

const seedSessionSet = (values: {
  id: string;
  sessionId: string;
  exerciseId: string;
  orderIndex?: number;
  setNumber: number;
  weight?: number | null;
  reps?: number | null;
  targetWeight?: number | null;
  targetWeightMin?: number | null;
  targetWeightMax?: number | null;
  targetSeconds?: number | null;
  targetDistance?: number | null;
  completed?: boolean;
  skipped?: boolean;
  supersetGroup?: string | null;
  section?: 'warmup' | 'main' | 'cooldown';
  notes?: string | null;
}) =>
  context.db
    .insert(sessionSets)
    .values({
      id: values.id,
      sessionId: values.sessionId,
      exerciseId: values.exerciseId,
      orderIndex: values.orderIndex ?? 0,
      setNumber: values.setNumber,
      weight: values.weight ?? null,
      reps: values.reps ?? null,
      targetWeight: values.targetWeight ?? null,
      targetWeightMin: values.targetWeightMin ?? null,
      targetWeightMax: values.targetWeightMax ?? null,
      targetSeconds: values.targetSeconds ?? null,
      targetDistance: values.targetDistance ?? null,
      completed: values.completed ?? false,
      skipped: values.skipped ?? false,
      supersetGroup: values.supersetGroup ?? null,
      section: values.section ?? 'main',
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
    context.db.delete(agentTokens).run();
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
      id: 'user-1-plank',
      userId: 'user-1',
      name: 'RKC Plank',
      trackingType: 'seconds_only',
      category: 'mobility',
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
        method: 'PATCH',
        url: '/api/v1/workout-sessions/session-1/corrections',
        payload: {
          corrections: [
            {
              setId: 'set-1',
              reps: 10,
            },
          ],
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
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/workout-sessions/session-1/reorder',
        payload: {
          section: 'main',
          exerciseIds: [],
        },
      }),
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/workout-sessions/session-1/exercises/global-bench-press/swap',
        payload: {
          newExerciseId: 'user-1-lat-pulldown',
        },
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
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

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
      const sectionOrder: Record<string, number> = {
        warmup: 0,
        main: 1,
        cooldown: 2,
        supplemental: 3,
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

  it('includes trackingType on each exercise in session detail responses', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedExercise({
      id: 'user-1-hang',
      userId: 'user-1',
      name: 'Dead Hang',
      trackingType: 'seconds_only',
      formCues: ['Pack shoulders', 'Keep ribs down'],
      coachingNotes: 'Use a full grip and avoid shrugging.',
      instructions: 'Hang from bar for target time.',
    });
    seedWorkoutSession({
      id: 'session-tracking',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'in-progress',
      startedAt: 1_700_000_000_000,
    });
    seedSessionSet({
      id: 'set-tracking-1',
      sessionId: 'session-tracking',
      exerciseId: 'user-1-hang',
      setNumber: 1,
      reps: 45,
      section: 'main',
    });

    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/workout-sessions/session-tracking',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-tracking',
        exercises: expect.arrayContaining([
          expect.objectContaining({
            exerciseId: 'user-1-hang',
            trackingType: 'seconds_only',
            exercise: {
              formCues: ['Pack shoulders', 'Keep ribs down'],
              coachingNotes: 'Use a full grip and avoid shrugging.',
              instructions: 'Hang from bar for target time.',
            },
          }),
        ]),
      }),
    });
  });

  it('includes metadata from soft-deleted exercises in session detail responses', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedExercise({
      id: 'user-1-soft-deleted',
      userId: 'user-1',
      name: 'Deleted Exercise',
      trackingType: 'seconds_only',
      formCues: ['This should not be returned'],
      coachingNotes: 'Should be hidden',
      instructions: 'Should be hidden',
    });
    seedWorkoutSession({
      id: 'session-soft-deleted-exercise',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'in-progress',
      startedAt: 1_700_000_000_000,
    });
    seedSessionSet({
      id: 'set-soft-deleted-1',
      sessionId: 'session-soft-deleted-exercise',
      exerciseId: 'user-1-soft-deleted',
      setNumber: 1,
      reps: 30,
      section: 'main',
    });

    context.db
      .update(exercises)
      .set({ deletedAt: '2026-03-12T00:00:00.000Z' })
      .where(eq(exercises.id, 'user-1-soft-deleted'))
      .run();

    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/workout-sessions/session-soft-deleted-exercise',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-soft-deleted-exercise',
        exercises: expect.arrayContaining([
          expect.objectContaining({
            exerciseId: 'user-1-soft-deleted',
            exerciseName: 'Deleted Exercise',
            deletedAt: '2026-03-12T00:00:00.000Z',
            trackingType: 'seconds_only',
            exercise: {
              formCues: ['This should not be returned'],
              coachingNotes: 'Should be hidden',
              instructions: 'Should be hidden',
            },
          }),
        ]),
      }),
    });
  });

  it('returns deleted exercise placeholders when session sets have null exerciseId values', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-null-exercise-id',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'completed',
      startedAt: 1_700_000_000_000,
      completedAt: 1_700_000_010_000,
    });

    context.db
      .insert(sessionSets)
      .values({
        id: 'set-null-exercise-id-1',
        sessionId: 'session-null-exercise-id',
        exerciseId: null,
        setNumber: 1,
        reps: 12,
        section: 'main',
      })
      .run();

    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/workout-sessions/session-null-exercise-id',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-null-exercise-id',
        sets: expect.arrayContaining([
          expect.objectContaining({
            id: 'set-null-exercise-id-1',
            exerciseId: null,
            reps: 12,
          }),
        ]),
        exercises: expect.arrayContaining([
          expect.objectContaining({
            exerciseId: null,
            exerciseName: 'Deleted exercise',
          }),
        ]),
      }),
    });
  });

  it('keeps null exerciseId set groups distinct by section and order index', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-null-exercise-groups',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Null Group Session',
      date: '2026-03-12',
      status: 'completed',
      startedAt: 1_700_000_000_000,
      completedAt: 1_700_000_010_000,
    });

    context.db
      .insert(sessionSets)
      .values([
        {
          id: 'set-null-group-main',
          sessionId: 'session-null-exercise-groups',
          exerciseId: null,
          orderIndex: 0,
          setNumber: 1,
          reps: 12,
          section: 'main',
        },
        {
          id: 'set-null-group-cooldown',
          sessionId: 'session-null-exercise-groups',
          exerciseId: null,
          orderIndex: 1,
          setNumber: 1,
          reps: 20,
          section: 'cooldown',
        },
      ])
      .run();

    const groupedResponse = await context.app.inject({
      method: 'GET',
      url: '/api/v1/workout-sessions/session-null-exercise-groups/sets',
      headers: createAuthorizationHeader(authToken),
    });

    expect(groupedResponse.statusCode).toBe(200);
    expect(groupedResponse.json()).toEqual({
      data: expect.arrayContaining([
        expect.objectContaining({
          exerciseId: null,
          sets: [expect.objectContaining({ id: 'set-null-group-main' })],
        }),
        expect.objectContaining({
          exerciseId: null,
          sets: [expect.objectContaining({ id: 'set-null-group-cooldown' })],
        }),
      ]),
    });
  });

  it('reorders active session exercises by updating set orderIndex while preserving set data', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-reorder',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'in-progress',
      startedAt: 1_700_000_000_000,
    });
    seedSessionSet({
      id: 'set-press-1',
      sessionId: 'session-reorder',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      reps: 8,
      weight: 185,
      section: 'main',
    });
    seedSessionSet({
      id: 'set-press-2',
      sessionId: 'session-reorder',
      exerciseId: 'global-bench-press',
      setNumber: 2,
      reps: 7,
      weight: 195,
      section: 'main',
    });
    seedSessionSet({
      id: 'set-pulldown-1',
      sessionId: 'session-reorder',
      exerciseId: 'user-1-lat-pulldown',
      setNumber: 1,
      reps: 12,
      weight: 140,
      section: 'main',
    });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-reorder/reorder',
      headers: createAuthorizationHeader(authToken),
      payload: {
        section: 'main',
        exerciseIds: ['user-1-lat-pulldown', 'global-bench-press'],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-reorder',
        sets: [
          expect.objectContaining({
            exerciseId: 'user-1-lat-pulldown',
            orderIndex: 0,
            reps: 12,
            weight: 140,
          }),
          expect.objectContaining({
            exerciseId: 'global-bench-press',
            orderIndex: 1,
            setNumber: 1,
            reps: 8,
            weight: 185,
          }),
          expect.objectContaining({
            exerciseId: 'global-bench-press',
            orderIndex: 1,
            setNumber: 2,
            reps: 7,
            weight: 195,
          }),
        ],
      }),
    });

    const persistedOrder = context.db
      .select({
        exerciseId: sessionSets.exerciseId,
        orderIndex: sessionSets.orderIndex,
      })
      .from(sessionSets)
      .where(eq(sessionSets.sessionId, 'session-reorder'))
      .all()
      .sort((left, right) => {
        if (left.orderIndex !== right.orderIndex) {
          return left.orderIndex - right.orderIndex;
        }

        return (left.exerciseId ?? '').localeCompare(right.exerciseId ?? '');
      });

    expect(persistedOrder).toEqual([
      { exerciseId: 'user-1-lat-pulldown', orderIndex: 0 },
      { exerciseId: 'global-bench-press', orderIndex: 1 },
      { exerciseId: 'global-bench-press', orderIndex: 1 },
    ]);
  });

  it('swaps a session exercise while preserving entered set data', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-swap',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'in-progress',
      startedAt: 1_700_000_000_000,
    });
    seedSessionSet({
      id: 'set-swap-1',
      sessionId: 'session-swap',
      exerciseId: 'global-bench-press',
      orderIndex: 1,
      setNumber: 1,
      weight: 185,
      reps: 8,
      targetWeight: 190,
      completed: true,
      section: 'main',
      notes: 'Smooth reps',
    });
    seedSessionSet({
      id: 'set-swap-2',
      sessionId: 'session-swap',
      exerciseId: 'global-bench-press',
      orderIndex: 1,
      setNumber: 2,
      weight: 195,
      reps: 6,
      targetWeightMin: 190,
      targetWeightMax: 200,
      skipped: true,
      section: 'main',
      notes: 'Tweaked shoulder',
    });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-swap/exercises/global-bench-press/swap',
      headers: createAuthorizationHeader(authToken),
      payload: {
        newExerciseId: 'user-1-plank',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-swap',
        exercises: expect.arrayContaining([
          expect.objectContaining({
            exerciseId: 'user-1-plank',
          }),
        ]),
        sets: [
          expect.objectContaining({
            id: 'set-swap-1',
            exerciseId: 'user-1-plank',
            orderIndex: 1,
            setNumber: 1,
            weight: 185,
            reps: 8,
            targetWeight: 190,
            completed: true,
            skipped: false,
            section: 'main',
            notes: 'Smooth reps',
          }),
          expect.objectContaining({
            id: 'set-swap-2',
            exerciseId: 'user-1-plank',
            orderIndex: 1,
            setNumber: 2,
            weight: 195,
            reps: 6,
            targetWeightMin: 190,
            targetWeightMax: 200,
            completed: false,
            skipped: true,
            section: 'main',
            notes: 'Tweaked shoulder',
          }),
        ],
      }),
      meta: {
        warning:
          'Swapped to an exercise with a different tracking type. Review entered sets and targets.',
      },
    });

    const persistedSets = context.db
      .select({
        id: sessionSets.id,
        exerciseId: sessionSets.exerciseId,
        orderIndex: sessionSets.orderIndex,
        setNumber: sessionSets.setNumber,
        weight: sessionSets.weight,
        reps: sessionSets.reps,
        targetWeight: sessionSets.targetWeight,
        targetWeightMin: sessionSets.targetWeightMin,
        targetWeightMax: sessionSets.targetWeightMax,
        completed: sessionSets.completed,
        skipped: sessionSets.skipped,
        section: sessionSets.section,
        notes: sessionSets.notes,
      })
      .from(sessionSets)
      .where(eq(sessionSets.sessionId, 'session-swap'))
      .all()
      .sort((left, right) => left.setNumber - right.setNumber);

    expect(persistedSets).toEqual([
      {
        id: 'set-swap-1',
        exerciseId: 'user-1-plank',
        orderIndex: 1,
        setNumber: 1,
        weight: 185,
        reps: 8,
        targetWeight: 190,
        targetWeightMin: null,
        targetWeightMax: null,
        completed: true,
        skipped: false,
        section: 'main',
        notes: 'Smooth reps',
      },
      {
        id: 'set-swap-2',
        exerciseId: 'user-1-plank',
        orderIndex: 1,
        setNumber: 2,
        weight: 195,
        reps: 6,
        targetWeight: null,
        targetWeightMin: 190,
        targetWeightMax: 200,
        completed: false,
        skipped: true,
        section: 'main',
        notes: 'Tweaked shoulder',
      },
    ]);
  });

  it('rejects swaps for completed sessions', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-completed-swap',
      userId: 'user-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'completed',
      startedAt: 1_700_000_000_000,
      completedAt: 1_700_000_003_000,
    });
    seedSessionSet({
      id: 'set-completed-1',
      sessionId: 'session-completed-swap',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      section: 'main',
    });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-completed-swap/exercises/global-bench-press/swap',
      headers: createAuthorizationHeader(authToken),
      payload: {
        newExerciseId: 'user-1-plank',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: {
        code: 'WORKOUT_SESSION_NOT_SWAPPABLE',
        message: 'Workout session must be planned, in progress, or paused to swap exercises',
      },
    });
  });

  it('returns 404 when swapping an exercise not present in the session', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-missing-source',
      userId: 'user-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'in-progress',
      startedAt: 1_700_000_000_000,
    });
    seedSessionSet({
      id: 'set-present-1',
      sessionId: 'session-missing-source',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      section: 'main',
    });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-missing-source/exercises/user-1-lat-pulldown/swap',
      headers: createAuthorizationHeader(authToken),
      payload: {
        newExerciseId: 'user-1-plank',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: 'WORKOUT_SESSION_EXERCISE_NOT_FOUND',
        message: 'Session exercise not found',
      },
    });
  });

  it('rejects swap targets that are not user-owned exercises', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-invalid-target',
      userId: 'user-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'in-progress',
      startedAt: 1_700_000_000_000,
    });
    seedSessionSet({
      id: 'set-invalid-target-1',
      sessionId: 'session-invalid-target',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      section: 'main',
    });

    const [globalResponse, otherUserResponse] = await Promise.all([
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/workout-sessions/session-invalid-target/exercises/global-bench-press/swap',
        headers: createAuthorizationHeader(authToken),
        payload: {
          newExerciseId: 'global-bench-press',
        },
      }),
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/workout-sessions/session-invalid-target/exercises/global-bench-press/swap',
        headers: createAuthorizationHeader(authToken),
        payload: {
          newExerciseId: 'user-2-private-row',
        },
      }),
    ]);

    for (const response of [globalResponse, otherUserResponse]) {
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: {
          code: 'INVALID_SESSION_EXERCISE',
          message: 'Session references one or more unavailable exercises',
        },
      });
    }
  });

  it('applies save-as-template metadata overrides when provided', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

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
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions/session-1/save-as-template',
      headers: createAuthorizationHeader(authToken),
      payload: {
        name: '   ',
      },
    });

    expect(response.statusCode).toBe(400);
    expectRequestValidationError(
      response,
      'POST',
      '/api/v1/workout-sessions/session-1/save-as-template',
    );
  });

  it('creates, updates, lists, and batch-upserts sets for an active owned session', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

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

  it('batch-upserted sets inherit an exercise superset group from existing sets', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-upsert-superset',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Superset Upsert Session',
      date: '2026-03-12',
      status: 'in-progress',
      startedAt: 1000,
    });
    seedSessionSet({
      id: 'session-upsert-superset-1',
      sessionId: 'session-upsert-superset',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      weight: 185,
      reps: 8,
      supersetGroup: 'push-a',
      section: 'main',
    });

    const response = await context.app.inject({
      method: 'PUT',
      url: '/api/v1/workout-sessions/session-upsert-superset/sets',
      headers: createAuthorizationHeader(authToken),
      payload: {
        sets: [
          {
            id: 'session-upsert-superset-1',
            exerciseId: 'global-bench-press',
            setNumber: 1,
            weight: 190,
            reps: 8,
            section: 'main',
          },
          {
            exerciseId: 'global-bench-press',
            setNumber: 2,
            weight: 175,
            reps: 10,
            section: 'main',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);

    const persistedSets = context.db
      .select({
        id: sessionSets.id,
        setNumber: sessionSets.setNumber,
        supersetGroup: sessionSets.supersetGroup,
      })
      .from(sessionSets)
      .where(eq(sessionSets.sessionId, 'session-upsert-superset'))
      .all();

    expect(persistedSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'session-upsert-superset-1',
          setNumber: 1,
          supersetGroup: 'push-a',
        }),
        expect.objectContaining({
          setNumber: 2,
          supersetGroup: 'push-a',
        }),
      ]),
    );
  });

  it('enforces ownership, active-session writes, and set-level validation', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

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
    expectRequestValidationError(
      invalidPatchBodyResponse,
      'PATCH',
      '/api/v1/workout-sessions/session-active/sets/set-missing',
    );

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
        message: 'Session references one or more unavailable exercises: user-2-private-row',
      },
    });

    const missingExerciseResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions/session-active/sets',
      headers: createAuthorizationHeader(authToken),
      payload: {
        exerciseId: 'missing-exercise-id',
        setNumber: 1,
      },
    });

    expect(missingExerciseResponse.statusCode).toBe(400);
    expect(missingExerciseResponse.json()).toEqual({
      error: {
        code: 'INVALID_SESSION_EXERCISE',
        message: 'Session references one or more unavailable exercises: missing-exercise-id',
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
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

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

  it('applies workout session corrections to completed sessions and preserves session timing', async () => {
    const agentToken = seedAgentToken('user-1', 'session-correction-agent-token');
    const updatedAtTimestamp = 1_700_000_004_200;

    seedWorkoutSession({
      id: 'session-completed',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'completed',
      startedAt: 1_700_000_000_000,
      completedAt: 1_700_000_003_600,
      duration: 60,
      timeSegments: [
        {
          start: '2026-03-12T10:00:00.000Z',
          end: '2026-03-12T11:00:00.000Z',
        },
      ],
    });
    seedSessionSet({
      id: 'set-1',
      sessionId: 'session-completed',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      weight: 185,
      reps: 8,
      completed: true,
      section: 'main',
    });
    seedSessionSet({
      id: 'set-2',
      sessionId: 'session-completed',
      exerciseId: 'global-bench-press',
      setNumber: 2,
      weight: 185,
      reps: 7,
      completed: true,
      section: 'main',
    });

    const beforeSessionRow = context.db
      .select({
        status: workoutSessions.status,
        startedAt: workoutSessions.startedAt,
        completedAt: workoutSessions.completedAt,
        updatedAt: workoutSessions.updatedAt,
      })
      .from(workoutSessions)
      .where(eq(workoutSessions.id, 'session-completed'))
      .get();

    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(updatedAtTimestamp);

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-completed/corrections',
      headers: createAgentTokenHeader(agentToken),
      payload: {
        corrections: [
          {
            setId: 'set-1',
            weight: 190,
          },
          {
            setId: 'set-1',
            reps: 6,
          },
          {
            setId: 'set-2',
            reps: 9,
          },
        ],
      },
    });
    dateNowSpy.mockRestore();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-completed',
        status: 'completed',
        startedAt: 1_700_000_000_000,
        completedAt: 1_700_000_003_600,
        sets: expect.arrayContaining([
          expect.objectContaining({
            id: 'set-1',
            weight: 190,
            reps: 6,
          }),
          expect.objectContaining({
            id: 'set-2',
            weight: 185,
            reps: 9,
          }),
        ]),
      }),
    });

    const afterSessionRow = context.db
      .select({
        status: workoutSessions.status,
        startedAt: workoutSessions.startedAt,
        completedAt: workoutSessions.completedAt,
        updatedAt: workoutSessions.updatedAt,
      })
      .from(workoutSessions)
      .where(eq(workoutSessions.id, 'session-completed'))
      .get();
    const correctedSets = context.db
      .select({
        id: sessionSets.id,
        weight: sessionSets.weight,
        reps: sessionSets.reps,
      })
      .from(sessionSets)
      .where(eq(sessionSets.sessionId, 'session-completed'))
      .all();

    expect(afterSessionRow).toEqual({
      ...beforeSessionRow,
      updatedAt: updatedAtTimestamp,
    });
    expect(correctedSets).toEqual([
      {
        id: 'set-1',
        weight: 190,
        reps: 6,
      },
      {
        id: 'set-2',
        weight: 185,
        reps: 9,
      },
    ]);
  });

  it('rejects invalid workout session correction requests', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-completed',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'completed',
      startedAt: 1000,
      completedAt: 1600,
    });
    seedSessionSet({
      id: 'set-1',
      sessionId: 'session-completed',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      weight: 185,
      reps: 8,
      completed: true,
      section: 'main',
    });
    seedWorkoutSession({
      id: 'session-in-progress',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Lower Body',
      date: '2026-03-13',
      status: 'in-progress',
      startedAt: 2000,
    });
    seedSessionSet({
      id: 'set-2',
      sessionId: 'session-in-progress',
      exerciseId: 'user-1-lat-pulldown',
      setNumber: 1,
      weight: 150,
      reps: 10,
      section: 'main',
    });
    seedWorkoutSession({
      id: 'other-user-session',
      userId: 'user-2',
      templateId: 'template-3',
      name: 'Other User Session',
      date: '2026-03-12',
      status: 'completed',
      startedAt: 3000,
      completedAt: 3600,
    });
    seedSessionSet({
      id: 'other-user-set',
      sessionId: 'other-user-session',
      exerciseId: 'user-2-private-row',
      setNumber: 1,
      weight: 135,
      reps: 8,
      completed: true,
      section: 'main',
    });

    const [
      inProgressResponse,
      otherUserResponse,
      invalidSetResponse,
      emptyCorrectionsResponse,
      unsupportedCorrectionResponse,
    ] = await Promise.all([
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/workout-sessions/session-in-progress/corrections',
        headers: createAuthorizationHeader(authToken),
        payload: {
          corrections: [
            {
              setId: 'set-2',
              reps: 9,
            },
          ],
        },
      }),
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/workout-sessions/other-user-session/corrections',
        headers: createAuthorizationHeader(authToken),
        payload: {
          corrections: [
            {
              setId: 'other-user-set',
              weight: 140,
            },
          ],
        },
      }),
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/workout-sessions/session-completed/corrections',
        headers: createAuthorizationHeader(authToken),
        payload: {
          corrections: [
            {
              setId: 'missing-set',
              reps: 10,
            },
          ],
        },
      }),
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/workout-sessions/session-completed/corrections',
        headers: createAuthorizationHeader(authToken),
        payload: {
          corrections: [],
        },
      }),
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/workout-sessions/session-completed/corrections',
        headers: createAuthorizationHeader(authToken),
        payload: {
          corrections: [
            {
              setId: 'set-1',
              rpe: 8,
            },
          ],
        },
      }),
    ]);

    expect(inProgressResponse.statusCode).toBe(409);
    expect(inProgressResponse.json()).toEqual({
      error: {
        code: 'WORKOUT_SESSION_NOT_COMPLETED',
        message: 'Workout session must be completed before applying corrections',
      },
    });

    expect(otherUserResponse.statusCode).toBe(404);
    expect(otherUserResponse.json()).toEqual({
      error: {
        code: 'WORKOUT_SESSION_NOT_FOUND',
        message: 'Workout session not found',
      },
    });

    expect(invalidSetResponse.statusCode).toBe(400);
    expect(invalidSetResponse.json()).toEqual({
      error: {
        code: 'INVALID_SESSION_CORRECTION_SET',
        message: 'One or more corrections reference sets outside the workout session: missing-set',
      },
    });

    expect(emptyCorrectionsResponse.statusCode).toBe(400);
    expectRequestValidationError(
      emptyCorrectionsResponse,
      'PATCH',
      '/api/v1/workout-sessions/session-completed/corrections',
    );

    expect(unsupportedCorrectionResponse.statusCode).toBe(400);
    expect(unsupportedCorrectionResponse.json()).toEqual({
      error: {
        code: 'INVALID_SESSION_CORRECTION',
        message:
          'Workout session corrections must include weight or reps. Set-level RPE corrections are not persisted yet: set-1',
      },
    });
  });

  it('creates, lists, and fetches workout sessions for the authenticated user', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

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
            targetWeightMin: 175,
            targetWeightMax: 185,
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
          targetWeight: number | null;
          targetWeightMin: number | null;
          targetWeightMax: number | null;
          targetSeconds: number | null;
          targetDistance: number | null;
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
          targetWeightMin: 175,
          targetWeightMax: 185,
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
          notes: 'Great pressing day',
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
          notes: null,
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
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

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

  it('includes sessions completed on the same-day range boundary', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-yesterday',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Yesterday Session',
      date: '2026-03-11',
      status: 'completed',
      startedAt: Date.parse('2026-03-11T23:55:00.000Z'),
      completedAt: Date.parse('2026-03-11T23:58:00.000Z'),
      duration: 3,
    });
    seedWorkoutSession({
      id: 'session-today',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Today Session',
      date: '2026-03-12',
      status: 'completed',
      startedAt: Date.parse('2026-03-12T00:05:00.000Z'),
      completedAt: Date.parse('2026-03-12T00:25:00.000Z'),
      duration: 20,
    });

    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/workout-sessions?status=completed&from=2026-03-12&to=2026-03-12',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [
        expect.objectContaining({
          id: 'session-today',
          date: '2026-03-12',
          status: 'completed',
        }),
      ],
    });
  });

  it('filters workout session listings by multiple statuses', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-paused',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Paused Upper Push',
      date: '2026-03-16',
      status: 'paused',
      startedAt: 1_700_110_000_000,
    });
    seedWorkoutSession({
      id: 'session-in-progress-2',
      userId: 'user-1',
      templateId: 'template-2',
      name: 'Active Lower Body',
      date: '2026-03-15',
      status: 'in-progress',
      startedAt: 1_700_109_000_000,
    });
    seedWorkoutSession({
      id: 'session-completed-4',
      userId: 'user-1',
      templateId: 'template-2',
      name: 'Completed Session',
      date: '2026-03-14',
      status: 'completed',
      startedAt: 1_700_108_000_000,
      completedAt: 1_700_108_003_000,
      duration: 47,
    });

    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/workout-sessions?status=in-progress&status=paused',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [
        expect.objectContaining({
          id: 'session-paused',
          status: 'paused',
        }),
        expect.objectContaining({
          id: 'session-in-progress-2',
          status: 'in-progress',
        }),
      ],
    });
  });

  it('links a newly started session to an unclaimed scheduled workout for today', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const today = new Date().toISOString().slice(0, 10);

    seedScheduledWorkout({
      id: 'schedule-1',
      userId: 'user-1',
      templateId: 'template-1',
      date: today,
    });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: 'template-1',
        name: 'Upper Push',
        date: today,
        status: 'in-progress',
        startedAt: 1_700_000_100_000,
        completedAt: null,
        duration: null,
        feedback: null,
        notes: null,
        sets: [],
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const sessionId = (createResponse.json() as { data: { id: string } }).data.id;

    const linkedSchedule = context.db
      .select({ sessionId: scheduledWorkouts.sessionId })
      .from(scheduledWorkouts)
      .where(eq(scheduledWorkouts.id, 'schedule-1'))
      .limit(1)
      .get();

    expect(linkedSchedule).toEqual({
      sessionId,
    });
  });

  it('backfills empty time segments for in-progress sessions at read time', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const startedAt = Date.UTC(2026, 2, 12, 14, 30, 0);

    seedWorkoutSession({
      id: 'session-legacy',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Legacy Session',
      date: '2026-03-12',
      status: 'in-progress',
      startedAt,
    });

    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/workout-sessions/session-legacy',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-legacy',
        status: 'in-progress',
        timeSegments: [
          {
            start: new Date(startedAt).toISOString(),
            end: null,
          },
        ],
      }),
    });
  });

  it('creates an initial open time segment when starting a new in-progress session', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const startedAt = Date.UTC(2026, 2, 12, 10, 0, 0);

    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: 'template-1',
        name: 'Upper Push',
        date: '2026-03-12',
        status: 'in-progress',
        startedAt,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        status: 'in-progress',
        timeSegments: [
          {
            start: new Date(startedAt).toISOString(),
            end: null,
          },
        ],
      }),
    });
  });

  it('pausing closes the current segment and resuming opens a new one', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const startedAt = '2026-03-12T10:00:00.000Z';

    seedWorkoutSession({
      id: 'session-pause-resume',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'in-progress',
      startedAt: Date.parse(startedAt),
      timeSegments: [{ start: startedAt, end: null }],
    });

    const pauseResponse = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-pause-resume',
      headers: createAuthorizationHeader(authToken),
      payload: {
        status: 'paused',
      },
    });

    expect(pauseResponse.statusCode).toBe(200);
    expect(pauseResponse.json()).toEqual({
      data: expect.objectContaining({
        status: 'paused',
        timeSegments: [
          {
            start: startedAt,
            end: expect.any(String),
          },
        ],
      }),
    });

    const resumeResponse = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-pause-resume',
      headers: createAuthorizationHeader(authToken),
      payload: {
        status: 'in-progress',
      },
    });

    expect(resumeResponse.statusCode).toBe(200);
    expect(resumeResponse.json()).toEqual({
      data: expect.objectContaining({
        status: 'in-progress',
        timeSegments: [
          {
            start: startedAt,
            end: expect.any(String),
          },
          {
            start: expect.any(String),
            end: null,
          },
        ],
      }),
    });
  });

  it('cancelling closes open segment and marks session cancelled', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-cancelled',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'in-progress',
      startedAt: Date.parse('2026-03-12T10:00:00.000Z'),
      timeSegments: [
        {
          start: '2026-03-12T10:00:00.000Z',
          end: null,
        },
      ],
    });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-cancelled',
      headers: createAuthorizationHeader(authToken),
      payload: {
        status: 'cancelled',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        status: 'cancelled',
        completedAt: null,
        timeSegments: [
          {
            start: '2026-03-12T10:00:00.000Z',
            end: expect.any(String),
          },
        ],
      }),
    });
  });

  it('completing closes the final segment and calculates duration from segments', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const completedAt = Date.parse('2026-03-12T10:25:00.000Z');

    seedWorkoutSession({
      id: 'session-complete',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'in-progress',
      startedAt: Date.parse('2026-03-12T10:00:00.000Z'),
      timeSegments: [
        {
          start: '2026-03-12T10:00:00.000Z',
          end: '2026-03-12T10:10:00.000Z',
        },
        {
          start: '2026-03-12T10:20:00.000Z',
          end: null,
        },
      ],
    });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-complete',
      headers: createAuthorizationHeader(authToken),
      payload: {
        status: 'completed',
        completedAt,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        status: 'completed',
        completedAt,
        duration: 900,
        timeSegments: [
          {
            start: '2026-03-12T10:00:00.000Z',
            end: '2026-03-12T10:10:00.000Z',
          },
          {
            start: '2026-03-12T10:20:00.000Z',
            end: '2026-03-12T10:25:00.000Z',
          },
        ],
      }),
    });
  });

  it('validates chronological ordering when editing time segments', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-time-edit',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'paused',
      startedAt: Date.parse('2026-03-12T10:00:00.000Z'),
      timeSegments: [
        {
          start: '2026-03-12T10:00:00.000Z',
          end: '2026-03-12T10:10:00.000Z',
        },
      ],
    });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-time-edit/time-segments',
      headers: createAuthorizationHeader(authToken),
      payload: {
        timeSegments: [
          {
            start: '2026-03-12T10:00:00.000Z',
            end: '2026-03-12T10:10:00.000Z',
          },
          {
            start: '2026-03-12T10:05:00.000Z',
            end: '2026-03-12T10:20:00.000Z',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expectRequestValidationError(
      response,
      'PATCH',
      '/api/v1/workout-sessions/session-time-edit/time-segments',
    );
  });

  it('validates out-of-order time segments when editing', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-time-out-of-order',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'paused',
      startedAt: Date.parse('2026-03-12T10:00:00.000Z'),
      timeSegments: [
        {
          start: '2026-03-12T10:00:00.000Z',
          end: '2026-03-12T10:10:00.000Z',
        },
      ],
    });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-time-out-of-order/time-segments',
      headers: createAuthorizationHeader(authToken),
      payload: {
        timeSegments: [
          {
            start: '2026-03-12T10:20:00.000Z',
            end: '2026-03-12T10:25:00.000Z',
          },
          {
            start: '2026-03-12T10:00:00.000Z',
            end: '2026-03-12T10:10:00.000Z',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expectRequestValidationError(
      response,
      'PATCH',
      '/api/v1/workout-sessions/session-time-out-of-order/time-segments',
    );
  });

  it('supports directly editing a segment end timestamp', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-time-end-edit',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'completed',
      startedAt: Date.parse('2026-03-12T10:00:00.000Z'),
      completedAt: Date.parse('2026-03-12T10:20:00.000Z'),
      duration: 1200,
      timeSegments: [
        {
          start: '2026-03-12T10:00:00.000Z',
          end: '2026-03-12T10:20:00.000Z',
        },
      ],
    });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-time-end-edit/time-segments',
      headers: createAuthorizationHeader(authToken),
      payload: {
        timeSegments: [
          {
            start: '2026-03-12T10:00:00.000Z',
            end: '2026-03-12T10:15:00.000Z',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        duration: 900,
        timeSegments: [
          {
            start: '2026-03-12T10:00:00.000Z',
            end: '2026-03-12T10:15:00.000Z',
          },
        ],
      }),
    });
  });

  it('supports segment deletion merge and additional split edits', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-time-merge',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'completed',
      startedAt: Date.parse('2026-03-12T10:00:00.000Z'),
      completedAt: Date.parse('2026-03-12T10:25:00.000Z'),
      duration: 900,
      timeSegments: [
        {
          start: '2026-03-12T10:00:00.000Z',
          end: '2026-03-12T10:10:00.000Z',
        },
        {
          start: '2026-03-12T10:20:00.000Z',
          end: '2026-03-12T10:25:00.000Z',
        },
      ],
    });

    const mergeResponse = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-time-merge/time-segments',
      headers: createAuthorizationHeader(authToken),
      payload: {
        timeSegments: [
          {
            start: '2026-03-12T10:00:00.000Z',
            end: '2026-03-12T10:25:00.000Z',
          },
        ],
      },
    });

    expect(mergeResponse.statusCode).toBe(200);
    expect(mergeResponse.json()).toEqual({
      data: expect.objectContaining({
        duration: 1500,
        timeSegments: [
          {
            start: '2026-03-12T10:00:00.000Z',
            end: '2026-03-12T10:25:00.000Z',
          },
        ],
      }),
    });

    const splitResponse = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-time-merge/time-segments',
      headers: createAuthorizationHeader(authToken),
      payload: {
        timeSegments: [
          {
            start: '2026-03-12T10:00:00.000Z',
            end: '2026-03-12T10:08:00.000Z',
          },
          {
            start: '2026-03-12T10:12:00.000Z',
            end: '2026-03-12T10:25:00.000Z',
          },
        ],
      },
    });

    expect(splitResponse.statusCode).toBe(200);
    expect(splitResponse.json()).toEqual({
      data: expect.objectContaining({
        duration: 1260,
        timeSegments: [
          {
            start: '2026-03-12T10:00:00.000Z',
            end: '2026-03-12T10:08:00.000Z',
          },
          {
            start: '2026-03-12T10:12:00.000Z',
            end: '2026-03-12T10:25:00.000Z',
          },
        ],
      }),
    });
  });

  it('updates owned workout sessions by replacing nested set rows', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

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
        duration: 3,
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
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
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
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

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

  it('rejects reverting a completed session back to in-progress', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

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
    });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-1',
      headers: createAuthorizationHeader(authToken),
      payload: {
        status: 'in-progress',
        completedAt: null,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: {
        code: 'WORKOUT_SESSION_INVALID_TRANSITION',
        message: 'Invalid workout session status transition',
      },
    });
  });

  it('does not overwrite first-set notes when exerciseNotes are normalized to null', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

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
      notes: 'Keep chest high',
    });
    seedSessionSet({
      id: 'set-2',
      sessionId: 'session-1',
      exerciseId: 'user-1-lat-pulldown',
      setNumber: 2,
      weight: 145,
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
        exerciseNotes: {
          'user-1-lat-pulldown': '   ',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-1',
        sets: [
          expect.objectContaining({
            exerciseId: 'user-1-lat-pulldown',
            setNumber: 1,
            notes: 'Keep chest high',
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

  it('soft-deletes owned workout sessions', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

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
      expect.objectContaining({ id: 'session-1', deletedAt: expect.any(String) }),
      expect.objectContaining({ id: 'session-2', deletedAt: null }),
    ]);
    expect(context.db.select().from(sessionSets).all()).toEqual([
      expect.objectContaining({ id: 'set-1', sessionId: 'session-1' }),
    ]);
    // Deleting a session also deletes any linked scheduled workout
    expect(
      context.db
        .select({ sessionId: scheduledWorkouts.sessionId })
        .from(scheduledWorkouts)
        .where(eq(scheduledWorkouts.id, 'schedule-1'))
        .get(),
    ).toBeUndefined();

    const getDeletedResponse = await context.app.inject({
      method: 'GET',
      url: '/api/v1/workout-sessions/session-1',
      headers: createAuthorizationHeader(authToken),
    });

    expect(getDeletedResponse.statusCode).toBe(404);

    const listResponse = await context.app.inject({
      method: 'GET',
      url: '/api/v1/workout-sessions',
      headers: createAuthorizationHeader(authToken),
    });
    const listPayload = listResponse.json() as { data: Array<{ id: string }> };

    expect(listResponse.statusCode).toBe(200);
    expect(listPayload.data.map((session) => session.id)).toEqual([]);

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
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

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
        message: 'Session references one or more unavailable exercises: user-2-private-row',
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

    expect(invalidMergedUpdateResponse.statusCode).toBe(200);
    expect(invalidMergedUpdateResponse.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-1',
        status: 'completed',
      }),
    });
  });

  it('allows patch updates without sets when existing session sets reference now-deleted exercises', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedExercise({
      id: 'user-1-soft-delete-lift',
      userId: 'user-1',
      name: 'Temporary Lift',
    });
    seedWorkoutSession({
      id: 'session-with-deleted-exercise',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      startedAt: 1000,
    });
    seedSessionSet({
      id: 'set-soft-delete-lift',
      sessionId: 'session-with-deleted-exercise',
      exerciseId: 'user-1-soft-delete-lift',
      setNumber: 1,
      reps: 8,
      section: 'main',
    });
    context.db
      .update(exercises)
      .set({ deletedAt: '2026-03-13T00:00:00.000Z' })
      .where(eq(exercises.id, 'user-1-soft-delete-lift'))
      .run();

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-with-deleted-exercise',
      headers: createAuthorizationHeader(authToken),
      payload: {
        status: 'completed',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-with-deleted-exercise',
        status: 'completed',
      }),
    });
  });

  it('rejects invalid list queries and malformed payloads', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

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
    expectRequestValidationError(
      invalidRangeQueryResponse,
      'GET',
      '/api/v1/workout-sessions?from=2026-03-12&to=2026-03-10',
    );
    expect(invalidStatusQueryResponse.statusCode).toBe(400);
    expectRequestValidationError(
      invalidStatusQueryResponse,
      'GET',
      '/api/v1/workout-sessions?status=finished',
    );
    expect(invalidLimitQueryResponse.statusCode).toBe(400);
    expectRequestValidationError(
      invalidLimitQueryResponse,
      'GET',
      '/api/v1/workout-sessions?limit=0',
    );

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
    expectRequestValidationError(invalidCreateResponse, 'POST', '/api/v1/workout-sessions');

    const invalidUpdateResponse = await context.app.inject({
      method: 'PUT',
      url: '/api/v1/workout-sessions/session-1',
      headers: createAuthorizationHeader(authToken),
      payload: {},
    });

    expect(invalidUpdateResponse.statusCode).toBe(400);
    expectRequestValidationError(
      invalidUpdateResponse,
      'PUT',
      '/api/v1/workout-sessions/session-1',
    );
  });

  it('creates sessions with AgentToken auth using templateName resolution', async () => {
    const agentToken = seedAgentToken('user-1');
    const startedAt = Date.parse('2026-03-12T10:00:00.000Z');

    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions',
      headers: createAgentTokenHeader(agentToken),
      payload: {
        templateName: ' Upper Push ',
        name: 'Quick Lift',
        date: '2026-03-12',
        startedAt,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        templateId: 'template-1',
        name: 'Quick Lift',
        status: 'in-progress',
        date: '2026-03-12',
        startedAt,
      }),
      agent: expect.objectContaining({
        hints: [
          'Session progress is 0/0 completed sets across 0 exercises.',
          'All planned exercises are complete, so the session can be wrapped up whenever you are ready.',
        ],
        suggestedActions: [
          'Mark the session completed or add a finisher set if more work is needed.',
          'Pause or complete the session when the workout ends.',
        ],
        relatedState: expect.objectContaining({
          action: 'create',
          status: 'in-progress',
          totalSets: expect.any(Number),
          completedSets: expect.any(Number),
        }),
      }),
    });
  });

  it('returns 404 when AgentToken templateName cannot be resolved', async () => {
    const agentToken = seedAgentToken('user-1', 'agent-template-miss-token');
    const startedAt = Date.parse('2026-03-12T10:00:00.000Z');

    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions',
      headers: createAgentTokenHeader(agentToken),
      payload: {
        templateName: 'Unknown Template',
        name: 'Quick Lift',
        date: '2026-03-12',
        startedAt,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: 'WORKOUT_TEMPLATE_NOT_FOUND',
        message: 'Workout template not found',
      },
    });
  });

  it('rejects templateName for JWT callers', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const startedAt = Date.parse('2026-03-12T10:00:00.000Z');

    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateName: 'Upper Push',
        name: 'Quick Lift',
        date: '2026-03-12',
        startedAt,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'templateName is only supported for AgentToken requests',
      },
    });
  });

  it('patches sessions with agent exercise mutations and auto-creates missing exercises', async () => {
    const agentToken = seedAgentToken('user-1', 'plain-agent-token-2');
    seedWorkoutSession({
      id: 'session-agent',
      userId: 'user-1',
      name: 'Agent Session',
      date: '2026-03-12',
      startedAt: Date.now() - 60_000,
      status: 'in-progress',
    });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-agent',
      headers: createAgentTokenHeader(agentToken),
      payload: {
        addExercises: [{ name: 'Landmine Press', sets: 2, reps: 10, section: 'main' }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-agent',
        sets: expect.arrayContaining([
          expect.objectContaining({ setNumber: 1 }),
          expect.objectContaining({ setNumber: 2 }),
        ]),
      }),
      agent: expect.objectContaining({
        hints: [
          'Session progress is 0/2 completed sets across 1 exercises.',
          '1 exercise still has unfinished work.',
        ],
        suggestedActions: [
          'Log set 1 for Landmine Press.',
          'Pause or complete the session when the workout ends.',
        ],
        relatedState: expect.objectContaining({
          action: 'update',
          status: 'in-progress',
          totalSets: 2,
          completedSets: 0,
          remainingSets: 2,
          remainingExercises: 1,
          nextSet: {
            exerciseId: expect.any(String),
            exerciseName: 'Landmine Press',
            setNumber: 1,
          },
        }),
      }),
    });

    const createdExercise = context.db
      .select({ id: exercises.id, name: exercises.name, userId: exercises.userId })
      .from(exercises)
      .where(eq(exercises.name, 'Landmine Press'))
      .get();
    expect(createdExercise).toEqual({
      id: expect.any(String),
      name: 'Landmine Press',
      userId: 'user-1',
    });
  });

  it('allows agent PATCH updates for duration, name, feedback, and timestamps', async () => {
    const agentToken = seedAgentToken('user-1', 'agent-standard-fields-token');
    const startedAt = Date.parse('2026-03-12T10:00:00.000Z');
    const completedAt = Date.parse('2026-03-12T10:20:00.000Z');

    seedWorkoutSession({
      id: 'session-agent-standard-fields',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Original Session',
      date: '2026-03-12',
      status: 'completed',
      startedAt,
      completedAt,
      duration: 1_200,
      timeSegments: [
        {
          start: '2026-03-12T10:00:00.000Z',
          end: '2026-03-12T10:20:00.000Z',
        },
      ],
    });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-agent-standard-fields',
      headers: createAgentTokenHeader(agentToken),
      payload: {
        name: ' Updated Session ',
        startedAt: Date.parse('2026-03-12T10:05:00.000Z'),
        completedAt: Date.parse('2026-03-12T10:30:00.000Z'),
        duration: 1_500,
        feedback: {
          energy: 5,
          recovery: 4,
          technique: 4,
          notes: ' Strong finish ',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-agent-standard-fields',
        name: 'Updated Session',
        startedAt: Date.parse('2026-03-12T10:05:00.000Z'),
        completedAt: Date.parse('2026-03-12T10:30:00.000Z'),
        duration: 1_500,
        feedback: {
          energy: 5,
          recovery: 4,
          technique: 4,
          notes: 'Strong finish',
        },
      }),
      agent: expect.objectContaining({
        relatedState: expect.objectContaining({
          action: 'update',
        }),
      }),
    });
  });

  it('supports set upserts via exerciseId (JWT) and exerciseName (AgentToken)', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const agentToken = seedAgentToken('user-1', 'agent-set-upsert-token');

    seedWorkoutSession({
      id: 'session-jwt-upsert',
      userId: 'user-1',
      name: 'JWT Upsert Session',
      date: '2026-03-12',
      startedAt: Date.now() - 60_000,
      status: 'in-progress',
    });
    seedSessionSet({
      id: 'session-jwt-upsert-set-1',
      sessionId: 'session-jwt-upsert',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      weight: 185,
      reps: 8,
      completed: false,
      section: 'main',
    });

    const jwtResponse = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-jwt-upsert',
      headers: createAuthorizationHeader(authToken),
      payload: {
        sets: [{ exerciseId: 'global-bench-press', setNumber: 1, weight: 205, reps: 6 }],
      },
    });

    expect(jwtResponse.statusCode).toBe(200);
    expect(jwtResponse.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-jwt-upsert',
        sets: expect.arrayContaining([
          expect.objectContaining({
            exerciseId: 'global-bench-press',
            setNumber: 1,
            weight: 205,
            reps: 6,
            completed: true,
          }),
        ]),
      }),
    });

    seedWorkoutSession({
      id: 'session-agent-upsert',
      userId: 'user-1',
      name: 'Agent Upsert Session',
      date: '2026-03-12',
      startedAt: Date.now() - 60_000,
      status: 'in-progress',
    });

    const agentResponse = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-agent-upsert',
      headers: createAgentTokenHeader(agentToken),
      payload: {
        sets: [{ exerciseName: 'Landmine Press', setNumber: 1, weight: 70, reps: 10 }],
      },
    });

    expect(agentResponse.statusCode).toBe(200);
    expect(agentResponse.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-agent-upsert',
        sets: expect.arrayContaining([
          expect.objectContaining({
            setNumber: 1,
            weight: 70,
            reps: 10,
            completed: true,
          }),
        ]),
      }),
      agent: expect.objectContaining({
        relatedState: expect.objectContaining({
          action: 'update',
        }),
      }),
    });

    const createdExercise = context.db
      .select({ id: exercises.id, name: exercises.name, userId: exercises.userId })
      .from(exercises)
      .where(eq(exercises.name, 'Landmine Press'))
      .get();
    expect(createdExercise).toEqual({
      id: expect.any(String),
      name: 'Landmine Press',
      userId: 'user-1',
    });
  });

  it('applies addExercises/removeExercises/reorderExercises for both JWT and AgentToken callers', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const agentToken = seedAgentToken('user-1', 'agent-exercise-mutations-token');

    seedWorkoutSession({
      id: 'session-jwt-mutations',
      userId: 'user-1',
      name: 'JWT Mutations Session',
      date: '2026-03-12',
      startedAt: Date.now() - 60_000,
      status: 'in-progress',
    });
    seedSessionSet({
      id: 'session-jwt-mutations-bench',
      sessionId: 'session-jwt-mutations',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      section: 'main',
    });
    seedSessionSet({
      id: 'session-jwt-mutations-lat',
      sessionId: 'session-jwt-mutations',
      exerciseId: 'user-1-lat-pulldown',
      setNumber: 1,
      section: 'main',
    });

    const jwtResponse = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-jwt-mutations',
      headers: createAuthorizationHeader(authToken),
      payload: {
        addExercises: [{ exerciseId: 'user-1-plank', sets: 1, section: 'main' }],
        removeExercises: [{ exerciseId: 'user-1-lat-pulldown', section: 'main' }],
        reorderExercises: ['user-1-plank', 'global-bench-press'],
      },
    });

    expect(jwtResponse.statusCode).toBe(200);
    expect(jwtResponse.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-jwt-mutations',
        sets: expect.arrayContaining([
          expect.objectContaining({ exerciseId: 'global-bench-press' }),
          expect.objectContaining({ exerciseId: 'user-1-plank' }),
        ]),
      }),
    });
    expect(
      (jwtResponse.json() as { data: { sets: Array<{ exerciseId: string }> } }).data.sets.map(
        (set) => set.exerciseId,
      ),
    ).not.toContain('user-1-lat-pulldown');

    seedWorkoutSession({
      id: 'session-agent-mutations',
      userId: 'user-1',
      name: 'Agent Mutations Session',
      date: '2026-03-12',
      startedAt: Date.now() - 60_000,
      status: 'in-progress',
    });
    seedSessionSet({
      id: 'session-agent-mutations-bench',
      sessionId: 'session-agent-mutations',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      section: 'main',
    });
    seedSessionSet({
      id: 'session-agent-mutations-lat',
      sessionId: 'session-agent-mutations',
      exerciseId: 'user-1-lat-pulldown',
      setNumber: 1,
      section: 'main',
    });

    const agentResponse = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-agent-mutations',
      headers: createAgentTokenHeader(agentToken),
      payload: {
        addExercises: [{ name: 'RKC Plank', sets: 1, section: 'main' }],
        removeExercises: [{ exerciseId: 'user-1-lat-pulldown', section: 'main' }],
        reorderExercises: ['user-1-plank', 'global-bench-press'],
      },
    });

    expect(agentResponse.statusCode).toBe(200);
    expect(agentResponse.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-agent-mutations',
      }),
      agent: expect.objectContaining({
        relatedState: expect.objectContaining({
          action: 'update',
        }),
      }),
    });
    expect(
      (agentResponse.json() as { data: { sets: Array<{ exerciseId: string }> } }).data.sets.map(
        (set) => set.exerciseId,
      ),
    ).toEqual(expect.arrayContaining(['global-bench-press', 'user-1-plank']));
    expect(
      (agentResponse.json() as { data: { sets: Array<{ exerciseId: string }> } }).data.sets.map(
        (set) => set.exerciseId,
      ),
    ).not.toContain('user-1-lat-pulldown');
  });

  it('adds duplicate exercise ids in different sections and keeps section-local set numbering', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-sectioned-adds',
      userId: 'user-1',
      name: 'Sectioned Adds Session',
      date: '2026-03-12',
      startedAt: Date.now() - 60_000,
      status: 'in-progress',
    });
    seedSessionSet({
      id: 'session-sectioned-adds-main-1',
      sessionId: 'session-sectioned-adds',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      section: 'main',
    });
    seedSessionSet({
      id: 'session-sectioned-adds-main-2',
      sessionId: 'session-sectioned-adds',
      exerciseId: 'global-bench-press',
      setNumber: 2,
      section: 'main',
    });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-sectioned-adds',
      headers: createAuthorizationHeader(authToken),
      payload: {
        addExercises: [
          { exerciseId: 'global-bench-press', sets: 1, section: 'main' },
          { exerciseId: 'global-bench-press', sets: 1, section: 'cooldown' },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(
      (response.json() as {
        data: { sets: Array<{ exerciseId: string; section: string | null; setNumber: number }> };
      }).data.sets.filter((set) => set.exerciseId === 'global-bench-press'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ section: 'main', setNumber: 1 }),
        expect.objectContaining({ section: 'main', setNumber: 2 }),
        expect.objectContaining({ section: 'main', setNumber: 3 }),
        expect.objectContaining({ section: 'cooldown', setNumber: 1 }),
      ]),
    );
  });

  it('removes exercises by exerciseId and section tuple', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-sectioned-removal',
      userId: 'user-1',
      name: 'Sectioned Removal Session',
      date: '2026-03-12',
      startedAt: Date.now() - 60_000,
      status: 'in-progress',
    });
    seedSessionSet({
      id: 'session-sectioned-removal-main',
      sessionId: 'session-sectioned-removal',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      section: 'main',
    });
    seedSessionSet({
      id: 'session-sectioned-removal-cooldown',
      sessionId: 'session-sectioned-removal',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      section: 'cooldown',
    });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-sectioned-removal',
      headers: createAuthorizationHeader(authToken),
      payload: {
        removeExercises: [{ exerciseId: 'global-bench-press', section: 'warmup' }],
      },
    });
    expect(response.statusCode).toBe(200);

    const sectionRemovalResponse = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-sectioned-removal',
      headers: createAuthorizationHeader(authToken),
      payload: {
        removeExercises: [{ exerciseId: 'global-bench-press', section: 'main' }],
      },
    });

    expect(sectionRemovalResponse.statusCode).toBe(200);
    expect(
      (sectionRemovalResponse.json() as {
        data: { sets: Array<{ exerciseId: string; section: string | null }> };
      }).data.sets,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ exerciseId: 'global-bench-press', section: 'cooldown' }),
      ]),
    );
    expect(
      (sectionRemovalResponse.json() as {
        data: { sets: Array<{ exerciseId: string; section: string | null }> };
      }).data.sets.some(
        (set) => set.exerciseId === 'global-bench-press' && set.section === 'main',
      ),
    ).toBe(false);
  });

  it('requires force to remove exercises that already have logged sets', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-remove-force-guard',
      userId: 'user-1',
      name: 'Force Guard Session',
      date: '2026-03-12',
      startedAt: Date.now() - 60_000,
      status: 'in-progress',
    });
    seedSessionSet({
      id: 'session-remove-force-guard-bench',
      sessionId: 'session-remove-force-guard',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      section: 'main',
      completed: true,
    });
    seedSessionSet({
      id: 'session-remove-force-guard-lat',
      sessionId: 'session-remove-force-guard',
      exerciseId: 'user-1-lat-pulldown',
      setNumber: 1,
      section: 'main',
    });

    const guardedResponse = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-remove-force-guard',
      headers: createAuthorizationHeader(authToken),
      payload: {
        removeExercises: [{ exerciseId: 'global-bench-press', section: 'main' }],
      },
    });

    expect(guardedResponse.statusCode).toBe(409);
    expect(guardedResponse.json()).toEqual({
      error: {
        code: 'WORKOUT_SESSION_EXERCISE_HAS_LOGGED_SETS',
        message: 'Cannot remove an exercise with logged sets',
      },
    });

    const forcedResponse = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-remove-force-guard',
      headers: createAuthorizationHeader(authToken),
      payload: {
        force: true,
        removeExercises: [{ exerciseId: 'global-bench-press', section: 'main' }],
      },
    });

    expect(forcedResponse.statusCode).toBe(200);
    expect(
      (forcedResponse.json() as { data: { sets: Array<{ exerciseId: string }> } }).data.sets.map(
        (set) => set.exerciseId,
      ),
    ).not.toContain('global-bench-press');
  });

  it('removes exercises without force when no sets are logged yet', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-remove-no-force-needed',
      userId: 'user-1',
      name: 'No Force Needed Session',
      date: '2026-03-12',
      startedAt: Date.now() - 60_000,
      status: 'in-progress',
    });
    seedSessionSet({
      id: 'session-remove-no-force-needed-lat',
      sessionId: 'session-remove-no-force-needed',
      exerciseId: 'user-1-lat-pulldown',
      setNumber: 1,
      section: 'main',
      completed: false,
    });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-remove-no-force-needed',
      headers: createAuthorizationHeader(authToken),
      payload: {
        removeExercises: [{ exerciseId: 'user-1-lat-pulldown', section: 'main' }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(
      (response.json() as { data: { sets: Array<{ exerciseId: string }> } }).data.sets.map(
        (set) => set.exerciseId,
      ),
    ).not.toContain('user-1-lat-pulldown');
  });

  it('only checks logged sets within the removed section tuple', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-remove-section-force-scope',
      userId: 'user-1',
      name: 'Section Force Scope Session',
      date: '2026-03-12',
      startedAt: Date.now() - 60_000,
      status: 'in-progress',
    });
    seedSessionSet({
      id: 'session-remove-section-force-scope-main',
      sessionId: 'session-remove-section-force-scope',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      section: 'main',
      completed: true,
    });
    seedSessionSet({
      id: 'session-remove-section-force-scope-cooldown',
      sessionId: 'session-remove-section-force-scope',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      section: 'cooldown',
      completed: false,
    });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-remove-section-force-scope',
      headers: createAuthorizationHeader(authToken),
      payload: {
        removeExercises: [{ exerciseId: 'global-bench-press', section: 'cooldown' }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(
      (response.json() as {
        data: { sets: Array<{ exerciseId: string; section: string | null }> };
      }).data.sets,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ exerciseId: 'global-bench-press', section: 'main' }),
      ]),
    );
    expect(
      (response.json() as {
        data: { sets: Array<{ exerciseId: string; section: string | null }> };
      }).data.sets.some(
        (set) => set.exerciseId === 'global-bench-press' && set.section === 'cooldown',
      ),
    ).toBe(false);
  });

  it('updates exercise superset groups and returns grouped exercise metadata', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-superset-groups',
      userId: 'user-1',
      name: 'Superset Session',
      date: '2026-03-12',
      startedAt: Date.now() - 60_000,
      status: 'in-progress',
    });
    seedSessionSet({
      id: 'session-superset-groups-bench-1',
      sessionId: 'session-superset-groups',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      section: 'main',
    });
    seedSessionSet({
      id: 'session-superset-groups-lat-1',
      sessionId: 'session-superset-groups',
      exerciseId: 'user-1-lat-pulldown',
      setNumber: 1,
      section: 'main',
    });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-superset-groups',
      headers: createAuthorizationHeader(authToken),
      payload: {
        exercises: [
          { exerciseId: 'global-bench-press', supersetGroup: 'push-a' },
          { exerciseId: 'user-1-lat-pulldown', supersetGroup: 'push-a' },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-superset-groups',
        exercises: expect.arrayContaining([
          expect.objectContaining({
            exerciseId: 'global-bench-press',
            supersetGroup: 'push-a',
          }),
          expect.objectContaining({
            exerciseId: 'user-1-lat-pulldown',
            supersetGroup: 'push-a',
          }),
        ]),
      }),
    });
  });

  it('treats omitted supersetGroup in exercise updates as no-op', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedWorkoutSession({
      id: 'session-superset-omit-noop',
      userId: 'user-1',
      name: 'Superset Omit Session',
      date: '2026-03-12',
      startedAt: Date.now() - 60_000,
      status: 'in-progress',
    });
    seedSessionSet({
      id: 'session-superset-omit-bench-1',
      sessionId: 'session-superset-omit-noop',
      exerciseId: 'global-bench-press',
      setNumber: 1,
      supersetGroup: 'push-a',
      section: 'main',
    });
    seedSessionSet({
      id: 'session-superset-omit-lat-1',
      sessionId: 'session-superset-omit-noop',
      exerciseId: 'user-1-lat-pulldown',
      setNumber: 1,
      supersetGroup: 'push-a',
      section: 'main',
    });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-sessions/session-superset-omit-noop',
      headers: createAuthorizationHeader(authToken),
      payload: {
        exercises: [{ exerciseId: 'global-bench-press' }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: 'session-superset-omit-noop',
        exercises: expect.arrayContaining([
          expect.objectContaining({
            exerciseId: 'global-bench-press',
            supersetGroup: 'push-a',
          }),
          expect.objectContaining({
            exerciseId: 'user-1-lat-pulldown',
            supersetGroup: 'push-a',
          }),
        ]),
      }),
    });
  });
});
