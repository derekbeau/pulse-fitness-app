import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { check, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import { users } from './users.js';

export const dailyNutritionTargetOverrides = sqliteTable(
  'daily_nutrition_target_overrides',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    calories: real('calories'),
    protein: real('protein'),
    carbs: real('carbs'),
    fat: real('fat'),
    reason: text('reason'),
    reasonCodeUnits: integer('reason_code_units'),
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
    unique('daily_nutrition_target_overrides_user_date_unique').on(table.userId, table.date),
    check(
      'daily_nutrition_target_overrides_date_format_check',
      sql`${table.date} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
    check(
      'daily_nutrition_target_overrides_not_empty_check',
      sql`${table.calories} is not null or ${table.protein} is not null or ${table.carbs} is not null or ${table.fat} is not null`,
    ),
    check(
      'daily_nutrition_target_overrides_values_check',
      sql`(${table.calories} is null or (${table.calories} >= 0 and ${table.calories} <= 10000)) and (${table.protein} is null or (${table.protein} >= 0 and ${table.protein} <= 1000)) and (${table.carbs} is null or (${table.carbs} >= 0 and ${table.carbs} <= 1000)) and (${table.fat} is null or (${table.fat} >= 0 and ${table.fat} <= 1000))`,
    ),
    check(
      'daily_nutrition_target_overrides_reason_check',
      sql`(${table.reason} is null and ${table.reasonCodeUnits} is null) or (${table.reason} is not null and ${table.reason} = trim(${table.reason}) and ${table.reasonCodeUnits} between 1 and 2000)`,
    ),
  ],
);
