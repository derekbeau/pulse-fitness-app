# Data Model Conventions

Pulse stores application data in SQLite through Drizzle ORM. This document is the backend reference for table shape, storage conventions, relationship patterns, and when to normalize data into dedicated tables.

## Storage Conventions

- Primary keys: all primary keys are UUIDs stored as `text`.
- User scoping: every user-owned root table stores `userId`, and child tables inherit scope through foreign keys. `entity_links` also stores `userId`, but reads should still usually scope through the owning source entity.
- Dates: calendar dates are stored as `text` in `YYYY-MM-DD` format and protected with SQLite `CHECK` constraints.
- Time-of-day fields: meal times are stored as nullable `text` in `HH:MM` 24-hour format.
- Timestamps: audit and event timestamps are stored as `integer` Unix milliseconds.
- Booleans: SQLite booleans are stored as `integer` `0`/`1`, usually through Drizzle `integer(..., { mode: 'boolean' })`.
- Numeric measurements: weights, macros, and habit values use `real` or `integer` depending on whether fractional values are needed.
- JSON-backed fields: prefer `text('col', { mode: 'json' }).$type<T>()` when the value should serialize and deserialize automatically. If a field stays as plain `text().$type<T>()`, pair it with explicit parse/serialize helpers.
- Soft delete: user-facing entities use nullable `deletedAt` (`text` ISO timestamp). API reads must exclude rows where `deletedAt` is not `null`; restore clears `deletedAt`, and purge performs hard delete. `habits.active` remains for habit visibility state, but deletion semantics are tracked by `deletedAt`.
- SQLite bootstrap: enable `journal_mode = WAL`, `busy_timeout = 5000`, `synchronous = NORMAL`, and `foreign_keys = ON`.

## User Scope Rules

Direct `userId` ownership lives on these root tables:

- `users`
- `agent_tokens`
- `habits`
- `habit_entries`
- `exercises` (`null` means shared library row, not another user)
- `workout_templates`
- `workout_sessions`
- `foods`
- `nutrition_logs`
- `body_weight`
- `nutrition_targets`
- `nutrition_target_events`
- `adaptive_nutrition_programs`
- `adaptive_nutrition_checkins`
- `adaptive_nutrition_goals`
- `adaptive_nutrition_goal_revisions`
- `adaptive_nutrition_goal_completions`
- `dashboard_config`
- `scheduled_workouts`
- `health_conditions`
- `journal_entries`
- `activities`
- `resources`
- `equipment_locations`
- `entity_links`

Inherited ownership comes from foreign-key chains:

- `template_exercises` through `workout_templates`
- `scheduled_workout_exercises` through `scheduled_workouts`
- `scheduled_workout_exercise_sets` through `scheduled_workout_exercises`
- `session_sets` through `workout_sessions`
- `meals` through `nutrition_logs`
- `meal_items` through `meals`
- `condition_timeline_events` through `health_conditions`
- `condition_protocols` through `health_conditions`
- `condition_severity_points` through `health_conditions`
- `equipment_items` through `equipment_locations`

`entity_links` stores `userId` for direct isolation and cleanup queries. Every read and write must still scope through the owning source entity so links cannot cross user boundaries.

## Table Inventory

### Auth And Identity

#### `users`

- `id`: `text` primary key UUID
- `username`: `text`, required, unique
- `name`: nullable `text`
- `passwordHash`: `text`, required
- `weightUnit`: `text`, required, one of `lbs | kg`; controls response-boundary display
  conversion and never determines stored body-weight history
- `preferences`: nullable JSON text blob for user-level UI, theme, and agent settings
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

#### `agent_tokens`

- `id`: `text` primary key UUID
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`
- `name`: `text`, required
- `tokenHash`: `text`, required, unique, SHA-256 hash of the plain token
- `lastUsedAt`: nullable `integer` Unix ms
- `createdAt`: `integer` Unix ms, required, default now

### Habits

#### `habits`

- `id`: `text` primary key UUID
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`, indexed
- `name`: `text`, required
- `emoji`: nullable `text`
- `trackingType`: `text`, required, one of `boolean | numeric | time`
- `target`: nullable `real`
- `unit`: nullable `text`
- `frequency`: `text`, required, one of `daily | weekly | specific_days`
- `frequencyTarget`: nullable `integer`
- `scheduledDays`: nullable JSON text array of weekday integers `0..6`
- `referenceSource`: nullable `text`, one of `weight | nutrition_daily | nutrition_meal | workout`
- `referenceConfig`: nullable JSON text object (source-specific resolver config)
- `pausedUntil`: nullable `text` calendar date (`YYYY-MM-DD`)
- `sortOrder`: `integer`, required, default `0`
- `active`: boolean-backed `integer`, required, default `true`
- `deletedAt`: nullable `text` ISO timestamp for soft delete
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Constraints:

