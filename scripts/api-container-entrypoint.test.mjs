import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..');
const entrypoint = join(repoRoot, 'scripts/api-container-entrypoint.sh');
const createFixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'pulse-entrypoint-'));
  return root;
};

const runSqlite = (databasePath, sql) => {
  const result = spawnSync('sqlite3', [databasePath, sql], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
};

const runPreflight = (databasePath, mapPath) =>
  spawnSync('sh', [entrypoint], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BODY_WEIGHT_LEGACY_UNIT_MAP_PATH: mapPath,
      DATABASE_URL: databasePath,
      PULSE_APP_ROOT: repoRoot,
      PULSE_ENTRYPOINT_PREFLIGHT_ONLY: '1',
    },
  });

const createMap = (mapPath, mode = 0o600) => {
  mkdirSync(dirname(mapPath), { recursive: true });
  writeFileSync(mapPath, '{}', { mode });
  chmodSync(mapPath, mode);
};

describe('API container migration-map preflight', () => {
  it('starts fresh, legacy-empty, and already-canonical databases without a map', (context) => {
    const root = createFixture();
    context.after(() => rmSync(root, { recursive: true, force: true }));
    const missingMap = join(root, 'secrets/map.json');

    const fresh = join(root, 'fresh.db');
    runSqlite(fresh, 'CREATE TABLE users (id TEXT PRIMARY KEY);');
    assert.equal(runPreflight(fresh, missingMap).status, 0);

    const legacyEmpty = join(root, 'legacy-empty.db');
    runSqlite(
      legacyEmpty,
      'CREATE TABLE body_weight (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, weight REAL NOT NULL);',
    );
    assert.equal(runPreflight(legacyEmpty, missingMap).status, 0);

    const canonical = join(root, 'canonical.db');
    runSqlite(
      canonical,
      'CREATE TABLE body_weight (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, weight REAL NOT NULL, weight_kg REAL NOT NULL, unit_at_entry TEXT NOT NULL);',
    );
    assert.equal(runPreflight(canonical, missingMap).status, 0);
  });

  it('fails closed for non-empty legacy data without a secure map', (context) => {
    const root = createFixture();
    context.after(() => rmSync(root, { recursive: true, force: true }));
    const databasePath = join(root, 'legacy.db');
    const mapPath = join(root, 'secrets/map.json');
    runSqlite(
      databasePath,
      "CREATE TABLE body_weight (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, weight REAL NOT NULL); INSERT INTO body_weight VALUES ('w1','u1',180);",
    );

    const absent = runPreflight(databasePath, mapPath);
    assert.notEqual(absent.status, 0, JSON.stringify(absent));
    assert.match(absent.stderr, /not mounted/);

    createMap(mapPath, 0o644);
    const permissive = runPreflight(databasePath, mapPath);
    assert.notEqual(permissive.status, 0, JSON.stringify(permissive));
    assert.match(permissive.stderr, /0600/);
  });

  it('accepts a regular mode-0600 map for non-empty legacy data', (context) => {
    const root = createFixture();
    context.after(() => rmSync(root, { recursive: true, force: true }));
    const databasePath = join(root, 'legacy.db');
    const mapPath = join(root, 'secrets/map.json');
    runSqlite(
      databasePath,
      "CREATE TABLE body_weight (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, weight REAL NOT NULL); INSERT INTO body_weight VALUES ('w1','u1',180);",
    );
    createMap(mapPath);

    const result = runPreflight(databasePath, mapPath);
    assert.equal(result.status, 0, JSON.stringify(result));
    assert.match(result.stdout, /mount verified/);
  });
});
