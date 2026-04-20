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
  scheduledWorkoutExerciseSets,
  scheduledWorkoutExercises,
  scheduledWorkouts,
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
    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

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
    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

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
    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

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
    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

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
    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

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
    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

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

  it('includes template tracking types in scheduled list items when template exercises exist', async () => {
    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

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
    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

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
    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

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
    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

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
    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

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
    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

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
    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

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
    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

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
    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

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
