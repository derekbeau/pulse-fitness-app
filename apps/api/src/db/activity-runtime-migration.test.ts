import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';

import { migratePulseDatabase } from './migrate.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
const workDirs: string[] = [];

const makeDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulse-activity-runtime-'));
  workDirs.push(dir);
  return dir;
};

const makePredecessorMigrations = () => {
  const dir = join(makeDir(), 'drizzle');
  cpSync(migrationsFolder, dir, { recursive: true });
  rmSync(join(dir, '0069_activity_runtime.sql'));
  const journalPath = join(dir, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: unknown[] };
  journal.entries = journal.entries.slice(0, 69);
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  return dir;
};

const makeBrokenCurrentMigrations = () => {
  const dir = join(makeDir(), 'drizzle');
  cpSync(migrationsFolder, dir, { recursive: true });
  const migrationPath = join(dir, '0069_activity_runtime.sql');
  writeFileSync(
    migrationPath,
    `${readFileSync(migrationPath, 'utf8')}\n--> statement-breakpoint\nselect * from intentionally_missing_activity_table;\n`,
  );
  return dir;
};

const openDb = (path: string) => {
  const sqlite = new Database(path);
  sqlite.pragma('foreign_keys = ON');
  return sqlite;
};

const assertIntegrity = (sqlite: Database.Database) => {
  expect(sqlite.prepare('pragma integrity_check').pluck().get()).toBe('ok');
  expect(sqlite.prepare('pragma foreign_key_check').all()).toEqual([]);
};

afterAll(() => {
  for (const dir of workDirs) rmSync(dir, { recursive: true, force: true });
});

describe('activity runtime migration 0069', () => {
  it('runs the production migration chain on a fresh database and cascades every runtime root', () => {
    const sqlite = openDb(join(makeDir(), 'fresh.db'));
    try {
      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toMatchObject({ applied: 70 });
      const tables = sqlite
        .prepare(
          `select name from sqlite_master
            where type = 'table' and name like 'activity_%'
            order by name`,
        )
        .pluck()
        .all();
      expect(tables).toEqual(
        expect.arrayContaining([
          'activity_assignments',
          'activity_assignment_revisions',
          'activity_executions',
          'activity_execution_revisions',
          'activity_goals',
          'activity_goal_links',
          'activity_idempotency_receipts',
          'activity_owned_links',
          'activity_recurrences',
          'activity_recurrence_revisions',
          'activity_revisions',
        ]),
      );
      expect(
        sqlite
          .prepare(`select name from sqlite_master where type = 'table' and name = 'activities'`)
          .pluck()
          .get(),
      ).toBe('activities');
      assertIntegrity(sqlite);
      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toMatchObject({ applied: 0 });
    } finally {
      sqlite.close();
    }
  });

  it('upgrades the exact populated predecessor without changing ambiguous legacy activity bytes', () => {
    const dbPath = join(makeDir(), 'populated.db');
    const sqlite = openDb(dbPath);
    try {
      expect(
        migratePulseDatabase(sqlite, { migrationsFolder: makePredecessorMigrations() }),
      ).toMatchObject({ applied: 69 });
      sqlite.exec(`
        insert into users (id, username, password_hash)
        values ('legacy-owner', 'legacy-owner', 'hash');
        insert into activities
          (id, user_id, date, type, name, duration_minutes, notes, created_at, updated_at)
        values
          ('legacy-walk', 'legacy-owner', '2026-09-01', 'walking', 'River walk', 35,
           'date only on purpose', 1788210000000, 1788210300000);
      `);
      const before = sqlite.prepare(`select * from activities where id = 'legacy-walk'`).get();

      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toMatchObject({ applied: 1 });
      expect(sqlite.prepare(`select * from activities where id = 'legacy-walk'`).get()).toEqual(
        before,
      );
      expect(sqlite.prepare(`select count(*) from canonical_activities`).pluck().get()).toBe(0);
      assertIntegrity(sqlite);
      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toMatchObject({ applied: 0 });
    } finally {
      sqlite.close();
    }
  });

  it('uses the production runner transaction to roll back every 0069 statement on failure', () => {
    const sqlite = openDb(join(makeDir(), 'rollback.db'));
    try {
      migratePulseDatabase(sqlite, { migrationsFolder: makePredecessorMigrations() });
      expect(() =>
        migratePulseDatabase(sqlite, { migrationsFolder: makeBrokenCurrentMigrations() }),
      ).toThrow(/intentionally_missing_activity_table/);
      expect(
        sqlite
          .prepare(
            `select name from sqlite_master where type = 'table' and name = 'activity_goals'`,
          )
          .get(),
      ).toBeUndefined();
      expect(
        sqlite.prepare(`select max(created_at) from __drizzle_migrations`).pluck().get(),
      ).not.toBe(1789862400000);
      assertIntegrity(sqlite);
    } finally {
      sqlite.close();
    }
  });
});
