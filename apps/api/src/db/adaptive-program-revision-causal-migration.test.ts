import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it } from 'vitest';

import * as schema from './schema/index.js';
import { createAdaptiveAnalyticsStore } from '../routes/adaptive-nutrition/analytics-store.js';

const sourceMigrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
const tempDirs: string[] = [];

type MigrationJournal = {
  version: string;
  dialect: string;
  entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }>;
};

const stageMigrationsThrough = (root: string, maximumIndex: number) => {
  const destination = join(root, `through-${maximumIndex}`);
  mkdirSync(join(destination, 'meta'), { recursive: true });
  const journal = JSON.parse(
    readFileSync(join(sourceMigrationsFolder, 'meta/_journal.json'), 'utf8'),
  ) as MigrationJournal;
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

const seedLegacyProgram = (
  sqlite: Database.Database,
  options: {
    userId: string;
    programId: string;
    createdAt: number;
    updatedAt: number;
    snapshot?: ReturnType<typeof programSnapshot>;
  },
) => {
  const snapshot = options.snapshot ?? programSnapshot();
  sqlite
    .prepare(
      `INSERT INTO users (id, username, password_hash)
       VALUES (?, ?, 'migration-test-hash')`,
    )
    .run(options.userId, options.userId);
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_programs (
        id, user_id, status, time_zone, height_cm, birth_date, rmr_equation,
        activity_level, activity_multiplier, estimated_rmr_kcal,
        calculated_baseline_tdee_kcal, manual_baseline_tdee_kcal, baseline_tdee_kcal,
        goal_type, target_weight_kg, goal_rate_pct_per_week, protein_grams,
        fat_allocation_pct, system_calorie_floor_kcal, user_calorie_floor_kcal,
        algorithm_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, NULL, NULL, ?, NULL, NULL, NULL, NULL, ?, ?, ?, NULL, 0, 180,
        30, 1500, 1500, ?, ?, ?)`,
    )
    .run(
      options.programId,
      options.userId,
      snapshot.status,
      snapshot.timeZone,
      snapshot.rmrEquation,
      snapshot.manualBaselineTdeeKcal,
      snapshot.baselineTdeeKcal,
      snapshot.goalType,
      snapshot.algorithmVersion,
      options.createdAt,
      options.updatedAt,
    );
};

const seedLegacyCheckIn = (
  sqlite: Database.Database,
  options: {
    id: string;
    userId: string;
    programId: string;
    localDate: string;
    createdAt: number;
    snapshot: ReturnType<typeof programSnapshot>;
  },
) =>
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_checkins (
        id, user_id, program_id, goal_id, goal_revision_id,
        kind, status, calculation_state, local_date,
        analysis_start, analysis_end, include_today, algorithm_version, data_fingerprint,
        input_snapshot, calculation_snapshot, reason_codes, created_at
      ) VALUES (?, ?, ?, ?, ?, 'manual', 'declined', 'learning', ?, NULL, NULL, 0,
        'adaptive-tdee-v1', ?, ?, '{}', '[]', ?)`,
    )
    .run(
      options.id,
      options.userId,
      options.programId,
      `${options.programId}-goal`,
      `${options.programId}-goal-revision`,
      options.localDate,
      options.id === 'legacy-initial' ? 'a'.repeat(64) : 'b'.repeat(64),
      JSON.stringify({ program: options.snapshot }),
      options.createdAt,
    );

const seedLegacyGoal = (
  sqlite: Database.Database,
  options: { userId: string; programId: string; createdAt: number },
) => {
  const goalId = `${options.programId}-goal`;
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_goals (
        id, user_id, program_id, type, status, start_trend_weight_kg,
        start_scale_weight_kg, target_weight_kg, maintenance_center_kg,
        goal_rate_pct_per_week, started_local_date, created_at, updated_at
      ) VALUES (?, ?, ?, 'maintain', 'active', 80, 80, NULL, 80, 0,
        '2026-08-01', ?, ?)`,
    )
    .run(goalId, options.userId, options.programId, options.createdAt, options.createdAt);
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_goal_revisions (
        id, goal_id, user_id, sequence, target_weight_kg, maintenance_center_kg,
        goal_rate_pct_per_week, previous_target_weight_kg, previous_center_kg,
        previous_rate_pct_per_week, reason, effective_local_date, created_at
      ) VALUES (?, ?, ?, 1, NULL, 80, 0, NULL, 80, 0, 'created', '2026-08-01', ?)`,
    )
    .run(`${options.programId}-goal-revision`, goalId, options.userId, options.createdAt);
};

