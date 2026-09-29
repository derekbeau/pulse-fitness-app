import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import { users } from './users.js';
import { workoutSessions } from './workout-sessions.js';

export const activityGoals = sqliteTable(
  'activity_goals',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    label: text('label').notNull(),
    state: text('state').notNull().default('active'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('activity_goals_user_state_idx').on(table.userId, table.state, table.createdAt),
  ],
);

export const canonicalActivities = sqliteTable(
  'canonical_activities',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    structuredWorkoutSessionId: text('structured_workout_session_id').references(
      () => workoutSessions.id,
      { onDelete: 'set null' },
    ),
    sourceJson: text('source_json').notNull(),
    actorJson: text('actor_json').notNull(),
    revision: integer('revision').notNull().default(1),
    currentRevisionId: text('current_revision_id').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('canonical_activities_user_created_idx').on(table.userId, table.createdAt, table.id),
  ],
);

export const activityGoalLinks = sqliteTable(
  'activity_goal_links',
  {
    activityId: text('activity_id')
      .notNull()
      .references(() => canonicalActivities.id, {
        onDelete: 'cascade',
      }),
    goalId: text('goal_id')
      .notNull()
      .references(() => activityGoals.id, {
        onDelete: 'cascade',
      }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.activityId, table.goalId] }),
    index('activity_goal_links_user_goal_idx').on(table.userId, table.goalId, table.activityId),
  ],
);

