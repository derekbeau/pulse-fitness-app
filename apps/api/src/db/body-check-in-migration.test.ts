import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';

import { migratePulseDatabase } from './migrate.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
const migrationSql = readFileSync(
  join(migrationsFolder, '0066_body_check_in_foundation.sql'),
  'utf8',
);
const workDirs: string[] = [];

const makeDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulse-migration-0066-'));
  workDirs.push(dir);
  return dir;
};

const makeMigrationsThrough0065 = () => {
  const dir = join(makeDir(), 'drizzle');
  cpSync(migrationsFolder, dir, { recursive: true });
  rmSync(join(dir, '0066_body_check_in_foundation.sql'));
  rmSync(join(dir, '0067_body_progress_photo_storage.sql'));
  rmSync(join(dir, '0068_body_progress_photo_deletion_intents.sql'));
  const journalPath = join(dir, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: unknown[] };
  journal.entries = journal.entries.slice(0, 66);
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  return dir;
};

const openDb = (path: string) => {
  const sqlite = new Database(path);
  sqlite.pragma('foreign_keys = ON');
  return sqlite;
};

const seedLegacyBodyMeasurements = (sqlite: Database.Database) => {
  sqlite.exec(`
    insert into users (id, username, password_hash)
    values ('legacy-user', 'legacy-user', 'hash');
    insert into body_measurements (
      id, user_id, local_date, waist_mm, hips_mm, chest_mm, neck_mm,
      left_arm_mm, right_arm_mm, left_thigh_mm, right_thigh_mm,
      body_fat_percent, unit_at_entry, notes, created_at, updated_at
    ) values (
      'legacy-all-scalars', 'legacy-user', '2026-09-01', 813, 956, 1012, 381,
      337, 341, 552, 559, 18.4, 'in', 'historical scalar only',
      1700000000001, 1700000000002
    );
    insert into body_measurements (
      id, user_id, local_date, body_fat_percent, notes, created_at, updated_at
    ) values (
      'legacy-body-fat-only', 'legacy-user', '2026-09-02', 19.1,
      'no circumference protocol can be inferred', 1700000000003, 1700000000004
    );
  `);
};

const legacyBodyRows = (sqlite: Database.Database) =>
  sqlite.prepare('select * from body_measurements order by id').all();

const tableExists = (sqlite: Database.Database, table: string) =>
  Boolean(
    sqlite.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(table),
  );

const assertIntegrity = (sqlite: Database.Database) => {
  expect(sqlite.prepare('pragma integrity_check').pluck().get()).toBe('ok');
  expect(sqlite.prepare('pragma foreign_key_check').all()).toEqual([]);
};

afterAll(() => {
  for (const dir of workDirs) rmSync(dir, { recursive: true, force: true });
});

describe('0066 body check-in migration lifecycle', () => {
  it('runs the complete fresh chain and is idempotent', () => {
    const sqlite = openDb(join(makeDir(), 'fresh.db'));
    try {
      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toMatchObject({ applied: 72 });
      for (const table of [
        'body_check_in_preferences',
        'body_check_ins',
        'body_check_in_measurements',
        'body_check_in_versions',
        'body_check_in_measurement_versions',
      ]) {
        expect(tableExists(sqlite, table), table).toBe(true);
      }
      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toEqual({
        applied: 0,
        projectionRevisions: undefined,
      });
      assertIntegrity(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it('upgrades a populated 0065 predecessor, preserves every scalar through restart, and restores its raw backup', async () => {
    const dir = makeDir();
    const predecessor = makeMigrationsThrough0065();
    const dbPath = join(dir, 'populated.db');
    const backupPath = join(dir, '0065-backup.db');
    let sqlite = openDb(dbPath);
    try {
      expect(migratePulseDatabase(sqlite, { migrationsFolder: predecessor })).toMatchObject({
        applied: 66,
      });
      seedLegacyBodyMeasurements(sqlite);
      const before = legacyBodyRows(sqlite);
      await sqlite.backup(backupPath);
      sqlite.close();
      sqlite = openDb(dbPath);

      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toMatchObject({ applied: 6 });
      expect(legacyBodyRows(sqlite)).toEqual(before);
      expect(sqlite.prepare('select count(*) from body_check_ins').pluck().get()).toBe(0);
      assertIntegrity(sqlite);
      sqlite.close();
      sqlite = openDb(dbPath);
      expect(legacyBodyRows(sqlite)).toEqual(before);
      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toEqual({
        applied: 0,
        projectionRevisions: undefined,
      });
      expect(legacyBodyRows(sqlite)).toEqual(before);

      sqlite.close();
      copyFileSync(backupPath, dbPath);
      sqlite = openDb(dbPath);
      expect(legacyBodyRows(sqlite)).toEqual(before);
      expect(tableExists(sqlite, 'body_check_ins')).toBe(false);
      expect(tableExists(sqlite, 'body_check_in_versions')).toBe(false);
      expect(migratePulseDatabase(sqlite, { migrationsFolder: predecessor })).toEqual({
        applied: 0,
        projectionRevisions: undefined,
      });
      expect(legacyBodyRows(sqlite)).toEqual(before);
      assertIntegrity(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it('rolls back a failed 0066 atomically and preserves raw predecessor facts', () => {
    const sqlite = openDb(join(makeDir(), 'failed.db'));
    try {
      migratePulseDatabase(sqlite, { migrationsFolder: makeMigrationsThrough0065() });
      seedLegacyBodyMeasurements(sqlite);
      const before = legacyBodyRows(sqlite);
      expect(() =>
        sqlite.transaction(() => {
          for (const statement of migrationSql.split('--> statement-breakpoint')) {
            if (statement.trim()) sqlite.exec(statement);
          }
          sqlite.exec('select * from intentionally_missing_table');
        })(),
      ).toThrow(/no such table/);
      expect(legacyBodyRows(sqlite)).toEqual(before);
      for (const table of [
        'body_check_in_preferences',
        'body_check_ins',
        'body_check_in_measurements',
        'body_check_in_versions',
        'body_check_in_measurement_versions',
      ]) {
        expect(tableExists(sqlite, table), table).toBe(false);
      }
      assertIntegrity(sqlite);
    } finally {
      sqlite.close();
    }
  });
});
