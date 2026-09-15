import { randomUUID } from 'node:crypto';

import type {
  BodyCheckInChangeKind,
  BodyCheckInSource,
  BodyEnabledSite,
  BodyMealContext,
  BodyMeasurementLaterality,
  BodyMeasurementSite,
  BodyReadingQuality,
  BodyWorkoutContext,
  LengthUnit,
} from '@pulse/shared';
import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import { users } from './users.js';

export const bodyCheckInPreferences = sqliteTable(
  'body_check_in_preferences',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    measurementCadenceDays: integer('measurement_cadence_days').notNull().default(14),
    lengthUnit: text('length_unit').$type<LengthUnit>().notNull(),
    enabledSites: text('enabled_sites', { mode: 'json' }).$type<BodyEnabledSite[]>().notNull(),
    anchorDate: text('anchor_date').notNull(),
    reminderLocalTime: text('reminder_local_time'),
    protocolVersion: text('protocol_version').notNull(),
    snoozedUntil: text('snoozed_until'),
    lastDismissedDueDate: text('last_dismissed_due_date'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    check(
      'body_check_in_preferences_cadence_check',
      sql`${table.measurementCadenceDays} between 7 and 90`,
    ),
    check('body_check_in_preferences_unit_check', sql`${table.lengthUnit} in ('cm', 'in')`),
    check(
      'body_check_in_preferences_anchor_check',
      sql`date(${table.anchorDate}, '+0 days') = ${table.anchorDate}`,
    ),
    check(
      'body_check_in_preferences_reminder_check',
      sql`${table.reminderLocalTime} is null or ${table.reminderLocalTime} glob '[0-2][0-9]:[0-5][0-9]'`,
    ),
  ],
);

export const bodyCheckIns = sqliteTable(
  'body_check_ins',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('local_date').notNull(),
    localTime: text('local_time'),
    status: text('status').$type<'draft' | 'completed'>().notNull(),
    version: integer('version').notNull().default(1),
    mealContext: text('meal_context').$type<BodyMealContext>().notNull().default('unspecified'),
    workoutContext: text('workout_context')
      .$type<BodyWorkoutContext>()
      .notNull()
      .default('unspecified'),
    pumpPresent: integer('pump_present', { mode: 'boolean' }),
    unusualBloating: integer('unusual_bloating', { mode: 'boolean' }),
    notes: text('notes'),
    protocolVersion: text('protocol_version').notNull(),
    source: text('source').$type<BodyCheckInSource>().notNull(),
    sourceId: text('source_id'),
    countAsScheduledOccurrence: integer('count_as_scheduled_occurrence', { mode: 'boolean' })
      .notNull()
      .default(true),
    idempotencyKey: text('idempotency_key'),
    idempotencyHash: text('idempotency_hash'),
    completedAt: integer('completed_at', { mode: 'number' }),
    correctedAt: integer('corrected_at', { mode: 'number' }),
    correctedBySource: text('corrected_by_source').$type<BodyCheckInSource>(),
    correctedBySourceId: text('corrected_by_source_id'),
    correctionReason: text('correction_reason'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    unique('body_check_ins_user_date_unique').on(table.userId, table.date),
    unique('body_check_ins_user_idempotency_unique').on(table.userId, table.idempotencyKey),
    index('body_check_ins_user_date_idx').on(table.userId, table.date),
    check('body_check_ins_date_check', sql`date(${table.date}, '+0 days') = ${table.date}`),
    check(
      'body_check_ins_time_check',
      sql`${table.localTime} is null or ${table.localTime} glob '[0-2][0-9]:[0-5][0-9]'`,
    ),
    check('body_check_ins_status_check', sql`${table.status} in ('draft', 'completed')`),
    check('body_check_ins_version_check', sql`${table.version} >= 1`),
    check('body_check_ins_source_check', sql`${table.source} in ('user', 'agent_token')`),
  ],
);

