import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it } from 'vitest';

import { migratePulseDatabase } from './migrate.js';

const sourceMigrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
const temporaryDirectories: string[] = [];

type Journal = {
  version: string;
  dialect: string;
  entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }>;
};

const sourceJournal = JSON.parse(
  readFileSync(join(sourceMigrationsFolder, 'meta/_journal.json'), 'utf8'),
) as Journal;

function stageThrough(root: string, maximumIndex: number) {
  const destination = join(root, `through-${maximumIndex}`);
  mkdirSync(join(destination, 'meta'), { recursive: true });
  const entries = sourceJournal.entries.filter((entry) => entry.idx <= maximumIndex);
  writeFileSync(
    join(destination, 'meta/_journal.json'),
    `${JSON.stringify({ ...sourceJournal, entries }, null, 2)}\n`,
  );
  for (const entry of entries) {
    copyFileSync(
      join(sourceMigrationsFolder, `${entry.tag}.sql`),
      join(destination, `${entry.tag}.sql`),
    );
  }
  return destination;
}

function createDatabase() {
  const root = mkdtempSync(join(tmpdir(), 'pulse-prescription-migration-'));
  temporaryDirectories.push(root);
  const sqlite = new Database(join(root, 'migration.db'));
  sqlite.pragma('foreign_keys = ON');
  return { root, sqlite };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('0060 scheduled session prescriptions', () => {
  it('upgrades populated legacy sessions without changing history and is idempotent', () => {
    const { root, sqlite } = createDatabase();
    try {
      migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 59) });
      sqlite.exec(
        "INSERT INTO users (id, username, password_hash) VALUES ('u', 'fictional', 'hash')",
      );
      sqlite.exec(
        "INSERT INTO workout_sessions (id, user_id, name, date, status, started_at, completed_at) VALUES ('legacy', 'u', 'Legacy', '2026-09-06', 'completed', 100, 200)",
      );
      const before = sqlite.prepare('SELECT * FROM workout_sessions').get();
      const result = migratePulseDatabase(sqlite, { migrationsFolder: sourceMigrationsFolder });
      expect(result).toBeDefined();
      expect(sqlite.prepare('SELECT * FROM workout_sessions').get()).toEqual({
        ...(before as object),
        exercise_prescriptions: null,
      });
      migratePulseDatabase(sqlite, { migrationsFolder: sourceMigrationsFolder });
      expect(sqlite.pragma('foreign_key_check')).toEqual([]);
      expect(sqlite.pragma('quick_check')).toEqual([{ quick_check: 'ok' }]);
    } finally {
      sqlite.close();
    }
  });
});
