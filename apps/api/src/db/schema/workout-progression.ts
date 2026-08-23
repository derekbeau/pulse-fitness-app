import { randomUUID } from 'node:crypto';

import type {
  ApplyWorkoutProgressionActionInput,
  WorkoutProgressionRecommendation,
} from '@pulse/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import { exercises } from './exercises.js';
import { scheduledWorkoutExercises } from './scheduled-workout-exercises.js';
import { scheduledWorkouts } from './scheduled-workouts.js';
import { users } from './users.js';
import { workoutSessions } from './workout-sessions.js';

export const workoutProgressionAccountDeletionScope = sqliteTable(
  'workout_progression_account_deletion_scope',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
);

export const workoutProgressionRecommendations = sqliteTable(
  'workout_progression_recommendations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scheduledWorkoutId: text('scheduled_workout_id')
      .notNull()
      .references(() => scheduledWorkouts.id, { onDelete: 'cascade' }),
    scheduledWorkoutExerciseId: text('scheduled_workout_exercise_id')
      .notNull()
      .references(() => scheduledWorkoutExercises.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    sourceSessionId: text('source_session_id').references(() => workoutSessions.id, {
      onDelete: 'restrict',
    }),
    policyFamily: text('policy_family')
      .$type<
        | 'double_progression'
        | 'strength_load'
        | 'rpe_regulated'
        | 'time_distance'
        | 'rehab_capacity'
      >()
      .notNull(),
    policyVersion: integer('policy_version').notNull(),
    sourceFingerprint: text('source_fingerprint').notNull(),
    effectiveDate: text('effective_date').notNull(),
    snapshot: text('snapshot', { mode: 'json' })
      .$type<WorkoutProgressionRecommendation>()
      .notNull(),
    generatedAt: integer('generated_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('workout_progression_recommendations_user_generated_idx').on(
      table.userId,
      table.generatedAt,
    ),
    index('workout_progression_recommendations_schedule_idx').on(table.scheduledWorkoutId),
    uniqueIndex('workout_progression_recommendations_generation_unique').on(
      table.scheduledWorkoutExerciseId,
      table.sourceFingerprint,
      table.policyVersion,
    ),
    uniqueIndex('workout_progression_recommendations_id_user_unique').on(table.id, table.userId),
    foreignKey({
      columns: [table.scheduledWorkoutExerciseId, table.scheduledWorkoutId],
      foreignColumns: [scheduledWorkoutExercises.id, scheduledWorkoutExercises.scheduledWorkoutId],
      name: 'workout_progression_recommendations_scheduled_exercise_fk',
    }).onDelete('cascade'),
    check(
      'workout_progression_recommendations_policy_family_check',
      sql`${table.policyFamily} in ('double_progression', 'strength_load', 'rpe_regulated', 'time_distance', 'rehab_capacity')`,
    ),
    check(
      'workout_progression_recommendations_policy_version_check',
      sql`${table.policyVersion} = 1`,
    ),
    check(
      'workout_progression_recommendations_fingerprint_check',
      sql`length(${table.sourceFingerprint}) = 64 and ${table.sourceFingerprint} not glob '*[^0-9a-f]*'`,
    ),
    check(
      'workout_progression_recommendations_effective_date_check',
      sql`${table.effectiveDate} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
    check(
      'workout_progression_recommendations_snapshot_check',
      sql`json_valid(${table.snapshot}) and json_type(${table.snapshot}) = 'object'`,
    ),
    check('workout_progression_recommendations_generated_at_check', sql`${table.generatedAt} > 0`),
  ],
);

export const workoutProgressionActions = sqliteTable(
  'workout_progression_actions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    recommendationId: text('recommendation_id')
      .notNull()
      .references(() => workoutProgressionRecommendations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    type: text('type').$type<'accept' | 'edit' | 'keep' | 'hold'>().notNull(),
    payload: text('payload', { mode: 'json' })
      .$type<ApplyWorkoutProgressionActionInput>()
      .notNull(),
    actorType: text('actor_type').$type<'user' | 'agent_token'>().notNull(),
    // Immutable audit provenance must survive token revocation. This intentionally stores the
    // server-stamped token identifier without a live foreign key to the revocable credential row.
    agentTokenId: text('agent_token_id'),
    actorLabel: text('actor_label').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('workout_progression_actions_user_created_idx').on(table.userId, table.createdAt),
    uniqueIndex('workout_progression_actions_recommendation_sequence_unique').on(
      table.recommendationId,
      table.sequence,
    ),
    uniqueIndex('workout_progression_actions_user_idempotency_unique').on(
      table.userId,
      table.idempotencyKey,
    ),
    foreignKey({
      columns: [table.recommendationId, table.userId],
      foreignColumns: [
        workoutProgressionRecommendations.id,
        workoutProgressionRecommendations.userId,
      ],
      name: 'workout_progression_actions_recommendation_user_fk',
    }).onDelete('cascade'),
    check('workout_progression_actions_sequence_check', sql`${table.sequence} >= 1`),
    check(
      'workout_progression_actions_type_check',
      sql`${table.type} in ('accept', 'edit', 'keep', 'hold')`,
    ),
    check(
      'workout_progression_actions_payload_check',
      sql`json_valid(${table.payload}) and json_type(${table.payload}) = 'object'`,
    ),
    check(
      'workout_progression_actions_actor_check',
      sql`(${table.actorType} = 'user' and ${table.agentTokenId} is null) or (${table.actorType} = 'agent_token' and ${table.agentTokenId} is not null)`,
    ),
    check(
      'workout_progression_actions_request_fingerprint_check',
      sql`length(${table.requestFingerprint}) = 64 and ${table.requestFingerprint} not glob '*[^0-9a-f]*'`,
    ),
    check('workout_progression_actions_created_at_check', sql`${table.createdAt} > 0`),
  ],
);

export const exerciseMuscleContributions = sqliteTable(
  'exercise_muscle_contributions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    ownerUserId: text('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    muscle: text('muscle').notNull(),
    role: text('role').$type<'primary' | 'secondary'>().notNull(),
    factor: real('factor').notNull(),
    version: integer('version').notNull(),
    effectiveAt: integer('effective_at', { mode: 'number' }).notNull(),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('exercise_muscle_contributions_exercise_effective_idx').on(
      table.exerciseId,
      table.effectiveAt,
      table.revision,
    ),
    index('exercise_muscle_contributions_owner_idx').on(table.ownerUserId),
    check('exercise_muscle_contributions_revision_check', sql`${table.revision} >= 1`),
    check(
      'exercise_muscle_contributions_muscle_check',
      sql`length(trim(${table.muscle})) between 1 and 100`,
    ),
    check(
      'exercise_muscle_contributions_role_factor_check',
      sql`(${table.role} = 'primary' and ${table.factor} = 1.0) or (${table.role} = 'secondary' and ${table.factor} = 0.5)`,
    ),
    check('exercise_muscle_contributions_version_check', sql`${table.version} = 1`),
    check(
      'exercise_muscle_contributions_timestamps_check',
      sql`${table.effectiveAt} > 0 and ${table.createdAt} >= ${table.effectiveAt}`,
    ),
  ],
);
