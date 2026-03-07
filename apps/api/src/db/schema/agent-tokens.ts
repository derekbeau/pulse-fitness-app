import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { users } from './users.js';

export const agentTokens = sqliteTable('agent_tokens', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull(),
  lastUsedAt: integer('last_used_at', { mode: 'number' }),
  createdAt: integer('created_at', { mode: 'number' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$defaultFn(() => Date.now()),
});
