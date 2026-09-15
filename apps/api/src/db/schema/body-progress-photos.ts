import { randomUUID } from 'node:crypto';

import type { BodyProgressPhotoVariant, BodyProgressPhotoView } from '@pulse/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

import { bodyCheckIns } from './body-check-ins.js';
import { users } from './users.js';

export type StoredPhotoVariant = {
  variant: BodyProgressPhotoVariant;
  storageKey: string;
  mediaType: string;
  byteSize: number;
  width: number;
  height: number;
  checksum: string;
  nonce: string;
  authTag: string;
};

export const bodyProgressPhotoPreferences = sqliteTable(
  'body_progress_photo_preferences',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    consentVersion: text('consent_version'),
    consentState: text('consent_state')
      .$type<'not_decided' | 'declined' | 'granted' | 'revoked'>()
      .notNull()
      .default('not_decided'),
    consentedAt: integer('consented_at', { mode: 'number' }),
    declinedAt: integer('declined_at', { mode: 'number' }),
    revokedAt: integer('revoked_at', { mode: 'number' }),
    cadenceDays: integer('cadence_days').notNull().default(28),
    anchorDate: text('anchor_date').notNull(),
    sideView: text('side_view').$type<'side_left' | 'side_right'>().notNull().default('side_right'),
    reminderLocalTime: text('reminder_local_time'),
    snoozedUntil: text('snoozed_until'),
    lastDismissedDueDate: text('last_dismissed_due_date'),
    lastScheduledOccurrenceDate: text('last_scheduled_occurrence_date'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    check(
      'body_progress_photo_preferences_consent_state_check',
      sql`${table.consentState} in ('not_decided','declined','granted','revoked')`,
    ),
    check(
      'body_progress_photo_preferences_consent_version_check',
      sql`(${table.consentState} = 'not_decided' and ${table.consentVersion} is null) or (${table.consentState} != 'not_decided' and ${table.consentVersion} is not null and length(${table.consentVersion}) > 0)`,
    ),
    check(
      'body_progress_photo_preferences_consent_timestamps_check',
      sql`(${table.consentState} = 'granted' and ${table.consentedAt} is not null and ${table.revokedAt} is null) or (${table.consentState} = 'declined' and ${table.declinedAt} is not null and ${table.consentedAt} is null and ${table.revokedAt} is null) or (${table.consentState} = 'revoked' and ${table.consentedAt} is not null and ${table.revokedAt} is not null) or (${table.consentState} = 'not_decided' and ${table.consentedAt} is null and ${table.declinedAt} is null and ${table.revokedAt} is null)`,
    ),
    check(
      'body_progress_photo_preferences_cadence_check',
      sql`${table.cadenceDays} between 14 and 180`,
    ),
    check(
      'body_progress_photo_preferences_anchor_check',
      sql`date(${table.anchorDate}, '+0 days') = ${table.anchorDate}`,
    ),
    check(
      'body_progress_photo_preferences_side_check',
      sql`${table.sideView} in ('side_left','side_right')`,
    ),
    check(
      'body_progress_photo_preferences_reminder_check',
      sql`${table.reminderLocalTime} is null or (${table.reminderLocalTime} glob '[0-2][0-9]:[0-5][0-9]' and time(${table.reminderLocalTime} || ':00') is not null)`,
    ),
    check(
      'body_progress_photo_preferences_snooze_date_check',
      sql`${table.snoozedUntil} is null or date(${table.snoozedUntil}, '+0 days') = ${table.snoozedUntil}`,
    ),
    check(
      'body_progress_photo_preferences_dismissed_date_check',
      sql`${table.lastDismissedDueDate} is null or date(${table.lastDismissedDueDate}, '+0 days') = ${table.lastDismissedDueDate}`,
    ),
    check(
      'body_progress_photo_preferences_scheduled_date_check',
      sql`${table.lastScheduledOccurrenceDate} is null or date(${table.lastScheduledOccurrenceDate}, '+0 days') = ${table.lastScheduledOccurrenceDate}`,
    ),
  ],
);

