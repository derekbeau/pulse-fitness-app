import { randomUUID } from 'node:crypto';

import type { LengthUnit } from '@pulse/shared';
import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import { users } from './users.js';

export const bodyMeasurements = sqliteTable(
  'body_measurements',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('local_date').notNull(),
    waistMm: integer('waist_mm'),
    hipsMm: integer('hips_mm'),
    chestMm: integer('chest_mm'),
    neckMm: integer('neck_mm'),
    leftArmMm: integer('left_arm_mm'),
    rightArmMm: integer('right_arm_mm'),
    leftThighMm: integer('left_thigh_mm'),
    rightThighMm: integer('right_thigh_mm'),
    bodyFatPercent: real('body_fat_percent'),
    unitAtEntry: text('unit_at_entry').$type<LengthUnit>(),
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
    unique('body_measurements_user_id_local_date_unique').on(table.userId, table.date),
    index('body_measurements_user_id_local_date_idx').on(table.userId, table.date),
    check(
      'body_measurements_local_date_check',
      sql`${table.date} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and date(${table.date}, '+0 days') = ${table.date}`,
    ),
    check(
      'body_measurements_values_check',
      sql`(${table.waistMm} is null or (typeof(${table.waistMm}) = 'integer' and ${table.waistMm} between 200 and 3000))
        and (${table.hipsMm} is null or (typeof(${table.hipsMm}) = 'integer' and ${table.hipsMm} between 200 and 3000))
        and (${table.chestMm} is null or (typeof(${table.chestMm}) = 'integer' and ${table.chestMm} between 200 and 3000))
        and (${table.neckMm} is null or (typeof(${table.neckMm}) = 'integer' and ${table.neckMm} between 200 and 3000))
        and (${table.leftArmMm} is null or (typeof(${table.leftArmMm}) = 'integer' and ${table.leftArmMm} between 200 and 3000))
        and (${table.rightArmMm} is null or (typeof(${table.rightArmMm}) = 'integer' and ${table.rightArmMm} between 200 and 3000))
        and (${table.leftThighMm} is null or (typeof(${table.leftThighMm}) = 'integer' and ${table.leftThighMm} between 200 and 3000))
        and (${table.rightThighMm} is null or (typeof(${table.rightThighMm}) = 'integer' and ${table.rightThighMm} between 200 and 3000))
        and (${table.bodyFatPercent} is null or (${table.bodyFatPercent} between 1 and 70
          and abs(${table.bodyFatPercent} * 10 - round(${table.bodyFatPercent} * 10)) < 0.000000001))`,
    ),
    check(
      'body_measurements_nonempty_check',
      sql`${table.waistMm} is not null or ${table.hipsMm} is not null or ${table.chestMm} is not null
        or ${table.neckMm} is not null or ${table.leftArmMm} is not null or ${table.rightArmMm} is not null
        or ${table.leftThighMm} is not null or ${table.rightThighMm} is not null or ${table.bodyFatPercent} is not null`,
    ),
    check(
      'body_measurements_unit_at_entry_check',
      sql`${table.unitAtEntry} is null or ${table.unitAtEntry} in ('cm', 'in')`,
    ),
    check(
      'body_measurements_circumference_unit_check',
      sql`(${table.waistMm} is null and ${table.hipsMm} is null and ${table.chestMm} is null
        and ${table.neckMm} is null and ${table.leftArmMm} is null and ${table.rightArmMm} is null
        and ${table.leftThighMm} is null and ${table.rightThighMm} is null) or ${table.unitAtEntry} is not null`,
    ),
    check(
      'body_measurements_notes_check',
      sql`${table.notes} is null or (${table.notes} = trim(${table.notes}) and length(${table.notes}) between 1 and 2000)`,
    ),
  ],
);