export const activityRevisions = sqliteTable(
  'activity_revisions',
  {
    id: text('id').primaryKey(),
    activityId: text('activity_id')
      .notNull()
      .references(() => canonicalActivities.id, {
        onDelete: 'cascade',
      }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    priorRevisionId: text('prior_revision_id'),
    changeKind: text('change_kind').notNull(),
    snapshotJson: text('snapshot_json').notNull(),
    correctedFieldsJson: text('corrected_fields_json'),
    reason: text('reason'),
    actorJson: text('actor_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('activity_revisions_activity_revision_unique').on(table.activityId, table.revision),
    index('activity_revisions_user_activity_idx').on(
      table.userId,
      table.activityId,
      table.revision,
    ),
  ],
);

export const activityRecurrences = sqliteTable(
  'activity_recurrences',
  {
    id: text('id').primaryKey(),
    activityId: text('activity_id')
      .notNull()
      .references(() => canonicalActivities.id, {
        onDelete: 'cascade',
      }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    currentRevisionId: text('current_revision_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('activity_recurrences_user_activity_idx').on(
      table.userId,
      table.activityId,
      table.createdAt,
    ),
  ],
);

export const activityRecurrenceRevisions = sqliteTable(
  'activity_recurrence_revisions',
  {
    id: text('id').primaryKey(),
    recurrenceId: text('recurrence_id')
      .notNull()
      .references(() => activityRecurrences.id, {
        onDelete: 'cascade',
      }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    priorRevisionId: text('prior_revision_id'),
    effectiveFromLocalDate: text('effective_from_local_date').notNull(),
    timeZone: text('time_zone').notNull(),
    frequency: text('frequency').notNull(),
    interval: integer('interval').notNull(),
    weekdaysJson: text('weekdays_json').notNull(),
    assignmentPolicy: text('assignment_policy').notNull(),
    actorJson: text('actor_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('activity_recurrence_revisions_recurrence_sequence_unique').on(
      table.recurrenceId,
      table.sequence,
    ),
    index('activity_recurrence_revisions_user_recurrence_idx').on(
      table.userId,
      table.recurrenceId,
      table.sequence,
    ),
  ],
);

export const activityAssignments = sqliteTable(
  'activity_assignments',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activityId: text('activity_id')
      .notNull()
      .references(() => canonicalActivities.id, {
        onDelete: 'cascade',
      }),
    recurrenceId: text('recurrence_id').references(() => activityRecurrences.id, {
      onDelete: 'cascade',
    }),
    plannedLocalDate: text('planned_local_date').notNull(),
    timeZone: text('time_zone').notNull(),
    recurrenceRevisionId: text('recurrence_revision_id').references(
      () => activityRecurrenceRevisions.id,
      { onDelete: 'restrict' },
    ),
    revision: integer('revision').notNull().default(1),
    currentRevisionId: text('current_revision_id').notNull(),
    state: text('state').notNull().default('planned'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('activity_assignments_user_date_idx').on(table.userId, table.plannedLocalDate, table.id),
    index('activity_assignments_user_activity_idx').on(
      table.userId,
      table.activityId,
      table.plannedLocalDate,
    ),
  ],
);

export const activityAssignmentRevisions = sqliteTable(
  'activity_assignment_revisions',
  {
    id: text('id').primaryKey(),
    assignmentId: text('assignment_id')
      .notNull()
      .references(() => activityAssignments.id, {
        onDelete: 'cascade',
      }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    priorRevisionId: text('prior_revision_id'),
    plannedLocalDate: text('planned_local_date').notNull(),
    timeZone: text('time_zone').notNull(),
    recurrenceRevisionId: text('recurrence_revision_id'),
    state: text('state').notNull(),
    reason: text('reason'),
    actorJson: text('actor_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('activity_assignment_revisions_assignment_revision_unique').on(
      table.assignmentId,
      table.revision,
    ),
    index('activity_assignment_revisions_user_assignment_idx').on(
      table.userId,
      table.assignmentId,
      table.revision,
    ),
  ],
);

export const activityExecutions = sqliteTable(
  'activity_executions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activityId: text('activity_id')
      .notNull()
      .references(() => canonicalActivities.id, {
        onDelete: 'cascade',
      }),
    assignmentId: text('assignment_id').references(() => activityAssignments.id, {
      onDelete: 'restrict',
    }),
    actualOccurredAt: text('actual_occurred_at').notNull(),
    actualLocalDate: text('actual_local_date').notNull(),
    timeZone: text('time_zone').notNull(),
    durationMinutes: integer('duration_minutes'),
    outcome: text('outcome').notNull(),
    structuredWorkoutSessionId: text('structured_workout_session_id').references(
      () => workoutSessions.id,
      { onDelete: 'set null' },
    ),
    sourceJson: text('source_json').notNull(),
    revision: integer('revision').notNull().default(1),
    currentRevisionId: text('current_revision_id').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('activity_executions_user_date_idx').on(table.userId, table.actualLocalDate, table.id),
    index('activity_executions_user_activity_idx').on(
      table.userId,
      table.activityId,
      table.actualOccurredAt,
    ),
  ],
);

export const activityExecutionRevisions = sqliteTable(
  'activity_execution_revisions',
  {
    id: text('id').primaryKey(),
    executionId: text('execution_id')
      .notNull()
      .references(() => activityExecutions.id, {
        onDelete: 'cascade',
      }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    priorRevisionId: text('prior_revision_id'),
    snapshotJson: text('snapshot_json').notNull(),
    correctedFieldsJson: text('corrected_fields_json'),
    reason: text('reason'),
    actorJson: text('actor_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('activity_execution_revisions_execution_revision_unique').on(
      table.executionId,
      table.revision,
    ),
    index('activity_execution_revisions_user_execution_idx').on(
      table.userId,
      table.executionId,
      table.revision,
    ),
  ],
);

export const activityOwnedLinks = sqliteTable(
  'activity_owned_links',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activityId: text('activity_id')
      .notNull()
      .references(() => canonicalActivities.id, {
        onDelete: 'cascade',
      }),
    targetKind: text('target_kind').notNull(),
    targetId: text('target_id').notNull(),
    targetRevisionId: text('target_revision_id'),
    relation: text('relation').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('activity_owned_links_activity_target_relation_unique').on(
      table.activityId,
      table.targetKind,
      table.targetId,
      table.relation,
    ),
    index('activity_owned_links_user_target_idx').on(
      table.userId,
      table.targetKind,
      table.targetId,
    ),
  ],
);

export const activityIdempotencyReceipts = sqliteTable(
  'activity_idempotency_receipts',
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
    responseJson: text('response_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('activity_idempotency_receipts_scope_key_unique').on(
      table.userId,
      table.route,
      table.operation,
      table.idempotencyKey,
    ),
    index('activity_idempotency_receipts_user_created_idx').on(table.userId, table.createdAt),
  ],
);
