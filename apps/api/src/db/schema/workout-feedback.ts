import { randomUUID } from 'node:crypto';

import type {
  WorkoutFeedbackAnswerRevision,
  WorkoutFeedbackQuestionDefinition,
} from '@pulse/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

import { users } from './users.js';
import { workoutSessions } from './workout-sessions.js';

export type WorkoutFeedbackScopeKind = 'template' | 'scheduled' | 'session';
export type WorkoutFeedbackQuestionsSource =
  | 'system_core'
  | 'template_defaults'
  | 'template_snapshot'
  | 'scheduled_override'
  | 'ad_hoc'
  | 'legacy_import';

export const workoutFeedbackQuestionLists = sqliteTable(
  'workout_feedback_question_lists',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scopeKind: text('scope_kind').$type<WorkoutFeedbackScopeKind>().notNull(),
    scopeId: text('scope_id').notNull(),
    currentRevision: integer('current_revision').notNull(),
    source: text('source').$type<WorkoutFeedbackQuestionsSource>().notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    unique('workout_feedback_question_lists_scope_unique').on(
      table.userId,
      table.scopeKind,
      table.scopeId,
    ),
    check(
      'workout_feedback_question_lists_scope_kind_check',
      sql`${table.scopeKind} in ('template','scheduled','session')`,
    ),
    check('workout_feedback_question_lists_revision_check', sql`${table.currentRevision} >= 0`),
    index('workout_feedback_question_lists_owner_scope_idx').on(
      table.userId,
      table.scopeKind,
      table.scopeId,
    ),
  ],
);

export const workoutFeedbackQuestionListRevisions = sqliteTable(
  'workout_feedback_question_list_revisions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    listId: text('list_id')
      .notNull()
      .references(() => workoutFeedbackQuestionLists.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    priorRevisionId: text('prior_revision_id'),
    source: text('source').$type<WorkoutFeedbackQuestionsSource>().notNull(),
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id'),
    actorName: text('actor_name'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    unique('workout_feedback_question_list_revisions_number_unique').on(
      table.listId,
      table.revision,
    ),
    check('workout_feedback_question_list_revisions_positive_check', sql`${table.revision} > 0`),
    index('workout_feedback_question_list_revisions_owner_idx').on(table.userId, table.listId),
  ],
);

export const workoutFeedbackQuestionDefinitions = sqliteTable(
  'workout_feedback_question_definitions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    listRevisionId: text('list_revision_id')
      .notNull()
      .references(() => workoutFeedbackQuestionListRevisions.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionId: text('question_id').notNull(),
    definitionVersion: integer('definition_version').notNull(),
    orderIndex: integer('order_index').notNull(),
    prompt: text('prompt').notNull(),
    type: text('type').notNull(),
    timing: text('timing').notNull(),
    definition: text('definition', { mode: 'json' })
      .$type<WorkoutFeedbackQuestionDefinition>()
      .notNull(),
  },
  (table) => [
    unique('workout_feedback_question_definitions_identity_unique').on(
      table.listRevisionId,
      table.questionId,
    ),
    unique('workout_feedback_question_definitions_order_unique').on(
      table.listRevisionId,
      table.orderIndex,
    ),
    check(
      'workout_feedback_question_definitions_version_check',
      sql`${table.definitionVersion} > 0`,
    ),
    check('workout_feedback_question_definitions_order_check', sql`${table.orderIndex} >= 0`),
    index('workout_feedback_question_definitions_owner_question_idx').on(
      table.userId,
      table.questionId,
      table.definitionVersion,
    ),
  ],
);

export const workoutFeedbackAnswerSets = sqliteTable(
  'workout_feedback_answer_sets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    currentRevision: integer('current_revision').notNull().default(0),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    unique('workout_feedback_answer_sets_session_unique').on(table.userId, table.sessionId),
    check('workout_feedback_answer_sets_revision_check', sql`${table.currentRevision} >= 0`),
  ],
);

export const workoutFeedbackAnswerRevisions = sqliteTable(
  'workout_feedback_answer_revisions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    answerSetId: text('answer_set_id')
      .notNull()
      .references(() => workoutFeedbackAnswerSets.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    responseId: text('response_id').notNull(),
    questionId: text('question_id').notNull(),
    definitionVersion: integer('definition_version').notNull(),
    revision: integer('revision').notNull(),
    priorRevisionId: text('prior_revision_id'),
    state: text('state').notNull(),
    timing: text('timing').notNull(),
    answer: text('answer', { mode: 'json' }).$type<WorkoutFeedbackAnswerRevision>().notNull(),
    answeredAt: text('answered_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    unique('workout_feedback_answer_revisions_number_unique').on(
      table.answerSetId,
      table.questionId,
      table.definitionVersion,
      table.revision,
    ),
    check('workout_feedback_answer_revisions_positive_check', sql`${table.revision} > 0`),
    index('workout_feedback_answer_revisions_owner_session_idx').on(table.userId, table.sessionId),
  ],
);

export const workoutFeedbackAnswerCurrent = sqliteTable(
  'workout_feedback_answer_current',
  {
    answerSetId: text('answer_set_id')
      .notNull()
      .references(() => workoutFeedbackAnswerSets.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    questionId: text('question_id').notNull(),
    definitionVersion: integer('definition_version').notNull(),
    responseRevisionId: text('response_revision_id').notNull(),
    revision: integer('revision').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.answerSetId, table.questionId, table.definitionVersion],
    }),
    unique('workout_feedback_answer_current_response_unique').on(table.responseRevisionId),
    check('workout_feedback_answer_current_revision_check', sql`${table.revision} > 0`),
    index('workout_feedback_answer_current_owner_session_idx').on(table.userId, table.sessionId),
  ],
);
