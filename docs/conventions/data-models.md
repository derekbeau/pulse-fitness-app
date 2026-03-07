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
- Soft delete: use an `active` flag instead of deleting when historical visibility matters. `habits.active` is the current example.
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
- `session_sets` through `workout_sessions`
- `meals` through `nutrition_logs`
- `meal_items` through `meals`
- `condition_timeline_events` through `health_conditions`
- `condition_protocols` through `health_conditions`
- `condition_severity_points` through `health_conditions`
- `equipment_items` through `equipment_locations`

`entity_links` stores `userId` for direct isolation and cleanup queries. Every read and write must still scope through the owning source entity so links cannot cross household-user boundaries.

## Table Inventory

### Auth And Identity

#### `users`

- `id`: `text` primary key UUID
- `username`: `text`, required, unique
- `name`: nullable `text`
- `passwordHash`: `text`, required
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
- `sortOrder`: `integer`, required, default `0`
- `active`: boolean-backed `integer`, required, default `true`
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
- `category`: `text`, required, one of `compound | isolation | cardio | mobility`
- `instructions`: nullable `text`
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Constraints:

- `exercises_category_check`

#### `workout_templates`

- `id`: `text` primary key UUID
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`, indexed
- `name`: `text`, required
- `description`: nullable `text`
- `tags`: JSON text array for template labels
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
- `name`: `text`, required
- `date`: `text`, required, `YYYY-MM-DD`, indexed
- `status`: `text`, required, default `in-progress`, one of `scheduled | in-progress | completed`
- `startedAt`: `integer` Unix ms, required
- `completedAt`: nullable `integer` Unix ms
- `duration`: nullable `integer` minutes
- `feedback`: nullable JSON text object for post-session ratings and notes
- `notes`: nullable `text`
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Constraints:

- `workout_sessions_date_format_check`
- `workout_sessions_status_check`
- `workout_sessions_completed_at_check`

#### `session_sets`

- `id`: `text` primary key UUID
- `sessionId`: `text`, required, FK -> `workout_sessions.id`, `ON DELETE CASCADE`, indexed
- `exerciseId`: `text`, required, FK -> `exercises.id`, `ON DELETE RESTRICT`
- `setNumber`: `integer`, required
- `weight`: nullable `real`
- `reps`: nullable `integer`
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
- `date`: `text`, required, `YYYY-MM-DD`
- `sessionId`: nullable `text`, FK -> `workout_sessions.id`, `ON DELETE SET NULL`, indexed
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Indexes and constraints:

- `scheduled_workouts_user_date_idx`
- `scheduled_workouts_template_id_idx`
- `scheduled_workouts_session_id_idx`
- `scheduled_workouts_date_format_check`

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
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Constraints:

- unique on `(userId, date)`
- `nutrition_logs_date_format_check`

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
- `weight`: `real`, required
- `notes`: nullable `text`
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Constraints:

- unique on `(userId, date)`
- `body_weight_date_format_check`
- `body_weight_weight_check`

#### `nutrition_targets`

- `id`: `text` primary key UUID
- `userId`: `text`, required, FK -> `users.id`, `ON DELETE CASCADE`
- `calories`: `real`, required
- `protein`: `real`, required
- `carbs`: `real`, required
- `fat`: `real`, required
- `effectiveDate`: `text`, required, `YYYY-MM-DD`
- `createdAt`: `integer` Unix ms, required, default now
- `updatedAt`: `integer` Unix ms, required, default now, auto-updates

Constraints:

- unique on `(userId, effectiveDate)`
- `nutrition_targets_effective_date_format_check`
- `nutrition_targets_macros_nonnegative_check`

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

- `users` has many `agent_tokens`, `habits`, `habit_entries`, `workout_templates`, `workout_sessions`, `foods`, `nutrition_logs`, `body_weight`, `nutrition_targets`, `scheduled_workouts`, `health_conditions`, `journal_entries`, `activities`, `resources`, `equipment_locations`, and `entity_links`.
- `users` has one `dashboard_config`.
- `habits` has many `habit_entries`.
- `workout_templates` has many `template_exercises`.
- `workout_sessions` optionally references a `workout_template` and has many `session_sets`.
- `session_sets` references both `workout_sessions` and `exercises`.
- `scheduled_workouts` may point to both a `workout_template` and a realized `workout_session`.
- `nutrition_logs` has many `meals`; `meals` has many `meal_items`; `meal_items` may reference `foods`.
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
- `supplemental`: structured object or array for secondary accessory work that is always edited with its parent record.

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