- `habits_tracking_type_check`

#### `habit_entries`

- `id`: `text` primary key UUID
- `habitId`: `text`, required, FK -> `habits.id`, `ON DELETE CASCADE`
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`, indexed
- `date`: `text`, required, `YYYY-MM-DD`, indexed
- `completed`: boolean-backed `integer`, required, default `false`
- `value`: nullable `real`
- `isOverride`: boolean-backed `integer`, required, default `false`
- `createdAt`: `integer` Unix ms, required, default now

Constraints:

- unique on `(habitId, date)`
- `habit_entries_date_format_check`

### Workouts

#### `exercises`

- `id`: `text` primary key UUID
- `userId`: nullable `text`, FK -> `users.id`, `ON DELETE CASCADE`, indexed
- `name`: `text`, required
- `muscleGroups`: JSON text array of muscle-group keys
- `equipment`: `text`, required
- `category`: `text`, required, one of `compound | isolation | cardio | cardio_flow | mobility`
- `trackingType`: `text`, required, one of `weight_reps | weight_seconds | bodyweight_reps | reps_only | reps_seconds | seconds_only | duration | distance | cardio`
- `tags`: JSON text array for exercise classification labels, default `[]`
- `formCues`: JSON text array for durable technique guidance, default `[]`
- `instructions`: nullable `text`
- `deletedAt`: nullable `text` ISO timestamp for soft delete (applies to user-owned rows)
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Constraints:

- `exercises_category_check`
- `exercises_tracking_type_check`

#### `workout_templates`

- `id`: `text` primary key UUID
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`, indexed
- `name`: `text`, required
- `description`: nullable `text`
- `tags`: JSON text array for template labels
- `deletedAt`: nullable `text` ISO timestamp for soft delete
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

#### `template_exercises`

- `id`: `text` primary key UUID
- `templateId`: `text`, required, FK -> `workout_templates.id`, `ON DELETE CASCADE`, indexed
- `exerciseId`: `text`, required, FK -> `exercises.id`, `ON DELETE RESTRICT`, indexed
- `orderIndex`: `integer`, required
- `sets`: nullable `integer`
- `repsMin`: nullable `integer`
- `repsMax`: nullable `integer`
- `tempo`: nullable `text`
- `restSeconds`: nullable `integer`
- `supersetGroup`: nullable `text`
- `section`: `text`, required, one of `warmup | main | cooldown`
- `notes`: nullable `text`
- `cues`: nullable JSON text array of form cues

Constraints:

- unique on `(templateId, section, orderIndex)`
- `template_exercises_section_check`
- `template_exercises_reps_range_check`

#### `workout_sessions`

