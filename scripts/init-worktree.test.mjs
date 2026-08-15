import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  deriveDefaultWorktreePath,
  hasProcessExited,
  parseArguments,
  parseWorktreePaths,
  readReservedPorts,
  renderWorktreeEnvironment,
} from './init-worktree.mjs';

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('worktree initializer', () => {
  it('derives a deterministic sibling path from a slash-delimited branch', () => {
    assert.equal(
      deriveDefaultWorktreePath(
        '/Users/example/Projects/pulse-fitness-app',
        'codex/adaptive-preview',
      ),
      '/Users/example/Projects/pulse-fitness-app-codex-adaptive-preview',
    );
  });

  it('parses defaults and explicit overrides', () => {
    const defaults = parseArguments(
      ['--', 'codex/example'],
      '/Users/example/Projects/pulse-fitness-app',
      '/Users/example/Projects/pulse-fitness-app',
    );
    assert.equal(defaults.base, 'origin/main');
    assert.equal(defaults.fetch, true);
    assert.equal(defaults.smoke, true);
    assert.equal(defaults.worktreePath, '/Users/example/Projects/pulse-fitness-app-codex-example');

    const explicit = parseArguments(
      [
        'feat/example',
        '../pulse-example',
        '--base=main',
        '--api-port=3201',
        '--web-port=5301',
        '--container=pulse-api-test',
        '--no-fetch',
        '--skip-smoke',
      ],
      '/Users/example/Projects/pulse-fitness-app',
      '/Users/example/Projects/pulse-fitness-app',
    );
    assert.equal(explicit.worktreePath, '/Users/example/Projects/pulse-example');
    assert.equal(explicit.apiPort, 3201);
    assert.equal(explicit.webPort, 5301);
    assert.equal(explicit.container, 'pulse-api-test');
    assert.equal(explicit.fetch, false);
    assert.equal(explicit.smoke, false);
  });

  it('rejects unknown options and unsafe port values', () => {
    assert.throws(() => parseArguments(['codex/example', '--wat'], '/repo'), /Unknown option/);
    assert.throws(
      () => parseArguments(['codex/example', '--api-port=80'], '/repo'),
      /between 1024 and 65535/,
    );
  });

  it('reads worktree paths and reserves generated environment ports', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-worktree-script-test-'));
    temporaryDirectories.push(root);
    const first = join(root, 'first');
    const second = join(root, 'second');
    mkdirSync(first);
    mkdirSync(second);
    writeFileSync(join(first, '.env'), 'PORT=3102\nVITE_PORT=5274\n');
    writeFileSync(join(second, '.env'), 'PORT="3103"\nVITE_PORT="5275"\n');

    const paths = parseWorktreePaths(
      `worktree ${first}\nHEAD abc\n\nworktree ${second}\nHEAD def\n`,
    );
    assert.deepEqual(paths, [first, second]);
    assert.deepEqual(
      [...readReservedPorts(paths)].sort((a, b) => a - b),
      [3102, 3103, 5274, 5275],
    );
  });

  it('renders a localhost-only environment with an absolute database path', () => {
    const environment = renderWorktreeEnvironment({
      apiPort: 3104,
      databasePath: '/Users/example/Pulse Feature/apps/api/data/pulse-worktree.db',
      webPort: 5276,
    });
    assert.match(environment, /^HOST=127\.0\.0\.1$/mu);
    assert.match(environment, /^VITE_HOST=127\.0\.0\.1$/mu);
    assert.match(environment, /^PORT=3104$/mu);
    assert.match(environment, /^VITE_PORT=5276$/mu);
    assert.match(
      environment,
      /^DATABASE_URL="\/Users\/example\/Pulse Feature\/apps\/api\/data\/pulse-worktree\.db"$/mu,
    );
  });

  it('recognizes both normal and signal-based child process exits', () => {
    assert.equal(hasProcessExited({ exitCode: null, signalCode: null }), false);
    assert.equal(hasProcessExited({ exitCode: 0, signalCode: null }), true);
    assert.equal(hasProcessExited({ exitCode: null, signalCode: 'SIGTERM' }), true);
  });
});
