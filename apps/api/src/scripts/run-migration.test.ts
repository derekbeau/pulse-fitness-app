import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_STATIC_DATA_ROOT } from './migrate-static.js';
import {
  collectVerificationSummary,
  parseRunMigrationCliArgs,
  runMigration,
  type RunMigrationDependencies,
} from './run-migration.js';

type CapturedLogger = {
  infoMessages: string[];
  warnMessages: string[];
  errorMessages: string[];
  logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
};

const buildLogger = (): CapturedLogger => {
  const infoMessages: string[] = [];
  const warnMessages: string[] = [];
  const errorMessages: string[] = [];

  return {
    infoMessages,
    warnMessages,
    errorMessages,
    logger: {
      info: (...args: unknown[]) => {
        infoMessages.push(args.map((value) => String(value)).join(' '));
      },
      warn: (...args: unknown[]) => {
        warnMessages.push(args.map((value) => String(value)).join(' '));
      },
      error: (...args: unknown[]) => {
        errorMessages.push(args.map((value) => String(value)).join(' '));
      },
    },
  };
};

const createMockDependencies = (): RunMigrationDependencies => {
  const mockPrepare = vi.fn((query: string) => ({
    get: () => {
      if (query.includes('MIN(date)')) {
        return { minDate: '2026-03-05', maxDate: '2026-03-07' };
      }

      if (query.includes('FROM foods')) {
        return { count: 4 };
      }

      if (query.includes('FROM nutrition_logs WHERE')) {
        return { count: 2 };
      }

      if (query.includes('FROM body_weight')) {
        return { count: 3 };
      }

      if (query.includes('FROM workout_templates')) {
        return { count: 2 };
      }

      if (query.includes('FROM workout_sessions')) {
        return { count: 5 };
      }

      return {};
    },
  }));

  return {
    migrateFoodsDatabase: vi.fn().mockResolvedValue({
      inserted: 2,
      skipped: 1,
      lastUsedAtUpdated: 1,
    }),
    migrateDailyLogsAndBodyWeight: vi.fn().mockResolvedValue({
      processedDays: 3,
      failedDays: 0,
      dailyLogDays: 2,
      bodyWeightFileEntries: 2,
      totalMeals: 3,
      totalHabitEntries: 4,
      totalWeightEntries: 3,
    }),
    migrateWorkoutTemplatesAndSessions: vi.fn().mockResolvedValue({
      processedTemplates: 2,
      failedTemplates: 0,
      processedSessions: 2,
      failedSessions: 0,
      totalTemplateExercises: 6,
      totalSessionSets: 10,
      createdExercises: 1,
    }),
    sqlite: {
      exec: vi.fn(),
      prepare: mockPrepare,
    },
  };
};