- `id`: `text` primary key UUID
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`, indexed
- `templateId`: nullable `text`, FK -> `workout_templates.id`, `ON DELETE SET NULL`
- `scheduledWorkoutId`: nullable `text`, FK -> `scheduled_workouts.id`, `ON DELETE SET NULL`, indexed
- `name`: `text`, required
- `date`: `text`, required, `YYYY-MM-DD`, indexed
- `status`: `text`, required, default `in-progress`, one of `scheduled | in-progress | paused | cancelled | completed`
- `startedAt`: `integer` Unix ms, required
- `completedAt`: nullable `integer` Unix ms
- `duration`: nullable `integer` minutes
- `timeSegments`: required JSON text array of `{ start: string, end: string | null, section: 'warmup' | 'main' | 'cooldown' | 'supplemental' }`, default `'[]'`
- `feedback`: nullable JSON text object for post-session ratings and notes
- `exerciseProgrammingNotes`: nullable JSON text record keyed by `${section}::${exerciseId}` with `string | null` values; snapshots `template_exercises.notes` at session start
- `exerciseAgentNotes`: nullable JSON text record keyed by `${section}::${exerciseId}` with `string | null` values; snapshots scheduled-workout agent notes at session start
- `exerciseAgentNotesMeta`: nullable JSON text record keyed by `${section}::${exerciseId}` with metadata values `{ author, generatedAt, scheduledDateAtGeneration, stale }` (read-time compatibility defaults missing `stale` to `false`)
- Session exercise payload field `agentNotes`: projected from `exerciseAgentNotes[${section}::${exerciseId}]`
- Session exercise payload field `agentNotesMeta`: projected from `exerciseAgentNotesMeta[${section}::${exerciseId}]`
- There are no physical `workout_sessions.agentNotes` / `workout_sessions.agentNotesMeta` scalar columns; those session exercise fields are projections from the keyed JSON snapshot maps above.
- `notes`: nullable `text`
- `deletedAt`: nullable `text` ISO timestamp for soft delete
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Constraints:

- `workout_sessions_date_format_check`
- `workout_sessions_status_check`
- `workout_sessions_completed_at_check`

Notes:

- `timeSegments` is stored as JSON text, so schema evolution from legacy `{ start, end }` segments to section-tagged segments is handled in the store/parser layer with read-time backfill (`section: 'main'`) rather than a SQL migration.
- `exerciseProgrammingNotes` is forward-apply snapshot data: newly created template-backed sessions persist a copy of template exercise notes, while historical sessions keep `null` until explicitly recreated.

#### `session_sets`

- `id`: `text` primary key UUID
- `sessionId`: `text`, required, FK -> `workout_sessions.id`, `ON DELETE CASCADE`, indexed
- `exerciseId`: `text`, required, FK -> `exercises.id`, `ON DELETE RESTRICT`
- `setNumber`: `integer`, required
- `weight`: nullable `real`
- `reps`: nullable `integer`
- `rpe`: nullable `integer`, 1-10 effort rating
- `zone`: nullable `integer`, 1-5 cardio/effort zone
- `targetWeight`: nullable `real`
- `targetWeightMin`: nullable `real`
- `targetWeightMax`: nullable `real`
- `targetSeconds`: nullable `integer`
- `targetDistance`: nullable `real`
- `completed`: boolean-backed `integer`, required, default `false`
- `skipped`: boolean-backed `integer`, required, default `false`
- `section`: nullable `text`, one of `warmup | main | cooldown`
- `notes`: nullable `text`
- `createdAt`: `integer` Unix ms, required, default now

Constraints:

- unique on `(sessionId, exerciseId, setNumber)`
- `session_sets_set_number_check`
- `session_sets_section_check`
- `session_sets_completion_state_check`

#### `scheduled_workouts`

- `id`: `text` primary key UUID
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`
- `templateId`: nullable `text`, FK -> `workout_templates.id`, `ON DELETE SET NULL`, indexed
- `templateVersion`: nullable `text` SHA-256 hex hash of a canonical JSON snapshot of template exercises + set prescriptions + notes at schedule time; used for template drift detection
- `date`: `text`, required, `YYYY-MM-DD`
- `sessionId`: nullable `text`, FK -> `workout_sessions.id`, `ON DELETE SET NULL`, indexed
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Behavior:

- When a workout session is started from a template on the current date, the first matching `scheduled_workouts` row with `sessionId = null` is linked by setting `sessionId` to the created session id.
- Scheduled workouts can carry a relational exercise snapshot. Backfill is run immediately after schema migration so reads do not need a lazy dual-path fallback.

Indexes and constraints:

- `scheduled_workouts_user_date_idx`
- `scheduled_workouts_template_id_idx`
- `scheduled_workouts_session_id_idx`
- `scheduled_workouts_date_format_check`

#### `scheduled_workout_exercises`

- `id`: `text` primary key UUID
- `scheduledWorkoutId`: `text`, required, FK -> `scheduled_workouts.id`, `ON DELETE CASCADE`, indexed
- `exerciseId`: `text`, required, FK -> `exercises.id`, `ON DELETE RESTRICT`, indexed
- `section`: `text`, required, one of `warmup | main | cooldown | supplemental`
- `orderIndex`: `integer`, required
- `programmingNotes`: nullable `text` copied from template exercise programming notes at snapshot time
- `agentNotes`: nullable `text` used for per-instance agent enrichment
- `agentNotesMeta`: nullable JSON text object `{ author, generatedAt, scheduledDateAtGeneration, stale }` (`stale` defaults to `false` on server writes)
- `templateCues`: nullable JSON text array copied from template cues
- `supersetGroup`: nullable `text`
- `tempo`: nullable `text`
- `restSeconds`: nullable `integer`
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Constraints and indexes:

- `scheduled_workout_exercises_scheduled_workout_id_idx`
- `scheduled_workout_exercises_exercise_id_idx`
- `scheduled_workout_exercises_section_check`

#### `scheduled_workout_exercise_sets`

- `id`: `text` primary key UUID
- `scheduledWorkoutExerciseId`: `text`, required, FK -> `scheduled_workout_exercises.id`, `ON DELETE CASCADE`, indexed
- `setNumber`: `integer`, required
- `repsMin`: nullable `integer`
- `repsMax`: nullable `integer`
- `reps`: nullable `integer` for exact-rep prescriptions
- `targetWeight`: nullable `real`
- `targetWeightMin`: nullable `real`
- `targetWeightMax`: nullable `real`
- `targetSeconds`: nullable `integer`
- `targetDistance`: nullable `real`
- `createdAt`: `integer` Unix ms, required, default now

