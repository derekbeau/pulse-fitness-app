import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  exercises,
  scheduledWorkoutExerciseSets,
  scheduledWorkoutExercises,
  scheduledWorkouts,
  users,
} from '../../db/schema/index.js';

type DatabaseModule = typeof import('../../db/index.js');
type StoreModule = typeof import('./store.js');

type TestContext = {
  db: DatabaseModule['db'];
  sqlite: DatabaseModule['sqlite'];
  tempDir: string;
  store: StoreModule;
};

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const SCHEDULED_WORKOUT_ID = 'scheduled-1';
const EXERCISE_WARMUP_ID = 'exercise-warmup';
const EXERCISE_MAIN_ID = 'exercise-main';
const EXERCISE_COOLDOWN_ID = 'exercise-cooldown';
const UNKNOWN_EXERCISE_ID = 'exercise-unknown';
const MAIN_SNAPSHOT_EXERCISE_ID = 'snapshot-main';

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

const seedExercise = (values: { id: string; name: string; userId?: string | null }) =>
  context.db
    .insert(exercises)
    .values({
      id: values.id,
      userId: values.userId ?? null,
      name: values.name,
      trackingType: 'weight_reps',
      muscleGroups: ['legs'],
      equipment: 'barbell',
      category: 'compound',
      formCues: [],
      coachingNotes: null,
      instructions: null,
    })
    .run();

const seedSnapshotWorkout = () => {
  context.db
    .insert(scheduledWorkouts)
    .values({
      id: SCHEDULED_WORKOUT_ID,
      userId: USER_ID,
      templateId: null,
      date: '2026-04-21',
      sessionId: null,
      templateVersion: null,
    })
    .run();

  context.db
    .insert(scheduledWorkoutExercises)
    .values([
      {
        id: 'snapshot-warmup',
        scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
        exerciseId: EXERCISE_WARMUP_ID,
        section: 'warmup',
        orderIndex: 0,
        supersetGroup: null,
        tempo: 'controlled',
        restSeconds: 45,
        programmingNotes: 'Prime the movement pattern.',
      },
      {
        id: MAIN_SNAPSHOT_EXERCISE_ID,
        scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
        exerciseId: EXERCISE_MAIN_ID,
        section: 'main',
        orderIndex: 1,
        supersetGroup: 'A',
        tempo: '3-1-1',
        restSeconds: 90,
        programmingNotes: 'Drive hard through lockout.',
      },
      {
        id: 'snapshot-cooldown',
        scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
        exerciseId: EXERCISE_COOLDOWN_ID,
        section: 'cooldown',
        orderIndex: 2,
        supersetGroup: null,
        tempo: null,
        restSeconds: null,
        programmingNotes: 'Slow breathing.',
      },
    ])
    .run();

  context.db
    .insert(scheduledWorkoutExerciseSets)
    .values([
      {
        id: 'snapshot-main-set-1',
        scheduledWorkoutExerciseId: MAIN_SNAPSHOT_EXERCISE_ID,
        setNumber: 1,
        repsMin: 5,
        repsMax: 5,
        reps: 5,
        targetWeight: 100,
        targetWeightMin: null,
        targetWeightMax: null,
        targetSeconds: null,
        targetDistance: null,
      },
      {
        id: 'snapshot-main-set-2',
        scheduledWorkoutExerciseId: MAIN_SNAPSHOT_EXERCISE_ID,
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
      {
        id: 'snapshot-main-set-3',
        scheduledWorkoutExerciseId: MAIN_SNAPSHOT_EXERCISE_ID,
        setNumber: 3,
        repsMin: 5,
        repsMax: 5,
        reps: 5,
        targetWeight: 110,
        targetWeightMin: null,
        targetWeightMax: null,
        targetSeconds: null,
        targetDistance: null,
      },
    ])
    .run();
};

const readExerciseRows = () =>
  context.db
    .select({
      exerciseId: scheduledWorkoutExercises.exerciseId,
      section: scheduledWorkoutExercises.section,
      orderIndex: scheduledWorkoutExercises.orderIndex,
      supersetGroup: scheduledWorkoutExercises.supersetGroup,
      tempo: scheduledWorkoutExercises.tempo,
      restSeconds: scheduledWorkoutExercises.restSeconds,
      programmingNotes: scheduledWorkoutExercises.programmingNotes,
      updatedAt: scheduledWorkoutExercises.updatedAt,
    })
    .from(scheduledWorkoutExercises)
    .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, SCHEDULED_WORKOUT_ID))
    .all();

