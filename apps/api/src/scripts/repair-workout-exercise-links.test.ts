import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  exercises,
  sessionSets,
  templateExercises,
  users,
  workoutSessions,
  workoutTemplates,
} from '../db/schema/index.js';

type DatabaseModule = typeof import('../db/index.js');

type TestContext = {
  db: DatabaseModule['db'];
  sqlite: DatabaseModule['sqlite'];
  tempDir: string;
};

let context: TestContext;
let repairWorkoutExerciseLinks: typeof import('./repair-workout-exercise-links.js').repairWorkoutExerciseLinks;

describe('repair-workout-exercise-links script', () => {
  beforeAll(async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-repair-workout-links-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    vi.resetModules();

    const [dbModule, scriptModule] = await Promise.all([
      import('../db/index.js'),
      import('./repair-workout-exercise-links.js'),
    ]);

    migrate(dbModule.db, {
      migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
    });

    context = {
      db: dbModule.db,
      sqlite: dbModule.sqlite,
      tempDir,
    };
    repairWorkoutExerciseLinks = scriptModule.repairWorkoutExerciseLinks;
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
    context.db.delete(sessionSets).run();
    context.db.delete(workoutSessions).run();
    context.db.delete(templateExercises).run();
    context.db.delete(workoutTemplates).run();
    context.db.delete(exercises).run();
    context.db.delete(users).run();

    context.db
      .insert(users)
      .values({
        id: 'user-1',
        username: 'derek',
        name: 'Derek',
        passwordHash: 'test',
      })
      .run();
    context.db
      .insert(users)
      .values({
        id: 'user-2',
        username: 'alex',
        name: 'Alex',
        passwordHash: 'test',
      })
      .run();

    context.db
      .insert(workoutSessions)
      .values({
        id: 'session-1',
        userId: 'user-1',
        templateId: null,
        name: 'Upper',
        date: '2026-03-13',
        status: 'completed',
        startedAt: 1_700_000_000_000,
        completedAt: 1_700_000_005_000,
        duration: 300,
        feedback: null,
        notes: null,
      })
      .run();

    context.db
      .insert(workoutTemplates)
      .values({
        id: 'template-1',
        userId: 'user-1',
        name: 'Template',
        description: null,
        tags: [],
      })
      .run();
  });

  it('detects orphan links and repairs by restoring, relinking, or creating placeholders', async () => {
    context.db
      .insert(exercises)
      .values({
        id: 'deleted-owned',
        userId: 'user-1',
        name: 'Old Bench',
        muscleGroups: ['chest'],
        equipment: 'barbell',
        category: 'compound',
        trackingType: 'weight_reps',
        tags: [],
        formCues: [],
        instructions: null,
        deletedAt: '2026-03-01T00:00:00.000Z',
      })
      .run();
    context.db
      .insert(exercises)
      .values({
        id: 'ghost-press-match',
        userId: 'user-1',
        name: 'Ghost Press',
        muscleGroups: ['chest'],
        equipment: 'machine',
        category: 'compound',
        trackingType: 'weight_reps',
        tags: [],
        formCues: [],
        instructions: null,
      })
      .run();

    context.sqlite.pragma('foreign_keys = OFF');
    context.sqlite
      .prepare(
        `
        insert into session_sets (
          id, session_id, exercise_id, order_index, set_number, weight, reps, completed, skipped, section, notes
        ) values
          ('set-restore', 'session-1', 'deleted-owned', 0, 1, null, 8, 0, 0, 'main', null),
          ('set-placeholder', 'session-1', 'unknown-link', 1, 1, null, 10, 0, 0, 'main', null)
        `,
      )
      .run();
    context.sqlite
      .prepare(
        `
        insert into template_exercises (
          id, template_id, exercise_id, order_index, sets, reps_min, reps_max, tempo, rest_seconds, superset_group, section, notes, cues
        ) values (
          'template-relink', 'template-1', 'ghost-press', 0, 3, null, null, null, null, null, 'main', null, null
        )
        `,
      )
      .run();
    context.sqlite.pragma('foreign_keys = ON');

    const result = await repairWorkoutExerciseLinks({
      userId: 'user-1',
      dryRun: false,
    });

    expect(result.orphanCount).toBe(3);
    expect(result.manualReviewCount).toBe(0);
    expect(result.repairedCount).toBe(3);
    expect(result.results.map((entry) => entry.action).sort()).toEqual([
      'created-placeholder',
      'relinked-by-name',
      'restored-soft-deleted',
    ]);

    const restoredExercise = context.db
      .select({ deletedAt: exercises.deletedAt })
      .from(exercises)
      .where(eq(exercises.id, 'deleted-owned'))
      .get();
    expect(restoredExercise).toEqual({ deletedAt: null });

    const relinkedTemplateExercise = context.db
      .select({ exerciseId: templateExercises.exerciseId })
      .from(templateExercises)
      .where(eq(templateExercises.id, 'template-relink'))
      .get();
    expect(relinkedTemplateExercise).toEqual({ exerciseId: 'ghost-press-match' });

    const placeholderSessionSet = context.db
      .select({ exerciseId: sessionSets.exerciseId })
      .from(sessionSets)
      .where(eq(sessionSets.id, 'set-placeholder'))
      .get();
    expect(placeholderSessionSet?.exerciseId).not.toBe('unknown-link');
    expect(placeholderSessionSet?.exerciseId).toBeTruthy();

    const placeholderExercise = context.db
      .select({
        userId: exercises.userId,
        name: exercises.name,
      })
      .from(exercises)
      .where(eq(exercises.id, placeholderSessionSet?.exerciseId ?? ''))
      .get();
    expect(placeholderExercise).toEqual({
      userId: 'user-1',
      name: 'Unknown Link',
    });
  });

  it('supports dry-run mode without persisting repairs', async () => {
    context.sqlite.pragma('foreign_keys = OFF');
    context.sqlite
      .prepare(
        `
        insert into session_sets (
          id, session_id, exercise_id, order_index, set_number, weight, reps, completed, skipped, section, notes
        ) values ('set-dry', 'session-1', 'dry-run-link', 0, 1, null, 5, 0, 0, 'main', null)
        `,
      )
      .run();
    context.sqlite.pragma('foreign_keys = ON');

    const dryRunResult = await repairWorkoutExerciseLinks({
      userId: 'user-1',
      dryRun: true,
    });

    expect(dryRunResult.orphanCount).toBe(1);
    expect(dryRunResult.repairedCount).toBe(1);

    const persisted = context.db
      .select({ exerciseId: sessionSets.exerciseId })
      .from(sessionSets)
      .where(eq(sessionSets.id, 'set-dry'))
      .get();
    expect(persisted).toEqual({ exerciseId: 'dry-run-link' });
  });

  it('cleans up placeholder exercises when relink fails after placeholder creation', async () => {
    context.sqlite.pragma('foreign_keys = OFF');
    context.sqlite
      .prepare(
        `
        insert into session_sets (
          id, session_id, exercise_id, order_index, set_number, weight, reps, completed, skipped, section, notes
        ) values ('set-fail', 'session-1', 'broken-link', 0, 1, null, 5, 0, 0, 'main', null)
        `,
      )
      .run();
    context.sqlite.pragma('foreign_keys = ON');

    context.sqlite
      .prepare(
        `
        create trigger if not exists fail_relink_on_set_fail
        before update of exercise_id on session_sets
        when old.id = 'set-fail'
        begin
          select raise(fail, 'forced relink failure');
        end
        `,
      )
      .run();

    try {
      const result = await repairWorkoutExerciseLinks({
        userId: 'user-1',
        dryRun: false,
      });

      expect(result.orphanCount).toBe(1);
      expect(result.repairedCount).toBe(0);
      expect(result.manualReviewCount).toBe(1);
      expect(result.results[0]?.action).toBe('manual-review');
      expect(result.results[0]?.note).toContain('Placeholder relink failed');

      const placeholderExercises = context.db
        .select({ id: exercises.id })
        .from(exercises)
        .where(eq(exercises.name, 'Broken Link'))
        .all();
      expect(placeholderExercises).toHaveLength(0);
    } finally {
      context.sqlite.prepare('drop trigger if exists fail_relink_on_set_fail').run();
    }
  });

  it('annotates cross-user references when relinking by name', async () => {
    context.db
      .insert(exercises)
      .values({
        id: 'cross-user-source',
        userId: 'user-2',
        name: 'Shared Name Curl',
        muscleGroups: ['biceps'],
        equipment: 'dumbbell',
        category: 'isolation',
        trackingType: 'weight_reps',
        tags: [],
        formCues: [],
        instructions: null,
      })
      .run();
    context.db
      .insert(exercises)
      .values({
        id: 'owner-candidate',
        userId: 'user-1',
        name: 'Shared Name Curl',
        muscleGroups: ['biceps'],
        equipment: 'dumbbell',
        category: 'isolation',
        trackingType: 'weight_reps',
        tags: [],
        formCues: [],
        instructions: null,
      })
      .run();

    context.db
      .insert(sessionSets)
      .values({
        id: 'set-cross-user',
        sessionId: 'session-1',
        exerciseId: 'cross-user-source',
        orderIndex: 0,
        setNumber: 1,
        weight: 30,
        reps: 10,
        completed: false,
        skipped: false,
        section: 'main',
        notes: null,
      })
      .run();

    const result = await repairWorkoutExerciseLinks({
      userId: 'user-1',
      dryRun: false,
    });

    expect(result.orphanCount).toBe(1);
    expect(result.repairedCount).toBe(1);
    expect(result.results[0]).toMatchObject({
      source: 'session_sets',
      rowId: 'set-cross-user',
      action: 'relinked-by-name',
      previousExerciseId: 'cross-user-source',
      nextExerciseId: 'owner-candidate',
    });
    expect(result.results[0]?.note).toContain('Cross-user reference detected');

    const repaired = context.db
      .select({ exerciseId: sessionSets.exerciseId })
      .from(sessionSets)
      .where(eq(sessionSets.id, 'set-cross-user'))
      .get();
    expect(repaired).toEqual({ exerciseId: 'owner-candidate' });
  });
});