Constraints:

- `scheduled_workout_exercise_sets_set_number_check`
- `scheduled_workout_exercise_sets_reps_range_check`
- `scheduled_workout_exercise_sets_target_weight_range_check`

### Nutrition And Body Metrics

#### `foods`

- `id`: `text` primary key UUID
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`
- `name`: `text`, required
- `brand`: nullable `text`
- `servingSize`: nullable `text`
- `servingGrams`: nullable `real`
- `calories`: `real`, required
- `protein`: `real`, required
- `carbs`: `real`, required
- `fat`: `real`, required
- `fiber`: nullable `real`
- `sugar`: nullable `real`
- `verified`: boolean-backed `integer`, required, default `false`
- `source`: nullable `text`
- `notes`: nullable `text`
- `lastUsedAt`: nullable `integer` Unix ms
- `deletedAt`: nullable `text` ISO timestamp for soft delete
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Indexes and constraints:

- `foods_user_last_used_at_idx`
- `foods_serving_grams_check`
- `foods_macros_nonnegative_check`
- `foods_fiber_nonnegative_check`
- `foods_sugar_nonnegative_check`

#### `nutrition_logs`

- `id`: `text` primary key UUID
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`
- `date`: `text`, required, `YYYY-MM-DD`
- `notes`: nullable `text`
- `status`: `text`, required, one of `unknown | partial | complete`, default `unknown`
- `statusUpdatedAt`: nullable `integer` Unix ms; set on explicit changes and automatic downgrades
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Constraints:

- unique on `(userId, date)`
- `nutrition_logs_date_format_check`
- `nutrition_logs_status_check`

Existing rows migrate to `unknown`; completeness is never inferred from calories or target
attainment. Successful meal/item creates, edits, appends, deletes, static re-imports, food merges,
and purges downgrade a `complete` log to `partial` in the same transaction. Failed or rolled-back
mutations leave status unchanged.

#### `meals`

- `id`: `text` primary key UUID
- `nutritionLogId`: `text`, required, FK -> `nutrition_logs.id`, `ON DELETE CASCADE`, indexed
- `name`: `text`, required
- `time`: nullable `text` in `HH:MM`
- `notes`: nullable `text`
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Constraints:

- `meals_time_format_check`

#### `meal_items`

- `id`: `text` primary key UUID
- `mealId`: `text`, required, FK -> `meals.id`, `ON DELETE CASCADE`, indexed
- `foodId`: nullable `text`, FK -> `foods.id`, `ON DELETE SET NULL`, indexed
- `name`: `text`, required
- `amount`: `real`, required
- `unit`: `text`, required
- `calories`: `real`, required
- `protein`: `real`, required
- `carbs`: `real`, required
- `fat`: `real`, required
- `fiber`: nullable `real`
- `sugar`: nullable `real`
- `createdAt`: `integer` Unix ms, required, default now

Constraints:

- `meal_items_amount_check`
- `meal_items_macros_nonnegative_check`
- `meal_items_fiber_nonnegative_check`
- `meal_items_sugar_nonnegative_check`

#### `body_weight`

- `id`: `text` primary key UUID
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`
- `date`: `text`, required, `YYYY-MM-DD`
- `weightKg`: `real`, required; canonical kilograms used by every application reader
- `unitAtEntry`: `text`, required, one of `lbs | kg`; provenance for the unit used by
  the write that established the stored measurement
- `weight`: `real`, required; compatibility-only pounds derived exactly as
  `weightKg / 0.45359237`, never read by application code
- `notes`: nullable `text`
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Constraints:

- unique on `(userId, date)`
- `body_weight_date_format_check`
- `body_weight_weight_check`
- `body_weight_weight_kg_check`
- `body_weight_unit_at_entry_check`
- `body_weight_legacy_pounds_check`

Legacy databases require a reviewed, exact per-user historical-unit map before the canonical
columns are backfilled. Current user preferences are not migration evidence. Startup fails closed
for missing, partial, extra-user, or ambiguous maps; fresh and already-canonical databases do not
require a map.

#### `nutrition_targets`

- `id`: `text` primary key UUID
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`
- `calories`: `real`, required
- `protein`: `real`, required
- `carbs`: `real`, required
- `fat`: `real`, required
- `source`: `text`, required, one of `manual | adaptive`, default `manual`
- `adaptiveCheckInId`: nullable `text`, FK -> `adaptive_nutrition_checkins.id`, `ON DELETE RESTRICT`;
  required only for adaptive targets
