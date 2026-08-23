import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it } from 'vitest';

const sourceMigrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
const temporaryDirectories: string[] = [];

type Journal = {
  version: string;
  dialect: string;
  entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }>;
};

const sourceJournal = JSON.parse(
  readFileSync(join(sourceMigrationsFolder, 'meta/_journal.json'), 'utf8'),
) as Journal;

function stageThrough(root: string, maximumIndex: number) {
  const destination = join(root, `through-${maximumIndex}`);
  mkdirSync(join(destination, 'meta'), { recursive: true });
  const entries = sourceJournal.entries.filter((entry) => entry.idx <= maximumIndex);
  writeFileSync(
    join(destination, 'meta/_journal.json'),
    `${JSON.stringify({ ...sourceJournal, entries }, null, 2)}\n`,
  );
  for (const entry of entries) {
    copyFileSync(
      join(sourceMigrationsFolder, `${entry.tag}.sql`),
      join(destination, `${entry.tag}.sql`),
    );
  }
  return destination;
}

function createDatabase() {
  const root = mkdtempSync(join(tmpdir(), 'pulse-workout-progression-migration-'));
  temporaryDirectories.push(root);
  const sqlite = new Database(join(root, 'migration.db'));
  sqlite.pragma('foreign_keys = ON');
  return { root, sqlite };
}

function migrateFolder(sqlite: Database.Database, migrationsFolder: string) {
  migrate(drizzle(sqlite), { migrationsFolder });
}

