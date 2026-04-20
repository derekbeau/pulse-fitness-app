import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as schema from '../schema/index.js';
import {
  exercises,
  scheduledWorkoutExerciseSets,
  scheduledWorkoutExercises,
  scheduledWorkouts,
  templateExercises,
  users,
  workoutTemplates,
} from '../schema/index.js';

import { backfillScheduledWorkoutSnapshots } from './scheduled-workout-snapshots.js';

type TestDatabase = ReturnType<typeof drizzle<typeof schema>>;

const tempDirs: string[] = [];

const createTestDatabase = () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'pulse-snapshot-backfill-'));
  tempDirs.push(tempDir);
  const dbPath = join(tempDir, 'test.db');
  const sqlite = new Database(dbPath);
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
  });

  return { db, sqlite, tempDir };
};

const seedTemplate = (db: TestDatabase, values: { id: string; deletedAt?: string | null }) =>
  db
    .insert(workoutTemplates)
    .values({
      id: values.id,
      userId: 'user-1',
      name: values.id,
      description: null,
      tags: [],
      deletedAt: values.deletedAt ?? null,
    })
    .run();

describe('scheduled workout snapshot backfill', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('backfills snapshots for live templates and skips soft-deleted templates with warnings', async () => {
    const { db, sqlite } = createTestDatabase();
    try {
      db.insert(users)
        .values({
          id: 'user-1',
          username: 'derek',
          name: 'Derek',
          passwordHash: 'hash',
        })
        .run();

      db.insert(exercises)
        .values({
          id: 'exercise-1',
          userId: null,
          name: 'Back Squat',
          muscleGroups: ['quads'],
          equipment: 'barbell',
          category: 'compound',
          trackingType: 'weight_reps',
        })
        .run();

      seedTemplate(db, { id: 'template-live' });
      seedTemplate(db, { id: 'template-deleted', deletedAt: '2026-04-20T10:00:00.000Z' });

      db.insert(templateExercises)
        .values({
          id: 'template-live-exercise',
          templateId: 'template-live',
          exerciseId: 'exercise-1',
          section: 'main',
          orderIndex: 0,
          sets: 3,
          repsMin: 5,
          repsMax: 5,
          notes: 'Use belt from set two.',
        })
        .run();

      db.insert(scheduledWorkouts)
        .values([
          {
            id: 'scheduled-live',
            userId: 'user-1',
            templateId: 'template-live',
            date: '2026-04-21',
          },
          {
            id: 'scheduled-deleted-template',
            userId: 'user-1',
            templateId: 'template-deleted',
            date: '2026-04-22',
          },
        ])
        .run();

      const logger = {
        info: vi.fn(),
        warn: vi.fn(),
      };

      const summary = await backfillScheduledWorkoutSnapshots({
        database: db,
        logger,
      });

      expect(summary).toEqual({
        processed: 1,
        skipped: 1,
        snapshotRowsWritten: 1,
        setRowsWritten: 3,
      });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('scheduled-deleted-template'),
      );

      const snapshotExerciseRows = db
        .select({
          id: scheduledWorkoutExercises.id,
          scheduledWorkoutId: scheduledWorkoutExercises.scheduledWorkoutId,
        })
        .from(scheduledWorkoutExercises)
        .all();

      expect(snapshotExerciseRows).toEqual([
        {
          id: expect.any(String),
          scheduledWorkoutId: 'scheduled-live',
        },
      ]);

      const scheduledLiveRow = db
        .select({ templateVersion: scheduledWorkouts.templateVersion })
        .from(scheduledWorkouts)
        .where(eq(scheduledWorkouts.id, 'scheduled-live'))
        .limit(1)
        .get();

      expect(scheduledLiveRow?.templateVersion).toMatch(/^[0-9a-f]{64}$/);

      const setRows = db
        .select({ id: scheduledWorkoutExerciseSets.id })
        .from(scheduledWorkoutExerciseSets)
        .all();
      expect(setRows).toHaveLength(3);
    } finally {
      sqlite.close();
    }
  });
});
