import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import { users } from './users.js';

export const dashboardConfig = sqliteTable(
  'dashboard_config',
  {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    habitChainIds: text('habit_chain_ids').$type<string[]>().notNull().default(sql`'[]'`),
    trendMetrics: text('trend_metrics').$type<string[]>().notNull().default(sql`'[]'`),
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
  (table) => [unique('dashboard_config_user_id_unique').on(table.userId)],
);
