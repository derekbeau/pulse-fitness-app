import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

describe('migration 0039_thick_nebula', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('adds persisted seconds and distance columns to session sets without requiring old columns', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-migration-0039-'));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, 'migration.db');
    const db = new Database(dbPath);

    try {
      db.exec(`
        CREATE TABLE session_sets (
          id TEXT PRIMARY KEY NOT NULL,
          session_id TEXT NOT NULL,
          exercise_id TEXT,
          order_index INTEGER DEFAULT 0 NOT NULL,
          set_number INTEGER NOT NULL,
          weight REAL,
          reps INTEGER,
          rpe INTEGER,
          zone INTEGER,
          target_weight REAL,
          target_weight_min REAL,
          target_weight_max REAL,
          target_seconds INTEGER,
          target_distance REAL,
          superset_group TEXT,
          completed INTEGER DEFAULT false NOT NULL,
          skipped INTEGER DEFAULT false NOT NULL,
          section TEXT DEFAULT 'main' NOT NULL,
          notes TEXT,
          created_at INTEGER DEFAULT (unixepoch() * 1000) NOT NULL
        );

        INSERT INTO session_sets (
          id,
          session_id,
          exercise_id,
          order_index,
          set_number,
          weight,
          reps,
          rpe,
          zone,
          target_weight,
          target_weight_min,
          target_weight_max,
          target_seconds,
          target_distance,
          superset_group,
          completed,
          skipped,
          section,
          notes,
          created_at
        )
        VALUES (
          'set-1',
          'session-1',
          'exercise-1',
          0,
          1,
          NULL,
          10,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          30,
          NULL,
          NULL,
          1,
          0,
          'main',
          'Brace well',
          1779300000000
        );
      `);

      const migrationSql = readFileSync(
        join(process.cwd(), 'drizzle/0039_thick_nebula.sql'),
        'utf8',
      );
      runSqlStatements(db, migrationSql);

      const row = db
        .prepare(`SELECT reps, seconds, distance, notes FROM session_sets WHERE id = 'set-1'`)
        .get() as { distance: number | null; notes: string; reps: number; seconds: number | null };

      expect(row).toEqual({
        reps: 10,
        seconds: null,
        distance: null,
        notes: 'Brace well',
      });
    } finally {
      db.close();
    }
  });

  it('includes Drizzle snapshot metadata for persisted set seconds and distance', () => {
    const snapshotPath = join(process.cwd(), 'drizzle/meta/0039_snapshot.json');

    expect(existsSync(snapshotPath)).toBe(true);

    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as {
      tables: {
        session_sets: {
          columns: Record<string, unknown>;
          checkConstraints: Record<string, { value: string }>;
        };
      };
    };

    expect(snapshot.tables.session_sets.columns).toEqual(
      expect.objectContaining({
        seconds: expect.objectContaining({ type: 'integer' }),
        distance: expect.objectContaining({ type: 'real' }),
      }),
    );
    expect(snapshot.tables.session_sets.checkConstraints).toEqual(
      expect.objectContaining({
        session_sets_seconds_check: expect.objectContaining({
          value: expect.stringContaining('>= 0'),
        }),
        session_sets_distance_check: expect.objectContaining({
          value: expect.stringContaining('>= 0'),
        }),
      }),
    );
  });
});

