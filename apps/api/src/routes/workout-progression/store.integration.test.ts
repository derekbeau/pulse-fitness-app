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
  const directory = mkdtempSync(join(tmpdir(), 'pulse-workout-progression-store-'));
  temporaryDirectories.push(directory);
  const databaseUrl = join(directory, 'store.db');
  const sqlite = new Database(databaseUrl);
  sqlite.pragma('foreign_keys = ON');
  migrate(drizzle(sqlite), { migrationsFolder });
  seedWorkout(sqlite);
  sqlite.close();
  process.env.DATABASE_URL = databaseUrl;
  return databaseUrl;
}

function seedWorkout(sqlite: Database.Database) {
  sqlite
    .prepare(
      "INSERT INTO users (id, username, password_hash, weight_unit) VALUES ('user-1', 'user-1', 'hash', 'lbs')",
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO agent_tokens (id, user_id, name, token_hash, created_at)
       VALUES ('agent-token-1', 'user-1', 'Coach agent', 'agent-token-hash-1', 100)`,
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
      `INSERT INTO scheduled_workouts (id, user_id, date, created_at, updated_at)
       VALUES ('scheduled-1', 'user-1', '2026-08-24', 200, 200)`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO scheduled_workout_exercises (
        id, scheduled_workout_id, exercise_id, section, order_index, created_at, updated_at
      ) VALUES ('scheduled-exercise-1', 'scheduled-1', 'exercise-1', 'main', 0, 200, 200)`,
    )
    .run();
  for (const setNumber of [1, 2]) {
    sqlite
      .prepare(
        `INSERT INTO scheduled_workout_exercise_sets (
          id, scheduled_workout_exercise_id, set_number, reps_min, reps_max, target_weight,
          created_at
        ) VALUES (?, 'scheduled-exercise-1', ?, 8, 10, 20, 200)`,
      )
      .run(`scheduled-set-${setNumber}`, setNumber);
  }
  sqlite
    .prepare(
      `INSERT INTO workout_sessions (
        id, user_id, name, date, status, started_at, completed_at, time_segments,
        created_at, updated_at
      ) VALUES (
        'session-1', 'user-1', 'Upper', '2026-08-20', 'completed', 300, 400, '[]',
        300, 400
      )`,
    )
    .run();
  for (const setNumber of [1, 2]) {
    sqlite
      .prepare(
        `INSERT INTO session_sets (
          id, session_id, exercise_id, order_index, set_number, weight, reps, rpe,
          completed, skipped, section, created_at
        ) VALUES (?, 'session-1', 'exercise-1', ?, ?, 20, 10, 8, 1, 0, 'main', 400)`,
      )
      .run(`session-set-${setNumber}`, setNumber - 1, setNumber);
  }
}

async function loadStore() {
  vi.resetModules();
  return import('./store.js');
}

