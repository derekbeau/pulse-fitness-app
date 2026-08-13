import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { extname, isAbsolute, resolve } from 'node:path';

import Database from 'better-sqlite3';

import {
  ADAPTIVE_TDEE_CONSTANTS,
  adaptiveCurrentTargetSchema,
  adaptiveNutritionDaySchema,
  adaptiveProgramCalculationSchema,
  adaptiveWeightEntrySchema,
  buildAdaptiveRecommendation,
  type AdaptiveCheckInKind,
  type AdaptiveCurrentTarget,
  type AdaptiveNutritionDay,
  type AdaptivePriorTdee,
  type AdaptiveProgramCalculation,
  type AdaptiveReasonCode,
  type AdaptiveRecommendationResult,
  type AdaptiveWeightEntry,
} from '@pulse/shared';

export type AdaptiveBacktestCheckIn = {
  date: string;
  includeToday: boolean;
  kind: Exclude<AdaptiveCheckInKind, 'baseline'>;
};

export type AdaptiveBacktestSource = {
  checkIns: AdaptiveBacktestCheckIn[];
  currentTargets: AdaptiveCurrentTarget[];
  nutritionDays: AdaptiveNutritionDay[];
  program: AdaptiveProgramCalculation;
  weightEntries: AdaptiveWeightEntry[];
};

export type AdaptiveBacktestRow = {
  checkInDate: string;
  kind: AdaptiveBacktestCheckIn['kind'];
  state: AdaptiveRecommendationResult['state'];
  analysisStart: string;
  analysisEnd: string;
  nutritionInputDates: string[];
  nutritionInputCount: number;
  completeNutritionDays: number;
  excludedNutritionDates: string[];
  weightInputDates: string[];
  actualWeightCount: number;
  trendPointCount: number;
  averageDailyIntakeKcal: number | null;
  latestTrendWeightKg: number | null;
  weightTrendKgPerDay: number | null;
  observedTdeeKcal: number | null;
  confidenceScore: number | null;
  confidenceLabel: string | null;
  nutritionCoverage: number | null;
  weightFrequency: number | null;
  weightSpanScore: number | null;
  weightRecencyScore: number | null;
  priorTdeeKcal: number;
  proposedTdeeKcal: number | null;
  goalCalories: number | null;
  proteinGrams: number | null;
  carbohydrateGrams: number | null;
  fatGrams: number | null;
  reasonCodes: AdaptiveReasonCode[];
};

type DatabaseProgramRow = {
  status: string;
  timeZone: string;
  rmrEquation: string;
  heightCm: number | null;
  birthDate: string | null;
  activityLevel: string | null;
  activityMultiplier: number | null;
  estimatedRmrKcal: number | null;
  calculatedBaselineTdeeKcal: number | null;
  manualBaselineTdeeKcal: number | null;
  baselineTdeeKcal: number;
  goalType: string;
  targetWeightKg: number | null;
  goalRatePctPerWeek: number;
  proteinGrams: number;
  fatAllocationPct: number;
  systemCalorieFloorKcal: number;
  userCalorieFloorKcal: number;
  algorithmVersion: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const requireObject = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
};

const requireArray = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
};

const parseCheckIns = (value: unknown): AdaptiveBacktestCheckIn[] =>
  requireArray(value, 'checkIns')
    .map((raw, index) => {
      const item = requireObject(raw, `checkIns[${index}]`);
      if (typeof item.date !== 'string' || !DATE_PATTERN.test(item.date)) {
        throw new Error(`checkIns[${index}].date must be YYYY-MM-DD`);
      }
      if (item.kind !== 'manual' && item.kind !== 'weekly') {
        throw new Error(`checkIns[${index}].kind must be manual or weekly`);
      }
      if (typeof item.includeToday !== 'boolean') {
        throw new Error(`checkIns[${index}].includeToday must be boolean`);
      }
      if (item.kind === 'weekly' && item.includeToday) {
        throw new Error(`checkIns[${index}] cannot include today for a weekly check-in`);
      }
      return {
        date: item.date,
        includeToday: item.includeToday,
        kind: item.kind as AdaptiveBacktestCheckIn['kind'],
      };
    })
    .sort((left, right) => left.date.localeCompare(right.date));

