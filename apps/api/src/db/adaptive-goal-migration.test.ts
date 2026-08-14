import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, expect, it } from 'vitest';

import { backfillAdaptiveNutritionGoals } from './adaptive-goal-backfill.js';

const migrationSql = readFileSync(
  join(process.cwd(), 'drizzle/0043_adaptive_goal_strategy.sql'),
  'utf8',
);

const runSqlStatements = (sqlite: Database.Database, sqlContent: string) => {
  for (const statement of sqlContent
    .split('--> statement-breakpoint')
    .map((value) => value.trim())
    .filter(Boolean)) {
    sqlite.exec(statement);
  }
};

const migrateFresh = () => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = OFF');
  migrate(drizzle(sqlite), { migrationsFolder: join(process.cwd(), 'drizzle') });
  sqlite.pragma('foreign_keys = ON');
  return sqlite;
};

const seedUser = (sqlite: Database.Database, id: string) => {
  sqlite
    .prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)')
    .run(id, id, 'hash');
};

const seedWeight = (sqlite: Database.Database, userId: string, date: string, weightKg: number) => {
  sqlite
    .prepare(
      `INSERT INTO body_weight
       (id, user_id, date, weight, weight_kg, unit_at_entry, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'kg', 1, 1)`,
    )
    .run(`${userId}-${date}`, userId, date, weightKg / 0.45359237, weightKg);
};

