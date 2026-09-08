import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

export default async function setup() {
  const database = process.env.E2E_DATABASE_URL;
  const owner = JSON.parse(readFileSync(database + '.owner.json', 'utf8'));
  assert.equal(owner.head, execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
  const servers = [];
  for (const port of [3160, 5260]) {
    const pids = [
      ...new Set(
        execFileSync('lsof', ['-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
          .trim()
          .split('\n'),
      ),
    ];
    assert.equal(pids.length, 1);
    const pid = pids[0];
    const cwd = execFileSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], { encoding: 'utf8' });
    assert.ok(cwd.includes(owner.root + (port === 3160 ? '/apps/api' : '/apps/web')));
    const files = execFileSync('lsof', ['-p', pid, '-Fn'], { encoding: 'utf8' });
    if (port === 3160)
      assert.ok(files.includes(`n${database}\n`), 'API owns the assigned fixture DB');
    servers.push({
      port,
      pid: Number(pid),
      cwd: cwd
        .split('\n')
        .find((line) => line.startsWith('n'))
        ?.slice(1),
      assignedDatabaseOpen: port === 3160,
    });
  }
  const stat = statSync(database);
  const live = {
    runId: owner.runId,
    head: owner.head,
    database,
    inode: stat.ino,
    uid: stat.uid,
    servers,
    readyAt: new Date().toISOString(),
  };
  writeFileSync(
    new URL('./browser-ownership.json', import.meta.url),
    JSON.stringify(live, null, 2) + '\n',
  );
  console.log('Owned harness servers ready; awaiting the built-in browser first receipt.');
  // Explicit operator handoff before Playwright creates any browser/page fixture.
  // This is not a test retry or a change to the 5s/15s regression-test deadlines.
  const receiptURL = new URL('./builtin-browser-first.json', import.meta.url);
  const deadline = Date.now() + 180_000;
  while (!existsSync(receiptURL)) {
    if (Date.now() >= deadline) throw new Error('Built-in browser first handoff was not received');
    await delay(200);
  }
  const receipt = JSON.parse(readFileSync(receiptURL, 'utf8'));
  assert.equal(receipt.head, owner.head);
  assert.equal(receipt.runId, owner.runId, 'built-in receipt must belong to this harness run');
  assert.equal(receipt.browser, 'iab');
  assert.equal(receipt.url, 'http://127.0.0.1:5260/api/docs');
  assert.equal(receipt.observedSwagger, true);
}
