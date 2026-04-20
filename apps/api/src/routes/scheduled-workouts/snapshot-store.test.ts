import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it } from 'vitest';

import * as schema from '../../db/schema/index.js';
import {
  exercises,
  scheduledWorkoutExerciseSets,
  scheduledWorkoutExercises,
  scheduledWorkouts,
  templateExercises,
  users,
  workoutTemplates,
} from '../../db/schema/index.js';

import { deleteSnapshot, readSnapshot, writeSnapshot } from './snapshot-store.js';

type TestDatabase = ReturnType<typeof drizzle<typeof schema>>;

const tempDirs: string[] = [];

const createTestDatabase = () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'pulse-snapshot-store-'));
  tempDirs.push(tempDir);
  const dbPath = join(tempDir, 'test.db');
  const sqlite = new Database(dbPath);
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, {
    schema,
  });
  migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
  });

  return { db, sqlite, tempDir };
};

const seedBaseTemplate = (db: TestDatabase) => {
  db.insert(users)
    .values({
      id: 'user-1',
      username: 'derek',
      name: 'Derek',
      passwordHash: 'hash',
    })
    .run();

  db.insert(exercises)
    .values([
      {
        id: 'exercise-warmup',
        userId: null,
        name: 'Jump Rope',
        muscleGroups: ['calves'],
        equipment: 'none',
        category: 'cardio',
        trackingType: 'seconds_only',
      },
      {
        id: 'exercise-main',
        userId: null,
        name: 'Kettlebell Swing',
        muscleGroups: ['hamstrings'],
        equipment: 'kettlebell',
        category: 'compound',
        trackingType: 'weight_reps',
      },
      {
        id: 'exercise-cooldown',
        userId: null,
        name: 'Couch Stretch',
        muscleGroups: ['quads'],
        equipment: 'none',
        category: 'mobility',
        trackingType: 'seconds_only',
      },
    ])
    .run();

  db.insert(workoutTemplates)
    .values({
      id: 'template-1',
      userId: 'user-1',
      name: 'Lower Body Day',
      description: null,
      tags: [],
      deletedAt: null,
    })
    .run();

  db.insert(templateExercises)
    .values([
      {
        id: 'template-ex-main',
        templateId: 'template-1',
        exerciseId: 'exercise-main',
        section: 'main',
        orderIndex: 1,
        sets: 2,
        repsMin: 8,
        repsMax: 8,
        restSeconds: 90,
        supersetGroup: 'A',
        notes: 'Fallback template note',
        programmingNotes: null,
        cues: ['Hinge hips', 'Brace'],
        setTargets: [
          {
            setNumber: 2,
            targetWeight: 62.5,
          },
          {
            setNumber: 1,
            targetWeight: 55,
          },
        ],
      },
      {
        id: 'template-ex-warmup',
        templateId: 'template-1',
        exerciseId: 'exercise-warmup',
        section: 'warmup',
        orderIndex: 0,
        sets: 1,
        repsMin: null,
        repsMax: null,
        restSeconds: 45,
        notes: null,
        programmingNotes: 'Keep cadence easy for 3 minutes.',
        cues: ['Stay relaxed'],
      },
      {
        id: 'template-ex-cooldown',
        templateId: 'template-1',
        exerciseId: 'exercise-cooldown',
        section: 'cooldown',
        orderIndex: 0,
        sets: null,
        repsMin: null,
        repsMax: null,
        restSeconds: null,
        notes: null,
        programmingNotes: null,
      },
    ])
    .run();

  db.insert(scheduledWorkouts)
    .values({
      id: 'scheduled-1',
      userId: 'user-1',
      templateId: 'template-1',
      date: '2026-04-21',
    })
    .run();
};

describe('scheduled workout snapshot store', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('writeSnapshot copies template exercises, sets, and stores templateVersion hash', async () => {
    const { db, sqlite } = await createTestDatabase();
    try {
      seedBaseTemplate(db);

      const writeResult = await writeSnapshot({
        scheduledWorkoutId: 'scheduled-1',
        templateId: 'template-1',
        database: db,
      });

      expect(writeResult.exerciseCount).toBe(3);
      expect(writeResult.setCount).toBe(4);
      expect(writeResult.templateVersion).toMatch(/^[0-9a-f]{64}$/);

      const scheduledWorkoutRow = db
        .select({
          templateVersion: scheduledWorkouts.templateVersion,
        })
        .from(scheduledWorkouts)
        .where(eq(scheduledWorkouts.id, 'scheduled-1'))
        .limit(1)
        .get();

      expect(scheduledWorkoutRow?.templateVersion).toBe(writeResult.templateVersion);

      const snapshotRows = db
        .select({
          exerciseId: scheduledWorkoutExercises.exerciseId,
          section: scheduledWorkoutExercises.section,
          orderIndex: scheduledWorkoutExercises.orderIndex,
          programmingNotes: scheduledWorkoutExercises.programmingNotes,
          agentNotes: scheduledWorkoutExercises.agentNotes,
          templateCues: scheduledWorkoutExercises.templateCues,
        })
        .from(scheduledWorkoutExercises)
        .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, 'scheduled-1'))
        .all();

      expect(snapshotRows).toHaveLength(3);
      const mainRow = snapshotRows.find((row) => row.section === 'main');
      expect(mainRow).toMatchObject({
        exerciseId: 'exercise-main',
        orderIndex: 1,
        programmingNotes: 'Fallback template note',
        agentNotes: null,
        templateCues: ['Hinge hips', 'Brace'],
      });

      const readResult = await readSnapshot('scheduled-1', db);
      expect(readResult.exercises.map((exercise) => exercise.section)).toEqual([
        'warmup',
        'main',
        'cooldown',
      ]);
      expect(readResult.exercises[1]?.sets.map((set) => set.setNumber)).toEqual([1, 2]);
      expect(readResult.exercises[1]?.sets[0]).toMatchObject({
        targetWeight: 55,
        reps: 8,
      });
      expect(readResult.exercises[1]?.sets[1]).toMatchObject({
        targetWeight: 62.5,
        reps: 8,
      });
    } finally {
      sqlite.close();
    }
  });

  it('deleteSnapshot removes all snapshot rows for a scheduled workout', async () => {
    const { db, sqlite } = await createTestDatabase();
    try {
      seedBaseTemplate(db);

      await writeSnapshot({
        scheduledWorkoutId: 'scheduled-1',
        templateId: 'template-1',
        database: db,
      });

      const changes = await deleteSnapshot('scheduled-1', db);
      expect(changes).toBe(3);

      const remainingExercises = db
        .select({ id: scheduledWorkoutExercises.id })
        .from(scheduledWorkoutExercises)
        .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, 'scheduled-1'))
        .all();
      expect(remainingExercises).toEqual([]);

      const remainingSets = db
        .select({ id: scheduledWorkoutExerciseSets.id })
        .from(scheduledWorkoutExerciseSets)
        .all();
      expect(remainingSets).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
});
