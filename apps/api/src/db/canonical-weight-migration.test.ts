import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, expect, it } from 'vitest';

import {
  prepareCanonicalWeightMigration,
  readLegacyWeightUnitMap,
  type LegacyWeightUnitMap,
  writeLegacyWeightUnitMap,
} from './canonical-weight-migration.js';

const migrationSql = readFileSync(
  join(process.cwd(), 'drizzle/0041_canonical_body_weight.sql'),
  'utf8',
);

const runMigration = (db: Database.Database) => {
  for (const statement of migrationSql
    .split('--> statement-breakpoint')
    .map((value) => value.trim())
    .filter(Boolean)) {
    db.exec(statement);
  }
};

const createLegacyDatabase = () => {
  const db = new Database(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      weight_unit TEXT DEFAULT 'lbs' NOT NULL
    );
    CREATE TABLE body_weight (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      weight REAL NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, date)
    );
  `);
  return db;
};

const insertLegacyWeight = (
  db: Database.Database,
  userId: string,
  preference: 'lbs' | 'kg',
  date: string,
  weight: number,
) => {
  db.prepare('INSERT OR IGNORE INTO users (id, weight_unit) VALUES (?, ?)').run(userId, preference);
  db.prepare(
    `INSERT INTO body_weight
      (id, user_id, date, weight, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, 1, 1)`,
  ).run(`${userId}-${date}`, userId, date, weight);
};

const reviewedMap = (users: Record<string, 'lbs' | 'kg'>): LegacyWeightUnitMap => ({
  version: 1,
  reviewedAt: '2026-08-12T00:00:00.000Z',
  reviewedBy: 'migration test',
  knownHistory: 'Explicit test fixture history.',
  users,
});

describe('canonical body-weight migration', () => {
  it('converts a pounds-only legacy database and preserves pounds compatibility', () => {
    const db = createLegacyDatabase();
    insertLegacyWeight(db, 'pounds-user', 'lbs', '2026-08-01', 180);

    const preflight = prepareCanonicalWeightMigration(db, {
      map: reviewedMap({ 'pounds-user': 'lbs' }),
      mapSha256: 'reviewed-map',
    });
    runMigration(db);

    expect(preflight).toEqual({
      affectedUsers: 1,
      legacyRows: 1,
      mapSha256: 'reviewed-map',
      state: 'legacy-mapped',
    });
    expect(
      db
        .prepare(
          'SELECT weight, weight_kg AS weightKg, unit_at_entry AS unitAtEntry FROM body_weight',
        )
        .get(),
    ).toEqual({
      weight: 180,
      weightKg: 81.6466266,
      unitAtEntry: 'lbs',
    });
    db.close();
  });

  it('converts kg legacy rows while fixing the compatibility column in pounds', () => {
    const db = createLegacyDatabase();
    insertLegacyWeight(db, 'kg-user', 'kg', '2026-08-01', 80);

    prepareCanonicalWeightMigration(db, { map: reviewedMap({ 'kg-user': 'kg' }) });
    runMigration(db);

    const row = db
      .prepare(
        'SELECT weight, weight_kg AS weightKg, unit_at_entry AS unitAtEntry FROM body_weight',
      )
      .get() as { weight: number; weightKg: number; unitAtEntry: string };
    expect(row.weightKg).toBe(80);
    expect(row.weight).toBeCloseTo(176.3698097, 6);
    expect(row.unitAtEntry).toBe('kg');
    expect(prepareCanonicalWeightMigration(db).state).toBe('already-canonical');
    db.close();
  });

  it('supports explicit mixed-user maps and does not infer from current preference', () => {
    const db = createLegacyDatabase();
    insertLegacyWeight(db, 'legacy-pounds-now-kg', 'kg', '2026-08-01', 180);
    insertLegacyWeight(db, 'legacy-kg-now-pounds', 'lbs', '2026-08-01', 80);

    prepareCanonicalWeightMigration(db, {
      map: reviewedMap({
        'legacy-pounds-now-kg': 'lbs',
        'legacy-kg-now-pounds': 'kg',
      }),
    });
    runMigration(db);

    expect(
      db
        .prepare(
          `SELECT user_id AS userId, weight_kg AS weightKg, unit_at_entry AS unitAtEntry
           FROM body_weight ORDER BY user_id`,
        )
        .all(),
    ).toEqual([
      { userId: 'legacy-kg-now-pounds', weightKg: 80, unitAtEntry: 'kg' },
      { userId: 'legacy-pounds-now-kg', weightKg: 81.6466266, unitAtEntry: 'lbs' },
    ]);
    db.close();
  });

  it.each([
    ['no map', undefined],
    ['missing assignment', reviewedMap({ 'user-a': 'lbs' })],
    ['unexpected assignment', reviewedMap({ 'user-a': 'lbs', 'user-b': 'kg', extra: 'lbs' })],
  ])('fails closed for an ambiguous legacy database: %s', (_label, map) => {
    const db = createLegacyDatabase();
    insertLegacyWeight(db, 'user-a', 'lbs', '2026-08-01', 180);
    insertLegacyWeight(db, 'user-b', 'kg', '2026-08-01', 80);

    expect(() => prepareCanonicalWeightMigration(db, { map })).toThrow(/explicit|ambiguous/u);
    expect(
      db
        .prepare(
          `SELECT count(*) AS count FROM pragma_table_info('body_weight') WHERE name = 'weight_kg'`,
        )
        .get(),
    ).toEqual({ count: 0 });
    expect(db.prepare('SELECT count(*) AS count FROM body_weight').get()).toEqual({ count: 2 });
    db.close();
  });

  it('guards the SQL migration when preflight mapping was not populated', () => {
    const db = createLegacyDatabase();
    insertLegacyWeight(db, 'unmapped-user', 'lbs', '2026-08-01', 180);

    expect(() => runMigration(db)).toThrow();
    expect(db.prepare('SELECT weight FROM body_weight').get()).toEqual({ weight: 180 });
    expect(
      db
        .prepare(
          `SELECT count(*) AS count FROM pragma_table_info('body_weight') WHERE name = 'weight_kg'`,
        )
        .get(),
    ).toEqual({ count: 0 });
    db.close();
  });

  it('migrates an empty legacy table and validates an already-canonical table', () => {
    const db = createLegacyDatabase();
    expect(prepareCanonicalWeightMigration(db).state).toBe('legacy-empty');
    runMigration(db);
    expect(prepareCanonicalWeightMigration(db).state).toBe('already-canonical');
    expect(
      db
        .prepare(
          `SELECT "notnull" AS required FROM pragma_table_info('body_weight') WHERE name = 'weight_kg'`,
        )
        .get(),
    ).toEqual({ required: 1 });
    expect(
      db
        .prepare(`PRAGMA index_list('body_weight')`)
        .all()
        .find((index) => (index as { name: string }).name === 'body_weight_user_id_date_unique'),
    ).toMatchObject({ partial: 0, unique: 1 });
    db.close();
  });

  it('reports a database before the initial schema as fresh', () => {
    const db = new Database(':memory:');
    expect(prepareCanonicalWeightMigration(db)).toEqual({
      affectedUsers: 0,
      legacyRows: 0,
      mapSha256: null,
      state: 'fresh-database',
    });
    db.close();
  });

  it('applies the complete migration chain to a fresh database', () => {
    const sqlite = new Database(':memory:');
    expect(prepareCanonicalWeightMigration(sqlite).state).toBe('fresh-database');

    migrate(drizzle(sqlite), { migrationsFolder: join(process.cwd(), 'drizzle') });

    const columns = sqlite.prepare(`PRAGMA table_info('body_weight')`).all() as Array<{
      name: string;
      notnull: number;
    }>;
    expect(columns.find((column) => column.name === 'weight_kg')?.notnull).toBe(1);
    expect(columns.find((column) => column.name === 'unit_at_entry')?.notnull).toBe(1);
    expect(prepareCanonicalWeightMigration(sqlite).state).toBe('already-canonical');
    sqlite.close();
  });

  it('forces migration-map mode 0600 on create and overwrite', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-weight-map-'));
    const mapPath = join(root, 'map.json');
    try {
      writeLegacyWeightUnitMap(mapPath, reviewedMap({ 'user-a': 'lbs' }));
      expect(statSync(mapPath).mode & 0o777).toBe(0o600);
      expect(readLegacyWeightUnitMap(mapPath).map.users).toEqual({ 'user-a': 'lbs' });

      writeFileSync(mapPath, '{}');
      chmodSync(mapPath, 0o644);
      writeLegacyWeightUnitMap(mapPath, reviewedMap({ 'user-b': 'kg' }));
      expect(statSync(mapPath).mode & 0o777).toBe(0o600);
      expect(readLegacyWeightUnitMap(mapPath).map.users).toEqual({ 'user-b': 'kg' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed for a canonical-looking table with nullable fields or missing invariants', () => {
    const db = new Database(':memory:');
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL);
      INSERT INTO users VALUES ('user-a');
      CREATE TABLE body_weight (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        weight REAL,
        weight_kg REAL,
        unit_at_entry TEXT,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO body_weight VALUES ('w1','user-a','2026-08-01',NULL,NULL,NULL,NULL,1,1);
    `);

    expect(() => prepareCanonicalWeightMigration(db)).toThrow(/schema|required|invariant/u);
    db.close();
  });

  it('fails closed when correctly named canonical checks are no-ops', () => {
    const db = new Database(':memory:');
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL);
      CREATE TABLE body_weight (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        weight REAL NOT NULL,
        weight_kg REAL NOT NULL,
        unit_at_entry TEXT NOT NULL,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CONSTRAINT body_weight_date_format_check CHECK (1),
        CONSTRAINT body_weight_weight_check CHECK (1),
        CONSTRAINT body_weight_weight_kg_check CHECK (1),
        CONSTRAINT body_weight_unit_at_entry_check CHECK (1),
        CONSTRAINT body_weight_legacy_pounds_check CHECK (1),
        UNIQUE(user_id, date)
      );
    `);

    expect(() => prepareCanonicalWeightMigration(db)).toThrow(/check constraints/u);
    db.close();
  });

  it('rejects a partial unique user/date index, including an ineffective WHERE 0 index', () => {
    const db = createLegacyDatabase();
    expect(prepareCanonicalWeightMigration(db).state).toBe('legacy-empty');
    runMigration(db);
    db.exec(`
      DROP INDEX body_weight_user_id_date_unique;
      CREATE UNIQUE INDEX body_weight_user_id_date_unique
        ON body_weight (user_id, date)
        WHERE 0;
    `);

    expect(
      db
        .prepare(`PRAGMA index_list('body_weight')`)
        .all()
        .find((index) => (index as { name: string }).name === 'body_weight_user_id_date_unique'),
    ).toMatchObject({ partial: 1, unique: 1 });
    expect(() => prepareCanonicalWeightMigration(db)).toThrow(/user\/date unique invariant/u);
    db.close();
  });

  it.each([
    ['an impossible calendar date', '2026-02-30', false],
    ['a non-ISO date format', '2026/02/28', true],
  ])('rejects existing canonical rows with %s', (_label, date, bypassChecks) => {
    const db = createLegacyDatabase();
    expect(prepareCanonicalWeightMigration(db).state).toBe('legacy-empty');
    runMigration(db);
    db.prepare(`INSERT INTO users (id, weight_unit) VALUES ('user-a', 'lbs')`).run();
    if (bypassChecks) db.pragma('ignore_check_constraints = ON');
    db.prepare(
      `INSERT INTO body_weight
        (id, user_id, date, weight, weight_kg, unit_at_entry, notes, created_at, updated_at)
       VALUES ('weight-a', 'user-a', ?, ?, 80, 'kg', NULL, 1, 1)`,
    ).run(date, 80 / 0.45359237);
    if (bypassChecks) db.pragma('ignore_check_constraints = OFF');

    expect(() => prepareCanonicalWeightMigration(db)).toThrow(/integrity|calendar date/u);
    db.close();
  });
});
