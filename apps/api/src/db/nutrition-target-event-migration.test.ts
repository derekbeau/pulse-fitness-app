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

const seedAcceptedReplacement = (
  sqlite: Database.Database,
  valid = true,
  appliedProposalOverride?: unknown,
  timestamps: {
    programCreatedAt?: number;
    goalCreatedAt?: number;
    revisionCreatedAt?: number;
    checkInCreatedAt?: number;
    resolvedAt?: number;
    reviewCreatedAt?: number;
    actionCreatedAt?: number;
  } = {},
) => {
  const programCreatedAt = timestamps.programCreatedAt ?? 1;
  const goalCreatedAt = timestamps.goalCreatedAt ?? 1;
  const revisionCreatedAt = timestamps.revisionCreatedAt ?? 1;
  const checkInCreatedAt = timestamps.checkInCreatedAt ?? 150;
  const resolvedAt = timestamps.resolvedAt ?? 200;
  const reviewCreatedAt = timestamps.reviewCreatedAt ?? 175;
  const actionCreatedAt = timestamps.actionCreatedAt ?? resolvedAt;
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
        2500, 'maintain', 0, 180, 30, 1500, 1500, 'adaptive-tdee-v1', ?, ?)`,
    )
    .run(programCreatedAt, programCreatedAt);
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_goals (
        id, user_id, program_id, type, status, start_trend_weight_kg,
        start_scale_weight_kg, target_weight_kg, maintenance_center_kg,
        goal_rate_pct_per_week, started_local_date, created_at, updated_at
      ) VALUES ('goal-1', 'user-1', 'program-1', 'maintain', 'active', 80, 80,
        NULL, 80, 0, '2026-08-01', ?, ?)`,
    )
    .run(goalCreatedAt, goalCreatedAt);
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_goal_revisions (
        id, goal_id, user_id, sequence, target_weight_kg, maintenance_center_kg,
        goal_rate_pct_per_week, previous_target_weight_kg, previous_center_kg,
        previous_rate_pct_per_week, reason, effective_local_date, created_at
      ) VALUES ('goal-revision-1', 'goal-1', 'user-1', 1, NULL, 80, 0, NULL, 80,
        0, 'created', '2026-08-01', ?)`,
    )
    .run(revisionCreatedAt);
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
        'adaptive-tdee-v1', ?, '{}', '{}', '[]', ?, ?, 'target-1', ?, ?)`,
    )
    .run(
      'a'.repeat(64),
      JSON.stringify(manual),
      valid ? JSON.stringify(proposed) : '{}',
      resolvedAt,
      checkInCreatedAt,
    );
  sqlite
    .prepare(
      `INSERT INTO nutrition_targets (
        id, user_id, calories, protein, carbs, fat, source, adaptive_check_in_id,
        macro_calories, effective_date, created_at, updated_at
      ) VALUES ('target-1', 'user-1', 2250, 180, 242.5, 62, 'adaptive', 'check-in-1',
        2248, '2026-08-18', 100, ?)`,
    )
    .run(resolvedAt);
  if (valid) {
    sqlite
      .prepare(
        `INSERT INTO adaptive_nutrition_reviews (
          id, user_id, program_id, check_in_id, kind, review_version, source_fingerprint,
          review_local_date, analysis_start, analysis_end, time_zone, snapshot, created_at
        ) VALUES ('review-1', 'user-1', 'program-1', 'check-in-1', 'weekly', 1, ?,
          '2026-08-18', '2026-07-28', '2026-08-17', 'America/Detroit', '{}', ?)`,
      )
      .run('b'.repeat(64), reviewCreatedAt);
    sqlite
      .prepare(
        `INSERT INTO adaptive_nutrition_review_actions (
          id, review_id, user_id, sequence, type, payload, actor_type, actor_label, created_at
        ) VALUES ('action-1', 'review-1', 'user-1', 1, 'accept', ?, 'user', 'You', ?)`,
      )
      .run(
        JSON.stringify({
          type: 'accept',
          appliedProposal: appliedProposalOverride ?? applied,
        }),
        actionCreatedAt,
      );
  }
};

const makeAcceptedFixtureNonAccepted = (
  sqlite: Database.Database,
  status: 'pending' | 'held' | 'declined' | 'superseded',
) => {
  sqlite
    .prepare(
      `UPDATE adaptive_nutrition_checkins
       SET status = ?, accepted_nutrition_target_id = NULL
       WHERE id = 'check-in-1'`,
    )
    .run(status);
  sqlite
    .prepare(
      `UPDATE nutrition_targets
       SET calories = 2200, carbs = 230, macro_calories = 2198,
           source = 'manual', adaptive_check_in_id = NULL, updated_at = 100
       WHERE id = 'target-1'`,
    )
    .run();
};

type ManualSnapshot = {
  id: string;
  calories: number;
  carbs: number;
  updatedAt: number;
  acceptedAt: number;
  claimCreatedAt?: number;
  currentTargets?: unknown;
  rawCurrentTargets?: string;
};