describe('migration 0040_mcgill_curl_up_backfill', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('moves legacy McGill Curl-Up seconds out of reps and repairs template targets', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-migration-0040-'));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, 'migration.db');
    const db = new Database(dbPath);

    try {
      db.exec(`
        CREATE TABLE exercises (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          tracking_type TEXT NOT NULL
        );

        CREATE TABLE session_sets (
          id TEXT PRIMARY KEY NOT NULL,
          exercise_id TEXT,
          reps INTEGER,
          seconds INTEGER,
          target_seconds INTEGER
        );

        CREATE TABLE template_exercises (
          id TEXT PRIMARY KEY NOT NULL,
          exercise_id TEXT NOT NULL,
          reps_min INTEGER,
          reps_max INTEGER,
          set_targets TEXT
        );

        INSERT INTO exercises (id, name, tracking_type)
        VALUES
          ('mcgill', 'McGill Curl-Up', 'reps_seconds'),
          ('plank', 'Side Plank', 'seconds_only');

        INSERT INTO session_sets (id, exercise_id, reps, seconds, target_seconds)
        VALUES
          ('legacy-mcgill', 'mcgill', 5, NULL, NULL),
          ('new-mcgill', 'mcgill', 1, 10, NULL),
          ('other-exercise', 'plank', 30, NULL, NULL);

        INSERT INTO template_exercises (id, exercise_id, reps_min, reps_max, set_targets)
        VALUES
          ('week-template', 'mcgill', 10, 10, NULL),
          ('old-template', 'mcgill', 1, 1, '[{"setNumber":1,"targetSeconds":10}]');
      `);

      const migrationSql = readFileSync(
        join(process.cwd(), 'drizzle/0040_mcgill_curl_up_backfill.sql'),
        'utf8',
      );
      runSqlStatements(db, migrationSql);

      const rows = db
        .prepare(`SELECT id, reps, seconds, target_seconds AS targetSeconds FROM session_sets`)
        .all() as Array<{
        id: string;
        reps: number | null;
        seconds: number | null;
        targetSeconds: number | null;
      }>;

      expect(rows).toEqual(
        expect.arrayContaining([
          { id: 'legacy-mcgill', reps: 1, seconds: 5, targetSeconds: 10 },
          { id: 'new-mcgill', reps: 1, seconds: 10, targetSeconds: 10 },
          { id: 'other-exercise', reps: 30, seconds: null, targetSeconds: null },
        ]),
      );

      const repairedTemplate = db
        .prepare(
          `SELECT reps_min AS repsMin, reps_max AS repsMax, set_targets AS setTargets
           FROM template_exercises
           WHERE id = 'week-template'`,
        )
        .get() as { repsMin: number; repsMax: number; setTargets: string };

      expect(repairedTemplate).toEqual({
        repsMin: 1,
        repsMax: 1,
        setTargets: '[{"setNumber":1,"targetSeconds":10},{"setNumber":2,"targetSeconds":10}]',
      });
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

      insertMealItem.run(
        'item-1',
        'meal-1',
        null,
        'Orgain shake',
        1,
        'serving',
        150,
        30,
        7,
        4,
        now,
      );
      insertMealItem.run('item-2', 'meal-1', null, 'milk', 1, 'cup', 120, 8, 12, 5, now + 1);
      insertMealItem.run('item-3', 'meal-1', null, 'creamer', 1, 'tbsp', 35, 0, 5, 1.5, now + 2);

      const migrationSql = readFileSync(
        join(process.cwd(), 'drizzle/0025_meal_summary.sql'),
        'utf8',
      );
      runSqlStatements(db, migrationSql);

      const migrated = db.prepare(`SELECT summary FROM meals WHERE id = ?`).get('meal-1') as {
        summary: string | null;
      };

      expect(migrated.summary).toBe('Orgain shake, milk, creamer');
    } finally {
      db.close();
    }
  });

  it('caps backfilled summaries at 500 characters', () => {
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

      const longFoodName = 'x'.repeat(251);
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

      insertMealItem.run('item-1', 'meal-1', null, longFoodName, 1, 'serving', 150, 30, 7, 4, now);
      insertMealItem.run(
        'item-2',
        'meal-1',
        null,
        longFoodName,
        1,
        'serving',
        150,
        30,
        7,
        4,
        now + 1,
      );

      const migrationSql = readFileSync(
        join(process.cwd(), 'drizzle/0025_meal_summary.sql'),
        'utf8',
      );
      runSqlStatements(db, migrationSql);

      const migrated = db.prepare(`SELECT summary FROM meals WHERE id = ?`).get('meal-1') as {
        summary: string | null;
      };

      expect(migrated.summary).toHaveLength(500);
      expect(migrated.summary).toBe(`${longFoodName}, ${longFoodName.slice(0, 247)}`);
    } finally {
      db.close();
    }
  });
});

describe('migration 0026_sleepy_wild_pack', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('adds coaching_notes and related_exercise_ids with expected defaults for existing exercises', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-migration-0025-'));
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
          tags TEXT DEFAULT '[]' NOT NULL,
          form_cues TEXT DEFAULT '[]' NOT NULL,
          instructions TEXT,
          deleted_at TEXT,
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
            tags,
            form_cues,
            instructions,
            deleted_at,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        'exercise-pre-migration',
        'user-1',
        'Back Squat',
        JSON.stringify(['quads', 'glutes']),
        'barbell',
        'compound',
        'weight_reps',
        JSON.stringify([]),
        JSON.stringify([]),
        null,
        null,
        Date.now(),
        Date.now(),
      );

      const migrationSql = readFileSync(
        join(process.cwd(), 'drizzle/0026_sleepy_wild_pack.sql'),
        'utf8',
      );
      runSqlStatements(db, migrationSql);

      const migratedRow = db
        .prepare(
          `SELECT coaching_notes AS coachingNotes, related_exercise_ids AS relatedExerciseIds FROM exercises WHERE id = ?`,
        )
        .get('exercise-pre-migration') as {
        coachingNotes: string | null;
        relatedExerciseIds: string;
      };

      expect(migratedRow.coachingNotes).toBeNull();
      expect(JSON.parse(migratedRow.relatedExerciseIds)).toEqual([]);
    } finally {
      db.close();
    }
  });
});