- `macroCalories`: nullable `real`; persisted `protein * 4 + carbs * 4 + fat * 9`
- `effectiveDate`: `text`, required, `YYYY-MM-DD`
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Constraints:

- unique on `(userId, effectiveDate)`
- `nutrition_targets_effective_date_format_check`
- `nutrition_targets_macros_nonnegative_check`
- `nutrition_targets_source_check`
- `nutrition_targets_provenance_check`
- `nutrition_targets_macro_calories_nonnegative_check`

Manual writes always clear adaptive linkage and calculate macro calories server-side. Adaptive target
writes exist only inside the canonical check-in acceptance transaction; there is no independent
target-only Adaptive persistence entry point. Replacement updates the existing same-date row only
after the owned check-in snapshot is verified to preserve the row being replaced, appends the exact
final accepted event, and then resolves the check-in atomically. Replaying an accepted check-in reads
that check-in's immutable event rather than the later mutable row.

#### `nutrition_target_events`

Append-only target facts preserve history while `nutrition_targets` remains the materialized current
row for a user and effective date.

- `id`: `text` primary key UUID
- `targetId`, `userId`: required composite FK -> `nutrition_targets.(id, userId)`, `ON DELETE RESTRICT`
- `sequence`: required contiguous integer per target
- `effectiveDate`: required `YYYY-MM-DD`
- `calories`, `protein`, `carbs`, `fat`, `macroCalories`: required exact accepted/manual values
- `source`: `manual | adaptive`
- `adaptiveCheckInId`, `userId`: nullable/required composite ownership FK to the accepted check-in;
  required only for Adaptive events
- `eventType`: `manual_write | adaptive_accept | migration_backfill`
- `recordedAt`, `createdAt`: required Unix ms causal/audit timestamps

Unique indexes enforce `(targetId, sequence)` and one event per accepted check-in. Database triggers
require the exact next sequence and nondecreasing recorded time, reject updates, and permit deletion
only inside the existing account-deletion scope. Equal timestamps use sequence as the causal tie.
Migration requires each target's recoverable event chain to start at its original `createdAt` and end
with an exact materialized-row match at `updatedAt`. Complete owned check-in snapshots may recover
manual or Adaptive predecessor states. Before candidate filtering, migration inventories every
accepted check-in with a non-null predecessor snapshot, every accepted proposal, and every accepted
review action with a final applied proposal. Each claim must validate its complete shape, same-user
identity, values, 4/4/9 macro arithmetic, effective date, causal timestamps, and provenance, then map
to an exact event candidate. Exact duplicate claims may intentionally collapse to one event; distinct
same-time states remain in deterministic order. A malformed non-null claim, a mutated manual row
without an exact initial snapshot, an unmapped accepted proposal/action, or any chain with an
unrecoverable interval aborts and rolls back the entire migration instead of inventing or omitting
history. A keep decision is intentionally outside this inventory because it does not create an
accepted target.

Predecessor evidence is bounded by the immutable check-in that captured it: the snapshot target must
have been created no later than its update, and its `updatedAt` must be no later than the claiming
check-in's `createdAt`. Equality is intentionally allowed because target writes and preview creation
can share a millisecond; only real immutable event/check-in IDs and event sequence resolve equal-time
facts. The later claiming-check-in `resolvedAt` is never substituted for capture time. Adaptive
predecessors additionally require their source acceptance to resolve at the snapshot `updatedAt` and
no later than the claimant's creation. Claiming and accepted check-ins must be created after their
owned program and applicable goal, accepted resolution cannot precede check-in creation, a review
cannot predate its check-in, and an accept action cannot predate its review or differ from the accepted
resolution instant. A proposal has no independent clock: its existence at check-in creation is proven
by the immutable `proposedTargets` snapshot, while an edited proposal is proven by the ordered review
action captured at acceptance.

#### `adaptive_nutrition_programs`

One lifetime row per user holds adaptive-coaching configuration and stable baseline values. Ordinary
updates preserve calculated baseline fields; only explicit `rebaseline: true` recalculates them.
Creating or rebaselining requires a setup-entered weight or canonical saved weight no more than seven
program-local calendar days old. A calculation-affecting update explicitly supersedes a pending
check-in.

- `id`: `text` primary key UUID
- `userId`: `text`, required, unique, FK -> `users.id`, `ON DELETE CASCADE`
- configuration and baseline columns from the Adaptive TDEE v1 specification
- `algorithmVersion`: required `text`
- `createdAt` / `updatedAt`: `integer` Unix ms

#### `adaptive_nutrition_checkins`

Immutable calculation/audit rows are the restricted provenance source for adaptive targets and now
back the operational preview, acceptance, decline, history, and detail lifecycle.