const seedManualHistory = (
  sqlite: Database.Database,
  options: {
    createdAt: number;
    updatedAt: number;
    currentCalories: number;
    currentCarbs: number;
    snapshots?: ManualSnapshot[];
    beforeSnapshots?: (sqlite: Database.Database) => void;
  },
) => {
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
      `INSERT INTO nutrition_targets (
        id, user_id, calories, protein, carbs, fat, source, adaptive_check_in_id,
        macro_calories, effective_date, created_at, updated_at
      ) VALUES ('manual-target', 'user-1', ?, 180, ?, 62, 'manual', NULL, ?,
        '2026-08-18', ?, ?)`,
    )
    .run(
      options.currentCalories,
      options.currentCarbs,
      180 * 4 + options.currentCarbs * 4 + 62 * 9,
      options.createdAt,
      options.updatedAt,
    );

  options.beforeSnapshots?.(sqlite);

  for (const [index, snapshot] of (options.snapshots ?? []).entries()) {
    const acceptedTargetId = `accepted-target-${index + 1}`;
    const effectiveDate = `2026-08-${String(19 + index).padStart(2, '0')}`;
    const checkInId = snapshot.id;
    const defaultCurrentTargets = {
      id: 'manual-target',
      calories: snapshot.calories,
      protein: 180,
      carbs: snapshot.carbs,
      fat: 62,
      source: 'manual',
      adaptiveCheckInId: null,
      macroCalories: 180 * 4 + snapshot.carbs * 4 + 62 * 9,
      effectiveDate: '2026-08-18',
      createdAt: options.createdAt,
      updatedAt: snapshot.updatedAt,
    };
    const currentTargets = Object.prototype.hasOwnProperty.call(snapshot, 'currentTargets')
      ? snapshot.currentTargets
      : defaultCurrentTargets;
    const proposal = {
      calories: 2300 + index * 10,
      protein: 180,
      carbs: 255 + index * 2.5,
      fat: 62,
      effectiveDate,
    };
    sqlite
      .prepare(
        `INSERT INTO adaptive_nutrition_checkins (
          id, user_id, program_id, goal_id, goal_revision_id, kind, status,
          calculation_state, local_date, analysis_start, analysis_end, include_today,
          algorithm_version, data_fingerprint, input_snapshot, calculation_snapshot,
          reason_codes, current_targets, proposed_targets, accepted_nutrition_target_id,
          resolved_at, created_at
        ) VALUES (?, 'user-1', 'program-1', 'goal-1', 'goal-revision-1', 'weekly',
          'accepted', 'updating', ?, '2026-07-28', '2026-08-17', 0,
          'adaptive-tdee-v1', ?, '{}', '{}', '[]', ?, ?, ?, ?, ?)`,
      )
      .run(
        checkInId,
        effectiveDate,
        String(index + 1).repeat(64),
        snapshot.rawCurrentTargets ?? JSON.stringify(currentTargets),
        JSON.stringify(proposal),
        acceptedTargetId,
        snapshot.acceptedAt,
        snapshot.claimCreatedAt ?? snapshot.acceptedAt,
      );
    sqlite
      .prepare(
        `INSERT INTO nutrition_targets (
          id, user_id, calories, protein, carbs, fat, source, adaptive_check_in_id,
          macro_calories, effective_date, created_at, updated_at
        ) VALUES (?, 'user-1', ?, ?, ?, ?, 'adaptive', ?, ?, ?, ?, ?)`,
      )
      .run(
        acceptedTargetId,
        proposal.calories,
        proposal.protein,
        proposal.carbs,
        proposal.fat,
        checkInId,
        proposal.protein * 4 + proposal.carbs * 4 + proposal.fat * 9,
        proposal.effectiveDate,
        snapshot.acceptedAt,
        snapshot.acceptedAt,
      );
  }
};

const installedMigrationCount = (sqlite: Database.Database) =>
  (
    sqlite.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get() as {
      count: number;
    }
  ).count;

const legacyState = (sqlite: Database.Database) => ({
  migrationCount: installedMigrationCount(sqlite),
  users: sqlite.prepare('SELECT * FROM users ORDER BY id').all(),
  programs: sqlite.prepare('SELECT * FROM adaptive_nutrition_programs ORDER BY id').all(),
  goals: sqlite.prepare('SELECT * FROM adaptive_nutrition_goals ORDER BY id').all(),
  goalRevisions: sqlite
    .prepare('SELECT * FROM adaptive_nutrition_goal_revisions ORDER BY id')
    .all(),
  targets: sqlite.prepare('SELECT * FROM nutrition_targets ORDER BY id').all(),
  checkIns: sqlite.prepare('SELECT * FROM adaptive_nutrition_checkins ORDER BY id').all(),
  reviews: sqlite.prepare('SELECT * FROM adaptive_nutrition_reviews ORDER BY id').all(),
  actions: sqlite.prepare('SELECT * FROM adaptive_nutrition_review_actions ORDER BY id').all(),
});

const expectMigrationRollback = (
  sqlite: Database.Database,
  before: ReturnType<typeof legacyState>,
) => {
  expect(
    sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'nutrition_target_events'",
      )
      .get(),
  ).toBeUndefined();
  expect(installedMigrationCount(sqlite)).toBe(before.migrationCount);
  expect(sqlite.prepare('SELECT * FROM users ORDER BY id').all()).toEqual(before.users);
  expect(sqlite.prepare('SELECT * FROM adaptive_nutrition_programs ORDER BY id').all()).toEqual(
    before.programs,
  );
  expect(sqlite.prepare('SELECT * FROM adaptive_nutrition_goals ORDER BY id').all()).toEqual(
    before.goals,
  );
  expect(
    sqlite.prepare('SELECT * FROM adaptive_nutrition_goal_revisions ORDER BY id').all(),
  ).toEqual(before.goalRevisions);
  expect(sqlite.prepare('SELECT * FROM nutrition_targets ORDER BY id').all()).toEqual(
    before.targets,
  );
  expect(sqlite.prepare('SELECT * FROM adaptive_nutrition_checkins ORDER BY id').all()).toEqual(
    before.checkIns,
  );
  expect(sqlite.prepare('SELECT * FROM adaptive_nutrition_reviews ORDER BY id').all()).toEqual(
    before.reviews,
  );
  expect(
    sqlite.prepare('SELECT * FROM adaptive_nutrition_review_actions ORDER BY id').all(),
  ).toEqual(before.actions);
  expectHealthy(sqlite);
};

