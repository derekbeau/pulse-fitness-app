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

const seedLegacyRows = (sqlite: Database.Database, suffix = '') => {
  const userId = `review-user${suffix}`;
  const programId = `review-program${suffix}`;
  const checkInId = `review-check-in${suffix}`;
  const goalId = `review-goal${suffix}`;
  const goalRevisionId = `review-goal-revision${suffix}`;
  sqlite
    .prepare(`INSERT INTO users (id, username, password_hash) VALUES (?, ?, 'hash')`)
    .run(userId, userId);
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_programs (
        id, user_id, status, time_zone, rmr_equation, manual_baseline_tdee_kcal,
        baseline_tdee_kcal, goal_type, goal_rate_pct_per_week, protein_grams,
        fat_allocation_pct, system_calorie_floor_kcal, user_calorie_floor_kcal,
        algorithm_version, created_at, updated_at
      ) VALUES (?, ?, 'active', 'America/Detroit', 'manual_tdee', 2500, 2500,
        'maintain', 0, 180, 30, 1500, 1500, 'adaptive-tdee-v1', 1, 1)`,
    )
    .run(programId, userId);
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_goals (
        id, user_id, program_id, type, status, start_trend_weight_kg,
        start_scale_weight_kg, target_weight_kg, maintenance_center_kg,
        goal_rate_pct_per_week, started_local_date, created_at, updated_at
      ) VALUES (?, ?, ?, 'maintain', 'active', 80, 80, NULL, 80, 0,
        '2026-08-01', 1, 1)`,
    )
    .run(goalId, userId, programId);
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_goal_revisions (
        id, goal_id, user_id, sequence, target_weight_kg, maintenance_center_kg,
        goal_rate_pct_per_week, previous_target_weight_kg, previous_center_kg,
        previous_rate_pct_per_week, reason, effective_local_date, created_at
      ) VALUES (?, ?, ?, 1, NULL, 80, 0, NULL, 80, 0, 'created', '2026-08-01', 1)`,
    )
    .run(goalRevisionId, goalId, userId);
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_checkins (
        id, user_id, program_id, goal_id, goal_revision_id, kind, status, calculation_state, local_date,
        analysis_start, analysis_end, include_today, algorithm_version, data_fingerprint,
        input_snapshot, calculation_snapshot, reason_codes, created_at
      ) VALUES (?, ?, ?, ?, ?, 'weekly', 'declined', 'updating', '2026-08-18',
        '2026-07-29', '2026-08-17', 0, 'adaptive-tdee-v1', ?, '{}', '{}', '[]', 2)`,
    )
    .run(checkInId, userId, programId, goalId, goalRevisionId, 'a'.repeat(64));
  sqlite
    .prepare(
      `INSERT INTO nutrition_targets (
        id, user_id, calories, protein, carbs, fat, source, adaptive_check_in_id,
        macro_calories, effective_date, created_at, updated_at
      ) VALUES (?, ?, 2500, 180, 260, 82.222222, 'manual', NULL, 2500,
        '2026-08-18', 2, 2)`,
    )
    .run(`review-target${suffix}`, userId);
  return { userId, programId, checkInId };
};

