import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';

import { migratePulseDatabase } from './migrate.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
const migrationSql = readFileSync(join(migrationsFolder, '0065_body_measurements.sql'), 'utf8');
const workDirs: string[] = [];

const makeDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulse-migration-0065-'));
  workDirs.push(dir);
  return dir;
};

const makePredecessorMigrations = () => {
  const dir = join(makeDir(), 'drizzle');
  cpSync(migrationsFolder, dir, { recursive: true });
  rmSync(join(dir, '0065_body_measurements.sql'));
  rmSync(join(dir, '0066_body_check_in_foundation.sql'));
  rmSync(join(dir, '0067_body_progress_photo_storage.sql'));
  rmSync(join(dir, '0068_body_progress_photo_deletion_intents.sql'));
  const journalPath = join(dir, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: unknown[] };
  journal.entries = journal.entries.slice(0, 65);
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
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

describe('migration 0065 lifecycle', () => {
  it('runs the fresh chain and enforces owner, date, unit, value, and uniqueness constraints', () => {
    const sqlite = openDb(join(makeDir(), 'fresh.db'));
    try {
      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toMatchObject({ applied: 73 });
      sqlite.exec(
        "insert into users (id, username, password_hash) values ('owner', 'owner', 'hash')",
      );
      sqlite
        .prepare(
          `insert into body_measurements
           (id, user_id, local_date, waist_mm, body_fat_percent, unit_at_entry, notes)
           values (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('entry', 'owner', '2026-09-14', 813, 18.4, 'in', 'self reported');
      expect(() =>
        sqlite
          .prepare(
            "insert into body_measurements (id, user_id, local_date, waist_mm, unit_at_entry) values ('duplicate', 'owner', '2026-09-14', 800, 'cm')",
          )
          .run(),
      ).toThrow(/UNIQUE/);
      expect(() =>
        sqlite
          .prepare(
            "insert into body_measurements (id, user_id, local_date, waist_mm, unit_at_entry) values ('bad-fk', 'missing', '2026-09-13', 800, 'cm')",
          )
          .run(),
      ).toThrow(/FOREIGN KEY/);
      for (const statement of [
        "insert into body_measurements (id, user_id, local_date, waist_mm, unit_at_entry) values ('bad-date', 'owner', '2026-02-30', 800, 'cm')",
        "insert into body_measurements (id, user_id, local_date, waist_mm, unit_at_entry) values ('bad-low', 'owner', '2026-09-12', 199, 'cm')",
        "insert into body_measurements (id, user_id, local_date, waist_mm, unit_at_entry) values ('bad-fractional-mm', 'owner', '2026-09-09', 813.5, 'cm')",
        "insert into body_measurements (id, user_id, local_date, body_fat_percent) values ('bad-body-fat-precision', 'owner', '2026-09-08', 18.44)",
        "insert into body_measurements (id, user_id, local_date, waist_mm, unit_at_entry) values ('bad-unit', 'owner', '2026-09-11', 800, 'mm')",
        "insert into body_measurements (id, user_id, local_date) values ('empty', 'owner', '2026-09-10')",
      ]) {
        expect(() => sqlite.prepare(statement).run()).toThrow(/CHECK/);
      }
      sqlite.prepare("delete from users where id = 'owner'").run();
      expect(sqlite.prepare('select count(*) from body_measurements').pluck().get()).toBe(0);
      assertIntegrity(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it('upgrades a populated predecessor, survives restart, and restores its backup', async () => {
    const dir = makeDir();
    const predecessor = makePredecessorMigrations();
    const dbPath = join(dir, 'populated.db');
    const backupPath = join(dir, 'predecessor-backup.db');
    let sqlite = openDb(dbPath);
    try {
      expect(migratePulseDatabase(sqlite, { migrationsFolder: predecessor })).toMatchObject({
        applied: 65,
      });
      sqlite.exec(`
        insert into users (id, username, password_hash) values ('legacy-user', 'legacy-user', 'hash');
        insert into body_weight (id, user_id, date, weight, weight_kg, unit_at_entry)
        values ('legacy-weight', 'legacy-user', '2026-09-10', 180, 81.6466266, 'lbs');
      `);
      await sqlite.backup(backupPath);
      sqlite.close();
      sqlite = openDb(dbPath);

      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toMatchObject({ applied: 8 });
      expect(
        sqlite.prepare("select weight from body_weight where id = 'legacy-weight'").pluck().get(),
      ).toBe(180);
      sqlite
        .prepare(
          "insert into body_measurements (id, user_id, local_date, hips_mm, unit_at_entry) values ('persisted', 'legacy-user', '2026-09-10', 950, 'cm')",
        )
        .run();
      assertIntegrity(sqlite);
      sqlite.close();
      sqlite = openDb(dbPath);
      expect(
        sqlite
          .prepare("select hips_mm from body_measurements where id = 'persisted'")
          .pluck()
          .get(),
      ).toBe(950);
      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toMatchObject({ applied: 0 });

      sqlite.close();
      copyFileSync(backupPath, dbPath);
      sqlite = openDb(dbPath);
      expect(
        sqlite
          .prepare(
            "select name from sqlite_master where type = 'table' and name = 'body_measurements'",
          )
          .get(),
      ).toBeUndefined();
      expect(
        sqlite.prepare("select weight from body_weight where id = 'legacy-weight'").pluck().get(),
      ).toBe(180);
      assertIntegrity(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it('rolls back a failed migration transaction without a partial table', () => {
    const sqlite = openDb(join(makeDir(), 'rollback.db'));
    try {
      migratePulseDatabase(sqlite, { migrationsFolder: makePredecessorMigrations() });
      expect(() =>
        sqlite.transaction(() => {
          for (const statement of migrationSql.split('--> statement-breakpoint')) {
            if (statement.trim()) sqlite.exec(statement);
          }
          sqlite.exec('select * from intentionally_missing_table');
        })(),
      ).toThrow(/no such table/);
      expect(
        sqlite
          .prepare(
            "select name from sqlite_master where type = 'table' and name = 'body_measurements'",
          )
          .get(),
      ).toBeUndefined();
      assertIntegrity(sqlite);
    } finally {
      sqlite.close();
    }
  });
});