const manualTargetSnapshot = (
  overrides: Partial<{
    id: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    source: string;
    adaptiveCheckInId: string | null;
    macroCalories: number;
    effectiveDate: string;
    createdAt: number;
    updatedAt: number;
  }> = {},
) => ({
  id: 'manual-target',
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
  ...overrides,
});

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

  it('backfills one causally supported event for an untouched manual target', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-manual-untouched-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'untouched.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedManualHistory(sqlite, {
        createdAt: 100,
        updatedAt: 100,
        currentCalories: 2200,
        currentCarbs: 230,
      });

      migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder });

      expect(
        sqlite
          .prepare(
            `SELECT sequence, calories, source, adaptive_check_in_id AS adaptiveCheckInId,
                    recorded_at AS recordedAt
             FROM nutrition_target_events WHERE target_id = 'manual-target' ORDER BY sequence`,
          )
          .all(),
      ).toEqual([
        {
          sequence: 1,
          calories: 2200,
          source: 'manual',
          adaptiveCheckInId: null,
          recordedAt: 100,
        },
      ]);
      expectHealthy(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it('rolls back a mutated manual target with no exact predecessor snapshot', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-manual-invalid-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'invalid-manual.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedManualHistory(sqlite, {
        createdAt: 100,
        updatedAt: 200,
        currentCalories: 2100,
        currentCarbs: 205,
      });
      const targetBefore = sqlite
        .prepare("SELECT * FROM nutrition_targets WHERE id = 'manual-target'")
        .get();

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
      expect(
        sqlite.prepare("SELECT * FROM nutrition_targets WHERE id = 'manual-target'").get(),
      ).toEqual(targetBefore);
      expectHealthy(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it('recovers an initial manual snapshot before the current mutated manual state', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-manual-recovered-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'recovered-manual.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedManualHistory(sqlite, {
        createdAt: 100,
        updatedAt: 300,
        currentCalories: 2100,
        currentCarbs: 205,
        snapshots: [
          { id: 'check-in-a', calories: 2200, carbs: 230, updatedAt: 100, acceptedAt: 200 },
        ],
      });

      migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder });

      expect(
        sqlite
          .prepare(
            `SELECT sequence, calories, source, recorded_at AS recordedAt
             FROM nutrition_target_events WHERE target_id = 'manual-target' ORDER BY sequence`,
          )
          .all(),
      ).toEqual([
        { sequence: 1, calories: 2200, source: 'manual', recordedAt: 100 },
        { sequence: 2, calories: 2100, source: 'manual', recordedAt: 300 },
      ]);
      expectHealthy(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it('accepts predecessor snapshots captured before or at the claiming check-in creation time', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-causal-capture-valid-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'causal-capture-valid.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedManualHistory(sqlite, {
        createdAt: 100,
        updatedAt: 300,
        currentCalories: 2100,
        currentCarbs: 205,
        snapshots: [
          {
            id: 'check-in-before-capture',
            calories: 2200,
            carbs: 230,
            updatedAt: 100,
            claimCreatedAt: 150,
            acceptedAt: 175,
          },
          {
            id: 'check-in-equal-capture',
            calories: 2150,
            carbs: 217.5,
            updatedAt: 200,
            claimCreatedAt: 200,
            acceptedAt: 250,
          },
        ],
      });
      const migrationCountBefore = installedMigrationCount(sqlite);

      migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder });

      expect(installedMigrationCount(sqlite)).toBe(migrationCountBefore + 1);
      expect(
        sqlite
          .prepare(
            `SELECT sequence, calories, recorded_at AS recordedAt
             FROM nutrition_target_events WHERE target_id = 'manual-target' ORDER BY sequence`,
          )
          .all(),
      ).toEqual([
        { sequence: 1, calories: 2200, recordedAt: 100 },
        { sequence: 2, calories: 2150, recordedAt: 200 },
        { sequence: 3, calories: 2100, recordedAt: 300 },
      ]);
      expectHealthy(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it('rolls back a future-dated predecessor captured before that target state existed', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-future-claim-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'future-claim.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedManualHistory(sqlite, {
        createdAt: 100,
        updatedAt: 300,
        currentCalories: 2100,
        currentCarbs: 205,
        snapshots: [
          {
            id: 'check-in-initial',
            calories: 2200,
            carbs: 230,
            updatedAt: 100,
            claimCreatedAt: 125,
            acceptedAt: 140,
          },
          {
            id: 'check-in-impossible-middle',
            calories: 2150,
            carbs: 217.5,
            updatedAt: 200,
            claimCreatedAt: 150,
            acceptedAt: 250,
          },
        ],
      });
      const before = legacyState(sqlite);

      expect(() => migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder })).toThrow(
        /Failed to run the query|constraint/iu,
      );
      expectMigrationRollback(sqlite, before);
    } finally {
      sqlite.close();
    }
  });

  it('rolls back a predecessor claim made by a check-in with a nonpositive creation time', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-invalid-claim-time-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'invalid-claim-time.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedManualHistory(sqlite, {
        createdAt: 100,
        updatedAt: 100,
        currentCalories: 2200,
        currentCarbs: 230,
        snapshots: [
          {
            id: 'check-in-invalid-time',
            calories: 2200,
            carbs: 230,
            updatedAt: 100,
            claimCreatedAt: 0,
            acceptedAt: 150,
          },
        ],
      });
      const before = legacyState(sqlite);

      expect(() => migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder })).toThrow(
        /Failed to run the query|constraint/iu,
      );
      expectMigrationRollback(sqlite, before);
    } finally {
      sqlite.close();
    }
  });

  it('rejects an incomplete manual chain whose earliest immutable snapshot is already mutated', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-manual-incomplete-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'incomplete-manual.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedManualHistory(sqlite, {
        createdAt: 100,
        updatedAt: 300,
        currentCalories: 2050,
        currentCarbs: 192.5,
        snapshots: [
          { id: 'check-in-middle', calories: 2150, carbs: 217.5, updatedAt: 200, acceptedAt: 250 },
        ],
      });

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

  it('rolls back a valid initial and current state when the middle predecessor claim is malformed', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-malformed-middle-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'malformed-middle.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      const malformedMiddle = manualTargetSnapshot({
        calories: 2150,
        carbs: 217.5,
        macroCalories: 2148,
        updatedAt: 200,
      }) as Record<string, unknown>;
      delete malformedMiddle.macroCalories;
      seedManualHistory(sqlite, {
        createdAt: 100,
        updatedAt: 300,
        currentCalories: 2100,
        currentCarbs: 205,
        snapshots: [
          { id: 'check-in-initial', calories: 2200, carbs: 230, updatedAt: 100, acceptedAt: 150 },
          {
            id: 'check-in-middle',
            calories: 2150,
            carbs: 217.5,
            updatedAt: 200,
            acceptedAt: 250,
            currentTargets: malformedMiddle,
          },
        ],
      });
      const before = legacyState(sqlite);

      expect(() => migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder })).toThrow(
        /Failed to run the query|constraint/iu,
      );
      expectMigrationRollback(sqlite, before);
    } finally {
      sqlite.close();
    }
  });

  it.each([
    'id',
    'calories',
    'protein',
    'carbs',
    'fat',
    'macroCalories',
    'source',
    'adaptiveCheckInId',
    'effectiveDate',
    'createdAt',
    'updatedAt',
  ])('rolls back when an inventoried predecessor is missing required field %s', (field) => {
    const root = mkdtempSync(join(tmpdir(), `pulse-target-event-missing-${field}-`));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'missing-field.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      const snapshot = Object.fromEntries(
        Object.entries(manualTargetSnapshot()).filter(([key]) => key !== field),
      );
      seedManualHistory(sqlite, {
        createdAt: 100,
        updatedAt: 100,
        currentCalories: 2200,
        currentCarbs: 230,
        snapshots: [
          {
            id: 'check-in-invalid',
            calories: 2200,
            carbs: 230,
            updatedAt: 100,
            acceptedAt: 150,
            currentTargets: snapshot,
          },
        ],
      });
      const before = legacyState(sqlite);

      expect(() => migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder })).toThrow(
        /Failed to run the query|constraint/iu,
      );
      expectMigrationRollback(sqlite, before);
    } finally {
      sqlite.close();
    }
  });

  it.each([
    ['nonexistent target ID', manualTargetSnapshot({ id: 'missing-target' })],
    ['invalid macro arithmetic', manualTargetSnapshot({ macroCalories: 2197 })],
    ['updated timestamp outside target history', manualTargetSnapshot({ updatedAt: 101 })],
  ])('rolls back an inventoried predecessor with %s', (_label, snapshot) => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-invalid-claim-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'invalid-claim.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedManualHistory(sqlite, {
        createdAt: 100,
        updatedAt: 100,
        currentCalories: 2200,
        currentCarbs: 230,
        snapshots: [
          {
            id: 'check-in-invalid',
            calories: 2200,
            carbs: 230,
            updatedAt: 100,
            acceptedAt: 150,
            currentTargets: snapshot,
          },
        ],
      });
      const before = legacyState(sqlite);

      expect(() => migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder })).toThrow(
        /Failed to run the query|constraint/iu,
      );
      expectMigrationRollback(sqlite, before);
    } finally {
      sqlite.close();
    }
  });

  it('rolls back a predecessor snapshot that identifies a target owned by another user', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-cross-user-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'cross-user.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedManualHistory(sqlite, {
        createdAt: 100,
        updatedAt: 100,
        currentCalories: 2200,
        currentCarbs: 230,
        beforeSnapshots: (database) => {
          database
            .prepare(
              "INSERT INTO users (id, username, password_hash) VALUES ('user-2', 'user-2', 'hash')",
            )
            .run();
          database
            .prepare(
              `INSERT INTO nutrition_targets (
                id, user_id, calories, protein, carbs, fat, source, adaptive_check_in_id,
                macro_calories, effective_date, created_at, updated_at
              ) VALUES ('foreign-target', 'user-2', 2200, 180, 230, 62, 'manual', NULL,
                2198, '2026-08-18', 100, 100)`,
            )
            .run();
        },
        snapshots: [
          {
            id: 'check-in-invalid',
            calories: 2200,
            carbs: 230,
            updatedAt: 100,
            acceptedAt: 150,
            currentTargets: manualTargetSnapshot({ id: 'foreign-target' }),
          },
        ],
      });
      const before = legacyState(sqlite);

      expect(() => migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder })).toThrow(
        /Failed to run the query|constraint/iu,
      );
      expectMigrationRollback(sqlite, before);
    } finally {
      sqlite.close();
    }
  });

  it.each(['{not-json', '[]'])(
    'rolls back a malformed non-null predecessor that cannot identify a target: %s',
    (rawCurrentTargets) => {
      const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-malformed-json-'));
      temporaryDirectories.push(root);
      const sqlite = new Database(join(root, 'malformed-json.db'));
      sqlite.pragma('foreign_keys = ON');
      try {
        migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
        seedManualHistory(sqlite, {
          createdAt: 100,
          updatedAt: 100,
          currentCalories: 2200,
          currentCarbs: 230,
          snapshots: [
            {
              id: 'check-in-invalid',
              calories: 2200,
              carbs: 230,
              updatedAt: 100,
              acceptedAt: 150,
              rawCurrentTargets,
            },
          ],
        });
        const before = legacyState(sqlite);

        expect(() =>
          migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder }),
        ).toThrow(/Failed to run the query|constraint/iu);
        expectMigrationRollback(sqlite, before);
      } finally {
        sqlite.close();
      }
    },
  );

  it('keeps distinct equal-time manual snapshots in deterministic ID order', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-manual-equal-time-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'equal-time-manual.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedManualHistory(sqlite, {
        createdAt: 100,
        updatedAt: 300,
        currentCalories: 2050,
        currentCarbs: 192.5,
        snapshots: [
          { id: 'check-in-a', calories: 2200, carbs: 230, updatedAt: 100, acceptedAt: 200 },
          { id: 'check-in-b', calories: 2150, carbs: 217.5, updatedAt: 100, acceptedAt: 201 },
          { id: 'check-in-z', calories: 2200, carbs: 230, updatedAt: 100, acceptedAt: 202 },
        ],
      });

      const migrationCountBefore = installedMigrationCount(sqlite);
      migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder });
      expect(installedMigrationCount(sqlite)).toBe(migrationCountBefore + 1);

      expect(
        sqlite
          .prepare(
            `SELECT id, sequence, calories, recorded_at AS recordedAt
             FROM nutrition_target_events WHERE target_id = 'manual-target' ORDER BY sequence`,
          )
          .all(),
      ).toEqual([
        { id: 'migration-predecessor:check-in-a', sequence: 1, calories: 2200, recordedAt: 100 },
        { id: 'migration-predecessor:check-in-b', sequence: 2, calories: 2150, recordedAt: 100 },
        { id: 'migration-current:manual-target', sequence: 3, calories: 2050, recordedAt: 300 },
      ]);
      expectHealthy(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it('preserves manual-to-adaptive-to-manual history and resolves each causal cutoff', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-adaptive-manual-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'adaptive-manual.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedManualHistory(sqlite, {
        createdAt: 100,
        updatedAt: 300,
        currentCalories: 2100,
        currentCarbs: 205,
        snapshots: [
          {
            id: 'manual-predecessor',
            calories: 2200,
            carbs: 230,
            updatedAt: 100,
            acceptedAt: 150,
          },
        ],
      });
      const adaptiveProposal = {
        calories: 2250,
        protein: 180,
        carbs: 242.5,
        fat: 62,
        effectiveDate: '2026-08-18',
      };
      sqlite
        .prepare(
          `INSERT INTO adaptive_nutrition_checkins (
            id, user_id, program_id, goal_id, goal_revision_id, kind, status,
            calculation_state, local_date, analysis_start, analysis_end, include_today,
            algorithm_version, data_fingerprint, input_snapshot, calculation_snapshot,
            reason_codes, current_targets, proposed_targets, accepted_nutrition_target_id,
            resolved_at, created_at
          ) VALUES ('adaptive-first', 'user-1', 'program-1', 'goal-1', 'goal-revision-1',
            'weekly', 'accepted', 'updating', '2026-08-18', '2026-07-28', '2026-08-17',
            0, 'adaptive-tdee-v1', ?, '{}', '{}', '[]', NULL, ?, 'manual-target', 200, 200)`,
        )
        .run('f'.repeat(64), JSON.stringify(adaptiveProposal));

      migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder });

      const rows = sqlite
        .prepare(
          `SELECT sequence, calories, source, adaptive_check_in_id AS adaptiveCheckInId,
                  recorded_at AS recordedAt
           FROM nutrition_target_events WHERE target_id = 'manual-target' ORDER BY sequence`,
        )
        .all();
      expect(rows).toEqual([
        {
          sequence: 1,
          calories: 2200,
          source: 'manual',
          adaptiveCheckInId: null,
          recordedAt: 100,
        },
        {
          sequence: 2,
          calories: 2250,
          source: 'adaptive',
          adaptiveCheckInId: 'adaptive-first',
          recordedAt: 200,
        },
        {
          sequence: 3,
          calories: 2100,
          source: 'manual',
          adaptiveCheckInId: null,
          recordedAt: 300,
        },
      ]);
      const targetAt = (cutoff: number) =>
        sqlite
          .prepare(
            `SELECT calories, source, adaptive_check_in_id AS adaptiveCheckInId
             FROM nutrition_target_events
             WHERE target_id = 'manual-target' AND recorded_at <= ?
             ORDER BY sequence DESC LIMIT 1`,
          )
          .get(cutoff);
      expect(targetAt(200)).toEqual({
        calories: 2250,
        source: 'adaptive',
        adaptiveCheckInId: 'adaptive-first',
      });
      expect(targetAt(300)).toEqual({
        calories: 2100,
        source: 'manual',
        adaptiveCheckInId: null,
      });
      expectHealthy(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it('deduplicates predecessor claims while preserving adaptive-to-adaptive acceptance order', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-adaptive-chain-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'adaptive-chain.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedAcceptedReplacement(sqlite, true, undefined, {
        programCreatedAt: 25,
        goalCreatedAt: 40,
        revisionCreatedAt: 50,
        checkInCreatedAt: 150,
        reviewCreatedAt: 175,
        resolvedAt: 200,
        actionCreatedAt: 200,
      });
      const acceptedSnapshot = {
        id: 'target-1',
        calories: 2250,
        protein: 180,
        carbs: 242.5,
        fat: 62,
        source: 'adaptive',
        adaptiveCheckInId: 'check-in-1',
        macroCalories: 2248,
        effectiveDate: '2026-08-18',
        createdAt: 100,
        updatedAt: 200,
      };
      const secondProposal = {
        calories: 2300,
        protein: 180,
        carbs: 255,
        fat: 62,
        effectiveDate: '2026-08-18',
      };
      sqlite
        .prepare(
          `INSERT INTO adaptive_nutrition_checkins (
            id, user_id, program_id, goal_id, goal_revision_id, kind, status,
            calculation_state, local_date, analysis_start, analysis_end, include_today,
            algorithm_version, data_fingerprint, input_snapshot, calculation_snapshot,
            reason_codes, current_targets, proposed_targets, accepted_nutrition_target_id,
            resolved_at, created_at
          ) VALUES ('check-in-2', 'user-1', 'program-1', 'goal-1', 'goal-revision-1',
            'weekly', 'accepted', 'updating', '2026-08-19', '2026-07-29', '2026-08-18',
            0, 'adaptive-tdee-v1', ?, '{}', '{}', '[]', ?, ?, 'target-1', 300, 250)`,
        )
        .run('c'.repeat(64), JSON.stringify(acceptedSnapshot), JSON.stringify(secondProposal));
      sqlite
        .prepare(
          `UPDATE nutrition_targets
           SET calories = 2300, carbs = 255, macro_calories = 2298,
               source = 'adaptive', adaptive_check_in_id = 'check-in-2', updated_at = 300
           WHERE id = 'target-1'`,
        )
        .run();

      migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder });

      expect(
        sqlite
          .prepare(
            `SELECT id, sequence, calories, source,
                    adaptive_check_in_id AS adaptiveCheckInId, recorded_at AS recordedAt
             FROM nutrition_target_events WHERE target_id = 'target-1' ORDER BY sequence`,
          )
          .all(),
      ).toEqual([
        {
          id: 'migration-predecessor:check-in-1',
          sequence: 1,
          calories: 2200,
          source: 'manual',
          adaptiveCheckInId: null,
          recordedAt: 100,
        },
        {
          id: 'migration-accepted:check-in-1',
          sequence: 2,
          calories: 2250,
          source: 'adaptive',
          adaptiveCheckInId: 'check-in-1',
          recordedAt: 200,
        },
        {
          id: 'migration-accepted:check-in-2',
          sequence: 3,
          calories: 2300,
          source: 'adaptive',
          adaptiveCheckInId: 'check-in-2',
          recordedAt: 300,
        },
      ]);
      expect(
        sqlite
          .prepare(
            "SELECT count(*) AS count FROM nutrition_target_events WHERE id = 'migration-predecessor:check-in-2'",
          )
          .get(),
      ).toEqual({ count: 0 });
      expectHealthy(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it('rolls back an Adaptive predecessor accepted after the claiming check-in was created', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-future-adaptive-source-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'future-adaptive-source.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedAcceptedReplacement(sqlite);
      const acceptedSnapshot = {
        id: 'target-1',
        calories: 2250,
        protein: 180,
        carbs: 242.5,
        fat: 62,
        source: 'adaptive',
        adaptiveCheckInId: 'check-in-1',
        macroCalories: 2248,
        effectiveDate: '2026-08-18',
        createdAt: 100,
        updatedAt: 200,
      };
      const secondProposal = {
        calories: 2300,
        protein: 180,
        carbs: 255,
        fat: 62,
        effectiveDate: '2026-08-19',
      };
      sqlite
        .prepare(
          `INSERT INTO adaptive_nutrition_checkins (
            id, user_id, program_id, goal_id, goal_revision_id, kind, status,
            calculation_state, local_date, analysis_start, analysis_end, include_today,
            algorithm_version, data_fingerprint, input_snapshot, calculation_snapshot,
            reason_codes, current_targets, proposed_targets, accepted_nutrition_target_id,
            resolved_at, created_at
          ) VALUES ('check-in-future-source', 'user-1', 'program-1', 'goal-1',
            'goal-revision-1', 'weekly', 'accepted', 'updating', '2026-08-19',
            '2026-07-29', '2026-08-18', 0, 'adaptive-tdee-v1', ?, '{}', '{}', '[]',
            ?, ?, 'target-2', 300, 150)`,
        )
        .run('c'.repeat(64), JSON.stringify(acceptedSnapshot), JSON.stringify(secondProposal));
      sqlite
        .prepare(
          `INSERT INTO nutrition_targets (
            id, user_id, calories, protein, carbs, fat, source, adaptive_check_in_id,
            macro_calories, effective_date, created_at, updated_at
          ) VALUES ('target-2', 'user-1', 2300, 180, 255, 62, 'adaptive',
            'check-in-future-source', 2298, '2026-08-19', 300, 300)`,
        )
        .run();
      const before = legacyState(sqlite);

      expect(() => migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder })).toThrow(
        /Failed to run the query|constraint/iu,
      );
      expectMigrationRollback(sqlite, before);
    } finally {
      sqlite.close();
    }
  });

  it('rolls back an Adaptive predecessor whose source revision postdates source capture', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-invalid-adaptive-source-chain-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'invalid-adaptive-source-chain.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedAcceptedReplacement(sqlite, true, undefined, {
        programCreatedAt: 1,
        goalCreatedAt: 50,
        revisionCreatedAt: 175,
        checkInCreatedAt: 150,
        reviewCreatedAt: 180,
        resolvedAt: 200,
        actionCreatedAt: 200,
      });
      const acceptedSnapshot = {
        id: 'target-1',
        calories: 2250,
        protein: 180,
        carbs: 242.5,
        fat: 62,
        source: 'adaptive',
        adaptiveCheckInId: 'check-in-1',
        macroCalories: 2248,
        effectiveDate: '2026-08-18',
        createdAt: 100,
        updatedAt: 200,
      };
      const secondProposal = {
        calories: 2300,
        protein: 180,
        carbs: 255,
        fat: 62,
        effectiveDate: '2026-08-19',
      };
      sqlite
        .prepare(
          `INSERT INTO adaptive_nutrition_checkins (
            id, user_id, program_id, goal_id, goal_revision_id, kind, status,
            calculation_state, local_date, analysis_start, analysis_end, include_today,
            algorithm_version, data_fingerprint, input_snapshot, calculation_snapshot,
            reason_codes, current_targets, proposed_targets, accepted_nutrition_target_id,
            resolved_at, created_at
          ) VALUES ('check-in-2', 'user-1', 'program-1', 'goal-1', 'goal-revision-1',
            'weekly', 'accepted', 'updating', '2026-08-19', '2026-07-29', '2026-08-18',
            0, 'adaptive-tdee-v1', ?, '{}', '{}', '[]', ?, ?, 'target-2', 300, 250)`,
        )
        .run('c'.repeat(64), JSON.stringify(acceptedSnapshot), JSON.stringify(secondProposal));
      sqlite
        .prepare(
          `INSERT INTO nutrition_targets (
            id, user_id, calories, protein, carbs, fat, source, adaptive_check_in_id,
            macro_calories, effective_date, created_at, updated_at
          ) VALUES ('target-2', 'user-1', 2300, 180, 255, 62, 'adaptive', 'check-in-2',
            2298, '2026-08-19', 300, 300)`,
        )
        .run();
      const before = legacyState(sqlite);

      expect(() => migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder })).toThrow(
        /Failed to run the query|constraint/iu,
      );
      expectMigrationRollback(sqlite, before);
    } finally {
      sqlite.close();
    }
  });

  it('upgrades a populated real 0050 database with exact predecessor and edited acceptance facts', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-upgrade-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'upgrade.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedAcceptedReplacement(sqlite, true, undefined, {
        programCreatedAt: 25,
        goalCreatedAt: 40,
        revisionCreatedAt: 50,
        checkInCreatedAt: 150,
        reviewCreatedAt: 175,
        resolvedAt: 200,
        actionCreatedAt: 200,
      });
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

  it('preserves a valid legacy baseline check-in with no goal or revision', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-baseline-without-goal-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'baseline-without-goal.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 42) });
      sqlite
        .prepare(
          "INSERT INTO users (id, username, password_hash) VALUES ('user-1', 'user-1', 'hash')",
        )
        .run();
      sqlite
        .prepare(
          `INSERT INTO adaptive_nutrition_programs (
            id, user_id, status, time_zone, rmr_equation, manual_baseline_tdee_kcal,
            baseline_tdee_kcal, goal_type, goal_rate_pct_per_week, protein_grams,
            fat_allocation_pct, system_calorie_floor_kcal, user_calorie_floor_kcal,
            algorithm_version, created_at, updated_at
          ) VALUES ('program-1', 'user-1', 'active', 'America/Detroit', 'manual_tdee',
            2500, 2500, 'maintain', 0, 180, 30, 1500, 1500, 'adaptive-tdee-v1', 1, 1)`,
        )
        .run();
      sqlite
        .prepare(
          `INSERT INTO adaptive_nutrition_checkins (
            id, user_id, program_id, kind, status, calculation_state, local_date,
            analysis_start, analysis_end, include_today, algorithm_version, data_fingerprint,
            input_snapshot, calculation_snapshot, reason_codes, current_targets, proposed_targets,
            accepted_nutrition_target_id, resolved_at, created_at
          ) VALUES ('baseline-check-in', 'user-1', 'program-1', 'baseline', 'held',
            'baseline', '2026-08-18', NULL, NULL, 0, 'adaptive-tdee-v1', ?, '{}', '{}',
            '[]', NULL, NULL, NULL, 200, 150)`,
        )
        .run('d'.repeat(64));
      sqlite
        .prepare(
          `INSERT INTO nutrition_targets (
            id, user_id, calories, protein, carbs, fat, source, adaptive_check_in_id,
            macro_calories, effective_date, created_at, updated_at
          ) VALUES ('baseline-target', 'user-1', 2100, 180, 205, 62, 'manual',
            NULL, 2098, '2026-08-18', 200, 200)`,
        )
        .run();
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      expect(
        sqlite
          .prepare(
            `SELECT goal_id AS goalId, goal_revision_id AS goalRevisionId
             FROM adaptive_nutrition_checkins WHERE id = 'baseline-check-in'`,
          )
          .get(),
      ).toEqual({ goalId: null, goalRevisionId: null });
      const migrationCountBefore = installedMigrationCount(sqlite);

      migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder });

      expect(installedMigrationCount(sqlite)).toBe(migrationCountBefore + 1);
      expect(
        sqlite
          .prepare(
            `SELECT sequence, calories, source, adaptive_check_in_id AS adaptiveCheckInId,
                    recorded_at AS recordedAt
             FROM nutrition_target_events ORDER BY sequence`,
          )
          .all(),
      ).toEqual([
        {
          sequence: 1,
          calories: 2100,
          source: 'manual',
          adaptiveCheckInId: null,
          recordedAt: 200,
        },
      ]);
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

  it('excludes valid keep, decline, and defer actions from target-event construction', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-non-target-actions-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'non-target-actions.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedManualHistory(sqlite, {
        createdAt: 100,
        updatedAt: 100,
        currentCalories: 2200,
        currentCarbs: 230,
      });
      const fixtures = [
        {
          id: 'keep',
          status: 'declined',
          createdAt: 150,
          resolvedAt: 200,
          reviewCreatedAt: 175,
          actionCreatedAt: 200,
          actionType: 'accept',
          payload: { type: 'accept', appliedProposal: null },
        },
        {
          id: 'decline',
          status: 'declined',
          createdAt: 160,
          resolvedAt: 210,
          reviewCreatedAt: 185,
          actionCreatedAt: 210,
          actionType: 'decline',
          payload: { type: 'decline', reason: 'Keep the current plan' },
        },
        {
          id: 'defer',
          status: 'pending',
          createdAt: 200,
          resolvedAt: null,
          reviewCreatedAt: 215,
          actionCreatedAt: 220,
          actionType: 'defer',
          payload: {
            type: 'defer',
            reason: 'Wait for more evidence',
            condition: { kind: 'until_date', localDate: '2026-08-25' },
          },
        },
      ] as const;
      for (const [index, fixture] of fixtures.entries()) {
        const checkInId = `check-in-${fixture.id}`;
        const reviewId = `review-${fixture.id}`;
        sqlite
          .prepare(
            `INSERT INTO adaptive_nutrition_checkins (
              id, user_id, program_id, goal_id, goal_revision_id, kind, status,
              calculation_state, local_date, analysis_start, analysis_end, include_today,
              algorithm_version, data_fingerprint, input_snapshot, calculation_snapshot,
              reason_codes, current_targets, proposed_targets, accepted_nutrition_target_id,
              resolved_at, created_at
            ) VALUES (?, 'user-1', 'program-1', 'goal-1', 'goal-revision-1', 'weekly', ?,
              'updating', ?, '2026-07-28', '2026-08-17', 0, 'adaptive-tdee-v1', ?,
              '{}', '{}', '[]', NULL, NULL, NULL, ?, ?)`,
          )
          .run(
            checkInId,
            fixture.status,
            `2026-08-${String(18 + index).padStart(2, '0')}`,
            String(index + 4).repeat(64),
            fixture.resolvedAt,
            fixture.createdAt,
          );
        sqlite
          .prepare(
            `INSERT INTO adaptive_nutrition_reviews (
              id, user_id, program_id, check_in_id, kind, review_version, source_fingerprint,
              review_local_date, analysis_start, analysis_end, time_zone, snapshot, created_at
            ) VALUES (?, 'user-1', 'program-1', ?, 'weekly', 1, ?, ?, '2026-07-28',
              '2026-08-17', 'America/Detroit', '{}', ?)`,
          )
          .run(
            reviewId,
            checkInId,
            String(index + 7).repeat(64),
            `2026-08-${String(18 + index).padStart(2, '0')}`,
            fixture.reviewCreatedAt,
          );
        sqlite
          .prepare(
            `INSERT INTO adaptive_nutrition_review_actions (
              id, review_id, user_id, sequence, type, payload, actor_type, actor_label, created_at
            ) VALUES (?, ?, 'user-1', 1, ?, ?, 'user', 'You', ?)`,
          )
          .run(
            `action-${fixture.id}`,
            reviewId,
            fixture.actionType,
            JSON.stringify(fixture.payload),
            fixture.actionCreatedAt,
          );
      }

      const migrationCountBefore = installedMigrationCount(sqlite);
      migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder });

      expect(installedMigrationCount(sqlite)).toBe(migrationCountBefore + 1);
      expect(
        sqlite
          .prepare(
            `SELECT sequence, calories, source, adaptive_check_in_id AS adaptiveCheckInId
             FROM nutrition_target_events ORDER BY sequence`,
          )
          .all(),
      ).toEqual([{ sequence: 1, calories: 2200, source: 'manual', adaptiveCheckInId: null }]);
      expectHealthy(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it('rolls back when an accepted review action carries a malformed applied proposal', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-invalid-action-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'invalid-action.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedAcceptedReplacement(sqlite, true, {
        calories: 2250,
        protein: 180,
        fat: 62,
        effectiveDate: '2026-08-18',
      });
      const before = legacyState(sqlite);

      expect(() => migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder })).toThrow(
        /Failed to run the query|constraint/iu,
      );
      expectMigrationRollback(sqlite, before);
    } finally {
      sqlite.close();
    }
  });

  it.each(['pending', 'held', 'declined', 'superseded'] as const)(
    'rolls back a target-bearing accept action attached to a %s check-in',
    (status) => {
      const root = mkdtempSync(join(tmpdir(), `pulse-target-event-${status}-accept-action-`));
      temporaryDirectories.push(root);
      const sqlite = new Database(join(root, `${status}-accept-action.db`));
      sqlite.pragma('foreign_keys = ON');
      try {
        migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
        seedAcceptedReplacement(sqlite);
        makeAcceptedFixtureNonAccepted(sqlite, status);
        const before = legacyState(sqlite);

        expect(() =>
          migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder }),
        ).toThrow(/Failed to run the query|constraint/iu);
        expectMigrationRollback(sqlite, before);
      } finally {
        sqlite.close();
      }
    },
  );

  it('rolls back a target-bearing accept action whose accepted check-in has no target', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-accept-missing-target-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'accept-missing-target.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedAcceptedReplacement(sqlite);
      sqlite
        .prepare(
          `UPDATE adaptive_nutrition_checkins
           SET accepted_nutrition_target_id = NULL
           WHERE id = 'check-in-1'`,
        )
        .run();
      sqlite
        .prepare(
          `UPDATE nutrition_targets
           SET calories = 2200, carbs = 230, macro_calories = 2198,
               source = 'manual', adaptive_check_in_id = NULL, updated_at = 100
           WHERE id = 'target-1'`,
        )
        .run();
      const before = legacyState(sqlite);

      expect(() => migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder })).toThrow(
        /Failed to run the query|constraint/iu,
      );
      expectMigrationRollback(sqlite, before);
    } finally {
      sqlite.close();
    }
  });

  it('rolls back a target-bearing accept action whose check-in names a mismatched target', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-accept-mismatched-target-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'accept-mismatched-target.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedAcceptedReplacement(sqlite);
      sqlite
        .prepare(
          `UPDATE nutrition_targets
           SET calories = 2200, carbs = 230, macro_calories = 2198,
               source = 'manual', adaptive_check_in_id = NULL, updated_at = 100
           WHERE id = 'target-1'`,
        )
        .run();
      sqlite
        .prepare(
          `INSERT INTO nutrition_targets (
            id, user_id, calories, protein, carbs, fat, source, adaptive_check_in_id,
            macro_calories, effective_date, created_at, updated_at
          ) VALUES ('target-2', 'user-1', 2100, 180, 205, 62, 'manual', NULL,
            2098, '2026-08-19', 100, 200)`,
        )
        .run();
      sqlite
        .prepare(
          `UPDATE adaptive_nutrition_checkins
           SET accepted_nutrition_target_id = 'target-2'
           WHERE id = 'check-in-1'`,
        )
        .run();
      const before = legacyState(sqlite);

      expect(() => migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder })).toThrow(
        /Failed to run the query|constraint/iu,
      );
      expectMigrationRollback(sqlite, before);
    } finally {
      sqlite.close();
    }
  });

  it('relies on real 0050 foreign keys to reject orphaned and cross-user action chains', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-action-ownership-fk-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'action-ownership-fk.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedAcceptedReplacement(sqlite);
      sqlite
        .prepare(
          "INSERT INTO users (id, username, password_hash) VALUES ('user-2', 'user-2', 'hash')",
        )
        .run();
      sqlite
        .prepare(
          `INSERT INTO adaptive_nutrition_reviews (
            id, user_id, program_id, check_in_id, kind, review_version, source_fingerprint,
            review_local_date, analysis_start, analysis_end, time_zone, snapshot, created_at
          ) VALUES ('review-ownership-probe', 'user-1', 'program-1', 'check-in-1', 'weekly',
            1, ?, '2026-08-18', '2026-07-28', '2026-08-17', 'America/Detroit', '{}', 175)`,
        )
        .run('e'.repeat(64));
      const actionPayload = JSON.stringify({
        type: 'accept',
        appliedProposal: {
          calories: 2250,
          protein: 180,
          carbs: 242.5,
          fat: 62,
          effectiveDate: '2026-08-18',
        },
      });

      expect(() =>
        sqlite
          .prepare(
            `INSERT INTO adaptive_nutrition_review_actions (
              id, review_id, user_id, sequence, type, payload, actor_type, actor_label, created_at
            ) VALUES ('orphan-action', 'missing-review', 'user-1', 1, 'accept', ?,
              'user', 'You', 200)`,
          )
          .run(actionPayload),
      ).toThrow(/foreign key/iu);
      expect(() =>
        sqlite
          .prepare(
            `INSERT INTO adaptive_nutrition_review_actions (
              id, review_id, user_id, sequence, type, payload, actor_type, actor_label, created_at
            ) VALUES ('cross-user-action', 'review-ownership-probe', 'user-2', 1, 'accept', ?,
              'user', 'You', 200)`,
          )
          .run(actionPayload),
      ).toThrow(/foreign key/iu);
      expectHealthy(sqlite);

      migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder });
      expectHealthy(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it('relies on real 0050 composite ownership to reject a revision from another goal and user', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-revision-ownership-fk-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'revision-ownership-fk.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedAcceptedReplacement(sqlite);
      sqlite
        .prepare(
          "INSERT INTO users (id, username, password_hash) VALUES ('user-2', 'user-2', 'hash')",
        )
        .run();
      sqlite
        .prepare(
          `INSERT INTO adaptive_nutrition_programs (
            id, user_id, status, time_zone, rmr_equation, manual_baseline_tdee_kcal,
            baseline_tdee_kcal, goal_type, goal_rate_pct_per_week, protein_grams,
            fat_allocation_pct, system_calorie_floor_kcal, user_calorie_floor_kcal,
            algorithm_version, created_at, updated_at
          ) VALUES ('program-2', 'user-2', 'active', 'America/Detroit', 'manual_tdee', 2500,
            2500, 'maintain', 0, 180, 30, 1500, 1500, 'adaptive-tdee-v1', 1, 1)`,
        )
        .run();
      sqlite
        .prepare(
          `INSERT INTO adaptive_nutrition_goals (
            id, user_id, program_id, type, status, start_trend_weight_kg,
            start_scale_weight_kg, target_weight_kg, maintenance_center_kg,
            goal_rate_pct_per_week, started_local_date, created_at, updated_at
          ) VALUES ('goal-2', 'user-2', 'program-2', 'maintain', 'active', 80, 80,
            NULL, 80, 0, '2026-08-01', 1, 1)`,
        )
        .run();
      sqlite
        .prepare(
          `INSERT INTO adaptive_nutrition_goal_revisions (
            id, goal_id, user_id, sequence, target_weight_kg, maintenance_center_kg,
            goal_rate_pct_per_week, previous_target_weight_kg, previous_center_kg,
            previous_rate_pct_per_week, reason, effective_local_date, created_at
          ) VALUES ('goal-revision-2', 'goal-2', 'user-2', 1, NULL, 80, 0, NULL, 80,
            0, 'created', '2026-08-01', 1)`,
        )
        .run();

      expect(() =>
        sqlite
          .prepare(
            `INSERT INTO adaptive_nutrition_checkins (
              id, user_id, program_id, goal_id, goal_revision_id, kind, status,
              calculation_state, local_date, analysis_start, analysis_end, include_today,
              algorithm_version, data_fingerprint, input_snapshot, calculation_snapshot,
              reason_codes, current_targets, proposed_targets, accepted_nutrition_target_id,
              resolved_at, created_at
            ) VALUES ('cross-goal-check-in', 'user-1', 'program-1', 'goal-1',
              'goal-revision-2', 'weekly', 'held', 'holding', '2026-08-20',
              '2026-07-30', '2026-08-19', 0, 'adaptive-tdee-v1', ?, '{}', '{}', '[]',
              NULL, NULL, NULL, 250, 200)`,
          )
          .run('f'.repeat(64)),
      ).toThrow(/foreign key/iu);
      expectHealthy(sqlite);

      migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder });
      expectHealthy(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it.each([
    [
      'goal creation predates its program',
      { programCreatedAt: 100, goalCreatedAt: 50, revisionCreatedAt: 75 },
    ],
    [
      'goal revision creation predates its goal',
      { programCreatedAt: 1, goalCreatedAt: 100, revisionCreatedAt: 50 },
    ],
    [
      'goal revision creation follows check-in capture',
      {
        programCreatedAt: 1,
        goalCreatedAt: 50,
        revisionCreatedAt: 175,
        checkInCreatedAt: 150,
      },
    ],
  ])('rolls back when %s', (_label, timestamps) => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-invalid-goal-chain-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'invalid-goal-chain.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedAcceptedReplacement(sqlite, true, undefined, timestamps);
      const before = legacyState(sqlite);

      expect(() => migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder })).toThrow(
        /Failed to run the query|constraint/iu,
      );
      expectMigrationRollback(sqlite, before);
    } finally {
      sqlite.close();
    }
  });

  it.each([
    [
      'review creation precedes its check-in',
      { checkInCreatedAt: 150, resolvedAt: 200, reviewCreatedAt: 140, actionCreatedAt: 200 },
    ],
    [
      'accept action creation precedes its review',
      { checkInCreatedAt: 150, resolvedAt: 160, reviewCreatedAt: 175, actionCreatedAt: 160 },
    ],
  ])('rolls back when %s', (_label, timestamps) => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-target-event-invalid-review-time-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'invalid-review-time.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 50) });
      seedAcceptedReplacement(sqlite, true, undefined, timestamps);
      const before = legacyState(sqlite);

      expect(() => migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder })).toThrow(
        /Failed to run the query|constraint/iu,
      );
      expectMigrationRollback(sqlite, before);
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
