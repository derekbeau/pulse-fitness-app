import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import { users } from './users.js';
import { adaptiveNutritionCheckIns } from './adaptive-nutrition.js';

export const nutritionTargets = sqliteTable(
  'nutrition_targets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    calories: real('calories').notNull(),
    protein: real('protein').notNull(),
    carbs: real('carbs').notNull(),
    fat: real('fat').notNull(),
    source: text('source').$type<'manual' | 'adaptive'>().notNull().default('manual'),
    adaptiveCheckInId: text('adaptive_check_in_id').references(() => adaptiveNutritionCheckIns.id, {
      onDelete: 'restrict',
    }),
    macroCalories: real('macro_calories'),
    effectiveDate: text('effective_date').notNull(),
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
    unique('nutrition_targets_user_id_effective_date_unique').on(table.userId, table.effectiveDate),
    uniqueIndex('nutrition_targets_id_user_id_unique').on(table.id, table.userId),
    check(
      'nutrition_targets_effective_date_format_check',
      sql`${table.effectiveDate} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
    check(
      'nutrition_targets_macros_nonnegative_check',
      sql`${table.calories} >= 0 and ${table.protein} >= 0 and ${table.carbs} >= 0 and ${table.fat} >= 0`,
    ),
    check('nutrition_targets_source_check', sql`${table.source} in ('manual', 'adaptive')`),
    check(
      'nutrition_targets_provenance_check',
      sql`(${table.source} = 'manual' and ${table.adaptiveCheckInId} is null) or (${table.source} = 'adaptive' and ${table.adaptiveCheckInId} is not null)`,
    ),
    check(
      'nutrition_targets_macro_calories_nonnegative_check',
      sql`${table.macroCalories} is null or ${table.macroCalories} >= 0`,
    ),
  ],
);

export const nutritionTargetEvents = sqliteTable(
  'nutrition_target_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    targetId: text('target_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    effectiveDate: text('effective_date').notNull(),
    calories: real('calories').notNull(),
    protein: real('protein').notNull(),
    carbs: real('carbs').notNull(),
    fat: real('fat').notNull(),
    macroCalories: real('macro_calories').notNull(),
    source: text('source').$type<'manual' | 'adaptive'>().notNull(),
    adaptiveCheckInId: text('adaptive_check_in_id'),
    eventType: text('event_type')
      .$type<'manual_write' | 'adaptive_accept' | 'migration_backfill'>()
      .notNull(),
    recordedAt: integer('recorded_at', { mode: 'number' }).notNull(),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('nutrition_target_events_user_effective_recorded_idx').on(
      table.userId,
      table.effectiveDate,
      table.recordedAt,
      table.id,
    ),
    uniqueIndex('nutrition_target_events_target_sequence_unique').on(
      table.targetId,
      table.sequence,
    ),
    uniqueIndex('nutrition_target_events_adaptive_check_in_unique')
      .on(table.adaptiveCheckInId)
      .where(sql`${table.adaptiveCheckInId} is not null`),
    foreignKey({
      columns: [table.targetId, table.userId],
      foreignColumns: [nutritionTargets.id, nutritionTargets.userId],
      name: 'nutrition_target_events_target_user_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.adaptiveCheckInId, table.userId],
      foreignColumns: [adaptiveNutritionCheckIns.id, adaptiveNutritionCheckIns.userId],
      name: 'nutrition_target_events_check_in_user_fk',
    }).onDelete('restrict'),
    check('nutrition_target_events_sequence_check', sql`${table.sequence} >= 1`),
    check(
      'nutrition_target_events_effective_date_check',
      sql`${table.effectiveDate} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
    check(
      'nutrition_target_events_values_check',
      sql`${table.calories} >= 0 and ${table.protein} >= 0 and ${table.carbs} >= 0 and ${table.fat} >= 0 and ${table.macroCalories} >= 0 and abs(${table.macroCalories} - ((${table.protein} * 4) + (${table.carbs} * 4) + (${table.fat} * 9))) < 0.000001`,
    ),
    check('nutrition_target_events_source_check', sql`${table.source} in ('manual', 'adaptive')`),
    check(
      'nutrition_target_events_provenance_check',
      sql`(${table.source} = 'manual' and ${table.adaptiveCheckInId} is null and ${table.eventType} in ('manual_write', 'migration_backfill')) or (${table.source} = 'adaptive' and ${table.adaptiveCheckInId} is not null and ${table.eventType} in ('adaptive_accept', 'migration_backfill'))`,
    ),
    check(
      'nutrition_target_events_event_type_check',
      sql`${table.eventType} in ('manual_write', 'adaptive_accept', 'migration_backfill')`,
    ),
    check(
      'nutrition_target_events_timestamps_check',
      sql`${table.recordedAt} > 0 and ${table.createdAt} > 0`,
    ),
  ],
);