function assertHealthy(sqlite: Database.Database) {
  expect(sqlite.pragma('foreign_key_check')).toEqual([]);
  expect(sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
}

function seedLegacyWorkout(sqlite: Database.Database) {
  sqlite
    .prepare("INSERT INTO users (id, username, password_hash) VALUES ('user-1', 'user-1', 'hash')")
    .run();
  sqlite
    .prepare(
      `INSERT INTO exercises (
        id, user_id, name, muscle_groups, equipment, category, tracking_type,
        tags, form_cues, related_exercise_ids, created_at, updated_at
      ) VALUES (
        'exercise-1', 'user-1', 'Incline press', '["chest","triceps","chest"]',
        'dumbbells', 'compound', 'weight_reps', '[]', '[]', '[]', 100, 100
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
}

function recommendationInsert(userId = 'user-1') {
  return {
    actor: userId,
    effectiveDate: '2026-08-24',
    exerciseId: 'exercise-1',
    fingerprint: 'a'.repeat(64),
    generatedAt: 300,
    id: `recommendation-${userId}`,
    scheduledExerciseId: 'scheduled-exercise-1',
    scheduledId: 'scheduled-1',
  };
}

function insertRecommendation(sqlite: Database.Database, input = recommendationInsert()) {
  sqlite
    .prepare(
      `INSERT INTO workout_progression_recommendations (
        id, user_id, scheduled_workout_id, scheduled_workout_exercise_id, exercise_id,
        policy_family, policy_version, source_fingerprint, effective_date, snapshot, generated_at
      ) VALUES (?, ?, ?, ?, ?, 'double_progression', 1, ?, ?, '{}', ?)`,
    )
    .run(
      input.id,
      input.actor,
      input.scheduledId,
      input.scheduledExerciseId,
      input.exerciseId,
      input.fingerprint,
      input.effectiveDate,
      input.generatedAt,
    );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('0053 workout progression migration', () => {
  it('upgrades populated 0053 audit facts without blocking source lifecycle operations', () => {
    const { root, sqlite } = createDatabase();
    migrateFolder(sqlite, stageThrough(root, 53));
    seedLegacyWorkout(sqlite);
    sqlite
      .prepare(
        `INSERT INTO workout_sessions (
          id, user_id, name, date, status, started_at, completed_at, time_segments,
          created_at, updated_at
        ) VALUES ('session-1', 'user-1', 'Upper', '2026-08-20', 'completed', 200, 300,
          '[]', 200, 300)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO session_sets (
          id, session_id, exercise_id, order_index, set_number, weight, reps, completed,
          skipped, section, created_at
        ) VALUES ('session-set-1', 'session-1', 'exercise-1', 0, 1, 20, 10, 1, 0,
          'main', 300)`,
      )
      .run();
    const legacySnapshot = JSON.stringify({ version: '0053-preserved-audit' });
    sqlite
      .prepare(
        `INSERT INTO workout_progression_recommendations (
          id, user_id, scheduled_workout_id, scheduled_workout_exercise_id, exercise_id,
          source_session_id, policy_family, policy_version, source_fingerprint, effective_date,
          snapshot, generated_at
        ) VALUES ('recommendation-legacy', 'user-1', 'scheduled-1', 'scheduled-exercise-1',
          'exercise-1', 'session-1', 'double_progression', 1, ?, '2026-08-24', ?, 300)`,
      )
      .run('a'.repeat(64), legacySnapshot);

    migrateFolder(sqlite, sourceMigrationsFolder);

    expect(
      sqlite
        .prepare(
          `SELECT exercise_id_snapshot AS exerciseId, exercise_name_snapshot AS exerciseName,
                  tracking_type_snapshot AS trackingType
           FROM session_sets WHERE id = 'session-set-1'`,
        )
        .get(),
    ).toEqual({
      exerciseId: 'exercise-1',
      exerciseName: 'Incline press',
      trackingType: 'weight_reps',
    });
    const migratedLegacy = sqlite
      .prepare(
        "SELECT snapshot FROM workout_progression_recommendations WHERE id = 'recommendation-legacy'",
      )
      .get() as { snapshot: string };
    expect(migratedLegacy).toEqual({ snapshot: legacySnapshot });
    expect(() =>
      sqlite.prepare("UPDATE session_sets SET target_zone = 6 WHERE id = 'session-set-1'").run(),
    ).toThrow(/invalid session progression target/u);
    sqlite
      .prepare(
        `INSERT INTO workout_progression_configurations (
          id, user_id, scheduled_workout_id, scheduled_workout_exercise_id, revision,
          snapshot, actor_type, actor_label, updated_at
        ) VALUES ('configuration-1', 'user-1', 'scheduled-1', 'scheduled-exercise-1', 1,
          '{}', 'user', 'You', 400)`,
      )
      .run();
    expect(() =>
      sqlite
        .prepare(
          "UPDATE workout_progression_configurations SET revision = 3 WHERE id = 'configuration-1'",
        )
        .run(),
    ).toThrow(/revision or ownership mismatch/u);

    sqlite.prepare("DELETE FROM scheduled_workouts WHERE id = 'scheduled-1'").run();
    sqlite.prepare("DELETE FROM workout_sessions WHERE id = 'session-1'").run();
    sqlite.prepare("DELETE FROM exercises WHERE id = 'exercise-1'").run();
    expect(
      sqlite
        .prepare(
          `SELECT scheduled_workout_id AS scheduledWorkoutId, source_session_id AS sourceSessionId,
                  exercise_id AS exerciseId
           FROM workout_progression_recommendations WHERE id = 'recommendation-legacy'`,
        )
        .get(),
    ).toEqual({
      exerciseId: 'exercise-1',
      scheduledWorkoutId: 'scheduled-1',
      sourceSessionId: 'session-1',
    });
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM workout_progression_configurations').get(),
    ).toEqual({ count: 0 });
    assertHealthy(sqlite);
    sqlite.close();
  });

  it('upgrades populated 0052 data with deterministic contributions and immutable guards', () => {
    const { root, sqlite } = createDatabase();
    migrateFolder(sqlite, stageThrough(root, 52));
    seedLegacyWorkout(sqlite);

    migrateFolder(sqlite, sourceMigrationsFolder);

    expect(
      sqlite
        .prepare(
          `SELECT muscle, role, factor, revision, version
           FROM exercise_muscle_contributions
           WHERE exercise_id = 'exercise-1'
           ORDER BY role DESC, muscle`,
        )
        .all(),
    ).toEqual([
      { factor: 0.5, muscle: 'triceps', revision: 1, role: 'secondary', version: 1 },
      { factor: 1, muscle: 'chest', revision: 1, role: 'primary', version: 1 },
    ]);

    insertRecommendation(sqlite);
    expect(() =>
      sqlite
        .prepare(
          "UPDATE workout_progression_recommendations SET effective_date = '2026-08-25' WHERE id = 'recommendation-user-1'",
        )
        .run(),
    ).toThrow(/immutable/u);
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO workout_progression_actions (
            id, recommendation_id, user_id, sequence, type, payload, actor_type, actor_label,
            idempotency_key, request_fingerprint, created_at
          ) VALUES ('action-gap', 'recommendation-user-1', 'user-1', 2, 'keep', '{}',
            'user', 'You', 'action-gap-key', ?, 400)`,
        )
        .run('b'.repeat(64)),
    ).toThrow(/exact next sequence/u);
    sqlite
      .prepare(
        `INSERT INTO workout_progression_actions (
          id, recommendation_id, user_id, sequence, type, payload, actor_type, actor_label,
          idempotency_key, request_fingerprint, created_at
        ) VALUES ('action-1', 'recommendation-user-1', 'user-1', 1, 'keep', '{}',
          'user', 'You', 'action-key-1', ?, 400)`,
      )
      .run('b'.repeat(64));
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO workout_progression_actions (
            id, recommendation_id, user_id, sequence, type, payload, actor_type, actor_label,
            idempotency_key, request_fingerprint, created_at
          ) VALUES ('action-2', 'recommendation-user-1', 'user-1', 2, 'accept', '{}',
            'user', 'You', 'action-key-2', ?, 401)`,
        )
        .run('c'.repeat(64)),
    ).toThrow(/already has a decision/u);
    expect(() =>
      sqlite.prepare("UPDATE workout_progression_actions SET actor_label = 'Other'").run(),
    ).toThrow(/immutable/u);

    sqlite
      .prepare(
        "INSERT INTO users (id, username, password_hash) VALUES ('user-2', 'user-2', 'hash')",
      )
      .run();
    expect(() => insertRecommendation(sqlite, recommendationInsert('user-2'))).toThrow(
      /ownership mismatch/u,
    );

    assertHealthy(sqlite);
    sqlite.close();
  });

  it('backfills immutable recommendation priority from the 0054 programming configuration', () => {
    const { root, sqlite } = createDatabase();
    migrateFolder(sqlite, stageThrough(root, 54));
    seedLegacyWorkout(sqlite);
    sqlite
      .prepare(
        `INSERT INTO workout_progression_configurations (
          id, user_id, scheduled_workout_id, scheduled_workout_exercise_id, revision,
          snapshot, actor_type, actor_label, updated_at
        ) VALUES ('configuration-priority', 'user-1', 'scheduled-1', 'scheduled-exercise-1', 1,
          '{"priority":true}', 'user', 'You', 400)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO workout_progression_recommendations (
          id, user_id, scheduled_workout_id, scheduled_workout_exercise_id, exercise_id,
          policy_family, policy_version, source_fingerprint, effective_date, snapshot, generated_at
        ) VALUES ('recommendation-priority', 'user-1', 'scheduled-1', 'scheduled-exercise-1',
          'exercise-1', 'double_progression', 1, ?, '2026-08-24',
          '{"evidence":{"policySource":{"configurationId":"configuration-priority","revision":1}}}', 300)`,
      )
      .run('d'.repeat(64));
    sqlite
      .prepare(
        `INSERT INTO workout_progression_recommendations (
          id, user_id, scheduled_workout_id, scheduled_workout_exercise_id, exercise_id,
          policy_family, policy_version, source_fingerprint, effective_date, snapshot, generated_at
        ) VALUES ('recommendation-priority-mismatch', 'user-1', 'scheduled-1',
          'scheduled-exercise-1', 'exercise-1', 'double_progression', 1, ?, '2026-08-24',
          '{"evidence":{"policySource":{"configurationId":"configuration-priority","revision":2}}}', 301)`,
      )
      .run('e'.repeat(64));

    migrateFolder(sqlite, sourceMigrationsFolder);

    const migrated = sqlite
      .prepare(
        "SELECT snapshot FROM workout_progression_recommendations WHERE id = 'recommendation-priority'",
      )
      .get() as { snapshot: string };
    expect(JSON.parse(migrated.snapshot)).toEqual({
      evidence: {
        policySource: { configurationId: 'configuration-priority', revision: 1 },
        priority: 1,
      },
    });
    const mismatched = sqlite
      .prepare(
        "SELECT snapshot FROM workout_progression_recommendations WHERE id = 'recommendation-priority-mismatch'",
      )
      .get() as { snapshot: string };
    expect(JSON.parse(mismatched.snapshot)).toEqual({
      evidence: { policySource: { configurationId: 'configuration-priority', revision: 2 } },
    });
    expect(() =>
      sqlite
        .prepare(
          "UPDATE workout_progression_recommendations SET effective_date = '2026-08-25' WHERE id = 'recommendation-priority'",
        )
        .run(),
    ).toThrow(/immutable/u);
    assertHealthy(sqlite);
    sqlite.close();
  });

  it('installs cleanly from the complete journal and permits scoped account deletion', () => {
    const { sqlite } = createDatabase();
    migrateFolder(sqlite, sourceMigrationsFolder);
    seedLegacyWorkout(sqlite);
    // Fresh installs do not rerun migration backfill after application data is created. New exercise
    // creation writes the first contribution revision through the store; seed that state here.
    sqlite
      .prepare(
        `INSERT INTO exercise_muscle_contributions (
          id, exercise_id, owner_user_id, revision, muscle, role, factor, version,
          effective_at, created_at
        ) VALUES ('contribution-1', 'exercise-1', 'user-1', 1, 'chest', 'primary', 1, 1, 200, 200)`,
      )
      .run();
    insertRecommendation(sqlite);
    sqlite
      .prepare(
        `INSERT INTO agent_tokens (id, user_id, name, token_hash, created_at)
         VALUES ('agent-token-1', 'user-1', 'Progression agent', 'token-hash-1', 350)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO workout_progression_actions (
          id, recommendation_id, user_id, sequence, type, payload, actor_type, agent_token_id,
          actor_label, idempotency_key, request_fingerprint, created_at
        ) VALUES ('action-1', 'recommendation-user-1', 'user-1', 1, 'keep', '{}',
          'agent_token', 'agent-token-1', 'Progression agent', 'action-key-1', ?, 400)`,
      )
      .run('b'.repeat(64));

    sqlite.prepare("DELETE FROM agent_tokens WHERE id = 'agent-token-1'").run();
    expect(
      sqlite
        .prepare(
          "SELECT actor_type, agent_token_id, actor_label FROM workout_progression_actions WHERE id = 'action-1'",
        )
        .get(),
    ).toEqual({
      actor_label: 'Progression agent',
      actor_type: 'agent_token',
      agent_token_id: 'agent-token-1',
    });

    expect(() =>
      sqlite.prepare("DELETE FROM workout_progression_actions WHERE user_id = 'user-1'").run(),
    ).toThrow(/account deletion scope/u);
    sqlite
      .prepare("INSERT INTO workout_progression_account_deletion_scope (user_id) VALUES ('user-1')")
      .run();
    sqlite.prepare("DELETE FROM workout_progression_actions WHERE user_id = 'user-1'").run();
    sqlite
      .prepare("DELETE FROM workout_progression_recommendations WHERE user_id = 'user-1'")
      .run();
    sqlite
      .prepare("DELETE FROM exercise_muscle_contributions WHERE owner_user_id = 'user-1'")
      .run();
    sqlite.prepare("DELETE FROM scheduled_workouts WHERE user_id = 'user-1'").run();
    sqlite.prepare("DELETE FROM exercises WHERE user_id = 'user-1'").run();
    sqlite.prepare("DELETE FROM users WHERE id = 'user-1'").run();

    expect(sqlite.prepare("SELECT count(*) AS count FROM users WHERE id = 'user-1'").get()).toEqual(
      { count: 0 },
    );
    assertHealthy(sqlite);
    sqlite.close();
  });
});
