import { randomUUID } from 'node:crypto';

import type { AdaptiveProgramCalculation, NutritionTarget } from '@pulse/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
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
    uniqueIndex('adaptive_nutrition_programs_id_user_id_unique').on(table.id, table.userId),
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

export const adaptiveNutritionProgramRevisions = sqliteTable(
  'adaptive_nutrition_program_revisions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    programId: text('program_id')
      .notNull()
      .references(() => adaptiveNutritionPrograms.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    effectiveAt: integer('effective_at', { mode: 'number' }).notNull(),
    snapshot: text('snapshot', { mode: 'json' }).$type<AdaptiveProgramCalculation>().notNull(),
    source: text('source')
      .$type<'program_created' | 'program_updated' | 'goal_updated' | 'migration'>()
      .notNull(),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('adaptive_nutrition_program_revisions_program_effective_idx').on(
      table.programId,
      table.effectiveAt,
      table.sequence,
    ),
    index('adaptive_nutrition_program_revisions_user_id_idx').on(table.userId),
    uniqueIndex('adaptive_nutrition_program_revisions_program_sequence_unique').on(
      table.programId,
      table.sequence,
    ),
    uniqueIndex('adaptive_nutrition_program_revisions_id_user_unique').on(table.id, table.userId),
    foreignKey({
      columns: [table.programId, table.userId],
      foreignColumns: [adaptiveNutritionPrograms.id, adaptiveNutritionPrograms.userId],
      name: 'adaptive_nutrition_program_revisions_program_user_fk',
    }).onDelete('cascade'),
    check(
      'adaptive_nutrition_program_revisions_source_check',
      sql`${table.source} in ('program_created', 'program_updated', 'goal_updated', 'migration')`,
    ),
    check('adaptive_nutrition_program_revisions_sequence_check', sql`${table.sequence} >= 1`),
    check('adaptive_nutrition_program_revisions_effective_at_check', sql`${table.effectiveAt} > 0`),
    check(
      'adaptive_nutrition_program_revisions_snapshot_check',
      sql`json_valid(${table.snapshot}) and json_type(${table.snapshot}) = 'object'`,
    ),
  ],
);

export const adaptiveNutritionAccountDeletionScope = sqliteTable(
  'adaptive_nutrition_account_deletion_scope',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
);

