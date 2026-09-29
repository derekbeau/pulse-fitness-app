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

const makePredecessorFolder = () => {
  const folder = mkdtempSync(join(tmpdir(), 'pulse-body-context-predecessor-'));
  tempDirs.push(folder);
  mkdirSync(join(folder, 'meta'));
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8'),
  ) as { dialect: string; entries: Array<{ idx: number; tag: string }>; version: string };
  const entries = journal.entries.filter((entry) => entry.idx <= 69);
  writeFileSync(
    join(folder, 'meta/_journal.json'),
    JSON.stringify({ ...journal, entries }, null, 2),
  );
  for (const entry of entries) {
    copyFileSync(join(migrationsFolder, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
  }
  return folder;
};

describe('migration 0070 body-context runtime', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const folder = tempDirs.pop();
      if (folder) rmSync(folder, { recursive: true, force: true });
    }
  });

  it('runs from a populated exact predecessor, preserves legacy rows, reruns as a no-op, and cascades account erasure', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-body-context-migration-'));
    tempDirs.push(directory);
    const sqlite = new Database(join(directory, 'migration.db'));
    sqlite.pragma('foreign_keys = ON');
    const db = drizzle(sqlite, { schema });
    try {
      migrate(db, { migrationsFolder: makePredecessorFolder() });
      sqlite
        .prepare(
          `insert into users (id,username,password_hash,preferences,created_at,updated_at)
           values ('owner','owner','hash','{}',1,1)`,
        )
        .run();
      sqlite
        .prepare(
          `insert into health_conditions
            (id,user_id,name,body_area,status,onset_date,description,created_at,updated_at)
           values ('legacy','owner','Legacy shoulder note','shoulder','monitoring','2026-01-01',
                   'Must remain byte-for-byte unchanged',2,3)`,
        )
        .run();
      const legacyBefore = sqlite
        .prepare('select * from health_conditions where id=?')
        .get('legacy');

      migrate(db, { migrationsFolder });
      const names = sqlite
        .prepare(
          `select name from sqlite_master where type='table' and
            name in ('body_context_concerns','body_context_capabilities','body_context_guidance',
                     'body_context_flares','plan_change_proposals','body_context_idempotency_receipts')
           order by name`,
        )
        .all();
      expect(names).toHaveLength(6);
      expect(sqlite.prepare('select * from health_conditions where id=?').get('legacy')).toEqual(
        legacyBefore,
      );
      const migrationCount = (
        sqlite.prepare('select count(*) as count from __drizzle_migrations').get() as {
          count: number;
        }
      ).count;
      migrate(db, { migrationsFolder });
      expect(sqlite.prepare('select count(*) as count from __drizzle_migrations').get()).toEqual({
        count: migrationCount,
      });

      sqlite
        .prepare(
          `insert into body_context_concerns
            (id,user_id,label,body_region,symptom_state,management_state,source_json,revision,
             current_revision_id,legacy_health_condition_id,created_at,updated_at)
           values ('concern','owner','Shoulder','shoulder','unknown','monitoring','{}',1,
                   'revision','legacy','2026-09-19T00:00:00.000Z','2026-09-19T00:00:00.000Z')`,
        )
        .run();
      sqlite.prepare('delete from users where id=?').run('owner');
      expect(sqlite.prepare('select count(*) as count from body_context_concerns').get()).toEqual({
        count: 0,
      });
      expect(sqlite.prepare('select count(*) as count from health_conditions').get()).toEqual({
        count: 0,
      });
      expect(sqlite.pragma('foreign_key_check')).toEqual([]);
      expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
    } finally {
      sqlite.close();
    }
  });

  it('rolls back the whole additive migration when a conflicting table exists', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-body-context-migration-failure-'));
    tempDirs.push(directory);
    const sqlite = new Database(join(directory, 'failure.db'));
    const db = drizzle(sqlite, { schema });
    try {
      migrate(db, { migrationsFolder: makePredecessorFolder() });
      sqlite.exec('create table body_context_concerns (unexpected text)');
      expect(() => migrate(db, { migrationsFolder })).toThrow();
      expect(
        sqlite
          .prepare(
            `select count(*) as count from sqlite_master
              where type='table' and name='body_context_concern_revisions'`,
          )
          .get(),
      ).toEqual({ count: 0 });
      expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
    } finally {
      sqlite.close();
    }
  });

  it('creates a strict fresh database through the actual migration runner', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-body-context-migration-fresh-'));
    tempDirs.push(directory);
    const sqlite = new Database(join(directory, 'fresh.db'));
    try {
      migrate(drizzle(sqlite, { schema }), { migrationsFolder });
      expect(
        sqlite
          .prepare(
            "select name from sqlite_master where type='table' and name='plan_change_proposals'",
          )
          .get(),
      ).toEqual({ name: 'plan_change_proposals' });
      expect(sqlite.pragma('foreign_key_check')).toEqual([]);
      expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
    } finally {
      sqlite.close();
    }
  });
});
