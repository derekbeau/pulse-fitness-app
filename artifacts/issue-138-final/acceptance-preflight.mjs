import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
const root = '/Users/meridian/Projects/pulse-food-reuse';
const database =
  '/Users/meridian/Projects/qa-reports/pulse-parallel-networking/fixtures/pulse160/pulse-e2e.db';
assert.equal(realpathSync(process.cwd()), root);
for (const [key, value] of Object.entries({
  PULSE_ACCEPTANCE_LANE: 'pulse160',
  API_PORT: '3160',
  E2E_PORT: '5260',
  BASE_URL: 'http://127.0.0.1:5260',
  API_BASE_URL: 'http://127.0.0.1:3160',
  E2E_DATABASE_URL: database,
})) {
  assert.equal(process.env[key], value, key);
}
const ports = {};
for (const port of [3160, 5260]) {
  try {
    const listeners = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
    });
    throw new Error(`Port ${port} already owned; will not adopt or stop it: ${listeners}`);
  } catch (error) {
    if (error.status !== 1) throw error;
    ports[port] = 'no listener';
  }
}
for (const suffix of ['', '-wal', '-shm'])
  assert.equal(
    existsSync(database + suffix),
    false,
    `Refusing existing fixture ${database + suffix}`,
  );
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
assert.equal(git('branch', '--show-current'), 'feat/ranked-food-reuse');
const receipt = {
  runId: randomUUID(),
  root,
  branch: git('branch', '--show-current'),
  head: git('rev-parse', 'HEAD'),
  status: git('status', '--short'),
  database,
  ports,
  fixtureAbsent: true,
  hostname: hostname(),
  uid: process.getuid(),
  launcherPid: process.pid,
  createdAt: new Date().toISOString(),
};
writeFileSync(database + '.owner.json', JSON.stringify(receipt, null, 2) + '\n', {
  flag: 'wx',
  mode: 0o600,
});
writeFileSync(
  new URL('./browser-preflight.json', import.meta.url),
  JSON.stringify(receipt, null, 2) + '\n',
  { flag: 'wx' },
);
console.log(JSON.stringify(receipt, null, 2));
