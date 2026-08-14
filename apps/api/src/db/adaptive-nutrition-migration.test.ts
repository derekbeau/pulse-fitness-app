import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, expect, it } from 'vitest';

const runSqlStatements = (sqlite: Database.Database, sqlContent: string) => {
  for (const statement of sqlContent
    .split('--> statement-breakpoint')
    .map((value) => value.trim())
    .filter(Boolean)) {
    sqlite.exec(statement);
  }
};

const migrationSql = () =>
  readFileSync(join(process.cwd(), 'drizzle/0042_adaptive_nutrition_foundation.sql'), 'utf8');

const createLegacyFoundation = (sqlite: Database.Database) => {
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE nutrition_logs (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX nutrition_logs_user_id_date_unique
      ON nutrition_logs(user_id, date);
    CREATE TABLE meals (
      id TEXT PRIMARY KEY NOT NULL,
      nutrition_log_id TEXT NOT NULL REFERENCES nutrition_logs(id) ON DELETE CASCADE,
      name TEXT NOT NULL
    );
    CREATE TABLE nutrition_targets (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      calories REAL NOT NULL,
      protein REAL NOT NULL,
      carbs REAL NOT NULL,
      fat REAL NOT NULL,
      effective_date TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX nutrition_targets_user_id_effective_date_unique
      ON nutrition_targets(user_id, effective_date);
    INSERT INTO users(id, username, password_hash) VALUES ('user-1', 'legacy', 'hash');
    INSERT INTO nutrition_logs VALUES (
      'log-1', 'user-1', '2026-03-09', 'legacy', 1700000000000, 1700000000000
    );
    INSERT INTO meals VALUES ('meal-1', 'log-1', 'Breakfast');
    INSERT INTO nutrition_targets VALUES (
      'target-1', 'user-1', 2200, 180, 250, 70, '2026-03-09', 1700000000000, 1700000000000
    );
  `);
};

const insertProgramAndCheckIn = (sqlite: Database.Database, currentTargets: unknown) => {
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_programs (
        id, user_id, time_zone, rmr_equation, baseline_tdee_kcal, goal_type,
        goal_rate_pct_per_week, protein_grams, fat_allocation_pct,
        system_calorie_floor_kcal, user_calorie_floor_kcal, algorithm_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'program-1',
      'user-1',
      'America/Detroit',
      'manual_tdee',
      2500,
      'maintain',
      0,
      180,
      30,
      1500,
      1500,
      'adaptive-tdee-v1',
    );

  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_checkins (
        id, user_id, program_id, kind, status, calculation_state, local_date,
        include_today, algorithm_version, data_fingerprint, input_snapshot,
        calculation_snapshot, reason_codes, current_targets
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'check-in-1',
      'user-1',
      'program-1',
      'baseline',
      'pending',
      'baseline',
      '2026-03-09',
      0,
      'adaptive-tdee-v1',
      'a'.repeat(64),
      JSON.stringify({ version: 1 }),
      JSON.stringify({ version: 1 }),
      '[]',
      JSON.stringify(currentTargets),
    );
};

describe('migration 0042 adaptive nutrition foundation', () => {
  it('migrates legacy rows explicitly and enforces completeness/provenance constraints', () => {
    const sqlite = new Database(':memory:');
    try {
      createLegacyFoundation(sqlite);
      runSqlStatements(sqlite, migrationSql());

      expect(sqlite.prepare('SELECT status, status_updated_at FROM nutrition_logs').get()).toEqual({
        status: 'unknown',
        status_updated_at: null,
      });
      expect(
        sqlite
          .prepare('SELECT source, adaptive_check_in_id, macro_calories FROM nutrition_targets')
          .get(),
      ).toEqual({ source: 'manual', adaptive_check_in_id: null, macro_calories: 2350 });
      expect(sqlite.prepare('SELECT * FROM meals').get()).toEqual({
        id: 'meal-1',
        nutrition_log_id: 'log-1',
        name: 'Breakfast',
      });
      expect(sqlite.pragma('foreign_key_check')).toEqual([]);

      expect(() =>
        sqlite.prepare("UPDATE nutrition_logs SET status = 'done' WHERE id = 'log-1'").run(),
      ).toThrow(/CHECK constraint failed/u);
      expect(() =>
        sqlite
          .prepare(
            `UPDATE nutrition_targets
             SET source = 'adaptive', adaptive_check_in_id = NULL
             WHERE id = 'target-1'`,
          )
          .run(),
      ).toThrow(/CHECK constraint failed/u);
      expect(() =>
        sqlite
          .prepare(`UPDATE nutrition_targets SET macro_calories = -1 WHERE id = 'target-1'`)
          .run(),
      ).toThrow(/CHECK constraint failed/u);
    } finally {
      sqlite.close();
    }
  });

  it('restricts provenance deletion and preserves same-date replacement history in snapshots', () => {
    const sqlite = new Database(':memory:');
    try {
      createLegacyFoundation(sqlite);
      runSqlStatements(sqlite, migrationSql());
      const originalTarget = sqlite
        .prepare('SELECT * FROM nutrition_targets WHERE id = ?')
        .get('target-1');
      insertProgramAndCheckIn(sqlite, originalTarget);

      sqlite
        .prepare(
          `UPDATE nutrition_targets SET
            calories = 2300, protein = 185, carbs = 260, fat = 75,
            source = 'adaptive', adaptive_check_in_id = 'check-in-1',
            macro_calories = 2455
           WHERE id = 'target-1'`,
        )
        .run();

      expect(
        JSON.parse(
          (
            sqlite
              .prepare('SELECT current_targets FROM adaptive_nutrition_checkins WHERE id = ?')
              .get('check-in-1') as { current_targets: string }
          ).current_targets,
        ),
      ).toEqual(originalTarget);
      sqlite.prepare("DELETE FROM nutrition_targets WHERE user_id = 'user-1'").run();
      expect(() =>
        sqlite.prepare("DELETE FROM adaptive_nutrition_checkins WHERE id = 'check-in-1'").run(),
      ).toThrow(/account deletion scope/u);
      expect(
        sqlite.prepare("SELECT id FROM adaptive_nutrition_checkins WHERE id = 'check-in-1'").get(),
      ).toEqual({ id: 'check-in-1' });
      expect(() =>
        sqlite
          .prepare(
            `UPDATE adaptive_nutrition_checkins
             SET current_targets = NULL WHERE id = 'check-in-1'`,
          )
          .run(),
      ).toThrow(/snapshots are immutable/u);
      expect(() =>
        sqlite
          .prepare(
            `UPDATE adaptive_nutrition_checkins
             SET status = 'accepted', accepted_nutrition_target_id = 'target-1', resolved_at = 200
             WHERE id = 'check-in-1'`,
          )
          .run(),
      ).not.toThrow();
      expect(() => sqlite.prepare("DELETE FROM users WHERE id = 'user-1'").run()).toThrow(
        /account deletion scope/u,
      );
    } finally {
      sqlite.close();
    }
  });

  it('applies the complete migration chain to a fresh database', () => {
    const sqlite = new Database(':memory:');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: join(process.cwd(), 'drizzle') });

      const tables = sqlite
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name IN (
             'adaptive_nutrition_programs',
             'adaptive_nutrition_checkins',
             'nutrition_logs',
             'nutrition_targets'
           ) ORDER BY name`,
        )
        .all() as Array<{ name: string }>;
      expect(tables.map((row) => row.name)).toEqual([
        'adaptive_nutrition_checkins',
        'adaptive_nutrition_programs',
        'nutrition_logs',
        'nutrition_targets',
      ]);
      expect(sqlite.pragma('foreign_key_check')).toEqual([]);
      expect(
        sqlite
          .prepare(
            `SELECT name FROM sqlite_master
             WHERE type = 'trigger' AND name = 'adaptive_nutrition_checkins_delete_guard'`,
          )
          .get(),
      ).toEqual({ name: 'adaptive_nutrition_checkins_delete_guard' });
    } finally {
      sqlite.close();
    }
  });
});
