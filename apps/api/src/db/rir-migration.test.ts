import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it } from 'vitest';

import { migratePulseDatabase } from './migrate.js';

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
  const root = mkdtempSync(join(tmpdir(), 'pulse-rir-migration-'));
  temporaryDirectories.push(root);
  const sqlite = new Database(join(root, 'migration.db'));
  sqlite.pragma('foreign_keys = ON');
  return { root, sqlite };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('0059 first-class RIR migration', () => {
  it('preserves populated 0058 session sets and every relational guard', () => {
    const { root, sqlite } = createDatabase();
    migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 58) });

    sqlite
      .prepare(
        "INSERT INTO users (id, username, password_hash) VALUES ('user-1', 'user-1', 'hash')",
      )
      .run();
    sqlite
      .prepare(
        "INSERT INTO users (id, username, password_hash) VALUES ('user-2', 'user-2', 'hash')",
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO exercises (
          id, user_id, name, muscle_groups, equipment, category, tracking_type,
          tags, form_cues, related_exercise_ids, created_at, updated_at
        ) VALUES (?, ?, ?, '[]', 'barbell', 'compound', 'weight_reps', '[]', '[]', '[]', 100, 100)`,
      )
      .run('exercise-1', 'user-1', 'Bench press');
    sqlite
      .prepare(
        `INSERT INTO exercises (
          id, user_id, name, muscle_groups, equipment, category, tracking_type,
          tags, form_cues, related_exercise_ids, created_at, updated_at
        ) VALUES (?, ?, ?, '[]', 'barbell', 'compound', 'weight_reps', '[]', '[]', '[]', 100, 100)`,
      )
      .run('exercise-2', 'user-2', 'Private press');
    sqlite
      .prepare(
        `INSERT INTO workout_sessions (
          id, user_id, name, date, status, started_at, completed_at, time_segments,
          created_at, updated_at
        ) VALUES ('session-1', 'user-1', 'Upper', '2026-08-27', 'completed', 100, 200,
          '[]', 100, 200)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO session_sets (
          id, session_id, exercise_id, order_index, set_number, weight, reps, seconds,
          distance, rpe, zone, target_weight, target_weight_min, target_weight_max,
          target_reps_min, target_reps_max, target_reps, target_seconds, target_distance,
          target_zone, source_scheduled_set_id, exercise_id_snapshot, exercise_name_snapshot,
          tracking_type_snapshot, superset_group, completed, skipped, section, notes, created_at
        ) VALUES (
          'set-1', 'session-1', 'exercise-1', 3, 1, 155.5, 10, 45, 1.25, 8, 3,
          155, 150, 160, 8, 12, 10, 50, 1.5, 4, 'planned-set-1', 'exercise-1',
          'Bench press', 'weight_reps', 'A', 1, 0, 'main', 'legacy native RPE', 190
        )`,
      )
      .run();

    migratePulseDatabase(sqlite, { migrationsFolder: sourceMigrationsFolder });

    expect(
      sqlite
        .prepare(
          `SELECT id, session_id AS sessionId, exercise_id AS exerciseId,
                  order_index AS orderIndex, set_number AS setNumber, weight, reps, seconds,
                  distance, rpe, rir, zone, target_weight AS targetWeight,
                  target_weight_min AS targetWeightMin, target_weight_max AS targetWeightMax,
                  target_reps_min AS targetRepsMin, target_reps_max AS targetRepsMax,
                  target_reps AS targetReps, target_seconds AS targetSeconds,
                  target_distance AS targetDistance, target_zone AS targetZone,
                  source_scheduled_set_id AS sourceScheduledSetId,
                  exercise_id_snapshot AS exerciseIdSnapshot,
                  exercise_name_snapshot AS exerciseNameSnapshot,
                  tracking_type_snapshot AS trackingTypeSnapshot,
                  superset_group AS supersetGroup, completed, skipped, section, notes,
                  created_at AS createdAt
             FROM session_sets WHERE id = 'set-1'`,
        )
        .get(),
    ).toEqual({
      completed: 1,
      createdAt: 190,
      distance: 1.25,
      exerciseId: 'exercise-1',
      exerciseIdSnapshot: 'exercise-1',
      exerciseNameSnapshot: 'Bench press',
      id: 'set-1',
      notes: 'legacy native RPE',
      orderIndex: 3,
      reps: 10,
      rir: null,
      rpe: 8,
      seconds: 45,
      section: 'main',
      sessionId: 'session-1',
      setNumber: 1,
      skipped: 0,
      sourceScheduledSetId: 'planned-set-1',
      supersetGroup: 'A',
      targetDistance: 1.5,
      targetReps: 10,
      targetRepsMax: 12,
      targetRepsMin: 8,
      targetSeconds: 50,
      targetWeight: 155,
      targetWeightMax: 160,
      targetWeightMin: 150,
      targetZone: 4,
      trackingTypeSnapshot: 'weight_reps',
      weight: 155.5,
      zone: 3,
    });

    const tableSql = (
      sqlite
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'session_sets'")
        .get() as { sql: string }
    ).sql;
    for (const constraint of [
      'session_sets_set_number_check',
      'session_sets_seconds_check',
      'session_sets_distance_check',
      'session_sets_section_check',
      'session_sets_completion_state_check',
      'session_sets_rpe_check',
      'session_sets_rir_check',
      'session_sets_effort_scale_check',
      'session_sets_zone_check',
      'session_sets_target_zone_check',
      'session_sets_target_reps_check',
    ]) {
      expect(tableSql).toContain(constraint);
    }
    expect(
      sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'session_sets'",
        )
        .all()
        .map((row) => (row as { name: string }).name)
        .sort(),
    ).toEqual([
      'session_sets_session_exercise_section_set_number_unique',
      'session_sets_session_id_idx',
      'sqlite_autoindex_session_sets_1',
    ]);
    expect(
      sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'session_sets'",
        )
        .all()
        .map((row) => (row as { name: string }).name)
        .sort(),
    ).toEqual([
      'session_sets_exercise_scope_insert',
      'session_sets_exercise_scope_update',
      'session_sets_progression_target_insert_guard',
      'session_sets_progression_target_update_guard',
    ]);

    expect(() =>
      sqlite.prepare("UPDATE session_sets SET rir = -1 WHERE id = 'set-1'").run(),
    ).toThrow();
    expect(() =>
      sqlite.prepare("UPDATE session_sets SET rir = 6 WHERE id = 'set-1'").run(),
    ).toThrow();
    expect(() =>
      sqlite.prepare("UPDATE session_sets SET rpe = NULL, rir = 1.5 WHERE id = 'set-1'").run(),
    ).toThrow();
    expect(() =>
      sqlite.prepare("UPDATE session_sets SET rir = 2 WHERE id = 'set-1'").run(),
    ).toThrow();
    sqlite.prepare("UPDATE session_sets SET rpe = NULL, rir = 5 WHERE id = 'set-1'").run();
    expect(sqlite.prepare("SELECT rpe, rir FROM session_sets WHERE id = 'set-1'").get()).toEqual({
      rir: 5,
      rpe: null,
    });
    expect(() =>
      sqlite.prepare("UPDATE session_sets SET exercise_id = 'exercise-2' WHERE id = 'set-1'").run(),
    ).toThrow(/invalid session_sets exercise link/u);
    expect(() =>
      sqlite.prepare("UPDATE session_sets SET target_zone = 6 WHERE id = 'set-1'").run(),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO session_sets (
            id, session_id, exercise_id, set_number, section, created_at
          ) VALUES ('set-duplicate', 'session-1', 'exercise-1', 1, 'main', 200)`,
        )
        .run(),
    ).toThrow();
    expect(sqlite.pragma('foreign_key_list(session_sets)')).toEqual([
      expect.objectContaining({
        from: 'exercise_id',
        on_delete: 'SET NULL',
        on_update: 'NO ACTION',
        table: 'exercises',
        to: 'id',
      }),
      expect.objectContaining({
        from: 'session_id',
        on_delete: 'CASCADE',
        on_update: 'NO ACTION',
        table: 'workout_sessions',
        to: 'id',
      }),
    ]);
    expect(sqlite.pragma('index_info(session_sets_session_id_idx)')).toEqual([
      expect.objectContaining({ name: 'session_id', seqno: 0 }),
    ]);
    expect(
      sqlite.pragma('index_info(session_sets_session_exercise_section_set_number_unique)'),
    ).toEqual([
      expect.objectContaining({ name: 'session_id', seqno: 0 }),
      expect.objectContaining({ name: 'exercise_id', seqno: 1 }),
      expect.objectContaining({ name: 'section', seqno: 2 }),
      expect.objectContaining({ name: 'set_number', seqno: 3 }),
    ]);
    expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    sqlite.close();
  });
});