- `id`: `text` primary key UUID
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`, indexed with `createdAt`
- `programId`: `text`, required, FK -> `adaptive_nutrition_programs.id`, `ON DELETE CASCADE`; a
  composite `(programId, userId)` foreign key also requires the program and check-in owners to match
- kind/status/state/date, boundary, version, and fingerprint columns from the specification
- `inputSnapshot`, `calculationSnapshot`, `reasonCodes`, `currentTargets`, and `proposedTargets`:
  JSON audit snapshots
- `acceptedNutritionTargetId`: nullable text without a reverse FK, avoiding a circular relationship
- `resolvedAt`: nullable `integer` Unix ms

A database trigger forbids changes to calculation inputs, outputs, boundaries, and target snapshots
after insert. Only resolution fields (`status`, `acceptedNutritionTargetId`, and `resolvedAt`) may
change. Pending-fingerprint and one-pending-per-program partial unique indexes are installed for the
lifecycle. Stores build inputs and resolve check-ins in explicit SQLite immediate transactions;
stale acceptance rereads mutable rows using the persisted preview boundaries and never writes a target.

A delete trigger blocks every individual check-in deletion. Account deletion creates a user-scoped
authorization row inside the same SQLite write transaction, then explicitly deletes that user's targets,
goal-completion relations, check-ins, goal revisions, goals, program, and user in dependency order. The
authorization row cascades away with the user;
rollback restores the whole sequence, and foreign keys remain enabled globally.

Check-ins may link `goalId` and `goalRevisionId` as an all-or-nothing pair. New V2 calculation snapshots
carry the same authoritative goal/revision identity; historical V1 snapshots remain valid and unchanged.
The `goal_change` kind is a normal immutable recommendation and never writes a nutrition target before
explicit acceptance.

#### `adaptive_nutrition_goals`

First-class goal lifecycle rows own progress origins and preserve prior directions.

- `id`: `text` primary key UUID
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`
- `programId`: `text`, required, same-owner FK -> `adaptive_nutrition_programs`
- `type`: `lose | maintain | gain`
- target/maintenance strategy columns plus canonical `startTrendWeightKg` and nullable
  `startScaleWeightKg`
- nullable `finalTrendWeightKg`, which is null while active and stores the actual canonical trend used
  when the goal is completed, replaced, or cancelled
- `startedLocalDate`, nullable `endedLocalDate`, and `active | completed | replaced | cancelled` status
- `createdAt` / `updatedAt`: integer Unix ms

There is at most one active goal per user. Lifecycle checks keep loss/gain targets directional from the
canonical start trend and require maintenance center/rate semantics. Goal history is append-only in normal
operation; guarded account deletion is the only destructive path.

#### `adaptive_nutrition_goal_revisions`

Every created or edited strategy has an immutable revision linked to one goal and owner.

- monotonic positive `sequence`, unique per goal
- target/center/rate fields for the effective strategy
- previous strategy fields for replayable change display
- `reason`: `created | user_edit | migration | goal_completion`
- `effectiveLocalDate` and `createdAt`

Database triggers reject revision update/delete and direct goal-strategy updates. Inserting exactly one
matching next revision is the database-authoritative operation: its trigger validates sequence and previous
strategy, then atomically applies target/center/rate to the active goal. Same-direction edits keep the goal's
start trend/date fixed. Direction changes persist the actual final canonical trend on the old goal and use it
as the new progress origin.

#### `adaptive_nutrition_goal_completions`

One immutable relation records each explicit completion transition:

- `checkInId`: primary key and same-owner FK to the accepted goal-reached check-in
- `userId`: direct owner
- `completedGoalId`: unique same-owner FK to the completed loss/gain goal
- `maintenanceGoalId`: unique same-owner FK to the new active maintenance goal
- `createdAt`: integer Unix ms

An insert trigger verifies that the accepted check-in belongs to the completed goal, both goals share the
same user/program, and the destination is the active maintenance goal. Update/delete are blocked except for
the existing guarded account-deletion transaction. The relation makes retries and historical ownership
auditable without inferring the transition from timestamps.

#### `dashboard_config`

- `id`: `text` primary key UUID
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`
- `habitChainIds`: JSON text array of habit ids shown in dashboard chains
- `trendMetrics`: JSON text array of metric keys shown in dashboard trends
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Constraints:

- unique on `userId`

### Health Conditions

#### `health_conditions`

- `id`: `text` primary key UUID
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`, indexed
- `name`: `text`, required
- `bodyArea`: `text`, required
- `status`: `text`, required, one of `active | monitoring | resolved`
- `onsetDate`: `text`, required, `YYYY-MM-DD`
- `description`: nullable `text`
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Constraints:

- `health_conditions_status_check`
- `health_conditions_onset_date_format_check`

#### `condition_timeline_events`

- `id`: `text` primary key UUID
- `conditionId`: `text`, required, FK -> `health_conditions.id`, `ON DELETE CASCADE`
- `date`: `text`, required, `YYYY-MM-DD`
- `event`: `text`, required
- `type`: `text`, required, one of `onset | flare | improvement | treatment | milestone`
- `notes`: nullable `text`
- `createdAt`: `integer` Unix ms, required, default now

Indexes and constraints:

- `condition_timeline_events_condition_date_idx`
- `condition_timeline_events_date_format_check`
- `condition_timeline_events_type_check`

#### `condition_protocols`

- `id`: `text` primary key UUID
- `conditionId`: `text`, required, FK -> `health_conditions.id`, `ON DELETE CASCADE`, indexed
- `name`: `text`, required
- `status`: `text`, required, one of `active | discontinued | completed`
- `startDate`: `text`, required, `YYYY-MM-DD`
- `endDate`: nullable `text`, `YYYY-MM-DD`
- `notes`: nullable `text`
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Constraints:

- `condition_protocols_status_check`
- `condition_protocols_start_date_format_check`
- `condition_protocols_end_date_format_check`
- `condition_protocols_end_date_order_check`

#### `condition_severity_points`

- `id`: `text` primary key UUID
- `conditionId`: `text`, required, FK -> `health_conditions.id`, `ON DELETE CASCADE`
- `date`: `text`, required, `YYYY-MM-DD`
- `value`: `integer`, required, range `1..10`
- `createdAt`: `integer` Unix ms, required, default now

Indexes and constraints:

- `condition_severity_points_condition_date_idx`
- `condition_severity_points_date_format_check`
- `condition_severity_points_value_check`

### Journaling And Activities

#### `journal_entries`

- `id`: `text` primary key UUID
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`
- `date`: `text`, required, `YYYY-MM-DD`
- `title`: `text`, required
- `type`: `text`, required, one of `post-workout | milestone | observation | weekly-summary | injury-update`
- `content`: `text`, required
- `createdBy`: `text`, required, one of `agent | user`
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Indexes and constraints:

- `journal_entries_user_date_idx`
- `journal_entries_date_format_check`
- `journal_entries_type_check`
- `journal_entries_created_by_check`

#### `activities`

- `id`: `text` primary key UUID
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`
- `date`: `text`, required, `YYYY-MM-DD`
- `type`: `text`, required, one of `walking | running | stretching | yoga | cycling | swimming | hiking | other`
- `name`: `text`, required
- `durationMinutes`: `integer`, required, must be `> 0`
- `notes`: nullable `text`
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Indexes and constraints:

- `activities_user_date_idx`
- `activities_date_format_check`
- `activities_type_check`
- `activities_duration_minutes_check`

### Resources And Equipment

#### `resources`

- `id`: `text` primary key UUID
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`, indexed
- `title`: `text`, required
- `type`: `text`, required, one of `program | book | creator`
- `author`: `text`, required
- `description`: nullable `text`
- `tags`: JSON text array of discovery labels
- `principles`: JSON text array of takeaways or heuristics
- `createdAt`: `integer` Unix ms, required, default now

Constraints:

- `resources_type_check`

#### `equipment_locations`

- `id`: `text` primary key UUID
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`, indexed
- `name`: `text`, required
- `notes`: nullable `text`
- `createdAt`: `integer` Unix ms, required, default now

#### `equipment_items`

- `id`: `text` primary key UUID
- `locationId`: `text`, required, FK -> `equipment_locations.id`, `ON DELETE CASCADE`, indexed
- `name`: `text`, required
- `category`: `text`, required, one of `free-weights | machines | cables | cardio | accessories`
- `details`: nullable `text`
- `createdAt`: `integer` Unix ms, required, default now

Constraints:

- `equipment_items_category_check`

### Cross-Entity Links

#### `entity_links`