describe('migration 0027_template_set_targets', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('adds template set target columns and session set target reference columns', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-migration-0026-'));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, 'migration.db');
    const db = new Database(dbPath);

    try {
      db.exec(`
        CREATE TABLE template_exercises (
          id TEXT PRIMARY KEY NOT NULL,
          template_id TEXT NOT NULL,
          exercise_id TEXT NOT NULL,
          order_index INTEGER NOT NULL,
          sets INTEGER,
          reps_min INTEGER,
          reps_max INTEGER,
          tempo TEXT,
          rest_seconds INTEGER,
          superset_group TEXT,
          section TEXT NOT NULL,
          notes TEXT,
          cues TEXT
        );
      `);

      db.exec(`
        CREATE TABLE session_sets (
          id TEXT PRIMARY KEY NOT NULL,
          session_id TEXT NOT NULL,
          exercise_id TEXT NOT NULL,
          order_index INTEGER NOT NULL,
          set_number INTEGER NOT NULL,
          weight REAL,
          reps INTEGER,
          completed INTEGER NOT NULL DEFAULT 0,
          skipped INTEGER NOT NULL DEFAULT 0,
          section TEXT,
          notes TEXT,
          created_at INTEGER NOT NULL
        );
      `);

      db.prepare(
        `
          INSERT INTO template_exercises (
            id,
            template_id,
            exercise_id,
            order_index,
            sets,
            reps_min,
            reps_max,
            tempo,
            rest_seconds,
            superset_group,
            section,
            notes,
            cues
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        'template-exercise-1',
        'template-1',
        'exercise-1',
        0,
        3,
        5,
        8,
        null,
        120,
        null,
        'main',
        null,
        '[]',
      );

      db.prepare(
        `
          INSERT INTO session_sets (
            id,
            session_id,
            exercise_id,
            order_index,
            set_number,
            weight,
            reps,
            completed,
            skipped,
            section,
            notes,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        'session-set-1',
        'session-1',
        'exercise-1',
        0,
        1,
        185,
        8,
        1,
        0,
        'main',
        null,
        Date.now(),
      );

      const migrationSql = readFileSync(
        join(process.cwd(), 'drizzle/0027_template_set_targets.sql'),
        'utf8',
      );
      runSqlStatements(db, migrationSql);

      db.prepare(
        `
          UPDATE template_exercises
          SET set_targets = ?, programming_notes = ?
          WHERE id = ?
        `,
      ).run(
        JSON.stringify([{ setNumber: 1, targetWeight: 185 }]),
        'Top-set before back-off volume.',
        'template-exercise-1',
      );

      db.prepare(
        `
          UPDATE session_sets
          SET target_weight = ?, target_weight_min = ?, target_weight_max = ?, target_seconds = ?, target_distance = ?
          WHERE id = ?
        `,
      ).run(185, 180, 190, 45, 0.8, 'session-set-1');

      const templateRow = db
        .prepare(
          `SELECT set_targets AS setTargets, programming_notes AS programmingNotes FROM template_exercises WHERE id = ?`,
        )
        .get('template-exercise-1') as {
        setTargets: string | null;
        programmingNotes: string | null;
      };
      const sessionSetRow = db
        .prepare(
          `SELECT target_weight AS targetWeight, target_weight_min AS targetWeightMin, target_weight_max AS targetWeightMax, target_seconds AS targetSeconds, target_distance AS targetDistance FROM session_sets WHERE id = ?`,
        )
        .get('session-set-1') as {
        targetWeight: number | null;
        targetWeightMin: number | null;
        targetWeightMax: number | null;
        targetSeconds: number | null;
        targetDistance: number | null;
      };

      expect(templateRow.programmingNotes).toBe('Top-set before back-off volume.');
      expect(templateRow.setTargets ? JSON.parse(templateRow.setTargets) : null).toEqual([
        { setNumber: 1, targetWeight: 185 },
      ]);
      expect(sessionSetRow).toEqual({
        targetWeight: 185,
        targetWeightMin: 180,
        targetWeightMax: 190,
        targetSeconds: 45,
        targetDistance: 0.8,
      });
    } finally {
      db.close();
    }
  });
});

