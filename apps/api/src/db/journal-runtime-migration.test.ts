import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';
import { migratePulseDatabase } from './migrate.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
const directories: string[] = [];
const makeDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulse-journal-migration-'));
  directories.push(dir);
  return dir;
};
const predecessor = () => {
  const folder = join(makeDir(), 'drizzle');
  cpSync(migrationsFolder, folder, { recursive: true });
  const journalFile = join(folder, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalFile, 'utf8')) as {
    entries: Array<{ idx: number }>;
  };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 71);
  writeFileSync(journalFile, `${JSON.stringify(journal, null, 2)}\n`);
  return folder;
};
const open = () => {
  const sqlite = new Database(join(makeDir(), 'test.db'));
  sqlite.pragma('foreign_keys=ON');
  return sqlite;
};
const integrity = (sqlite: Database.Database) => {
  expect(sqlite.pragma('foreign_key_check')).toEqual([]);
  expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
};
afterAll(() => directories.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('0072 Journal runtime migration', () => {
  it('applies fresh, upgrades populated exact 0071, reruns without mutation, and cascades owner erasure', () => {
    const fresh = open();
    try {
      expect(migratePulseDatabase(fresh, { migrationsFolder })).toMatchObject({ applied: 73 });
      integrity(fresh);
      expect(migratePulseDatabase(fresh, { migrationsFolder })).toMatchObject({ applied: 0 });
    } finally {
      fresh.close();
    }
    const sqlite = open();
    try {
      expect(migratePulseDatabase(sqlite, { migrationsFolder: predecessor() })).toMatchObject({
        applied: 72,
      });
      sqlite.exec(
        "insert into users (id,username,password_hash) values ('owner','owner','x'); insert into journal_entries (id,user_id,date,title,type,content,created_by,created_at,updated_at) values ('legacy','owner','2026-09-19','Old','observation','Date-only record','agent',1,1)",
      );
      const legacy = sqlite.prepare("select * from journal_entries where id='legacy'").get();
      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toMatchObject({ applied: 1 });
      expect(sqlite.prepare("select * from journal_entries where id='legacy'").get()).toEqual(
        legacy,
      );
      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toMatchObject({ applied: 0 });
      sqlite.exec(
        "insert into journal_observations (id,user_id,local_date,time_zone,current_revision_id,revision,snapshot_json,created_at) values ('j','owner','2026-09-19','America/Detroit','r1',1,'{}','2026-09-19T00:00:00.000Z'); insert into journal_observation_revisions (id,observation_id,user_id,revision,prior_revision_id,recorded_at,recorded_by_json,reason,snapshot_json) values ('r1','j','owner',1,null,'2026-09-19T00:00:00.000Z','{}',null,'{}'); insert into journal_idempotency_receipts (id,user_id,route,operation,idempotency_key,request_fingerprint,status_code,response_json,created_at) values ('receipt','owner','/api/v1/journal','create','key','hash',201,'{}','2026-09-19T00:00:00.000Z')",
      );
      sqlite.prepare("delete from users where id='owner'").run();
      for (const table of [
        'journal_observations',
        'journal_observation_revisions',
        'journal_idempotency_receipts',
        'journal_entries',
      ])
        expect(sqlite.prepare(`select count(*) count from ${table}`).get()).toEqual({ count: 0 });
      integrity(sqlite);
    } finally {
      sqlite.close();
    }
  });
  it('rolls back all new objects when 0072 fails', () => {
    const sqlite = open();
    try {
      migratePulseDatabase(sqlite, { migrationsFolder: predecessor() });
      const badFolder = join(makeDir(), 'broken');
      cpSync(migrationsFolder, badFolder, { recursive: true });
      const path = join(badFolder, '0072_journal_runtime.sql');
      writeFileSync(
        path,
        `${readFileSync(path, 'utf8')}\n--> statement-breakpoint\nselect * from intentionally_missing_journal_table;\n`,
      );
      expect(() => migratePulseDatabase(sqlite, { migrationsFolder: badFolder })).toThrow(
        /intentionally_missing_journal_table/,
      );
      expect(
        sqlite
          .prepare(
            "select count(*) count from sqlite_master where type='table' and name='journal_observations'",
          )
          .get(),
      ).toEqual({ count: 0 });
      integrity(sqlite);
    } finally {
      sqlite.close();
    }
  });
});
