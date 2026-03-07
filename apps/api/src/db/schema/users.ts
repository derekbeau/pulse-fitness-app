import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

type UserPreferences = Record<string, unknown>;

export const users = sqliteTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  username: text('username').notNull().unique(),
  name: text('name'),
  passwordHash: text('password_hash').notNull(),
  preferences: text('preferences', { mode: 'json' }).$type<UserPreferences>(),
  createdAt: integer('created_at', { mode: 'number' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'number' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$defaultFn(() => Date.now())
    .$onUpdateFn(() => Date.now()),
});