describe('migration 0028_food_usage_and_tags', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('adds usage_count and tags defaults for foods', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-migration-0028-'));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, 'migration.db');
    const db = new Database(dbPath);

    try {
      db.exec(`
        CREATE TABLE foods (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          brand TEXT,
          serving_size TEXT,
          serving_grams REAL,
          calories REAL NOT NULL,
          protein REAL NOT NULL,
          carbs REAL NOT NULL,
          fat REAL NOT NULL,
          fiber REAL,
          sugar REAL,
          verified INTEGER NOT NULL DEFAULT 0,
          source TEXT,
          notes TEXT,
          last_used_at INTEGER,
          deleted_at TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      db.prepare(
        `
          INSERT INTO foods (
            id,
            user_id,
            name,
            calories,
            protein,
            carbs,
            fat,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run('food-pre-migration', 'user-1', 'Greek Yogurt', 90, 18, 5, 0, Date.now(), Date.now());

      const migrationSql = readFileSync(
        join(process.cwd(), 'drizzle/0028_food_usage_and_tags.sql'),
        'utf8',
      );
      runSqlStatements(db, migrationSql);

      const migratedRow = db
        .prepare(`SELECT usage_count AS usageCount, tags FROM foods WHERE id = ?`)
        .get('food-pre-migration') as { usageCount: number; tags: string };

      expect(migratedRow.usageCount).toBe(0);
      expect(JSON.parse(migratedRow.tags)).toEqual([]);

      const indexRows = db.prepare(`PRAGMA index_list('foods')`).all() as Array<{ name: string }>;
      expect(indexRows.some((indexRow) => indexRow.name === 'foods_user_usage_count_idx')).toBe(
        true,
      );
    } finally {
      db.close();
    }
  });
});