export const adaptiveNutritionGoals = sqliteTable(
  'adaptive_nutrition_goals',
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
    type: text('type').$type<'lose' | 'maintain' | 'gain'>().notNull(),
    status: text('status').$type<'active' | 'completed' | 'replaced' | 'cancelled'>().notNull(),
    startTrendWeightKg: real('start_trend_weight_kg').notNull(),
    startScaleWeightKg: real('start_scale_weight_kg'),
    finalTrendWeightKg: real('final_trend_weight_kg'),
    targetWeightKg: real('target_weight_kg'),
    maintenanceCenterKg: real('maintenance_center_kg'),
    goalRatePctPerWeek: real('goal_rate_pct_per_week').notNull(),
    startedLocalDate: text('started_local_date').notNull(),
    endedLocalDate: text('ended_local_date'),
    endedReason: text('ended_reason').$type<
      'completed' | 'direction_changed' | 'cancelled' | null
    >(),
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
    index('adaptive_nutrition_goals_user_id_idx').on(table.userId),
    index('adaptive_nutrition_goals_program_id_idx').on(table.programId),
    uniqueIndex('adaptive_nutrition_goals_id_user_id_unique').on(table.id, table.userId),
    uniqueIndex('adaptive_nutrition_goals_one_active_per_user_unique')
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
    foreignKey({
      columns: [table.programId, table.userId],
      foreignColumns: [adaptiveNutritionPrograms.id, adaptiveNutritionPrograms.userId],
      name: 'adaptive_nutrition_goals_program_user_fk',
    }).onDelete('cascade'),
    check(
      'adaptive_nutrition_goals_type_check',
      sql`${table.type} in ('lose', 'maintain', 'gain')`,
    ),
    check(
      'adaptive_nutrition_goals_status_check',
      sql`${table.status} in ('active', 'completed', 'replaced', 'cancelled')`,
    ),
    check(
      'adaptive_nutrition_goals_weight_bounds_check',
      sql`${table.startTrendWeightKg} between 25 and 350 and (${table.startScaleWeightKg} is null or ${table.startScaleWeightKg} between 25 and 350) and (${table.finalTrendWeightKg} is null or ${table.finalTrendWeightKg} between 25 and 350) and (${table.targetWeightKg} is null or ${table.targetWeightKg} between 25 and 350) and (${table.maintenanceCenterKg} is null or ${table.maintenanceCenterKg} between 25 and 350)`,
    ),
    check(
      'adaptive_nutrition_goals_strategy_check',
      sql`(${table.type} = 'lose' and ${table.targetWeightKg} is not null and ${table.maintenanceCenterKg} is null and ${table.goalRatePctPerWeek} between -1 and -0.1) or (${table.type} = 'gain' and ${table.targetWeightKg} is not null and ${table.maintenanceCenterKg} is null and ${table.goalRatePctPerWeek} between 0.1 and 0.5) or (${table.type} = 'maintain' and ${table.targetWeightKg} is null and ${table.maintenanceCenterKg} is not null and ${table.goalRatePctPerWeek} = 0)`,
    ),
    check(
      'adaptive_nutrition_goals_dates_check',
      sql`${table.startedLocalDate} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and (${table.endedLocalDate} is null or ${table.endedLocalDate} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')`,
    ),
    check(
      'adaptive_nutrition_goals_lifecycle_check',
      sql`(${table.status} = 'active' and ${table.endedLocalDate} is null and ${table.endedReason} is null and ${table.finalTrendWeightKg} is null) or (${table.status} = 'completed' and ${table.endedLocalDate} is not null and ${table.endedReason} = 'completed' and ${table.finalTrendWeightKg} is not null) or (${table.status} = 'replaced' and ${table.endedLocalDate} is not null and ${table.endedReason} = 'direction_changed' and ${table.finalTrendWeightKg} is not null) or (${table.status} = 'cancelled' and ${table.endedLocalDate} is not null and ${table.endedReason} = 'cancelled' and ${table.finalTrendWeightKg} is not null)`,
    ),
  ],
);

