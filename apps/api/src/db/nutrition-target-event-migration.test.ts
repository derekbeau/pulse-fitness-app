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

const stageThrough = (root: string, maximumIndex: number) => {
  const destination = join(root, `through-${maximumIndex}`);
  mkdirSync(join(destination, 'meta'), { recursive: true });
  const journal = JSON.parse(
    readFileSync(join(sourceMigrationsFolder, 'meta/_journal.json'), 'utf8'),
  ) as Journal;
  const entries = journal.entries.filter((entry) => entry.idx <= maximumIndex);
  writeFileSync(
    join(destination, 'meta/_journal.json'),
    `${JSON.stringify({ ...journal, entries }, null, 2)}\n`,
  );
  for (const entry of entries) {
    copyFileSync(
      join(sourceMigrationsFolder, `${entry.tag}.sql`),
      join(destination, `${entry.tag}.sql`),
    );
  }
  return destination;
};

const seedAcceptedReplacement = (sqlite: Database.Database, valid = true) => {
  const manual = {
    id: 'target-1',
    calories: 2200,
    protein: 180,
    carbs: 230,
    fat: 62,
    source: 'manual',
    adaptiveCheckInId: null,
    macroCalories: 2198,
    effectiveDate: '2026-08-18',
    createdAt: 100,
    updatedAt: 100,
  };
  const proposed = {
    calories: 2100,
    protein: 180,
    carbs: 205,
    fat: 62,
    effectiveDate: '2026-08-18',
  };
  const applied = {
    calories: 2250,
    protein: 180,
    carbs: 242.5,
    fat: 62,
    effectiveDate: '2026-08-18',
  };
  sqlite
    .prepare("INSERT INTO users (id, username, password_hash) VALUES ('user-1', 'user-1', 'hash')")
    .run();
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_programs (
        id, user_id, status, time_zone, rmr_equation, manual_baseline_tdee_kcal,
        baseline_tdee_kcal, goal_type, goal_rate_pct_per_week, protein_grams,
        fat_allocation_pct, system_calorie_floor_kcal, user_calorie_floor_kcal,
        algorithm_version, created_at, updated_at
      ) VALUES ('program-1', 'user-1', 'active', 'America/Detroit', 'manual_tdee', 2500,
        2500, 'maintain', 0, 180, 30, 1500, 1500, 'adaptive-tdee-v1', 1, 1)`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_goals (
        id, user_id, program_id, type, status, start_trend_weight_kg,
        start_scale_weight_kg, target_weight_kg, maintenance_center_kg,
        goal_rate_pct_per_week, started_local_date, created_at, updated_at
      ) VALUES ('goal-1', 'user-1', 'program-1', 'maintain', 'active', 80, 80,
        NULL, 80, 0, '2026-08-01', 1, 1)`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_goal_revisions (
        id, goal_id, user_id, sequence, target_weight_kg, maintenance_center_kg,
        goal_rate_pct_per_week, previous_target_weight_kg, previous_center_kg,
        previous_rate_pct_per_week, reason, effective_local_date, created_at
      ) VALUES ('goal-revision-1', 'goal-1', 'user-1', 1, NULL, 80, 0, NULL, 80,
        0, 'created', '2026-08-01', 1)`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_checkins (
        id, user_id, program_id, goal_id, goal_revision_id, kind, status,
        calculation_state, local_date, analysis_start, analysis_end, include_today,
        algorithm_version, data_fingerprint, input_snapshot, calculation_snapshot,
        reason_codes, current_targets, proposed_targets, accepted_nutrition_target_id,
        resolved_at, created_at
      ) VALUES ('check-in-1', 'user-1', 'program-1', 'goal-1', 'goal-revision-1',
        'weekly', 'accepted', 'updating', '2026-08-18', '2026-07-28', '2026-08-17', 0,
        'adaptive-tdee-v1', ?, '{}', '{}', '[]', ?, ?, 'target-1', 200, 150)`,
    )
    .run('a'.repeat(64), JSON.stringify(manual), valid ? JSON.stringify(proposed) : '{}');
  sqlite
    .prepare(
      `INSERT INTO nutrition_targets (
        id, user_id, calories, protein, carbs, fat, source, adaptive_check_in_id,
        macro_calories, effective_date, created_at, updated_at
      ) VALUES ('target-1', 'user-1', 2250, 180, 242.5, 62, 'adaptive', 'check-in-1',
        2248, '2026-08-18', 100, 200)`,
    )
    .run();
  if (valid) {
    sqlite
      .prepare(
        `INSERT INTO adaptive_nutrition_reviews (
          id, user_id, program_id, check_in_id, kind, review_version, source_fingerprint,
          review_local_date, analysis_start, analysis_end, time_zone, snapshot, created_at
        ) VALUES ('review-1', 'user-1', 'program-1', 'check-in-1', 'weekly', 1, ?,
          '2026-08-18', '2026-07-28', '2026-08-17', 'America/Detroit', '{}', 175)`,
      )
      .run('b'.repeat(64));
    sqlite
      .prepare(
        `INSERT INTO adaptive_nutrition_review_actions (
          id, review_id, user_id, sequence, type, payload, actor_type, actor_label, created_at
        ) VALUES ('action-1', 'review-1', 'user-1', 1, 'accept', ?, 'user', 'You', 200)`,
      )
      .run(JSON.stringify({ type: 'accept', appliedProposal: applied }));
  }
};

