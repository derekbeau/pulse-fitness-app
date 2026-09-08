import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const separator = process.argv.indexOf('--');
if (separator < 3 || separator === process.argv.length - 1) {
  console.error('Usage: node run-receipt.mjs <output-prefix> -- <command> [args...]');
  process.exit(64);
}

const prefix = resolve(process.argv[2]);
const argv = process.argv.slice(separator + 1);
const git = (...args) => {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
};
const startedAt = new Date().toISOString();
const commit = git('rev-parse', 'HEAD');
const branch = git('branch', '--show-current');
const worktree = git('rev-parse', '--show-toplevel');
const statusBefore = git('status', '--short');
const diffBytes = spawnSync('git', ['diff', '--binary', 'HEAD'], { encoding: null }).stdout;
const dirtyPatchSha256 = createHash('sha256').update(diffBytes).digest('hex');
const cacheControls = Object.fromEntries(
  ['TURBO_FORCE', 'TURBO_CONCURRENCY', 'TURBO_ENV_MODE', 'PULSE_TEST_NOW', 'CI']
    .filter((name) => process.env[name] !== undefined)
    .map((name) => [name, process.env[name]]),
);

mkdirSync(dirname(prefix), { recursive: true });
let output = Buffer.alloc(0);
const child = spawn(argv[0], argv.slice(1), {
  cwd: worktree,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    output = Buffer.concat([output, Buffer.from(chunk)]);
    process.stdout.write(chunk);
  });
}
const exitCode = await new Promise((resolveExit, reject) => {
  child.on('error', reject);
  child.on('close', (code, signal) => resolveExit(code ?? (signal ? 128 : 1)));
});
const endedAt = new Date().toISOString();
const command = argv.map((argument) => JSON.stringify(argument)).join(' ');
const header = [
  'RECEIPT_FORMAT: pulse-151-raw-v1',
  `TESTED_COMMIT: ${commit}`,
  `BRANCH: ${branch}`,
  `WORKTREE: ${worktree}`,
  `WORKTREE_DIRTY_BEFORE: ${statusBefore.length > 0}`,
  `DIRTY_PATCH_SHA256: ${dirtyPatchSha256}`,
  `STARTED_UTC: ${startedAt}`,
  `COMMAND_ARGV_JSON: ${JSON.stringify(argv)}`,
  `COMMAND: ${command}`,
  `CACHE_CONTROLS_JSON: ${JSON.stringify(cacheControls)}`,
  'STDOUT_STDERR_BEGIN',
  '',
].join('\n');
const footer = [
  '',
  'STDOUT_STDERR_END',
  `ENDED_UTC: ${endedAt}`,
  `EXIT_CODE: ${exitCode}`,
  '',
].join('\n');
const rawLog = Buffer.concat([Buffer.from(header), output, Buffer.from(footer)]);
writeFileSync(`${prefix}.log`, rawLog);
const receipt = {
  receiptFormat: 'pulse-151-json-v1',
  testedCommit: commit,
  branch,
  worktree,
  worktreeDirtyBefore: statusBefore.length > 0,
  statusBefore,
  dirtyPatchSha256,
  argv,
  command,
  cacheControls,
  startedAt,
  endedAt,
  exitCode,
  combinedOutputSha256: createHash('sha256').update(output).digest('hex'),
  rawLog: `${prefix}.log`,
  rawLogSha256: createHash('sha256').update(rawLog).digest('hex'),
};
writeFileSync(`${prefix}.json`, `${JSON.stringify(receipt, null, 2)}\n`);
process.exit(exitCode);