export const adaptiveNutritionGoalRevisions = sqliteTable(
  'adaptive_nutrition_goal_revisions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    goalId: text('goal_id')
      .notNull()
      .references(() => adaptiveNutritionGoals.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    targetWeightKg: real('target_weight_kg'),
    maintenanceCenterKg: real('maintenance_center_kg'),
    goalRatePctPerWeek: real('goal_rate_pct_per_week').notNull(),
    previousTargetWeightKg: real('previous_target_weight_kg'),
    previousCenterKg: real('previous_center_kg'),
    previousRatePctPerWeek: real('previous_rate_pct_per_week').notNull(),
    reason: text('reason')
      .$type<'created' | 'user_edit' | 'migration' | 'goal_completion'>()
      .notNull(),
    effectiveLocalDate: text('effective_local_date').notNull(),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('adaptive_nutrition_goal_revisions_goal_id_idx').on(table.goalId),
    uniqueIndex('adaptive_nutrition_goal_revisions_goal_sequence_unique').on(
      table.goalId,
      table.sequence,
    ),
    uniqueIndex('adaptive_nutrition_goal_revisions_id_goal_user_unique').on(
      table.id,
      table.goalId,
      table.userId,
    ),
    foreignKey({
      columns: [table.goalId, table.userId],
      foreignColumns: [adaptiveNutritionGoals.id, adaptiveNutritionGoals.userId],
      name: 'adaptive_nutrition_goal_revisions_goal_user_fk',
    }).onDelete('cascade'),
    check('adaptive_nutrition_goal_revisions_sequence_check', sql`${table.sequence} >= 1`),
    check(
      'adaptive_nutrition_goal_revisions_weights_check',
      sql`(${table.targetWeightKg} is null or ${table.targetWeightKg} between 25 and 350) and (${table.maintenanceCenterKg} is null or ${table.maintenanceCenterKg} between 25 and 350) and (${table.previousTargetWeightKg} is null or ${table.previousTargetWeightKg} between 25 and 350) and (${table.previousCenterKg} is null or ${table.previousCenterKg} between 25 and 350)`,
    ),
    check(
      'adaptive_nutrition_goal_revisions_strategy_check',
      sql`(${table.targetWeightKg} is not null and ${table.maintenanceCenterKg} is null and (${table.goalRatePctPerWeek} between -1 and -0.1 or ${table.goalRatePctPerWeek} between 0.1 and 0.5)) or (${table.targetWeightKg} is null and ${table.maintenanceCenterKg} is not null and ${table.goalRatePctPerWeek} = 0)`,
    ),
    check(
      'adaptive_nutrition_goal_revisions_previous_strategy_check',
      sql`(${table.previousTargetWeightKg} is not null and ${table.previousCenterKg} is null and (${table.previousRatePctPerWeek} between -1 and -0.1 or ${table.previousRatePctPerWeek} between 0.1 and 0.5)) or (${table.previousTargetWeightKg} is null and ${table.previousCenterKg} is not null and ${table.previousRatePctPerWeek} = 0)`,
    ),
    check(
      'adaptive_nutrition_goal_revisions_reason_check',
      sql`${table.reason} in ('created', 'user_edit', 'migration', 'goal_completion')`,
    ),
    check(
      'adaptive_nutrition_goal_revisions_date_check',
      sql`${table.effectiveLocalDate} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
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
    goalId: text('goal_id').references(() => adaptiveNutritionGoals.id, {
      onDelete: 'restrict',
    }),
    goalRevisionId: text('goal_revision_id').references(() => adaptiveNutritionGoalRevisions.id, {
      onDelete: 'restrict',
    }),
    kind: text('kind').$type<'baseline' | 'weekly' | 'manual' | 'goal_change'>().notNull(),
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
    uniqueIndex('adaptive_nutrition_checkins_id_user_id_unique').on(table.id, table.userId),
    foreignKey({
      columns: [table.programId, table.userId],
      foreignColumns: [adaptiveNutritionPrograms.id, adaptiveNutritionPrograms.userId],
      name: 'adaptive_nutrition_checkins_program_user_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.goalRevisionId, table.goalId, table.userId],
      foreignColumns: [
        adaptiveNutritionGoalRevisions.id,
        adaptiveNutritionGoalRevisions.goalId,
        adaptiveNutritionGoalRevisions.userId,
      ],
      name: 'adaptive_nutrition_checkins_goal_revision_user_fk',
    }).onDelete('restrict'),
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
      sql`${table.kind} in ('baseline', 'weekly', 'manual', 'goal_change')`,
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

export const adaptiveNutritionGoalCompletions = sqliteTable(
  'adaptive_nutrition_goal_completions',
  {
    checkInId: text('check_in_id')
      .primaryKey()
      .references(() => adaptiveNutritionCheckIns.id, { onDelete: 'restrict' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    completedGoalId: text('completed_goal_id')
      .notNull()
      .references(() => adaptiveNutritionGoals.id, { onDelete: 'restrict' }),
    maintenanceGoalId: text('maintenance_goal_id')
      .notNull()
      .references(() => adaptiveNutritionGoals.id, { onDelete: 'restrict' }),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    uniqueIndex('adaptive_nutrition_goal_completions_completed_goal_unique').on(
      table.completedGoalId,
    ),
    uniqueIndex('adaptive_nutrition_goal_completions_maintenance_goal_unique').on(
      table.maintenanceGoalId,
    ),
    foreignKey({
      columns: [table.checkInId, table.userId],
      foreignColumns: [adaptiveNutritionCheckIns.id, adaptiveNutritionCheckIns.userId],
      name: 'adaptive_nutrition_goal_completions_checkin_user_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.completedGoalId, table.userId],
      foreignColumns: [adaptiveNutritionGoals.id, adaptiveNutritionGoals.userId],
      name: 'adaptive_nutrition_goal_completions_completed_user_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.maintenanceGoalId, table.userId],
      foreignColumns: [adaptiveNutritionGoals.id, adaptiveNutritionGoals.userId],
      name: 'adaptive_nutrition_goal_completions_maintenance_user_fk',
    }).onDelete('restrict'),
    check(
      'adaptive_nutrition_goal_completions_distinct_goals_check',
      sql`${table.completedGoalId} <> ${table.maintenanceGoalId}`,
    ),
  ],
);
