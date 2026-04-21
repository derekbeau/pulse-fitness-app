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
  scheduledWorkoutExerciseSets,
  scheduledWorkoutExercises,
  scheduledWorkouts,
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

const seedAgentToken = (
  userId: string,
  token = `plain-agent-token-${userId}`,
  name = `Agent ${userId}`,
) => {
  context.db
    .insert(agentTokens)
    .values({
      id: `agent-token-${userId}`,
      userId,
      name,
      tokenHash: createHash('sha256').update(token).digest('hex'),
    })
    .run();

  return token;
};

const seedTemplate = (values: {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  tags?: string[];
  deletedAt?: string | null;
}) =>
  context.db
    .insert(workoutTemplates)
    .values({
      ...values,
      description: values.description ?? null,
      tags: values.tags ?? [],
      deletedAt: values.deletedAt ?? null,
    })
    .run();

const seedScheduledWorkout = (values: {
  id: string;
  userId: string;
  templateId: string | null;
  date: string;
  sessionId?: string | null;
}) =>
  context.db
    .insert(scheduledWorkouts)
    .values({
      ...values,
      sessionId: values.sessionId ?? null,
    })
    .run();

const seedWorkoutSession = (values: {
  id: string;
  userId: string;
  templateId?: string | null;
  name: string;
  date: string;
  status?: 'scheduled' | 'in-progress' | 'paused' | 'cancelled' | 'completed';
  startedAt?: number;
  timeSegments?: string;
}) =>
  context.db
    .insert(workoutSessions)
    .values({
      id: values.id,
      userId: values.userId,
      templateId: values.templateId ?? null,
      name: values.name,
      date: values.date,
      status: values.status ?? 'completed',
      startedAt: values.startedAt ?? Date.UTC(2026, 2, 12, 10, 0, 0),
      completedAt: Date.UTC(2026, 2, 12, 10, 45, 0),
      duration: 45,
      timeSegments: values.timeSegments ?? '[]',
      feedback: null,
      notes: null,
      deletedAt: null,
    })
    .run();

const seedExercise = (values: {
  id: string;
  userId?: string | null;
  name: string;
  deletedAt?: string | null;
  trackingType?:
    | 'weight_reps'
    | 'weight_seconds'
    | 'bodyweight_reps'
    | 'reps_only'
    | 'reps_seconds'
    | 'seconds_only'
    | 'distance'
    | 'cardio';
}) =>
  context.db
    .insert(exercises)
    .values({
      id: values.id,
      userId: values.userId ?? null,
      name: values.name,
      deletedAt: values.deletedAt ?? null,
      trackingType: values.trackingType ?? 'weight_reps',
      muscleGroups: ['chest'],
      equipment: 'barbell',
      category: 'compound',
      instructions: null,
    })
    .run();

const seedTemplateExercise = (values: {
  id: string;
  templateId: string;
  exerciseId: string;
  section: 'warmup' | 'main' | 'cooldown' | 'supplemental';
  orderIndex: number;
  sets?: number | null;
  repsMin?: number | null;
  repsMax?: number | null;
  tempo?: string | null;
  restSeconds?: number | null;
  supersetGroup?: string | null;
  notes?: string | null;
  programmingNotes?: string | null;
  cues?: string[] | null;
  setTargets?: Array<{
    setNumber: number;
    targetWeight?: number | null;
    targetWeightMin?: number | null;
    targetWeightMax?: number | null;
    targetSeconds?: number | null;
    targetDistance?: number | null;
  }> | null;
}) =>
  context.db
    .insert(templateExercises)
    .values({
      id: values.id,
      templateId: values.templateId,
      exerciseId: values.exerciseId,
      section: values.section,
      orderIndex: values.orderIndex,
      sets: values.sets ?? null,
      repsMin: values.repsMin ?? null,
      repsMax: values.repsMax ?? null,
      tempo: values.tempo ?? null,
      restSeconds: values.restSeconds ?? null,
      supersetGroup: values.supersetGroup ?? null,
      notes: values.notes ?? null,
      programmingNotes: values.programmingNotes ?? null,
      cues: values.cues ?? null,
      setTargets: values.setTargets ?? null,
    })
    .run();

const STRUCTURAL_EXERCISE_IDS = {
  first: '11111111-1111-4111-8111-111111111111',
  second: '22222222-2222-4222-8222-222222222222',
  third: '33333333-3333-4333-8333-333333333333',
} as const;

const UNKNOWN_STRUCTURAL_EXERCISE_ID = '44444444-4444-4444-8444-444444444444';

const seedStructuralSnapshotTemplate = ({
  templateId = 'template-1',
  userId = 'user-1',
}: {
  templateId?: string;
  userId?: string;
} = {}) => {
  seedExercise({
    id: STRUCTURAL_EXERCISE_IDS.first,
    userId,
    name: 'Incline Bench Press',
    trackingType: 'weight_reps',
  });
  seedExercise({
    id: STRUCTURAL_EXERCISE_IDS.second,
    userId,
    name: 'Single-arm Row',
    trackingType: 'weight_reps',
  });
  seedExercise({
    id: STRUCTURAL_EXERCISE_IDS.third,
    userId,
    name: 'Bike Intervals',
    trackingType: 'seconds_only',
  });

  seedTemplateExercise({
    id: 'template-structural-first',
    templateId,
    exerciseId: STRUCTURAL_EXERCISE_IDS.first,
    section: 'main',
    orderIndex: 0,
    sets: 3,
    repsMin: 8,
    repsMax: 8,
    setTargets: [
      { setNumber: 1, targetWeight: 135 },
      { setNumber: 2, targetWeight: 145 },
      { setNumber: 3, targetWeight: 150 },
    ],
  });
  seedTemplateExercise({
    id: 'template-structural-second',
    templateId,
    exerciseId: STRUCTURAL_EXERCISE_IDS.second,
    section: 'main',
    orderIndex: 1,
    sets: 3,
    repsMin: 10,
    repsMax: 10,
    setTargets: [
      { setNumber: 1, targetWeight: 70 },
      { setNumber: 2, targetWeight: 75 },
      { setNumber: 3, targetWeight: 80 },
    ],
  });
  seedTemplateExercise({
    id: 'template-structural-third',
    templateId,
    exerciseId: STRUCTURAL_EXERCISE_IDS.third,
    section: 'main',
    orderIndex: 2,
    sets: 3,
    repsMin: null,
    repsMax: null,
    setTargets: [
      { setNumber: 1, targetSeconds: 60 },
      { setNumber: 2, targetSeconds: 60 },
      { setNumber: 3, targetSeconds: 60 },
    ],
  });
};

const createScheduledWorkoutFromTemplate = async ({
  authToken,
  templateId = 'template-1',
  date = '2026-03-12',
}: {
  authToken: string;
  templateId?: string;
  date?: string;
}) => {
  const response = await context.app.inject({
    method: 'POST',
    url: '/api/v1/scheduled-workouts',
    headers: createAuthorizationHeader(authToken),
    payload: {
      templateId,
      date,
    },
  });
  expect(response.statusCode).toBe(201);

  return (response.json() as { data: { id: string } }).data.id;
};