const expectHealthy = (sqlite: Database.Database) => {
  expect(sqlite.pragma('foreign_key_check')).toEqual([]);
  expect(sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
};

describe('nutrition target event migration', () => {
  afterEach(() => {
    while (temporaryDirectories.length) {
      const directory = temporaryDirectories.pop();
      if (directory) rmSync(directory, { recursive: true, force: true });
    }
  });

  it('upgrades a populated real 0050 database with exact predecessor and edited acceptance facts', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-upgrade-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'upgrade.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedAcceptedReplacement(sqlite);
      const targetBefore = sqlite
        .prepare("SELECT * FROM nutrition_targets WHERE id = 'target-1'")
        .get();

      migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder });

      expect(sqlite.prepare("SELECT * FROM nutrition_targets WHERE id = 'target-1'").get()).toEqual(
        targetBefore,
      );
      expect(
        sqlite
          .prepare(
            `SELECT sequence, calories, protein, carbs, fat, macro_calories AS macroCalories,
                    source, adaptive_check_in_id AS adaptiveCheckInId, effective_date AS effectiveDate,
                    recorded_at AS recordedAt
             FROM nutrition_target_events WHERE target_id = 'target-1' ORDER BY sequence`,
          )
          .all(),
      ).toEqual([
        {
          sequence: 1,
          calories: 2200,
          protein: 180,
          carbs: 230,
          fat: 62,
          macroCalories: 2198,
          source: 'manual',
          adaptiveCheckInId: null,
          effectiveDate: '2026-08-18',
          recordedAt: 100,
        },
        {
          sequence: 2,
          calories: 2250,
          protein: 180,
          carbs: 242.5,
          fat: 62,
          macroCalories: 2248,
          source: 'adaptive',
          adaptiveCheckInId: 'check-in-1',
          effectiveDate: '2026-08-18',
          recordedAt: 200,
        },
      ]);
      expect(() =>
        sqlite
          .prepare(
            "UPDATE nutrition_target_events SET calories = 1 WHERE id = 'migration-accepted:check-in-1'",
          )
          .run(),
      ).toThrow(/immutable/iu);
      expect(() =>
        sqlite
          .prepare("DELETE FROM nutrition_target_events WHERE id = 'migration-accepted:check-in-1'")
          .run(),
      ).toThrow(/account deletion scope/iu);
      expect(() =>
        sqlite
          .prepare(
            `INSERT INTO nutrition_target_events (
              id, target_id, user_id, sequence, effective_date, calories, protein, carbs, fat,
              macro_calories, source, adaptive_check_in_id, event_type, recorded_at, created_at
            ) VALUES ('gap', 'target-1', 'user-1', 4, '2026-08-18', 2250, 180, 242.5,
              62, 2248, 'manual', NULL, 'manual_write', 201, 201)`,
          )
          .run(),
      ).toThrow(/exact next sequence/iu);
      sqlite
        .prepare(
          "INSERT INTO users (id, username, password_hash) VALUES ('user-2', 'user-2', 'hash')",
        )
        .run();
      expect(() =>
        sqlite
          .prepare(
            `INSERT INTO nutrition_target_events (
              id, target_id, user_id, sequence, effective_date, calories, protein, carbs, fat,
              macro_calories, source, adaptive_check_in_id, event_type, recorded_at, created_at
            ) VALUES ('foreign', 'target-1', 'user-2', 3, '2026-08-18', 2250, 180, 242.5,
              62, 2248, 'manual', NULL, 'manual_write', 201, 201)`,
          )
          .run(),
      ).toThrow(/foreign key/iu);
      expectHealthy(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it('rolls back rather than inventing an unrecoverable accepted target', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-invalid-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'invalid.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedAcceptedReplacement(sqlite, false);
      expect(() => migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder })).toThrow(
        /Failed to run the query|constraint/iu,
      );
      expect(
        sqlite
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'nutrition_target_events'",
          )
          .get(),
      ).toBeUndefined();
      expectHealthy(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it('installs the complete journal on a fresh database', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-fresh-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'fresh.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder });
      expect(
        sqlite
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'nutrition_target_events_%_guard' ORDER BY name",
          )
          .all(),
      ).toEqual([
        { name: 'nutrition_target_events_delete_guard' },
        { name: 'nutrition_target_events_insert_guard' },
        { name: 'nutrition_target_events_update_guard' },
      ]);
      expectHealthy(sqlite);
    } finally {
      sqlite.close();
    }
  });
});