export const bodyCheckInVersions = sqliteTable(
  'body_check_in_versions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    checkInId: text('check_in_id')
      .notNull()
      .references(() => bodyCheckIns.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    date: text('local_date').notNull(),
    localTime: text('local_time'),
    status: text('status').$type<'draft' | 'completed'>().notNull(),
    mealContext: text('meal_context').$type<BodyMealContext>().notNull(),
    workoutContext: text('workout_context').$type<BodyWorkoutContext>().notNull(),
    pumpPresent: integer('pump_present', { mode: 'boolean' }),
    unusualBloating: integer('unusual_bloating', { mode: 'boolean' }),
    notes: text('notes'),
    protocolVersion: text('protocol_version').notNull(),
    source: text('source').$type<BodyCheckInSource>().notNull(),
    sourceId: text('source_id'),
    countAsScheduledOccurrence: integer('count_as_scheduled_occurrence', {
      mode: 'boolean',
    }).notNull(),
    completedAt: integer('completed_at', { mode: 'number' }),
    actorSource: text('actor_source').$type<BodyCheckInSource>().notNull(),
    actorSourceId: text('actor_source_id'),
    changeKind: text('change_kind').$type<BodyCheckInChangeKind>().notNull(),
    changeReason: text('change_reason').notNull(),
    recordedAt: integer('recorded_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    unique('body_check_in_versions_check_in_version_unique').on(table.checkInId, table.version),
    index('body_check_in_versions_check_in_idx').on(table.checkInId, table.version),
    check('body_check_in_versions_version_check', sql`${table.version} >= 1`),
    check('body_check_in_versions_date_check', sql`date(${table.date}, '+0 days') = ${table.date}`),
    check(
      'body_check_in_versions_time_check',
      sql`${table.localTime} is null or ${table.localTime} glob '[0-2][0-9]:[0-5][0-9]'`,
    ),
    check('body_check_in_versions_status_check', sql`${table.status} in ('draft', 'completed')`),
    check(
      'body_check_in_versions_context_check',
      sql`${table.mealContext} in ('unspecified', 'pre_meal', 'post_meal') and ${table.workoutContext} in ('unspecified', 'pre_workout', 'post_workout')`,
    ),
    check(
      'body_check_in_versions_change_kind_check',
      sql`${table.changeKind} in ('created', 'draft_update', 'completed', 'correction')`,
    ),
    check(
      'body_check_in_versions_source_check',
      sql`${table.source} in ('user', 'agent_token') and ${table.actorSource} in ('user', 'agent_token')`,
    ),
    check(
      'body_check_in_versions_completion_check',
      sql`(${table.status} = 'completed' and ${table.completedAt} is not null) or (${table.status} = 'draft' and ${table.completedAt} is null)`,
    ),
  ],
);

export const bodyCheckInMeasurements = sqliteTable(
  'body_check_in_measurements',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    checkInId: text('check_in_id')
      .notNull()
      .references(() => bodyCheckIns.id, { onDelete: 'cascade' }),
    site: text('site').$type<BodyMeasurementSite>().notNull(),
    laterality: text('laterality').$type<BodyMeasurementLaterality>().notNull(),
    unitAtEntry: text('unit_at_entry').$type<LengthUnit>().notNull(),
    reading1Mm: integer('reading_1_mm').notNull(),
    reading2Mm: integer('reading_2_mm'),
    reading3Mm: integer('reading_3_mm'),
    canonicalMm: integer('canonical_mm').notNull(),
    quality: text('quality').$type<BodyReadingQuality>().notNull(),
    selectedReadingPair: text('selected_reading_pair', { mode: 'json' }).$type<
      [1 | 2 | 3, 1 | 2 | 3] | null
    >(),
    protocolId: text('protocol_id').$type<BodyMeasurementSite>().notNull(),
    protocolVersion: text('protocol_version').notNull(),
    protocolName: text('protocol_name').notNull(),
    protocolInstructions: text('protocol_instructions').notNull(),
    protocolSourceUrls: text('protocol_source_urls', { mode: 'json' }).$type<string[]>().notNull(),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    unique('body_check_in_measurements_check_in_site_side_unique').on(
      table.checkInId,
      table.site,
      table.laterality,
    ),
    index('body_check_in_measurements_check_in_idx').on(table.checkInId),
    check('body_check_in_measurements_unit_check', sql`${table.unitAtEntry} in ('cm', 'in')`),
    check(
      'body_check_in_measurements_bounds_check',
      sql`${table.reading1Mm} between 200 and 3000 and (${table.reading2Mm} is null or ${table.reading2Mm} between 200 and 3000) and (${table.reading3Mm} is null or ${table.reading3Mm} between 200 and 3000) and ${table.canonicalMm} between 200 and 3000`,
    ),
    check(
      'body_check_in_measurements_sequence_check',
      sql`${table.reading3Mm} is null or ${table.reading2Mm} is not null`,
    ),
    check(
      'body_check_in_measurements_laterality_check',
      sql`((${table.site} in ('waist_iliac_crest_nhanes','chest_nipple_line_relaxed','hips_maximum') and ${table.laterality} = 'none') or (${table.site} in ('upper_arm_midpoint_flexed','thigh_midpoint') and ${table.laterality} in ('left','right')))`,
    ),
  ],
);