const insertRevision = (
  sqlite: Database.Database,
  options: {
    id: string;
    programId: string;
    userId: string;
    sequence: number;
    effectiveAt: number;
  },
) =>
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_program_revisions (
        id, program_id, user_id, sequence, effective_at, snapshot, source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'migration', ?)`,
    )
    .run(
      options.id,
      options.programId,
      options.userId,
      options.sequence,
      options.effectiveAt,
      JSON.stringify(programSnapshot()),
      options.effectiveAt,
    );

const expectHealthyDatabase = (sqlite: Database.Database) => {
  expect(sqlite.pragma('foreign_key_check')).toEqual([]);
  expect(sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
};

describe('adaptive program revision causal migration', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const directory = tempDirs.pop();
      if (directory) rmSync(directory, { recursive: true, force: true });
    }
  });

  it('upgrades a real 0046 database and repairs an already-applied 0047 ledger', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-program-causal-upgrade-'));
    tempDirs.push(root);
    const through0046 = stageMigrationsThrough(root, 46);
    const through0047 = stageMigrationsThrough(root, 47);
    const sqlite = new Database(join(root, 'upgrade.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      const db = drizzle(sqlite, { schema });
      migrate(db, { migrationsFolder: through0046 });

      const august1 = Date.parse('2026-08-01T12:00:00.000Z');
      const august2 = Date.parse('2026-08-02T12:00:00.000Z');
      const august3 = Date.parse('2026-08-03T12:00:00.000Z');
      seedLegacyProgram(sqlite, {
        userId: 'analytics-user',
        programId: 'analytics-program',
        createdAt: august1,
        updatedAt: august1,
      });
      seedLegacyProgram(sqlite, {
        userId: 'history-user',
        programId: 'history-program',
        createdAt: august1,
        updatedAt: august2,
        snapshot: programSnapshot({
          status: 'paused',
          timeZone: 'Asia/Tokyo',
          manualBaselineTdeeKcal: 3200,
          baselineTdeeKcal: 3200,
        }),
      });
      seedLegacyGoal(sqlite, {
        userId: 'history-user',
        programId: 'history-program',
        createdAt: august1,
      });
      seedLegacyCheckIn(sqlite, {
        id: 'legacy-initial',
        userId: 'history-user',
        programId: 'history-program',
        localDate: '2026-08-01',
        createdAt: august1,
        snapshot: programSnapshot(),
      });
      seedLegacyCheckIn(sqlite, {
        id: 'legacy-later',
        userId: 'history-user',
        programId: 'history-program',
        localDate: '2026-08-03',
        createdAt: august3,
        snapshot: programSnapshot({ timeZone: 'America/Los_Angeles' }),
      });

      migrate(db, { migrationsFolder: through0047 });
      expect(
        sqlite
          .prepare(
            `SELECT sequence, effective_at AS effectiveAt
             FROM adaptive_nutrition_program_revisions
             WHERE program_id = 'history-program' ORDER BY sequence`,
          )
          .all(),
      ).toEqual([
        { sequence: 1, effectiveAt: august1 },
        { sequence: 2, effectiveAt: august3 },
        { sequence: 3, effectiveAt: august2 },
      ]);
      insertRevision(sqlite, {
        id: 'old-guard-backdate',
        programId: 'history-program',
        userId: 'history-user',
        sequence: 4,
        effectiveAt: august1,
      });

      migrate(db, { migrationsFolder: sourceMigrationsFolder });
      expect(
        sqlite
          .prepare(
            `SELECT sequence, effective_at AS effectiveAt
             FROM adaptive_nutrition_program_revisions
             WHERE program_id = 'history-program' ORDER BY sequence`,
          )
          .all(),
      ).toEqual([
        { sequence: 1, effectiveAt: august1 },
        { sequence: 2, effectiveAt: august3 },
        { sequence: 3, effectiveAt: august3 },
        { sequence: 4, effectiveAt: august3 },
      ]);
      expectHealthyDatabase(sqlite);

      const analytics = createAdaptiveAnalyticsStore({
        db,
        now: () => new Date('2026-08-10T12:00:00.000Z'),
      }).getAnalytics('analytics-user', {
        range: '1m',
        end: '2026-08-05',
        aggregation: 'daily',
      });
      expect(analytics).toMatchObject({
        timeZone: 'America/Detroit',
        isHistorical: true,
        current: { adaptiveTdeeKcal: 2500 },
      });

      insertRevision(sqlite, {
        id: 'equal-time',
        programId: 'history-program',
        userId: 'history-user',
        sequence: 5,
        effectiveAt: august3,
      });
      expect(() =>
        insertRevision(sqlite, {
          id: 'backdated',
          programId: 'history-program',
          userId: 'history-user',
          sequence: 6,
          effectiveAt: august2,
        }),
      ).toThrow('nondecreasing effective_at');
      expect(() =>
        insertRevision(sqlite, {
          id: 'gap',
          programId: 'history-program',
          userId: 'history-user',
          sequence: 7,
          effectiveAt: august3 + 1,
        }),
      ).toThrow('next causal sequence');
      expect(() =>
        sqlite.exec(
          `UPDATE adaptive_nutrition_program_revisions SET effective_at = ${august3 + 1}
           WHERE id = 'equal-time'`,
        ),
      ).toThrow('program revisions are immutable');
      expect(() =>
        sqlite.exec(`DELETE FROM adaptive_nutrition_program_revisions WHERE id = 'equal-time'`),
      ).toThrow('may only be deleted in account deletion scope');

      sqlite.exec(
        `INSERT INTO adaptive_nutrition_account_deletion_scope (user_id) VALUES ('history-user')`,
      );
      sqlite.exec(`DELETE FROM adaptive_nutrition_programs WHERE id = 'history-program'`);
      expect(
        sqlite
          .prepare(
            `SELECT count(*) AS count FROM adaptive_nutrition_program_revisions
             WHERE program_id = 'history-program'`,
          )
          .get(),
      ).toEqual({ count: 0 });
      expectHealthyDatabase(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it('installs the complete journal with the causal trigger on a fresh database', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-program-causal-fresh-'));
    tempDirs.push(root);
    const sqlite = new Database(join(root, 'fresh.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite, { schema }), { migrationsFolder: sourceMigrationsFolder });
      expectHealthyDatabase(sqlite);
      expect(
        sqlite
          .prepare(
            `SELECT name FROM sqlite_master
             WHERE type = 'trigger'
               AND name = 'adaptive_nutrition_program_revisions_insert_effective_at_guard'`,
          )
          .get(),
      ).toEqual({ name: 'adaptive_nutrition_program_revisions_insert_effective_at_guard' });

      seedLegacyProgram(sqlite, {
        userId: 'fresh-user',
        programId: 'fresh-program',
        createdAt: 100,
        updatedAt: 100,
      });
      insertRevision(sqlite, {
        id: 'fresh-1',
        programId: 'fresh-program',
        userId: 'fresh-user',
        sequence: 1,
        effectiveAt: 100,
      });
      insertRevision(sqlite, {
        id: 'fresh-2',
        programId: 'fresh-program',
        userId: 'fresh-user',
        sequence: 2,
        effectiveAt: 100,
      });
      expect(() =>
        insertRevision(sqlite, {
          id: 'fresh-backdated',
          programId: 'fresh-program',
          userId: 'fresh-user',
          sequence: 3,
          effectiveAt: 99,
        }),
      ).toThrow('nondecreasing effective_at');
      expectHealthyDatabase(sqlite);
    } finally {
      sqlite.close();
    }
  });
});
