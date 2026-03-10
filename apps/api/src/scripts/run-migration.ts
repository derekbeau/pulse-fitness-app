import { pathToFileURL } from 'node:url';

import { sqlite } from '../db/index.js';
import {
  DEFAULT_STATIC_DATA_ROOT,
  migrateDailyLogsAndBodyWeight,
  migrateFoodsDatabase,
  migrateWorkoutTemplatesAndSessions,
  type FoodsMigrationSummary,
  type MigrationSummary,
  type WorkoutMigrationSummary,
} from './migrate-static.js';

type Logger = Pick<Console, 'info' | 'warn' | 'error'>;

export const MIGRATION_STEPS = ['foods', 'daily', 'workouts'] as const;

export type MigrationStep = (typeof MIGRATION_STEPS)[number];

export type RunMigrationCliOptions = {
  userId: string;
  dataRoot: string;
  dryRun: boolean;
  step: MigrationStep | null;
};

type StatementLike = Pick<ReturnType<typeof sqlite.prepare>, 'get'>;

type SqliteLike = {
  exec: (source: string) => unknown;
  prepare: (source: string) => StatementLike;
};

export type RunMigrationDependencies = {
  migrateFoodsDatabase: typeof migrateFoodsDatabase;
  migrateDailyLogsAndBodyWeight: typeof migrateDailyLogsAndBodyWeight;
  migrateWorkoutTemplatesAndSessions: typeof migrateWorkoutTemplatesAndSessions;
  sqlite: SqliteLike;
};

export type VerificationSummary = {
  foods: number;
  nutritionLogs: number;
  bodyWeight: number;
  workoutTemplates: number;
  workoutSessions: number;
  nutritionMinDate: string | null;
  nutritionMaxDate: string | null;
};

export type RunMigrationResult = {
  dryRun: boolean;
  stepsRun: MigrationStep[];
  foodsSummary: FoodsMigrationSummary | null;
  dailySummary: MigrationSummary | null;
  workoutsSummary: WorkoutMigrationSummary | null;
  verification: VerificationSummary;
};

const sqliteAdapter: SqliteLike = {
  exec: (source) => sqlite.exec(source),
  prepare: (source) => sqlite.prepare(source),
};

const defaultDependencies: RunMigrationDependencies = {
  migrateFoodsDatabase,
  migrateDailyLogsAndBodyWeight,
  migrateWorkoutTemplatesAndSessions,
  sqlite: sqliteAdapter,
};

const usage = 'Usage: npx tsx src/scripts/run-migration.ts --user <userId> [--source <path>] [--dry-run] [--step foods|daily|workouts]';

const isMigrationStep = (value: string): value is MigrationStep =>
  (MIGRATION_STEPS as readonly string[]).includes(value);

