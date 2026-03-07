import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { users } from './users.js';

export type ActivityType =
  | 'walking'
  | 'running'
  | 'stretching'
  | 'yoga'
  | 'cycling'
  | 'swimming'
  | 'hiking'
  | 'other';

export const activities = sqliteTable(
  'activities',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    type: text('type').$type<ActivityType>().notNull(),
    name: text('name').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('activities_user_date_idx').on(table.userId, table.date),
    check(
      'activities_date_format_check',
      sql`${table.date} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
    check(
      'activities_type_check',
      sql`${table.type} in ('walking', 'running', 'stretching', 'yoga', 'cycling', 'swimming', 'hiking', 'other')`,
    ),
    check('activities_duration_minutes_check', sql`${table.durationMinutes} > 0`),
  ],
);
