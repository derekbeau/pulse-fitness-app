import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { users } from './users.js';

export const foods = sqliteTable(
  'foods',
  {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    brand: text('brand'),
    servingSize: text('serving_size'),
    servingGrams: real('serving_grams'),
    calories: real('calories').notNull(),
    protein: real('protein').notNull(),
    carbs: real('carbs').notNull(),
    fat: real('fat').notNull(),
    fiber: real('fiber'),
    sugar: real('sugar'),
    verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
    source: text('source'),
    notes: text('notes'),
    lastUsedAt: integer('last_used_at', { mode: 'number' }),
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
    index('foods_user_last_used_at_idx').on(table.userId, table.lastUsedAt),
    check('foods_serving_grams_check', sql`${table.servingGrams} is null or ${table.servingGrams} > 0`),
    check(
      'foods_macros_nonnegative_check',
      sql`${table.calories} >= 0 and ${table.protein} >= 0 and ${table.carbs} >= 0 and ${table.fat} >= 0`,
    ),
    check('foods_fiber_nonnegative_check', sql`${table.fiber} is null or ${table.fiber} >= 0`),
    check('foods_sugar_nonnegative_check', sql`${table.sugar} is null or ${table.sugar} >= 0`),
  ],
);
