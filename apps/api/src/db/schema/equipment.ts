import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { users } from './users.js';

export type EquipmentItemCategory =
  | 'free-weights'
  | 'machines'
  | 'cables'
  | 'cardio'
  | 'accessories';

export const equipmentLocations = sqliteTable(
  'equipment_locations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now()),
  },
  (table) => [index('equipment_locations_user_id_idx').on(table.userId)],
);

export const equipmentItems = sqliteTable(
  'equipment_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    locationId: text('location_id')
      .notNull()
      .references(() => equipmentLocations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category').$type<EquipmentItemCategory>().notNull(),
    details: text('details'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('equipment_items_location_id_idx').on(table.locationId),
    check(
      'equipment_items_category_check',
      sql`${table.category} in ('free-weights', 'machines', 'cables', 'cardio', 'accessories')`,
    ),
  ],
);
