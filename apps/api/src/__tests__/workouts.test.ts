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
  sessionSets,
  templateExercises,
  users,
  workoutSessions,
  workoutTemplates,
} from '../db/schema/index.js';

type DatabaseModule = typeof import('../db/index.js');

type TestContext = {
  app: FastifyInstance;
  db: DatabaseModule['db'];
  sqlite: DatabaseModule['sqlite'];
  tempDir: string;
};

type TemplateSectionType = 'warmup' | 'main' | 'cooldown';

type TemplateResponse = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  tags: string[];
  sections: Array<{
    type: TemplateSectionType;
    exercises: Array<{
      id: string;
      exerciseId: string;
      exerciseName: string;
      sets: number | null;
      repsMin: number | null;
      repsMax: number | null;
      tempo: string | null;
      restSeconds: number | null;
      supersetGroup: string | null;
      notes: string | null;
      cues: string[];
    }>;
  }>;
  createdAt: number;
  updatedAt: number;
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

const createTemplate = async (token: string, overrides?: Partial<{ name: string }>) => {
  const response = await context.app.inject({
    method: 'POST',
    url: '/api/v1/workout-templates',
    headers: createAuthorizationHeader(token),
    payload: {
      name: overrides?.name ?? 'Upper Push Builder',
      description: 'Base template for integration test flows',
      tags: ['strength', 'upper'],
      sections: [
        {
          type: 'main',
          exercises: [
            {
              exerciseId: 'global-bench-press',
              sets: 3,
              repsMin: 6,
              repsMax: 8,
              restSeconds: 120,
            },
            {
              exerciseId: 'user-1-lat-pulldown',
              sets: 2,
              repsMin: 8,
              repsMax: 12,
              restSeconds: 90,
            },
          ],
        },
        {
          type: 'warmup',
          exercises: [
            {
              exerciseId: 'global-row-erg',
              sets: 1,
              repsMin: 5,
              repsMax: 8,
              restSeconds: 30,
            },
          ],
        },
      ],
    },
  });

  expect(response.statusCode).toBe(201);

  return (response.json() as { data: TemplateResponse }).data;
};