describe('run-migration script', () => {
  it('parses CLI flags with defaults and optional step values', () => {
    expect(parseRunMigrationCliArgs(['--user', 'user-1'])).toEqual({
      userId: 'user-1',
      dataRoot: DEFAULT_STATIC_DATA_ROOT,
      dryRun: false,
      step: null,
    });

    expect(
      parseRunMigrationCliArgs([
        '--user',
        'user-2',
        '--source',
        '/tmp/static-data',
        '--dry-run',
        '--step',
        'daily',
      ]),
    ).toEqual({
      userId: 'user-2',
      dataRoot: '/tmp/static-data',
      dryRun: true,
      step: 'daily',
    });
  });

  it('rejects invalid CLI arguments', () => {
    expect(() => parseRunMigrationCliArgs([])).toThrow('Missing required --user <userId> argument.');
    expect(() => parseRunMigrationCliArgs(['--user'])).toThrow('Missing value for --user.');
    expect(() => parseRunMigrationCliArgs(['--user', 'abc', '--step'])).toThrow(
      'Missing value for --step.',
    );
    expect(() => parseRunMigrationCliArgs(['--user', 'abc', '--step', 'unknown'])).toThrow(
      'Invalid --step value "unknown".',
    );
    expect(() => parseRunMigrationCliArgs(['--user', 'abc', '--nope'])).toThrow(
      'Unknown argument: --nope.',
    );
  });

  it('runs all steps in order and prints summaries with verification', async () => {
    const dependencies = createMockDependencies();
    const captured = buildLogger();

    const result = await runMigration(
      {
        userId: 'user-1',
        dataRoot: '/tmp/static-data',
        dryRun: false,
        step: null,
      },
      captured.logger,
      dependencies,
    );

    expect(result.stepsRun).toEqual(['foods', 'daily', 'workouts']);
    expect(result.verification).toEqual({
      foods: 4,
      nutritionLogs: 2,
      bodyWeight: 3,
      workoutTemplates: 2,
      workoutSessions: 5,
      nutritionMinDate: '2026-03-05',
      nutritionMaxDate: '2026-03-07',
    });

    expect(dependencies.migrateFoodsDatabase).toHaveBeenCalledTimes(1);
    expect(dependencies.migrateDailyLogsAndBodyWeight).toHaveBeenCalledTimes(1);
    expect(dependencies.migrateWorkoutTemplatesAndSessions).toHaveBeenCalledTimes(1);

    const foodsOrder = vi.mocked(dependencies.migrateFoodsDatabase).mock.invocationCallOrder[0];
    const dailyOrder = vi.mocked(dependencies.migrateDailyLogsAndBodyWeight).mock.invocationCallOrder[0];
    const workoutsOrder = vi.mocked(dependencies.migrateWorkoutTemplatesAndSessions).mock.invocationCallOrder[0];

    expect(foodsOrder).toBeLessThan(dailyOrder);
    expect(dailyOrder).toBeLessThan(workoutsOrder);
    expect(captured.infoMessages.some((line) => line.includes('Foods: 2 imported, 1 skipped'))).toBe(true);
    expect(captured.infoMessages.some((line) => line.includes('Daily logs: 3 days processed'))).toBe(true);
    expect(captured.infoMessages.some((line) => line.includes('Workout templates: 2 imported'))).toBe(true);
    expect(captured.infoMessages.some((line) => line.includes('Verification results'))).toBe(true);
  });

  it('runs only a selected step when --step is provided', async () => {
    const dependencies = createMockDependencies();
    const captured = buildLogger();

    const result = await runMigration(
      {
        userId: 'user-1',
        dataRoot: '/tmp/static-data',
        dryRun: false,
        step: 'workouts',
      },
      captured.logger,
      dependencies,
    );

    expect(result.stepsRun).toEqual(['workouts']);
    expect(result.foodsSummary).toBeNull();
    expect(result.dailySummary).toBeNull();
    expect(result.workoutsSummary).not.toBeNull();

    expect(dependencies.migrateFoodsDatabase).not.toHaveBeenCalled();
    expect(dependencies.migrateDailyLogsAndBodyWeight).not.toHaveBeenCalled();
    expect(dependencies.migrateWorkoutTemplatesAndSessions).toHaveBeenCalledTimes(1);
  });

  it('collects verification counts from explicit SQL queries', () => {
    const dependencies = createMockDependencies();

    const verification = collectVerificationSummary('user-1', dependencies.sqlite);

    expect(verification).toEqual({
      foods: 4,
      nutritionLogs: 2,
      bodyWeight: 3,
      workoutTemplates: 2,
      workoutSessions: 5,
      nutritionMinDate: '2026-03-05',
      nutritionMaxDate: '2026-03-07',
    });
  });

  it('wraps writes in BEGIN/ROLLBACK for --dry-run and rolls back on failure', async () => {
    const dependencies = createMockDependencies();
    const captured = buildLogger();

    vi.mocked(dependencies.migrateFoodsDatabase).mockRejectedValueOnce(new Error('simulated failure'));

    await expect(
      runMigration(
        {
          userId: 'user-1',
          dataRoot: '/tmp/static-data',
          dryRun: true,
          step: 'foods',
        },
        captured.logger,
        dependencies,
      ),
    ).rejects.toThrow('simulated failure');

    expect(dependencies.sqlite.exec).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(dependencies.sqlite.exec).toHaveBeenNthCalledWith(2, 'ROLLBACK');
  });
});