const seedProgram = (
  sqlite: Database.Database,
  userId: string,
  type: 'lose' | 'maintain' | 'gain',
  targetWeightKg: number | null,
  rate: number,
) => {
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_programs (
         id, user_id, time_zone, rmr_equation, baseline_tdee_kcal, goal_type,
         target_weight_kg, goal_rate_pct_per_week, protein_grams, fat_allocation_pct,
         system_calorie_floor_kcal, user_calorie_floor_kcal, algorithm_version,
         created_at, updated_at
       ) VALUES (?, ?, 'America/Detroit', 'manual_tdee', 2400, ?, ?, ?, 180, 30,
                 1500, 1500, 'adaptive-tdee-v1', 1, 1)`,
    )
    .run(`program-${userId}`, userId, type, targetWeightKg, rate);
};

describe('migration 0043 adaptive goal strategy', () => {
  it('creates the constrained goal domain and preserves fresh-database integrity', () => {
    const sqlite = migrateFresh();
    try {
      const tables = sqlite
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name IN (
             'adaptive_nutrition_goals', 'adaptive_nutrition_goal_revisions'
           ) ORDER BY name`,
        )
        .all() as Array<{ name: string }>;
      expect(tables.map((row) => row.name)).toEqual([
        'adaptive_nutrition_goal_revisions',
        'adaptive_nutrition_goals',
      ]);
      expect(sqlite.pragma('foreign_key_check')).toEqual([]);
      const indexes = sqlite
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'index' AND name LIKE 'adaptive_nutrition_goal%'
           ORDER BY name`,
        )
        .all() as Array<{ name: string }>;
      expect(indexes.map((row) => row.name)).toEqual(
        expect.arrayContaining([
          'adaptive_nutrition_goals_one_active_per_user_unique',
          'adaptive_nutrition_goal_revisions_goal_sequence_unique',
          'adaptive_nutrition_goal_revisions_id_goal_user_unique',
        ]),
      );
    } finally {
      sqlite.close();
    }
  });

  it('backfills lose, gain, maintenance-retained, scale-fallback, and blocked users idempotently', () => {
    const sqlite = migrateFresh();
    try {
      for (const id of ['lose', 'gain', 'maintain', 'scale', 'blocked']) seedUser(sqlite, id);
      seedProgram(sqlite, 'lose', 'lose', 70, -0.5);
      seedProgram(sqlite, 'gain', 'gain', 90, 0.25);
      seedProgram(sqlite, 'maintain', 'maintain', 81, 0);
      seedProgram(sqlite, 'scale', 'maintain', null, 0);
      seedProgram(sqlite, 'blocked', 'maintain', null, 0);
      for (const userId of ['lose', 'gain', 'maintain']) {
        for (let day = 1; day <= 15; day += 2) {
          seedWeight(sqlite, userId, `2026-08-${String(day).padStart(2, '0')}`, 80 + day / 100);
        }
      }
      seedWeight(sqlite, 'scale', '2026-07-01', 77);

      expect(
        backfillAdaptiveNutritionGoals(sqlite, {
          now: () => new Date('2026-08-13T16:00:00.000Z'),
        }),
      ).toEqual({ created: 4, skipped: 0, blocked: 1 });
      expect(
        backfillAdaptiveNutritionGoals(sqlite, {
          now: () => new Date('2026-08-13T16:00:00.000Z'),
        }),
      ).toEqual({ created: 0, skipped: 4, blocked: 1 });

      expect(
        sqlite
          .prepare(
            `SELECT g.type, g.target_weight_kg AS targetWeightKg,
                    g.maintenance_center_kg AS maintenanceCenterKg,
                    r.sequence, r.reason
             FROM adaptive_nutrition_goals g
             JOIN adaptive_nutrition_goal_revisions r ON r.goal_id = g.id
             WHERE g.user_id = 'maintain'`,
          )
          .get(),
      ).toEqual({
        type: 'maintain',
        targetWeightKg: null,
        maintenanceCenterKg: 81,
        sequence: 1,
        reason: 'migration',
      });
      expect(
        sqlite
          .prepare(
            `SELECT start_trend_weight_kg AS startTrendWeightKg,
                    start_scale_weight_kg AS startScaleWeightKg,
                    maintenance_center_kg AS maintenanceCenterKg
             FROM adaptive_nutrition_goals WHERE user_id = 'scale'`,
          )
          .get(),
      ).toEqual({ startTrendWeightKg: 77, startScaleWeightKg: 77, maintenanceCenterKg: 77 });
      expect(
        sqlite
          .prepare("SELECT count(*) AS count FROM adaptive_nutrition_goals WHERE status = 'active'")
          .get(),
      ).toEqual({ count: 4 });
      expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it('rolls back only the failing user and enforces active/revision/check/immutability guards', () => {
    const sqlite = migrateFresh();
    try {
      seedUser(sqlite, 'a-ok');
      seedUser(sqlite, 'z-fault');
      seedProgram(sqlite, 'a-ok', 'lose', 70, -0.5);
      seedProgram(sqlite, 'z-fault', 'gain', 90, 0.25);
      seedWeight(sqlite, 'a-ok', '2026-08-13', 80);
      seedWeight(sqlite, 'z-fault', '2026-08-13', 80);

      expect(() =>
        backfillAdaptiveNutritionGoals(sqlite, {
          now: () => new Date('2026-08-13T16:00:00.000Z'),
          beforeRevisionInsert: (userId) => {
            if (userId === 'z-fault') throw new Error('fault injection');
          },
        }),
      ).toThrow('fault injection');
      expect(
        sqlite
          .prepare("SELECT count(*) AS count FROM adaptive_nutrition_goals WHERE user_id = 'a-ok'")
          .get(),
      ).toEqual({ count: 1 });
      expect(
        sqlite
          .prepare(
            "SELECT count(*) AS count FROM adaptive_nutrition_goals WHERE user_id = 'z-fault'",
          )
          .get(),
      ).toEqual({ count: 0 });

      const goal = sqlite
        .prepare("SELECT id FROM adaptive_nutrition_goals WHERE user_id = 'a-ok'")
        .get() as { id: string };
      expect(() =>
        sqlite
          .prepare(
            `INSERT INTO adaptive_nutrition_goals
             (id, user_id, program_id, type, status, start_trend_weight_kg,
              start_scale_weight_kg, target_weight_kg, maintenance_center_kg,
              goal_rate_pct_per_week, started_local_date, created_at, updated_at)
             VALUES ('duplicate', 'a-ok', 'program-a-ok', 'lose', 'active', 80, 80, 70,
                     NULL, -0.5, '2026-08-13', 1, 1)`,
          )
          .run(),
      ).toThrow(/UNIQUE constraint failed/u);
      expect(() =>
        sqlite
          .prepare('UPDATE adaptive_nutrition_goal_revisions SET sequence = 2 WHERE goal_id = ?')
          .run(goal.id),
      ).toThrow(/revisions are immutable/u);
      expect(() =>
        sqlite.prepare('DELETE FROM adaptive_nutrition_goals WHERE id = ?').run(goal.id),
      ).toThrow(/account deletion scope/u);
      expect(() =>
        sqlite
          .prepare(
            `INSERT INTO adaptive_nutrition_goals
             (id, user_id, program_id, type, status, start_trend_weight_kg,
              target_weight_kg, goal_rate_pct_per_week, started_local_date, created_at, updated_at)
             VALUES ('bad', 'z-fault', 'program-z-fault', 'gain', 'active', 80, 90, -0.5,
                     '2026-08-13', 1, 1)`,
          )
          .run(),
      ).toThrow(/CHECK constraint failed/u);
      expect(() =>
        sqlite
          .prepare(
            `INSERT INTO adaptive_nutrition_goals
             (id, user_id, program_id, type, status, start_trend_weight_kg,
              target_weight_kg, goal_rate_pct_per_week, started_local_date, created_at, updated_at)
             VALUES ('cross-owner', 'z-fault', 'program-a-ok', 'gain', 'active', 80, 90, 0.25,
                     '2026-08-13', 1, 1)`,
          )
          .run(),
      ).toThrow(/FOREIGN KEY constraint failed/u);
      expect(() =>
        sqlite
          .prepare(
            `INSERT INTO adaptive_nutrition_goal_revisions
             (id, goal_id, user_id, sequence, target_weight_kg, goal_rate_pct_per_week,
              previous_target_weight_kg, previous_rate_pct_per_week, reason,
              effective_local_date, created_at)
             VALUES ('cross-owner-revision', ?, 'z-fault', 2, 70, -0.5, 70, -0.5,
                     'migration', '2026-08-13', 1)`,
          )
          .run(goal.id),
      ).toThrow(/FOREIGN KEY constraint failed/u);
    } finally {
      sqlite.close();
    }
  });

  it('preserves legacy check-in JSON and nutrition targets when rebuilding linkage', () => {
    const sqlite = new Database(':memory:');
    try {
      sqlite.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL);
        CREATE TABLE adaptive_nutrition_account_deletion_scope (user_id TEXT PRIMARY KEY NOT NULL);
        CREATE TABLE adaptive_nutrition_programs (
          id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL,
          UNIQUE(id, user_id)
        );
        CREATE TABLE adaptive_nutrition_checkins (
          id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, program_id TEXT NOT NULL,
          kind TEXT NOT NULL, status TEXT NOT NULL, calculation_state TEXT NOT NULL,
          local_date TEXT NOT NULL, analysis_start TEXT, analysis_end TEXT,
          include_today INTEGER NOT NULL DEFAULT 0, algorithm_version TEXT NOT NULL,
          data_fingerprint TEXT NOT NULL, input_snapshot TEXT NOT NULL,
          calculation_snapshot TEXT NOT NULL, reason_codes TEXT NOT NULL,
          prior_tdee_kcal REAL, observed_tdee_kcal REAL, proposed_tdee_kcal REAL,
          current_targets TEXT, proposed_targets TEXT, accepted_nutrition_target_id TEXT,
          resolved_at INTEGER, created_at INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE nutrition_targets (
          id TEXT PRIMARY KEY NOT NULL, adaptive_check_in_id TEXT,
          payload TEXT NOT NULL
        );
        CREATE TRIGGER adaptive_nutrition_checkins_immutable_snapshot_guard
          BEFORE UPDATE ON adaptive_nutrition_checkins BEGIN SELECT RAISE(ABORT, 'old'); END;
        CREATE TRIGGER adaptive_nutrition_checkins_delete_guard
          BEFORE DELETE ON adaptive_nutrition_checkins BEGIN SELECT RAISE(ABORT, 'old'); END;
        INSERT INTO users VALUES ('user-1');
        INSERT INTO adaptive_nutrition_programs VALUES ('program-1', 'user-1');
        INSERT INTO adaptive_nutrition_checkins
          (id,user_id,program_id,kind,status,calculation_state,local_date,algorithm_version,
           data_fingerprint,input_snapshot,calculation_snapshot,reason_codes,current_targets,
           proposed_targets,created_at)
        VALUES ('check-1','user-1','program-1','manual','accepted','updating','2026-08-01',
                'adaptive-tdee-v1','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                '{"version":1,"legacy":true}','{"state":"updating"}','[]','{"calories":2200}',
                '{"calories":2300}',1);
        INSERT INTO nutrition_targets VALUES ('target-1', 'check-1', '{"calories":2300}');
      `);
      const beforeCheckIn = sqlite
        .prepare(
          'SELECT input_snapshot, calculation_snapshot, current_targets, proposed_targets FROM adaptive_nutrition_checkins',
        )
        .get();
      const beforeTarget = sqlite.prepare('SELECT * FROM nutrition_targets').get();
      runSqlStatements(sqlite, migrationSql);
      expect(
        sqlite
          .prepare(
            'SELECT input_snapshot, calculation_snapshot, current_targets, proposed_targets FROM adaptive_nutrition_checkins',
          )
          .get(),
      ).toEqual(beforeCheckIn);
      expect(sqlite.prepare('SELECT * FROM nutrition_targets').get()).toEqual(beforeTarget);
      expect(
        sqlite.prepare('SELECT goal_id, goal_revision_id FROM adaptive_nutrition_checkins').get(),
      ).toEqual({ goal_id: null, goal_revision_id: null });
    } finally {
      sqlite.close();
    }
  });

  it('serializes competing connections and converges on one goal and revision', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-goal-backfill-concurrency-'));
    const databasePath = join(tempDir, 'test.db');
    const sqliteA = new Database(databasePath);
    const sqliteB = new Database(databasePath);
    try {
      sqliteA.pragma('foreign_keys = OFF');
      migrate(drizzle(sqliteA), { migrationsFolder: join(process.cwd(), 'drizzle') });
      sqliteA.pragma('foreign_keys = ON');
      sqliteB.pragma('foreign_keys = ON');
      sqliteB.pragma('busy_timeout = 0');
      seedUser(sqliteA, 'concurrent');
      seedProgram(sqliteA, 'concurrent', 'lose', 70, -0.5);
      seedWeight(sqliteA, 'concurrent', '2026-08-13', 80);

      sqliteA.exec('BEGIN IMMEDIATE');
      expect(() =>
        backfillAdaptiveNutritionGoals(sqliteB, {
          now: () => new Date('2026-08-13T16:00:00.000Z'),
        }),
      ).toThrow(/database is locked/u);
      expect(
        sqliteB.prepare('SELECT count(*) AS count FROM adaptive_nutrition_goals').get(),
      ).toEqual({ count: 0 });
      sqliteA.exec('ROLLBACK');

      expect(
        backfillAdaptiveNutritionGoals(sqliteA, {
          now: () => new Date('2026-08-13T16:00:00.000Z'),
        }),
      ).toEqual({ created: 1, skipped: 0, blocked: 0 });
      expect(
        backfillAdaptiveNutritionGoals(sqliteB, {
          now: () => new Date('2026-08-13T16:00:00.000Z'),
        }),
      ).toEqual({ created: 0, skipped: 1, blocked: 0 });
      expect(
        sqliteA
          .prepare(
            `SELECT
               (SELECT count(*) FROM adaptive_nutrition_goals) AS goals,
               (SELECT count(*) FROM adaptive_nutrition_goal_revisions) AS revisions`,
          )
          .get(),
      ).toEqual({ goals: 1, revisions: 1 });
      expect(sqliteA.pragma('foreign_key_check')).toEqual([]);
    } finally {
      if (sqliteA.inTransaction) sqliteA.exec('ROLLBACK');
      sqliteB.close();
      sqliteA.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