export function parseAdaptiveBacktestJson(value: unknown): AdaptiveBacktestSource {
  const document = requireObject(value, 'Backtest export');
  if (document.version !== 1) throw new Error('Backtest export version must be 1');
  return {
    checkIns: parseCheckIns(document.checkIns),
    currentTargets: requireArray(document.currentTargets ?? [], 'currentTargets').map((target) =>
      adaptiveCurrentTargetSchema.parse(target),
    ),
    nutritionDays: requireArray(document.nutritionDays, 'nutritionDays').map((day) =>
      adaptiveNutritionDaySchema.parse(day),
    ),
    program: adaptiveProgramCalculationSchema.parse(document.program),
    weightEntries: requireArray(document.weightEntries, 'weightEntries').map((entry) =>
      adaptiveWeightEntrySchema.parse(entry),
    ),
  };
}

const targetAtDate = (targets: AdaptiveCurrentTarget[], date: string) =>
  [...targets]
    .filter((target) => target.effectiveDate <= date)
    .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate))[0] ?? null;

const datesInRange = <T extends { date: string }>(values: T[], start: string, end: string) =>
  values.filter((value) => value.date >= start && value.date <= end).map((value) => value.date);

export function runAdaptiveTdeeBacktest(source: AdaptiveBacktestSource): AdaptiveBacktestRow[] {
  let priorTdee: AdaptivePriorTdee | null = null;
  let simulatedTarget: AdaptiveCurrentTarget | null = null;

  return source.checkIns.map((checkIn) => {
    const persistedTarget = targetAtDate(source.currentTargets, checkIn.date);
    const currentTarget = simulatedTarget ?? persistedTarget;
    const result = buildAdaptiveRecommendation({
      constants: ADAPTIVE_TDEE_CONSTANTS,
      currentTarget,
      includeToday: checkIn.includeToday,
      kind: checkIn.kind,
      localDate: checkIn.date,
      nutritionDays: source.nutritionDays,
      priorTdee,
      program: source.program,
      weightEntries: source.weightEntries,
    });
    const proposedTdeeKcal = result.adaptiveUpdate?.proposedTdeeKcal ?? null;
    const row: AdaptiveBacktestRow = {
      checkInDate: checkIn.date,
      kind: checkIn.kind,
      state: result.state,
      analysisStart: result.boundaries.analysisStart,
      analysisEnd: result.boundaries.analysisEnd,
      nutritionInputDates: datesInRange(
        source.nutritionDays,
        result.boundaries.analysisStart,
        result.boundaries.analysisEnd,
      ),
      nutritionInputCount: datesInRange(
        source.nutritionDays,
        result.boundaries.analysisStart,
        result.boundaries.analysisEnd,
      ).length,
      completeNutritionDays: result.completeNutritionDays,
      excludedNutritionDates: result.excludedNutritionDates,
      weightInputDates: datesInRange(
        source.weightEntries,
        result.boundaries.warmupStart,
        result.boundaries.analysisEnd,
      ),
      actualWeightCount: result.actualWeightCount,
      trendPointCount: result.trendPointCount,
      averageDailyIntakeKcal: result.averageDailyIntakeKcal,
      latestTrendWeightKg: result.latestTrendWeightKg,
      weightTrendKgPerDay: result.weightTrendKgPerDay,
      observedTdeeKcal: result.observedTdeeKcal,
      confidenceScore: result.confidence?.score ?? null,
      confidenceLabel: result.confidence?.label ?? null,
      nutritionCoverage: result.confidence?.nutritionCoverage ?? null,
      weightFrequency: result.confidence?.weightFrequency ?? null,
      weightSpanScore: result.confidence?.spanScore ?? null,
      weightRecencyScore: result.confidence?.recencyScore ?? null,
      priorTdeeKcal: result.priorTdeeKcal,
      proposedTdeeKcal,
      goalCalories: result.goal?.goalCalories ?? null,
      proteinGrams: result.macros?.protein ?? null,
      carbohydrateGrams: result.macros?.carbs ?? null,
      fatGrams: result.macros?.fat ?? null,
      reasonCodes: result.reasonCodes,
    };

    if (result.state === 'updating' && proposedTdeeKcal !== null && result.macros) {
      const simulatedId = `backtest-${checkIn.date}`;
      priorTdee = { checkInId: simulatedId, tdeeKcal: proposedTdeeKcal };
      simulatedTarget = adaptiveCurrentTargetSchema.parse({
        id: `target-${checkIn.date}`,
        calories: result.macros.calories,
        protein: result.macros.protein,
        carbs: result.macros.carbs,
        fat: result.macros.fat,
        source: 'adaptive',
        adaptiveCheckInId: simulatedId,
        macroCalories: result.macros.macroCalories,
        effectiveDate: checkIn.date,
        updatedAt: Date.parse(`${checkIn.date}T12:00:00.000Z`),
      });
    }
    return row;
  });
}

