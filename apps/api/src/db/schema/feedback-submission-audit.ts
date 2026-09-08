import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users.js';
import { workoutSessions } from './workout-sessions.js';

// Private owner-scoped submissions. Never include rawPayload in generic session/context serialization.
export const feedbackSubmissionAudit = sqliteTable(
  'feedback_submission_audit',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    rawPayload: text('raw_payload').notNull(),
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id'),
    receivedAt: integer('received_at').notNull(),
    classification: text('classification').notNull(),
  },
  (table) => [
    index('feedback_submission_audit_owner_session_idx').on(table.userId, table.sessionId),
  ],
);
