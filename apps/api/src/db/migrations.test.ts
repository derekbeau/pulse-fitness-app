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

describe('migration 0013_bitter_bloodaxe', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('applies weight_reps default to existing exercises', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-migration-0013-'));
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
        join(process.cwd(), 'drizzle/0013_bitter_bloodaxe.sql'),
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

describe('migration 0014_lazy_bromley', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('applies lbs default to existing users', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-migration-0014-'));
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
        join(process.cwd(), 'drizzle/0014_lazy_bromley.sql'),
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

describe('migration 0015_parched_katie_power', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('adds tracking_type check constraint for exercises', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-migration-0015-'));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, 'migration.db');
    const db = new Database(dbPath);
    try {
      db.exec(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY NOT NULL
        );
      `);

      db.exec(`
        CREATE TABLE exercises (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT,
          name TEXT NOT NULL,
          muscle_groups TEXT NOT NULL,
          equipment TEXT NOT NULL,
          category TEXT NOT NULL,
          tracking_type TEXT DEFAULT 'weight_reps' NOT NULL,
          instructions TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      const migrationSql = readFileSync(
        join(process.cwd(), 'drizzle/0015_parched_katie_power.sql'),
        'utf8',
      );
      runSqlStatements(db, migrationSql);

      expect(() =>
        db.prepare(
          `
            INSERT INTO exercises (
              id,
              user_id,
              name,
              muscle_groups,
              equipment,
              category,
              tracking_type,
              instructions,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        ).run(
          'exercise-invalid-tracking',
          null,
          'Bench Press',
          JSON.stringify(['chest']),
          'barbell',
          'compound',
          'invalid_type',
          null,
          Date.now(),
          Date.now(),
        ),
      ).toThrow(/CHECK constraint failed/);
    } finally {
      db.close();
    }
  });
});

describe('migration 0017_fix_exercise_categories', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('fixes miscategorized exercises and is idempotent', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-migration-0017-'));
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

      const insertExercise = db.prepare(
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
      );

      const now = Date.now();
      insertExercise.run(
        'exercise-1',
        'user-1',
        'Band Pull-Aparts',
        JSON.stringify(['rear-delts']),
        'band',
        'mobility',
        null,
        now,
        now,
      );
      insertExercise.run(
        'exercise-2',
        'user-1',
        'Band Pull-Aparts (Underhand)',
        JSON.stringify(['rear-delts']),
        'band',
        'mobility',
        null,
        now,
        now,
      );
      insertExercise.run(
        'exercise-3',
        'user-2',
        'Bird Dogs',
        JSON.stringify(['core']),
        'bodyweight',
        'mobility',
        null,
        now,
        now,
      );
      insertExercise.run(
        'exercise-4',
        'user-2',
        'Dead Bug',
        JSON.stringify(['core']),
        'bodyweight',
        'mobility',
        null,
        now,
        now,
      );
      insertExercise.run(
        'exercise-5',
        'user-3',
        'Spanish Squat',
        JSON.stringify(['quads']),
        'band',
        'mobility',
        null,
        now,
        now,
      );
      insertExercise.run(
        'exercise-6',
        'user-3',
        'Single-Leg Glute Bridge',
        JSON.stringify(['glutes']),
        'bodyweight',
        'compound',
        null,
        now,
        now,
      );
      insertExercise.run(
        'exercise-7',
        'user-4',
        'Band Pull-Aparts',
        JSON.stringify(['rear-delts']),
        'band',
        'cardio',
        null,
        now,
        now,
      );
      insertExercise.run(
        'exercise-8',
        'user-4',
        'Single-Leg Glute Bridge',
        JSON.stringify(['glutes']),
        'bodyweight',
        'mobility',
        null,
        now,
        now,
      );

      const migrationSql = readFileSync(
        join(process.cwd(), 'drizzle/0017_fix_exercise_categories.sql'),
        'utf8',
      );

      runSqlStatements(db, migrationSql);
      runSqlStatements(db, migrationSql);

      const rows = db
        .prepare(
          `
            SELECT id, category
            FROM exercises
            ORDER BY id ASC
          `,
        )
        .all() as Array<{ id: string; category: string }>;

      expect(rows).toEqual([
        { id: 'exercise-1', category: 'isolation' },
        { id: 'exercise-2', category: 'isolation' },
        { id: 'exercise-3', category: 'isolation' },
        { id: 'exercise-4', category: 'isolation' },
        { id: 'exercise-5', category: 'isolation' },
        { id: 'exercise-6', category: 'isolation' },
        { id: 'exercise-7', category: 'cardio' },
        { id: 'exercise-8', category: 'mobility' },
      ]);
    } finally {
      db.close();
    }
  });
});