describe('workouts integration', () => {
  beforeAll(async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-workouts-integration-'));

    process.env.JWT_SECRET = 'test-workouts-integration-secret';
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    vi.resetModules();

    const [{ buildServer }, dbModule] = await Promise.all([
      import('../index.js'),
      import('../db/index.js'),
    ]);

    migrate(dbModule.db, {
      migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
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
    context.db.delete(templateExercises).run();
    context.db.delete(workoutTemplates).run();
    context.db.delete(exercises).run();
    context.db.delete(users).run();

    seedUser('user-1', 'derek');
    seedUser('user-2', 'alex');

    seedExercise({
      id: 'global-bench-press',
      userId: null,
      name: 'Barbell Bench Press',
      muscleGroups: ['chest', 'triceps'],
      equipment: 'barbell',
      category: 'compound',
    });
    seedExercise({
      id: 'global-row-erg',
      userId: null,
      name: 'Row Erg',
      muscleGroups: ['conditioning'],
      equipment: 'rower',
      category: 'cardio',
    });
    seedExercise({
      id: 'user-1-lat-pulldown',
      userId: 'user-1',
      name: 'Lat Pulldown',
      muscleGroups: ['lats'],
      equipment: 'machine',
      category: 'isolation',
    });
    seedExercise({
      id: 'user-2-private-row',
      userId: 'user-2',
      name: 'Private Row',
      muscleGroups: ['back'],
      equipment: 'cable',
      category: 'compound',
    });
  });

  it('supports workout template CRUD and cascade deletion of template exercises', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    const createdTemplate = await createTemplate(authToken, {
      name: 'Upper Push Day',
    });

    expect(createdTemplate.name).toBe('Upper Push Day');
    expect(createdTemplate.sections.map((section) => section.type)).toEqual([
      'warmup',
      'main',
      'cooldown',
    ]);
    expect(createdTemplate.sections[0]?.exercises).toHaveLength(1);
    expect(createdTemplate.sections[1]?.exercises).toHaveLength(2);
    expect(createdTemplate.sections[2]?.exercises).toEqual([]);

    const readResponse = await context.app.inject({
      method: 'GET',
      url: `/api/v1/workout-templates/${createdTemplate.id}`,
      headers: createAuthorizationHeader(authToken),
    });

    expect(readResponse.statusCode).toBe(200);
    expect((readResponse.json() as { data: TemplateResponse }).data).toMatchObject({
      id: createdTemplate.id,
      name: 'Upper Push Day',
      sections: [
        {
          type: 'warmup',
          exercises: [expect.objectContaining({ exerciseName: 'Row Erg' })],
        },
        {
          type: 'main',
          exercises: [
            expect.objectContaining({ exerciseName: 'Barbell Bench Press' }),
            expect.objectContaining({ exerciseName: 'Lat Pulldown' }),
          ],
        },
        {
          type: 'cooldown',
          exercises: [],
        },
      ],
    });

    const updateResponse = await context.app.inject({
      method: 'PUT',
      url: `/api/v1/workout-templates/${createdTemplate.id}`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        name: 'Upper Push Day v2',
        description: 'Updated split',
        tags: ['strength', 'push'],
        sections: [
          {
            type: 'main',
            exercises: [
              {
                exerciseId: 'global-bench-press',
                sets: 4,
                repsMin: 5,
                repsMax: 8,
              },
            ],
          },
          {
            type: 'cooldown',
            exercises: [
              {
                exerciseId: 'global-row-erg',
                sets: 1,
                repsMin: 8,
                repsMax: 10,
              },
            ],
          },
        ],
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect((updateResponse.json() as { data: TemplateResponse }).data).toMatchObject({
      id: createdTemplate.id,
      name: 'Upper Push Day v2',
      description: 'Updated split',
      tags: ['strength', 'push'],
      sections: [
        { type: 'warmup', exercises: [] },
        {
          type: 'main',
          exercises: [expect.objectContaining({ exerciseId: 'global-bench-press', sets: 4 })],
        },
        {
          type: 'cooldown',
          exercises: [expect.objectContaining({ exerciseId: 'global-row-erg', sets: 1 })],
        },
      ],
    });

    const deleteResponse = await context.app.inject({
      method: 'DELETE',
      url: `/api/v1/workout-templates/${createdTemplate.id}`,
      headers: createAuthorizationHeader(authToken),
    });

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({
      data: {
        success: true,
      },
    });

    const remainingTemplateExercises = context.db
      .select({ id: templateExercises.id, templateId: templateExercises.templateId })
      .from(templateExercises)
      .where(eq(templateExercises.templateId, createdTemplate.id))
      .all();

    expect(remainingTemplateExercises).toHaveLength(2);
    expect(remainingTemplateExercises.every((row) => row.templateId === createdTemplate.id)).toBe(
      true,
    );

    const deletedTemplate = context.db
      .select({ deletedAt: workoutTemplates.deletedAt })
      .from(workoutTemplates)
      .where(eq(workoutTemplates.id, createdTemplate.id))
      .get();
    expect(deletedTemplate).toEqual({
      deletedAt: expect.any(String),
    });
  });

  it('handles session lifecycle with template-derived planned sets and live set logging', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    const template = await createTemplate(authToken);
    const plannedSets = template.sections.flatMap((section) =>
      section.exercises.flatMap((exercise) => {
        const setCount = exercise.sets ?? 0;

        return Array.from({ length: setCount }, (_, index) => ({
          exerciseId: exercise.exerciseId,
          setNumber: index + 1,
          section: section.type,
        }));
      }),
    );

    const startResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: template.id,
        name: template.name,
        date: '2026-04-12',
        startedAt: 1_800_000_000_000,
        sets: plannedSets,
      },
    });

    expect(startResponse.statusCode).toBe(201);
    const startedSession = (
      startResponse.json() as {
        data: {
          id: string;
          templateId: string | null;
          status: 'scheduled' | 'in-progress' | 'completed';
          sets: Array<{
            exerciseId: string;
            setNumber: number;
            section: TemplateSectionType | null;
            completed: boolean;
          }>;
        };
      }
    ).data;

    expect(startedSession.templateId).toBe(template.id);
    expect(startedSession.status).toBe('in-progress');
    expect(startedSession.sets).toHaveLength(6);
    expect(startedSession.sets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          exerciseId: 'global-bench-press',
          setNumber: 1,
          section: 'main',
          completed: false,
        }),
        expect.objectContaining({
          exerciseId: 'global-row-erg',
          setNumber: 1,
          section: 'warmup',
          completed: false,
        }),
      ]),
    );

    const logSetResponse = await context.app.inject({
      method: 'POST',
      url: `/api/v1/workout-sessions/${startedSession.id}/sets`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        exerciseId: 'global-bench-press',
        setNumber: 4,
        weight: 185,
        reps: 6,
        section: 'main',
      },
    });

    expect(logSetResponse.statusCode).toBe(201);
    expect(logSetResponse.json()).toEqual({
      data: expect.objectContaining({
        exerciseId: 'global-bench-press',
        setNumber: 4,
        weight: 185,
        reps: 6,
      }),
    });

    const groupedSetResponse = await context.app.inject({
      method: 'GET',
      url: `/api/v1/workout-sessions/${startedSession.id}/sets`,
      headers: createAuthorizationHeader(authToken),
    });

    expect(groupedSetResponse.statusCode).toBe(200);

    const groupedSets = (
      groupedSetResponse.json() as {
        data: Array<{
          exerciseId: string;
          sets: Array<{ setNumber: number }>;
        }>;
      }
    ).data;

    const benchGroup = groupedSets.find((group) => group.exerciseId === 'global-bench-press');
    expect(benchGroup?.sets.map((set) => set.setNumber)).toEqual([1, 2, 3, 4]);

    const completeResponse = await context.app.inject({
      method: 'PUT',
      url: `/api/v1/workout-sessions/${startedSession.id}`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        status: 'completed',
        completedAt: 1_800_000_002_700,
        duration: 45,
        feedback: {
          energy: 4,
          recovery: 3,
          technique: 5,
          notes: 'Strong top sets',
        },
        notes: 'Session complete',
      },
    });

    expect(completeResponse.statusCode).toBe(200);
    expect(completeResponse.json()).toEqual({
      data: expect.objectContaining({
        id: startedSession.id,
        status: 'completed',
        completedAt: 1_800_000_002_700,
        duration: 2,
        feedback: {
          energy: 4,
          recovery: 3,
          technique: 5,
          notes: 'Strong top sets',
        },
        notes: 'Session complete',
      }),
    });
  });

  it('supports scheduled workouts create, date-range reads, update, and delete', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    const templateA = await createTemplate(authToken, { name: 'Template A' });
    const templateB = await createTemplate(authToken, { name: 'Template B' });

    const createFirstResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: templateA.id,
        date: '2026-04-10',
      },
    });
    const createSecondResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: templateB.id,
        date: '2026-04-15',
      },
    });
    const createOutsideRangeResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: createAuthorizationHeader(authToken),
      payload: {
        templateId: templateA.id,
        date: '2026-05-01',
      },
    });

    expect(createFirstResponse.statusCode).toBe(201);
    expect(createSecondResponse.statusCode).toBe(201);
    expect(createOutsideRangeResponse.statusCode).toBe(201);

    const firstScheduleId = (createFirstResponse.json() as { data: { id: string } }).data.id;
    const secondScheduleId = (createSecondResponse.json() as { data: { id: string } }).data.id;

    const rangeResponse = await context.app.inject({
      method: 'GET',
      url: '/api/v1/scheduled-workouts?from=2026-04-01&to=2026-04-30',
      headers: createAuthorizationHeader(authToken),
    });

    expect(rangeResponse.statusCode).toBe(200);

    const rangeItems = (
      rangeResponse.json() as {
        data: Array<{
          id: string;
          templateName: string | null;
          date: string;
        }>;
      }
    ).data;

    expect(rangeItems.map((item) => item.id)).toEqual([firstScheduleId, secondScheduleId]);
    expect(rangeItems.map((item) => item.templateName)).toEqual(['Template A', 'Template B']);

    const updateResponse = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${firstScheduleId}`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        date: '2026-04-20',
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toEqual({
      data: expect.objectContaining({
        id: firstScheduleId,
        date: '2026-04-20',
        templateId: templateA.id,
      }),
    });

    const deleteResponse = await context.app.inject({
      method: 'DELETE',
      url: `/api/v1/scheduled-workouts/${secondScheduleId}`,
      headers: createAuthorizationHeader(authToken),
    });

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({
      data: {
        success: true,
      },
    });

    const afterDeleteRangeResponse = await context.app.inject({
      method: 'GET',
      url: '/api/v1/scheduled-workouts?from=2026-04-01&to=2026-04-30',
      headers: createAuthorizationHeader(authToken),
    });

    expect(afterDeleteRangeResponse.statusCode).toBe(200);
    expect(
      (
        afterDeleteRangeResponse.json() as {
          data: Array<{
            id: string;
            date: string;
            templateId: string | null;
            templateName: string | null;
            sessionId: string | null;
            createdAt: number;
          }>;
        }
      ).data,
    ).toEqual([
      expect.objectContaining({
        id: firstScheduleId,
        date: '2026-04-20',
        templateId: templateA.id,
        templateName: 'Template A',
      }),
    ]);
  });

  it('supports exercise CRUD plus search and filter queries', async () => {
    const authToken = context.app.jwt.sign({ userId: 'user-1' });

    const createResponse = await context.app.inject({
      method: 'POST',
      url: '/api/v1/exercises',
      headers: createAuthorizationHeader(authToken),
      payload: {
        name: 'Single Arm Cable Row',
        muscleGroups: ['lats'],
        equipment: 'cable',
        category: 'isolation',
        instructions: 'Pull elbow back and keep chest stable.',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const createdExercise = (
      createResponse.json() as {
        data: {
          id: string;
          userId: string | null;
          name: string;
        };
      }
    ).data;

    expect(createdExercise.userId).toBe('user-1');
    expect(createdExercise.name).toBe('Single Arm Cable Row');

    const searchResponse = await context.app.inject({
      method: 'GET',
      url: '/api/v1/exercises?q=row&page=1&limit=20',
      headers: createAuthorizationHeader(authToken),
    });

    expect(searchResponse.statusCode).toBe(200);
    const searchPayload = searchResponse.json() as {
      data: Array<{ name: string }>;
      meta: { page: number; limit: number; total: number };
    };

    expect(searchPayload.data.map((exercise) => exercise.name)).toEqual([
      'Row Erg',
      'Single Arm Cable Row',
    ]);
    expect(searchPayload.meta).toEqual({
      page: 1,
      limit: 20,
      total: 2,
    });

    const categoryFilterResponse = await context.app.inject({
      method: 'GET',
      url: '/api/v1/exercises?category=cardio&page=1&limit=20',
      headers: createAuthorizationHeader(authToken),
    });

    expect(categoryFilterResponse.statusCode).toBe(200);
    expect((categoryFilterResponse.json() as { data: Array<{ name: string }> }).data).toEqual([
      expect.objectContaining({ name: 'Row Erg' }),
    ]);

    const compoundFilterResponse = await context.app.inject({
      method: 'GET',
      url: '/api/v1/exercises?muscleGroup=chest&equipment=barbell&page=1&limit=20',
      headers: createAuthorizationHeader(authToken),
    });

    expect(compoundFilterResponse.statusCode).toBe(200);
    expect((compoundFilterResponse.json() as { data: Array<{ name: string }> }).data).toEqual([
      expect.objectContaining({ name: 'Barbell Bench Press' }),
    ]);

    const updateResponse = await context.app.inject({
      method: 'PUT',
      url: `/api/v1/exercises/${createdExercise.id}`,
      headers: createAuthorizationHeader(authToken),
      payload: {
        name: 'Chest Supported Cable Row',
        equipment: 'machine',
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toEqual({
      data: expect.objectContaining({
        id: createdExercise.id,
        name: 'Chest Supported Cable Row',
        equipment: 'machine',
      }),
    });

    const deleteResponse = await context.app.inject({
      method: 'DELETE',
      url: `/api/v1/exercises/${createdExercise.id}`,
      headers: createAuthorizationHeader(authToken),
    });

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({
      data: {
        success: true,
      },
    });

    const postDeleteSearchResponse = await context.app.inject({
      method: 'GET',
      url: '/api/v1/exercises?q=chest%20supported&page=1&limit=20',
      headers: createAuthorizationHeader(authToken),
    });

    expect(postDeleteSearchResponse.statusCode).toBe(200);
    expect(postDeleteSearchResponse.json()).toEqual({
      data: [],
      meta: {
        page: 1,
        limit: 20,
        total: 0,
      },
    });
  });
});
