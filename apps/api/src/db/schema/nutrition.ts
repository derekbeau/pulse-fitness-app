import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import { foods } from './foods.js';
import { users } from './users.js';

export const nutritionLogs = sqliteTable(
  'nutrition_logs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    notes: text('notes'),
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
    unique('nutrition_logs_user_id_date_unique').on(table.userId, table.date),
    check(
      'nutrition_logs_date_format_check',
      sql`${table.date} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
  ],
);

export const meals = sqliteTable(
  'meals',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    nutritionLogId: text('nutrition_log_id')
      .notNull()
      .references(() => nutritionLogs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    time: text('time'),
    notes: text('notes'),
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
    index('meals_nutrition_log_id_idx').on(table.nutritionLogId),
    check(
      'meals_time_format_check',
      sql`${table.time} is null or ${table.time} glob '[0-9][0-9]:[0-9][0-9]'`,
    ),
  ],
);

export const mealItems = sqliteTable(
  'meal_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    mealId: text('meal_id')
      .notNull()
      .references(() => meals.id, { onDelete: 'cascade' }),
    foodId: text('food_id').references(() => foods.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    amount: real('amount').notNull(),
    unit: text('unit').notNull(),
    displayQuantity: real('display_quantity'),
    displayUnit: text('display_unit'),
    calories: real('calories').notNull(),
    protein: real('protein').notNull(),
    carbs: real('carbs').notNull(),
    fat: real('fat').notNull(),
    fiber: real('fiber'),
    sugar: real('sugar'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('meal_items_meal_id_idx').on(table.mealId),
    index('meal_items_food_id_idx').on(table.foodId),
    check('meal_items_amount_check', sql`${table.amount} > 0`),
    check(
      'meal_items_macros_nonnegative_check',
      sql`${table.calories} >= 0 and ${table.protein} >= 0 and ${table.carbs} >= 0 and ${table.fat} >= 0`,
    ),
    check('meal_items_fiber_nonnegative_check', sql`${table.fiber} is null or ${table.fiber} >= 0`),
    check('meal_items_sugar_nonnegative_check', sql`${table.sugar} is null or ${table.sugar} >= 0`),
  ],
);