const readMainSetRows = () =>
  context.db
    .select({
      id: scheduledWorkoutExerciseSets.id,
      setNumber: scheduledWorkoutExerciseSets.setNumber,
      targetWeight: scheduledWorkoutExerciseSets.targetWeight,
      repsMin: scheduledWorkoutExerciseSets.repsMin,
      repsMax: scheduledWorkoutExerciseSets.repsMax,
      reps: scheduledWorkoutExerciseSets.reps,
    })
    .from(scheduledWorkoutExerciseSets)
    .where(eq(scheduledWorkoutExerciseSets.scheduledWorkoutExerciseId, MAIN_SNAPSHOT_EXERCISE_ID))
    .all()
    .sort((left, right) => left.setNumber - right.setNumber);

const readScheduledWorkoutUpdatedAt = () => {
  const row = context.db
    .select({ updatedAt: scheduledWorkouts.updatedAt })
    .from(scheduledWorkouts)
    .where(eq(scheduledWorkouts.id, SCHEDULED_WORKOUT_ID))
    .limit(1)
    .get();

  if (!row) {
    throw new Error('Scheduled workout missing in test fixture');
  }

  return row.updatedAt;
};

describe('scheduled workout structural mutation store functions', () => {
  beforeAll(async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-scheduled-workout-store-'));

    process.env.DATABASE_URL = join(tempDir, 'test.db');
    vi.resetModules();

    const dbModule = await import('../../db/index.js');
    migrate(dbModule.db, {
      migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
    });

    const store = await import('./store.js');

    context = {
      db: dbModule.db,
      sqlite: dbModule.sqlite,
      tempDir,
      store,
    };
  });

  afterAll(() => {
    if (context) {
      context.sqlite.close();
      rmSync(context.tempDir, { recursive: true, force: true });
    }

    delete process.env.DATABASE_URL;
    vi.resetModules();
  });

  beforeEach(() => {
    context.db.delete(scheduledWorkoutExerciseSets).run();
    context.db.delete(scheduledWorkoutExercises).run();
    context.db.delete(scheduledWorkouts).run();
    context.db.delete(exercises).run();
    context.db.delete(users).run();

    seedUser({ id: USER_ID, username: 'derek' });
    seedUser({ id: OTHER_USER_ID, username: 'alex' });
    seedExercise({ id: EXERCISE_WARMUP_ID, name: 'Jump Rope' });
    seedExercise({ id: EXERCISE_MAIN_ID, name: 'Back Squat' });
    seedExercise({ id: EXERCISE_COOLDOWN_ID, name: 'Hip Flexor Stretch' });
    seedSnapshotWorkout();
  });

  it('reorders snapshot exercises, keeps sections intact, and is idempotent on rerun', async () => {
    const result = await context.store.reorderScheduledWorkoutExercises({
      userId: USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      order: [EXERCISE_MAIN_ID, EXERCISE_COOLDOWN_ID, EXERCISE_WARMUP_ID],
    });

    expect(result).toMatchObject({
      id: SCHEDULED_WORKOUT_ID,
      exercises: expect.any(Array),
    });

    const reorderedRows = readExerciseRows();
    const rowByExerciseId = new Map(reorderedRows.map((row) => [row.exerciseId, row]));
    expect(rowByExerciseId.get(EXERCISE_MAIN_ID)?.orderIndex).toBe(0);
    expect(rowByExerciseId.get(EXERCISE_COOLDOWN_ID)?.orderIndex).toBe(1);
    expect(rowByExerciseId.get(EXERCISE_WARMUP_ID)?.orderIndex).toBe(2);
    expect(rowByExerciseId.get(EXERCISE_MAIN_ID)?.section).toBe('main');
    expect(rowByExerciseId.get(EXERCISE_COOLDOWN_ID)?.section).toBe('cooldown');
    expect(rowByExerciseId.get(EXERCISE_WARMUP_ID)?.section).toBe('warmup');

    const updatedAtAfterFirstRun = readScheduledWorkoutUpdatedAt();

    const rerun = await context.store.reorderScheduledWorkoutExercises({
      userId: USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      order: [EXERCISE_MAIN_ID, EXERCISE_COOLDOWN_ID, EXERCISE_WARMUP_ID],
    });

    expect(rerun).toMatchObject({
      id: SCHEDULED_WORKOUT_ID,
    });
    expect(readScheduledWorkoutUpdatedAt()).toBe(updatedAtAfterFirstRun);
  });

  it('returns invalid-order sentinel for missing or extra exercise ids without mutating rows', async () => {
    const beforeRows = readExerciseRows();

    const result = await context.store.reorderScheduledWorkoutExercises({
      userId: USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      order: [EXERCISE_WARMUP_ID, EXERCISE_MAIN_ID, UNKNOWN_EXERCISE_ID],
    });

    expect(result).toEqual({
      error: context.store.SCHEDULED_WORKOUT_REORDER_INVALID_ORDER,
      missingExerciseIds: [EXERCISE_COOLDOWN_ID],
      extraExerciseIds: [UNKNOWN_EXERCISE_ID],
      duplicateExerciseIds: [],
    });
    expect(readExerciseRows()).toEqual(beforeRows);
  });

  it('updates scheduled workout exercise fields partially and keeps unspecified fields unchanged', async () => {
    const result = await context.store.updateScheduledWorkoutExercises({
      userId: USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      updates: [
        {
          exerciseId: EXERCISE_MAIN_ID,
          tempo: '2-0-2',
        },
      ],
    });

    expect(result).toMatchObject({
      id: SCHEDULED_WORKOUT_ID,
    });

    const mainRow = readExerciseRows().find((row) => row.exerciseId === EXERCISE_MAIN_ID);
    expect(mainRow).toMatchObject({
      tempo: '2-0-2',
      supersetGroup: 'A',
      restSeconds: 90,
      programmingNotes: 'Drive hard through lockout.',
    });
  });

  it('clears nullable exercise fields and is idempotent when rerun with the same payload', async () => {
    const firstRun = await context.store.updateScheduledWorkoutExercises({
      userId: USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      updates: [
        {
          exerciseId: EXERCISE_MAIN_ID,
          supersetGroup: null,
        },
      ],
    });

    expect(firstRun).toMatchObject({
      id: SCHEDULED_WORKOUT_ID,
    });
    expect(readExerciseRows().find((row) => row.exerciseId === EXERCISE_MAIN_ID)?.supersetGroup).toBe(
      null,
    );
    const updatedAtAfterFirstRun = readScheduledWorkoutUpdatedAt();

    const secondRun = await context.store.updateScheduledWorkoutExercises({
      userId: USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      updates: [
        {
          exerciseId: EXERCISE_MAIN_ID,
          supersetGroup: null,
        },
      ],
    });

    expect(secondRun).toMatchObject({
      id: SCHEDULED_WORKOUT_ID,
    });
    expect(readScheduledWorkoutUpdatedAt()).toBe(updatedAtAfterFirstRun);
  });

  it('returns unknown-exercise sentinel for exercise updates without mutating rows', async () => {
    const beforeRows = readExerciseRows();

    const result = await context.store.updateScheduledWorkoutExercises({
      userId: USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      updates: [
        {
          exerciseId: UNKNOWN_EXERCISE_ID,
          tempo: 'explosive',
        },
      ],
    });

    expect(result).toEqual({
      error: context.store.SCHEDULED_WORKOUT_UNKNOWN_EXERCISE,
      exerciseId: UNKNOWN_EXERCISE_ID,
    });
    expect(readExerciseRows()).toEqual(beforeRows);
  });

  it('upserts set targets idempotently and removes a set with contiguous renumbering', async () => {
    const upsertResult = await context.store.updateScheduledWorkoutExerciseSets({
      userId: USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      exerciseId: EXERCISE_MAIN_ID,
      sets: [
        {
          setNumber: 1,
          targetWeight: 125,
        },
      ],
    });

    expect(upsertResult).toMatchObject({
      id: SCHEDULED_WORKOUT_ID,
    });
    expect(readMainSetRows()[0]).toMatchObject({
      setNumber: 1,
      targetWeight: 125,
    });

    const updatedAtAfterUpsert = readScheduledWorkoutUpdatedAt();
    const upsertRerun = await context.store.updateScheduledWorkoutExerciseSets({
      userId: USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      exerciseId: EXERCISE_MAIN_ID,
      sets: [
        {
          setNumber: 1,
          targetWeight: 125,
        },
      ],
    });

    expect(upsertRerun).toMatchObject({
      id: SCHEDULED_WORKOUT_ID,
    });
    expect(readScheduledWorkoutUpdatedAt()).toBe(updatedAtAfterUpsert);

    const removeResult = await context.store.updateScheduledWorkoutExerciseSets({
      userId: USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      exerciseId: EXERCISE_MAIN_ID,
      sets: [
        {
          setNumber: 2,
          remove: true,
        },
      ],
    });

    expect(removeResult).toMatchObject({
      id: SCHEDULED_WORKOUT_ID,
    });

    const renumberedRows = readMainSetRows();
    expect(renumberedRows.map((row) => row.setNumber)).toEqual([1, 2]);
    expect(renumberedRows).toHaveLength(2);
  });

  it('returns unknown-exercise sentinel for set updates without mutating rows', async () => {
    const beforeRows = readMainSetRows();

    const result = await context.store.updateScheduledWorkoutExerciseSets({
      userId: USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      exerciseId: UNKNOWN_EXERCISE_ID,
      sets: [
        {
          setNumber: 1,
          targetWeight: 140,
        },
      ],
    });

    expect(result).toEqual({
      error: context.store.SCHEDULED_WORKOUT_UNKNOWN_EXERCISE,
      exerciseId: UNKNOWN_EXERCISE_ID,
    });
    expect(readMainSetRows()).toEqual(beforeRows);
  });

  it('returns not-found/undefined for cross-user scope on all structural mutation functions', async () => {
    const beforeExerciseRows = readExerciseRows();
    const beforeSetRows = readMainSetRows();

    const reorderResult = await context.store.reorderScheduledWorkoutExercises({
      userId: OTHER_USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      order: [EXERCISE_MAIN_ID, EXERCISE_WARMUP_ID, EXERCISE_COOLDOWN_ID],
    });
    const exerciseUpdateResult = await context.store.updateScheduledWorkoutExercises({
      userId: OTHER_USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      updates: [
        {
          exerciseId: EXERCISE_MAIN_ID,
          tempo: '1-0-1',
        },
      ],
    });
    const setUpdateResult = await context.store.updateScheduledWorkoutExerciseSets({
      userId: OTHER_USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      exerciseId: EXERCISE_MAIN_ID,
      sets: [
        {
          setNumber: 1,
          targetWeight: 999,
        },
      ],
    });

    expect(reorderResult).toBeUndefined();
    expect(exerciseUpdateResult).toBeUndefined();
    expect(setUpdateResult).toBeUndefined();
    expect(readExerciseRows()).toEqual(beforeExerciseRows);
    expect(readMainSetRows()).toEqual(beforeSetRows);
  });

  it('reorder detects duplicate ids in the payload as invalid-order', async () => {
    const result = await context.store.reorderScheduledWorkoutExercises({
      userId: USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      order: [EXERCISE_MAIN_ID, EXERCISE_MAIN_ID, EXERCISE_COOLDOWN_ID],
    });

    expect(result).toEqual({
      error: context.store.SCHEDULED_WORKOUT_REORDER_INVALID_ORDER,
      missingExerciseIds: [EXERCISE_WARMUP_ID],
      extraExerciseIds: [],
      duplicateExerciseIds: [EXERCISE_MAIN_ID],
    });
  });

  it('set updates treat undefined as no-op and null as explicit clear', async () => {
    const targetBefore = readMainSetRows().find((row) => row.setNumber === 1)?.targetWeight;
    expect(targetBefore).toBe(100);

    const noOpResult = await context.store.updateScheduledWorkoutExerciseSets({
      userId: USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      exerciseId: EXERCISE_MAIN_ID,
      sets: [
        {
          setNumber: 1,
        },
      ],
    });
    expect(noOpResult).toMatchObject({ id: SCHEDULED_WORKOUT_ID });
    expect(readMainSetRows().find((row) => row.setNumber === 1)?.targetWeight).toBe(100);

    const clearResult = await context.store.updateScheduledWorkoutExerciseSets({
      userId: USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      exerciseId: EXERCISE_MAIN_ID,
      sets: [
        {
          setNumber: 1,
          targetWeight: null,
        },
      ],
    });
    expect(clearResult).toMatchObject({ id: SCHEDULED_WORKOUT_ID });
    expect(readMainSetRows().find((row) => row.setNumber === 1)?.targetWeight).toBeNull();
  });

  it('exercise updates treat undefined as leave-alone and null as explicit clear', async () => {
    const before = readExerciseRows().find((row) => row.exerciseId === EXERCISE_MAIN_ID);
    expect(before?.programmingNotes).toBe('Drive hard through lockout.');

    const unchangedResult = await context.store.updateScheduledWorkoutExercises({
      userId: USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      updates: [
        {
          exerciseId: EXERCISE_MAIN_ID,
        },
      ],
    });
    expect(unchangedResult).toMatchObject({ id: SCHEDULED_WORKOUT_ID });
    expect(
      readExerciseRows().find((row) => row.exerciseId === EXERCISE_MAIN_ID)?.programmingNotes,
    ).toBe('Drive hard through lockout.');

    const clearedResult = await context.store.updateScheduledWorkoutExercises({
      userId: USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      updates: [
        {
          exerciseId: EXERCISE_MAIN_ID,
          programmingNotes: null,
        },
      ],
    });
    expect(clearedResult).toMatchObject({ id: SCHEDULED_WORKOUT_ID });
    expect(
      readExerciseRows().find((row) => row.exerciseId === EXERCISE_MAIN_ID)?.programmingNotes,
    ).toBeNull();
  });

  it('set delete renumbering remains transactional when another update in payload is invalid no-op', async () => {
    const beforeSetRows = readMainSetRows();

    const result = await context.store.updateScheduledWorkoutExerciseSets({
      userId: USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      exerciseId: EXERCISE_MAIN_ID,
      sets: [
        { setNumber: 2, remove: true },
        { setNumber: 50, remove: true },
      ],
    });

    expect(result).toMatchObject({ id: SCHEDULED_WORKOUT_ID });
    const afterSetRows = readMainSetRows();
    expect(afterSetRows).not.toEqual(beforeSetRows);
    expect(afterSetRows.map((row) => row.setNumber)).toEqual([1, 2]);
  });

  it('scope guard leaves row counts unchanged for non-owner calls', async () => {
    const beforeCounts = {
      exercises: context.db
        .select({ id: scheduledWorkoutExercises.id })
        .from(scheduledWorkoutExercises)
        .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, SCHEDULED_WORKOUT_ID))
        .all().length,
      sets: context.db
        .select({ id: scheduledWorkoutExerciseSets.id })
        .from(scheduledWorkoutExerciseSets)
        .where(eq(scheduledWorkoutExerciseSets.scheduledWorkoutExerciseId, MAIN_SNAPSHOT_EXERCISE_ID))
        .all().length,
    };

    await context.store.reorderScheduledWorkoutExercises({
      userId: OTHER_USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      order: [EXERCISE_MAIN_ID, EXERCISE_COOLDOWN_ID, EXERCISE_WARMUP_ID],
    });
    await context.store.updateScheduledWorkoutExercises({
      userId: OTHER_USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      updates: [{ exerciseId: EXERCISE_MAIN_ID, restSeconds: 120 }],
    });
    await context.store.updateScheduledWorkoutExerciseSets({
      userId: OTHER_USER_ID,
      scheduledWorkoutId: SCHEDULED_WORKOUT_ID,
      exerciseId: EXERCISE_MAIN_ID,
      sets: [{ setNumber: 1, reps: 6 }],
    });

    const afterCounts = {
      exercises: context.db
        .select({ id: scheduledWorkoutExercises.id })
        .from(scheduledWorkoutExercises)
        .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, SCHEDULED_WORKOUT_ID))
        .all().length,
      sets: context.db
        .select({ id: scheduledWorkoutExerciseSets.id })
        .from(scheduledWorkoutExerciseSets)
        .where(eq(scheduledWorkoutExerciseSets.scheduledWorkoutExerciseId, MAIN_SNAPSHOT_EXERCISE_ID))
        .all().length,
    };

    expect(afterCounts).toEqual(beforeCounts);
  });
});
