import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { and, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutTemplateSectionType } from '@pulse/shared';

import {
  agentTokens,
  exercises,
  sessionSets,
  users,
  workoutSessions,
} from '../../db/schema/index.js';

type DatabaseModule = typeof import('../../db/index.js');
type StoreModule = typeof import('./store.js');

type TestContext = {
  app: FastifyInstance;
  db: DatabaseModule['db'];
  sqlite: DatabaseModule['sqlite'];
  tempDir: string;
  store: StoreModule;
};

let context: TestContext;

const seedUser = (values: { id: string; username: string }) =>
  context.db
    .insert(users)
    .values({
      id: values.id,
      username: values.username,
      name: values.username,
      passwordHash: 'not-used-in-this-suite',
    })
    .run();

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

const seedExercise = (values: { id: string; name: string; userId?: string | null }) =>
  context.db
    .insert(exercises)
    .values({
      id: values.id,
      userId: values.userId ?? null,
      name: values.name,
      trackingType: 'weight_reps',
      muscleGroups: ['chest'],
      equipment: 'barbell',
      category: 'compound',
      formCues: [],
      coachingNotes: null,
      instructions: null,
    })
    .run();

const seedWorkoutSession = (values: {
  id: string;
  userId: string;
  status: 'scheduled' | 'in-progress' | 'paused' | 'cancelled' | 'completed';
}) =>
  context.db
    .insert(workoutSessions)
    .values({
      id: values.id,
      userId: values.userId,
      templateId: null,
      scheduledWorkoutId: null,
      name: `Session ${values.id}`,
      date: '2026-03-12',
      status: values.status,
      startedAt: Date.now() - 60_000,
      completedAt: values.status === 'completed' ? Date.now() : null,
      duration: null,
      timeSegments: '[]',
      feedback: null,
      exerciseProgrammingNotes: null,
      exerciseAgentNotes: null,
      exerciseAgentNotesMeta: null,
      notes: null,
    })
    .run();

const seedSessionSet = (values: {
  id: string;
  sessionId: string;
  exerciseId: string | null;
  section?: WorkoutTemplateSectionType;
  orderIndex?: number;
  setNumber: number;
}) =>
  context.db
    .insert(sessionSets)
    .values({
      id: values.id,
      sessionId: values.sessionId,
      exerciseId: values.exerciseId,
      orderIndex: values.orderIndex ?? 0,
      setNumber: values.setNumber,
      weight: null,
      reps: null,
      targetWeight: null,
      targetWeightMin: null,
      targetWeightMax: null,
      targetSeconds: null,
      targetDistance: null,
      completed: false,
      skipped: false,
      supersetGroup: null,
      section: values.section ?? 'main',
      notes: null,
    })
    .run();

