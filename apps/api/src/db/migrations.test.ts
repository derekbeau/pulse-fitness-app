import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirs: string[] = [];

const runSqlStatements = (db: Database.Database, sqlContent: string) => {
  const statements = sqlContent
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    db.exec(statement);
  }
};

describe('migration 0012_bitter_bloodaxe', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('applies weight_reps default to existing exercises', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-migration-0012-'));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, 'migration.db');
    const db = new Database(dbPath);
    try {
      db.exec(`
        CREATE TABLE exercises (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT,
          name TEXT NOT NULL,
          muscle_groups TEXT NOT NULL,
          equipment TEXT NOT NULL,
          category TEXT NOT NULL,
          instructions TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      db.prepare(
        `
          INSERT INTO exercises (
            id,
            user_id,
            name,
            muscle_groups,
            equipment,
            category,
            instructions,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        'exercise-pre-migration',
        null,
        'Bench Press',
        JSON.stringify(['chest', 'triceps']),
        'barbell',
        'compound',
        null,
        Date.now(),
        Date.now(),
      );

      const migrationSql = readFileSync(
        join(process.cwd(), 'drizzle/0012_bitter_bloodaxe.sql'),
        'utf8',
      );
      runSqlStatements(db, migrationSql);

      const migratedRow = db
        .prepare(`SELECT tracking_type AS trackingType FROM exercises WHERE id = ?`)
        .get('exercise-pre-migration') as { trackingType: string };

      expect(migratedRow.trackingType).toBe('weight_reps');
    } finally {
      db.close();
    }
  });
});

describe('migration 0013_lazy_bromley', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('applies lbs default to existing users', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-migration-0013-'));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, 'migration.db');
    const db = new Database(dbPath);
    try {
      db.exec(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY NOT NULL,
          username TEXT NOT NULL,
          name TEXT,
          password_hash TEXT NOT NULL,
          preferences TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      db.prepare(
        `
          INSERT INTO users (
            id,
            username,
            name,
            password_hash,
            preferences,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        'user-pre-migration',
        'derek',
        'Derek',
        'hash',
        null,
        Date.now(),
        Date.now(),
      );

      const migrationSql = readFileSync(
        join(process.cwd(), 'drizzle/0013_lazy_bromley.sql'),
        'utf8',
      );
      runSqlStatements(db, migrationSql);

      const migratedRow = db
        .prepare(`SELECT weight_unit AS weightUnit FROM users WHERE id = ?`)
        .get('user-pre-migration') as { weightUnit: string };

      expect(migratedRow.weightUnit).toBe('lbs');
    } finally {
      db.close();
    }
  });
});