- `id`: `text` primary key UUID
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`
- `sourceType`: `text`, required, one of `journal | activity | resource`
- `sourceId`: `text`, required
- `targetType`: `text`, required, one of `workout | activity | habit | injury | exercise | protocol`
- `targetId`: `text`, required
- `targetName`: `text`, required, denormalized display name for list UIs and chips
- `createdAt`: `integer` Unix ms, required, default now

Indexes and constraints:

- `entity_links_user_source_type_source_id_idx`
- `entity_links_user_target_type_target_id_idx`
- `entity_links_source_type_check`
- `entity_links_target_type_check`

This is the polymorphic bridge for cross-entity references such as journal -> workout, resource -> exercise, and activity -> journal-context links. It intentionally avoids many sparse nullable FK columns.

## Relationship Patterns

- `users` has many `agent_tokens`, `habits`, `habit_entries`, `workout_templates`, `workout_sessions`, `foods`, `nutrition_logs`, `body_weight`, `nutrition_targets`, `nutrition_target_events`, `adaptive_nutrition_checkins`, `adaptive_nutrition_goals`, `adaptive_nutrition_goal_revisions`, `adaptive_nutrition_goal_completions`, `scheduled_workouts`, `health_conditions`, `journal_entries`, `activities`, `resources`, `equipment_locations`, and `entity_links`; it has one `adaptive_nutrition_programs` row in v1.
- `users` has one `dashboard_config`.
- `habits` has many `habit_entries`.
- `workout_templates` has many `template_exercises`.
- `workout_sessions` optionally references a `workout_template` and has many `session_sets`.
- `session_sets` references both `workout_sessions` and `exercises`.
- `scheduled_workouts` may point to both a `workout_template` and a realized `workout_session`.
- `nutrition_logs` has many `meals`; `meals` has many `meal_items`; `meal_items` may reference `foods`.
- `adaptive_nutrition_programs` has many immutable `adaptive_nutrition_checkins` and many
  `adaptive_nutrition_goals`; each goal has many immutable `adaptive_nutrition_goal_revisions`.
- `adaptive_nutrition_checkins` may link one goal/revision pair; an adaptive `nutrition_targets` row restricts
  deletion of its source check-in. `nutrition_target_events` immutably records every accepted
  Adaptive target and manual target write with same-user target/check-in ownership.
- `adaptive_nutrition_goal_completions` immutably relates one accepted completion check-in, one completed
  loss/gain goal, and one successor maintenance goal under the same user and program.
- `health_conditions` has many `condition_timeline_events`, `condition_protocols`, and `condition_severity_points`.
- `equipment_locations` has many `equipment_items`.
- `entity_links` is polymorphic and enforced in application code rather than SQLite foreign keys.

## JSON Field Patterns

Current JSON-backed columns and the shapes they should carry:

- `preferences`: user-level settings object, for example theme selection, dashboard toggles, or agent preferences.
- `muscleGroups`: `string[]` of anatomical group keys on `exercises`.
- `tags`: `string[]` for `workout_templates` and `resources`.
- `feedback`: object like `{ energy, recovery, technique, notes? }` on `workout_sessions`.
- `habitChainIds`: `string[]` of habit ids pinned to dashboard streak widgets.
- `trendMetrics`: `string[]` of dashboard metric ids such as weight, calories, protein, workout consistency, or condition severity.
- `principles`: `string[]` of summarized lessons on `resources`.

Planned or domain-level JSON field families should follow the same rule:

- `formCues`: `string[]` of short technique reminders; current schema uses `template_exercises.cues` for this role.
- `badges`: `string[]` of display labels like `push`, `pull`, `legs`, `unilateral`, or `rehab`.
- `reversePyramid`: structured object describing descending load sets, for example `{ enabled: true, dropPercent: 10 }`.
- `injuryCues`: `string[]` of modifications or pain-avoidance reminders tied to a movement or protocol.
- `customFeedback`: structured object for feature-specific post-session or post-plan answers that do not justify first-class columns yet.
- `supplemental`: deprecated as a JSON field — supplemental exercises are now first-class `template_exercises` and `session_sets` rows with `section = 'supplemental'`.

Rule of thumb:

- Use `text('col', { mode: 'json' }).$type<T>()` when callers should work with real objects and arrays.
- Use a plain `text` column plus explicit helpers only when backward compatibility or custom validation requires a manual boundary.

## Normalization Decision Framework

Normalize into a dedicated table when any of these are true. The headline rule is simple: normalize if you need to query, filter, sort, or paginate by fields inside the structure.

- You need to query by fields inside the structure.
- You need to filter or sort on nested fields.
- You need pagination over child records.
- The child rows have their own lifecycle, timestamps, or permissions.
- Multiple features will link to the child data independently.

Keep data as a JSON blob when all of these are true:

- The value is always read and written as a whole with the parent record.
- No route needs to filter or paginate by the nested keys.
- The shape is tightly coupled to one parent record.
- The structure is mostly presentation or configuration metadata.

Examples:

- Normalize: `condition_timeline_events`, `condition_protocols`, `condition_severity_points`, `template_exercises`, `meal_items`, `entity_links`.
- Keep JSON: `preferences`, `feedback`, `habitChainIds`, `trendMetrics`, `tags`, `principles`, short cue arrays.
