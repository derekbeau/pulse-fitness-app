import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { backfillAdaptiveNutritionGoals } from '../db/adaptive-goal-backfill.js';
import { prepareCanonicalWeightMigrationFromEnvironment } from '../db/canonical-weight-migration.js';

type Arguments = { source: string; output: string };

const parseArguments = (values: string[]): Arguments => {
  const result: Partial<Arguments> = {};
  for (let index = 0; index < values.length; index += 1) {
    const option = values[index];
    const value = values[index + 1];
    if ((option !== '--source' && option !== '--output') || !value) {
      throw new Error('Usage: --source <isolated-snapshot.db> --output <new-rehearsal.db>');
    }
    const key = option === '--source' ? 'source' : 'output';
    if (result[key]) throw new Error(`Duplicate option: ${option}`);
    result[key] = resolve(value);
    index += 1;
  }
  if (!result.source || !result.output) {
    throw new Error('Both --source and --output are required');
  }
  if (result.source === result.output) throw new Error('Source and output must be different files');
  if (!existsSync(result.source)) throw new Error('Source snapshot does not exist');
  if (existsSync(result.output)) throw new Error('Output rehearsal database already exists');
  const stat = lstatSync(result.source);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('Source snapshot must be a regular, non-symlink file');
  }
  return result as Arguments;
};

const familyPaths = (path: string) => [path, `${path}-wal`, `${path}-shm`].filter(existsSync);
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const hashFamily = (path: string) =>
  Object.fromEntries(familyPaths(path).map((member) => [member, sha256(member)]));
const foreignKeyViolationKey = (violation: unknown) => JSON.stringify(violation);

export const rehearseAdaptiveGoalMigration = ({ source, output }: Arguments) => {
  const sourceBefore = hashFamily(source);
  for (const member of familyPaths(source)) {
    const destination = member === source ? output : `${output}${member.slice(source.length)}`;
    copyFileSync(member, destination);
    chmodSync(destination, 0o600);
  }

  const sqlite = new Database(output);
  try {
    const foreignKeyViolationsBefore = sqlite.pragma('foreign_key_check') as unknown[];
    const weightPreflight = prepareCanonicalWeightMigrationFromEnvironment(sqlite);
    sqlite.pragma('foreign_keys = OFF');
    migrate(drizzle(sqlite), { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    sqlite.pragma('foreign_keys = ON');
    const backfill = backfillAdaptiveNutritionGoals(sqlite);
    const quickCheck = sqlite.pragma('quick_check') as Array<{ quick_check: string }>;
    const foreignKeyViolations = sqlite.pragma('foreign_key_check') as unknown[];
    const baselineForeignKeyViolations = new Set(
      foreignKeyViolationsBefore.map(foreignKeyViolationKey),
    );
    const counts = sqlite
      .prepare(
        `SELECT
           (SELECT count(*) FROM adaptive_nutrition_goals) AS goals,
           (SELECT count(*) FROM adaptive_nutrition_goal_revisions) AS revisions,
           (SELECT count(*) FROM adaptive_nutrition_checkins WHERE goal_id IS NULL) AS historicalUnlinked,
           (SELECT count(*) FROM adaptive_nutrition_goals WHERE status = 'active') AS activeGoals`,
      )
      .get();
    const sourceAfter = hashFamily(source);
    if (JSON.stringify(sourceAfter) !== JSON.stringify(sourceBefore)) {
      throw new Error('Source SQLite family changed during isolated rehearsal');
    }
    return {
      sourceBefore,
      sourceAfter,
      weightPreflight,
      backfill,
      quickCheck,
      foreignKeyViolationsBefore,
      foreignKeyViolations,
      introducedForeignKeyViolations: foreignKeyViolations.filter(
        (violation) => !baselineForeignKeyViolations.has(foreignKeyViolationKey(violation)),
      ),
      counts,
    };
  } finally {
    sqlite.close();
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(rehearseAdaptiveGoalMigration(parseArguments(process.argv.slice(2)))));
}
