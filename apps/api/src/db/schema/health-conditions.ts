import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { users } from './users.js';

export type HealthConditionStatus = 'active' | 'monitoring' | 'resolved';
export type ConditionTimelineEventType =
  | 'onset'
  | 'flare'
  | 'improvement'
  | 'treatment'
  | 'milestone';
export type ConditionProtocolStatus = 'active' | 'discontinued' | 'completed';

export const healthConditions = sqliteTable(
  'health_conditions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    bodyArea: text('body_area').notNull(),
    status: text('status').$type<HealthConditionStatus>().notNull(),
    onsetDate: text('onset_date').notNull(),
    description: text('description'),
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
    index('health_conditions_user_id_idx').on(table.userId),
    check(
      'health_conditions_status_check',
      sql`${table.status} in ('active', 'monitoring', 'resolved')`,
    ),
    check(
      'health_conditions_onset_date_format_check',
      sql`${table.onsetDate} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
  ],
);

export const conditionTimelineEvents = sqliteTable(
  'condition_timeline_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    conditionId: text('condition_id')
      .notNull()
      .references(() => healthConditions.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    event: text('event').notNull(),
    type: text('type').$type<ConditionTimelineEventType>().notNull(),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('condition_timeline_events_condition_date_idx').on(table.conditionId, table.date),
    check(
      'condition_timeline_events_date_format_check',
      sql`${table.date} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
    check(
      'condition_timeline_events_type_check',
      sql`${table.type} in ('onset', 'flare', 'improvement', 'treatment', 'milestone')`,
    ),
  ],
);

export const conditionProtocols = sqliteTable(
  'condition_protocols',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    conditionId: text('condition_id')
      .notNull()
      .references(() => healthConditions.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: text('status').$type<ConditionProtocolStatus>().notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date'),
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
    index('condition_protocols_condition_id_idx').on(table.conditionId),
    check(
      'condition_protocols_status_check',
      sql`${table.status} in ('active', 'discontinued', 'completed')`,
    ),
    check(
      'condition_protocols_start_date_format_check',
      sql`${table.startDate} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
    check(
      'condition_protocols_end_date_format_check',
      sql`${table.endDate} is null or ${table.endDate} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
    check(
      'condition_protocols_end_date_order_check',
      sql`${table.endDate} is null or ${table.endDate} >= ${table.startDate}`,
    ),
  ],
);

export const conditionSeverityPoints = sqliteTable(
  'condition_severity_points',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    conditionId: text('condition_id')
      .notNull()
      .references(() => healthConditions.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    value: integer('value').notNull(),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('condition_severity_points_condition_date_idx').on(table.conditionId, table.date),
    check(
      'condition_severity_points_date_format_check',
      sql`${table.date} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
    check('condition_severity_points_value_check', sql`${table.value} between 1 and 10`),
  ],
);
