import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

import { users } from './users.js';

export const nutritionTargets = sqliteTable(
  'nutrition_targets',
  {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    calories: real('calories').notNull(),
    protein: real('protein').notNull(),
    carbs: real('carbs').notNull(),
    fat: real('fat').notNull(),
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
    check(
      'nutrition_targets_effective_date_format_check',
      sql`${table.effectiveDate} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
    check(
      'nutrition_targets_macros_nonnegative_check',
      sql`${table.calories} >= 0 and ${table.protein} >= 0 and ${table.carbs} >= 0 and ${table.fat} >= 0`,
    ),
  ],
);