export const parseRunMigrationCliArgs = (args: string[]): RunMigrationCliOptions => {
  let userId: string | undefined;
  let dataRoot = DEFAULT_STATIC_DATA_ROOT;
  let dryRun = false;
  let step: MigrationStep | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (current === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (current === '--user') {
      const next = args[index + 1];
      if (!next || next.startsWith('--')) {
        throw new Error(`Missing value for --user. ${usage}`);
      }

      userId = next;
      index += 1;
      continue;
    }

    if (current === '--source') {
      const next = args[index + 1];
      if (!next || next.startsWith('--')) {
        throw new Error(`Missing value for --source. ${usage}`);
      }

      dataRoot = next;
      index += 1;
      continue;
    }

    if (current === '--step') {
      const next = args[index + 1];
      if (!next || next.startsWith('--')) {
        throw new Error(`Missing value for --step. ${usage}`);
      }

      if (!isMigrationStep(next)) {
        throw new Error(`Invalid --step value "${next}". Expected one of: ${MIGRATION_STEPS.join(', ')}.`);
      }

      step = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${current}. ${usage}`);
  }

  if (!userId) {
    throw new Error(`Missing required --user <userId> argument. ${usage}`);
  }

  return {
    userId,
    dataRoot,
    dryRun,
    step,
  };
};

const toCount = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

const toDateOrNull = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

export const collectVerificationSummary = (
  userId: string,
  sqliteDatabase: Pick<SqliteLike, 'prepare'> = sqliteAdapter,
): VerificationSummary => {
  const foodsCountRow = sqliteDatabase
    .prepare('SELECT COUNT(*) AS count FROM foods WHERE userId = ?')
    .get(userId) as { count?: unknown } | undefined;
  const nutritionCountRow = sqliteDatabase
    .prepare('SELECT COUNT(*) AS count FROM nutrition_logs WHERE userId = ?')
    .get(userId) as { count?: unknown } | undefined;
  const bodyWeightCountRow = sqliteDatabase
    .prepare('SELECT COUNT(*) AS count FROM body_weight WHERE userId = ?')
    .get(userId) as { count?: unknown } | undefined;
  const templateCountRow = sqliteDatabase
    .prepare('SELECT COUNT(*) AS count FROM workout_templates WHERE userId = ?')
    .get(userId) as { count?: unknown } | undefined;
  const sessionCountRow = sqliteDatabase
    .prepare('SELECT COUNT(*) AS count FROM workout_sessions WHERE userId = ?')
    .get(userId) as { count?: unknown } | undefined;
  const dateRangeRow = sqliteDatabase
    .prepare('SELECT MIN(date) AS minDate, MAX(date) AS maxDate FROM nutrition_logs WHERE userId = ?')
    .get(userId) as { minDate?: unknown; maxDate?: unknown } | undefined;

  return {
    foods: toCount(foodsCountRow?.count),
    nutritionLogs: toCount(nutritionCountRow?.count),
    bodyWeight: toCount(bodyWeightCountRow?.count),
    workoutTemplates: toCount(templateCountRow?.count),
    workoutSessions: toCount(sessionCountRow?.count),
    nutritionMinDate: toDateOrNull(dateRangeRow?.minDate),
    nutritionMaxDate: toDateOrNull(dateRangeRow?.maxDate),
  };
};

export const printVerificationTable = (summary: VerificationSummary, logger: Logger = console) => {
  const rows: Array<[string, string]> = [
    ['foods', String(summary.foods)],
    ['nutrition_logs', String(summary.nutritionLogs)],
    ['body_weight', String(summary.bodyWeight)],
    ['workout_templates', String(summary.workoutTemplates)],
    ['workout_sessions', String(summary.workoutSessions)],
    [
      'nutrition_logs.date range',
      summary.nutritionMinDate || summary.nutritionMaxDate
        ? `${summary.nutritionMinDate ?? 'n/a'} -> ${summary.nutritionMaxDate ?? 'n/a'}`
        : 'n/a',
    ],
  ];

  const maxLabelLength = rows.reduce((current, [label]) => Math.max(current, label.length), 0);

  logger.info('Verification results');
  for (const [label, value] of rows) {
    logger.info(`${label.padEnd(maxLabelLength, ' ')} : ${value}`);
  }
};

const printFoodsSummary = (summary: FoodsMigrationSummary, logger: Logger) => {
  logger.info(`Foods: ${summary.inserted} imported, ${summary.skipped} skipped`);
};

const printDailySummary = (summary: MigrationSummary, logger: Logger) => {
  logger.info(
    `Daily logs: ${summary.processedDays} days processed, ${summary.totalMeals} meals, ${summary.totalHabitEntries} habit entries`,
  );
  logger.info(`Body weight: ${summary.totalWeightEntries} entries`);
};

const printWorkoutSummary = (summary: WorkoutMigrationSummary, logger: Logger) => {
  logger.info(`Workout templates: ${summary.processedTemplates} imported`);
  logger.info(`Workout sessions: ${summary.processedSessions} imported, ${summary.totalSessionSets} total sets`);
};

export const runMigration = async (
  options: RunMigrationCliOptions,
  logger: Logger = console,
  dependencies: RunMigrationDependencies = defaultDependencies,
): Promise<RunMigrationResult> => {
  const stepsRun = options.step ? [options.step] : [...MIGRATION_STEPS];

  let openedTransaction = false;
  if (options.dryRun) {
    dependencies.sqlite.exec('BEGIN');
    openedTransaction = true;
    logger.info('Dry run enabled; all database writes will be rolled back after verification.');
  }

  let foodsSummary: FoodsMigrationSummary | null = null;
  let dailySummary: MigrationSummary | null = null;
  let workoutsSummary: WorkoutMigrationSummary | null = null;

  try {
    for (const step of stepsRun) {
      if (step === 'foods') {
        foodsSummary = await dependencies.migrateFoodsDatabase({
          userId: options.userId,
          dataRoot: options.dataRoot,
          logger,
        });
        printFoodsSummary(foodsSummary, logger);
        continue;
      }

      if (step === 'daily') {
        dailySummary = await dependencies.migrateDailyLogsAndBodyWeight({
          userId: options.userId,
          dataRoot: options.dataRoot,
          logger,
        });
        printDailySummary(dailySummary, logger);
        continue;
      }

      workoutsSummary = await dependencies.migrateWorkoutTemplatesAndSessions({
        userId: options.userId,
        dataRoot: options.dataRoot,
        logger,
      });
      printWorkoutSummary(workoutsSummary, logger);
    }

    const verification = collectVerificationSummary(options.userId, dependencies.sqlite);
    printVerificationTable(verification, logger);

    if (options.dryRun) {
      logger.info('Dry run verification shown above; no changes will be persisted.');
    } else {
      logger.info('Migration run completed.');
    }

    return {
      dryRun: options.dryRun,
      stepsRun,
      foodsSummary,
      dailySummary,
      workoutsSummary,
      verification,
    };
  } finally {
    if (openedTransaction) {
      dependencies.sqlite.exec('ROLLBACK');
      logger.info('Dry run rollback complete.');
    }
  }
};

const runCli = async () => {
  const options = parseRunMigrationCliArgs(process.argv.slice(2));
  await runMigration(options, console);
};

const isMainModule = () => {
  if (!process.argv[1]) {
    return false;
  }

  return import.meta.url === pathToFileURL(process.argv[1]).href;
};

if (isMainModule()) {
  runCli().catch((error) => {
    console.error(`Migration runner failed: ${String(error)}`);
    process.exitCode = 1;
  });
}