describe('scheduled workout routes', () => {
  beforeAll(async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-scheduled-workout-routes-'));

    process.env.JWT_SECRET = 'test-scheduled-workout-secret';
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
    context.db.delete(templateExercises).run();
    context.db.delete(exercises).run();
    context.db.delete(workoutTemplates).run();
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
  });

  it('requires auth for scheduled workout CRUD routes', async () => {
    const responses = await Promise.all([
      context.app.inject({
        method: 'POST',
        url: '/api/v1/scheduled-workouts',
        payload: {
          templateId: 'template-1',
          date: '2026-03-10',
        },
      }),
      context.app.inject({
        method: 'GET',
        url: '/api/v1/scheduled-workouts?from=2026-03-10&to=2026-03-16',
      }),
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/scheduled-workouts/schedule-1',
        payload: {
          date: '2026-03-11',
        },
      }),
      context.app.inject({
        method: 'DELETE',
        url: '/api/v1/scheduled-workouts/schedule-1',
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

  it('creates and lists scheduled workouts for the authenticated user within a date range', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedScheduledWorkout({
      id: 'existing-1',
      userId: 'user-1',
      templateId: 'template-2',
      date: '2026-03-14',
    });
    seedScheduledWorkout({
      id: 'other-user-1',
      userId: 'user-2',
      templateId: 'template-3',
      date: '2026-03-12',
    });
    seedScheduledWorkout({
      id: 'outside-range-1',
      userId: 'user-1',
      templateId: 'template-1',
      date: '2026-03-20',
    });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: ' template-1 ',
        date: '2026-03-12',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const createdPayload = createResponse.json() as {
      data: {
        id: string;
        userId: string;
        templateId: string;
        date: string;
        sessionId: string | null;
        exercises: unknown[];
        templateDrift: unknown;
        staleExercises: unknown[];
        templateDeleted: boolean;
        createdAt: number;
        updatedAt: number;
      };
    };

    expect(createdPayload.data).toMatchObject({
      userId: 'user-1',
      templateId: 'template-1',
      date: '2026-03-12',
      sessionId: null,
    });
    expect(createdPayload.data.id).toBeTruthy();
    expect(createdPayload.data.createdAt).toBeTypeOf('number');
    expect(createdPayload.data.updatedAt).toBeTypeOf('number');
    expect(createdPayload.data.exercises).toEqual([]);
    expect(createdPayload.data.templateDrift).toBeNull();
    expect(createdPayload.data.staleExercises).toEqual([]);
    expect(createdPayload.data.templateDeleted).toBe(false);

    const listResponse = await context.app.inject({
      method: 'GET',
      url: '/api/v1/scheduled-workouts?from=2026-03-10&to=2026-03-16',
      headers: createAuthorizationHeader(authToken),
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      data: [
        {
          id: createdPayload.data.id,
          date: '2026-03-12',
          templateId: 'template-1',
          templateName: 'Upper Push',
          sessionId: null,
          createdAt: createdPayload.data.createdAt,
        },
        {
          id: 'existing-1',
          date: '2026-03-14',
          templateId: 'template-2',
          templateName: 'Lower Body',
          sessionId: null,
          createdAt: expect.any(Number),
        },
      ],
    });
  });

  it('creates snapshot rows on POST and stores templateVersion', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedExercise({
      id: 'exercise-swing',
      userId: 'user-1',
      name: 'Kettlebell Swing',
      trackingType: 'weight_reps',
    });
    seedTemplateExercise({
      id: 'template-exercise-swing',
      templateId: 'template-1',
      exerciseId: 'exercise-swing',
      section: 'main',
      orderIndex: 0,
      sets: 2,
      repsMin: 8,
      repsMax: 8,
      notes: 'Fallback note',
      programmingNotes: null,
      restSeconds: 90,
      cues: ['Brace', 'Hinge'],
    });

    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: 'template-1',
        date: '2026-03-12',
      },
    });

    expect(response.statusCode).toBe(201);
    const payload = response.json() as {
      data: {
        id: string;
        exercises: Array<{
          exerciseId: string;
          programmingNotes: string | null;
          sets: Array<{ setNumber: number; reps: number | null }>;
        }>;
      };
    };

    expect(payload.data.exercises).toEqual([
      expect.objectContaining({
        exerciseId: 'exercise-swing',
        programmingNotes: 'Fallback note',
        sets: [
          expect.objectContaining({ setNumber: 1, reps: 8 }),
          expect.objectContaining({ setNumber: 2, reps: 8 }),
        ],
      }),
    ]);

    const templateVersion = context.db
      .select({
        templateVersion: scheduledWorkouts.templateVersion,
      })
      .from(scheduledWorkouts)
      .where(eq(scheduledWorkouts.id, payload.data.id))
      .limit(1)
      .get();
    expect(templateVersion?.templateVersion).toMatch(/^[0-9a-f]{64}$/);

    const exerciseRows = context.db
      .select({ id: scheduledWorkoutExercises.id })
      .from(scheduledWorkoutExercises)
      .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, payload.data.id))
      .all();
    expect(exerciseRows).toHaveLength(1);

    const setRows = context.db
      .select({ id: scheduledWorkoutExerciseSets.id })
      .from(scheduledWorkoutExerciseSets)
      .all();
    expect(setRows).toHaveLength(2);
  });

  it('returns snapshot detail with programming notes and all-clear markers on GET by id', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedExercise({
      id: 'exercise-press',
      userId: 'user-1',
      name: 'Overhead Press',
      trackingType: 'weight_reps',
    });
    seedTemplateExercise({
      id: 'template-exercise-press',
      templateId: 'template-1',
      exerciseId: 'exercise-press',
      section: 'main',
      orderIndex: 0,
      repsMin: 5,
      repsMax: 5,
      programmingNotes: 'Keep glutes tight and bar path straight.',
      restSeconds: 120,
      tempo: '3010',
      setTargets: [
        { setNumber: 1, targetWeight: 95 },
        { setNumber: 2, targetWeight: 105 },
      ],
    });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: 'template-1',
        date: '2026-03-13',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const createdId = (createResponse.json() as { data: { id: string } }).data.id;

    const response = await context.app.inject({
      method: 'GET',
      url: `/api/v1/scheduled-workouts/${createdId}`,
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        id: createdId,
        userId: 'user-1',
        templateId: 'template-1',
        date: '2026-03-13',
        sessionId: null,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
        exercises: [
          {
            exerciseId: 'exercise-press',
            exerciseName: 'Overhead Press',
            section: 'main',
            orderIndex: 0,
            programmingNotes: 'Keep glutes tight and bar path straight.',
            agentNotes: null,
            agentNotesMeta: null,
            templateCues: null,
            supersetGroup: null,
            tempo: '3010',
            restSeconds: 120,
            sets: [
              {
                setNumber: 1,
                repsMin: 5,
                repsMax: 5,
                reps: 5,
                targetWeight: 95,
                targetWeightMin: null,
                targetWeightMax: null,
                targetSeconds: null,
                targetDistance: null,
              },
              {
                setNumber: 2,
                repsMin: 5,
                repsMax: 5,
                reps: 5,
                targetWeight: 105,
                targetWeightMin: null,
                targetWeightMax: null,
                targetSeconds: null,
                targetDistance: null,
              },
            ],
          },
        ],
        templateDrift: null,
        staleExercises: [],
        templateDeleted: false,
        template: expect.objectContaining({
          id: 'template-1',
          name: 'Upper Push',
        }),
      },
    });
  });

  it('returns templateDrift marker when template changes after scheduling', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedExercise({
      id: 'exercise-squat',
      userId: 'user-1',
      name: 'Back Squat',
      trackingType: 'weight_reps',
    });
    seedTemplateExercise({
      id: 'template-exercise-squat',
      templateId: 'template-1',
      exerciseId: 'exercise-squat',
      section: 'main',
      orderIndex: 0,
      repsMin: 5,
      repsMax: 5,
      programmingNotes: 'Drive out of the hole.',
    });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: 'template-1',
        date: '2026-03-14',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const scheduledWorkoutId = (createResponse.json() as { data: { id: string } }).data.id;

    const changedAt = Date.UTC(2026, 2, 14, 14, 30, 0);
    context.db
      .update(templateExercises)
      .set({
        programmingNotes: 'Work up to a strong top set, then backoff.',
      })
      .where(eq(templateExercises.id, 'template-exercise-squat'))
      .run();
    context.db
      .update(workoutTemplates)
      .set({
        updatedAt: changedAt,
      })
      .where(eq(workoutTemplates.id, 'template-1'))
      .run();

    const response = await context.app.inject({
      method: 'GET',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}`,
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: scheduledWorkoutId,
        templateDrift: {
          changedAt,
          summary: 'Template has been updated since scheduling.',
        },
        staleExercises: [],
        templateDeleted: false,
      }),
    });
  });

  it('returns staleExercises marker when snapshot exercises are soft-deleted', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedExercise({
      id: 'exercise-stale',
      userId: 'user-1',
      name: 'Dips',
      trackingType: 'bodyweight_reps',
    });
    seedTemplateExercise({
      id: 'template-exercise-stale',
      templateId: 'template-1',
      exerciseId: 'exercise-stale',
      section: 'main',
      orderIndex: 0,
      programmingNotes: 'Controlled depth.',
    });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: 'template-1',
        date: '2026-03-15',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const scheduledWorkoutId = (createResponse.json() as { data: { id: string } }).data.id;

    context.db
      .update(exercises)
      .set({
        deletedAt: '2026-03-15T12:00:00.000Z',
      })
      .where(eq(exercises.id, 'exercise-stale'))
      .run();

    const response = await context.app.inject({
      method: 'GET',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}`,
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: scheduledWorkoutId,
        templateDrift: null,
        staleExercises: [
          {
            exerciseId: 'exercise-stale',
            snapshotName: 'Dips',
          },
        ],
        templateDeleted: false,
      }),
    });
  });

  it('returns templateDeleted marker when the source template is soft-deleted', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedExercise({
      id: 'exercise-row',
      userId: 'user-1',
      name: 'Barbell Row',
      trackingType: 'weight_reps',
    });
    seedTemplateExercise({
      id: 'template-exercise-row',
      templateId: 'template-1',
      exerciseId: 'exercise-row',
      section: 'main',
      orderIndex: 0,
      programmingNotes: 'Pull to lower ribs.',
    });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: 'template-1',
        date: '2026-03-16',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const scheduledWorkoutId = (createResponse.json() as { data: { id: string } }).data.id;

    context.db
      .update(workoutTemplates)
      .set({
        deletedAt: '2026-03-16T08:00:00.000Z',
      })
      .where(eq(workoutTemplates.id, 'template-1'))
      .run();

    const response = await context.app.inject({
      method: 'GET',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}`,
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: scheduledWorkoutId,
        templateDrift: null,
        staleExercises: [],
        templateDeleted: true,
        template: null,
      }),
    });
  });

  it('updates scheduled workout exercise notes with AgentToken auth and server-written metadata', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const agentToken = seedAgentToken('user-1', 'scheduled-notes-agent', 'Coach Pulse');

    seedExercise({
      id: 'exercise-notes-source',
      userId: 'user-1',
      name: 'Kettlebell Swing',
      trackingType: 'weight_reps',
    });
    seedTemplateExercise({
      id: 'template-exercise-notes-source',
      templateId: 'template-1',
      exerciseId: 'exercise-notes-source',
      section: 'main',
      orderIndex: 0,
      sets: 3,
      repsMin: 12,
      repsMax: 12,
      programmingNotes: 'Keep the hinge explosive.',
    });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: 'template-1',
        date: '2026-03-12',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const scheduledWorkoutId = (createResponse.json() as { data: { id: string } }).data.id;

    const response = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercise-notes`,
      headers: createAgentTokenHeader(agentToken),
      payload: {
        notes: [
          {
            exerciseId: 'exercise-notes-source',
            agentNotes: '  Last session was easy; increase load by 5%.  ',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as {
      data: {
        exercises: Array<{
          exerciseId: string;
          agentNotes: string | null;
          agentNotesMeta: {
            author: string;
            generatedAt: string;
            scheduledDateAtGeneration: string;
            stale: boolean;
          } | null;
        }>;
      };
    };
    expect(payload.data.exercises).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          exerciseId: 'exercise-notes-source',
          agentNotes: 'Last session was easy; increase load by 5%.',
          agentNotesMeta: expect.objectContaining({
            author: 'Coach Pulse',
            scheduledDateAtGeneration: '2026-03-12',
            stale: false,
          }),
        }),
      ]),
    );
    const agentNotesMeta = payload.data.exercises[0]?.agentNotesMeta;
    expect(typeof agentNotesMeta?.generatedAt).toBe('string');
    expect(new Date(agentNotesMeta?.generatedAt ?? '').toISOString()).toBe(
      agentNotesMeta?.generatedAt,
    );

    const storedExercise = context.db
      .select({
        agentNotes: scheduledWorkoutExercises.agentNotes,
        agentNotesMeta: scheduledWorkoutExercises.agentNotesMeta,
      })
      .from(scheduledWorkoutExercises)
      .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
      .limit(1)
      .get();

    expect(storedExercise).toEqual({
      agentNotes: 'Last session was easy; increase load by 5%.',
      agentNotesMeta: expect.objectContaining({
        author: 'Coach Pulse',
        scheduledDateAtGeneration: '2026-03-12',
        stale: false,
      }),
    });
  });

  it('clears exercise agent notes and metadata when agentNotes is null', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const agentToken = seedAgentToken('user-1', 'scheduled-notes-clear-agent');

    seedExercise({
      id: 'exercise-notes-clear',
      userId: 'user-1',
      name: 'Goblet Squat',
      trackingType: 'weight_reps',
    });
    seedTemplateExercise({
      id: 'template-exercise-notes-clear',
      templateId: 'template-1',
      exerciseId: 'exercise-notes-clear',
      section: 'main',
      orderIndex: 0,
      programmingNotes: 'Stay tall at the bottom.',
    });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: 'template-1',
        date: '2026-03-12',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const scheduledWorkoutId = (createResponse.json() as { data: { id: string } }).data.id;

    const setResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercise-notes`,
      headers: createAgentTokenHeader(agentToken),
      payload: {
        notes: [
          {
            exerciseId: 'exercise-notes-clear',
            agentNotes: 'Work up gradually.',
          },
        ],
      },
    });
    expect(setResponse.statusCode).toBe(200);

    const clearResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercise-notes`,
      headers: createAgentTokenHeader(agentToken),
      payload: {
        notes: [
          {
            exerciseId: 'exercise-notes-clear',
            agentNotes: null,
          },
        ],
      },
    });
    expect(clearResponse.statusCode).toBe(200);
    expect(clearResponse.json()).toEqual({
      data: expect.objectContaining({
        id: scheduledWorkoutId,
        exercises: [expect.objectContaining({ agentNotes: null, agentNotesMeta: null })],
      }),
    });

    const storedExercise = context.db
      .select({
        agentNotes: scheduledWorkoutExercises.agentNotes,
        agentNotesMeta: scheduledWorkoutExercises.agentNotesMeta,
      })
      .from(scheduledWorkoutExercises)
      .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
      .limit(1)
      .get();

    expect(storedExercise).toEqual({
      agentNotes: null,
      agentNotesMeta: null,
    });
  });

  it('rejects exercise-notes updates for JWT callers', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedExercise({
      id: 'exercise-notes-jwt-forbidden',
      userId: 'user-1',
      name: 'Single-arm Row',
      trackingType: 'weight_reps',
    });
    seedTemplateExercise({
      id: 'template-exercise-notes-jwt-forbidden',
      templateId: 'template-1',
      exerciseId: 'exercise-notes-jwt-forbidden',
      section: 'main',
      orderIndex: 0,
    });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: 'template-1',
        date: '2026-03-12',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const scheduledWorkoutId = (createResponse.json() as { data: { id: string } }).data.id;

    const response = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercise-notes`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        notes: [
          {
            exerciseId: 'exercise-notes-jwt-forbidden',
            agentNotes: 'Test note',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'Agent token authentication required',
      },
    });
  });

  it('rejects exercise-notes updates for exercise ids not present in the snapshot', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const agentToken = seedAgentToken('user-1', 'scheduled-notes-unknown-exercise-agent');

    seedExercise({
      id: 'exercise-notes-known',
      userId: 'user-1',
      name: 'Push-up',
      trackingType: 'bodyweight_reps',
    });
    seedTemplateExercise({
      id: 'template-exercise-notes-known',
      templateId: 'template-1',
      exerciseId: 'exercise-notes-known',
      section: 'main',
      orderIndex: 0,
    });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: 'template-1',
        date: '2026-03-12',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const scheduledWorkoutId = (createResponse.json() as { data: { id: string } }).data.id;

    const response = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercise-notes`,
      headers: createAgentTokenHeader(agentToken),
      payload: {
        notes: [
          {
            exerciseId: 'exercise-does-not-exist-in-snapshot',
            agentNotes: 'Test note',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('Unknown exerciseId values'),
      },
    });
  });

  it('swaps snapshot exercises for JWT callers', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedExercise({
      id: 'exercise-swap-source',
      userId: 'user-1',
      name: 'Barbell Bench Press',
      trackingType: 'weight_reps',
    });
    seedExercise({
      id: 'exercise-swap-target',
      userId: 'user-1',
      name: 'Incline Dumbbell Press',
      trackingType: 'weight_reps',
    });
    seedTemplateExercise({
      id: 'template-exercise-swap-source',
      templateId: 'template-1',
      exerciseId: 'exercise-swap-source',
      section: 'main',
      orderIndex: 0,
      sets: 3,
      repsMin: 8,
      repsMax: 8,
      programmingNotes: 'Touch and go.',
    });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: 'template-1',
        date: '2026-03-12',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const scheduledWorkoutId = (createResponse.json() as { data: { id: string } }).data.id;

    const response = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercise-swap`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        fromExerciseId: 'exercise-swap-source',
        toExerciseId: 'exercise-swap-target',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: scheduledWorkoutId,
        exercises: [
          expect.objectContaining({
            exerciseId: 'exercise-swap-target',
            programmingNotes: null,
          }),
        ],
      }),
    });

    const swappedRows = context.db
      .select({
        exerciseId: scheduledWorkoutExercises.exerciseId,
      })
      .from(scheduledWorkoutExercises)
      .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
      .all();
    expect(swappedRows).toEqual([{ exerciseId: 'exercise-swap-target' }]);
  });

  it('clears exercise agent notes metadata when swapping exercises', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedExercise({
      id: 'exercise-swap-notes-source',
      userId: 'user-1',
      name: 'Barbell Bench Press',
      trackingType: 'weight_reps',
    });
    seedExercise({
      id: 'exercise-swap-notes-target',
      userId: 'user-1',
      name: 'Incline Dumbbell Press',
      trackingType: 'weight_reps',
    });
    seedTemplateExercise({
      id: 'template-exercise-swap-notes-source',
      templateId: 'template-1',
      exerciseId: 'exercise-swap-notes-source',
      section: 'main',
      orderIndex: 0,
      programmingNotes: 'Touch and go.',
    });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: 'template-1',
        date: '2026-03-12',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const scheduledWorkoutId = (createResponse.json() as { data: { id: string } }).data.id;

    context.db
      .update(scheduledWorkoutExercises)
      .set({
        agentNotes: 'Try 62 lb today.',
        agentNotesMeta: {
          author: 'Coach Pulse',
          generatedAt: '2026-03-11T00:00:00.000Z',
          scheduledDateAtGeneration: '2026-03-12',
          stale: false,
        },
      })
      .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
      .run();

    const response = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercise-swap`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        fromExerciseId: 'exercise-swap-notes-source',
        toExerciseId: 'exercise-swap-notes-target',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: scheduledWorkoutId,
        exercises: [
          expect.objectContaining({
            exerciseId: 'exercise-swap-notes-target',
            agentNotes: null,
            agentNotesMeta: null,
          }),
        ],
      }),
    });

    const swappedRows = context.db
      .select({
        exerciseId: scheduledWorkoutExercises.exerciseId,
        agentNotes: scheduledWorkoutExercises.agentNotes,
        agentNotesMeta: scheduledWorkoutExercises.agentNotesMeta,
      })
      .from(scheduledWorkoutExercises)
      .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
      .all();
    expect(swappedRows).toEqual([
      {
        exerciseId: 'exercise-swap-notes-target',
        agentNotes: null,
        agentNotesMeta: null,
      },
    ]);
  });

  it('swaps snapshot exercises for AgentToken callers and supports carry-over options', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const agentToken = seedAgentToken('user-1', 'scheduled-swap-agent');

    seedExercise({
      id: 'exercise-swap-agent-source',
      userId: 'user-1',
      name: 'Goblet Squat',
      trackingType: 'weight_reps',
    });
    seedExercise({
      id: 'exercise-swap-agent-target',
      userId: 'user-1',
      name: 'Front Squat',
      trackingType: 'weight_reps',
    });
    seedTemplateExercise({
      id: 'template-exercise-swap-agent-source',
      templateId: 'template-1',
      exerciseId: 'exercise-swap-agent-source',
      section: 'main',
      orderIndex: 0,
      sets: 2,
      repsMin: 10,
      repsMax: 10,
      programmingNotes: 'Brace before each rep.',
    });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: 'template-1',
        date: '2026-03-12',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const scheduledWorkoutId = (createResponse.json() as { data: { id: string } }).data.id;

    const response = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercise-swap`,
      headers: createAgentTokenHeader(agentToken),
      payload: {
        fromExerciseId: 'exercise-swap-agent-source',
        toExerciseId: 'exercise-swap-agent-target',
        carryOverProgrammingNotes: true,
        preserveSets: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: scheduledWorkoutId,
        exercises: [
          expect.objectContaining({
            exerciseId: 'exercise-swap-agent-target',
            programmingNotes: 'Brace before each rep.',
            sets: [
              expect.objectContaining({ setNumber: 1, reps: 10 }),
              expect.objectContaining({ setNumber: 2, reps: 10 }),
            ],
          }),
        ],
      }),
    });
  });

  it('removes snapshot exercises when swapped to null', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedExercise({
      id: 'exercise-swap-remove-source',
      userId: 'user-1',
      name: 'Push-up',
      trackingType: 'bodyweight_reps',
    });
    seedTemplateExercise({
      id: 'template-exercise-swap-remove-source',
      templateId: 'template-1',
      exerciseId: 'exercise-swap-remove-source',
      section: 'main',
      orderIndex: 0,
      sets: 3,
      repsMin: 12,
      repsMax: 12,
    });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: 'template-1',
        date: '2026-03-12',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const scheduledWorkoutId = (createResponse.json() as { data: { id: string } }).data.id;

    const removeResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercise-swap`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        fromExerciseId: 'exercise-swap-remove-source',
        toExerciseId: null,
      },
    });
    expect(removeResponse.statusCode).toBe(200);

    const detailResponse = await context.app.inject({
      method: 'GET',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}`,
      headers: createAuthorizationHeader(authToken),
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toEqual({
      data: expect.objectContaining({
        id: scheduledWorkoutId,
        exercises: [],
      }),
    });
  });

  it('rejects identity exercise swaps', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedExercise({
      id: 'exercise-swap-identity',
      userId: 'user-1',
      name: 'Back Squat',
      trackingType: 'weight_reps',
    });
    seedTemplateExercise({
      id: 'template-exercise-swap-identity',
      templateId: 'template-1',
      exerciseId: 'exercise-swap-identity',
      section: 'main',
      orderIndex: 0,
    });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: 'template-1',
        date: '2026-03-12',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const scheduledWorkoutId = (createResponse.json() as { data: { id: string } }).data.id;

    const response = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercise-swap`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        fromExerciseId: 'exercise-swap-identity',
        toExerciseId: 'exercise-swap-identity',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'INVALID_SCHEDULED_WORKOUT_EXERCISE',
        message: 'Exercise is not available for this user',
      },
    });
  });

  it('reorders scheduled workout snapshot exercises and is idempotent for JWT callers', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    seedStructuralSnapshotTemplate();
    const scheduledWorkoutId = await createScheduledWorkoutFromTemplate({ authToken });
    const reversedOrder = [
      STRUCTURAL_EXERCISE_IDS.third,
      STRUCTURAL_EXERCISE_IDS.second,
      STRUCTURAL_EXERCISE_IDS.first,
    ];

    const firstResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/reorder`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        order: reversedOrder,
      },
    });

    expect(firstResponse.statusCode).toBe(200);
    const firstPayload = firstResponse.json() as {
      data: {
        exercises: Array<{ exerciseId: string; orderIndex: number }>;
      };
      agent?: unknown;
    };
    expect(firstPayload.agent).toBeUndefined();
    expect(firstPayload.data.exercises.map((exercise) => exercise.exerciseId)).toEqual(reversedOrder);
    expect(firstPayload.data.exercises.map((exercise) => exercise.orderIndex)).toEqual([0, 1, 2]);

    const secondResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/reorder`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        order: reversedOrder,
      },
    });

    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.json()).toEqual(firstPayload);
  });

  it('supports AgentToken auth for reorder and rejects missing auth', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const agentToken = seedAgentToken('user-1', 'scheduled-reorder-agent');
    seedStructuralSnapshotTemplate();
    const scheduledWorkoutId = await createScheduledWorkoutFromTemplate({ authToken });

    const authedResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/reorder`,
      headers: createAgentTokenHeader(agentToken),
      payload: {
        order: [
          STRUCTURAL_EXERCISE_IDS.third,
          STRUCTURAL_EXERCISE_IDS.second,
          STRUCTURAL_EXERCISE_IDS.first,
        ],
      },
    });

    expect(authedResponse.statusCode).toBe(200);
    expect(authedResponse.json()).toEqual({
      data: expect.objectContaining({ id: scheduledWorkoutId }),
      agent: expect.objectContaining({
        hints: expect.any(Array),
        suggestedActions: expect.any(Array),
      }),
    });

    const noAuthResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/reorder`,
      payload: {
        order: [
          STRUCTURAL_EXERCISE_IDS.third,
          STRUCTURAL_EXERCISE_IDS.second,
          STRUCTURAL_EXERCISE_IDS.first,
        ],
      },
    });

    expect(noAuthResponse.statusCode).toBe(401);
    expect(noAuthResponse.json()).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  });

  it('returns validation and invalid-order errors for scheduled-workout reorder', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    seedStructuralSnapshotTemplate();
    const scheduledWorkoutId = await createScheduledWorkoutFromTemplate({ authToken });

    const invalidBodyResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/reorder`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        order: ['not-a-uuid'],
      },
    });
    expect(invalidBodyResponse.statusCode).toBe(400);
    expectRequestValidationError(
      invalidBodyResponse,
      'PATCH',
      `/api/v1/scheduled-workouts/${scheduledWorkoutId}/reorder`,
    );

    const invalidOrderResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/reorder`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        order: [
          STRUCTURAL_EXERCISE_IDS.first,
          STRUCTURAL_EXERCISE_IDS.second,
          UNKNOWN_STRUCTURAL_EXERCISE_ID,
        ],
      },
    });
    expect(invalidOrderResponse.statusCode).toBe(400);
    expect(invalidOrderResponse.json()).toEqual({
      error: {
        code: 'INVALID_SCHEDULED_WORKOUT_EXERCISE_ORDER',
        message: 'Order must include each snapshot exercise exactly once',
        details: {
          missingExerciseIds: [STRUCTURAL_EXERCISE_IDS.third],
          extraExerciseIds: [UNKNOWN_STRUCTURAL_EXERCISE_ID],
          duplicateExerciseIds: [],
        },
      },
    });
  });

  it('returns 404 for reorder when schedule is missing or outside user scope', async () => {
    const userOneToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const userTwoToken = context.app.jwt.sign(
      { sub: 'user-2', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedStructuralSnapshotTemplate({ templateId: 'template-3', userId: 'user-2' });
    const otherUserScheduledWorkoutId = await createScheduledWorkoutFromTemplate({
      authToken: userTwoToken,
      templateId: 'template-3',
    });

    const [missingResponse, scopeResponse] = await Promise.all([
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/scheduled-workouts/schedule-missing/reorder',
        headers: createAuthorizationHeader(userOneToken),
        payload: {
          order: [STRUCTURAL_EXERCISE_IDS.first],
        },
      }),
      context.app.inject({
        method: 'PATCH',
        url: `/api/v1/scheduled-workouts/${otherUserScheduledWorkoutId}/reorder`,
        headers: createAuthorizationHeader(userOneToken),
        payload: {
          order: [
            STRUCTURAL_EXERCISE_IDS.third,
            STRUCTURAL_EXERCISE_IDS.second,
            STRUCTURAL_EXERCISE_IDS.first,
          ],
        },
      }),
    ]);

    for (const response of [missingResponse, scopeResponse]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          code: 'SCHEDULED_WORKOUT_NOT_FOUND',
          message: 'Scheduled workout not found',
        },
      });
    }
  });

  it('updates scheduled workout exercise fields and is idempotent for JWT callers', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    seedStructuralSnapshotTemplate();
    const scheduledWorkoutId = await createScheduledWorkoutFromTemplate({ authToken });
    const payload = {
      updates: [
        {
          exerciseId: STRUCTURAL_EXERCISE_IDS.first,
          supersetGroup: 'A',
          section: 'main',
          tempo: '3011',
          restSeconds: 75,
          programmingNotes: 'Keep elbows stacked under wrists.',
        },
        {
          exerciseId: STRUCTURAL_EXERCISE_IDS.second,
          supersetGroup: 'A',
          programmingNotes: null,
        },
      ],
    };

    const firstResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercises`,
      headers: createAuthorizationHeader(authToken),
      payload,
    });
    expect(firstResponse.statusCode).toBe(200);
    const firstPayload = firstResponse.json() as {
      data: {
        exercises: Array<{
          exerciseId: string;
          supersetGroup: string | null;
          section: string;
          tempo: string | null;
          restSeconds: number | null;
          programmingNotes: string | null;
        }>;
      };
      agent?: unknown;
    };
    expect(firstPayload.agent).toBeUndefined();
    expect(firstPayload.data.exercises).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          exerciseId: STRUCTURAL_EXERCISE_IDS.first,
          supersetGroup: 'A',
          section: 'main',
          tempo: '3011',
          restSeconds: 75,
          programmingNotes: 'Keep elbows stacked under wrists.',
        }),
        expect.objectContaining({
          exerciseId: STRUCTURAL_EXERCISE_IDS.second,
          supersetGroup: 'A',
          programmingNotes: null,
        }),
      ]),
    );

    const secondResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercises`,
      headers: createAuthorizationHeader(authToken),
      payload,
    });
    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.json()).toEqual(firstPayload);
  });

  it('supports AgentToken auth for exercise updates and rejects missing auth', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const agentToken = seedAgentToken('user-1', 'scheduled-exercise-update-agent');
    seedStructuralSnapshotTemplate();
    const scheduledWorkoutId = await createScheduledWorkoutFromTemplate({ authToken });

    const authedResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercises`,
      headers: createAgentTokenHeader(agentToken),
      payload: {
        updates: [
          {
            exerciseId: STRUCTURAL_EXERCISE_IDS.first,
            supersetGroup: 'A',
          },
        ],
      },
    });
    expect(authedResponse.statusCode).toBe(200);
    expect(authedResponse.json()).toEqual({
      data: expect.objectContaining({ id: scheduledWorkoutId }),
      agent: expect.objectContaining({
        hints: expect.any(Array),
        suggestedActions: expect.any(Array),
      }),
    });

    const noAuthResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercises`,
      payload: {
        updates: [
          {
            exerciseId: STRUCTURAL_EXERCISE_IDS.first,
            supersetGroup: 'A',
          },
        ],
      },
    });
    expect(noAuthResponse.statusCode).toBe(401);
  });

  it('returns validation and unknown-exercise errors for scheduled-workout exercise updates', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    seedStructuralSnapshotTemplate();
    const scheduledWorkoutId = await createScheduledWorkoutFromTemplate({ authToken });

    const invalidBodyResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercises`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        updates: [
          {
            exerciseId: STRUCTURAL_EXERCISE_IDS.first,
            section: 'supplemental',
          },
        ],
      },
    });
    expect(invalidBodyResponse.statusCode).toBe(400);
    expectRequestValidationError(
      invalidBodyResponse,
      'PATCH',
      `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercises`,
    );

    const unknownExerciseResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercises`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        updates: [
          {
            exerciseId: UNKNOWN_STRUCTURAL_EXERCISE_ID,
            supersetGroup: 'A',
          },
        ],
      },
    });
    expect(unknownExerciseResponse.statusCode).toBe(400);
    expect(unknownExerciseResponse.json()).toEqual({
      error: {
        code: 'UNKNOWN_SCHEDULED_WORKOUT_EXERCISE',
        message: `Exercise is not present in this scheduled workout snapshot: ${UNKNOWN_STRUCTURAL_EXERCISE_ID}`,
      },
    });
  });

  it('returns 404 for exercise updates when schedule is missing or outside user scope', async () => {
    const userOneToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const userTwoToken = context.app.jwt.sign(
      { sub: 'user-2', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedStructuralSnapshotTemplate({ templateId: 'template-3', userId: 'user-2' });
    const otherUserScheduledWorkoutId = await createScheduledWorkoutFromTemplate({
      authToken: userTwoToken,
      templateId: 'template-3',
    });

    const [missingResponse, scopeResponse] = await Promise.all([
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/scheduled-workouts/schedule-missing/exercises',
        headers: createAuthorizationHeader(userOneToken),
        payload: {
          updates: [{ exerciseId: STRUCTURAL_EXERCISE_IDS.first, supersetGroup: 'A' }],
        },
      }),
      context.app.inject({
        method: 'PATCH',
        url: `/api/v1/scheduled-workouts/${otherUserScheduledWorkoutId}/exercises`,
        headers: createAuthorizationHeader(userOneToken),
        payload: {
          updates: [{ exerciseId: STRUCTURAL_EXERCISE_IDS.first, supersetGroup: 'A' }],
        },
      }),
    ]);

    for (const response of [missingResponse, scopeResponse]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          code: 'SCHEDULED_WORKOUT_NOT_FOUND',
          message: 'Scheduled workout not found',
        },
      });
    }
  });

  it('updates scheduled workout set prescriptions and is idempotent for JWT callers', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    seedStructuralSnapshotTemplate();
    const scheduledWorkoutId = await createScheduledWorkoutFromTemplate({ authToken });
    const payload = {
      exerciseId: STRUCTURAL_EXERCISE_IDS.third,
      sets: [
        { setNumber: 1, targetSeconds: 120 },
        { setNumber: 2, remove: true },
        { setNumber: 3, remove: true },
      ],
    };

    const firstResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercise-sets`,
      headers: createAuthorizationHeader(authToken),
      payload,
    });
    expect(firstResponse.statusCode).toBe(200);
    const firstPayload = firstResponse.json() as {
      data: {
        exercises: Array<{
          exerciseId: string;
          sets: Array<{ setNumber: number; targetSeconds: number | null }>;
        }>;
      };
      agent?: unknown;
    };
    expect(firstPayload.agent).toBeUndefined();
    const updatedExercise = firstPayload.data.exercises.find(
      (exercise) => exercise.exerciseId === STRUCTURAL_EXERCISE_IDS.third,
    );
    expect(updatedExercise).toBeDefined();
    expect(updatedExercise?.sets).toEqual([
      expect.objectContaining({
        setNumber: 1,
        targetSeconds: 120,
      }),
    ]);

    const secondResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercise-sets`,
      headers: createAuthorizationHeader(authToken),
      payload,
    });
    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.json()).toEqual(firstPayload);
  });

  it('supports AgentToken auth for exercise-set updates and rejects missing auth', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const agentToken = seedAgentToken('user-1', 'scheduled-exercise-sets-agent');
    seedStructuralSnapshotTemplate();
    const scheduledWorkoutId = await createScheduledWorkoutFromTemplate({ authToken });

    const authedResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercise-sets`,
      headers: createAgentTokenHeader(agentToken),
      payload: {
        exerciseId: STRUCTURAL_EXERCISE_IDS.first,
        sets: [{ setNumber: 1, targetWeight: 155 }],
      },
    });
    expect(authedResponse.statusCode).toBe(200);
    expect(authedResponse.json()).toEqual({
      data: expect.objectContaining({ id: scheduledWorkoutId }),
      agent: expect.objectContaining({
        hints: expect.any(Array),
        suggestedActions: expect.any(Array),
      }),
    });

    const noAuthResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercise-sets`,
      payload: {
        exerciseId: STRUCTURAL_EXERCISE_IDS.first,
        sets: [{ setNumber: 1, targetWeight: 155 }],
      },
    });
    expect(noAuthResponse.statusCode).toBe(401);
  });

  it('returns validation and unknown-exercise errors for scheduled-workout exercise-set updates', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    seedStructuralSnapshotTemplate();
    const scheduledWorkoutId = await createScheduledWorkoutFromTemplate({ authToken });

    const invalidBodyResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercise-sets`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        exerciseId: STRUCTURAL_EXERCISE_IDS.third,
        sets: [{ setNumber: 2, remove: true, targetSeconds: 45 }],
      },
    });
    expect(invalidBodyResponse.statusCode).toBe(400);
    expectRequestValidationError(
      invalidBodyResponse,
      'PATCH',
      `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercise-sets`,
    );

    const unknownExerciseResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercise-sets`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        exerciseId: UNKNOWN_STRUCTURAL_EXERCISE_ID,
        sets: [{ setNumber: 1, targetSeconds: 60 }],
      },
    });
    expect(unknownExerciseResponse.statusCode).toBe(400);
    expect(unknownExerciseResponse.json()).toEqual({
      error: {
        code: 'UNKNOWN_SCHEDULED_WORKOUT_EXERCISE',
        message: `Exercise is not present in this scheduled workout snapshot: ${UNKNOWN_STRUCTURAL_EXERCISE_ID}`,
      },
    });
  });

  it('returns 404 for exercise-set updates when schedule is missing or outside user scope', async () => {
    const userOneToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const userTwoToken = context.app.jwt.sign(
      { sub: 'user-2', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedStructuralSnapshotTemplate({ templateId: 'template-3', userId: 'user-2' });
    const otherUserScheduledWorkoutId = await createScheduledWorkoutFromTemplate({
      authToken: userTwoToken,
      templateId: 'template-3',
    });

    const [missingResponse, scopeResponse] = await Promise.all([
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/scheduled-workouts/schedule-missing/exercise-sets',
        headers: createAuthorizationHeader(userOneToken),
        payload: {
          exerciseId: STRUCTURAL_EXERCISE_IDS.first,
          sets: [{ setNumber: 1, targetWeight: 155 }],
        },
      }),
      context.app.inject({
        method: 'PATCH',
        url: `/api/v1/scheduled-workouts/${otherUserScheduledWorkoutId}/exercise-sets`,
        headers: createAuthorizationHeader(userOneToken),
        payload: {
          exerciseId: STRUCTURAL_EXERCISE_IDS.first,
          sets: [{ setNumber: 1, targetWeight: 155 }],
        },
      }),
    ]);

    for (const response of [missingResponse, scopeResponse]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          code: 'SCHEDULED_WORKOUT_NOT_FOUND',
          message: 'Scheduled workout not found',
        },
      });
    }
  });

  it('seeds new sessions from edited scheduled snapshots and leaves the template unchanged', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedStructuralSnapshotTemplate();
    const templateBefore = context.db
      .select({
        id: templateExercises.id,
        exerciseId: templateExercises.exerciseId,
        section: templateExercises.section,
        orderIndex: templateExercises.orderIndex,
        supersetGroup: templateExercises.supersetGroup,
        tempo: templateExercises.tempo,
        restSeconds: templateExercises.restSeconds,
        programmingNotes: templateExercises.programmingNotes,
        setTargets: templateExercises.setTargets,
      })
      .from(templateExercises)
      .where(eq(templateExercises.templateId, 'template-1'))
      .all()
      .sort((left, right) => left.orderIndex - right.orderIndex);

    const scheduledWorkoutId = await createScheduledWorkoutFromTemplate({
      authToken,
      date: '2026-03-20',
    });

    const reorderResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/reorder`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        order: [
          STRUCTURAL_EXERCISE_IDS.third,
          STRUCTURAL_EXERCISE_IDS.second,
          STRUCTURAL_EXERCISE_IDS.first,
        ],
      },
    });
    expect(reorderResponse.statusCode).toBe(200);

    const updateExercisesResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercises`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        updates: [
          { exerciseId: STRUCTURAL_EXERCISE_IDS.third, supersetGroup: 'A' },
          { exerciseId: STRUCTURAL_EXERCISE_IDS.second, supersetGroup: 'A' },
        ],
      },
    });
    expect(updateExercisesResponse.statusCode).toBe(200);
    expect(updateExercisesResponse.json()).toEqual({
      data: expect.objectContaining({
        exercises: expect.arrayContaining([
          expect.objectContaining({
            exerciseId: STRUCTURAL_EXERCISE_IDS.third,
            supersetGroup: 'A',
          }),
          expect.objectContaining({
            exerciseId: STRUCTURAL_EXERCISE_IDS.second,
            supersetGroup: 'A',
          }),
        ]),
      }),
    });

    const updateSetsResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercise-sets`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        exerciseId: STRUCTURAL_EXERCISE_IDS.third,
        sets: [
          { setNumber: 2, remove: true },
          { setNumber: 3, remove: true },
        ],
      },
    });
    expect(updateSetsResponse.statusCode).toBe(200);

    const startSessionResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions',
      headers: createAuthorizationHeader(authToken),
      payload: {
        scheduledWorkoutId,
        date: '2026-03-20',
        startedAt: Date.parse('2026-03-20T06:30:00.000Z'),
      },
    });
    expect(startSessionResponse.statusCode).toBe(201);
    const sessionPayload = startSessionResponse.json() as {
      data: {
        id: string;
        sets: Array<{
          exerciseId: string;
          orderIndex: number | null;
          setNumber: number;
        }>;
      };
    };

    const sortedSessionSets = context.db
      .select({
        exerciseId: sessionSets.exerciseId,
        orderIndex: sessionSets.orderIndex,
        setNumber: sessionSets.setNumber,
        supersetGroup: sessionSets.supersetGroup,
      })
      .from(sessionSets)
      .where(eq(sessionSets.sessionId, sessionPayload.data.id))
      .all()
      .sort((left, right) => {
        const leftOrderIndex = left.orderIndex ?? Number.MAX_SAFE_INTEGER;
        const rightOrderIndex = right.orderIndex ?? Number.MAX_SAFE_INTEGER;
        if (leftOrderIndex !== rightOrderIndex) {
          return leftOrderIndex - rightOrderIndex;
        }

        return left.setNumber - right.setNumber;
      });

    const exerciseOrder = [...new Set(sortedSessionSets.map((set) => set.exerciseId))];
    expect(exerciseOrder).toEqual([
      STRUCTURAL_EXERCISE_IDS.third,
      STRUCTURAL_EXERCISE_IDS.second,
      STRUCTURAL_EXERCISE_IDS.first,
    ]);

    const setsByExerciseId = sortedSessionSets.reduce<Record<string, typeof sortedSessionSets>>(
      (accumulator, set) => {
        if (!set.exerciseId) {
          return accumulator;
        }
        const existing = accumulator[set.exerciseId] ?? [];
        accumulator[set.exerciseId] = [...existing, set];
        return accumulator;
      },
      {},
    );

    expect(setsByExerciseId[STRUCTURAL_EXERCISE_IDS.third]).toHaveLength(1);
    expect(setsByExerciseId[STRUCTURAL_EXERCISE_IDS.second]).toHaveLength(3);
    expect(setsByExerciseId[STRUCTURAL_EXERCISE_IDS.first]).toHaveLength(3);

    expect(
      setsByExerciseId[STRUCTURAL_EXERCISE_IDS.third]?.every((set) => set.supersetGroup === 'A'),
    ).toBe(true);
    expect(
      setsByExerciseId[STRUCTURAL_EXERCISE_IDS.second]?.every((set) => set.supersetGroup === 'A'),
    ).toBe(true);
    expect(
      setsByExerciseId[STRUCTURAL_EXERCISE_IDS.first]?.every((set) => set.supersetGroup === null),
    ).toBe(true);

    const templateAfter = context.db
      .select({
        id: templateExercises.id,
        exerciseId: templateExercises.exerciseId,
        section: templateExercises.section,
        orderIndex: templateExercises.orderIndex,
        supersetGroup: templateExercises.supersetGroup,
        tempo: templateExercises.tempo,
        restSeconds: templateExercises.restSeconds,
        programmingNotes: templateExercises.programmingNotes,
        setTargets: templateExercises.setTargets,
      })
      .from(templateExercises)
      .where(eq(templateExercises.templateId, 'template-1'))
      .all()
      .sort((left, right) => left.orderIndex - right.orderIndex);

    expect(templateAfter).toEqual(templateBefore);
  });

  it('marks agent notes stale when rescheduling by more than two days', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const agentToken = seedAgentToken('user-1', 'scheduled-stale-marker-agent');

    seedExercise({
      id: 'exercise-stale-marker',
      userId: 'user-1',
      name: 'Romanian Deadlift',
      trackingType: 'weight_reps',
    });
    seedTemplateExercise({
      id: 'template-exercise-stale-marker',
      templateId: 'template-1',
      exerciseId: 'exercise-stale-marker',
      section: 'main',
      orderIndex: 0,
      programmingNotes: 'Keep the lats engaged.',
    });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: 'template-1',
        date: '2026-03-12',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const scheduledWorkoutId = (createResponse.json() as { data: { id: string } }).data.id;

    const notesResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercise-notes`,
      headers: createAgentTokenHeader(agentToken),
      payload: {
        notes: [
          {
            exerciseId: 'exercise-stale-marker',
            agentNotes: 'If sleep was poor, cap top set at RPE 7.',
          },
        ],
      },
    });
    expect(notesResponse.statusCode).toBe(200);

    const rescheduleResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        date: '2026-03-16',
      },
    });
    expect(rescheduleResponse.statusCode).toBe(200);

    const updatedExercise = context.db
      .select({
        agentNotesMeta: scheduledWorkoutExercises.agentNotesMeta,
      })
      .from(scheduledWorkoutExercises)
      .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
      .limit(1)
      .get();
    expect(updatedExercise?.agentNotesMeta).toMatchObject({
      scheduledDateAtGeneration: '2026-03-12',
      stale: true,
    });
  });

  it('does not mark agent notes stale when rescheduling within two days', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const agentToken = seedAgentToken('user-1', 'scheduled-stale-within-threshold-agent');

    seedExercise({
      id: 'exercise-stale-threshold',
      userId: 'user-1',
      name: 'Split Squat',
      trackingType: 'reps_only',
    });
    seedTemplateExercise({
      id: 'template-exercise-stale-threshold',
      templateId: 'template-1',
      exerciseId: 'exercise-stale-threshold',
      section: 'main',
      orderIndex: 0,
      programmingNotes: 'Control tempo on the eccentric.',
    });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: 'template-1',
        date: '2026-03-12',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const scheduledWorkoutId = (createResponse.json() as { data: { id: string } }).data.id;

    const notesResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}/exercise-notes`,
      headers: createAgentTokenHeader(agentToken),
      payload: {
        notes: [
          {
            exerciseId: 'exercise-stale-threshold',
            agentNotes: 'Keep reps smooth and symmetrical.',
          },
        ],
      },
    });
    expect(notesResponse.statusCode).toBe(200);

    const rescheduleResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduledWorkoutId}`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        date: '2026-03-13',
      },
    });
    expect(rescheduleResponse.statusCode).toBe(200);

    const updatedExercise = context.db
      .select({
        agentNotesMeta: scheduledWorkoutExercises.agentNotesMeta,
      })
      .from(scheduledWorkoutExercises)
      .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
      .limit(1)
      .get();
    expect(updatedExercise?.agentNotesMeta).toMatchObject({
      scheduledDateAtGeneration: '2026-03-12',
      stale: false,
    });
  });

  it('documents scheduled workout snapshot mutation paths in OpenAPI with correct security', async () => {
    const response = await context.app.inject({
      method: 'GET',
      url: '/api/docs/json',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      paths: Record<
        string,
        {
          patch?: {
            security?: unknown;
            summary?: string;
          };
        }
      >;
    };

    expect(body.paths['/api/v1/scheduled-workouts/{id}/exercise-notes']?.patch).toMatchObject({
      summary: 'Update per-exercise agent notes on a scheduled workout',
      security: [{ agentToken: [] }],
    });
    expect(body.paths['/api/v1/scheduled-workouts/{id}/exercise-swap']?.patch).toMatchObject({
      summary: 'Swap or remove an exercise in a scheduled workout snapshot',
      security: [{ bearerAuth: [] }, { agentToken: [] }],
    });
    expect(body.paths['/api/v1/scheduled-workouts/{id}/reorder']?.patch).toMatchObject({
      summary: 'Reorder exercises in a scheduled workout snapshot',
      security: [{ bearerAuth: [] }, { agentToken: [] }],
    });
    expect(body.paths['/api/v1/scheduled-workouts/{id}/exercises']?.patch).toMatchObject({
      summary: 'Update exercise-level snapshot fields on a scheduled workout',
      security: [{ bearerAuth: [] }, { agentToken: [] }],
    });
    expect(body.paths['/api/v1/scheduled-workouts/{id}/exercise-sets']?.patch).toMatchObject({
      summary: 'Update snapshot set prescriptions on a scheduled workout exercise',
      security: [{ bearerAuth: [] }, { agentToken: [] }],
    });
  });

  it('includes template tracking types in scheduled list items when template exercises exist', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedExercise({
      id: 'exercise-pullup',
      userId: 'user-1',
      name: 'Pull-up',
      trackingType: 'bodyweight_reps',
    });
    seedExercise({
      id: 'exercise-hang',
      userId: 'user-1',
      name: 'Dead Hang',
      trackingType: 'seconds_only',
    });
    seedTemplateExercise({
      id: 'template-exercise-pullup',
      templateId: 'template-1',
      exerciseId: 'exercise-pullup',
      section: 'main',
      orderIndex: 0,
    });
    seedTemplateExercise({
      id: 'template-exercise-hang',
      templateId: 'template-1',
      exerciseId: 'exercise-hang',
      section: 'main',
      orderIndex: 1,
    });
    seedScheduledWorkout({
      id: 'scheduled-tracking-types',
      userId: 'user-1',
      templateId: 'template-1',
      date: '2026-03-13',
    });

    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/scheduled-workouts?from=2026-03-10&to=2026-03-16',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [
        expect.objectContaining({
          id: 'scheduled-tracking-types',
          templateTrackingTypes: expect.arrayContaining(['bodyweight_reps', 'seconds_only']),
        }),
      ],
    });
  });

  it('omits templateTrackingTypes when a scheduled template has no exercises', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedScheduledWorkout({
      id: 'scheduled-no-template-exercises',
      userId: 'user-1',
      templateId: 'template-1',
      date: '2026-03-13',
    });

    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/scheduled-workouts?from=2026-03-10&to=2026-03-16',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [
        {
          id: 'scheduled-no-template-exercises',
          date: '2026-03-13',
          templateId: 'template-1',
          templateName: 'Upper Push',
          sessionId: null,
          createdAt: expect.any(Number),
        },
      ],
    });
  });

  it('excludes soft-deleted user exercises from templateTrackingTypes', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedExercise({
      id: 'exercise-active-user',
      userId: 'user-1',
      name: 'Split Squat',
      trackingType: 'reps_only',
    });
    seedExercise({
      id: 'exercise-soft-deleted-user',
      userId: 'user-1',
      name: 'Wall Sit',
      trackingType: 'seconds_only',
      deletedAt: '2026-03-01T00:00:00.000Z',
    });
    seedTemplateExercise({
      id: 'template-exercise-active-user',
      templateId: 'template-1',
      exerciseId: 'exercise-active-user',
      section: 'main',
      orderIndex: 0,
    });
    seedTemplateExercise({
      id: 'template-exercise-soft-deleted-user',
      templateId: 'template-1',
      exerciseId: 'exercise-soft-deleted-user',
      section: 'main',
      orderIndex: 1,
    });
    seedScheduledWorkout({
      id: 'scheduled-with-soft-deleted-exercise',
      userId: 'user-1',
      templateId: 'template-1',
      date: '2026-03-13',
    });

    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/scheduled-workouts?from=2026-03-10&to=2026-03-16',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [
        expect.objectContaining({
          id: 'scheduled-with-soft-deleted-exercise',
          templateTrackingTypes: ['reps_only'],
        }),
      ],
    });
  });

  it('reschedules a workout date within the user scope', async () => {
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
    });
    seedScheduledWorkout({
      id: 'schedule-1',
      userId: 'user-1',
      templateId: 'template-1',
      date: '2026-03-12',
      sessionId: 'session-1',
    });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/scheduled-workouts/schedule-1',
      headers: createAuthorizationHeader(authToken),
      payload: {
        date: '2026-03-13',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        id: 'schedule-1',
        userId: 'user-1',
        templateId: 'template-1',
        date: '2026-03-13',
        sessionId: null,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      },
    });

    const updatedRow = context.db
      .select({
        templateId: scheduledWorkouts.templateId,
        date: scheduledWorkouts.date,
        sessionId: scheduledWorkouts.sessionId,
      })
      .from(scheduledWorkouts)
      .where(eq(scheduledWorkouts.id, 'schedule-1'))
      .limit(1)
      .get();

    expect(updatedRow).toEqual({
      templateId: 'template-1',
      date: '2026-03-13',
      sessionId: null,
    });
  });

  it('deletes scheduled workouts within the authenticated user scope', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedScheduledWorkout({
      id: 'schedule-1',
      userId: 'user-1',
      templateId: 'template-1',
      date: '2026-03-12',
    });

    const response = await context.app.inject({
      method: 'DELETE',
      url: '/api/v1/scheduled-workouts/schedule-1',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        success: true,
      },
    });

    const deletedRow = context.db
      .select({ id: scheduledWorkouts.id })
      .from(scheduledWorkouts)
      .where(eq(scheduledWorkouts.id, 'schedule-1'))
      .limit(1)
      .get();

    expect(deletedRow).toBeUndefined();
  });

  it('does not expose soft-deleted template metadata in list responses', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedTemplate({
      id: 'template-soft-deleted-list',
      userId: 'user-1',
      name: 'Old Plan',
      deletedAt: '2026-03-01T00:00:00.000Z',
    });
    seedScheduledWorkout({
      id: 'schedule-soft-deleted',
      userId: 'user-1',
      templateId: 'template-soft-deleted-list',
      date: '2026-03-12',
    });

    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/scheduled-workouts?from=2026-03-10&to=2026-03-16',
      headers: createAuthorizationHeader(authToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [
        {
          id: 'schedule-soft-deleted',
          date: '2026-03-12',
          templateId: 'template-soft-deleted-list',
          templateName: null,
          sessionId: null,
          createdAt: expect.any(Number),
        },
      ],
    });
  });

  it('rejects creation against missing, inaccessible, or soft-deleted templates', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedTemplate({
      id: 'template-soft-deleted',
      userId: 'user-1',
      name: 'Archived Plan',
      deletedAt: '2026-03-01T00:00:00.000Z',
    });

    const [createOtherUserResponse, createMissingResponse, createSoftDeletedResponse] =
      await Promise.all([
        context.app.inject({
          method: 'POST',
          url: '/api/v1/scheduled-workouts',
          headers: createAuthorizationHeader(authToken),
          payload: {
            templateId: 'template-3',
            date: '2026-03-14',
          },
        }),
        context.app.inject({
          method: 'POST',
          url: '/api/v1/scheduled-workouts',
          headers: createAuthorizationHeader(authToken),
          payload: {
            templateId: 'missing-template',
            date: '2026-03-15',
          },
        }),
        context.app.inject({
          method: 'POST',
          url: '/api/v1/scheduled-workouts',
          headers: createAuthorizationHeader(authToken),
          payload: {
            templateId: 'template-soft-deleted',
            date: '2026-03-16',
          },
        }),
      ]);

    for (const response of [
      createOtherUserResponse,
      createMissingResponse,
      createSoftDeletedResponse,
    ]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          code: 'WORKOUT_TEMPLATE_NOT_FOUND',
          message: 'Workout template not found',
        },
      });
    }
  });

  it('returns validation errors for invalid schedule payloads and queries', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    const [postResponse, getResponse, patchResponse] = await Promise.all([
      context.app.inject({
        method: 'POST',
        url: '/api/v1/scheduled-workouts',
        headers: createAuthorizationHeader(authToken),
        payload: {
          templateId: 'template-1',
          date: '03-12-2026',
        },
      }),
      context.app.inject({
        method: 'GET',
        url: '/api/v1/scheduled-workouts?from=2026-03-16&to=2026-03-10',
        headers: createAuthorizationHeader(authToken),
      }),
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/scheduled-workouts/schedule-1',
        headers: createAuthorizationHeader(authToken),
        payload: {},
      }),
    ]);

    expect(postResponse.statusCode).toBe(400);
    expectRequestValidationError(postResponse, 'POST', '/api/v1/scheduled-workouts');

    expect(getResponse.statusCode).toBe(400);
    expectRequestValidationError(
      getResponse,
      'GET',
      '/api/v1/scheduled-workouts?from=2026-03-16&to=2026-03-10',
    );

    expect(patchResponse.statusCode).toBe(400);
    expectRequestValidationError(patchResponse, 'PATCH', '/api/v1/scheduled-workouts/schedule-1');
  });

  it('returns not found for schedules outside the authenticated user scope', async () => {
    const authToken = context.app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );

    seedScheduledWorkout({
      id: 'other-user-schedule',
      userId: 'user-2',
      templateId: 'template-3',
      date: '2026-03-12',
    });

    const [updateResponse, deleteResponse] = await Promise.all([
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/scheduled-workouts/other-user-schedule',
        headers: createAuthorizationHeader(authToken),
        payload: {
          date: '2026-03-13',
        },
      }),
      context.app.inject({
        method: 'DELETE',
        url: '/api/v1/scheduled-workouts/other-user-schedule',
        headers: createAuthorizationHeader(authToken),
      }),
    ]);

    for (const response of [updateResponse, deleteResponse]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          code: 'SCHEDULED_WORKOUT_NOT_FOUND',
          message: 'Scheduled workout not found',
        },
      });
    }
  });
});
