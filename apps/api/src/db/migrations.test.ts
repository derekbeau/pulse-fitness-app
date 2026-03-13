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
      ).run('user-pre-migration', 'derek', 'Derek', 'hash', null, Date.now(), Date.now());

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
        db
          .prepare(
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
          )
          .run(
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

describe('migration 0018_graceful_lord_hawal', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('adds tags and form_cues with [] defaults for existing exercises', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-migration-0018-'));
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
          tracking_type TEXT DEFAULT 'weight_reps' NOT NULL,
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
            tracking_type,
            instructions,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        'exercise-pre-migration',
        'user-1',
        'Back Squat',
        JSON.stringify(['quads', 'glutes']),
        'barbell',
        'compound',
        'weight_reps',
        null,
        Date.now(),
        Date.now(),
      );

      const migrationSql = readFileSync(
        join(process.cwd(), 'drizzle/0018_graceful_lord_hawal.sql'),
        'utf8',
      );
      runSqlStatements(db, migrationSql);

      const migratedRow = db
        .prepare(`SELECT tags, form_cues AS formCues FROM exercises WHERE id = ?`)
        .get('exercise-pre-migration') as { tags: string; formCues: string };

      expect(JSON.parse(migratedRow.tags)).toEqual([]);
      expect(JSON.parse(migratedRow.formCues)).toEqual([]);
    } finally {
      db.close();
    }
  });
});

describe('migration 0025_meal_summary', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('adds summary column and backfills it from ordered meal items', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-migration-0025-'));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, 'migration.db');
    const db = new Database(dbPath);

    try {
      db.exec(`
        CREATE TABLE meals (
          id TEXT PRIMARY KEY NOT NULL,
          nutrition_log_id TEXT NOT NULL,
          name TEXT NOT NULL,
          time TEXT,
          notes TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      db.exec(`
        CREATE TABLE meal_items (
          id TEXT PRIMARY KEY NOT NULL,
          meal_id TEXT NOT NULL,
          food_id TEXT,
          name TEXT NOT NULL,
          amount REAL NOT NULL,
          unit TEXT NOT NULL,
          calories REAL NOT NULL,
          protein REAL NOT NULL,
          carbs REAL NOT NULL,
          fat REAL NOT NULL,
          created_at INTEGER NOT NULL
        );
      `);

      const now = Date.now();
      db.prepare(
        `
          INSERT INTO meals (
            id,
            nutrition_log_id,
            name,
            time,
            notes,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      ).run('meal-1', 'log-1', 'Lunch', '12:00', null, now, now);

      const insertMealItem = db.prepare(
        `
          INSERT INTO meal_items (
            id,
            meal_id,
            food_id,
            name,
            amount,
            unit,
            calories,
            protein,
            carbs,
            fat,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      );

      insertMealItem.run('item-1', 'meal-1', null, 'Orgain shake', 1, 'serving', 150, 30, 7, 4, now);
      insertMealItem.run('item-2', 'meal-1', null, 'milk', 1, 'cup', 120, 8, 12, 5, now + 1);
      insertMealItem.run('item-3', 'meal-1', null, 'creamer', 1, 'tbsp', 35, 0, 5, 1.5, now + 2);

      const migrationSql = readFileSync(join(process.cwd(), 'drizzle/0025_meal_summary.sql'), 'utf8');
      runSqlStatements(db, migrationSql);

      const migrated = db
        .prepare(`SELECT summary FROM meals WHERE id = ?`)
        .get('meal-1') as { summary: string | null };

      expect(migrated.summary).toBe('Orgain shake, milk, creamer');
    } finally {
      db.close();
    }
  });
});
