import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

import { workoutSessions } from './workout-sessions.js';
import { workoutTemplates } from './workout-templates.js';
import { users } from './users.js';

export const scheduledWorkouts = sqliteTable(
  'scheduled_workouts',
  {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    templateId: text('template_id')
      .references(() => workoutTemplates.id, { onDelete: 'set null' }),
    date: text('date').notNull(),
    sessionId: text('session_id').references(() => workoutSessions.id, {
      onDelete: 'set null',
    }),
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
    index('scheduled_workouts_user_date_idx').on(table.userId, table.date),
    index('scheduled_workouts_template_id_idx').on(table.templateId),
    index('scheduled_workouts_session_id_idx').on(table.sessionId),
    check(
      'scheduled_workouts_date_format_check',
      sql`${table.date} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
  ],
);
