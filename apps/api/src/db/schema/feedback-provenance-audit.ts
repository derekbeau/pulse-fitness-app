import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, primaryKey, index, check } from 'drizzle-orm/sqlite-core';
import { users } from './users.js';
import { workoutSessions } from './workout-sessions.js';

export const feedbackProvenanceAudit = sqliteTable(
  'feedback_provenance_audit',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    sourceChecksum: text('source_checksum').notNull(),
    sourceVersion: integer('source_version').notNull(),
    rawPayload: text('raw_payload').notNull(),
    projectedPayload: text('projected_payload').notNull(),
    projectedChecksum: text('projected_checksum').notNull(),
    classifiedAt: text('classified_at').notNull(),
    reason: text('reason').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.sessionId, table.sourceChecksum] })],
);

export const feedbackMigrationLedger = sqliteTable(
  'feedback_migration_ledger',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    sourceChecksum: text('source_checksum').notNull(),
    projectedChecksum: text('projected_checksum').notNull(),
    sourceVersion: integer('source_version').notNull(),
    reason: text('reason').notNull(),
    sourceEvidence: text('source_evidence'),
    classifiedAt: text('classified_at').notNull(),
    rolledBackAt: text('rolled_back_at'),
  },
  (table) => [primaryKey({ columns: [table.userId, table.sessionId] })],
);

export const feedbackNoteDispositions = sqliteTable(
  'feedback_note_dispositions',
  {
    id: text('id').primaryKey().notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    parentId: text('parent_id').notNull(),
    sourceId: text('source_id').notNull(),
    field: text('field').notNull(),
    sourceKey: text('source_key'),
    noteChecksum: text('note_checksum').notNull(),
    rawText: text('raw_text').notNull(),
    originalActor: text('original_actor'),
    originalTimestamp: integer('original_timestamp'),
    state: text('state', { enum: ['superseded', 'pending_review'] }).notNull(),
    evidenceId: text('evidence_id'),
    sourceSessionId: text('source_session_id'),
    sourceChecksum: text('source_checksum'),
    construct: text('construct'),
    reason: text('reason').notNull(),
    classifiedAt: text('classified_at').notNull(),
    rolledBackAt: text('rolled_back_at'),
  },
  (table) => [
    index('feedback_note_dispositions_owner_parent_idx').on(
      table.userId,
      table.kind,
      table.parentId,
    ),
    check(
      'feedback_note_dispositions_state_check',
      sql`${table.state} IN ('superseded','pending_review')`,
    ),
  ],
);
