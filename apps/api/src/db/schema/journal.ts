import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { ActivityJournalActor, JournalObservation } from '@pulse/shared';

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
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now())
      .$onUpdateFn(() => Date.now()),
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

export const journalObservations = sqliteTable(
  'journal_observations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    localDate: text('local_date').notNull(),
    timeZone: text('time_zone').notNull(),
    currentRevisionId: text('current_revision_id').notNull(),
    revision: integer('revision').notNull(),
    snapshot: text('snapshot_json', { mode: 'json' }).$type<JournalObservation>().notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('journal_observations_user_day_idx').on(table.userId, table.localDate, table.createdAt),
  ],
);

export const journalObservationRevisions = sqliteTable(
  'journal_observation_revisions',
  {
    id: text('id').primaryKey(),
    observationId: text('observation_id')
      .notNull()
      .references(() => journalObservations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    priorRevisionId: text('prior_revision_id').references(
      (): AnySQLiteColumn => journalObservationRevisions.id,
      { onDelete: 'cascade' },
    ),
    recordedAt: text('recorded_at').notNull(),
    recordedBy: text('recorded_by_json', { mode: 'json' }).$type<ActivityJournalActor>().notNull(),
    reason: text('reason'),
    snapshot: text('snapshot_json', { mode: 'json' }).$type<JournalObservation>().notNull(),
  },
  (table) => [
    uniqueIndex('journal_observation_revisions_sequence_unique').on(
      table.observationId,
      table.revision,
    ),
  ],
);

export const journalIdempotencyReceipts = sqliteTable(
  'journal_idempotency_receipts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    route: text('route').notNull(),
    operation: text('operation').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    statusCode: integer('status_code').notNull(),
    response: text('response_json', { mode: 'json' }).$type<unknown>().notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('journal_receipts_scope_key_unique').on(
      table.userId,
      table.route,
      table.operation,
      table.idempotencyKey,
    ),
  ],
);