afterEach(async () => {
  try {
    const database = await import('../../db/index.js');
    database.sqlite.close();
  } catch {
    // The database module is not loaded in every assertion path.
  }
  vi.resetModules();
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('workout progression store', () => {
  it('previews deterministic evidence, reuses the same fingerprint, and enforces ownership', async () => {
    prepareDatabase();
    const store = await loadStore();

    const first = await store.previewWorkoutProgression({
      effectiveDate: '2026-08-24',
      generatedAt: 500,
      scheduledWorkoutId: 'scheduled-1',
      userId: 'user-1',
    });
    const repeated = await store.previewWorkoutProgression({
      effectiveDate: '2026-08-24',
      generatedAt: 900,
      scheduledWorkoutId: 'scheduled-1',
      userId: 'user-1',
    });

    expect(first).toHaveLength(1);
    expect(first?.[0]).toMatchObject({
      confidence: 'supported',
      decision: 'increase',
      effectiveDate: '2026-08-24',
      state: 'current',
    });
    expect(first?.[0]?.recommendedTargets.map((target) => target.weight)).toEqual([25, 25]);
    expect(repeated?.[0]?.id).toBe(first?.[0]?.id);
    expect(
      await store.previewWorkoutProgression({
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-2',
      }),
    ).toBeUndefined();
  });

  it('marks corrected evidence stale and creates a distinct reproducible replacement', async () => {
    const databaseUrl = prepareDatabase();
    const store = await loadStore();
    const first = (
      await store.previewWorkoutProgression({
        effectiveDate: '2026-08-24',
        generatedAt: 500,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    expect(first).toBeDefined();

    const correctionDb = new Database(databaseUrl);
    correctionDb.prepare("UPDATE session_sets SET reps = 8 WHERE id = 'session-set-2'").run();
    correctionDb.close();

    await expect(
      store.applyWorkoutProgressionAction({
        actor: { id: 'user-1', label: 'You', type: 'user' },
        input: {
          action: 'accept',
          editedTargets: null,
          expectedFingerprint: first?.sourceFingerprint ?? '',
          idempotencyKey: 'accept-corrected-1',
          reason: null,
        },
        now: 700,
        recommendationId: first?.id ?? '',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(store.WorkoutProgressionStaleError);

    expect(
      await store.getWorkoutProgressionRecommendation('user-1', first?.id ?? ''),
    ).toMatchObject({ state: 'stale' });
    const replacement = (
      await store.previewWorkoutProgression({
        effectiveDate: '2026-08-24',
        generatedAt: 800,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    expect(replacement?.id).not.toBe(first?.id);
    expect(replacement).toMatchObject({ decision: 'hold', state: 'current' });
  });

  it('applies accepted targets once and returns the same action for an idempotent replay', async () => {
    const databaseUrl = prepareDatabase();
    const store = await loadStore();
    const recommendation = (
      await store.previewWorkoutProgression({
        effectiveDate: '2026-08-24',
        generatedAt: 500,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    expect(recommendation).toBeDefined();
    const input = {
      action: 'accept' as const,
      editedTargets: null,
      expectedFingerprint: recommendation?.sourceFingerprint ?? '',
      idempotencyKey: 'accept-recommendation-1',
      reason: null,
    };

    const firstAction = await store.applyWorkoutProgressionAction({
      actor: { id: 'agent-token-1', label: 'Coach agent', type: 'agent_token' },
      input,
      now: 600,
      recommendationId: recommendation?.id ?? '',
      userId: 'user-1',
    });
    const replay = await store.applyWorkoutProgressionAction({
      actor: { id: 'agent-token-1', label: 'Coach agent', type: 'agent_token' },
      input,
      now: 900,
      recommendationId: recommendation?.id ?? '',
      userId: 'user-1',
    });

    expect(replay).toEqual(firstAction);
    expect(firstAction.appliedTargets.map((target) => target.weight)).toEqual([25, 25]);
    expect(
      await store.getWorkoutProgressionRecommendation('user-1', recommendation?.id ?? ''),
    ).toMatchObject({ state: 'accepted' });

    const verificationDb = new Database(databaseUrl);
    expect(
      verificationDb
        .prepare(
          `SELECT set_number AS setNumber, target_weight AS targetWeight
           FROM scheduled_workout_exercise_sets ORDER BY set_number`,
        )
        .all(),
    ).toEqual([
      { setNumber: 1, targetWeight: 25 },
      { setNumber: 2, targetWeight: 25 },
    ]);
    expect(
      verificationDb.prepare('SELECT count(*) AS count FROM workout_progression_actions').get(),
    ).toEqual({ count: 1 });
    verificationDb.close();
  });

  it('rejects changed idempotency payloads and unbounded edits without writes', async () => {
    const databaseUrl = prepareDatabase();
    const store = await loadStore();
    const recommendation = (
      await store.previewWorkoutProgression({
        generatedAt: 500,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    expect(recommendation).toBeDefined();

    await expect(
      store.applyWorkoutProgressionAction({
        actor: { id: 'user-1', label: 'You', type: 'user' },
        input: {
          action: 'edit',
          editedTargets:
            recommendation?.recommendedTargets.map((target) => ({ ...target, weight: 1_000 })) ??
            [],
          expectedFingerprint: recommendation?.sourceFingerprint ?? '',
          idempotencyKey: 'bounded-edit-1',
          reason: null,
        },
        recommendationId: recommendation?.id ?? '',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(store.WorkoutProgressionInvalidEditError);

    const verificationDb = new Database(databaseUrl);
    expect(
      verificationDb.prepare('SELECT count(*) AS count FROM workout_progression_actions').get(),
    ).toEqual({ count: 0 });
    expect(
      verificationDb
        .prepare('SELECT max(target_weight) AS weight FROM scheduled_workout_exercise_sets')
        .get(),
    ).toEqual({ weight: 20 });
    verificationDb.close();
  });
});
