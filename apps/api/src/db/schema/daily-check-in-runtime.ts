import type {
  ActivityJournalActor,
  CheckInQuestionRevision,
  DailyCheckInSourceReference,
  Provenance,
} from '@pulse/shared';
import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import { users } from './users.js';

export type StoredDailyCheckInSourceReference = Omit<DailyCheckInSourceReference, 'subjectUserId'>;

export const dailyCheckInQuestions = sqliteTable(
  'daily_check_in_questions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    localDate: text('local_date').notNull(),
    timeZone: text('time_zone').notNull(),
    deduplicationKey: text('deduplication_key').notNull(),
    semanticTopic: text('semantic_topic').notNull(),
    prompt: text('prompt').notNull(),
    state: text('state').$type<'pending' | 'answered' | 'retired'>().notNull().default('pending'),
    sourceReferences: text('source_references_json', { mode: 'json' })
      .$type<StoredDailyCheckInSourceReference[]>()
      .notNull(),
    followUpQuestionId: text('follow_up_question_id').references(
      (): AnySQLiteColumn => dailyCheckInQuestions.id,
      { onDelete: 'set null' },
    ),
    revision: integer('revision').notNull().default(1),
    currentRevisionId: text('current_revision_id').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('daily_check_in_questions_user_deduplication_unique').on(
      table.userId,
      table.deduplicationKey,
    ),
    index('daily_check_in_questions_user_day_state_idx').on(
      table.userId,
      table.localDate,
      table.state,
      table.createdAt,
    ),
    check(
      'daily_check_in_questions_state_check',
      sql`${table.state} in ('pending','answered','retired')`,
    ),
    check('daily_check_in_questions_revision_check', sql`${table.revision} >= 1`),
  ],
);

export const dailyCheckInQuestionRevisions = sqliteTable(
  'daily_check_in_question_revisions',
  {
    id: text('id').primaryKey(),
    questionId: text('question_id')
      .notNull()
      .references(() => dailyCheckInQuestions.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    priorRevisionId: text('prior_revision_id').references(
      (): AnySQLiteColumn => dailyCheckInQuestionRevisions.id,
      { onDelete: 'cascade' },
    ),
    snapshot: text('snapshot_json', { mode: 'json' }).$type<CheckInQuestionRevision>().notNull(),
    actor: text('actor_json', { mode: 'json' }).$type<ActivityJournalActor>().notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('daily_check_in_question_revisions_question_revision_unique').on(
      table.questionId,
      table.revision,
    ),
  ],
);

export const dailyCheckInAnswers = sqliteTable(
  'daily_check_in_answers',
  {
    id: text('id').primaryKey(),
    questionId: text('question_id')
      .notNull()
      .references(() => dailyCheckInQuestions.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    state: text('state').$type<'answered' | 'unknown' | 'skipped'>().notNull(),
    value: text('value'),
    source: text('source_json', { mode: 'json' }).$type<Provenance>().notNull(),
    answeredAt: text('answered_at').notNull(),
    revision: integer('revision').notNull().default(1),
    currentRevisionId: text('current_revision_id').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('daily_check_in_answers_question_unique').on(table.questionId)],
);

export const dailyCheckInAnswerRevisions = sqliteTable(
  'daily_check_in_answer_revisions',
  {
    id: text('id').primaryKey(),
    answerId: text('answer_id')
      .notNull()
      .references(() => dailyCheckInAnswers.id, { onDelete: 'cascade' }),
    questionId: text('question_id')
      .notNull()
      .references(() => dailyCheckInQuestions.id, { onDelete: 'cascade' }),
    questionRevisionId: text('question_revision_id')
      .notNull()
      .references(() => dailyCheckInQuestionRevisions.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    priorRevisionId: text('prior_revision_id').references(
      (): AnySQLiteColumn => dailyCheckInAnswerRevisions.id,
      { onDelete: 'cascade' },
    ),
    state: text('state').$type<'answered' | 'unknown' | 'skipped'>().notNull(),
    value: text('value'),
    source: text('source_json', { mode: 'json' }).$type<Provenance>().notNull(),
    answeredAt: text('answered_at').notNull(),
    reason: text('reason'),
    actor: text('actor_json', { mode: 'json' }).$type<ActivityJournalActor>().notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('daily_check_in_answer_revisions_answer_revision_unique').on(
      table.answerId,
      table.revision,
    ),
    index('daily_check_in_answer_revisions_user_question_idx').on(
      table.userId,
      table.questionId,
      table.revision,
    ),
  ],
);

export const dailyCheckInIdempotencyReceipts = sqliteTable(
  'daily_check_in_idempotency_receipts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id').notNull(),
    route: text('route').notNull(),
    operation: text('operation').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    statusCode: integer('status_code').notNull(),
    response: text('response_json', { mode: 'json' }).$type<unknown>().notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('daily_check_in_idempotency_receipts_scope_key_unique').on(
      table.userId,
      table.route,
      table.operation,
      table.idempotencyKey,
    ),
  ],
);
