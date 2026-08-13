import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..');
const secretFixture = 'runtime-secrets/body-weight-legacy-unit-map.json';

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  assert.equal(result.status, 0, `${command} failed:\n${result.stderr || result.stdout}`);
  return result;
};

describe('runtime migration-map isolation', () => {
  it('keeps the host-only map out of Git and the Docker build context', (context) => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-runtime-secrets-'));
    context.after(() => rmSync(root, { recursive: true, force: true }));

    const gitContext = join(root, 'git-context');
    mkdirSync(join(gitContext, 'runtime-secrets'), { recursive: true });
    copyFileSync(join(repoRoot, '.gitignore'), join(gitContext, '.gitignore'));
    writeFileSync(join(gitContext, secretFixture), '{"fixture":"not-a-secret"}\n');
    run('git', ['init', '--quiet'], { cwd: gitContext });
    const ignored = run('git', ['check-ignore', '--verbose', secretFixture], { cwd: gitContext });
    assert.match(ignored.stdout, /runtime-secrets/);

    const dockerContext = join(root, 'docker-context');
    const dockerOutput = join(root, 'docker-output');
    mkdirSync(join(dockerContext, 'runtime-secrets'), { recursive: true });
    copyFileSync(join(repoRoot, '.dockerignore'), join(dockerContext, '.dockerignore'));
    writeFileSync(join(dockerContext, secretFixture), '{"fixture":"not-a-secret"}\n');
    writeFileSync(join(dockerContext, 'included-fixture.txt'), 'included\n');
    run(
      'docker',
      [
        'buildx',
        'build',
        '--file',
        '-',
        '--output',
        `type=local,dest=${dockerOutput}`,
        dockerContext,
      ],
      { input: 'FROM scratch\nCOPY . /\n' },
    );

    assert.equal(existsSync(join(dockerOutput, 'included-fixture.txt')), true);
    assert.equal(existsSync(join(dockerOutput, secretFixture)), false);
    assert.equal(existsSync(join(dockerOutput, 'runtime-secrets')), false);
  });
});
