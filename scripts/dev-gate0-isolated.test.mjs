import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  GATE0_DATABASE_RELATIVE_PATH,
  GATE0_WEIGHT_MAP_RELATIVE_PATH,
  createGate0Environment,
  resolveGate0Config,
  validateGate0Database,
  validateGate0WebHost,
} from './dev-gate0-isolated.mjs';

const tempRoots = [];

const createFixture = () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'pulse-gate0-'));
  tempRoots.push(repoRoot);
  const databasePath = resolve(repoRoot, GATE0_DATABASE_RELATIVE_PATH);
  mkdirSync(resolve(databasePath, '..'), { recursive: true });
  writeFileSync(databasePath, 'isolated fixture');
  return { databasePath, repoRoot };
};

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe('Gate 0 isolated development startup', () => {
  it('enforces the isolated database and all three fixed port values', () => {
    const { databasePath, repoRoot } = createFixture();
    const config = resolveGate0Config(repoRoot);
    const environment = createGate0Environment(
      {
        DATABASE_URL: '/data/pulse.db',
        PORT: '3001',
        VITE_API_PORT: '3001',
        VITE_PORT: '5173',
      },
      config,
    );

    assert.equal(validateGate0Database(repoRoot, config.databasePath), realpathSync(databasePath));
    assert.equal(environment.DATABASE_URL, databasePath);
    assert.equal(
      environment.BODY_WEIGHT_LEGACY_UNIT_MAP_PATH,
      resolve(repoRoot, GATE0_WEIGHT_MAP_RELATIVE_PATH),
    );
    assert.equal(environment.PORT, '3102');
    assert.equal(environment.API_URL, 'http://127.0.0.1:5274');
    assert.equal(environment.VITE_API_PORT, '3102');
    assert.equal(environment.VITE_API_PROXY_TARGET, 'http://127.0.0.1:3102');
    assert.equal(environment.VITE_PORT, '5274');
    assert.equal(config.webHost, '127.0.0.1');
  });

  it('allows only loopback or an exact Tailscale IPv4 preview host', () => {
    assert.equal(validateGate0WebHost('127.0.0.1'), '127.0.0.1');
    assert.equal(validateGate0WebHost('100.64.0.1'), '100.64.0.1');
    assert.equal(validateGate0WebHost('100.127.255.254'), '100.127.255.254');
    for (const rejectedHost of ['0.0.0.0', '192.168.1.5', '100.63.255.255', '100.128.0.1']) {
      assert.throws(() => validateGate0WebHost(rejectedHost), /Refusing Gate 0 startup/);
    }
  });

  it('advertises the reachable Tailscale-hosted web origin to Swagger', () => {
    const { repoRoot } = createFixture();
    const config = resolveGate0Config(repoRoot, '100.87.91.127');
    const environment = createGate0Environment({}, config);

    assert.equal(environment.API_URL, 'http://100.87.91.127:5274');
  });

  it('rejects default, production, snapshot, and arbitrary database paths', () => {
    const { repoRoot } = createFixture();
    const rejectedPaths = [
      'apps/api/data/pulse.db',
      '/data/pulse.db',
      'apps/api/data/pulse-prod-snapshot-20260812.db',
      'apps/api/data/pulse-production.db',
      'data/another-dev.db',
    ];

    for (const rejectedPath of rejectedPaths) {
      assert.throws(() => validateGate0Database(repoRoot, rejectedPath), /Refusing Gate 0 startup/);
    }
  });

  it('rejects a missing, read-only, or symlinked isolated database', () => {
    const missingFixture = createFixture();
    rmSync(missingFixture.databasePath);
    assert.throws(
      () => validateGate0Database(missingFixture.repoRoot, missingFixture.databasePath),
      /ENOENT/,
    );

    const readOnlyFixture = createFixture();
    chmodSync(readOnlyFixture.databasePath, 0o400);
    assert.throws(
      () => validateGate0Database(readOnlyFixture.repoRoot, readOnlyFixture.databasePath),
      /not writable/,
    );

    const symlinkFixture = createFixture();
    const externalDatabase = resolve(symlinkFixture.repoRoot, 'external.db');
    writeFileSync(externalDatabase, 'external fixture');
    rmSync(symlinkFixture.databasePath);
    symlinkSync(externalDatabase, symlinkFixture.databasePath);
    assert.throws(
      () => validateGate0Database(symlinkFixture.repoRoot, symlinkFixture.databasePath),
      /non-symlink/,
    );
  });
});