const insertReviewDomainRows = (
  sqlite: Database.Database,
  ids: { userId: string; programId: string; checkInId: string },
) => {
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_review_contexts (
        id, user_id, program_id, subject_type, subject, category, note, resolution,
        created_by, agent_token_id, actor_label, revision, created_at, updated_at, deleted_at
      ) VALUES ('context-1', ?, ?, 'date', '{"kind":"date","localDate":"2026-08-17"}',
        'illness', 'Sick day', NULL, 'user', NULL, 'You', 1, 3, 3, NULL)`,
    )
    .run(ids.userId, ids.programId);
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_reviews (
        id, user_id, program_id, check_in_id, kind, review_version, source_fingerprint,
        review_local_date, analysis_start, analysis_end, time_zone, snapshot, created_at
      ) VALUES ('review-1', ?, ?, ?, 'weekly', 1, ?, '2026-08-18', '2026-07-29',
        '2026-08-17', 'America/Detroit', '{}', 4)`,
    )
    .run(ids.userId, ids.programId, ids.checkInId, 'b'.repeat(64));
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_review_actions (
        id, review_id, user_id, sequence, type, payload, actor_type, agent_token_id,
        actor_label, created_at
      ) VALUES ('action-1', 'review-1', ?, 1, 'ask_agent', '{"type":"ask_agent"}',
        'user', NULL, 'You', 5)`,
    )
    .run(ids.userId);
};

const expectHealthy = (sqlite: Database.Database) => {
  expect(sqlite.pragma('foreign_key_check')).toEqual([]);
  expect(sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
};

const expectBehavioralHistoryGuards = (sqlite: Database.Database, userId: string) => {
  expect(() =>
    sqlite
      .prepare(
        `UPDATE adaptive_nutrition_review_contexts
         SET subject = '{"kind":"date","localDate":"2026-08-16"}', revision = 2, updated_at = 6
         WHERE id = 'context-1'`,
      )
      .run(),
  ).toThrow(/revision history/iu);
  expect(() =>
    sqlite
      .prepare(
        `UPDATE adaptive_nutrition_review_contexts
         SET actor_label = 'Rewritten actor', revision = 2, updated_at = 6
         WHERE id = 'context-1'`,
      )
      .run(),
  ).toThrow(/revision history/iu);
  expect(() =>
    sqlite
      .prepare(
        `UPDATE adaptive_nutrition_review_contexts
         SET note = 'Skipped revision', revision = 3, updated_at = 6
         WHERE id = 'context-1'`,
      )
      .run(),
  ).toThrow(/revision history/iu);

  sqlite
    .prepare(
      `UPDATE adaptive_nutrition_review_contexts
       SET note = 'Confirmed sick day', resolution = 'No follow-up needed', revision = 2, updated_at = 6
       WHERE id = 'context-1'`,
    )
    .run();
  expect(
    sqlite
      .prepare(
        `SELECT subject, actor_label AS actorLabel, note, resolution, revision, deleted_at AS deletedAt
         FROM adaptive_nutrition_review_contexts WHERE id = 'context-1'`,
      )
      .get(),
  ).toEqual({
    subject: '{"kind":"date","localDate":"2026-08-17"}',
    actorLabel: 'You',
    note: 'Confirmed sick day',
    resolution: 'No follow-up needed',
    revision: 2,
    deletedAt: null,
  });

  sqlite
    .prepare(
      `UPDATE adaptive_nutrition_review_contexts
       SET revision = 3, updated_at = 7, deleted_at = 7
       WHERE id = 'context-1'`,
    )
    .run();
  expect(() =>
    sqlite
      .prepare(
        `UPDATE adaptive_nutrition_review_contexts
         SET note = 'Edited after deletion', revision = 4, updated_at = 8
         WHERE id = 'context-1'`,
      )
      .run(),
  ).toThrow(/revision history/iu);
  expect(() =>
    sqlite.prepare("DELETE FROM adaptive_nutrition_review_contexts WHERE id = 'context-1'").run(),
  ).toThrow(/account deletion scope/iu);

  expect(() =>
    sqlite
      .prepare(
        "UPDATE adaptive_nutrition_review_actions SET actor_label = 'Rewritten' WHERE id = 'action-1'",
      )
      .run(),
  ).toThrow(/immutable/iu);
  expect(() =>
    sqlite.prepare("DELETE FROM adaptive_nutrition_review_actions WHERE id = 'action-1'").run(),
  ).toThrow(/account deletion scope/iu);
  sqlite
    .prepare(
      `INSERT INTO adaptive_nutrition_review_actions (
        id, review_id, user_id, sequence, type, payload, actor_type, actor_label, created_at
      ) VALUES ('action-terminal', 'review-1', ?, 2, 'decline', '{"type":"decline"}', 'user', 'You', 8)`,
    )
    .run(userId);
  expect(() =>
    sqlite
      .prepare(
        `INSERT INTO adaptive_nutrition_review_actions (
          id, review_id, user_id, sequence, type, payload, actor_type, actor_label, created_at
        ) VALUES ('after-terminal', 'review-1', ?, 3, 'answer', '{"type":"answer"}', 'user', 'You', 9)`,
      )
      .run(userId),
  ).toThrow(/already terminal/iu);
};

describe('adaptive weekly review migration', () => {
  afterEach(() => {
    while (temporaryDirectories.length) {
      const directory = temporaryDirectories.pop();
      if (directory) rmSync(directory, { recursive: true, force: true });
    }
  });

  it('upgrades a populated real 0048 database and enforces ownership and history guards', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-weekly-review-upgrade-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'upgrade.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 48) });
      const ids = seedLegacyRows(sqlite);
      const legacyCheckIn = sqlite.prepare('SELECT * FROM adaptive_nutrition_checkins').get();
      const legacyTarget = sqlite.prepare('SELECT * FROM nutrition_targets').get();

      migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder });

      expect(sqlite.prepare('SELECT * FROM adaptive_nutrition_checkins').get()).toEqual(
        legacyCheckIn,
      );
      expect(sqlite.prepare('SELECT * FROM nutrition_targets').get()).toEqual(legacyTarget);
      insertReviewDomainRows(sqlite, ids);
      expect(() =>
        sqlite
          .prepare(
            "UPDATE adaptive_nutrition_reviews SET snapshot = '{\"changed\":true}' WHERE id = 'review-1'",
          )
          .run(),
      ).toThrow(/immutable/iu);
      expect(() =>
        sqlite
          .prepare(
            "INSERT INTO adaptive_nutrition_review_actions (id, review_id, user_id, sequence, type, payload, actor_type, actor_label, created_at) VALUES ('gap', 'review-1', ?, 3, 'answer', '{}', 'user', 'You', 6)",
          )
          .run(ids.userId),
      ).toThrow(/exact next sequence/iu);
      expect(() =>
        sqlite
          .prepare(
            "INSERT INTO adaptive_nutrition_review_contexts (id, user_id, program_id, subject_type, subject, category, note, created_by, actor_label, revision, created_at, updated_at) VALUES ('mismatched-subject', ?, ?, 'date', '{\"kind\":\"weigh_in\",\"id\":\"weight-1\"}', 'other', 'No', 'user', 'You', 1, 7, 7)",
          )
          .run(ids.userId, ids.programId),
      ).toThrow(/check constraint/iu);

      const foreign = seedLegacyRows(sqlite, '-foreign');
      expect(() =>
        sqlite
          .prepare(
            "INSERT INTO adaptive_nutrition_review_contexts (id, user_id, program_id, subject_type, subject, category, note, created_by, actor_label, revision, created_at, updated_at) VALUES ('foreign-context', ?, ?, 'date', '{\"kind\":\"date\",\"localDate\":\"2026-08-17\"}', 'other', 'No', 'user', 'You', 1, 7, 7)",
          )
          .run(ids.userId, foreign.programId),
      ).toThrow(/foreign key/iu);
      expect(() =>
        sqlite.prepare("DELETE FROM adaptive_nutrition_reviews WHERE id = 'review-1'").run(),
      ).toThrow(/account deletion scope/iu);

      expectBehavioralHistoryGuards(sqlite, ids.userId);

      sqlite
        .prepare('INSERT INTO adaptive_nutrition_account_deletion_scope (user_id) VALUES (?)')
        .run(ids.userId);
      sqlite.prepare('DELETE FROM users WHERE id = ?').run(ids.userId);
      expect(
        sqlite
          .prepare('SELECT count(*) AS count FROM adaptive_nutrition_reviews WHERE user_id = ?')
          .get(ids.userId),
      ).toEqual({ count: 0 });
      expectHealthy(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it('installs the full journal cleanly on a fresh database', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-weekly-review-fresh-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'fresh.db'));
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder: sourceMigrationsFolder });
      const triggers = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'adaptive_nutrition_review_%_guard' ORDER BY name",
        )
        .all() as Array<{ name: string }>;
      expect(triggers.map((row) => row.name)).toEqual(
        expect.arrayContaining([
          'adaptive_nutrition_review_actions_insert_sequence_guard',
          'adaptive_nutrition_review_actions_insert_terminal_guard',
          'adaptive_nutrition_reviews_update_guard',
        ]),
      );
      const ids = seedLegacyRows(sqlite);
      insertReviewDomainRows(sqlite, ids);
      expectBehavioralHistoryGuards(sqlite, ids.userId);
      expectHealthy(sqlite);
    } finally {
      sqlite.close();
    }
  });
});