export const bodyProgressPhotoSets = sqliteTable(
  'body_progress_photo_sets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bodyCheckInId: text('body_check_in_id').references(() => bodyCheckIns.id, {
      onDelete: 'set null',
    }),
    date: text('local_date').notNull(),
    localTime: text('local_time'),
    guideVersion: text('guide_version').notNull(),
    context: text('context', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    notes: text('notes'),
    status: text('status').$type<'partial' | 'complete'>().notNull().default('partial'),
    countAsScheduledOccurrence: integer('count_as_scheduled_occurrence', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    unique('body_progress_photo_sets_id_user_unique').on(table.id, table.userId),
    index('body_progress_photo_sets_user_date_idx').on(table.userId, table.date),
    index('body_progress_photo_sets_check_in_idx').on(table.bodyCheckInId),
    check(
      'body_progress_photo_sets_date_check',
      sql`date(${table.date}, '+0 days') = ${table.date}`,
    ),
    check(
      'body_progress_photo_sets_time_check',
      sql`${table.localTime} is null or (${table.localTime} glob '[0-2][0-9]:[0-5][0-9]' and time(${table.localTime} || ':00') is not null)`,
    ),
    check('body_progress_photo_sets_guide_check', sql`length(${table.guideVersion}) > 0`),
    check(
      'body_progress_photo_sets_context_check',
      sql`json_valid(${table.context}) and json_type(${table.context}) = 'object'`,
    ),
    check('body_progress_photo_sets_status_check', sql`${table.status} in ('partial','complete')`),
    check(
      'body_progress_photo_sets_scheduled_check',
      sql`${table.countAsScheduledOccurrence} in (0,1)`,
    ),
  ],
);

export const bodyProgressPhotos = sqliteTable(
  'body_progress_photos',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    setId: text('set_id').notNull(),
    userId: text('user_id').notNull(),
    view: text('view').$type<BodyProgressPhotoView>().notNull(),
    normalizedMediaType: text('normalized_media_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    checksum: text('checksum').notNull(),
    variants: text('variants', { mode: 'json' }).$type<StoredPhotoVariant[]>().notNull(),
    encryptionVersion: text('encryption_version').notNull(),
    processingVersion: text('processing_version').notNull(),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    foreignKey({
      columns: [table.setId, table.userId],
      foreignColumns: [bodyProgressPhotoSets.id, bodyProgressPhotoSets.userId],
      name: 'body_progress_photos_owned_set_fk',
    }).onDelete('cascade'),
    unique('body_progress_photos_set_view_unique').on(table.setId, table.view),
    index('body_progress_photos_user_idx').on(table.userId),
    check(
      'body_progress_photos_view_check',
      sql`${table.view} in ('front','side_left','side_right','back')`,
    ),
    check(
      'body_progress_photos_media_type_check',
      sql`${table.normalizedMediaType} = 'image/jpeg'`,
    ),
    check(
      'body_progress_photos_size_check',
      sql`${table.byteSize} > 0 and ${table.width} > 0 and ${table.height} > 0`,
    ),
    check(
      'body_progress_photos_checksum_check',
      sql`length(${table.checksum}) = 64 and ${table.checksum} not glob '*[^0-9a-f]*'`,
    ),
    check(
      'body_progress_photos_variants_check',
      sql`json_valid(${table.variants}) and json_type(${table.variants}) = 'array' and json_array_length(${table.variants}) = 4`,
    ),
    check(
      'body_progress_photos_encryption_version_check',
      sql`${table.encryptionVersion} = 'aes-256-gcm-v1'`,
    ),
    check(
      'body_progress_photos_processing_version_check',
      sql`${table.processingVersion} = 'sharp-jpeg-v1'`,
    ),
  ],
);

export const bodyProgressPhotoDeletionIntents = sqliteTable(
  'body_progress_photo_deletion_intents',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id').notNull(),
    scope: text('scope').$type<'photo' | 'set' | 'all' | 'account'>().notNull(),
    scopeId: text('scope_id').notNull(),
    storageKey: text('storage_key').notNull(),
    quarantineKey: text('quarantine_key').notNull(),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    unique('body_progress_photo_deletion_intents_storage_key_unique').on(table.storageKey),
    unique('body_progress_photo_deletion_intents_quarantine_key_unique').on(table.quarantineKey),
    index('body_progress_photo_deletion_intents_scope_idx').on(
      table.userId,
      table.scope,
      table.scopeId,
    ),
    check(
      'body_progress_photo_deletion_intents_scope_check',
      sql`${table.scope} in ('photo','set','all','account')`,
    ),
  ],
);
