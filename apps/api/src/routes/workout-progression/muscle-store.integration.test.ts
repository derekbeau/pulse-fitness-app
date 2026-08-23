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
        source_scheduled_set_id, exercise_id_snapshot, exercise_name_snapshot,
        tracking_type_snapshot, completed, skipped, section, created_at
      ) VALUES
        ('previous-set', 'session-previous', 'exercise-1', 0, 1, 20, 10, 8,
          NULL, 'exercise-1', 'Incline press', 'weight_reps', 1, 0, 'main', 300),
        ('current-set-1', 'session-current', 'exercise-1', 0, 1, 20, 10, 8,
          'planned-set-1', 'exercise-1', 'Incline press', 'weight_reps', 1, 0, 'main', 300),
        ('current-set-2', 'session-current', 'exercise-1', 1, 2, 20, 10, 8,
          'planned-set-2', 'exercise-1', 'Incline press', 'weight_reps', 1, 0, 'supplemental', 300),
        ('warmup-set', 'session-current', 'exercise-1', 2, 3, 10, 10, 5,
          NULL, 'exercise-1', 'Incline press', 'weight_reps', 1, 0, 'warmup', 300)`,
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
        id, scheduled_workout_id, exercise_id, exercise_name_snapshot, tracking_type_snapshot,
        section, order_index, created_at, updated_at
      ) VALUES (
        'scheduled-exercise-1', 'scheduled-1', 'exercise-1', 'Incline press', 'weight_reps',
        'main', 0, 400, 400
      )`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO workout_progression_configurations (
        id, user_id, scheduled_workout_id, scheduled_workout_exercise_id, revision,
        snapshot, actor_type, agent_token_id, actor_label, updated_at
      ) VALUES ('configuration-1', 'user-1', 'scheduled-1', 'scheduled-exercise-1', 1,
        ?, 'user', NULL, 'You', 400)`,
    )
    .run(
      JSON.stringify({
        actorId: 'user-1',
        actorLabel: 'You',
        actorType: 'user',
        contextAvailability: 'available',
        contextFacts: [],
        id: 'configuration-1',
        policy: {
          allowReduction: false,
          contextRequired: false,
          distanceStep: null,
          effortCeiling: 8,
          family: 'double_progression',
          loadIncrement: 5,
          loadIncreasePercent: null,
          lowEffortThreshold: 7,
          repRangeMax: 10,
          repRangeMin: 8,
          secondsStep: null,
          version: 1,
          zoneCeiling: null,
        },
        priority: true,
        revision: 1,
        scheduledWorkoutExerciseId: 'scheduled-exercise-1',
        scheduledWorkoutId: 'scheduled-1',
        updatedAt: 400,
        userId: 'user-1',
      }),
    );
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
  return databaseUrl;
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
        fulfilledPlannedSetEquivalents: 2,
        muscle: 'chest',
        plannedSetEquivalents: 2,
        previousQualifyingSetEquivalents: 1,
        priority: true,
        qualifyingSetEquivalents: 2,
        sourceCount: 4,
        sourceIds: ['current-set-1', 'current-set-2', 'planned-set-1', 'planned-set-2'],
        sourceIdsTruncated: false,
        volumeLoad: 400,
      },
      {
        change: 'increased',
        completedSessionCount: 1,
        exerciseCount: 1,
        exposureState: 'fully_completed',
        fulfilledPlannedSetEquivalents: 1,
        muscle: 'triceps',
        plannedSetEquivalents: 1,
        previousQualifyingSetEquivalents: 0.5,
        priority: true,
        qualifyingSetEquivalents: 1,
        sourceCount: 4,
        sourceIds: ['current-set-1', 'current-set-2', 'planned-set-1', 'planned-set-2'],
        sourceIdsTruncated: false,
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
      sourceScheduledSetId: 'planned-set-1',
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

  it('keeps dense 90-day totals exact while bounding source references', async () => {
    const databaseUrl = prepareDatabase();
    const denseDb = new Database(databaseUrl);
    denseDb.prepare('DELETE FROM session_sets').run();
    denseDb.prepare('DELETE FROM workout_sessions').run();
    denseDb
      .prepare(
        `INSERT INTO workout_sessions (
          id, user_id, name, date, status, started_at, completed_at, time_segments,
          created_at, updated_at
        ) VALUES ('session-dense', 'user-1', 'Dense', '2026-08-20', 'completed', 500, 600,
          '[]', 500, 600)`,
      )
      .run();
    const insert = denseDb.prepare(
      `INSERT INTO session_sets (
        id, session_id, exercise_id, order_index, set_number, weight, reps,
        exercise_id_snapshot, exercise_name_snapshot, tracking_type_snapshot,
        completed, skipped, section, created_at
      ) VALUES (?, 'session-dense', 'exercise-1', ?, ?, 20, 10,
        'exercise-1', 'Incline press', 'weight_reps', 1, 0, 'main', 600)`,
    );
    denseDb.transaction(() => {
      for (let index = 1; index <= 2_501; index += 1) {
        insert.run(`dense-set-${index}`, index - 1, index);
      }
    })();
    denseDb.close();

    const { getWorkoutMuscleAnalytics } = await import('./muscle-store.js');
    const analytics = await getWorkoutMuscleAnalytics('user-1', {
      end: '2026-08-23',
      range: '90d',
    });

    expect(analytics.sourceCount).toBe(5_006);
    expect(analytics.sources).toHaveLength(5_000);
    expect(analytics.sourcesTruncated).toBe(true);
    expect(analytics.rows).toEqual([
      expect.objectContaining({
        exposureState: 'missed',
        muscle: 'chest',
        qualifyingSetEquivalents: 2_501,
        sourceCount: 2_503,
        sourceIdsTruncated: true,
      }),
      expect.objectContaining({
        exposureState: 'missed',
        muscle: 'triceps',
        qualifyingSetEquivalents: 1_250.5,
        sourceCount: 2_503,
        sourceIdsTruncated: true,
      }),
    ]);
    expect(analytics.rows.every((row) => row.sourceIds.length === 500)).toBe(true);
  });

  it('does not fulfill a plan from a linked but non-qualifying completion', async () => {
    const databaseUrl = prepareDatabase();
    const invalidDb = new Database(databaseUrl);
    invalidDb
      .prepare("UPDATE session_sets SET weight = NULL, reps = NULL WHERE id = 'current-set-1'")
      .run();
    invalidDb.close();

    const { getWorkoutMuscleAnalytics } = await import('./muscle-store.js');
    const analytics = await getWorkoutMuscleAnalytics('user-1', {
      end: '2026-08-23',
      range: '7d',
    });

    expect(analytics.rows.find((row) => row.muscle === 'chest')).toMatchObject({
      exposureState: 'partially_completed',
      fulfilledPlannedSetEquivalents: 1,
      plannedSetEquivalents: 2,
      qualifyingSetEquivalents: 1,
    });
  });

  it('resolves contribution revisions on the requested local date', async () => {
    const databaseUrl = prepareDatabase();
    const revisionDb = new Database(databaseUrl);
    const effectiveAt = Date.parse('2026-08-24T03:30:00.000Z');
    revisionDb
      .prepare(
        `INSERT INTO exercise_muscle_contributions (
          id, exercise_id, owner_user_id, revision, muscle, role, factor, version,
          effective_at, created_at
        ) VALUES
          ('contribution-chest-zone-v2', 'exercise-1', 'user-1', 2, 'chest', 'secondary', 0.5, 1, ?, ?),
          ('contribution-triceps-zone-v2', 'exercise-1', 'user-1', 2, 'triceps', 'primary', 1, 1, ?, ?)`,
      )
      .run(effectiveAt, effectiveAt, effectiveAt, effectiveAt);
    revisionDb.close();

    const { getWorkoutMuscleAnalytics } = await import('./muscle-store.js');
    const detroit = await getWorkoutMuscleAnalytics('user-1', {
      end: '2026-08-23',
      range: '7d',
      timeZone: 'America/Detroit',
    });
    const utc = await getWorkoutMuscleAnalytics('user-1', {
      end: '2026-08-23',
      range: '7d',
      timeZone: 'UTC',
    });

    expect(detroit.rows.find((row) => row.muscle === 'chest')?.plannedSetEquivalents).toBe(1);
    expect(utc.rows.find((row) => row.muscle === 'chest')?.plannedSetEquivalents).toBe(2);
  });

  it('uses planned contribution factors when attribution changes before fulfillment', async () => {
    const databaseUrl = prepareDatabase();
    const revisionDb = new Database(databaseUrl);
    const effectiveAt = Date.parse('2026-08-22T12:00:00.000Z');
    revisionDb
      .prepare(
        `INSERT INTO exercise_muscle_contributions (
          id, exercise_id, owner_user_id, revision, muscle, role, factor, version,
          effective_at, created_at
        ) VALUES
          ('contribution-chest-v2', 'exercise-1', 'user-1', 2, 'chest', 'secondary', 0.5, 1, ?, ?),
          ('contribution-triceps-v2', 'exercise-1', 'user-1', 2, 'triceps', 'primary', 1, 1, ?, ?)`,
      )
      .run(effectiveAt, effectiveAt, effectiveAt, effectiveAt);
    revisionDb.close();

    const { getWorkoutMuscleAnalytics } = await import('./muscle-store.js');
    const analytics = await getWorkoutMuscleAnalytics('user-1', {
      end: '2026-08-23',
      range: '7d',
      timeZone: 'America/Detroit',
    });

    expect(analytics.rows.find((row) => row.muscle === 'chest')).toMatchObject({
      exposureState: 'fully_completed',
      fulfilledPlannedSetEquivalents: 1,
      plannedSetEquivalents: 1,
      qualifyingSetEquivalents: 2,
    });
    expect(analytics.rows.find((row) => row.muscle === 'triceps')).toMatchObject({
      exposureState: 'fully_completed',
      fulfilledPlannedSetEquivalents: 2,
      plannedSetEquivalents: 2,
      qualifyingSetEquivalents: 1,
    });
  });

  it('reconciles only exact linked plan sets and excludes cancelled plans', async () => {
    const databaseUrl = prepareDatabase();
    const { getWorkoutMuscleAnalytics } = await import('./muscle-store.js');
    const analytics = () => getWorkoutMuscleAnalytics('user-1', { end: '2026-08-23', range: '7d' });
    expect((await analytics()).rows[0]?.exposureState).toBe('fully_completed');

    const lifecycleDb = new Database(databaseUrl);
    lifecycleDb
      .prepare("UPDATE session_sets SET source_scheduled_set_id = NULL WHERE id = 'current-set-2'")
      .run();
    expect((await analytics()).rows[0]).toMatchObject({
      exposureState: 'partially_completed',
      fulfilledPlannedSetEquivalents: 1,
      qualifyingSetEquivalents: 2,
    });

    lifecycleDb
      .prepare(
        "UPDATE session_sets SET source_scheduled_set_id = 'planned-set-2' WHERE id = 'current-set-2'",
      )
      .run();
    lifecycleDb
      .prepare("UPDATE scheduled_workouts SET date = '2026-08-22' WHERE id = 'scheduled-1'")
      .run();
    expect((await analytics()).rows[0]).toMatchObject({
      exposureState: 'fully_completed',
      fulfilledPlannedSetEquivalents: 2,
    });

    lifecycleDb
      .prepare(
        `INSERT INTO workout_sessions (
          id, user_id, scheduled_workout_id, name, date, status, started_at, time_segments,
          created_at, updated_at
        ) VALUES ('session-cancelled', 'user-1', 'scheduled-1', 'Cancelled', '2026-08-22',
          'cancelled', 700, '[]', 700, 700)`,
      )
      .run();
    lifecycleDb
      .prepare(
        "UPDATE scheduled_workouts SET session_id = 'session-cancelled' WHERE id = 'scheduled-1'",
      )
      .run();
    lifecycleDb.close();
    expect((await analytics()).rows[0]).toMatchObject({
      exposureState: 'no_plan',
      plannedSetEquivalents: 0,
      priority: false,
      qualifyingSetEquivalents: 2,
    });
  });

  it('keeps completed history stable after mutable exercise metadata changes and deletion', async () => {
    const databaseUrl = prepareDatabase();
    const { getWorkoutMuscleAnalytics } = await import('./muscle-store.js');
    const current = () => getWorkoutMuscleAnalytics('user-1', { end: '2026-08-23', range: '7d' });
    const before = await current();
    const lifecycleDb = new Database(databaseUrl);
    lifecycleDb
      .prepare(
        "UPDATE exercises SET name = 'Renamed press', tracking_type = 'duration' WHERE id = 'exercise-1'",
      )
      .run();
    const afterMetadataChange = await current();
    expect(afterMetadataChange).toEqual(before);

    lifecycleDb
      .prepare(
        `INSERT INTO exercises (
          id, user_id, name, muscle_groups, equipment, category, tracking_type,
          tags, form_cues, related_exercise_ids, created_at, updated_at
        ) VALUES (
          'exercise-merged', 'user-1', 'Merged press', '["chest"]', 'machine',
          'compound', 'weight_reps', '[]', '[]', '[]', 500, 500
        )`,
      )
      .run();
    lifecycleDb
      .prepare(
        "UPDATE session_sets SET exercise_id = 'exercise-merged' WHERE exercise_id = 'exercise-1'",
      )
      .run();
    expect(await current()).toEqual(before);

    lifecycleDb.prepare("DELETE FROM scheduled_workouts WHERE id = 'scheduled-1'").run();
    lifecycleDb.prepare("DELETE FROM exercises WHERE id = 'exercise-1'").run();
    lifecycleDb.close();
    const afterDelete = await current();
    expect(afterDelete.rows).toEqual([
      expect.objectContaining({ muscle: 'chest', qualifyingSetEquivalents: 2 }),
      expect.objectContaining({ muscle: 'triceps', qualifyingSetEquivalents: 1 }),
    ]);
    expect(afterDelete.sources.filter((source) => source.sourceType === 'completed')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ exerciseId: 'exercise-1', exerciseName: 'Incline press' }),
      ]),
    );
  });

  it('applies contribution revisions only on and after their effective date', async () => {
    const databaseUrl = prepareDatabase();
    const revisionAt = Date.parse('2026-08-19T00:00:00.000Z');
    const lifecycleDb = new Database(databaseUrl);
    lifecycleDb
      .prepare(
        `INSERT INTO exercise_muscle_contributions (
          id, exercise_id, owner_user_id, revision, muscle, role, factor, version,
          effective_at, created_at
        ) VALUES ('contribution-shoulders-v2', 'exercise-1', 'user-1', 2, 'shoulders',
          'primary', 1, 1, ?, ?)`,
      )
      .run(revisionAt, revisionAt);
    lifecycleDb.close();

    const { getWorkoutMuscleAnalytics } = await import('./muscle-store.js');
    const analytics = await getWorkoutMuscleAnalytics('user-1', {
      end: '2026-08-23',
      range: '30d',
    });
    expect(analytics.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contributionId: 'contribution-chest',
          date: '2026-08-14',
          muscle: 'chest',
          sourceType: 'completed',
        }),
        expect.objectContaining({
          contributionId: 'contribution-shoulders-v2',
          date: '2026-08-20',
          muscle: 'shoulders',
          sourceType: 'completed',
        }),
        expect.objectContaining({
          contributionId: 'contribution-shoulders-v2',
          date: '2026-08-23',
          muscle: 'shoulders',
          sourceType: 'planned',
        }),
      ]),
    );
    expect(
      analytics.sources.some(
        (source) => source.date === '2026-08-20' && source.contributionId === 'contribution-chest',
      ),
    ).toBe(false);
  });
});
