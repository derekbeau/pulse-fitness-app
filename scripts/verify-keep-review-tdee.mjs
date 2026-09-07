// Literal serial, uncached receipts for the committed issue137 checkout.
import { spawnSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
const cwd = process.cwd();
const git = (...args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
};
const head = git('rev-parse', 'HEAD');
const branch = git('branch', '--show-current');
if (branch !== 'fix/keep-review-tdee-learning' || git('status', '--porcelain') !== '') {
  throw new Error('Final receipts require the intended branch and a clean committed tree');
}
const output = join('/Users/meridian/Projects/qa-reports/pulse-pr137-launch', head);
mkdirSync(output, { recursive: true });
const commands = [
  ['pnpm', 'lint', '--force', '--concurrency=1'],
  ['pnpm', 'typecheck', '--force', '--concurrency=1'],
  ['pnpm', 'test', '--force', '--concurrency=1', '--', '--maxWorkers=1'],
  ['pnpm', 'build', '--force', '--concurrency=1'],
  ['git', 'diff', '--check'],
  ['git', 'status', '--porcelain'],
];
const receipts = [];
for (const [index, command] of commands.entries()) {
  const log = join(output, `${index + 1}-${command[1]}.log`);
  const startedAt = new Date().toISOString();
  writeFileSync(
    log,
    `HEAD ${head}\nBRANCH ${branch}\nCWD ${cwd}\nCOMMAND ${command.join(' ')}\nSTART ${startedAt}\n`,
  );
  const fd = openSync(log, 'a');
  const result = spawnSync(command[0], command.slice(1), { cwd, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  const finishedAt = new Date().toISOString();
  const receipt = {
    head,
    branch,
    cwd,
    command,
    startedAt,
    finishedAt,
    exitCode: result.status,
    signal: result.signal,
    log,
  };
  receipts.push(receipt);
  appendFileSync(log, `\nEXIT ${result.status}\nEND ${finishedAt}\n`);
  writeFileSync(join(output, 'receipts.json'), JSON.stringify(receipts, null, 2));
  globalThis.console.log(`${command.join(' ')}: exit ${result.status}; ${log}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (git('rev-parse', 'HEAD') !== head || git('status', '--porcelain') !== '') {
  throw new Error('Checkout changed while verifying');
}
