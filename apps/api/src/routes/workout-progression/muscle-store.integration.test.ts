import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it, vi } from 'vitest';

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));
const temporaryDirectories: string[] = [];
const originalDatabaseUrl = process.env.DATABASE_URL;

function prepareDatabase() {
  const directory = mkdtempSync(join(tmpdir(), 'pulse-workout-muscle-store-'));
  temporaryDirectories.push(directory);
  const databaseUrl = join(directory, 'store.db');
  const sqlite = new Database(databaseUrl);
  sqlite.pragma('foreign_keys = ON');
  migrate(drizzle(sqlite), { migrationsFolder });

  sqlite
    .prepare(
      "INSERT INTO users (id, username, password_hash, weight_unit) VALUES ('user-1', 'user-1', 'hash', 'lbs')",
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO exercises (
        id, user_id, name, muscle_groups, equipment, category, tracking_type,
        tags, form_cues, related_exercise_ids, created_at, updated_at
      ) VALUES (
        'exercise-1', 'user-1', 'Incline press', '["chest","triceps"]', 'dumbbells',
        'compound', 'weight_reps', '[]', '[]', '[]', 100, 100
      )`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO exercise_muscle_contributions (
        id, exercise_id, owner_user_id, revision, muscle, role, factor, version,
        effective_at, created_at
      ) VALUES
        ('contribution-chest', 'exercise-1', 'user-1', 1, 'chest', 'primary', 1, 1, 100, 100),
        ('contribution-triceps', 'exercise-1', 'user-1', 1, 'triceps', 'secondary', 0.5, 1, 100, 100)`,
    )
    .run();

  for (const session of [
    { date: '2026-08-14', id: 'session-previous' },
    { date: '2026-08-20', id: 'session-current' },
  ]) {
    sqlite
      .prepare(
        `INSERT INTO workout_sessions (
          id, user_id, name, date, status, started_at, completed_at, time_segments,
          created_at, updated_at
        ) VALUES (?, 'user-1', 'Upper', ?, 'completed', 200, 300, '[]', 200, 300)`,
      )
      .run(session.id, session.date);
  }
  sqlite
    .prepare(
      `INSERT INTO session_sets (
        id, session_id, exercise_id, order_index, set_number, weight, reps, rpe,
        completed, skipped, section, created_at
      ) VALUES
        ('previous-set', 'session-previous', 'exercise-1', 0, 1, 20, 10, 8, 1, 0, 'main', 300),
        ('current-set-1', 'session-current', 'exercise-1', 0, 1, 20, 10, 8, 1, 0, 'main', 300),
        ('current-set-2', 'session-current', 'exercise-1', 1, 2, 20, 10, 8, 1, 0, 'supplemental', 300),
        ('warmup-set', 'session-current', 'exercise-1', 2, 3, 10, 10, 5, 1, 0, 'warmup', 300)`,
    )
    .run();

  sqlite
    .prepare(
      `INSERT INTO scheduled_workouts (id, user_id, date, created_at, updated_at)
       VALUES ('scheduled-1', 'user-1', '2026-08-23', 400, 400)`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO scheduled_workout_exercises (
        id, scheduled_workout_id, exercise_id, section, order_index, created_at, updated_at
      ) VALUES ('scheduled-exercise-1', 'scheduled-1', 'exercise-1', 'main', 0, 400, 400)`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO scheduled_workout_exercise_sets (
        id, scheduled_workout_exercise_id, set_number, reps, target_weight, created_at
      ) VALUES
        ('planned-set-1', 'scheduled-exercise-1', 1, 10, 25, 400),
        ('planned-set-2', 'scheduled-exercise-1', 2, 10, 25, 400)`,
    )
    .run();

  sqlite.close();
  process.env.DATABASE_URL = databaseUrl;
}

afterEach(async () => {
  try {
    const database = await import('../../db/index.js');
    database.sqlite.close();
  } catch {
    // The database module is not loaded in every assertion path.
  }
  vi.resetModules();
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('workout muscle analytics store', () => {
  it('distinguishes planned, completed, primary, and secondary exposure with exact sources', async () => {
    prepareDatabase();
    const { getWorkoutMuscleAnalytics } = await import('./muscle-store.js');

    const analytics = await getWorkoutMuscleAnalytics('user-1', {
      end: '2026-08-23',
      range: '7d',
    });

    expect(analytics).toMatchObject({
      endDate: '2026-08-23',
      qualifyingSetPolicyVersion: 1,
      startDate: '2026-08-17',
      timeZone: 'UTC',
      weightUnit: 'lbs',
    });
    expect(analytics.rows).toEqual([
      {
        change: 'increased',
        completedSessionCount: 1,
        exerciseCount: 1,
        exposureState: 'fully_completed',
        muscle: 'chest',
        plannedSetEquivalents: 2,
        previousQualifyingSetEquivalents: 1,
        priority: true,
        qualifyingSetEquivalents: 2,
        sourceIds: ['current-set-1', 'current-set-2', 'planned-set-1', 'planned-set-2'],
        volumeLoad: 400,
      },
      {
        change: 'increased',
        completedSessionCount: 1,
        exerciseCount: 1,
        exposureState: 'fully_completed',
        muscle: 'triceps',
        plannedSetEquivalents: 1,
        previousQualifyingSetEquivalents: 0.5,
        priority: true,
        qualifyingSetEquivalents: 1,
        sourceIds: ['current-set-1', 'current-set-2', 'planned-set-1', 'planned-set-2'],
        volumeLoad: 200,
      },
    ]);
    expect(analytics.sources).toHaveLength(8);
    expect(analytics.sources).toContainEqual({
      contributionId: 'contribution-chest',
      date: '2026-08-20',
      exerciseId: 'exercise-1',
      exerciseName: 'Incline press',
      factor: 1,
      muscle: 'chest',
      role: 'primary',
      scheduledWorkoutId: null,
      sessionId: 'session-current',
      setId: 'current-set-1',
      sourceType: 'completed',
      volumeLoad: 200,
    });
    expect(analytics.series).toContainEqual({
      date: '2026-08-23',
      muscle: 'chest',
      plannedSetEquivalents: 2,
      qualifyingSetEquivalents: 0,
      volumeLoad: null,
    });
  });

  it('uses the requested IANA zone for a live inclusive range and does not leak users', async () => {
    prepareDatabase();
    const { getWorkoutMuscleAnalytics } = await import('./muscle-store.js');
    const instant = Date.parse('2026-08-24T02:00:00Z');

    const analytics = await getWorkoutMuscleAnalytics(
      'user-1',
      { range: '7d', timeZone: 'America/Detroit' },
      instant,
    );
    expect(analytics.endDate).toBe('2026-08-23');
    await expect(
      getWorkoutMuscleAnalytics('user-2', { end: '2026-08-23', range: '7d' }),
    ).rejects.toThrow('not found');
  });
});