describe('workout session store deleteSessionSet', () => {
  beforeAll(async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-workout-session-store-'));

    process.env.DATABASE_URL = join(tempDir, 'test.db');
    vi.resetModules();

    const [{ buildServer }, dbModule] = await Promise.all([
      import('../../index.js'),
      import('../../db/index.js'),
    ]);
    migrate(dbModule.db, {
      migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
    });

    const store = await import('./store.js');
    const app = buildServer();
    await app.ready();

    context = {
      app,
      db: dbModule.db,
      sqlite: dbModule.sqlite,
      tempDir,
      store,
    };
  });

  afterAll(async () => {
    if (context) {
      await context.app.close();
      context.sqlite.close();
      rmSync(context.tempDir, { recursive: true, force: true });
    }

    delete process.env.DATABASE_URL;
    vi.resetModules();
  });

  beforeEach(() => {
    context.db.delete(sessionSets).run();
    context.db.delete(workoutSessions).run();
    context.db.delete(agentTokens).run();
    context.db.delete(exercises).run();
    context.db.delete(users).run();

    seedUser({ id: 'user-1', username: 'derek' });
    seedUser({ id: 'user-2', username: 'alex' });

    seedExercise({ id: 'global-bench-press', name: 'Bench Press' });
    seedExercise({ id: 'global-row', name: 'Row' });
  });

  it('sortSessionSets orders warmup/main/cooldown/supplemental/null/unknown', () => {
    type SortableSetRecord = Parameters<StoreModule['sortSessionSets']>[0];
    const baseCreatedAt = Date.now();

    const buildSortableSet = (
      id: string,
      section: WorkoutTemplateSectionType | null,
      createdAtOffset: number,
    ): SortableSetRecord => ({
      id,
      sessionId: 'session-sort',
      exerciseId: `${id}-exercise`,
      orderIndex: 0,
      setNumber: 1,
      weight: null,
      reps: null,
      targetWeight: null,
      targetWeightMin: null,
      targetWeightMax: null,
      targetSeconds: null,
      targetDistance: null,
      supersetGroup: null,
      completed: false,
      skipped: false,
      section,
      notes: null,
      createdAt: baseCreatedAt + createdAtOffset,
    });

    const unknownSection = 'legacy' as unknown as WorkoutTemplateSectionType;
    const rows: SortableSetRecord[] = [
      buildSortableSet('unknown', unknownSection, 5),
      buildSortableSet('supplemental', 'supplemental', 4),
      buildSortableSet('main', 'main', 2),
      buildSortableSet('null', null, 6),
      buildSortableSet('cooldown', 'cooldown', 3),
      buildSortableSet('warmup', 'warmup', 1),
    ];

    const sortedSections = rows.sort(context.store.sortSessionSets).map((row) => row.section);
    expect(sortedSections).toEqual([
      'warmup',
      'main',
      'cooldown',
      'supplemental',
      null,
      unknownSection,
    ]);
  });

  it('returns GET /workout-sessions/:id sets in warmup/main/cooldown/supplemental order', async () => {
    seedExercise({ id: 'global-squat', name: 'Squat' });
    seedExercise({ id: 'global-press', name: 'Press' });
    seedWorkoutSession({ id: 'session-get-order', userId: 'user-1', status: 'in-progress' });
    seedSessionSet({
      id: 'session-get-order-supplemental',
      sessionId: 'session-get-order',
      exerciseId: 'global-press',
      section: 'supplemental',
      orderIndex: 0,
      setNumber: 1,
    });
    seedSessionSet({
      id: 'session-get-order-main',
      sessionId: 'session-get-order',
      exerciseId: 'global-row',
      section: 'main',
      orderIndex: 0,
      setNumber: 1,
    });
    seedSessionSet({
      id: 'session-get-order-cooldown',
      sessionId: 'session-get-order',
      exerciseId: 'global-squat',
      section: 'cooldown',
      orderIndex: 0,
      setNumber: 1,
    });
    seedSessionSet({
      id: 'session-get-order-warmup',
      sessionId: 'session-get-order',
      exerciseId: 'global-bench-press',
      section: 'warmup',
      orderIndex: 0,
      setNumber: 1,
    });

    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/workout-sessions/session-get-order',
      headers: createAgentTokenHeader(seedAgentToken('user-1')),
    });

    expect(response.statusCode).toBe(200);

    const payload = response.json() as {
      data: {
        sets: Array<{ section: WorkoutTemplateSectionType }>;
      };
    };

    expect(payload.data.sets.map((set) => set.section)).toEqual([
      'warmup',
      'main',
      'cooldown',
      'supplemental',
    ]);
  });

  it('orders exercises by section as warmup/main/cooldown/supplemental', async () => {
    seedExercise({ id: 'global-squat', name: 'Squat' });
    seedExercise({ id: 'global-press', name: 'Press' });
    seedWorkoutSession({
      id: 'session-exercise-order',
      userId: 'user-1',
      status: 'in-progress',
    });
    seedSessionSet({
      id: 'session-exercise-order-supplemental',
      sessionId: 'session-exercise-order',
      exerciseId: 'global-press',
      section: 'supplemental',
      orderIndex: 0,
      setNumber: 1,
    });
    seedSessionSet({
      id: 'session-exercise-order-main',
      sessionId: 'session-exercise-order',
      exerciseId: 'global-row',
      section: 'main',
      orderIndex: 0,
      setNumber: 1,
    });
    seedSessionSet({
      id: 'session-exercise-order-cooldown',
      sessionId: 'session-exercise-order',
      exerciseId: 'global-squat',
      section: 'cooldown',
      orderIndex: 0,
      setNumber: 1,
    });
    seedSessionSet({
      id: 'session-exercise-order-warmup',
      sessionId: 'session-exercise-order',
      exerciseId: 'global-bench-press',
      section: 'warmup',
      orderIndex: 0,
      setNumber: 1,
    });

    const session = await context.store.findWorkoutSessionById('session-exercise-order', 'user-1');
    expect(session).toBeDefined();
    if (!session) {
      throw new Error('Expected seeded session to exist');
    }

    const exercises = session.exercises ?? [];
    expect(exercises.map((exercise) => exercise.section)).toEqual([
      'warmup',
      'main',
      'cooldown',
      'supplemental',
    ]);
  });

  it('deletes a middle set and renumbers remaining sets contiguously within the same exercise section', async () => {
    seedWorkoutSession({ id: 'session-middle-delete', userId: 'user-1', status: 'in-progress' });
    seedSessionSet({
      id: 'session-middle-delete-main-1',
      sessionId: 'session-middle-delete',
      exerciseId: 'global-bench-press',
      section: 'main',
      setNumber: 1,
    });
    seedSessionSet({
      id: 'session-middle-delete-main-2',
      sessionId: 'session-middle-delete',
      exerciseId: 'global-bench-press',
      section: 'main',
      setNumber: 2,
    });
    seedSessionSet({
      id: 'session-middle-delete-main-3',
      sessionId: 'session-middle-delete',
      exerciseId: 'global-bench-press',
      section: 'main',
      setNumber: 3,
    });
    seedSessionSet({
      id: 'session-middle-delete-warmup-1',
      sessionId: 'session-middle-delete',
      exerciseId: 'global-bench-press',
      section: 'warmup',
      setNumber: 1,
    });
    seedSessionSet({
      id: 'session-middle-delete-other-exercise-1',
      sessionId: 'session-middle-delete',
      exerciseId: 'global-row',
      section: 'main',
      setNumber: 1,
    });

    const result = await context.store.deleteSessionSet({
      sessionId: 'session-middle-delete',
      setId: 'session-middle-delete-main-2',
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: 'session-middle-delete-main-1',
        setNumber: 1,
        section: 'main',
      }),
      expect.objectContaining({
        id: 'session-middle-delete-main-3',
        setNumber: 2,
        section: 'main',
      }),
    ]);

    const persistedSets = context.db
      .select({
        id: sessionSets.id,
        exerciseId: sessionSets.exerciseId,
        section: sessionSets.section,
        setNumber: sessionSets.setNumber,
      })
      .from(sessionSets)
      .where(eq(sessionSets.sessionId, 'session-middle-delete'))
      .all();

    expect(persistedSets).toEqual(
      expect.arrayContaining([
        {
          id: 'session-middle-delete-main-1',
          exerciseId: 'global-bench-press',
          section: 'main',
          setNumber: 1,
        },
        {
          id: 'session-middle-delete-main-3',
          exerciseId: 'global-bench-press',
          section: 'main',
          setNumber: 2,
        },
        {
          id: 'session-middle-delete-warmup-1',
          exerciseId: 'global-bench-press',
          section: 'warmup',
          setNumber: 1,
        },
        {
          id: 'session-middle-delete-other-exercise-1',
          exerciseId: 'global-row',
          section: 'main',
          setNumber: 1,
        },
      ]),
    );
    expect(persistedSets).toHaveLength(4);
  });

  it('deletes the last set without changing existing contiguous numbering', async () => {
    seedWorkoutSession({ id: 'session-last-delete', userId: 'user-1', status: 'in-progress' });
    seedSessionSet({
      id: 'session-last-delete-1',
      sessionId: 'session-last-delete',
      exerciseId: 'global-bench-press',
      setNumber: 1,
    });
    seedSessionSet({
      id: 'session-last-delete-2',
      sessionId: 'session-last-delete',
      exerciseId: 'global-bench-press',
      setNumber: 2,
    });
    seedSessionSet({
      id: 'session-last-delete-3',
      sessionId: 'session-last-delete',
      exerciseId: 'global-bench-press',
      setNumber: 3,
    });

    const result = await context.store.deleteSessionSet({
      sessionId: 'session-last-delete',
      setId: 'session-last-delete-3',
    });

    expect(result).toEqual([
      expect.objectContaining({ id: 'session-last-delete-1', setNumber: 1 }),
      expect.objectContaining({ id: 'session-last-delete-2', setNumber: 2 }),
    ]);

    const remainingSetNumbers = context.db
      .select({ setNumber: sessionSets.setNumber })
      .from(sessionSets)
      .where(
        and(
          eq(sessionSets.sessionId, 'session-last-delete'),
          eq(sessionSets.exerciseId, 'global-bench-press'),
          eq(sessionSets.section, 'main'),
        ),
      )
      .all()
      .map((set) => set.setNumber)
      .sort((left, right) => left - right);

    expect(remainingSetNumbers).toEqual([1, 2]);
  });

  it('deletes the only set and leaves the exercise with zero sets', async () => {
    seedWorkoutSession({ id: 'session-only-delete', userId: 'user-1', status: 'in-progress' });
    seedSessionSet({
      id: 'session-only-delete-1',
      sessionId: 'session-only-delete',
      exerciseId: 'global-bench-press',
      setNumber: 1,
    });

    const result = await context.store.deleteSessionSet({
      sessionId: 'session-only-delete',
      setId: 'session-only-delete-1',
    });

    expect(result).toEqual([]);

    const remainingSets = context.db
      .select({ id: sessionSets.id })
      .from(sessionSets)
      .where(eq(sessionSets.sessionId, 'session-only-delete'))
      .all();
    expect(remainingSets).toEqual([]);
  });

  it('returns session-not-in-progress for completed sessions without mutating sets', async () => {
    seedWorkoutSession({ id: 'session-completed-delete', userId: 'user-1', status: 'completed' });
    seedSessionSet({
      id: 'session-completed-delete-1',
      sessionId: 'session-completed-delete',
      exerciseId: 'global-bench-press',
      setNumber: 1,
    });
    seedSessionSet({
      id: 'session-completed-delete-2',
      sessionId: 'session-completed-delete',
      exerciseId: 'global-bench-press',
      setNumber: 2,
    });

    const beforeSnapshot = context.db
      .select({ id: sessionSets.id, setNumber: sessionSets.setNumber })
      .from(sessionSets)
      .where(eq(sessionSets.sessionId, 'session-completed-delete'))
      .all();

    const result = await context.store.deleteSessionSet({
      sessionId: 'session-completed-delete',
      setId: 'session-completed-delete-1',
    });

    expect(result).toEqual({
      error: context.store.SESSION_SET_DELETE_NOT_IN_PROGRESS,
    });

    const afterSnapshot = context.db
      .select({ id: sessionSets.id, setNumber: sessionSets.setNumber })
      .from(sessionSets)
      .where(eq(sessionSets.sessionId, 'session-completed-delete'))
      .all();

    expect(afterSnapshot).toEqual(beforeSnapshot);
  });

  it('returns undefined when setId does not belong to the provided session', async () => {
    seedWorkoutSession({ id: 'session-scope-a', userId: 'user-1', status: 'in-progress' });
    seedWorkoutSession({ id: 'session-scope-b', userId: 'user-1', status: 'in-progress' });
    seedSessionSet({
      id: 'session-scope-b-set-1',
      sessionId: 'session-scope-b',
      exerciseId: 'global-bench-press',
      setNumber: 1,
    });

    const result = await context.store.deleteSessionSet({
      sessionId: 'session-scope-a',
      setId: 'session-scope-b-set-1',
    });

    expect(result).toBeUndefined();

    const persistedSet = context.db
      .select({ id: sessionSets.id, sessionId: sessionSets.sessionId })
      .from(sessionSets)
      .where(eq(sessionSets.id, 'session-scope-b-set-1'))
      .get();

    expect(persistedSet).toEqual({
      id: 'session-scope-b-set-1',
      sessionId: 'session-scope-b',
    });
  });

  it('renumbers null-exercise rows using IS NULL scope without touching named exercises', async () => {
    seedWorkoutSession({ id: 'session-null-exercise', userId: 'user-1', status: 'in-progress' });
    seedSessionSet({
      id: 'session-null-exercise-null-1',
      sessionId: 'session-null-exercise',
      exerciseId: null,
      setNumber: 1,
    });
    seedSessionSet({
      id: 'session-null-exercise-null-2',
      sessionId: 'session-null-exercise',
      exerciseId: null,
      setNumber: 2,
    });
    seedSessionSet({
      id: 'session-null-exercise-main-1',
      sessionId: 'session-null-exercise',
      exerciseId: 'global-row',
      setNumber: 1,
    });

    const result = await context.store.deleteSessionSet({
      sessionId: 'session-null-exercise',
      setId: 'session-null-exercise-null-1',
    });

    expect(result).toEqual([
      expect.objectContaining({ id: 'session-null-exercise-null-2', setNumber: 1 }),
    ]);

    const persistedSets = context.db
      .select({
        id: sessionSets.id,
        exerciseId: sessionSets.exerciseId,
        setNumber: sessionSets.setNumber,
      })
      .from(sessionSets)
      .where(eq(sessionSets.sessionId, 'session-null-exercise'))
      .all();

    expect(persistedSets).toEqual(
      expect.arrayContaining([
        {
          id: 'session-null-exercise-null-2',
          exerciseId: null,
          setNumber: 1,
        },
        {
          id: 'session-null-exercise-main-1',
          exerciseId: 'global-row',
          setNumber: 1,
        },
      ]),
    );
    expect(persistedSets).toHaveLength(2);
  });
});
