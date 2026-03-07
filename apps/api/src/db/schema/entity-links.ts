import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export type EntityLinkSourceType = 'journal' | 'activity' | 'resource';
export type EntityLinkTargetType =
  | 'workout'
  | 'activity'
  | 'habit'
  | 'injury'
  | 'exercise'
  | 'protocol';

export const entityLinks = sqliteTable(
  'entity_links',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    sourceType: text('source_type').$type<EntityLinkSourceType>().notNull(),
    sourceId: text('source_id').notNull(),
    targetType: text('target_type').$type<EntityLinkTargetType>().notNull(),
    targetId: text('target_id').notNull(),
    targetName: text('target_name').notNull(),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('entity_links_source_type_source_id_idx').on(table.sourceType, table.sourceId),
    index('entity_links_target_type_target_id_idx').on(table.targetType, table.targetId),
    check(
      'entity_links_source_type_check',
      sql`${table.sourceType} in ('journal', 'activity', 'resource')`,
    ),
    check(
      'entity_links_target_type_check',
      sql`${table.targetType} in ('workout', 'activity', 'habit', 'injury', 'exercise', 'protocol')`,
    ),
  ],
);
