import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, expect, it } from 'vitest';

import { backfillAdaptiveNutritionGoals } from './adaptive-goal-backfill.js';

const drizzleFolder = join(process.cwd(), 'drizzle');
const migrationSql = readFileSync(join(drizzleFolder, '0043_adaptive_goal_strategy.sql'), 'utf8');
const originalFinalQaMigrationPath = join(drizzleFolder, '0044_adaptive_goal_final_qa.sql');
const historyRepairMigrationPath = join(drizzleFolder, '0045_adaptive_goal_history_repair.sql');
const ORIGINAL_FINAL_QA_WHEN = 1786682400000;
const HISTORY_REPAIR_WHEN = 1786686000000;

const runSqlStatements = (sqlite: Database.Database, sqlContent: string) => {
  for (const statement of sqlContent
    .split('--> statement-breakpoint')
    .map((value) => value.trim())
    .filter(Boolean)) {
    sqlite.exec(statement);
  }
};

const stageMigrationFolder = (includeRepair: boolean) => {
  const folder = mkdtempSync(join(tmpdir(), 'pulse-adaptive-migrations-'));
  mkdirSync(join(folder, 'meta'));
  copyFileSync(originalFinalQaMigrationPath, join(folder, '0044_adaptive_goal_final_qa.sql'));
  const entries = [
    {
      idx: 44,
      version: '6',
      when: ORIGINAL_FINAL_QA_WHEN,
      tag: '0044_adaptive_goal_final_qa',
      breakpoints: true,
    },
  ];
  if (includeRepair) {
    copyFileSync(historyRepairMigrationPath, join(folder, '0045_adaptive_goal_history_repair.sql'));
    entries.push({
      idx: 45,
      version: '6',
      when: HISTORY_REPAIR_WHEN,
      tag: '0045_adaptive_goal_history_repair',
      breakpoints: true,
    });
  }
  writeFileSync(
    join(folder, 'meta/_journal.json'),
    JSON.stringify({ version: '7', dialect: 'sqlite', entries }),
  );
  return folder;
};

