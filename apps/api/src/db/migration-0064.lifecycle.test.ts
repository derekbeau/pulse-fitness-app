import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';

import { migratePulseDatabase } from './migrate.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
const migrationSql = readFileSync(
  join(migrationsFolder, '0064_daily_nutrition_target_overrides.sql'),
  'utf8',
);
const workDirs: string[] = [];

const makeDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulse-migration-0064-'));
  workDirs.push(dir);
  return dir;
};

const makePredecessorMigrations = () => {
  const dir = join(makeDir(), 'drizzle');
  cpSync(migrationsFolder, dir, { recursive: true });
  rmSync(join(dir, '0064_daily_nutrition_target_overrides.sql'));
  const journalPath = join(dir, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: unknown[] };
  journal.entries = journal.entries.slice(0, -1);
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  return dir;
};

const openDb = (path: string) => {
  const sqlite = new Database(path);
  sqlite.pragma('foreign_keys = ON');
  return sqlite;
};

const tableRows = (sqlite: Database.Database, table: string) =>
  sqlite.prepare(`select * from ${table} order by rowid`).all();

const schemaState = (sqlite: Database.Database) => ({
  migrations: sqlite
    .prepare('select hash, created_at from __drizzle_migrations order by created_at')
    .all(),
  targets: tableRows(sqlite, 'nutrition_targets'),
  events: tableRows(sqlite, 'nutrition_target_events'),
});

const assertIntegrity = (sqlite: Database.Database) => {
  expect(sqlite.prepare('pragma integrity_check').pluck().get()).toBe('ok');
  expect(sqlite.prepare('pragma foreign_key_check').all()).toEqual([]);
};

afterAll(() => {
  for (const dir of workDirs) rmSync(dir, { recursive: true, force: true });
});

describe('migration 0064 lifecycle', () => {
  it('runs the complete fresh chain, enforces FKs, and is idempotent', () => {
    const dir = makeDir();
    const sqlite = openDb(join(dir, 'fresh.db'));
    try {
      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toMatchObject({ applied: 65 });
      expect(
        sqlite
          .prepare(
            "select name from sqlite_master where type = 'table' and name = 'daily_nutrition_target_overrides'",
          )
          .get(),
      ).toEqual({
        name: 'daily_nutrition_target_overrides',
      });
      expect(() =>
        sqlite
          .prepare(
            "insert into daily_nutrition_target_overrides (id, user_id, date, calories) values ('bad-fk', 'missing-user', '2026-09-10', 2000)",
          )
          .run(),
      ).toThrow(/FOREIGN KEY/);
      assertIntegrity(sqlite);
      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toEqual({
        applied: 0,
        projectionRevisions: undefined,
      });
      assertIntegrity(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it('upgrades a populated exact predecessor, preserves targets/events, and proves backup restore rollback', async () => {
    const dir = makeDir();
    const predecessorMigrations = makePredecessorMigrations();
    const dbPath = join(dir, 'predecessor.db');
    const backupPath = join(dir, 'predecessor-backup.db');
    let sqlite = openDb(dbPath);
    try {
      expect(
        migratePulseDatabase(sqlite, { migrationsFolder: predecessorMigrations }),
      ).toMatchObject({ applied: 64 });
      sqlite.exec(`
        insert into users (id, username, password_hash) values ('migration-user', 'migration-user', 'hash');
        insert into nutrition_targets (id, user_id, calories, protein, carbs, fat, source, effective_date, created_at, updated_at)
        values ('target-1', 'migration-user', 2200, 160, 220, 70, 'manual', '2026-09-10', 1700000000000, 1700000000000);
        insert into nutrition_target_events (id, target_id, user_id, sequence, effective_date, calories, protein, carbs, fat, macro_calories, source, event_type, recorded_at, created_at)
        values ('event-1', 'target-1', 'migration-user', 1, '2026-09-10', 2200, 160, 220, 70, 2150, 'manual', 'manual_write', 1700000000000, 1700000000000);
      `);
      const before = schemaState(sqlite);
      await sqlite.backup(backupPath);
      sqlite.close();
      sqlite = openDb(dbPath);

      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toMatchObject({ applied: 1 });
      expect(schemaState(sqlite).targets).toEqual(before.targets);
      expect(schemaState(sqlite).events).toEqual(before.events);
      assertIntegrity(sqlite);
      expect(
        sqlite.prepare('select count(*) as count from daily_nutrition_target_overrides').get(),
      ).toEqual({ count: 0 });

      sqlite.close();
      copyFileSync(backupPath, dbPath);
      sqlite = openDb(dbPath);
      expect(
        sqlite
          .prepare(
            "select name from sqlite_master where type = 'table' and name = 'daily_nutrition_target_overrides'",
          )
          .get(),
      ).toBeUndefined();
      expect(schemaState(sqlite)).toEqual(before);
      assertIntegrity(sqlite);

      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toMatchObject({ applied: 1 });
      expect(schemaState(sqlite).targets).toEqual(before.targets);
      expect(schemaState(sqlite).events).toEqual(before.events);
      assertIntegrity(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it('rolls back a failed migration transaction without leaving a partial table', () => {
    const dir = makeDir();
    const predecessorMigrations = makePredecessorMigrations();
    const sqlite = openDb(join(dir, 'failed.db'));
    try {
      migratePulseDatabase(sqlite, { migrationsFolder: predecessorMigrations });
      expect(() =>
        sqlite.transaction(() => {
          for (const statement of migrationSql.split('--> statement-breakpoint')) {
            sqlite.exec(statement);
          }
          sqlite.exec('select * from table_that_does_not_exist');
        })(),
      ).toThrow(/no such table/);
      expect(
        sqlite
          .prepare(
            "select name from sqlite_master where type = 'table' and name = 'daily_nutrition_target_overrides'",
          )
          .get(),
      ).toBeUndefined();
      assertIntegrity(sqlite);
    } finally {
      sqlite.close();
    }
  });
});
