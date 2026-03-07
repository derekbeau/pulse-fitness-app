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
}) =>
  context.db
    .insert(exercises)
    .values({
      ...values,
      instructions: null,
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
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

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
              repsMin: 8,
              repsMax: 10,
              notes: 'Drive feet into floor.',
              cues: ['Stack wrists', 'Stay tucked'],
            },
            {
              exerciseId: 'user-row',
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

    const authToken = context.app.jwt.sign({ userId: 'user-1' });

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

  it('deletes only owned templates and cascades template exercise rows', async () => {
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

    const authToken = context.app.jwt.sign({ userId: 'user-1' });

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
      expect.objectContaining({ id: 'template-2' }),
    ]);
    expect(context.db.select().from(templateExercises).all()).toEqual([]);

    const otherUserResponse = await context.app.inject({
      method: 'DELETE',
      url: '/api/v1/workout-templates/template-2',
      headers: createAuthorizationHeader(authToken),
    });

    expect(otherUserResponse.statusCode).toBe(404);
  });

  it('rejects invalid payloads and inaccessible exercise references', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

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
    expect(validationResponse.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid workout template payload',
      },
    });

    expect(inaccessibleExerciseResponse.statusCode).toBe(400);
    expect(inaccessibleExerciseResponse.json()).toEqual({
      error: {
        code: 'INVALID_TEMPLATE_EXERCISE',
        message: 'Template references one or more unavailable exercises',
      },
    });
  });
});