export const bodyCheckInMeasurementVersions = sqliteTable(
  'body_check_in_measurement_versions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    versionId: text('version_id')
      .notNull()
      .references(() => bodyCheckInVersions.id, { onDelete: 'cascade' }),
    site: text('site').$type<BodyMeasurementSite>().notNull(),
    laterality: text('laterality').$type<BodyMeasurementLaterality>().notNull(),
    unitAtEntry: text('unit_at_entry').$type<LengthUnit>().notNull(),
    reading1Mm: integer('reading_1_mm').notNull(),
    reading2Mm: integer('reading_2_mm'),
    reading3Mm: integer('reading_3_mm'),
    canonicalMm: integer('canonical_mm').notNull(),
    quality: text('quality').$type<BodyReadingQuality>().notNull(),
    selectedReadingPair: text('selected_reading_pair', { mode: 'json' }).$type<
      [1 | 2 | 3, 1 | 2 | 3] | null
    >(),
    protocolId: text('protocol_id').$type<BodyMeasurementSite>().notNull(),
    protocolVersion: text('protocol_version').notNull(),
    protocolName: text('protocol_name').notNull(),
    protocolInstructions: text('protocol_instructions').notNull(),
    protocolSourceUrls: text('protocol_source_urls', { mode: 'json' }).$type<string[]>().notNull(),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    unique('body_check_in_measurement_versions_site_side_unique').on(
      table.versionId,
      table.site,
      table.laterality,
    ),
    index('body_check_in_measurement_versions_version_idx').on(table.versionId),
    check(
      'body_check_in_measurement_versions_unit_check',
      sql`${table.unitAtEntry} in ('cm', 'in')`,
    ),
    check(
      'body_check_in_measurement_versions_bounds_check',
      sql`${table.reading1Mm} between 200 and 3000 and (${table.reading2Mm} is null or ${table.reading2Mm} between 200 and 3000) and (${table.reading3Mm} is null or ${table.reading3Mm} between 200 and 3000) and ${table.canonicalMm} between 200 and 3000`,
    ),
    check(
      'body_check_in_measurement_versions_sequence_check',
      sql`${table.reading3Mm} is null or ${table.reading2Mm} is not null`,
    ),
    check(
      'body_check_in_measurement_versions_laterality_check',
      sql`((${table.site} in ('waist_iliac_crest_nhanes','chest_nipple_line_relaxed','hips_maximum') and ${table.laterality} = 'none') or (${table.site} in ('upper_arm_midpoint_flexed','thigh_midpoint') and ${table.laterality} in ('left','right')))`,
    ),
  ],
);
