import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { users } from './users.js';

export type JournalEntryType =
  | 'post-workout'
  | 'milestone'
  | 'observation'
  | 'weekly-summary'
  | 'injury-update';
export type JournalEntryCreatedBy = 'agent' | 'user';

export const journalEntries = sqliteTable(
  'journal_entries',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    title: text('title').notNull(),
    type: text('type').$type<JournalEntryType>().notNull(),
    content: text('content').notNull(),
    createdBy: text('created_by').$type<JournalEntryCreatedBy>().notNull(),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('journal_entries_user_date_idx').on(table.userId, table.date),
    check(
      'journal_entries_date_format_check',
      sql`${table.date} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
    check(
      'journal_entries_type_check',
      sql`${table.type} in ('post-workout', 'milestone', 'observation', 'weekly-summary', 'injury-update')`,
    ),
    check('journal_entries_created_by_check', sql`${table.createdBy} in ('agent', 'user')`),
  ],
);