const migrateThroughOriginal0044 = (sqlite: Database.Database) => {
  const folder = stageMigrationFolder(false);
  try {
    migrate(drizzle(sqlite), { migrationsFolder: folder });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
};

const migrateStaged0044And0045 = (sqlite: Database.Database) => {
  const folder = stageMigrationFolder(true);
  try {
    migrate(drizzle(sqlite), { migrationsFolder: folder });
  } finally {
    rmSync(folder, { recursive: true, force: true });
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

const createLegacy0043Database = () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE adaptive_nutrition_account_deletion_scope (user_id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE adaptive_nutrition_programs (
      id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL,
      UNIQUE(id, user_id)
    );
    CREATE TABLE adaptive_nutrition_goals (
      id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, program_id TEXT NOT NULL,
      type TEXT NOT NULL, status TEXT NOT NULL, start_trend_weight_kg REAL NOT NULL,
      start_scale_weight_kg REAL, target_weight_kg REAL, maintenance_center_kg REAL,
      goal_rate_pct_per_week REAL NOT NULL, started_local_date TEXT NOT NULL,
      ended_local_date TEXT, ended_reason TEXT, created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, UNIQUE(id, user_id)
    );
    CREATE TABLE adaptive_nutrition_goal_revisions (
      id TEXT PRIMARY KEY NOT NULL, goal_id TEXT NOT NULL, user_id TEXT NOT NULL,
      sequence INTEGER NOT NULL, target_weight_kg REAL, maintenance_center_kg REAL,
      goal_rate_pct_per_week REAL NOT NULL, previous_target_weight_kg REAL,
      previous_center_kg REAL, previous_rate_pct_per_week REAL NOT NULL,
      reason TEXT NOT NULL, effective_local_date TEXT NOT NULL, created_at INTEGER NOT NULL,
      UNIQUE(goal_id, sequence)
    );
    CREATE TABLE adaptive_nutrition_checkins (
      id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, program_id TEXT NOT NULL,
      goal_id TEXT, status TEXT NOT NULL, calculation_snapshot TEXT NOT NULL,
      resolved_at INTEGER, created_at INTEGER NOT NULL
    );
    CREATE TRIGGER adaptive_nutrition_goals_immutable_fields_guard
      BEFORE UPDATE ON adaptive_nutrition_goals
      BEGIN SELECT RAISE(ABORT, 'closed goals and goal progress origins are immutable'); END;
  `);
  return sqlite;
};

describe('adaptive goal strategy migrations', () => {
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

  it('runs ordered 0045 after recorded original 0044 and skips both on rerun', () => {
    const sqlite = createLegacy0043Database();
    try {
      sqlite.exec(`
        INSERT INTO users VALUES ('legacy-user'), ('cancelled-user');
        INSERT INTO adaptive_nutrition_programs VALUES
          ('legacy-program', 'legacy-user'), ('cancelled-program', 'cancelled-user');
        INSERT INTO adaptive_nutrition_goals VALUES (
          'completed-goal', 'legacy-user', 'legacy-program', 'lose', 'completed', 82, 82.1,
          78, NULL, -0.5, '2026-07-01', '2026-08-01', 'completed', 100, 200
        ), (
          'maintenance-goal', 'legacy-user', 'legacy-program', 'maintain', 'replaced', 78.4,
          78.5, NULL, 78, 0, '2026-08-01', '2026-08-15', 'direction_changed', 200, 300
        ), (
          'gain-goal', 'legacy-user', 'legacy-program', 'gain', 'active', 78, 78.1,
          85, NULL, 0.25, '2026-08-15', NULL, NULL, 300, 300
        ), (
          'cancelled-goal', 'cancelled-user', 'cancelled-program', 'lose', 'cancelled', 80,
          80.1, 75, NULL, -0.5, '2026-07-01', '2026-08-10', 'cancelled', 100, 400
        );
        INSERT INTO adaptive_nutrition_goal_revisions VALUES
          ('completed-revision', 'completed-goal', 'legacy-user', 1, 78, NULL, -0.5,
           78, NULL, -0.5, 'created', '2026-07-01', 100),
          ('maintenance-revision', 'maintenance-goal', 'legacy-user', 1, NULL, 78, 0,
           NULL, 78, 0, 'goal_completion', '2026-08-01', 200),
          ('gain-revision', 'gain-goal', 'legacy-user', 1, 85, NULL, 0.25,
           85, NULL, 0.25, 'created', '2026-08-15', 300),
          ('cancelled-revision', 'cancelled-goal', 'cancelled-user', 1, 75, NULL, -0.5,
           75, NULL, -0.5, 'created', '2026-07-01', 100);
        INSERT INTO adaptive_nutrition_checkins VALUES
          ('completion-checkin', 'legacy-user', 'legacy-program', 'completed-goal', 'accepted',
           '{"latestTrendWeightKg":78.4,"goal":{"goalReached":true}}', 190, 180),
          ('cancellation-checkin', 'cancelled-user', 'cancelled-program', 'cancelled-goal',
           'accepted', '{"latestTrendWeightKg":77.5,"goal":{"goalReached":false}}', 400, 390);
      `);

      migrateThroughOriginal0044(sqlite);

      const expectedOriginalHash = createHash('sha256')
        .update(readFileSync(originalFinalQaMigrationPath, 'utf8'))
        .digest('hex');
      expect(
        sqlite.prepare('SELECT hash, created_at AS createdAt FROM __drizzle_migrations').all(),
      ).toEqual([{ hash: expectedOriginalHash, createdAt: ORIGINAL_FINAL_QA_WHEN }]);
      expect(
        sqlite
          .prepare(
            "SELECT final_trend_weight_kg AS finalTrendWeightKg FROM adaptive_nutrition_goals WHERE id = 'maintenance-goal'",
          )
          .get(),
      ).toEqual({ finalTrendWeightKg: 78.4 });
      expect(
        sqlite.prepare('SELECT count(*) AS count FROM adaptive_nutrition_goal_completions').get(),
      ).toEqual({ count: 0 });

      migrateStaged0044And0045(sqlite);

      expect(sqlite.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get()).toEqual({
        count: 2,
      });

      expect(
        sqlite
          .prepare(
            `SELECT id, final_trend_weight_kg AS finalTrendWeightKg
             FROM adaptive_nutrition_goals WHERE status <> 'active' ORDER BY id`,
          )
          .all(),
      ).toEqual([
        { id: 'cancelled-goal', finalTrendWeightKg: 77.5 },
        { id: 'completed-goal', finalTrendWeightKg: 78.4 },
        { id: 'maintenance-goal', finalTrendWeightKg: 78 },
      ]);
      expect(
        sqlite
          .prepare(
            `SELECT check_in_id AS checkInId, completed_goal_id AS completedGoalId,
                    maintenance_goal_id AS maintenanceGoalId, created_at AS createdAt
             FROM adaptive_nutrition_goal_completions`,
          )
          .get(),
      ).toEqual({
        checkInId: 'completion-checkin',
        completedGoalId: 'completed-goal',
        maintenanceGoalId: 'maintenance-goal',
        createdAt: 200,
      });
      migrateStaged0044And0045(sqlite);
      expect(sqlite.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get()).toEqual({
        count: 2,
      });
      expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it('leaves an ambiguous legacy completion explicitly unlinked', () => {
    const sqlite = createLegacy0043Database();
    try {
      sqlite.exec(`
        INSERT INTO users VALUES ('legacy-user');
        INSERT INTO adaptive_nutrition_programs VALUES ('legacy-program', 'legacy-user');
        INSERT INTO adaptive_nutrition_goals VALUES
          ('completed-goal', 'legacy-user', 'legacy-program', 'lose', 'completed', 82, 82.1,
           78, NULL, -0.5, '2026-07-01', '2026-08-01', 'completed', 100, 200),
          ('maintenance-goal', 'legacy-user', 'legacy-program', 'maintain', 'active', 78.4,
           78.5, NULL, 78, 0, '2026-08-01', NULL, NULL, 200, 200);
        INSERT INTO adaptive_nutrition_goal_revisions VALUES
          ('completed-revision', 'completed-goal', 'legacy-user', 1, 78, NULL, -0.5,
           78, NULL, -0.5, 'created', '2026-07-01', 100),
          ('maintenance-revision', 'maintenance-goal', 'legacy-user', 1, NULL, 78, 0,
           NULL, 78, 0, 'goal_completion', '2026-08-01', 200);
        INSERT INTO adaptive_nutrition_checkins VALUES
          ('reached-a', 'legacy-user', 'legacy-program', 'completed-goal', 'accepted',
           '{"latestTrendWeightKg":78.4,"goal":{"goalReached":true}}', 180, 170),
          ('reached-b', 'legacy-user', 'legacy-program', 'completed-goal', 'accepted',
           '{"latestTrendWeightKg":78.4,"goal":{"goalReached":true}}', 190, 180);
      `);

      migrateThroughOriginal0044(sqlite);
      migrateStaged0044And0045(sqlite);

      expect(
        sqlite
          .prepare(
            "SELECT final_trend_weight_kg AS finalTrendWeightKg FROM adaptive_nutrition_goals WHERE id = 'completed-goal'",
          )
          .get(),
      ).toEqual({ finalTrendWeightKg: 78.4 });
      expect(
        sqlite.prepare('SELECT count(*) AS count FROM adaptive_nutrition_goal_completions').get(),
      ).toEqual({ count: 0 });
    } finally {
      sqlite.close();
    }
  });

  it('uses the unique canonical trend from same-timestamp replacement successors', () => {
    const sqlite = createLegacy0043Database();
    try {
      sqlite.exec(`
        INSERT INTO users VALUES ('legacy-user');
        INSERT INTO adaptive_nutrition_programs VALUES ('legacy-program', 'legacy-user');
        INSERT INTO adaptive_nutrition_goals VALUES
          ('replaced-goal', 'legacy-user', 'legacy-program', 'lose', 'replaced', 82, 82.1,
           78, NULL, -0.5, '2026-07-01', '2026-08-01', 'direction_changed', 100, 200),
          ('successor-a', 'legacy-user', 'legacy-program', 'gain', 'replaced',
           81.80240426231752, 81.9, 85, NULL, 0.25, '2026-08-01', '2026-08-01',
           'direction_changed', 200, 200),
          ('successor-b', 'legacy-user', 'legacy-program', 'maintain', 'active',
           81.80240426231752, 81.9, NULL, 81.80240426231752, 0, '2026-08-01',
           NULL, NULL, 200, 200);
        INSERT INTO adaptive_nutrition_goal_revisions VALUES
          ('replaced-revision', 'replaced-goal', 'legacy-user', 1, 78, NULL, -0.5,
           78, NULL, -0.5, 'created', '2026-07-01', 100),
          ('successor-a-revision', 'successor-a', 'legacy-user', 1, 85, NULL, 0.25,
           85, NULL, 0.25, 'created', '2026-08-01', 200),
          ('successor-b-revision', 'successor-b', 'legacy-user', 1, NULL,
           81.80240426231752, 0, NULL, 81.80240426231752, 0, 'created',
           '2026-08-01', 200);
      `);

      migrateThroughOriginal0044(sqlite);
      migrateStaged0044And0045(sqlite);

      expect(
        sqlite
          .prepare(
            "SELECT final_trend_weight_kg AS finalTrendWeightKg FROM adaptive_nutrition_goals WHERE id = 'replaced-goal'",
          )
          .get(),
      ).toEqual({ finalTrendWeightKg: 81.80240426231752 });
      expect(sqlite.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get()).toEqual({
        count: 2,
      });
    } finally {
      sqlite.close();
    }
  });

  it('fails closed when a replaced goal has ambiguous successor origins', () => {
    const sqlite = createLegacy0043Database();
    try {
      sqlite.exec(`
        INSERT INTO users VALUES ('legacy-user');
        INSERT INTO adaptive_nutrition_programs VALUES ('legacy-program', 'legacy-user');
        INSERT INTO adaptive_nutrition_goals VALUES
          ('replaced-goal', 'legacy-user', 'legacy-program', 'lose', 'replaced', 82, 82.1,
           78, NULL, -0.5, '2026-07-01', '2026-08-01', 'direction_changed', 100, 200),
          ('successor-a', 'legacy-user', 'legacy-program', 'gain', 'active', 78.4, 78.5,
           85, NULL, 0.25, '2026-08-01', NULL, NULL, 200, 200),
          ('successor-b', 'legacy-user', 'legacy-program', 'maintain', 'active', 78.5, 78.5,
           NULL, 78.5, 0, '2026-08-01', NULL, NULL, 200, 200);
        INSERT INTO adaptive_nutrition_goal_revisions VALUES
          ('replaced-revision', 'replaced-goal', 'legacy-user', 1, 78, NULL, -0.5,
           78, NULL, -0.5, 'created', '2026-07-01', 100),
          ('successor-a-revision', 'successor-a', 'legacy-user', 1, 85, NULL, 0.25,
           85, NULL, 0.25, 'created', '2026-08-01', 200),
          ('successor-b-revision', 'successor-b', 'legacy-user', 1, NULL, 78.5, 0,
           NULL, 78.5, 0, 'created', '2026-08-01', 200);
      `);

      migrateThroughOriginal0044(sqlite);
      expect(() => migrateStaged0044And0045(sqlite)).toThrow(/blocked_rows/u);
      expect(sqlite.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get()).toEqual({
        count: 1,
      });
      expect(
        sqlite
          .prepare(
            "SELECT final_trend_weight_kg AS finalTrendWeightKg FROM adaptive_nutrition_goals WHERE id = 'replaced-goal'",
          )
          .get(),
      ).toEqual({ finalTrendWeightKg: 82 });
      expect(
        sqlite
          .prepare(
            "SELECT count(*) AS count FROM sqlite_master WHERE type = 'trigger' AND name IN ('adaptive_nutrition_goals_immutable_fields_guard', 'adaptive_nutrition_goal_completions_insert_guard')",
          )
          .get(),
      ).toEqual({ count: 2 });
      expect(
        sqlite
          .prepare(
            "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = '__adaptive_goal_final_trend_backfill_guard'",
          )
          .get(),
      ).toEqual({ count: 0 });
    } finally {
      if (sqlite.inTransaction) sqlite.exec('ROLLBACK');
      sqlite.close();
    }
  });

  it('fails closed and rolls back when no unique canonical closing trend can be reconstructed', () => {
    const sqlite = createLegacy0043Database();
    try {
      sqlite.exec(`
        INSERT INTO users VALUES ('legacy-user');
        INSERT INTO adaptive_nutrition_programs VALUES ('legacy-program', 'legacy-user');
        INSERT INTO adaptive_nutrition_goals VALUES (
          'cancelled-goal', 'legacy-user', 'legacy-program', 'lose', 'cancelled', 82, 82.1,
          78, NULL, -0.5, '2026-07-01', '2026-08-01', 'cancelled', 100, 200
        );
        INSERT INTO adaptive_nutrition_goal_revisions VALUES (
          'cancelled-revision', 'cancelled-goal', 'legacy-user', 1, 78, NULL, -0.5,
          78, NULL, -0.5, 'created', '2026-07-01', 100
        );
      `);

      migrateThroughOriginal0044(sqlite);
      expect(() => migrateStaged0044And0045(sqlite)).toThrow(/blocked_rows/u);
      expect(sqlite.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get()).toEqual({
        count: 1,
      });
      expect(
        sqlite
          .prepare(
            "SELECT final_trend_weight_kg AS finalTrendWeightKg FROM adaptive_nutrition_goals WHERE id = 'cancelled-goal'",
          )
          .get(),
      ).toEqual({ finalTrendWeightKg: 82 });
    } finally {
      if (sqlite.inTransaction) sqlite.exec('ROLLBACK');
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
              target_weight_kg, goal_rate_pct_per_week, started_local_date,
              ended_local_date, ended_reason, created_at, updated_at)
             VALUES ('closed-without-final', 'z-fault', 'program-z-fault', 'gain', 'cancelled',
                     80, 90, 0.25, '2026-08-01', '2026-08-13', 'cancelled', 1, 2)`,
          )
          .run(),
      ).toThrow(/closed goals require them/u);
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
      ).toThrow(/matching next strategy revision|FOREIGN KEY constraint failed/u);
    } finally {
      sqlite.close();
    }
  });

  it('makes the database apply exactly one matching next strategy revision', () => {
    const sqlite = migrateFresh();
    try {
      seedUser(sqlite, 'sql-guard');
      seedProgram(sqlite, 'sql-guard', 'lose', 70, -0.5);
      seedWeight(sqlite, 'sql-guard', '2026-08-13', 80);
      expect(
        backfillAdaptiveNutritionGoals(sqlite, {
          now: () => new Date('2026-08-13T16:00:00.000Z'),
        }),
      ).toEqual({ created: 1, skipped: 0, blocked: 0 });
      const goal = sqlite
        .prepare(
          `SELECT id, target_weight_kg AS targetWeightKg,
                  goal_rate_pct_per_week AS rate
           FROM adaptive_nutrition_goals WHERE user_id = 'sql-guard'`,
        )
        .get() as { id: string; targetWeightKg: number; rate: number };

      expect(() =>
        sqlite
          .prepare(
            `UPDATE adaptive_nutrition_goals
             SET target_weight_kg = 69, goal_rate_pct_per_week = -0.4
             WHERE id = ?`,
          )
          .run(goal.id),
      ).toThrow(/exactly one matching next revision/u);
      expect(() =>
        sqlite
          .prepare(
            `INSERT INTO adaptive_nutrition_goal_revisions
             (id, goal_id, user_id, sequence, target_weight_kg, goal_rate_pct_per_week,
              previous_target_weight_kg, previous_rate_pct_per_week, reason,
              effective_local_date, created_at)
             VALUES ('bad-next', ?, 'sql-guard', 2, 69, -0.4, 71, -0.5,
                     'user_edit', '2026-08-14', 2)`,
          )
          .run(goal.id),
      ).toThrow(/matching next strategy revision/u);

      sqlite
        .prepare(
          `INSERT INTO adaptive_nutrition_goal_revisions
           (id, goal_id, user_id, sequence, target_weight_kg, goal_rate_pct_per_week,
            previous_target_weight_kg, previous_rate_pct_per_week, reason,
            effective_local_date, created_at)
           VALUES ('valid-next', ?, 'sql-guard', 2, 69, -0.4, 70, -0.5,
                   'user_edit', '2026-08-14', 2)`,
        )
        .run(goal.id);

      expect(
        sqlite
          .prepare(
            `SELECT target_weight_kg AS targetWeightKg,
                    goal_rate_pct_per_week AS rate
             FROM adaptive_nutrition_goals WHERE id = ?`,
          )
          .get(goal.id),
      ).toEqual({ targetWeightKg: 69, rate: -0.4 });
      expect(
        sqlite
          .prepare(
            `SELECT count(*) AS count
             FROM adaptive_nutrition_goal_revisions WHERE goal_id = ?`,
          )
          .get(goal.id),
      ).toEqual({ count: 2 });
      expect(() =>
        sqlite
          .prepare(
            `UPDATE adaptive_nutrition_goals
             SET target_weight_kg = 68 WHERE id = ?`,
          )
          .run(goal.id),
      ).toThrow(/exactly one matching next revision/u);

      seedUser(sqlite, 'sql-maintenance-guard');
      seedProgram(sqlite, 'sql-maintenance-guard', 'maintain', null, 0);
      seedWeight(sqlite, 'sql-maintenance-guard', '2026-08-13', 80);
      expect(
        backfillAdaptiveNutritionGoals(sqlite, {
          now: () => new Date('2026-08-13T16:00:01.000Z'),
        }),
      ).toEqual({ created: 1, skipped: 1, blocked: 0 });
      const maintenanceGoal = sqlite
        .prepare(
          `SELECT id, maintenance_center_kg AS centerWeightKg
           FROM adaptive_nutrition_goals WHERE user_id = 'sql-maintenance-guard'`,
        )
        .get() as { id: string; centerWeightKg: number };
      expect(() =>
        sqlite
          .prepare(
            `UPDATE adaptive_nutrition_goals
             SET maintenance_center_kg = 81 WHERE id = ?`,
          )
          .run(maintenanceGoal.id),
      ).toThrow(/exactly one matching next revision/u);
      sqlite
        .prepare(
          `INSERT INTO adaptive_nutrition_goal_revisions
           (id, goal_id, user_id, sequence, maintenance_center_kg, goal_rate_pct_per_week,
            previous_center_kg, previous_rate_pct_per_week, reason,
            effective_local_date, created_at)
           VALUES ('valid-maintenance-next', ?, 'sql-maintenance-guard', 2, 81, 0, ?, 0,
                   'user_edit', '2026-08-14', 3)`,
        )
        .run(maintenanceGoal.id, maintenanceGoal.centerWeightKg);
      expect(
        sqlite
          .prepare(
            `SELECT maintenance_center_kg AS centerWeightKg
             FROM adaptive_nutrition_goals WHERE id = ?`,
          )
          .get(maintenanceGoal.id),
      ).toEqual({ centerWeightKg: 81 });
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
