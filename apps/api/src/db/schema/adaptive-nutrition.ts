import { randomUUID } from 'node:crypto';

import type { NutritionTarget } from '@pulse/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import { users } from './users.js';

type JsonRecord = Record<string, unknown>;

export const adaptiveNutritionPrograms = sqliteTable(
  'adaptive_nutrition_programs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').$type<'active' | 'paused'>().notNull().default('active'),
    timeZone: text('time_zone').notNull(),
    heightCm: real('height_cm'),
    birthDate: text('birth_date'),
    rmrEquation: text('rmr_equation')
      .$type<'mifflin_male' | 'mifflin_female' | 'manual_tdee'>()
      .notNull(),
    activityLevel: text('activity_level').$type<
      'sedentary' | 'low_active' | 'active' | 'very_active'
    >(),
    activityMultiplier: real('activity_multiplier'),
    estimatedRmrKcal: real('estimated_rmr_kcal'),
    calculatedBaselineTdeeKcal: real('calculated_baseline_tdee_kcal'),
    manualBaselineTdeeKcal: real('manual_baseline_tdee_kcal'),
    baselineTdeeKcal: real('baseline_tdee_kcal').notNull(),
    goalType: text('goal_type').$type<'lose' | 'maintain' | 'gain'>().notNull(),
    targetWeightKg: real('target_weight_kg'),
    goalRatePctPerWeek: real('goal_rate_pct_per_week').notNull(),
    proteinGrams: integer('protein_grams').notNull(),
    fatAllocationPct: real('fat_allocation_pct').notNull(),
    systemCalorieFloorKcal: integer('system_calorie_floor_kcal').notNull(),
    userCalorieFloorKcal: integer('user_calorie_floor_kcal').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now())
      .$onUpdateFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex('adaptive_nutrition_programs_user_id_unique').on(table.userId),
    check('adaptive_nutrition_programs_status_check', sql`${table.status} in ('active', 'paused')`),
    check(
      'adaptive_nutrition_programs_rmr_equation_check',
      sql`${table.rmrEquation} in ('mifflin_male', 'mifflin_female', 'manual_tdee')`,
    ),
    check(
      'adaptive_nutrition_programs_activity_level_check',
      sql`${table.activityLevel} is null or ${table.activityLevel} in ('sedentary', 'low_active', 'active', 'very_active')`,
    ),
    check(
      'adaptive_nutrition_programs_goal_type_check',
      sql`${table.goalType} in ('lose', 'maintain', 'gain')`,
    ),
    check(
      'adaptive_nutrition_programs_height_check',
      sql`${table.heightCm} is null or ${table.heightCm} between 100 and 250`,
    ),
    check(
      'adaptive_nutrition_programs_target_weight_check',
      sql`${table.targetWeightKg} is null or ${table.targetWeightKg} between 25 and 350`,
    ),
    check(
      'adaptive_nutrition_programs_protein_check',
      sql`${table.proteinGrams} between 40 and 400`,
    ),
    check(
      'adaptive_nutrition_programs_fat_allocation_check',
      sql`${table.fatAllocationPct} between 20 and 40`,
    ),
    check(
      'adaptive_nutrition_programs_calorie_floor_check',
      sql`${table.systemCalorieFloorKcal} >= 1200 and ${table.userCalorieFloorKcal} >= ${table.systemCalorieFloorKcal}`,
    ),
  ],
);

export const adaptiveNutritionCheckIns = sqliteTable(
  'adaptive_nutrition_checkins',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    programId: text('program_id')
      .notNull()
      .references(() => adaptiveNutritionPrograms.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'baseline' | 'weekly' | 'manual'>().notNull(),
    status: text('status')
      .$type<'pending' | 'accepted' | 'declined' | 'superseded' | 'held'>()
      .notNull(),
    calculationState: text('calculation_state')
      .$type<'baseline' | 'learning' | 'updating' | 'holding'>()
      .notNull(),
    localDate: text('local_date').notNull(),
    analysisStart: text('analysis_start'),
    analysisEnd: text('analysis_end'),
    includeToday: integer('include_today', { mode: 'boolean' }).notNull().default(false),
    algorithmVersion: text('algorithm_version').notNull(),
    dataFingerprint: text('data_fingerprint').notNull(),
    inputSnapshot: text('input_snapshot', { mode: 'json' }).$type<JsonRecord>().notNull(),
    calculationSnapshot: text('calculation_snapshot', { mode: 'json' })
      .$type<JsonRecord>()
      .notNull(),
    reasonCodes: text('reason_codes', { mode: 'json' }).$type<string[]>().notNull(),
    priorTdeeKcal: real('prior_tdee_kcal'),
    observedTdeeKcal: real('observed_tdee_kcal'),
    proposedTdeeKcal: real('proposed_tdee_kcal'),
    currentTargets: text('current_targets', { mode: 'json' }).$type<NutritionTarget | null>(),
    proposedTargets: text('proposed_targets', { mode: 'json' }).$type<JsonRecord | null>(),
    acceptedNutritionTargetId: text('accepted_nutrition_target_id'),
    resolvedAt: integer('resolved_at', { mode: 'number' }),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('adaptive_nutrition_checkins_user_id_created_at_idx').on(table.userId, table.createdAt),
    index('adaptive_nutrition_checkins_program_id_local_date_idx').on(
      table.programId,
      table.localDate,
    ),
    uniqueIndex('adaptive_nutrition_checkins_pending_fingerprint_unique')
      .on(table.programId, table.dataFingerprint, table.algorithmVersion)
      .where(sql`${table.status} = 'pending'`),
    uniqueIndex('adaptive_nutrition_checkins_one_pending_per_program_unique')
      .on(table.programId)
      .where(sql`${table.status} = 'pending'`),
    check(
      'adaptive_nutrition_checkins_kind_check',
      sql`${table.kind} in ('baseline', 'weekly', 'manual')`,
    ),
    check(
      'adaptive_nutrition_checkins_status_check',
      sql`${table.status} in ('pending', 'accepted', 'declined', 'superseded', 'held')`,
    ),
    check(
      'adaptive_nutrition_checkins_calculation_state_check',
      sql`${table.calculationState} in ('baseline', 'learning', 'updating', 'holding')`,
    ),
    check(
      'adaptive_nutrition_checkins_local_date_format_check',
      sql`${table.localDate} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
    check(
      'adaptive_nutrition_checkins_analysis_dates_format_check',
      sql`(${table.analysisStart} is null or ${table.analysisStart} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]') and (${table.analysisEnd} is null or ${table.analysisEnd} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')`,
    ),
    check(
      'adaptive_nutrition_checkins_fingerprint_check',
      sql`length(${table.dataFingerprint}) = 64 and ${table.dataFingerprint} not glob '*[^0-9a-f]*'`,
    ),
  ],
);