describe('migration 0029_agent_token_expiry', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('adds nullable expiry metadata and backfills last_rotated_at from created_at', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-migration-0029-'));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, 'migration.db');
    const db = new Database(dbPath);

    try {
      db.exec(`
        CREATE TABLE agent_tokens (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          last_used_at INTEGER,
          created_at INTEGER NOT NULL
        );
      `);

      db.prepare(
        `
          INSERT INTO agent_tokens (
            id,
            user_id,
            name,
            token_hash,
            last_used_at,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      ).run('token-1', 'user-1', 'Meal logger', 'hash', null, 1_700_000_000_000);

      const migrationSql = readFileSync(
        join(process.cwd(), 'drizzle/0029_agent_token_expiry.sql'),
        'utf8',
      );
      runSqlStatements(db, migrationSql);

      const migratedRow = db
        .prepare(
          `SELECT expires_at AS expiresAt, last_rotated_at AS lastRotatedAt FROM agent_tokens WHERE id = ?`,
        )
        .get('token-1') as { expiresAt: number | null; lastRotatedAt: number | null };

      expect(migratedRow).toEqual({
        expiresAt: null,
        lastRotatedAt: 1_700_000_000_000,
      });
    } finally {
      db.close();
    }
  });
});

describe('migration 0037 scheduled workout snapshot schema', () => {
  it('creates snapshot tables and adds scheduled workout linkage columns', () => {
    const migrationSql = readFileSync(
      join(process.cwd(), 'drizzle/0037_vengeful_tigra.sql'),
      'utf8',
    );

    expect(migrationSql).toContain('CREATE TABLE `scheduled_workout_exercises`');
    expect(migrationSql).toContain('CREATE TABLE `scheduled_workout_exercise_sets`');
    expect(migrationSql).toContain('ALTER TABLE `scheduled_workouts` ADD `template_version` text');
    expect(migrationSql).toContain('`scheduled_workout_id` text');
    expect(migrationSql).toContain('`exercise_agent_notes` text');
    expect(migrationSql).toContain('`exercise_agent_notes_meta` text');
    expect(migrationSql).toContain(
      'FOREIGN KEY (`scheduled_workout_id`) REFERENCES `scheduled_workouts`(`id`) ON UPDATE no action ON DELETE set null',
    );
  });
});

describe('migration 0038 duration activity support', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('allows duration tracking/category values and adds set effort columns', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-migration-0038-'));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, 'migration.db');
    const db = new Database(dbPath);

    try {
      db.exec(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY NOT NULL
        );

        CREATE TABLE exercises (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT,
          name TEXT NOT NULL,
          muscle_groups TEXT NOT NULL,
          equipment TEXT NOT NULL,
          category TEXT NOT NULL,
          tracking_type TEXT DEFAULT 'weight_reps' NOT NULL,
          tags TEXT DEFAULT '[]' NOT NULL,
          form_cues TEXT DEFAULT '[]' NOT NULL,
          instructions TEXT,
          coaching_notes TEXT,
          related_exercise_ids TEXT DEFAULT '[]' NOT NULL,
          deleted_at TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE session_sets (
          id TEXT PRIMARY KEY NOT NULL,
          session_id TEXT NOT NULL,
          exercise_id TEXT,
          order_index INTEGER DEFAULT 0 NOT NULL,
          set_number INTEGER NOT NULL,
          weight REAL,
          reps INTEGER,
          target_weight REAL,
          target_weight_min REAL,
          target_weight_max REAL,
          target_seconds INTEGER,
          target_distance REAL,
          superset_group TEXT,
          completed INTEGER DEFAULT 0 NOT NULL,
          skipped INTEGER DEFAULT 0 NOT NULL,
          section TEXT DEFAULT 'main' NOT NULL,
          notes TEXT,
          created_at INTEGER NOT NULL
        );
      `);

      const migrationSql = readFileSync(
        join(process.cwd(), 'drizzle/0038_duration_activity_support.sql'),
        'utf8',
      );
      expect(migrationSql).not.toContain('BEGIN TRANSACTION');
      expect(migrationSql.indexOf('ALTER TABLE `session_sets` ADD `rpe`')).toBeLessThan(
        migrationSql.indexOf('CREATE TABLE `__new_exercises`'),
      );
      runSqlStatements(db, migrationSql);

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
            tags,
            form_cues,
            instructions,
            coaching_notes,
            related_exercise_ids,
            deleted_at,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        'duration-exercise',
        null,
        'Yoga Flow',
        JSON.stringify(['full-body']),
        'mat',
        'cardio_flow',
        'duration',
        JSON.stringify([]),
        JSON.stringify([]),
        null,
        null,
        JSON.stringify([]),
        null,
        Date.now(),
        Date.now(),
      );

      db.prepare(
        `
          INSERT INTO session_sets (
            id,
            session_id,
            exercise_id,
            order_index,
            set_number,
            reps,
            rpe,
            zone,
            completed,
            skipped,
            section,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run('set-1', 'session-1', 'duration-exercise', 0, 1, 1800, 3, 2, 1, 0, 'main', Date.now());

      const row = db
        .prepare(`SELECT tracking_type AS trackingType, category FROM exercises WHERE id = ?`)
        .get('duration-exercise') as { trackingType: string; category: string };
      const setRow = db.prepare(`SELECT rpe, zone FROM session_sets WHERE id = ?`).get('set-1') as {
        rpe: number;
        zone: number;
      };

      expect(row).toEqual({ trackingType: 'duration', category: 'cardio_flow' });
      expect(setRow).toEqual({ rpe: 3, zone: 2 });
    } finally {
      db.close();
    }
  });

  it('includes Drizzle snapshot metadata for the duration schema', () => {
    const snapshotPath = join(process.cwd(), 'drizzle/meta/0038_snapshot.json');

    expect(existsSync(snapshotPath)).toBe(true);

    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as {
      tables: {
        exercises: {
          checkConstraints: Record<string, { value: string }>;
        };
        session_sets: {
          columns: Record<string, unknown>;
          checkConstraints: Record<string, { value: string }>;
        };
      };
    };

    expect(snapshot.tables.exercises.checkConstraints.exercises_category_check.value).toContain(
      "'cardio_flow'",
    );
    expect(
      snapshot.tables.exercises.checkConstraints.exercises_tracking_type_check.value,
    ).toContain("'duration'");
    expect(snapshot.tables.session_sets.columns).toEqual(
      expect.objectContaining({
        rpe: expect.objectContaining({ type: 'integer' }),
        zone: expect.objectContaining({ type: 'integer' }),
      }),
    );
    expect(snapshot.tables.session_sets.checkConstraints).toEqual(
      expect.objectContaining({
        session_sets_rpe_check: expect.objectContaining({
          value: expect.stringContaining('between 1 and 10'),
        }),
        session_sets_zone_check: expect.objectContaining({
          value: expect.stringContaining('between 1 and 5'),
        }),
      }),
    );
  });
});
