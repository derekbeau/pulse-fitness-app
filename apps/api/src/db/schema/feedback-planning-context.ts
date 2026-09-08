import { randomUUID } from 'node:crypto';

import type {
  ApplyFeedbackPrecautionDecisionInput,
  FeedbackPlanningDependency,
} from '@pulse/shared';
import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

import { users } from './users.js';
import { workoutFeedbackAnswerRevisions } from './workout-feedback.js';
import { workoutSessions } from './workout-sessions.js';

export const workoutFeedbackPlanningDecisions = sqliteTable(
  'workout_feedback_planning_decisions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    concernRef: text('concern_ref').notNull(),
    sequence: integer('sequence').notNull(),
    priorDecisionId: text('prior_decision_id').references(
      (): AnySQLiteColumn => workoutFeedbackPlanningDecisions.id,
      { onDelete: 'cascade' },
    ),
    sourceSessionId: text('source_session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    sourceExerciseId: text('source_exercise_id').notNull(),
    sourceSection: text('source_section').notNull(),
    sourceText: text('source_text').notNull(),
    sourceTextHash: text('source_text_hash').notNull(),
    sourceTimestamp: integer('source_timestamp').notNull(),
    sourceClassification: text('source_classification')
      .$type<'programming_precaution' | 'clinician_authored_guidance'>()
      .notNull(),
    disposition: text('disposition').$type<'retain' | 'revise' | 'retire'>().notNull(),
    interpretation: text('interpretation').notNull(),
    reason: text('reason').notNull(),
    actorType: text('actor_type').$type<'agent_token'>().notNull(),
    actorId: text('actor_id').notNull(),
    actorLabel: text('actor_label').notNull(),
    dependencies: text('dependencies', { mode: 'json' })
      .$type<FeedbackPlanningDependency[]>()
      .notNull(),
    dependencyFingerprint: text('dependency_fingerprint').notNull(),
    input: text('input', { mode: 'json' }).$type<ApplyFeedbackPrecautionDecisionInput>().notNull(),
    targetMutations: text('target_mutations', { mode: 'json' })
      .$type<
        Array<{
          scheduledWorkoutId: string;
          scheduledWorkoutExerciseId: string;
          before: string | null;
          after: string | null;
        }>
      >()
      .notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    unique('workout_feedback_planning_decisions_concern_sequence_unique').on(
      table.userId,
      table.concernRef,
      table.sequence,
    ),
    unique('workout_feedback_planning_decisions_idempotency_unique').on(
      table.userId,
      table.idempotencyKey,
    ),
    index('workout_feedback_planning_decisions_owner_created_idx').on(
      table.userId,
      table.createdAt,
    ),
    check('workout_feedback_planning_decisions_sequence_check', sql`${table.sequence} > 0`),
    check(
      'workout_feedback_planning_decisions_disposition_check',
      sql`${table.disposition} in ('retain','revise','retire')`,
    ),
    check(
      'workout_feedback_planning_decisions_source_class_check',
      sql`${table.sourceClassification} in ('programming_precaution','clinician_authored_guidance')`,
    ),
    check(
      'workout_feedback_planning_decisions_hash_check',
      sql`length(${table.sourceTextHash}) = 64 and ${table.sourceTextHash} not glob '*[^0-9a-f]*' and length(${table.dependencyFingerprint}) = 64 and ${table.dependencyFingerprint} not glob '*[^0-9a-f]*' and length(${table.requestFingerprint}) = 64 and ${table.requestFingerprint} not glob '*[^0-9a-f]*'`,
    ),
    check(
      'workout_feedback_planning_decisions_json_check',
      sql`json_valid(${table.dependencies}) and json_type(${table.dependencies}) = 'array' and json_valid(${table.input}) and json_type(${table.input}) = 'object' and json_valid(${table.targetMutations}) and json_type(${table.targetMutations}) = 'array'`,
    ),
  ],
);

export const workoutFeedbackPlanningDecisionResponses = sqliteTable(
  'workout_feedback_planning_decision_responses',
  {
    decisionId: text('decision_id')
      .notNull()
      .references(() => workoutFeedbackPlanningDecisions.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    responseRevisionId: text('response_revision_id')
      .notNull()
      .references(() => workoutFeedbackAnswerRevisions.id, { onDelete: 'cascade' }),
  },
  (table) => [
    unique('workout_feedback_planning_decision_responses_unique').on(
      table.decisionId,
      table.responseRevisionId,
    ),
    index('workout_feedback_planning_decision_responses_owner_idx').on(table.userId),
  ],
);
