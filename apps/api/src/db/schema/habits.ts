import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import { users } from './users.js';

export type HabitTrackingType = 'boolean' | 'numeric' | 'time';
export type HabitFrequency = 'daily' | 'weekly' | 'specific_days';

export const habits = sqliteTable(
  'habits',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    emoji: text('emoji'),
    trackingType: text('tracking_type').$type<HabitTrackingType>().notNull(),
    target: real('target'),
    unit: text('unit'),
    frequency: text('frequency').$type<HabitFrequency>().notNull().default('daily'),
    frequencyTarget: integer('frequency_target'),
    scheduledDays: text('scheduled_days'),
    pausedUntil: text('paused_until'),
    sortOrder: integer('sort_order').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
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
    index('habits_user_id_idx').on(table.userId),
    check(
      'habits_tracking_type_check',
      sql`${table.trackingType} in ('boolean', 'numeric', 'time')`,
    ),
  ],
);

export const habitEntries = sqliteTable(
  'habit_entries',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    habitId: text('habit_id')
      .notNull()
      .references(() => habits.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    value: real('value'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    unique('habit_entries_habit_id_date_unique').on(table.habitId, table.date),
    index('habit_entries_user_id_idx').on(table.userId),
    index('habit_entries_date_idx').on(table.date),
    check(
      'habit_entries_date_format_check',
      sql`${table.date} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
  ],
);
