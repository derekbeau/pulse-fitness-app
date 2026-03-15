import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { exercises, templateExercises, users, workoutTemplates } from '../../db/schema/index.js';

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

const seedExercise = (values: {
  id: string;
  userId: string | null;
  name: string;
  muscleGroups: string[];
  equipment: string;
  category: 'compound' | 'isolation' | 'cardio' | 'mobility';
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
      ...values,
      trackingType: values.trackingType ?? 'weight_reps',
      formCues: values.formCues ?? [],
      instructions: values.instructions ?? null,
      coachingNotes: values.coachingNotes ?? null,
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

const seedTemplateExercise = (values: {
  id: string;
  templateId: string;
  exerciseId: string;
  orderIndex: number;
  section: 'warmup' | 'main' | 'cooldown';
  sets?: number | null;
  repsMin?: number | null;
  repsMax?: number | null;
  tempo?: string | null;
  restSeconds?: number | null;
  supersetGroup?: string | null;
  notes?: string | null;
  cues?: string[] | null;
  setTargets?: Array<{
    setNumber: number;
    targetWeight?: number | null;
    targetWeightMin?: number | null;
    targetWeightMax?: number | null;
    targetSeconds?: number | null;
    targetDistance?: number | null;
  }> | null;
  programmingNotes?: string | null;
}) =>
  context.db
    .insert(templateExercises)
    .values({
      ...values,
      sets: values.sets ?? null,
      repsMin: values.repsMin ?? null,
      repsMax: values.repsMax ?? null,
      tempo: values.tempo ?? null,
      restSeconds: values.restSeconds ?? null,
      supersetGroup: values.supersetGroup ?? null,
      notes: values.notes ?? null,
      cues: values.cues ?? null,
      setTargets: values.setTargets ?? null,
      programmingNotes: values.programmingNotes ?? null,
    })
    .run();

describe('workout template routes', () => {
  beforeAll(async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-workout-template-routes-'));

    process.env.JWT_SECRET = 'test-workout-template-secret';
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
    context.db.delete(templateExercises).run();
    context.db.delete(workoutTemplates).run();
    context.db.delete(exercises).run();
    context.db.delete(users).run();

    seedUser('user-1', 'derek');
    seedUser('user-2', 'alex');

    seedExercise({
      id: 'global-row-erg',
      userId: null,
      name: 'Row Erg',
      muscleGroups: ['conditioning'],
      equipment: 'rower',
      category: 'cardio',
    });
    seedExercise({
      id: 'user-press',
      userId: 'user-1',
      name: 'Incline Dumbbell Press',
      muscleGroups: ['chest', 'front delts', 'triceps'],
      equipment: 'dumbbells',
      category: 'compound',
      formCues: ['Drive feet', 'Brace core'],
      coachingNotes: 'Keep shoulder blades pinned through each rep.',
      instructions: 'Lower with control and press through mid-foot balance.',
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
      id: 'user-plank',
      userId: 'user-1',
      name: 'RKC Plank',
      muscleGroups: ['core'],
      equipment: 'bodyweight',
      category: 'mobility',
      trackingType: 'seconds_only',
    });
    seedExercise({
      id: 'other-user-private',
      userId: 'user-2',
      name: 'Private Exercise',
      muscleGroups: ['quads'],
      equipment: 'barbell',
      category: 'compound',
    });
  });

  it('requires user auth for template CRUD routes', async () => {
    const responses = await Promise.all([
      context.app.inject({
        method: 'GET',
        url: '/api/v1/workout-templates',
      }),
      context.app.inject({
        method: 'GET',
        url: '/api/v1/workout-templates/template-1',
      }),
      context.app.inject({
        method: 'POST',
        url: '/api/v1/workout-templates',
        payload: {
          name: 'Upper Push',
          sections: [],
        },
      }),
      context.app.inject({
        method: 'PUT',
        url: '/api/v1/workout-templates/template-1',
        payload: {
          name: 'Upper Push',
          sections: [],
        },
      }),
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/workout-templates/template-1/reorder',
        payload: {
          section: 'main',
          exerciseIds: [],
        },
      }),
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/workout-templates/template-1/exercises/user-press/swap',
        payload: {
          newExerciseId: 'user-row',
        },
      }),
      context.app.inject({
        method: 'DELETE',
        url: '/api/v1/workout-templates/template-1',
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

  it('creates, lists, and fetches workout templates with canonical section ordering', async () => {
    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-templates',
      headers: createAuthorizationHeader(authToken),
      payload: {
        name: ' Upper Push ',
        description: ' Pressing focus with shoulder-friendly accessories. ',
        tags: [' push ', ' strength '],
        sections: [
          {
            type: 'main',
            exercises: [
              {
                exerciseId: 'user-press',
                sets: 3,
                repsMin: 8,
                repsMax: 10,
                tempo: '3110',
                restSeconds: 90,
                notes: ' Drive feet into floor. ',
                cues: [' Stack wrists ', ' Stay tucked '],
                programmingNotes: ' Top-set focus while keeping two reps in reserve. ',
                setTargets: [
                  { setNumber: 1, targetWeightMin: 60, targetWeightMax: 65 },
                  { setNumber: 2, targetWeight: 62.5 },
                  { setNumber: 3, targetWeight: 60 },
                ],
              },
              {
                exerciseId: 'user-row',
                sets: 3,
                repsMin: 10,
                repsMax: 12,
                restSeconds: 75,
                cues: [' Pull elbows low '],
              },
            ],
          },
          {
            type: 'warmup',
            exercises: [
              {
                exerciseId: 'global-row-erg',
                sets: 1,
                repsMin: 240,
                repsMax: 240,
                restSeconds: 0,
                notes: ' Easy pace ',
              },
            ],
          },
        ],
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const createdPayload = createResponse.json() as {
      data: {
        id: string;
        userId: string;
        name: string;
        description: string | null;
        tags: string[];
        sections: Array<{
          type: string;
          exercises: Array<{
            id: string;
            exerciseId: string;
            exerciseName: string;
            exercise: {
              formCues: string[];
              coachingNotes: string | null;
              instructions: string | null;
            };
            formCues: string[];
            repsMin: number | null;
            repsMax: number | null;
            notes: string | null;
            cues: string[];
          }>;
        }>;
      };
    };

    expect(createdPayload.data).toMatchObject({
      userId: 'user-1',
      name: 'Upper Push',
      description: 'Pressing focus with shoulder-friendly accessories.',
      tags: ['push', 'strength'],
      sections: [
        {
          type: 'warmup',
          exercises: [
            {
              exerciseId: 'global-row-erg',
              exerciseName: 'Row Erg',
              exercise: {
                formCues: [],
                coachingNotes: null,
                instructions: null,
              },
              formCues: [],
              repsMin: 240,
              repsMax: 240,
              notes: 'Easy pace',
              cues: [],
            },
          ],
        },
        {
          type: 'main',
          exercises: [
            {
              exerciseId: 'user-press',
              exerciseName: 'Incline Dumbbell Press',
              exercise: {
                formCues: ['Drive feet', 'Brace core'],
                coachingNotes: 'Keep shoulder blades pinned through each rep.',
                instructions: 'Lower with control and press through mid-foot balance.',
              },
              formCues: ['Drive feet', 'Brace core'],
              repsMin: 8,
              repsMax: 10,
              notes: 'Drive feet into floor.',
              cues: ['Stack wrists', 'Stay tucked'],
              programmingNotes: 'Top-set focus while keeping two reps in reserve.',
              setTargets: [
                { setNumber: 1, targetWeightMin: 60, targetWeightMax: 65 },
                { setNumber: 2, targetWeight: 62.5 },
                { setNumber: 3, targetWeight: 60 },
              ],
            },
            {
              exerciseId: 'user-row',
              exercise: {
                formCues: [],
                coachingNotes: null,
                instructions: null,
              },
              formCues: [],
              repsMin: 10,
              repsMax: 12,
              notes: null,
              cues: ['Pull elbows low'],
            },
          ],
        },
        {
          type: 'cooldown',
          exercises: [],
        },
      ],
    });
    expect(createdPayload.data.id).toBeTruthy();
    expect(createdPayload.data.sections[0]?.exercises[0]?.id).toBeTruthy();

    seedTemplate({
      id: 'other-template',
      userId: 'user-2',
      name: 'Other User Template',
      tags: ['private'],
    });

    const [listResponse, getResponse] = await Promise.all([
      context.app.inject({
        method: 'GET',
        url: '/api/v1/workout-templates',
        headers: createAuthorizationHeader(authToken),
      }),
      context.app.inject({
        method: 'GET',
        url: `/api/v1/workout-templates/${createdPayload.data.id}`,
        headers: createAuthorizationHeader(authToken),
      }),
    ]);

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      data: [
        expect.objectContaining({
          id: createdPayload.data.id,
          name: 'Upper Push',
        }),
      ],
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toEqual({
      data: expect.objectContaining({
        id: createdPayload.data.id,
        sections: createdPayload.data.sections,
      }),
    });
  });

  it('updates only owned templates by replacing nested exercise rows', async () => {
    seedTemplate({
      id: 'template-1',
      userId: 'user-1',
      name: 'Upper Push',
      description: 'Original',
      tags: ['push'],
    });
    seedTemplateExercise({
      id: 'template-exercise-1',
      templateId: 'template-1',
      exerciseId: 'user-press',
      orderIndex: 0,
      section: 'main',
      sets: 3,
      repsMin: 8,
      repsMax: 10,
      cues: ['Old cue'],
    });
    seedTemplate({
      id: 'template-2',
      userId: 'user-2',
      name: 'Private Template',
      tags: ['private'],
    });

    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

    const updateResponse = await context.app.inject({
      method: 'PUT',
      url: '/api/v1/workout-templates/template-1',
      headers: createAuthorizationHeader(authToken),
      payload: {
        name: 'Upper Push v2',
        description: ' Updated notes ',
        tags: ['push', 'hypertrophy'],
        sections: [
          {
            type: 'warmup',
            exercises: [
              {
                exerciseId: 'global-row-erg',
                sets: 1,
                repsMin: 300,
                repsMax: 300,
              },
            ],
          },
          {
            type: 'main',
            exercises: [
              {
                exerciseId: 'user-row',
                sets: 4,
                repsMin: 8,
                repsMax: 10,
                restSeconds: 120,
                cues: ['Lead with elbows'],
              },
            ],
          },
        ],
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toEqual({
      data: expect.objectContaining({
        id: 'template-1',
        name: 'Upper Push v2',
        description: 'Updated notes',
        tags: ['push', 'hypertrophy'],
        sections: [
          {
            type: 'warmup',
            exercises: [
              expect.objectContaining({
                exerciseId: 'global-row-erg',
                repsMin: 300,
                repsMax: 300,
              }),
            ],
          },
          {
            type: 'main',
            exercises: [
              expect.objectContaining({
                exerciseId: 'user-row',
                sets: 4,
                cues: ['Lead with elbows'],
              }),
            ],
          },
          {
            type: 'cooldown',
            exercises: [],
          },
        ],
      }),
    });

    const persistedRows = context.db
      .select({
        exerciseId: templateExercises.exerciseId,
        section: templateExercises.section,
      })
      .from(templateExercises)
      .where(eq(templateExercises.templateId, 'template-1'))
      .all();

    expect(persistedRows).toEqual([
      {
        exerciseId: 'global-row-erg',
        section: 'warmup',
      },
      {
        exerciseId: 'user-row',
        section: 'main',
      },
    ]);

    const renameOnlyResponse = await context.app.inject({
      method: 'PUT',
      url: '/api/v1/workout-templates/template-1',
      headers: createAuthorizationHeader(authToken),
      payload: {
        name: 'Upper Push v3',
      },
    });

    expect(renameOnlyResponse.statusCode).toBe(200);
    expect(renameOnlyResponse.json()).toEqual({
      data: expect.objectContaining({
        id: 'template-1',
        name: 'Upper Push v3',
        description: 'Updated notes',
        tags: ['push', 'hypertrophy'],
        sections: [
          {
            type: 'warmup',
            exercises: [expect.objectContaining({ exerciseId: 'global-row-erg' })],
          },
          {
            type: 'main',
            exercises: [expect.objectContaining({ exerciseId: 'user-row' })],
          },
          {
            type: 'cooldown',
            exercises: [],
          },
        ],
      }),
    });

    const otherUserResponse = await context.app.inject({
      method: 'PUT',
      url: '/api/v1/workout-templates/template-2',
      headers: createAuthorizationHeader(authToken),
      payload: {
        name: 'Should Fail',
        sections: [],
      },
    });

    expect(otherUserResponse.statusCode).toBe(404);
    expect(otherUserResponse.json()).toEqual({
      error: {
        code: 'WORKOUT_TEMPLATE_NOT_FOUND',
        message: 'Workout template not found',
      },
    });
  });

  it('reorders exercises in a section for owned templates', async () => {
    seedTemplate({
      id: 'template-1',
      userId: 'user-1',
      name: 'Upper Push',
      tags: ['push'],
    });
    seedTemplateExercise({
      id: 'template-exercise-main-1',
      templateId: 'template-1',
      exerciseId: 'user-press',
      orderIndex: 0,
      section: 'main',
    });
    seedTemplateExercise({
      id: 'template-exercise-main-2',
      templateId: 'template-1',
      exerciseId: 'user-row',
      orderIndex: 1,
      section: 'main',
    });

    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-templates/template-1/reorder',
      headers: createAuthorizationHeader(authToken),
      payload: {
        section: 'main',
        exerciseIds: ['template-exercise-main-2', 'template-exercise-main-1'],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: 'template-1',
        sections: [
          { type: 'warmup', exercises: [] },
          {
            type: 'main',
            exercises: [
              expect.objectContaining({ id: 'template-exercise-main-2' }),
              expect.objectContaining({ id: 'template-exercise-main-1' }),
            ],
          },
          { type: 'cooldown', exercises: [] },
        ],
      }),
    });

    const persistedRows = context.db
      .select({
        id: templateExercises.id,
        orderIndex: templateExercises.orderIndex,
      })
      .from(templateExercises)
      .where(eq(templateExercises.templateId, 'template-1'))
      .all()
      .sort((left, right) => left.orderIndex - right.orderIndex);

    expect(persistedRows).toEqual([
      { id: 'template-exercise-main-2', orderIndex: 0 },
      { id: 'template-exercise-main-1', orderIndex: 1 },
    ]);
  });

  it('swaps a template exercise while preserving row configuration', async () => {
    seedTemplate({
      id: 'template-swap',
      userId: 'user-1',
      name: 'Upper Push',
    });
    seedTemplateExercise({
      id: 'template-exercise-swap',
      templateId: 'template-swap',
      exerciseId: 'user-press',
      orderIndex: 2,
      section: 'main',
      sets: 4,
      repsMin: 6,
      repsMax: 8,
      restSeconds: 120,
      notes: 'Top set and backoff',
      cues: ['Drive feet'],
      programmingNotes: 'Leave one rep in reserve.',
      setTargets: [
        { setNumber: 1, targetWeight: 100 },
        { setNumber: 2, targetWeightMin: 90, targetWeightMax: 95 },
      ],
    });

    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-templates/template-swap/exercises/user-press/swap',
      headers: createAuthorizationHeader(authToken),
      payload: {
        newExerciseId: 'user-plank',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: expect.objectContaining({
        id: 'template-swap',
        sections: [
          { type: 'warmup', exercises: [] },
          {
            type: 'main',
            exercises: [
              expect.objectContaining({
                id: 'template-exercise-swap',
                exerciseId: 'user-plank',
                sets: 4,
                repsMin: 6,
                repsMax: 8,
                restSeconds: 120,
                notes: 'Top set and backoff',
                setTargets: [
                  { setNumber: 1, targetWeight: 100 },
                  { setNumber: 2, targetWeightMin: 90, targetWeightMax: 95 },
                ],
                programmingNotes: 'Leave one rep in reserve.',
              }),
            ],
          },
          { type: 'cooldown', exercises: [] },
        ],
      }),
      meta: {
        warning:
          'Swapped to an exercise with a different tracking type. Review set targets and expectations.',
      },
    });

    const persisted = context.db
      .select({
        exerciseId: templateExercises.exerciseId,
        sets: templateExercises.sets,
        repsMin: templateExercises.repsMin,
        repsMax: templateExercises.repsMax,
        restSeconds: templateExercises.restSeconds,
        notes: templateExercises.notes,
        cues: templateExercises.cues,
        setTargets: templateExercises.setTargets,
        programmingNotes: templateExercises.programmingNotes,
        orderIndex: templateExercises.orderIndex,
      })
      .from(templateExercises)
      .where(eq(templateExercises.id, 'template-exercise-swap'))
      .get();

    expect(persisted).toEqual({
      exerciseId: 'user-plank',
      sets: 4,
      repsMin: 6,
      repsMax: 8,
      restSeconds: 120,
      notes: 'Top set and backoff',
      cues: null,
      setTargets: [
        { setNumber: 1, targetWeight: 100 },
        { setNumber: 2, targetWeightMin: 90, targetWeightMax: 95 },
      ],
      programmingNotes: 'Leave one rep in reserve.',
      orderIndex: 2,
    });
  });

  it('returns 404 when swapping an exercise not present in the template', async () => {
    seedTemplate({
      id: 'template-missing-source',
      userId: 'user-1',
      name: 'Upper Push',
    });
    seedTemplateExercise({
      id: 'template-exercise-1',
      templateId: 'template-missing-source',
      exerciseId: 'user-press',
      orderIndex: 0,
      section: 'main',
    });

    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-templates/template-missing-source/exercises/user-row/swap',
      headers: createAuthorizationHeader(authToken),
      payload: {
        newExerciseId: 'user-plank',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: 'WORKOUT_TEMPLATE_EXERCISE_NOT_FOUND',
        message: 'Template exercise not found',
      },
    });
  });

  it('returns 409 when swapping to an exercise already in the template', async () => {
    seedTemplate({
      id: 'template-duplicate-target',
      userId: 'user-1',
      name: 'Upper Push',
    });
    seedTemplateExercise({
      id: 'template-exercise-press',
      templateId: 'template-duplicate-target',
      exerciseId: 'user-press',
      orderIndex: 0,
      section: 'main',
    });
    seedTemplateExercise({
      id: 'template-exercise-row',
      templateId: 'template-duplicate-target',
      exerciseId: 'user-row',
      orderIndex: 1,
      section: 'main',
    });

    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });
    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/workout-templates/template-duplicate-target/exercises/user-press/swap',
      headers: createAuthorizationHeader(authToken),
      payload: {
        newExerciseId: 'user-row',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: {
        code: 'WORKOUT_TEMPLATE_DUPLICATE_EXERCISE',
        message: 'Template already contains the replacement exercise',
      },
    });
  });

  it('rejects swap targets that are not user-owned exercises', async () => {
    seedTemplate({
      id: 'template-invalid-target',
      userId: 'user-1',
      name: 'Upper Push',
    });
    seedTemplateExercise({
      id: 'template-exercise-1',
      templateId: 'template-invalid-target',
      exerciseId: 'user-press',
      orderIndex: 0,
      section: 'main',
    });

    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

    const [globalResponse, otherUserResponse] = await Promise.all([
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/workout-templates/template-invalid-target/exercises/user-press/swap',
        headers: createAuthorizationHeader(authToken),
        payload: {
          newExerciseId: 'global-row-erg',
        },
      }),
      context.app.inject({
        method: 'PATCH',
        url: '/api/v1/workout-templates/template-invalid-target/exercises/user-press/swap',
        headers: createAuthorizationHeader(authToken),
        payload: {
          newExerciseId: 'other-user-private',
        },
      }),
    ]);

    for (const response of [globalResponse, otherUserResponse]) {
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: {
          code: 'INVALID_TEMPLATE_EXERCISE',
          message: 'Template references one or more unavailable exercises',
        },
      });
    }
  });

  it('soft-deletes only owned templates', async () => {
    seedTemplate({
      id: 'template-1',
      userId: 'user-1',
      name: 'Upper Push',
      tags: ['push'],
    });
    seedTemplateExercise({
      id: 'template-exercise-1',
      templateId: 'template-1',
      exerciseId: 'user-press',
      orderIndex: 0,
      section: 'main',
    });
    seedTemplate({
      id: 'template-2',
      userId: 'user-2',
      name: 'Other User Template',
      tags: ['private'],
    });

    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

    const deleteResponse = await context.app.inject({
      method: 'DELETE',
      url: '/api/v1/workout-templates/template-1',
      headers: createAuthorizationHeader(authToken),
    });

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({
      data: {
        success: true,
      },
    });

    expect(context.db.select().from(workoutTemplates).all()).toEqual([
      expect.objectContaining({ id: 'template-1', deletedAt: expect.any(String) }),
      expect.objectContaining({ id: 'template-2', deletedAt: null }),
    ]);
    expect(context.db.select().from(templateExercises).all()).toEqual([
      expect.objectContaining({ id: 'template-exercise-1', templateId: 'template-1' }),
    ]);

    const getDeletedResponse = await context.app.inject({
      method: 'GET',
      url: '/api/v1/workout-templates/template-1',
      headers: createAuthorizationHeader(authToken),
    });

    expect(getDeletedResponse.statusCode).toBe(404);

    const listResponse = await context.app.inject({
      method: 'GET',
      url: '/api/v1/workout-templates',
      headers: createAuthorizationHeader(authToken),
    });
    const listPayload = listResponse.json() as { data: Array<{ id: string }> };

    expect(listResponse.statusCode).toBe(200);
    expect(listPayload.data.map((template) => template.id)).toEqual([]);

    const otherUserResponse = await context.app.inject({
      method: 'DELETE',
      url: '/api/v1/workout-templates/template-2',
      headers: createAuthorizationHeader(authToken),
    });

    expect(otherUserResponse.statusCode).toBe(404);
  });

  it('rejects invalid payloads and inaccessible exercise references', async () => {
    const authToken = context.app.jwt.sign({ sub: 'user-1', type: "session", iss: "pulse-api" }, { expiresIn: "7d" });

    const [validationResponse, inaccessibleExerciseResponse] = await Promise.all([
      context.app.inject({
        method: 'POST',
        url: '/api/v1/workout-templates',
        headers: createAuthorizationHeader(authToken),
        payload: {
          name: '   ',
          sections: [
            {
              type: 'main',
              exercises: [],
            },
            {
              type: 'main',
              exercises: [],
            },
          ],
        },
      }),
      context.app.inject({
        method: 'POST',
        url: '/api/v1/workout-templates',
        headers: createAuthorizationHeader(authToken),
        payload: {
          name: 'Invalid Template',
          sections: [
            {
              type: 'main',
              exercises: [
                {
                  exerciseId: 'other-user-private',
                },
              ],
            },
          ],
        },
      }),
    ]);

    expect(validationResponse.statusCode).toBe(400);
    expectRequestValidationError(validationResponse, 'POST', '/api/v1/workout-templates');

    expect(inaccessibleExerciseResponse.statusCode).toBe(400);
    expect(inaccessibleExerciseResponse.json()).toEqual({
      error: {
        code: 'INVALID_TEMPLATE_EXERCISE',
        message: 'Template references one or more unavailable exercises',
      },
    });
  });
});
