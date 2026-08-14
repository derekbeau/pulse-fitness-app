import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';
import {
  ADAPTIVE_TDEE_CONSTANTS,
  calculateAdaptiveDateBoundaries,
  evaluateEligibility,
  type AdaptiveWeightEntry,
} from '@pulse/shared';

type ProgramRow = {
  id: string;
  userId: string;
  timeZone: string;
  goalType: 'lose' | 'maintain' | 'gain';
  targetWeightKg: number | null;
  goalRatePctPerWeek: number;
};

type WeightRow = AdaptiveWeightEntry;

export type AdaptiveGoalBackfillResult = {
  created: number;
  skipped: number;
  blocked: number;
};

export type AdaptiveGoalBackfillOptions = {
  now?: () => Date;
  /** Test-only fault hook used to prove each user's goal and revision roll back together. */
  beforeRevisionInsert?: (userId: string) => void;
};

const dateKeyInTimeZone = (date: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) throw new Error(`Unsupported IANA time zone: ${timeZone}`);
  return `${year}-${month}-${day}`;
};

const loadWeightRows = (
  sqlite: Database.Database,
  userId: string,
  warmupStart: string,
  localDate: string,
): WeightRow[] =>
  sqlite
    .prepare(
      `SELECT id, date, weight_kg AS weightKg, updated_at AS updatedAt
       FROM body_weight
       WHERE user_id = ? AND date >= ? AND date <= ?
       ORDER BY date ASC, id ASC`,
    )
    .all(userId, warmupStart, localDate) as WeightRow[];

const selectBackfillWeights = (
  sqlite: Database.Database,
  program: ProgramRow,
  localDate: string,
): { startTrendWeightKg: number; startScaleWeightKg: number } | null => {
  const latestScale = sqlite
    .prepare(
      `SELECT weight_kg AS weightKg
       FROM body_weight
       WHERE user_id = ? AND date <= ?
       ORDER BY date DESC, id DESC
       LIMIT 1`,
    )
    .get(program.userId, localDate) as { weightKg: number } | undefined;
  if (!latestScale) return null;

  const boundaries = calculateAdaptiveDateBoundaries(localDate, true);
  const weights = loadWeightRows(sqlite, program.userId, boundaries.warmupStart, localDate);
  const eligibility = evaluateEligibility({
    boundaries,
    nutritionDays: [],
    weightEntries: weights,
  });
  const disqualifyingReasons = new Set([
    'INSUFFICIENT_WEIGHT',
    'INSUFFICIENT_WEIGHT_SPAN',
    'STALE_WEIGHT',
    'INSUFFICIENT_TREND_POINTS',
    'SUSPECT_WEIGHT_DATA',
  ]);
  const trendUsable = !eligibility.holdReasons.some((reason) => disqualifyingReasons.has(reason));
  const trendWeight = trendUsable ? eligibility.trendPoints.at(-1)?.trendWeightKg : null;

  return {
    startTrendWeightKg: trendWeight ?? latestScale.weightKg,
    startScaleWeightKg: latestScale.weightKg,
  };
};

export const backfillAdaptiveNutritionGoals = (
  sqlite: Database.Database,
  options: AdaptiveGoalBackfillOptions = {},
): AdaptiveGoalBackfillResult => {
  const now = options.now ?? (() => new Date());
  const programs = sqlite
    .prepare(
      `SELECT id, user_id AS userId, time_zone AS timeZone, goal_type AS goalType,
              target_weight_kg AS targetWeightKg, goal_rate_pct_per_week AS goalRatePctPerWeek
       FROM adaptive_nutrition_programs
       ORDER BY user_id ASC, id ASC`,
    )
    .all() as ProgramRow[];

  const result: AdaptiveGoalBackfillResult = { created: 0, skipped: 0, blocked: 0 };
  for (const program of programs) {
    const outcome = sqlite
      .transaction((): keyof AdaptiveGoalBackfillResult => {
        const existing = sqlite
          .prepare(
            `SELECT id FROM adaptive_nutrition_goals
             WHERE user_id = ? AND status = 'active'
             LIMIT 1`,
          )
          .get(program.userId);
        if (existing) return 'skipped';

        const timestamp = now().getTime();
        const localDate = dateKeyInTimeZone(new Date(timestamp), program.timeZone);
        const weights = selectBackfillWeights(sqlite, program, localDate);
        if (!weights) return 'blocked';

        const goalId = randomUUID();
        const revisionId = randomUUID();
        const maintenanceCenterKg =
          program.goalType === 'maintain'
            ? (program.targetWeightKg ?? weights.startTrendWeightKg)
            : null;
        const targetWeightKg = program.goalType === 'maintain' ? null : program.targetWeightKg;

        sqlite
          .prepare(
            `INSERT INTO adaptive_nutrition_goals (
               id, user_id, program_id, type, status, start_trend_weight_kg,
               start_scale_weight_kg, target_weight_kg, maintenance_center_kg,
               goal_rate_pct_per_week, started_local_date, ended_local_date,
               ended_reason, created_at, updated_at
             ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
          )
          .run(
            goalId,
            program.userId,
            program.id,
            program.goalType,
            weights.startTrendWeightKg,
            weights.startScaleWeightKg,
            targetWeightKg,
            maintenanceCenterKg,
            program.goalRatePctPerWeek,
            localDate,
            timestamp,
            timestamp,
          );

        options.beforeRevisionInsert?.(program.userId);
        sqlite
          .prepare(
            `INSERT INTO adaptive_nutrition_goal_revisions (
               id, goal_id, user_id, sequence, target_weight_kg, maintenance_center_kg,
               goal_rate_pct_per_week, previous_target_weight_kg, previous_center_kg,
               previous_rate_pct_per_week, reason, effective_local_date, created_at
             ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'migration', ?, ?)`,
          )
          .run(
            revisionId,
            goalId,
            program.userId,
            targetWeightKg,
            maintenanceCenterKg,
            program.goalRatePctPerWeek,
            targetWeightKg,
            maintenanceCenterKg,
            program.goalRatePctPerWeek,
            localDate,
            timestamp,
          );
        return 'created';
      })
      .immediate();
    result[outcome] += 1;
  }
  return result;
};

export const adaptiveGoalBackfillConstants = {
  trendHalfLifeDays: ADAPTIVE_TDEE_CONSTANTS.ewmaHalfLifeDays,
  minimumActualWeights: ADAPTIVE_TDEE_CONSTANTS.minimumActualWeights,
  minimumWeightSpanDays: ADAPTIVE_TDEE_CONSTANTS.minimumWeightSpanDays,
  maximumWeightAgeDays: ADAPTIVE_TDEE_CONSTANTS.maximumWeightAgeDays,
} as const;
