import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirs: string[] = [];

const runSqlStatements = (db: Database.Database, sqlContent: string) => {
  for (const statement of sqlContent
    .split('--> statement-breakpoint')
    .map((value) => value.trim())
    .filter(Boolean)) {
    db.exec(statement);
  }
};

const programSnapshot = (overrides: Record<string, unknown> = {}) => ({
  status: 'active',
  timeZone: 'America/Detroit',
  rmrEquation: 'manual_tdee',
  heightCm: null,
  birthDate: null,
  activityLevel: null,
  activityMultiplier: null,
  estimatedRmrKcal: null,
  calculatedBaselineTdeeKcal: null,
  manualBaselineTdeeKcal: 2500,
  baselineTdeeKcal: 2500,
  goalType: 'maintain',
  targetWeightKg: null,
  goalRatePctPerWeek: 0,
  proteinGrams: 180,
  fatAllocationPct: 30,
  systemCalorieFloorKcal: 1500,
  userCalorieFloorKcal: 1500,
  algorithmVersion: 'adaptive-tdee-v1',
  ...overrides,
});

describe('migration 0047_adaptive_program_revision_history', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('backfills causal immutable snapshots and permits only account-scoped deletion', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-program-history-'));
    tempDirs.push(tempDir);
    const db = new Database(join(tempDir, 'migration.db'));
    db.pragma('foreign_keys = ON');
    try {
      db.exec(`
        CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL);
        CREATE TABLE adaptive_nutrition_account_deletion_scope (
          user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE adaptive_nutrition_programs (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status TEXT NOT NULL,
          time_zone TEXT NOT NULL,
          height_cm REAL,
          birth_date TEXT,
          rmr_equation TEXT NOT NULL,
          activity_level TEXT,
          activity_multiplier REAL,
          estimated_rmr_kcal REAL,
          calculated_baseline_tdee_kcal REAL,
          manual_baseline_tdee_kcal REAL,
          baseline_tdee_kcal REAL NOT NULL,
          goal_type TEXT NOT NULL,
          target_weight_kg REAL,
          goal_rate_pct_per_week REAL NOT NULL,
          protein_grams INTEGER NOT NULL,
          fat_allocation_pct REAL NOT NULL,
          system_calorie_floor_kcal INTEGER NOT NULL,
          user_calorie_floor_kcal INTEGER NOT NULL,
          algorithm_version TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX adaptive_nutrition_programs_id_user_id_unique
          ON adaptive_nutrition_programs(id, user_id);
        CREATE TABLE adaptive_nutrition_checkins (
          id TEXT PRIMARY KEY NOT NULL,
          program_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          input_snapshot TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        INSERT INTO users (id) VALUES ('user-1'), ('user-2');
      `);
      const current = programSnapshot({
        status: 'paused',
        timeZone: 'Asia/Tokyo',
        manualBaselineTdeeKcal: 3200,
        baselineTdeeKcal: 3200,
      });
      const initial = programSnapshot();
      const insertProgram = db.prepare(`
        INSERT INTO adaptive_nutrition_programs (
          id, user_id, status, time_zone, height_cm, birth_date, rmr_equation,
          activity_level, activity_multiplier, estimated_rmr_kcal,
          calculated_baseline_tdee_kcal, manual_baseline_tdee_kcal, baseline_tdee_kcal,
          goal_type, target_weight_kg, goal_rate_pct_per_week, protein_grams,
          fat_allocation_pct, system_calorie_floor_kcal, user_calorie_floor_kcal,
          algorithm_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertProgram.run(
        'program-1',
        'user-1',
        current.status,
        current.timeZone,
        null,
        null,
        current.rmrEquation,
        null,
        null,
        null,
        null,
        current.manualBaselineTdeeKcal,
        current.baselineTdeeKcal,
        current.goalType,
        null,
        0,
        180,
        30,
        1500,
        1500,
        current.algorithmVersion,
        100,
        200,
      );
      insertProgram.run(
        'program-2',
        'user-2',
        'active',
        'America/Detroit',
        null,
        null,
        'manual_tdee',
        null,
        null,
        null,
        null,
        2200,
        2200,
        'maintain',
        null,
        0,
        170,
        30,
        1500,
        1500,
        'adaptive-tdee-v1',
        150,
        150,
      );
      db.prepare(
        `INSERT INTO adaptive_nutrition_checkins
          (id, program_id, user_id, input_snapshot, created_at) VALUES (?, ?, ?, ?, ?)`,
      ).run('checkin-initial', 'program-1', 'user-1', JSON.stringify({ program: initial }), 100);

      const migrationSql = readFileSync(
        join(process.cwd(), 'drizzle/0047_adaptive_program_revision_history.sql'),
        'utf8',
      );
      runSqlStatements(db, migrationSql);

      const revisions = db
        .prepare(
          `SELECT user_id AS userId, sequence, effective_at AS effectiveAt, snapshot
           FROM adaptive_nutrition_program_revisions
           WHERE program_id = 'program-1' ORDER BY sequence`,
        )
        .all() as Array<{
        userId: string;
        sequence: number;
        effectiveAt: number;
        snapshot: string;
      }>;
      expect(revisions.map(({ sequence, effectiveAt }) => ({ sequence, effectiveAt }))).toEqual([
        { sequence: 1, effectiveAt: 100 },
        { sequence: 2, effectiveAt: 200 },
      ]);
      expect(JSON.parse(revisions[0]?.snapshot ?? '{}')).toMatchObject({
        timeZone: 'America/Detroit',
        baselineTdeeKcal: 2500,
      });
      expect(JSON.parse(revisions[1]?.snapshot ?? '{}')).toMatchObject({
        timeZone: 'Asia/Tokyo',
        baselineTdeeKcal: 3200,
      });
      expect(
        db
          .prepare(
            `SELECT count(*) AS count FROM adaptive_nutrition_program_revisions
             WHERE program_id = 'program-2'`,
          )
          .get(),
      ).toEqual({ count: 2 });

      expect(() =>
        db.exec(
          `UPDATE adaptive_nutrition_program_revisions SET effective_at = 999
           WHERE program_id = 'program-1' AND sequence = 1`,
        ),
      ).toThrow('program revisions are immutable');
      expect(() =>
        db.exec(
          `DELETE FROM adaptive_nutrition_program_revisions
           WHERE program_id = 'program-1' AND sequence = 1`,
        ),
      ).toThrow('may only be deleted in account deletion scope');
      expect(() =>
        db.exec(`
          INSERT INTO adaptive_nutrition_program_revisions (
            id, program_id, user_id, sequence, effective_at, snapshot, source, created_at
          ) VALUES ('invalid', 'program-1', 'user-1', 3, 300, 'not-json', 'migration', 300)
        `),
      ).toThrow();
      expect(() =>
        db
          .prepare(
            `
            INSERT INTO adaptive_nutrition_program_revisions (
              id, program_id, user_id, sequence, effective_at, snapshot, source, created_at
            ) VALUES ('gap', 'program-1', 'user-1', 4, 300, ?, 'migration', 300)
          `,
          )
          .run(JSON.stringify(programSnapshot())),
      ).toThrow('next causal sequence');

      db.exec(`INSERT INTO adaptive_nutrition_account_deletion_scope (user_id) VALUES ('user-1')`);
      db.exec(`DELETE FROM adaptive_nutrition_programs WHERE id = 'program-1'`);
      expect(
        db
          .prepare(
            `SELECT count(*) AS count FROM adaptive_nutrition_program_revisions
             WHERE program_id = 'program-1'`,
          )
          .get(),
      ).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });
});
