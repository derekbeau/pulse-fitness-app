import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it } from 'vitest';

import * as schema from './schema/index.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
const tempDirs: string[] = [];
const predecessor = () => {
  const folder = mkdtempSync(join(tmpdir(), 'pulse-check-in-predecessor-'));
  tempDirs.push(folder);
  mkdirSync(join(folder, 'meta'));
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8'),
  ) as { entries: Array<{ idx: number; tag: string }> };
  const entries = journal.entries.filter((entry) => entry.idx <= 70);
  writeFileSync(
    join(folder, 'meta/_journal.json'),
    JSON.stringify({ version: '7', dialect: 'sqlite', entries }, null, 2),
  );
  entries.forEach((entry) =>
    copyFileSync(join(migrationsFolder, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`)),
  );
  return folder;
};
describe('migration 0071 daily check-in runtime', () => {
  afterEach(() => {
    for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
  });
  it('migrates a populated exact predecessor, reruns, preserves predecessor data, and cascades erasure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pulse-check-in-migration-'));
    tempDirs.push(dir);
    const sqlite = new Database(join(dir, 'db.sqlite'));
    sqlite.pragma('foreign_keys = ON');
    const db = drizzle(sqlite, { schema });
    try {
      migrate(db, { migrationsFolder: predecessor() });
      sqlite
        .prepare(
          "insert into users (id,username,password_hash,preferences,created_at,updated_at) values ('owner','owner','x','{}',1,1)",
        )
        .run();
      sqlite
        .prepare(
          "insert into health_conditions (id,user_id,name,body_area,status,onset_date,description,created_at,updated_at) values ('legacy','owner','Legacy','shoulder','active','2026-09-20',null,1,1)",
        )
        .run();
      const legacy = sqlite.prepare('select * from health_conditions where id=?').get('legacy');
      migrate(db, { migrationsFolder });
      expect(
        sqlite
          .prepare(
            "select name from sqlite_master where type='table' and name='daily_check_in_questions'",
          )
          .get(),
      ).toEqual({ name: 'daily_check_in_questions' });
      expect(sqlite.prepare('select * from health_conditions where id=?').get('legacy')).toEqual(
        legacy,
      );
      const count = (
        sqlite.prepare('select count(*) count from __drizzle_migrations').get() as { count: number }
      ).count;
      migrate(db, { migrationsFolder });
      expect(sqlite.prepare('select count(*) count from __drizzle_migrations').get()).toEqual({
        count,
      });
      sqlite
        .prepare(
          "insert into daily_check_in_questions (id,user_id,local_date,time_zone,deduplication_key,semantic_topic,prompt,state,source_references_json,follow_up_question_id,revision,current_revision_id,created_at,updated_at) values ('q','owner','2026-09-20','America/Detroit','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topic','Prompt','pending','[]',null,1,'qr','2026-09-20T00:00:00.000Z','2026-09-20T00:00:00.000Z')",
        )
        .run();
      sqlite.prepare("delete from users where id='owner'").run();
      expect(sqlite.prepare('select count(*) count from daily_check_in_questions').get()).toEqual({
        count: 0,
      });
      expect(sqlite.pragma('foreign_key_check')).toEqual([]);
      expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
    } finally {
      sqlite.close();
    }
  });
  it('rolls back additively on a conflicting table', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pulse-check-in-failure-'));
    tempDirs.push(dir);
    const sqlite = new Database(join(dir, 'db.sqlite'));
    const db = drizzle(sqlite, { schema });
    try {
      migrate(db, { migrationsFolder: predecessor() });
      sqlite.exec('create table daily_check_in_questions (bad text)');
      expect(() => migrate(db, { migrationsFolder })).toThrow();
      expect(
        sqlite
          .prepare(
            "select count(*) count from sqlite_master where type='table' and name='daily_check_in_answers'",
          )
          .get(),
      ).toEqual({ count: 0 });
    } finally {
      sqlite.close();
    }
  });
});