const readHash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

const assertCanonicalDatabase = (sqlite: Database.Database) => {
  const requiredTables = ['users', 'nutrition_logs', 'meals', 'meal_items', 'body_weight'];
  const tables = new Set(
    (
      sqlite.prepare("select name from sqlite_schema where type = 'table'").all() as Array<{
        name: string;
      }>
    ).map((row) => row.name),
  );
  const missing = requiredTables.filter((table) => !tables.has(table));
  if (missing.length > 0)
    throw new Error(`Database is missing required tables: ${missing.join(', ')}`);
  const weightColumns = new Set(
    (sqlite.pragma('table_info(body_weight)') as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  if (!weightColumns.has('weight_kg')) {
    throw new Error(
      'Database must be migrated to canonical body_weight.weight_kg before backtesting',
    );
  }
};

const loadProgramFromDatabase = (
  sqlite: Database.Database,
  userId: string,
): AdaptiveProgramCalculation | null => {
  const hasProgramTable = sqlite
    .prepare("select 1 from sqlite_schema where type = 'table' and name = ?")
    .get('adaptive_nutrition_programs');
  if (!hasProgramTable) return null;
  const row = sqlite
    .prepare(
      `select
        status,
        time_zone as timeZone,
        rmr_equation as rmrEquation,
        height_cm as heightCm,
        birth_date as birthDate,
        activity_level as activityLevel,
        activity_multiplier as activityMultiplier,
        estimated_rmr_kcal as estimatedRmrKcal,
        calculated_baseline_tdee_kcal as calculatedBaselineTdeeKcal,
        manual_baseline_tdee_kcal as manualBaselineTdeeKcal,
        baseline_tdee_kcal as baselineTdeeKcal,
        goal_type as goalType,
        target_weight_kg as targetWeightKg,
        goal_rate_pct_per_week as goalRatePctPerWeek,
        protein_grams as proteinGrams,
        fat_allocation_pct as fatAllocationPct,
        system_calorie_floor_kcal as systemCalorieFloorKcal,
        user_calorie_floor_kcal as userCalorieFloorKcal,
        algorithm_version as algorithmVersion
      from adaptive_nutrition_programs where user_id = ? limit 1`,
    )
    .get(userId) as DatabaseProgramRow | undefined;
  return row ? adaptiveProgramCalculationSchema.parse(row) : null;
};

export function loadAdaptiveBacktestDatabase(options: {
  checkIns: AdaptiveBacktestCheckIn[];
  completeDates?: string[];
  databasePath: string;
  program?: AdaptiveProgramCalculation;
  userId: string;
}): AdaptiveBacktestSource {
  const databasePath = resolve(options.databasePath);
  const beforeHash = readHash(databasePath);
  const sqlite = new Database(databasePath, { fileMustExist: true, readonly: true });
  let source: AdaptiveBacktestSource | undefined;
  try {
    sqlite.pragma('query_only = ON');
    assertCanonicalDatabase(sqlite);
    const selectedUser = sqlite
      .prepare('select id from users where id = ? limit 1')
      .get(options.userId);
    if (!selectedUser) throw new Error('Backtest user was not found');
    const completeDates = new Set(options.completeDates ?? []);
    const nutritionDays = (
      sqlite
        .prepare(
          `select
            nl.id,
            nl.date,
            nl.status,
            coalesce(sum(mi.calories), 0) as calories,
            count(mi.id) as itemCount,
            nl.updated_at as updatedAt
          from nutrition_logs nl
          left join meals m on m.nutrition_log_id = nl.id
          left join meal_items mi on mi.meal_id = m.id
          where nl.user_id = ?
          group by nl.id
          order by nl.date, nl.id`,
        )
        .all(options.userId) as Array<Record<string, unknown>>
    ).map((row) =>
      adaptiveNutritionDaySchema.parse({
        ...row,
        status: completeDates.has(String(row.date)) ? 'complete' : row.status,
      }),
    );
    const weightEntries = (
      sqlite
        .prepare(
          `select id, date, weight_kg as weightKg, updated_at as updatedAt
           from body_weight where user_id = ? order by date, id`,
        )
        .all(options.userId) as Array<Record<string, unknown>>
    ).map((row) => adaptiveWeightEntrySchema.parse(row));
    const hasTargetTable = sqlite
      .prepare("select 1 from sqlite_schema where type = 'table' and name = ?")
      .get('nutrition_targets');
    const currentTargets = hasTargetTable
      ? (
          sqlite
            .prepare(
              `select
                id,
                calories,
                protein,
                carbs,
                fat,
                source,
                adaptive_check_in_id as adaptiveCheckInId,
                macro_calories as macroCalories,
                effective_date as effectiveDate,
                updated_at as updatedAt
              from nutrition_targets where user_id = ? order by effective_date`,
            )
            .all(options.userId) as Array<Record<string, unknown>>
        ).map((row) => adaptiveCurrentTargetSchema.parse(row))
      : [];
    const program = options.program ?? loadProgramFromDatabase(sqlite, options.userId);
    if (!program) throw new Error('A program JSON file is required when the user has no program');
    const totalChanges = sqlite.prepare('select total_changes() as changes').get() as {
      changes: number;
    };
    if (totalChanges.changes !== 0) {
      throw new Error('Read-only backtest unexpectedly changed the source connection');
    }
    source = {
      checkIns: [...options.checkIns].sort((left, right) => left.date.localeCompare(right.date)),
      currentTargets,
      nutritionDays,
      program,
      weightEntries,
    };
  } finally {
    sqlite.close();
  }
  if (readHash(databasePath) !== beforeHash) {
    throw new Error('Read-only backtest changed the source database hash');
  }
  if (!source) throw new Error('Backtest source could not be loaded');
  return source;
}

const csvCell = (value: unknown) => {
  const text = Array.isArray(value) ? JSON.stringify(value) : value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function formatAdaptiveBacktestCsv(rows: AdaptiveBacktestRow[]): string {
  const columns = Object.keys(rows[0] ?? ({} as AdaptiveBacktestRow)) as Array<
    keyof AdaptiveBacktestRow
  >;
  if (columns.length === 0) return '';
  return [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
  ].join('\n');
}

type CliOptions = {
  checkInsPath?: string;
  completeDatesPath?: string;
  format: 'json' | 'csv';
  inputPath: string;
  programPath?: string;
  userId?: string;
};

const parseCli = (args: string[]): CliOptions => {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') continue;
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const [inlineKey, inlineValue] = argument.split('=', 2);
    const value = inlineValue ?? args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${inlineKey} requires a value`);
    values.set(inlineKey, value);
  }
  const inputPath = values.get('--input');
  if (!inputPath) throw new Error('--input is required');
  const format = values.get('--format') ?? 'json';
  if (format !== 'json' && format !== 'csv') throw new Error('--format must be json or csv');
  return {
    checkInsPath: values.get('--check-ins'),
    completeDatesPath: values.get('--complete-dates'),
    format,
    inputPath,
    programPath: values.get('--program'),
    userId: values.get('--user'),
  };
};

const resolveCliPath = (path: string) =>
  isAbsolute(path) ? path : resolve(process.env.INIT_CWD ?? process.cwd(), path);

const readJson = (path: string): unknown => JSON.parse(readFileSync(resolveCliPath(path), 'utf8'));

export function runAdaptiveTdeeBacktestCli(
  args: string[],
  write = (value: string) => console.log(value),
) {
  const options = parseCli(args);
  let source: AdaptiveBacktestSource;
  if (extname(options.inputPath).toLowerCase() === '.json') {
    source = parseAdaptiveBacktestJson(readJson(options.inputPath));
  } else {
    if (!options.userId) throw new Error('--user is required for a database input');
    if (!options.checkInsPath) throw new Error('--check-ins is required for a database input');
    const checkInsDocument = requireObject(readJson(options.checkInsPath), 'Check-in fixture');
    const program = options.programPath
      ? adaptiveProgramCalculationSchema.parse(readJson(options.programPath))
      : undefined;
    const completeDates = options.completeDatesPath
      ? requireArray(readJson(options.completeDatesPath), 'Complete-date fixture').map((date) => {
          if (typeof date !== 'string' || !DATE_PATTERN.test(date)) {
            throw new Error('Complete-date fixture values must be YYYY-MM-DD strings');
          }
          return date;
        })
      : undefined;
    source = loadAdaptiveBacktestDatabase({
      checkIns: parseCheckIns(checkInsDocument.checkIns),
      completeDates,
      databasePath: resolveCliPath(options.inputPath),
      program,
      userId: options.userId,
    });
  }
  const rows = runAdaptiveTdeeBacktest(source);
  write(options.format === 'csv' ? formatAdaptiveBacktestCsv(rows) : JSON.stringify(rows, null, 2));
  return rows;
}
