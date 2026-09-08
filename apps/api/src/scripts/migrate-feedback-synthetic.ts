import Database from 'better-sqlite3';
import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import {
  runFeedbackMigration,
  rollbackFeedbackMigration,
} from '../db/feedback-provenance-migration.js';

// Validate the path before opening SQLite: this command must never create a DB or open a live path.
const args = process.argv.slice(2);
const modes = args.filter((arg) => ['--dry-run', '--apply', '--rollback'].includes(arg));
const read = (flag: string) => args[args.indexOf(flag) + 1];
const path = resolve(read('--fixture') ?? '');
const acknowledgement = args.includes('--acknowledge-synthetic-only')
  ? 'I_ACKNOWLEDGE_SYNTHETIC_FIXTURE_ONLY'
  : '';
if (modes.length !== 1 || !args.includes('--fixture') || !acknowledgement)
  throw new Error(
    'Use one mode, --fixture <temporary fixture.db>, and --acknowledge-synthetic-only.',
  );
const stat = lstatSync(path);
if (
  !stat.isFile() ||
  stat.isSymbolicLink() ||
  stat.nlink !== 1 ||
  realpathSync(path) !== path ||
  !path.startsWith(realpathSync(tmpdir()) + sep) ||
  basename(path) !== 'fixture.db' ||
  !basename(dirname(path)).startsWith('pulse-feedback-synthetic-')
)
  throw new Error('Refusing a non-synthetic fixture path before opening SQLite.');
const db = new Database(path, { fileMustExist: true, readonly: modes[0] === '--dry-run' });
try {
  const result =
    modes[0] === '--rollback'
      ? rollbackFeedbackMigration(db, acknowledgement)
      : runFeedbackMigration(db, {
          mode: modes[0] === '--apply' ? 'apply' : 'dry-run',
          classifiedAt: args.includes('--classified-at')
            ? (read('--classified-at') ?? '')
            : new Date().toISOString(),
          acknowledgement,
          ...(args.includes('--owner') ? { ownerId: read('--owner') } : {}),
        });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} finally {
  db.close();
}
